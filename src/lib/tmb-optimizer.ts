/** TMB Manager — PDF optimizer (Section 5/6 của TMB Manager spec).
 *
 * Audit thực tế trên fixture "VHGG Hạ Long_TMB Tiện ích&mã căn TĐNĐ1.pdf"
 * (206.6MB) cho thấy: 1 trang, text/vector layer thật (10914 text items),
 * NHƯNG 203.4MB trong tổng 206.6MB (~98%) là DUY NHẤT 1 ảnh nền raster
 * 12000×7978px lưu dạng FlateDecode RAW PIXEL (không nén tri giác) thay vì
 * JPEG — soft mask đi kèm cùng kích thước đã là JPEG hiệu quả (0.56MB).
 * -> Đòn bẩy lớn nhất: giữ NGUYÊN text/vector + toạ độ trang, chỉ downsample
 * + re-encode raster nền quá khổ sang JPEG, KHÔNG rasterize lại cả trang.
 *
 * Module này CHỦ ĐÍCH generic (không hard-code cho riêng file TĐNĐ1):
 * - `analyzePdf` tự phát hiện raster quá khổ bất kỳ (không chỉ ảnh trực tiếp
 *   trong Resources của trang — nhiều PDF xuất từ CAD lồng ảnh trong Form
 *   XObject lồng nhau, xem `walkImageXObjects`).
 * - `optimizePdf` chỉ động vào ảnh vượt ngưỡng pixel, giữ nguyên mọi object
 *   khác (text, vector, font, ảnh nhỏ) — KHÔNG rebuild lại toàn bộ PDF.
 * - Chỉ hỗ trợ colorspace/filter phổ biến (DeviceRGB/DeviceGray 8bpc,
 *   Flate hoặc DCTDecode). Ảnh dùng filter/colorspace lạ (Indexed, CMYK,
 *   JPX, 16bpc...) bị BỎ QUA có chủ đích (không đoán decode sai làm hỏng
 *   ảnh) — báo cáo rõ trong kết quả, không âm thầm.
 */
import { PDFDocument, PDFName, PDFDict, PDFRawStream, PDFArray, PDFRef, PDFNumber } from 'pdf-lib';
import zlib from 'node:zlib';
import sharp, { type Sharp } from 'sharp';
// pdfjs-dist Node build — dùng lại CHÍNH XÁC cách load đã dùng ở renderer
// (xem TmbMap.tsx) để audit text layer, KHÔNG viết parser PDF text riêng.
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface PdfImageXObjectInfo {
  /** Đường dẫn lồng để debug, VD "/Fm0/Im0" — KHÔNG dùng để định danh (dùng refNum). */
  path: string;
  refNum: number;
  width: number;
  height: number;
  bitsPerComponent: number | null;
  colorSpace: string | null;
  filter: string | null;
  streamBytes: number;
  role: 'base' | 'mask';
  /** refNum của ảnh cha nếu role === 'mask'. */
  parentRefNum?: number;
}

export type PdfClassification =
  | 'vector_text_huge_raster'
  | 'mostly_vector'
  | 'scanned_raster'
  | 'already_web_sized';

export interface PdfAnalysis {
  fileSizeBytes: number;
  pageCount: number;
  page: { width: number; height: number; rotation: number };
  hasTextLayer: boolean;
  textItemCount: number;
  images: PdfImageXObjectInfo[];
  /** Tổng bytes stream của TẤT CẢ ảnh (đã nén như lưu trong file) — dùng để
   * giải thích "vì sao file nặng" mà không cần đoán. */
  totalImageStreamBytes: number;
  classification: PdfClassification;
}

const ALREADY_WEB_SIZED_BYTES = 20 * 1024 * 1024; // 20MB — ngưỡng "đã đủ nhẹ cho web", không cần optimize

async function loadPdfDoc(buffer: Buffer) {
  return PDFDocument.load(buffer, { updateMetadata: false, ignoreEncryption: true });
}

/** Duyệt đệ quy Resources/XObject của 1 trang, THEO CẢ Form XObject lồng nhau
 * (nguyên nhân chính khiến 1 lần duyệt nông bỏ sót ảnh khổng lồ — xem comment
 * đầu file) VÀ theo /SMask của mỗi ảnh tìm được (mask không nằm trong
 * Resources, chỉ được trỏ tới qua dict của ảnh cha). */
