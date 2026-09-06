import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { canStartSimpleUpload, resolveUploadResumePoint } from '../../src/app/stacking/TmbManagerPanel';
import { readableStreamToBuffer } from '../../src/lib/tmb-storage';

/** TMB Self-Service Ingestion — upload-loop regression audit (production bug:
 * upload 1 file PDF ~206.6MB tiến độ chạm 100% rồi tụt về 0% và upload lại,
 * lặp lại nhiều lần). ROOT CAUSE đã xác nhận qua source thật của @vercel/blob
 * (dist/chunk-YYMLUMXS.js requestApi()):
 *   - code cũ dùng `access: 'public'` trong khi Blob store production cấu
 *     hình Private -> Blob API từ chối request; SDK không map lỗi vào 1 code
 *     cụ thể nào trong getBlobError() nên rơi vào nhánh "unknown_error" ->
 *     coi là RETRYABLE -> `async-retry` (mặc định 10 lần) gửi lại TOÀN BỘ
 *     request kể cả body -> mỗi lần gửi lại là 1 request PUT hoàn toàn mới
 *     nên onUploadProgress tụt về 0% rồi leo lại.
 *   - KHÔNG có khoá chống re-entrancy: bấm lại nút sau khi 1 bước SAU-upload
 *     lỗi (analyze/optimize/index) sẽ chạy lại handleSimpleUpload() TỪ ĐẦU,
 *     upload lại NGUYÊN file + tạo THÊM 1 profile trùng.
 * Fix: access: 'private' (khớp store thật) + uploadInFlightRef (chặn
 * re-entrancy) + resumeProfileId (retry sau lỗi hậu-upload SKIP hẳn
 * upload+create, chỉ chạy lại analyze->optimize->index — đã idempotent sẵn).
 *
 * KHÔNG dùng file PDF 206.6MB thật để test — toàn bộ test dưới đây thao tác
 * trên logic thuần (đã tách khỏi handleSimpleUpload()/VercelBlobAssetStorage
 * để test được mà không cần React/DOM/token/mạng thật) hoặc audit cấu trúc
 * source bằng regex (cùng convention đã dùng ở tmb-map-ui.test.ts).
 */

const panelSource = fs.readFileSync('src/app/stacking/TmbManagerPanel.tsx', 'utf8');
const storageSource = fs.readFileSync('src/lib/tmb-storage.ts', 'utf8');

// ─── A. Một click không thể khởi động 2 upload đồng thời ───────────────────

test('canStartSimpleUpload: inFlight=true -> false BẤT KỂ label/file/storageConfigured hợp lệ hay không (chặn double-click/re-entry)', () => {
  const fakeFile = {} as File;
  assert.equal(canStartSimpleUpload({ inFlight: true, label: 'TMB test', file: fakeFile, storageConfigured: true }), false);
  assert.equal(canStartSimpleUpload({ inFlight: true, label: '', file: null, storageConfigured: null }), false);
});

test('canStartSimpleUpload: inFlight=false + label/file hợp lệ + storage đã cấu hình -> true (cho phép bắt đầu ĐÚNG 1 lần)', () => {
  const fakeFile = {} as File;
  assert.equal(canStartSimpleUpload({ inFlight: false, label: 'HLX · TĐNĐ1', file: fakeFile, storageConfigured: true }), true);
});

test('canStartSimpleUpload: thiếu label/file, hoặc storageConfigured=false -> false (giữ nguyên validation cũ, không bị fix re-entrancy làm lỏng)', () => {
  const fakeFile = {} as File;
  assert.equal(canStartSimpleUpload({ inFlight: false, label: '', file: fakeFile, storageConfigured: true }), false);
  assert.equal(canStartSimpleUpload({ inFlight: false, label: '  ', file: fakeFile, storageConfigured: true }), false);
  assert.equal(canStartSimpleUpload({ inFlight: false, label: 'X', file: null, storageConfigured: true }), false);
  assert.equal(canStartSimpleUpload({ inFlight: false, label: 'X', file: fakeFile, storageConfigured: false }), false);
});

test('canStartSimpleUpload: storageConfigured=null (chưa xác định, đang chờ /api/stacking/info) -> vẫn true, KHÔNG chặn nhầm trong lúc chưa tải xong trạng thái', () => {
  const fakeFile = {} as File;
  assert.equal(canStartSimpleUpload({ inFlight: false, label: 'X', file: fakeFile, storageConfigured: null }), true);
});

