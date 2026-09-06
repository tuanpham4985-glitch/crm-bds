import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { PDFDocument, PDFName, PDFDict, PDFRawStream, PDFArray, PDFStream, PDFRef, StandardFonts } from 'pdf-lib';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { analyzePdf, optimizePdf, checkOptimizationQualityGates, isStructurallyValidImageColorSpace } from '../../src/lib/tmb-optimizer';

/** Dựng 1 PDF test có: text layer thật + 1 ảnh raster FlateDecode RGB "quá
 * khổ" (vượt ngưỡng optimize) — mô phỏng ĐÚNG tình huống thật đã audit trên
 * fixture TĐNĐ1 (ảnh nền RAW FlateDecode thay vì JPEG, xem tmb-optimizer.ts
 * comment đầu file), nhưng nhỏ hơn nhiều để test chạy nhanh, không cần file
 * PDF 200MB thật trong repo. */
async function buildTestPdfWithHugeRasterImage(opts: { width: number; height: number; withSMask?: boolean }): Promise<Buffer> {
  const { width, height, withSMask = false } = opts;
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('BM12-05', { x: 50, y: 50, size: 12, font });

  // Ảnh raster RGB NGẪU NHIÊN (không nén tốt được, giống ảnh chụp/render thật)
  // nén Flate — CÙNG kiểu encoding với fixture thật (raw pixel, không DCT).
  const pixels = crypto.randomBytes(width * height * 3);
  const compressed = zlib.deflateSync(pixels);

  const imageDict = doc.context.obj({
    Type: 'XObject',
    Subtype: 'Image',
    Width: width,
    Height: height,
    ColorSpace: 'DeviceRGB',
    BitsPerComponent: 8,
    Filter: 'FlateDecode',
    Length: compressed.length,
  });

  // withSMask=true — mô phỏng ĐÚNG cấu trúc raster nền TĐNĐ1 thật (ảnh RGB +
  // 1 SMask DeviceGray riêng, xem tmb-optimizer.ts comment đầu file): cần
  // fixture này để test được CẢ 2 nhánh replaceImageStream() gọi tới (base
  // '/DeviceRGB' VÀ mask '/DeviceGray') — bug thật (PDFName.of() double-encode
  // leading slash) làm hỏng CẢ HAI, không chỉ base image.
  if (withSMask) {
    const maskPixels = crypto.randomBytes(width * height); // 1 channel (DeviceGray)
    const maskCompressed = zlib.deflateSync(maskPixels);
    const maskDict = doc.context.obj({
      Type: 'XObject',
      Subtype: 'Image',
      Width: width,
      Height: height,
      ColorSpace: 'DeviceGray',
      BitsPerComponent: 8,
      Filter: 'FlateDecode',
      Length: maskCompressed.length,
    });
    const maskStream = PDFRawStream.of(maskDict, maskCompressed);
    const maskRef = doc.context.register(maskStream);
    imageDict.set(PDFName.of('SMask'), maskRef);
  }

  const imageStream = PDFRawStream.of(imageDict, compressed);
  const imageRef = doc.context.register(imageStream);

  const resources = page.node.Resources() ?? doc.context.obj({});
  let xobjDict = resources.lookup(PDFName.of('XObject'), PDFDict);
  if (!xobjDict) {
    xobjDict = doc.context.obj({});
    resources.set(PDFName.of('XObject'), xobjDict);
  }
  xobjDict.set(PDFName.of('Im0'), imageRef);
  page.node.set(PDFName.of('Resources'), resources);

  // Vẽ ảnh phủ toàn trang bằng cách NỐI THÊM vào content stream đã có (giữ lại
  // ops vẽ text của drawText ở trên) — thay hẳn /Contents sẽ xoá mất text.
  // pdf-lib lưu /Contents dạng PDFArray các ref (cho phép nhiều content stream
  // nối lại) — phải duyệt mảng, KHÔNG lookup thẳng như 1 ref đơn.
  // Content do drawText() tạo là PDFContentStream (không phải PDFRawStream) —
  // phải lấy bytes CHƯA nén qua getUnencodedContents(), KHÔNG getContents()
  // (getContents() trên PDFContentStream trả bytes ĐÃ Flate, không phải operator thô).
  function getUnencodedBytes(obj: unknown): Uint8Array {
    if (obj instanceof PDFStream) {
      const withUnencoded = obj as { getUnencodedContents?: () => Uint8Array };
      return typeof withUnencoded.getUnencodedContents === 'function'
        ? withUnencoded.getUnencodedContents()
        : obj.getContents();
    }
    return new Uint8Array();
  }
  const existingContentsEntry = page.node.get(PDFName.of('Contents'));
  const existingChunks: Uint8Array[] = [];
  if (existingContentsEntry instanceof PDFArray) {
    for (const ref of existingContentsEntry.asArray()) {
      existingChunks.push(getUnencodedBytes(doc.context.lookup(ref)));
    }
  } else if (existingContentsEntry) {
    existingChunks.push(getUnencodedBytes(doc.context.lookup(existingContentsEntry)));
  }
  const existingBytes = Buffer.concat(existingChunks.map(c => Buffer.from(c)));
  const drawOps = Buffer.from(` q 400 0 0 300 0 0 cm /Im0 Do Q `, 'latin1');
  const combined = Buffer.concat([existingBytes, drawOps]);
  const newContent = PDFRawStream.of(doc.context.obj({ Length: combined.length }), combined);
  const contentRef = doc.context.register(newContent);
  page.node.set(PDFName.of('Contents'), contentRef);

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

test('analyzePdf: phát hiện text layer + phân loại vector_text_huge_raster khi có raster quá khổ', async () => {
  const buffer = await buildTestPdfWithHugeRasterImage({ width: 4000, height: 3000 }); // 12MP > ngưỡng 8MP mặc định
  const analysis = await analyzePdf(buffer);

  assert.equal(analysis.pageCount, 1);
  assert.equal(analysis.hasTextLayer, true);
  assert.ok(analysis.textItemCount > 0);
  assert.equal(analysis.classification, 'vector_text_huge_raster');
  const bigImage = analysis.images.find(i => i.width === 4000);
  assert.ok(bigImage, 'phải tìm thấy ảnh raster trong Resources/XObject');
});

test('analyzePdf: PDF nhỏ, không ảnh lớn -> already_web_sized hoặc mostly_vector, KHÔNG báo huge_raster sai', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('BM1-01', { x: 10, y: 10, size: 12, font });
  const bytes = await doc.save();

  const analysis = await analyzePdf(Buffer.from(bytes));
  assert.notEqual(analysis.classification, 'vector_text_huge_raster');
  assert.notEqual(analysis.classification, 'scanned_raster');
});