function walkImageXObjects(
  pdfDoc: PDFDocument,
  resources: PDFDict | null | undefined,
  pathPrefix: string,
  visited: Set<number>,
  out: PdfImageXObjectInfo[],
  parentRefNum?: number,
  role: 'base' | 'mask' = 'base',
): void {
  if (!resources) return;
  const xobjEntry = resources.get(PDFName.of('XObject'));
  if (!xobjEntry) return;
  const xobjDict = pdfDoc.context.lookup(xobjEntry, PDFDict);
  if (!xobjDict) return;

  for (const key of xobjDict.keys()) {
    const ref = xobjDict.get(key);
    if (!(ref instanceof PDFRef) || visited.has(ref.objectNumber)) continue;
    const obj = pdfDoc.context.lookup(ref);
    if (!(obj instanceof PDFRawStream)) continue;
    visited.add(ref.objectNumber);

    const subtype = obj.dict.get(PDFName.of('Subtype'))?.toString();
    const path = `${pathPrefix}/${key.toString()}`;
    if (subtype === '/Image') {
      pushImageInfo(pdfDoc, obj, ref, path, out, parentRefNum, role, visited);
    } else if (subtype === '/Form') {
      const resEntry = obj.dict.get(PDFName.of('Resources'));
      const formResources = resEntry ? pdfDoc.context.lookup(resEntry, PDFDict) : null;
      walkImageXObjects(pdfDoc, formResources, path, visited, out);
    }
  }
}

function pushImageInfo(
  pdfDoc: PDFDocument,
  obj: PDFRawStream,
  ref: PDFRef,
  path: string,
  out: PdfImageXObjectInfo[],
  parentRefNum: number | undefined,
  role: 'base' | 'mask',
  visited: Set<number>,
): void {
  const dict = obj.dict;
  const width = Number(dict.get(PDFName.of('Width'))?.toString() ?? 0);
  const height = Number(dict.get(PDFName.of('Height'))?.toString() ?? 0);
  const bpcRaw = dict.get(PDFName.of('BitsPerComponent'))?.toString();
  const filterRaw = dict.get(PDFName.of('Filter'));
  const filter = filterRaw instanceof PDFArray ? filterRaw.asArray()[0]?.toString() ?? null : filterRaw?.toString() ?? null;
  const colorSpace = dict.get(PDFName.of('ColorSpace'))?.toString() ?? null;

  out.push({
    path,
    refNum: ref.objectNumber,
    width,
    height,
    bitsPerComponent: bpcRaw ? Number(bpcRaw) : null,
    colorSpace,
    filter,
    streamBytes: obj.getContents().length,
    role,
    parentRefNum,
  });

  // SMask không nằm trong Resources — theo dõi riêng để optimizer có thể
  // resize đồng bộ với ảnh cha (Section 6: coordinate/visual gate).
  const smaskRef = dict.get(PDFName.of('SMask'));
  if (smaskRef instanceof PDFRef && !visited.has(smaskRef.objectNumber)) {
    const smaskObj = pdfDoc.context.lookup(smaskRef);
    if (smaskObj instanceof PDFRawStream) {
      visited.add(smaskRef.objectNumber);
      pushImageInfo(pdfDoc, smaskObj, smaskRef, `${path}/SMask`, out, ref.objectNumber, 'mask', visited);
    }
  }
}