test('handleSimpleUpload gọi canStartSimpleUpload() với uploadInFlightRef.current làm nguồn sự thật duy nhất cho "inFlight" — KHÔNG dùng uploadStage (state, cập nhật trễ theo render) để quyết định chặn', () => {
  assert.match(panelSource, /canStartSimpleUpload\(\{\s*inFlight:\s*uploadInFlightRef\.current/);
  assert.match(panelSource, /const uploadInFlightRef = useRef\(false\)/);
});

// ─── B. Re-render không làm upload chạy lại ─────────────────────────────────

test('handleSimpleUpload KHÔNG được gọi bên trong bất kỳ useEffect nào — chỉ event handler (onClick) mới được kích hoạt upload, re-render KHÔNG tự re-run', () => {
  const effectBlocks = panelSource.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[[^\]]*\]\);/g) ?? [];
  assert.ok(effectBlocks.length > 0, 'phải tìm thấy ít nhất 1 useEffect trong file (info/load) để test này có ý nghĩa');
  for (const block of effectBlocks) {
    assert.ok(!block.includes('handleSimpleUpload'), `useEffect không được gọi handleSimpleUpload: ${block.slice(0, 80)}...`);
  }
});

test('Nút "Tải lên & xử lý" KHÔNG nằm trong bất kỳ thẻ <form> nào — loại trừ khả năng form onSubmit + button onClick cùng fire (double-submit qua cơ chế form gốc trình duyệt)', () => {
  assert.ok(!panelSource.includes('<form'), 'component này không được dùng thẻ <form> — toàn bộ action đều qua onClick tường minh');
  assert.match(panelSource, /onClick=\{handleSimpleUpload\}/);
});

// ─── C. Lỗi SAU upload không tự động upload lại file ────────────────────────

test('resolveUploadResumePoint: có resumeProfileId (đã tạo profile, lỗi ở bước sau) -> "resume_processing", KHÔNG "start_fresh"', () => {
  assert.equal(resolveUploadResumePoint('cmx-existing-profile-id'), 'resume_processing');
});

test('resolveUploadResumePoint: chưa có resumeProfileId (lượt đầu, hoặc đã reset sau khi đổi file/hoàn tất) -> "start_fresh"', () => {
  assert.equal(resolveUploadResumePoint(null), 'start_fresh');
});