test('optimizePdf: downsample + re-encode JPEG giảm dung lượng đáng kể, giữ nguyên text/kích thước trang', async () => {
  const buffer = await buildTestPdfWithHugeRasterImage({ width: 4000, height: 3000 });
  const originalAnalysis = await analyzePdf(buffer);

  const result = await optimizePdf(buffer, { maxRasterPixels: 1_000_000 }); // ép downsample mạnh để test nhanh
  assert.ok(result.report.optimizedSizeBytes < result.report.originalSizeBytes, 'phải giảm dung lượng');
  assert.equal(result.report.images.length, 1);
  assert.ok(!result.report.images[0].skippedReason);
  assert.ok(result.report.images[0].toWidth < result.report.images[0].fromWidth);

  const gates = await checkOptimizationQualityGates(originalAnalysis, result.buffer, buffer.length);
  assert.equal(gates.pass, true, JSON.stringify(gates.failures));
});

test('optimizePdf: ảnh đã nhỏ hơn ngưỡng -> KHÔNG động vào, trả buffer nguyên vẹn', async () => {
  const buffer = await buildTestPdfWithHugeRasterImage({ width: 200, height: 150 }); // rất nhỏ, dưới mọi ngưỡng
  const result = await optimizePdf(buffer);
  assert.equal(result.buffer.equals(buffer), true, 'không có ảnh nào cần optimize -> giữ nguyên buffer gốc');
});

test('checkOptimizationQualityGates: phát hiện sai lệch page dimensions/rotation', async () => {
  const buffer = await buildTestPdfWithHugeRasterImage({ width: 4000, height: 3000 });
  const originalAnalysis = await analyzePdf(buffer);

  // Giả lập 1 PDF "optimized" bị sai kích thước trang (bug regression giả định)
  const wrongDoc = await PDFDocument.create();
  wrongDoc.addPage([999, 999]);
  const wrongBytes = Buffer.from(await wrongDoc.save());

  const gates = await checkOptimizationQualityGates(originalAnalysis, wrongBytes, buffer.length);
  assert.equal(gates.pass, false);
  assert.ok(gates.failures.some(f => f.gate === 'page_dimensions'));
});

test('checkOptimizationQualityGates: KHÔNG pass nếu mất text layer', async () => {
  const buffer = await buildTestPdfWithHugeRasterImage({ width: 4000, height: 3000 });
  const originalAnalysis = await analyzePdf(buffer);

  const noTextDoc = await PDFDocument.create();
  noTextDoc.addPage([400, 300]);
  const noTextBytes = Buffer.from(await noTextDoc.save());

  const gates = await checkOptimizationQualityGates(originalAnalysis, noTextBytes, buffer.length);
  assert.equal(gates.pass, false);
  assert.ok(gates.failures.some(f => f.gate === 'text_layer_present'));
});