export async function analyzePdf(buffer: Buffer): Promise<PdfAnalysis> {
  const fileSizeBytes = buffer.length;

  const pdfDoc = await loadPdfDoc(buffer);
  const page = pdfDoc.getPages()[0];
  if (!page) throw new Error('PDF không có trang nào');

  const images: PdfImageXObjectInfo[] = [];
  walkImageXObjects(pdfDoc, page.node.Resources(), '', new Set(), images);
  const totalImageStreamBytes = images.reduce((s, i) => s + i.streamBytes, 0);

  // Text layer audit — TÁI SỬ DỤNG pdfjs-dist (renderer + indexer dùng chung 1
  // engine đọc PDF, không viết 2 parser khác nhau cho cùng 1 việc).
  const pdfDataForJs = new Uint8Array(buffer);
  const jsDoc = await pdfjsLib.getDocument({
    data: pdfDataForJs,
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;
  const jsPage = await jsDoc.getPage(1);
  const viewport = jsPage.getViewport({ scale: 1 });
  const textContent = await jsPage.getTextContent();
  const textItemCount = textContent.items.filter(it => 'str' in it && it.str.trim().length > 0).length;
  const hasTextLayer = textItemCount > 0;

  const HUGE_RASTER_PIXELS = 8_000_000; // ~8MP — vượt ngưỡng "ảnh nền lớn cần optimize", xem OPTIMIZE_DEFAULTS
  const hasHugeRaster = images.some(img => img.width * img.height >= HUGE_RASTER_PIXELS);

  let classification: PdfClassification;
  if (fileSizeBytes <= ALREADY_WEB_SIZED_BYTES) {
    classification = 'already_web_sized';
  } else if (!hasTextLayer && images.length > 0) {
    classification = 'scanned_raster';
  } else if (hasTextLayer && hasHugeRaster) {
    classification = 'vector_text_huge_raster';
  } else {
    classification = 'mostly_vector';
  }

  return {
    fileSizeBytes,
    pageCount: jsDoc.numPages,
    page: { width: viewport.width, height: viewport.height, rotation: jsPage.rotate },
    hasTextLayer,
    textItemCount,
    images,
    totalImageStreamBytes,
    classification,
  };
}

export interface OptimizeOptions {
  /** Ảnh có width*height vượt ngưỡng này mới bị động vào — mặc định khớp
   * DEFAULT_RENDER_QUALITY_CAPS.maxTotalPixels (tmb-map-render-quality.ts):
   * renderer KHÔNG BAO GIỜ vẽ quá 40MP cho toàn trang dù zoom sâu tới đâu
   * (xem comment file đó), nên raster gốc vượt xa mốc này không mất chi tiết
   * quan sát được nào khi downsample về đúng mốc đó. */
  maxRasterPixels?: number;
  jpegQuality?: number;
}

const OPTIMIZE_DEFAULTS: Required<OptimizeOptions> = {
  maxRasterPixels: 40_000_000,
  jpegQuality: 85,
};

export interface OptimizedImageReport {
  path: string;
  refNum: number;
  role: 'base' | 'mask';
  fromWidth: number;
  fromHeight: number;
  toWidth: number;
  toHeight: number;
  fromBytes: number;
  toBytes: number;
  skippedReason?: string;
}

export interface OptimizeResult {
  buffer: Buffer;
  /** TRUE khi KHÔNG có ảnh nào thực sự bị đổi (mọi candidate đều skippedReason)
   * — asset đã ở đúng kích thước mục tiêu từ trước, `buffer` chính là buffer
   * gốc nguyên vẹn. Đây là tín hiệu TẤT ĐỊNH duy nhất caller (route /optimize,
   * checkOptimizationQualityGates) nên dùng để phân biệt "không cần optimize"
   * với "đã optimize nhưng không giảm được bao nhiêu byte" — KHÔNG suy ra từ
   * so sánh kích thước file (2 file khác nội dung vẫn có thể tình cờ bằng
   * byte), CŨNG KHÔNG suy ra từ so sánh buffer identity ở nơi gọi (rò rỉ chi
   * tiết implementation ra ngoài) — optimizePdf() là nơi DUY NHẤT biết chắc
   * điều này nên trả thẳng qua field này. */
  isNoOp: boolean;
  report: {
    originalSizeBytes: number;
    optimizedSizeBytes: number;
    images: OptimizedImageReport[];
  };
}

/** Đọc pixel thô của 1 ảnh XObject ra Buffer RGB/Gray cho sharp — chỉ hỗ trợ
 * đúng 2 trường hợp thực tế gặp (xem comment đầu file): DCTDecode (JPEG, sharp
 * decode thẳng) và FlateDecode RAW 8bpc DeviceRGB/DeviceGray (inflate rồi đưa
 * vào sharp ở chế độ `raw`). Trả về `null` nếu filter/colorspace không nhận
 * diện được — caller phải BỎ QUA ảnh đó, không đoán. */
function decodeToSharp(img: PdfImageXObjectInfo, rawStreamBytes: Uint8Array): Sharp | null {
  if (img.filter === '/DCTDecode') {
    return sharp(rawStreamBytes);
  }
  if (img.filter === '/FlateDecode' && img.bitsPerComponent === 8 &&
      (img.colorSpace === '/DeviceRGB' || img.colorSpace === '/DeviceGray')) {
    const channels = img.colorSpace === '/DeviceRGB' ? 3 : 1;
    const expectedBytes = img.width * img.height * channels;
    let inflated: Buffer;
    try {
      inflated = zlib.inflateSync(rawStreamBytes);
    } catch {
      return null;
    }
    if (inflated.length !== expectedBytes) return null; // an toàn: kích thước không khớp -> không đoán tiếp
    return sharp(inflated, { raw: { width: img.width, height: img.height, channels } });
  }
  return null; // filter/colorspace lạ (Indexed, CMYK, JPX, 16bpc...) — v1 không hỗ trợ
}

/** Optimize PDF: chỉ thay stream của các ảnh vượt ngưỡng, downsample bằng
 * sharp rồi re-encode JPEG, GIỮ NGUYÊN mọi object khác (page tree, font, text,
 * vector, ảnh nhỏ) — không rebuild lại toàn bộ tài liệu. Trả `buffer` GỐC
 * nguyên vẹn nếu không có ảnh nào cần/đủ điều kiện tối ưu (KHÔNG optimize chỉ
 * để giảm dung lượng bằng mọi giá — xem Section 6 "Do not optimize merely to
 * hit arbitrary MB target"). */
export async function optimizePdf(buffer: Buffer, opts: OptimizeOptions = {}): Promise<OptimizeResult> {
  const { maxRasterPixels, jpegQuality } = { ...OPTIMIZE_DEFAULTS, ...opts };

  const pdfDoc = await loadPdfDoc(buffer);
  const page = pdfDoc.getPages()[0];
  if (!page) throw new Error('PDF không có trang nào');

  const images: PdfImageXObjectInfo[] = [];
  walkImageXObjects(pdfDoc, page.node.Resources(), '', new Set(), images);

  const reports: OptimizedImageReport[] = [];
  const candidateBases = images.filter(img => img.role === 'base' && img.width * img.height >= maxRasterPixels * 0.2);
  // Ngưỡng "đáng optimize" = 20% cap hiển thị tối đa — ảnh nhỏ hơn thế không
  // đáng rủi ro động vào (lợi ích nhỏ, xem "Do not optimize merely to hit
  // arbitrary MB target").

  for (const base of candidateBases) {
    const targetScale = Math.min(1, Math.sqrt(maxRasterPixels / (base.width * base.height)));
    const targetW = Math.max(1, Math.round(base.width * targetScale));
    const targetH = Math.max(1, Math.round(base.height * targetScale));

    const baseRef = pdfDoc.context.lookup(PDFRef.of(base.refNum));
    if (!(baseRef instanceof PDFRawStream)) continue;
    const baseSharp = decodeToSharp(base, baseRef.getContents());
    if (!baseSharp) {
      reports.push({ path: base.path, refNum: base.refNum, role: 'base', fromWidth: base.width, fromHeight: base.height, toWidth: base.width, toHeight: base.height, fromBytes: base.streamBytes, toBytes: base.streamBytes, skippedReason: `Unsupported filter/colorspace: ${base.filter} ${base.colorSpace}` });
      continue;
    }
    // "Đã ở đúng kích thước mục tiêu" được xác định bằng SO SÁNH KÍCH THƯỚC
    // PIXEL SAU KHI ROUND (targetW/targetH) với base.width/height — KHÔNG chỉ
    // dựa vào targetScale >= 1. Lý do (xác minh thực tế trên chính fixture đã
    // deploy public/tmb-poc/tmb-hlx-tdnd1.pdf, ảnh nền 7757×5157): ảnh đã được
    // optimize 1 lần trước đó có kích thước là kết quả của MỘT round() trước
    // đó rồi, nên sqrt(maxRasterPixels / (base.width*base.height)) ở lần chạy
    // SAU thường ra một số cực gần nhưng KHÔNG TUYỆT ĐỐI bằng 1 (VD
    // 0.999964...) do sai số dấu phẩy động — targetScale >= 1 một mình bỏ sót
    // ca này, khiến ảnh bị resize+re-encode JPEG lần 2 dù targetW/targetH
    // round ra CHÍNH XÁC lại đúng base.width/base.height (không có gì thay
    // đổi ngoài nén JPEG thêm 1 lần, giảm chất lượng vô ích). So sánh kích
    // thước pixel đã round là phép so TẤT ĐỊNH trên số nguyên (không cần chọn
    // epsilon tuỳ ý) — ảnh THẬT SỰ quá khổ (VD 12000×7978 gốc, targetScale
    // ≈0.646) luôn cho targetW/targetH nhỏ hơn base rõ rệt, không bị ảnh
    // hưởng bởi điều kiện bổ sung này (xem test "oversized raster vẫn được
    // optimize" trong tmb-optimizer.test.ts).
    const alreadyAtTargetSize = targetScale >= 1 || (targetW === base.width && targetH === base.height);
    if (alreadyAtTargetSize) {
      reports.push({ path: base.path, refNum: base.refNum, role: 'base', fromWidth: base.width, fromHeight: base.height, toWidth: base.width, toHeight: base.height, fromBytes: base.streamBytes, toBytes: base.streamBytes, skippedReason: 'Already within render budget, no downsample needed' });
      continue;
    }

    const newJpeg = await baseSharp.resize(targetW, targetH, { fit: 'fill' }).jpeg({ quality: jpegQuality, mozjpeg: true }).toBuffer();
    replaceImageStream(pdfDoc, PDFRef.of(base.refNum), newJpeg, targetW, targetH, '/DeviceRGB');
    reports.push({ path: base.path, refNum: base.refNum, role: 'base', fromWidth: base.width, fromHeight: base.height, toWidth: targetW, toHeight: targetH, fromBytes: base.streamBytes, toBytes: newJpeg.length });

    // Resize mask đồng bộ theo cùng scale để không lệch alpha so với ảnh mới.
    const mask = images.find(i => i.role === 'mask' && i.parentRefNum === base.refNum);
    if (mask) {
      const maskRefObj = pdfDoc.context.lookup(PDFRef.of(mask.refNum));
      if (maskRefObj instanceof PDFRawStream) {
        const maskSharp = decodeToSharp(mask, maskRefObj.getContents());
        if (maskSharp) {
          const newMaskJpeg = await maskSharp.resize(targetW, targetH, { fit: 'fill' }).jpeg({ quality: jpegQuality, mozjpeg: true }).toBuffer();
          replaceImageStream(pdfDoc, PDFRef.of(mask.refNum), newMaskJpeg, targetW, targetH, '/DeviceGray');
          reports.push({ path: mask.path, refNum: mask.refNum, role: 'mask', fromWidth: mask.width, fromHeight: mask.height, toWidth: targetW, toHeight: targetH, fromBytes: mask.streamBytes, toBytes: newMaskJpeg.length });
        }
      }
    }
  }

  if (reports.every(r => r.skippedReason)) {
    // Không có ảnh nào thực sự bị đổi — trả buffer GỐC, không ghi lại PDF vô ích.
    return { buffer, isNoOp: true, report: { originalSizeBytes: buffer.length, optimizedSizeBytes: buffer.length, images: reports } };
  }

  const savedBytes = await pdfDoc.save({ useObjectStreams: true, addDefaultPage: false });
  const optimizedBuffer = Buffer.from(savedBytes);
  return {
    buffer: optimizedBuffer,
    isNoOp: false,
    report: { originalSizeBytes: buffer.length, optimizedSizeBytes: optimizedBuffer.length, images: reports },
  };
}

function replaceImageStream(
  pdfDoc: PDFDocument,
  ref: PDFRef,
  jpegBytes: Buffer,
  width: number,
  height: number,
  colorSpace: '/DeviceRGB' | '/DeviceGray',
): void {
  const existing = pdfDoc.context.lookup(ref);
  if (!(existing instanceof PDFRawStream)) return;
  const newDict = existing.dict.clone(pdfDoc.context);
  newDict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
  newDict.delete(PDFName.of('DecodeParms'));
  newDict.set(PDFName.of('Width'), PDFNumber.of(width));
  newDict.set(PDFName.of('Height'), PDFNumber.of(height));
  newDict.set(PDFName.of('ColorSpace'), PDFName.of(colorSpace));
  newDict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
  newDict.set(PDFName.of('Length'), PDFNumber.of(jpegBytes.length));
  const newStream = PDFRawStream.of(newDict, jpegBytes);
  pdfDoc.context.assign(ref, newStream);
}

export interface QualityGateFailure {
  gate: string;
  detail: string;
}

export interface QualityGateResult {
  pass: boolean;
  failures: QualityGateFailure[];
}

/** Section 6 — cổng chất lượng: optimized asset chỉ được đánh dấu ACTIVE nếu
 * qua HẾT các gate này. `sampleUnitCodes` (tuỳ chọn) = vài mã căn đã biết
 * trước optimize, dùng để so khớp lại sau optimize (gate 5).
 *
 * `opts.skipSizeReductionGate` — CHỈ dùng khi optimizePdf() đã báo
 * `isNoOp: true` (xem OptimizeResult.isNoOp): "không cần optimize vì đã đúng
 * kích thước mục tiêu" là kết quả HỢP LỆ, khác hẳn "đã thử optimize nhưng
 * không giảm được byte nào" — bị gate size_reduced chặn NHẦM 1 no-op hợp lệ
 * là bug thật đã audit trên chính fixture TĐNĐ1 production (10238869 ->
 * 10238869 bị coi là fail dù optimizer không hề động vào ảnh). Caller (route
 * /optimize) PHẢI tự xác định no-op từ `OptimizeResult.isNoOp` — KHÔNG được
 * tự suy đoán no-op từ so sánh kích thước ở gate này (2 lý do khác nhau hoàn
 * toàn: "chưa từng đổi gì" vs "đổi rồi mà vẫn không nhỏ hơn" — TRƯỜNG HỢP SAU
 * VẪN PHẢI fail như cũ, xem test "changed buffer với size không giảm vẫn
 * fail"). Mọi gate khác (page_count/dimensions/rotation/text layer/text item
 * count/opens_with_pdfjs) áp dụng NGUYÊN VẸN dù no-op hay không — no-op chỉ
 * miễn trừ ĐÚNG 1 gate size_reduced. */
export async function checkOptimizationQualityGates(
  originalAnalysis: PdfAnalysis,
  optimizedBuffer: Buffer,
  originalSizeBytes: number,
  opts: { skipSizeReductionGate?: boolean } = {},
): Promise<QualityGateResult> {
  const failures: QualityGateFailure[] = [];

  let optimizedAnalysis: PdfAnalysis;
  try {
    optimizedAnalysis = await analyzePdf(optimizedBuffer);
  } catch (e) {
    return { pass: false, failures: [{ gate: 'opens_with_pdfjs', detail: e instanceof Error ? e.message : String(e) }] };
  }

  if (optimizedAnalysis.pageCount !== originalAnalysis.pageCount) {
    failures.push({ gate: 'page_count', detail: `${originalAnalysis.pageCount} -> ${optimizedAnalysis.pageCount}` });
  }
  const dimTolerance = 0.5; // pt
  if (Math.abs(optimizedAnalysis.page.width - originalAnalysis.page.width) > dimTolerance ||
      Math.abs(optimizedAnalysis.page.height - originalAnalysis.page.height) > dimTolerance) {
    failures.push({ gate: 'page_dimensions', detail: `${originalAnalysis.page.width}x${originalAnalysis.page.height} -> ${optimizedAnalysis.page.width}x${optimizedAnalysis.page.height}` });
  }
  if (optimizedAnalysis.page.rotation !== originalAnalysis.page.rotation) {
    failures.push({ gate: 'rotation', detail: `${originalAnalysis.page.rotation} -> ${optimizedAnalysis.page.rotation}` });
  }
  if (originalAnalysis.hasTextLayer && !optimizedAnalysis.hasTextLayer) {
    failures.push({ gate: 'text_layer_present', detail: 'Text layer bị mất sau optimize' });
  }
  if (originalAnalysis.hasTextLayer && optimizedAnalysis.textItemCount < originalAnalysis.textItemCount) {
    failures.push({ gate: 'text_item_count', detail: `${originalAnalysis.textItemCount} -> ${optimizedAnalysis.textItemCount}` });
  }
  if (!opts.skipSizeReductionGate && optimizedBuffer.length >= originalSizeBytes) {
    failures.push({ gate: 'size_reduced', detail: `${originalSizeBytes} -> ${optimizedBuffer.length} (không giảm)` });
  }

  return { pass: failures.length === 0, failures };
}
