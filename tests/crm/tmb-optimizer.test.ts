import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { PDFDocument, PDFName, PDFDict, PDFRawStream, PDFArray, PDFStream, StandardFonts } from 'pdf-lib';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { analyzePdf, optimizePdf, checkOptimizationQualityGates } from '../../src/lib/tmb-optimizer';

/** Dựng 1 PDF test có: text layer thật + 1 ảnh raster FlateDecode RGB "quá
 * khổ" (vượt ngưỡng optimize) — mô phỏng ĐÚNG tình huống thật đã audit trên
 * fixture TĐNĐ1 (ảnh nền RAW FlateDecode thay vì JPEG, xem tmb-optimizer.ts
 * comment đầu file), nhưng nhỏ hơn nhiều để test chạy nhanh, không cần file
 * PDF 200MB thật trong repo. */
async function buildTestPdfWithHugeRasterImage(opts: { width: number; height: number }): Promise<Buffer> {
  const { width, height } = opts;
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

test('optimizePdf [A]: fixture TĐNĐ1 đã deploy (public/tmb-poc/tmb-hlx-tdnd1.pdf) -> no-op, KHÔNG re-encode (regression cho bug targetScale ≈0.99996), FULL PIPELINE qua gates y hệt route /optimize -> pass (regression cho bug production thật: size_reduced chặn nhầm no-op hợp lệ)', async () => {
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
  const gates = await checkOptimizationQualityGates(analysis, result.buffer, buffer.length, { skipSizeReductionGate: result.isNoOp });
  assert.equal(gates.pass, true, JSON.stringify(gates.failures));
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