// ─── "Already at target size" tolerance (real regression found + fixed) ────
// Bug thật: ảnh đã optimize 1 lần trước (kích thước là kết quả của round())
// khi chạy optimizePdf() LẦN 2 cho ra targetScale ≈0.99996 (KHÔNG >= 1 do sai
// số dấu phẩy động) dù targetW/targetH round lại CHÍNH XÁC bằng kích thước
// hiện tại — bị resize+re-encode JPEG lần 2 vô ích, phá vỡ semantics "trả
// buffer gốc nguyên vẹn khi không cần optimize" mà route /optimize dựa vào để
// KHÔNG gọi asset storage (xem tmb-optimizer.ts comment tại điều kiện
// alreadyAtTargetSize). Fix: so sánh targetW/targetH (đã round, số nguyên)
// với base.width/height — tất định, không cần chọn epsilon tuỳ ý.

test('optimizePdf [A]: fixture TĐNĐ1 đã deploy (public/tmb-poc/tmb-hlx-tdnd1.pdf) -> no-op, KHÔNG re-encode (regression cho bug targetScale ≈0.99996); FULL PIPELINE qua gates y hệt route /optimize -> ĐÚNG PHẢI fail CHỈ ở gate image_colorspace_valid (fixture này còn mang bug ColorSpace thật đã audit, chưa được re-optimize/redeploy trong task fix) — size_reduced vẫn được miễn trừ đúng như regression cũ (bug production: 10238869 -> 10238869 từng bị coi là fail)', async () => {
  const buffer = fs.readFileSync('public/tmb-poc/tmb-hlx-tdnd1.pdf');
  const analysis = await analyzePdf(buffer);
  const result = await optimizePdf(buffer);
  assert.equal(result.isNoOp, true, 'phải được đánh dấu isNoOp — đây là tín hiệu route /optimize dùng để miễn trừ gate size_reduced VÀ để không ghi asset storage');
  assert.equal(result.buffer === buffer, true, 'phải trả ĐÚNG buffer gốc (reference equality) để route /optimize không gọi asset storage trên production');
  assert.equal(result.report.optimizedSizeBytes, result.report.originalSizeBytes);
  assert.ok(result.report.images.every(i => i.skippedReason), 'mọi ảnh phải bị skip, không ảnh nào bị resize/re-encode');

  // Đúng lời gọi route /optimize thật sự dùng — chứng minh no-op không còn bị
  // gate size_reduced chặn nhầm (bug production thật đã audit: 10238869 ->
  // 10238869 từng bị coi là fail), nhưng mọi gate khác vẫn được kiểm đầy đủ.
  //
  // CẬP NHẬT (TMB fidelity root-cause audit, gate "image_colorspace_valid"
  // mới): fixture này CHÍNH LÀ asset production đang mang bug ColorSpace
  // double-encode đã audit (public/tmb-poc/tmb-hlx-tdnd1.pdf CHƯA được
  // re-optimize/redeploy lại trong task fix này — xem Final Report "Do NOT
  // upload a new production PDF"), nên gates.pass BÂY GIỜ ĐÚNG PHẢI là false,
  // và chỉ fail ĐÚNG gate image_colorspace_valid cho refNum 199/200 (base +
  // SMask của raster nền) — KHÔNG fail bất kỳ gate nào khác (page_count/
  // dimensions/rotation/text/size_reduced-skip vẫn nguyên vẹn như trước).
  // Đây là bằng chứng sống: gate mới phát hiện ĐÚNG asset đã biết là hỏng,
  // và sẽ tự động pass trở lại sau khi asset này được re-optimize bằng
  // replaceImageStream() đã fix rồi redeploy (việc đó nằm ngoài scope task này).
  const gates = await checkOptimizationQualityGates(analysis, result.buffer, buffer.length, { skipSizeReductionGate: result.isNoOp });
  assert.equal(gates.pass, false, 'fixture ĐÃ DEPLOY này còn mang bug ColorSpace đã audit — CHƯA được re-optimize trong task fix này');
  assert.equal(gates.failures.length, 2, JSON.stringify(gates.failures));
  assert.ok(gates.failures.every(f => f.gate === 'image_colorspace_valid'), 'KHÔNG được fail bất kỳ gate nào khác ngoài image_colorspace_valid');
  assert.ok(gates.failures.some(f => f.detail.includes('refNum 200') && f.detail.includes('#2FDeviceRGB')));
  assert.ok(gates.failures.some(f => f.detail.includes('refNum 199') && f.detail.includes('#2FDeviceGray')));
});

