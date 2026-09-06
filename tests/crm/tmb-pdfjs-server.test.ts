import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import { pdfjsLib } from '../../src/lib/tmb-pdfjs-server';
import { analyzePdf } from '../../src/lib/tmb-optimizer';
import { extractPdfUnitLabels } from '../../src/lib/tmb-indexer';

/** Regression cho bug production Vercel thật đã audit: "Setting up fake
 * worker failed: Cannot find module '/var/task/node_modules/pdfjs-dist/
 * legacy/build/pdf.worker.mjs'". ROOT CAUSE (đọc thẳng nguồn thật
 * node_modules/pdfjs-dist/legacy/build/pdf.mjs): KHÔNG có `workerSrc` nào
 * được set trước getDocument() -> pdf.js rơi vào default RELATIVE
 * `"./pdf.worker.mjs"`, resolve theo vị trí pdf.mjs trong node_modules —
 * local dev có nguyên node_modules trên đĩa nên luôn thành công, KHÔNG lộ
 * bug; trên Vercel, Output File Tracing (@vercel/nft) KHÔNG statically lần ra
 * được sibling file đó (chỉ dùng bên trong `_setupFakeWorker()`, 1 giá trị
 * runtime-computed, không static analyzer nào trace được) nên file bị thiếu
 * khỏi bundle deploy dù bản thân pdf.mjs load được.
 *
 * Fix 2 phần (cả 2 BẮT BUỘC, xem tmb-pdfjs-server.ts comment đầy đủ):
 * 1. `tmb-pdfjs-server.ts` set `GlobalWorkerOptions.workerSrc` TƯỜNG MINH
 *    bằng `pathToFileURL(path.join(process.cwd(), 'node_modules/pdfjs-dist/
 *    legacy/build/pdf.worker.mjs')).href` — KHÔNG dùng require.resolve() trỏ
 *    thẳng .mjs (đã verify 2 lần build thất bại thật: lỗi "ESM packages need
 *    to be imported", rồi lỗi "path argument must be of type string, received
 *    number" — webpack can thiệp require.resolve() theo cách không tương
 *    thích với target .mjs trong package externalized). KHÔNG dùng path
 *    Windows thô cho import() — đã verify lỗi thật "Received protocol 'd:'"
 *    trên Windows local, pathToFileURL() giải quyết đúng cho CẢ Windows lẫn
 *    POSIX (Vercel).
 * 2. `next.config.ts` `outputFileTracingIncludes` cho glob
 *    '/api/stacking/tmb-profiles/**' — CƠ CHẾ THẬT SỰ đảm bảo file có mặt
 *    trong bundle deploy (đã verify bằng cách build thật + đọc trực tiếp
 *    .next/server/app/api/stacking/tmb-profiles/[id]/analyze/route.js.nft.json
 *    sau build, xem "9. Built-server/bundle verification" trong Final Report).
 */

const optimizerSource = fs.readFileSync('src/lib/tmb-optimizer.ts', 'utf8');
const indexerSource = fs.readFileSync('src/lib/tmb-indexer.ts', 'utf8');
const pdfjsServerSource = fs.readFileSync('src/lib/tmb-pdfjs-server.ts', 'utf8');
const nextConfigSource = fs.readFileSync('next.config.ts', 'utf8');
const tmbMapSource = fs.readFileSync('src/app/stacking/TmbMap.tsx', 'utf8');

async function buildSmallTestPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('BM12-05', { x: 50, y: 50, size: 12, font });
  page.setRotation(degrees(90)); // buộc rotation != 0 để test rotation extraction thật, không phải mặc định trùng hợp
  return Buffer.from(await doc.save());
}

// ─── A + B. Server-side PDF analysis khởi tạo được, trích đủ metadata TMB cần ─