test('handleSimpleUpload: nhánh upload+tạo profile CHỈ chạy khi resolveUploadResumePoint() === "start_fresh" — có resumeProfileId thì SKIP HẲN, không gọi lại upload()/POST tạo profile', () => {
  assert.match(panelSource, /if \(resolveUploadResumePoint\(resumeProfileId\) === 'start_fresh'\) \{/);
  // Đúng 1 lời gọi upload() và đúng 1 lời gọi POST tạo profile trong toàn bộ
  // handleSimpleUpload — không có đường nào gọi lại upload() lần 2 trong cùng
  // 1 lần thực thi hàm (kể cả nhánh lỗi/catch).
  const fnMatch = panelSource.match(/async function handleSimpleUpload\(\) \{[\s\S]*?\n {2}\}\n/);
  assert.ok(fnMatch, 'phải tìm thấy thân hàm handleSimpleUpload');
  const fnBody = fnMatch![0];
  const uploadCalls = fnBody.match(/await upload\(/g) ?? [];
  assert.equal(uploadCalls.length, 1, 'handleSimpleUpload chỉ được gọi upload() ĐÚNG 1 LẦN trong toàn bộ thân hàm');
  const createProfileCalls = fnBody.match(/fetch\('\/api\/stacking\/tmb-profiles', \{/g) ?? [];
  assert.equal(createProfileCalls.length, 1, 'handleSimpleUpload chỉ được POST tạo profile ĐÚNG 1 LẦN');
});

test('resumeProfileId được set NGAY sau khi tạo profile thành công (trước khi chạy analyze) — nếu analyze/optimize/index lỗi, lần bấm lại vẫn resume đúng, không rơi lại về "start_fresh"', () => {
  assert.match(panelSource, /setResumeProfileId\(id\);.*\n.*await load\(\);\s*\n\s*\}\s*\n\s*setUploadStage\('analyzing'\)/);
});

test('resumeProfileId reset về null khi: chọn file mới, pipeline hoàn tất, hoặc đóng form — KHÔNG reset khi lỗi (giữ nguyên để retry resume đúng)', () => {
  const catchBlock = panelSource.match(/\} catch \(e\) \{[\s\S]*?\} finally \{/)?.[0] ?? '';
  assert.ok(!catchBlock.includes('setResumeProfileId(null)'), 'nhánh catch (lỗi) KHÔNG được xoá resumeProfileId — phải giữ để retry resume');
  const onFileChangeBlock = panelSource.match(/onChange=\{e => \{\s*\/\/ Chọn file MỚI[\s\S]*?\}\}/)?.[0] ?? '';
  assert.ok(onFileChangeBlock.includes('setResumeProfileId(null)'), 'chọn file MỚI phải reset resumeProfileId');
  assert.match(panelSource, /setUploadStage\('done'\);\s*\n\s*setExpandedId\(id\);\s*\n\s*setResumeProfileId\(null\)/, 'pipeline hoàn tất phải reset resumeProfileId');
});

// ─── D. Upload thành công tiến tới create/analyze/optimize/index ───────────

test('handleSimpleUpload: sau khi upload xong, gọi tuần tự ĐÚNG THỨ TỰ create -> analyze -> optimize -> index, mỗi bước throw nếu !success (dừng đúng bước lỗi, không âm thầm bỏ qua)', () => {
  const fnMatch = panelSource.match(/async function handleSimpleUpload\(\) \{[\s\S]*?\n {2}\}\n/);
  const fnBody = fnMatch![0];
  const order = ["/api/stacking/tmb-profiles'", '/analyze`', '/optimize`', '/index`'];
  let lastIndex = -1;
  for (const marker of order) {
    const idx = fnBody.indexOf(marker);
    assert.ok(idx > lastIndex, `bước "${marker}" phải xuất hiện SAU bước trước đó theo đúng thứ tự pipeline`);
    lastIndex = idx;
  }
  // Mỗi bước sau upload đều throw khi !success — KHÔNG có bước nào bị bỏ qua âm thầm.
  assert.match(fnBody, /if \(!created\.success\) throw new Error/);
  assert.match(fnBody, /if \(!analyzeRes\.success\) throw new Error/);
  assert.match(fnBody, /if \(!optimizeRes\.success\) throw new Error/);
  assert.match(fnBody, /if \(!indexRes\.success\) throw new Error/);
});

test('upload() client dùng access: "private" — KHÔNG BAO GIỜ "public" (root cause bug upload-loop: store production cấu hình Private)', () => {
  // Chỉ audit THÂN HÀM (code thật thực thi) — JSDoc phía trên handleSimpleUpload
  // CỐ Ý nhắc lại chuỗi "access: 'public'" để mô tả bug lịch sử đã fix, không
  // phải code, nên loại trừ khỏi kiểm tra "không còn public" ở đây.
  const fnMatch = panelSource.match(/async function handleSimpleUpload\(\) \{[\s\S]*?\n {2}\}\n/);
  assert.ok(fnMatch, 'phải tìm thấy thân hàm handleSimpleUpload');
  const fnBody = fnMatch![0];
  assert.match(fnBody, /access: 'private',\s*\n\s*handleUploadUrl: '\/api\/stacking\/tmb-profiles\/upload-url'/);
  assert.ok(!fnBody.includes("access: 'public'"), 'thân hàm handleSimpleUpload không được còn access: \'public\' (bug đã audit + fix)');
});

// ─── E. Private Blob đọc được qua storage abstraction dùng bởi processing ──

test('readableStreamToBuffer: chuyển ReadableStream thành Buffer nguyên vẹn (mô phỏng CHÍNH XÁC shape stream mà get() có xác thực của @vercel/blob trả về) — không cần token/mạng thật', async () => {
  const payload = Buffer.from('%PDF-1.4 fake private blob content for test');
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(payload));
      controller.close();
    },
  });
  const result = await readableStreamToBuffer(stream);
  assert.ok(result.equals(payload));
});

test('readableStreamToBuffer: stream nhiều chunk (mô phỏng file lớn tải theo phần) vẫn ghép lại ĐÚNG THỨ TỰ, không mất/xáo trộn byte', async () => {
  const chunks = [Buffer.from('AAA'), Buffer.from('BBB'), Buffer.from('CCC')];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(new Uint8Array(c));
      controller.close();
    },
  });
  const result = await readableStreamToBuffer(stream);
  assert.equal(result.toString('utf8'), 'AAABBBCCC');
});

test('VercelBlobAssetStorage.get(): dùng get() có xác thực từ \'@vercel/blob\' với access: "private" — KHÔNG BAO GIỜ fetch(ref) ẩn danh (bug đã audit: store Private từ chối request không có Authorization)', () => {
  assert.match(storageSource, /const \{ get \} = await import\('@vercel\/blob'\);\s*\n\s*const result = await get\(ref, \{ access: 'private' \}\);/);
  assert.ok(!storageSource.includes('await fetch(ref)'), 'get() không được dùng fetch(ref) ẩn danh nữa (bug đã audit + fix, xem readableStreamToBuffer)');
});

test('VercelBlobAssetStorage.put(): dùng access: "private" — KHÔNG BAO GIỜ "public" (khớp cấu hình store production thật)', () => {
  assert.match(storageSource, /access: 'private',\s*\n\s*addRandomSuffix: true/);
  assert.ok(!storageSource.includes("access: 'public'"), 'tmb-storage.ts không được còn access: \'public\' ở bất kỳ đâu');
});