test('optimizePdf [B]: ảnh THẬT SỰ quá khổ (12000x7978, gấp ~2.4x cap mặc định) vẫn bị optimize đầy đủ, KHÔNG bị điều kiện mới chặn nhầm; FULL PIPELINE qua gates (skipSizeReductionGate=false vì isNoOp=false) vẫn yêu cầu giảm dung lượng như cũ', async () => {
  const buffer = await buildTestPdfWithHugeRasterImage({ width: 4000, height: 3000 }); // 12MP, dùng cap ép nhỏ để test nhanh
  const analysis = await analyzePdf(buffer);
  const result = await optimizePdf(buffer, { maxRasterPixels: 1_000_000 }); // cap 1MP << 12MP -> chắc chắn cần optimize thật
  assert.equal(result.isNoOp, false, 'ảnh thật sự bị resize -> KHÔNG phải no-op');
  assert.equal(result.buffer === buffer, false, 'phải là buffer MỚI (đã thực sự resize/re-encode)');
  assert.equal(result.report.images.length, 1);
  assert.equal(result.report.images[0].skippedReason, undefined);
  assert.ok(result.report.images[0].toWidth < result.report.images[0].fromWidth, 'kích thước phải giảm thật');
  assert.ok(result.report.optimizedSizeBytes < result.report.originalSizeBytes);

  const gates = await checkOptimizationQualityGates(analysis, result.buffer, buffer.length, { skipSizeReductionGate: result.isNoOp });
  assert.equal(gates.pass, true, JSON.stringify(gates.failures));
});

test('optimizePdf [C]: ảnh rõ ràng nhỏ hơn ngưỡng (không phải trường hợp biên) -> no-op như cũ, không bị ảnh hưởng bởi điều kiện mới', async () => {
  const buffer = await buildTestPdfWithHugeRasterImage({ width: 200, height: 150 }); // rất nhỏ, dưới cả ngưỡng "đáng optimize" (20% cap)
  const result = await optimizePdf(buffer);
  assert.equal(result.buffer.equals(buffer), true);
});

test('optimizePdf [D]: trường hợp biên tất định — ảnh có width*height NHỈNH HƠN cap khiến targetScale < 1 theo dấu phẩy động, NHƯNG targetW/targetH round lại ĐÚNG BẰNG kích thước gốc -> phải nhận diện no-op (không phụ thuộc epsilon tuỳ ý)', async () => {
  // maxRasterPixels=100_000, base=314x319 -> product=100,166 (nhỉnh hơn cap ~0.17%).
  // targetScale = sqrt(100_000/100_166) ≈ 0.9991710 (< 1 theo phép tính thô, đã verify bằng script).
  // targetW = round(314 * 0.9991710) = 314 (= base.width). targetH = round(319 * 0.9991710) = 319 (= base.height).
  // -> Tái tạo ĐÚNG cơ chế của bug thật đã audit (mục A: base 7757x5157, cap 40M),
  // bằng số nhỏ để test nhanh + tất định (không phụ thuộc epsilon tuỳ ý).
  const buffer = await buildTestPdfWithHugeRasterImage({ width: 314, height: 319 });
  const result = await optimizePdf(buffer, { maxRasterPixels: 100_000 });
  assert.equal(result.buffer === buffer, true, 'trường hợp biên phải được nhận diện là no-op tất định, không phụ thuộc epsilon tuỳ ý');
  assert.ok(result.report.images.every(i => i.skippedReason));
});

// ─── Gate ordering bug (route /optimize — bug production thật đã audit) ────
// "Không cần optimize vì đã đúng kích thước" (isNoOp=true) và "đã thử optimize
// mà vẫn không giảm được byte" (isNoOp=false, size không giảm) là 2 kết quả
// NGỮ NGHĨA KHÁC NHAU — chỉ cái đầu được miễn trừ gate size_reduced. Test dưới
// đây khoá đúng ranh giới đó, tách biệt hẳn khỏi optimizePdf() (gọi thẳng
// checkOptimizationQualityGates với buffer tự tạo) để không phụ thuộc việc
// optimizePdf() có thực sự tạo ra được case "đổi rồi mà không nhỏ hơn" hay không.

