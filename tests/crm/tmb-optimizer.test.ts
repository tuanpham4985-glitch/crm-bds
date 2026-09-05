import assert from 'node:assert/strict';
import test from 'node:test';
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