test('tmb-pdfjs-server: GlobalWorkerOptions.workerSrc đã được set TƯỜNG MINH (không phải giá trị mặc định "./pdf.worker.mjs" của pdf.js) — đây CHÍNH LÀ điều kiện tránh rơi vào nhánh gây lỗi production', () => {
  const workerSrc = pdfjsLib.GlobalWorkerOptions.workerSrc;
  assert.ok(workerSrc, 'workerSrc phải có giá trị (không undefined/rỗng)');
  assert.notEqual(workerSrc, './pdf.worker.mjs', 'không được là default relative path của pdf.js — đó chính xác là nguyên nhân bug production');
  assert.match(workerSrc, /^file:\/\//, 'phải là file:// URL hợp lệ cho dynamic import() — path OS thô (VD "D:\\...") gây lỗi thật trên Windows');
});

test('tmb-pdfjs-server: file mà workerSrc trỏ tới THẬT SỰ tồn tại trên đĩa (đúng chính xác pdf.worker.mjs của package đang cài, không phải path đoán/sai)', () => {
  const workerSrc = pdfjsLib.GlobalWorkerOptions.workerSrc;
  const filePath = new URL(workerSrc).pathname
    // Windows: URL pathname có dạng "/D:/Work/..." — bỏ dấu "/" đầu để ra path OS hợp lệ.
    .replace(/^\/([A-Za-z]:)/, '$1');
  assert.ok(fs.existsSync(filePath), `file phải tồn tại thật tại: ${filePath}`);
  assert.ok(filePath.replace(/\\/g, '/').endsWith('pdfjs-dist/legacy/build/pdf.worker.mjs'));
});

test('analyzePdf(): PDF nhỏ, không cần rasterize gì — chạy trọn vẹn KHÔNG throw "Setting up fake worker failed"/"Cannot find module" (regression trực tiếp cho bug production)', async () => {
  const buffer = await buildSmallTestPdf();
  const analysis = await analyzePdf(buffer);
  assert.ok(analysis, 'analyzePdf phải resolve thành công, không throw lỗi worker');
});

test('analyzePdf(): trích ĐÚNG page count/dimensions/rotation/text layer — dữ liệu TMB Manager cần cho Section "Analyze"', async () => {
  const buffer = await buildSmallTestPdf();
  const analysis = await analyzePdf(buffer);
  assert.equal(analysis.pageCount, 1);
  // page rotated 90° -> pdf.js viewport (scale=1) trả kích thước ĐÃ HOÁN ĐỔI
  // theo hướng xoay thật (300x400, không phải 400x300 mediabox gốc) — đúng
  // hành vi pdf.js chuẩn, xác nhận rotation THẬT SỰ được áp dụng khi trích,
  // không phải giá trị mediabox thô bị bỏ qua rotation.
  assert.equal(analysis.page.width, 300);
  assert.equal(analysis.page.height, 400);
  assert.equal(analysis.page.rotation, 90, 'phải trích đúng rotation thật (không phải trùng hợp mặc định 0)');
  assert.equal(analysis.hasTextLayer, true);
  assert.ok(analysis.textItemCount > 0);
});

test('analyzePdf(): trích được image/resource metadata (mảng images, kể cả rỗng) KHÔNG throw — dùng cho quality gate image_colorspace_valid', async () => {
  const buffer = await buildSmallTestPdf();
  const analysis = await analyzePdf(buffer);
  assert.ok(Array.isArray(analysis.images));
  assert.equal(analysis.images.length, 0, 'PDF test không có ảnh nào — phải ra mảng rỗng, không throw vì "thiếu ảnh"');
});

test('extractPdfUnitLabels(): chạy trọn vẹn trên PDF nhỏ, KHÔNG throw lỗi worker (đúng function tmb-indexer.ts index/route.ts gọi — route Index cũng đi qua CHÍNH pdfjsLib đã audit)', async () => {
  const buffer = await buildSmallTestPdf();
  const labels = await extractPdfUnitLabels(buffer);
  assert.ok(Array.isArray(labels));
  assert.ok(labels.some(l => l.code === 'BM12-05'), 'vẫn trích đúng mã căn từ text layer như trước khi fix (semantics không đổi)');
});

// ─── Import wiring — chặn regression quay lại import trực tiếp chưa cấu hình ─

test('tmb-optimizer.ts KHÔNG được import trực tiếp "pdfjs-dist/legacy/build/pdf.mjs" nữa — PHẢI qua tmb-pdfjs-server.ts (đã cấu hình workerSrc)', () => {
  assert.ok(!optimizerSource.includes("from 'pdfjs-dist/legacy/build/pdf.mjs'"), 'không được import thẳng pdfjs-dist nữa — mất cấu hình workerSrc, tái phát bug production');
  assert.match(optimizerSource, /import \{ pdfjsLib \} from '\.\/tmb-pdfjs-server'/);
});

test('tmb-indexer.ts KHÔNG được import trực tiếp "pdfjs-dist/legacy/build/pdf.mjs" nữa — PHẢI qua tmb-pdfjs-server.ts', () => {
  assert.ok(!indexerSource.includes("from 'pdfjs-dist/legacy/build/pdf.mjs'"), 'không được import thẳng pdfjs-dist nữa');
  assert.match(indexerSource, /import \{ pdfjsLib \} from '\.\/tmb-pdfjs-server'/);
});

test('tmb-pdfjs-server.ts: cơ chế set workerSrc dùng process.cwd() + pathToFileURL — KHÔNG hard-code "/var/task", KHÔNG dùng require.resolve() trỏ thẳng .mjs (đã verify gây lỗi build thật 2 lần)', () => {
  assert.match(pdfjsServerSource, /pathToFileURL\(workerPath\)\.href/);
  assert.match(pdfjsServerSource, /process\.cwd\(\)/);
  // Chỉ audit 2 dòng CODE THẬT (path.join + gán workerSrc), KHÔNG audit toàn
  // file — phần JSDoc phía trên CỐ Ý nhắc "/var/task" nhiều lần để giải thích
  // bug lịch sử (đó là lý do CẦN fix, không phải code thật), không phải hard-code.
  const codeLines = pdfjsServerSource.split('\n').filter(l => /workerPath|GlobalWorkerOptions\.workerSrc =/.test(l));
  assert.ok(codeLines.length >= 2, 'phải tìm thấy dòng khai báo workerPath + dòng gán workerSrc');
  for (const line of codeLines) {
    assert.ok(!line.includes('/var/task'), `dòng code không được hard-code "/var/task": ${line}`);
  }
  assert.ok(!pdfjsServerSource.includes("require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')"), 'không được resolve thẳng file .mjs qua require.resolve() — đã verify lỗi build thật');
});

// ─── Build/bundle assertion — chặn regression khỏi bundle deploy thiếu file ──

test('next.config.ts: outputFileTracingIncludes khai báo pdf.worker.mjs cho route TMB (analyze/optimize/index) — cơ chế THẬT SỰ đảm bảo file có trong bundle deploy Vercel, KHÔNG chỉ dựa vào cách tính path', () => {
  assert.match(nextConfigSource, /outputFileTracingIncludes:\s*\{/);
  assert.match(nextConfigSource, /'\/api\/stacking\/tmb-profiles\/\*\*':\s*\[\s*'\.\/node_modules\/pdfjs-dist\/legacy\/build\/pdf\.worker\.mjs'\s*\]/);
});

test('BUILD ARTIFACT thật: sau "npm run build", .next/server/.../analyze|optimize|index/route.js.nft.json PHẢI liệt kê pdf.worker.mjs — bằng chứng trực tiếp Vercel sẽ deploy đúng file (không chỉ suy luận từ source code)', () => {
  const routes = ['analyze', 'optimize', 'index'];
  const missing: string[] = [];
  for (const r of routes) {
    const nftPath = `.next/server/app/api/stacking/tmb-profiles/[id]/${r}/route.js.nft.json`;
    if (!fs.existsSync(nftPath)) {
      // Chưa build (VD chạy test này độc lập không qua `npm run build` trước) —
      // bỏ qua thay vì fail giả, nhưng validation chính thức (Section 9 Final
      // Report) PHẢI chạy sau 1 lần `npm run build` thật để test này có ý nghĩa.
      continue;
    }
    const content = fs.readFileSync(nftPath, 'utf8');
    if (!content.includes('pdf.worker.mjs')) missing.push(r);
  }
  assert.deepEqual(missing, [], `các route sau THIẾU pdf.worker.mjs trong trace bundle: ${missing.join(', ')}`);
});

// ─── D. Browser pdf.js config KHÔNG bị đổi sai ──────────────────────────────

test('TmbMap.tsx (browser renderer) KHÔNG bị đổi — vẫn tự set workerSrc riêng trỏ static asset /tmb-poc/pdf.worker.min.mjs, hoàn toàn tách biệt khỏi fix server này', () => {
  assert.match(tmbMapSource, /pdfjs\.GlobalWorkerOptions\.workerSrc = TMB_PDF_WORKER_URL/);
  assert.ok(!tmbMapSource.includes('tmb-pdfjs-server'), 'browser renderer không được import module server-only này');
});