test('checkOptimizationQualityGates [5]: buffer ĐÃ ĐỔI (isNoOp=false/mặc định) mà vẫn không giảm dung lượng -> VẪN fail size_reduced như cũ, KHÔNG được miễn trừ nhầm', async () => {
  const buffer = await buildTestPdfWithHugeRasterImage({ width: 4000, height: 3000 });
  const analysis = await analyzePdf(buffer);
  // Giả lập "đã optimize" (khác nội dung/isNoOp=false) nhưng KHÔNG hề nhỏ hơn
  // — nối thêm byte để chắc chắn optimizedBuffer.length >= originalSizeBytes.
  const notActuallySmallerBuffer = Buffer.concat([buffer, Buffer.from('padding')]);
  const gates = await checkOptimizationQualityGates(analysis, notActuallySmallerBuffer, buffer.length, { skipSizeReductionGate: false });
  assert.equal(gates.pass, false);
  assert.ok(gates.failures.some(f => f.gate === 'size_reduced'));
});

test('checkOptimizationQualityGates [6]: no-op (skipSizeReductionGate=true) miễn trừ ĐÚNG size_reduced, KHÔNG miễn trừ gate khác — page_count sai vẫn fail dù no-op', async () => {
  const buffer = await buildTestPdfWithHugeRasterImage({ width: 4000, height: 3000 });
  const analysis = await analyzePdf(buffer);

  // "optimized" buffer y hệt kích thước gốc (mô phỏng no-op thật) NHƯNG page
  // count sai — mô phỏng 1 lỗi cấu trúc giả định để xác nhận skip chỉ áp
  // dụng đúng 1 gate, không "no-op thì miễn hết".
  const wrongPageCountDoc = await PDFDocument.create();
  wrongPageCountDoc.addPage([analysis.page.width, analysis.page.height]);
  wrongPageCountDoc.addPage([analysis.page.width, analysis.page.height]); // 2 trang thay vì 1
  const wrongBuffer = Buffer.from(await wrongPageCountDoc.save());

  const gates = await checkOptimizationQualityGates(analysis, wrongBuffer, buffer.length, { skipSizeReductionGate: true });
  assert.equal(gates.pass, false, 'no-op KHÔNG được miễn trừ gate page_count/text_layer — chỉ miễn trừ size_reduced');
  assert.ok(gates.failures.some(f => f.gate === 'page_count'));
  assert.ok(!gates.failures.some(f => f.gate === 'size_reduced'), 'size_reduced phải được miễn trừ đúng vì skipSizeReductionGate=true');
});

// ─── ColorSpace corruption regression (TMB fidelity root-cause audit) ──────
// Bug thật đã audit trực tiếp trên production (public/tmb-poc/tmb-hlx-tdnd1.pdf):
// replaceImageStream() gọi `PDFName.of(colorSpace)` với `colorSpace` ĐÃ có sẵn
// dấu "/" ('/DeviceRGB' | '/DeviceGray', xem type param) — PDFName.of() coi
// TOÀN BỘ chuỗi truyền vào là NỘI DUNG tên (nó tự thêm dấu "/" delimiter khi
// serialize), nên dấu "/" thừa bên trong bị hex-escape thành "#2F", ghi ra
// PDF tên KHÔNG renderer nào nhận diện được: "/#2FDeviceRGB"/"/#2FDeviceGray".
// Hậu quả thật: TOÀN BỘ ảnh nền TĐNĐ1 (hồ, đường, cảnh quan — đúng ảnh raster
// DUY NHẤT đủ lớn để bị resize/re-encode) render sai (MuPDF: bỏ qua hẳn,
// pdf.js: nhiễu xám) dù mọi quality gate cũ (page/dimension/rotation/text/size)
// đều pass, vì KHÔNG gate nào từng rasterize/validate colorspace thật.
// Fix (tmb-optimizer.ts replaceImageStream): PDFName.of(colorSpace.slice(1))
// — bỏ dấu "/" thừa trước khi đưa cho PDFName.of(), verify bằng repro độc lập:
//   PDFName.of('/DeviceRGB').toString() === '/#2FDeviceRGB'  (bug)
//   PDFName.of('DeviceRGB').toString()  === '/DeviceRGB'     (đúng)

/** Đọc lại `/ColorSpace` của 1 XObject sau khi PDF đã save/reload — dùng
 * CHÍNH pdf-lib (không phải string chứa reasoning riêng) để khớp đúng với
 * những gì 1 renderer thật sẽ đọc từ dict. `.toString()` trên 1 PDFName hợp
 * lệ luôn có dạng "/<Name>" — so sánh CHÍNH XÁC (không chỉ "chứa DeviceRGB")
 * để bắt được ĐÚNG dạng lỗi "/#2FDeviceRGB" (chứa "DeviceRGB" như substring
 * nhưng KHÔNG phải tên hợp lệ). */
async function readColorSpaceName(buffer: Buffer, refNum: number): Promise<string | null> {
  const doc = await PDFDocument.load(buffer, { updateMetadata: false });
  const obj = doc.context.lookup(PDFRef.of(refNum));
  if (!(obj instanceof PDFRawStream)) return null;
  const cs = obj.dict.get(PDFName.of('ColorSpace'));
  return cs ? cs.toString() : null;
}

test('replaceImageStream regression: base image ColorSpace hợp lệ "/DeviceRGB" sau optimize — KHÔNG BAO GIỜ "/#2FDeviceRGB"', async () => {
  const buffer = await buildTestPdfWithHugeRasterImage({ width: 4000, height: 3000, withSMask: true });
  const analysis = await analyzePdf(buffer);
  const baseRefNum = analysis.images.find(i => i.role === 'base')!.refNum;

  const result = await optimizePdf(buffer, { maxRasterPixels: 1_000_000 }); // ép resize thật
  assert.equal(result.isNoOp, false, 'test phải thực sự đi qua replaceImageStream(), không phải no-op');

  const colorSpace = await readColorSpaceName(result.buffer, baseRefNum);
  assert.equal(colorSpace, '/DeviceRGB');
  assert.notEqual(colorSpace, '/#2FDeviceRGB', 'không được double-encode dấu "/" (bug thật đã audit)');
});

test('replaceImageStream regression: SMask ColorSpace hợp lệ "/DeviceGray" sau optimize — KHÔNG BAO GIỜ "/#2FDeviceGray"', async () => {
  const buffer = await buildTestPdfWithHugeRasterImage({ width: 4000, height: 3000, withSMask: true });
  const analysis = await analyzePdf(buffer);
  const maskRefNum = analysis.images.find(i => i.role === 'mask')!.refNum;

  const result = await optimizePdf(buffer, { maxRasterPixels: 1_000_000 });
  assert.equal(result.isNoOp, false);

  const colorSpace = await readColorSpaceName(result.buffer, maskRefNum);
  assert.equal(colorSpace, '/DeviceGray');
  assert.notEqual(colorSpace, '/#2FDeviceGray', 'SMask cũng đi qua CHÍNH replaceImageStream() nên phải fix ĐỒNG THỜI với base image');
});

test('replaceImageStream regression: chuỗi byte "#2F" (hex-escape của "/") KHÔNG BAO GIỜ xuất hiện trong output đã save — chặn regression ở mức byte, không chỉ ở mức API pdf-lib', async () => {
  const buffer = await buildTestPdfWithHugeRasterImage({ width: 4000, height: 3000, withSMask: true });
  const result = await optimizePdf(buffer, { maxRasterPixels: 1_000_000 });
  assert.equal(result.isNoOp, false);
  assert.equal(result.buffer.includes('#2FDevice'), false, 'output PDF không được chứa tên colorspace bị hex-escape sai (dấu hiệu byte-level của bug đã audit)');
});

test('replaceImageStream regression: PDFName.of() nhận bare name (không dấu "/") mới serialize đúng — repro độc lập xác nhận cơ chế bug + fix (không phụ thuộc optimizePdf())', () => {
  assert.equal(PDFName.of('/DeviceRGB').toString(), '/#2FDeviceRGB', 'xác nhận CƠ CHẾ bug: truyền tên đã có "/" vào PDFName.of() double-encode');
  assert.equal(PDFName.of('DeviceRGB').toString(), '/DeviceRGB', 'xác nhận FIX: bare name (không "/") serialize đúng — đây là cách replaceImageStream() phải gọi');
  assert.equal(PDFName.of('DeviceGray').toString(), '/DeviceGray');
});

test('replaceImageStream regression: resize/JPEG/SMask/text/coordinate behavior hiện có KHÔNG bị ảnh hưởng bởi fix ColorSpace (full pipeline qua gates)', async () => {
  const buffer = await buildTestPdfWithHugeRasterImage({ width: 4000, height: 3000, withSMask: true });
  const originalAnalysis = await analyzePdf(buffer);
  const baseRefNum = originalAnalysis.images.find(i => i.role === 'base')!.refNum;
  const maskRefNum = originalAnalysis.images.find(i => i.role === 'mask')!.refNum;

  const result = await optimizePdf(buffer, { maxRasterPixels: 1_000_000 });

  // Resize thật (không phải no-op) + JPEG re-encode.
  assert.equal(result.isNoOp, false);
  assert.equal(result.report.images.length, 2, 'phải có báo cáo cho CẢ base image lẫn SMask');
  const baseReport = result.report.images.find(i => i.refNum === baseRefNum)!;
  const maskReport = result.report.images.find(i => i.refNum === maskRefNum)!;
  assert.ok(baseReport.toWidth < baseReport.fromWidth, 'base image phải giảm kích thước thật');
  assert.ok(maskReport.toWidth < maskReport.fromWidth, 'SMask phải resize đồng bộ theo base image');
  assert.equal(baseReport.toWidth, maskReport.toWidth, 'base image và SMask phải cùng kích thước sau resize (không lệch alpha)');
  assert.ok(result.report.optimizedSizeBytes < result.report.originalSizeBytes);

  // SMask relationship vẫn còn (đúng ref đã resize, không bị đứt liên kết).
  const reloaded = await PDFDocument.load(result.buffer, { updateMetadata: false });
  const baseObj = reloaded.context.lookup(PDFRef.of(baseRefNum));
  assert.ok(baseObj instanceof PDFRawStream);
  const smaskEntry = (baseObj as PDFRawStream).dict.get(PDFName.of('SMask'));
  assert.ok(smaskEntry instanceof PDFRef, 'SMask reference phải còn nguyên sau optimize');
  assert.equal((smaskEntry as PDFRef).objectNumber, maskRefNum);

  // Text layer + toạ độ trang (Section 6 gates) vẫn nguyên vẹn.
  const newAnalysis = await analyzePdf(result.buffer);
  assert.equal(newAnalysis.hasTextLayer, true);
  assert.equal(newAnalysis.textItemCount, originalAnalysis.textItemCount);
  assert.equal(newAnalysis.page.width, originalAnalysis.page.width);
  assert.equal(newAnalysis.page.height, originalAnalysis.page.height);

  // Toàn bộ quality gate hiện có (không đổi) vẫn phải pass — fix KHÔNG phá gate nào.
  const gates = await checkOptimizationQualityGates(originalAnalysis, result.buffer, buffer.length, { skipSizeReductionGate: result.isNoOp });
  assert.equal(gates.pass, true, JSON.stringify(gates.failures));

  // Và ColorSpace của cả 2 vẫn hợp lệ (lặp lại bằng pipeline đầy đủ, không chỉ unit).
  assert.equal(await readColorSpaceName(result.buffer, baseRefNum), '/DeviceRGB');
  assert.equal(await readColorSpaceName(result.buffer, maskRefNum), '/DeviceGray');
});

// ─── Quality gate mới: "image_colorspace_valid" (TMB fidelity root-cause audit) ─
// Section 8 báo cáo audit: MỌI gate cũ (page_count/dimensions/rotation/
// text_layer/text_item_count/size_reduced/opens_with_pdfjs) đều PASS trên
// production dù ảnh nền TĐNĐ1 render sai hoàn toàn, vì opens_with_pdfjs chỉ
// gọi analyzePdf() (đọc text/metadata, KHÔNG rasterize) — không gate nào từng
// validate colorspace ảnh có RESOLVE ĐƯỢC hay không. Gate mới chặn ĐÚNG lớp
// lỗi đó: tên PDFName đơn giản chứa ký tự hex-escape không hợp lệ (VD
// "/#2FDeviceRGB") — KHÔNG cần rasterize/render (đắt, cần thêm dependency
// canvas), vì đây là lỗi CẤU TRÚC DICT phát hiện được tất định bằng cách đọc
// lại dict.

test('isStructurallyValidImageColorSpace: tên đơn giản hợp lệ (Device*, Cal*, Lab...) -> true', () => {
  assert.equal(isStructurallyValidImageColorSpace('/DeviceRGB'), true);
  assert.equal(isStructurallyValidImageColorSpace('/DeviceGray'), true);
  assert.equal(isStructurallyValidImageColorSpace('/DeviceCMYK'), true);
  assert.equal(isStructurallyValidImageColorSpace('/CalRGB'), true);
});

test('isStructurallyValidImageColorSpace: null (không khai báo /ColorSpace) -> true, ngoài phạm vi gate', () => {
  assert.equal(isStructurallyValidImageColorSpace(null), true);
});

test('isStructurallyValidImageColorSpace: colorspace phức hợp (indirect reference "189 0 R" cho ICCBased, array "[ /Indexed ]") -> true, KHÔNG false-positive trên ảnh hợp lệ chưa bị optimizer động vào', () => {
  assert.equal(isStructurallyValidImageColorSpace('189 0 R'), true);
  assert.equal(isStructurallyValidImageColorSpace('[ /Indexed 189 0 R 255 (...) ]'), true);
});

test('isStructurallyValidImageColorSpace: dạng lỗi ĐÚNG bug thật đã audit ("/#2FDeviceRGB"/"/#2FDeviceGray") -> false', () => {
  assert.equal(isStructurallyValidImageColorSpace('/#2FDeviceRGB'), false);
  assert.equal(isStructurallyValidImageColorSpace('/#2FDeviceGray'), false);
});

test('isStructurallyValidImageColorSpace: rỗng hoặc chỉ có "/" -> false (không phải tên hợp lệ)', () => {
  assert.equal(isStructurallyValidImageColorSpace('/'), false);
  assert.equal(isStructurallyValidImageColorSpace('/1BadName'), false); // PDF name không được bắt đầu bằng số theo quy ước tên hợp lệ ở đây
});

test('checkOptimizationQualityGates: gate "image_colorspace_valid" FAIL khi optimized buffer có ColorSpace bị hex-escape hỏng (mô phỏng ĐÚNG dạng bug thật, không phụ thuộc việc tự tay revert fix trong optimizePdf())', async () => {
  const buffer = await buildTestPdfWithHugeRasterImage({ width: 4000, height: 3000 });
  const originalAnalysis = await analyzePdf(buffer);

  // Build 1 PDF "optimized" giả lập ĐÚNG dạng dict bug thật đã audit — gọi
  // PDFName.of() với chuỗi ĐÃ có dấu "/" (y hệt cơ chế bug), không phải qua
  // optimizePdf() (đã fix) mà tự tay dựng để test ĐỘC LẬP khả năng phát hiện
  // của gate mới.
  const doc = await PDFDocument.create();
  const page = doc.addPage([originalAnalysis.page.width, originalAnalysis.page.height]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < originalAnalysis.textItemCount; i++) page.drawText('BM12-05', { x: 10, y: 10 + i, size: 8, font });
  const corruptedDict = doc.context.obj({
    Type: 'XObject', Subtype: 'Image', Width: 10, Height: 10,
    ColorSpace: PDFName.of('/DeviceRGB'), // <-- cơ chế bug: double-encode dấu "/"
    BitsPerComponent: 8, Filter: 'DCTDecode', Length: 4,
  });
  const corruptedStream = PDFRawStream.of(corruptedDict, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  const corruptedRef = doc.context.register(corruptedStream);
  const resources = page.node.Resources() ?? doc.context.obj({});
  const xobjDict = doc.context.obj({});
  xobjDict.set(PDFName.of('Im0'), corruptedRef);
  resources.set(PDFName.of('XObject'), xobjDict);
  page.node.set(PDFName.of('Resources'), resources);
  const corruptedBuffer = Buffer.from(await doc.save());

  const gates = await checkOptimizationQualityGates(originalAnalysis, corruptedBuffer, buffer.length, { skipSizeReductionGate: true });
  assert.equal(gates.pass, false);
  assert.ok(gates.failures.some(f => f.gate === 'image_colorspace_valid' && f.detail.includes('#2FDeviceRGB')));
});

test('checkOptimizationQualityGates: gate "image_colorspace_valid" PASS trên output THẬT của optimizePdf() đã fix (end-to-end, không chỉ unit test isStructurallyValidImageColorSpace)', async () => {
  const buffer = await buildTestPdfWithHugeRasterImage({ width: 4000, height: 3000, withSMask: true });
  const originalAnalysis = await analyzePdf(buffer);
  const result = await optimizePdf(buffer, { maxRasterPixels: 1_000_000 });
  const gates = await checkOptimizationQualityGates(originalAnalysis, result.buffer, buffer.length, { skipSizeReductionGate: result.isNoOp });
  assert.equal(gates.pass, true, JSON.stringify(gates.failures));
  assert.ok(!gates.failures.some(f => f.gate === 'image_colorspace_valid'));
});

test('checkOptimizationQualityGates: gate "image_colorspace_valid" PASS trên fixture TĐNĐ1 THẬT đã deploy (public/tmb-poc/tmb-hlx-tdnd1.pdf) — xác nhận asset hiện tại (dù còn bug cũ) được audit đúng vị trí lỗi, và ảnh Indexed/ICCBased hợp lệ khác trên trang không bị false-positive', async () => {
  const deployedBuffer = fs.readFileSync('public/tmb-poc/tmb-hlx-tdnd1.pdf');
  const analysis = await analyzePdf(deployedBuffer);
  const failures = analysis.images
    .filter(img => !isStructurallyValidImageColorSpace(img.colorSpace))
    .map(img => ({ refNum: img.refNum, role: img.role, colorSpace: img.colorSpace }));
  // Fixture đã deploy CHÍNH LÀ asset bị bug thật (audit trước khi fix) — gate
  // phải phát hiện ĐÚNG 2 ảnh hỏng (base + SMask của raster nền), KHÔNG hơn
  // KHÔNG kém, và các ảnh Indexed/ICCBased khác trên trang KHÔNG bị gắn cờ sai.
  assert.equal(failures.length, 2, JSON.stringify(failures));
  assert.ok(failures.every(f => f.colorSpace?.startsWith('/#2F')));
});
