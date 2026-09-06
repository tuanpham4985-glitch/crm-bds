/** pdfjs-dist — cấu hình DUY NHẤT dùng cho phía SERVER (Node/Vercel Function),
 * import bởi tmb-optimizer.ts (`analyzePdf`) + tmb-indexer.ts
 * (`extractPdfUnitLabels`) — 2 nơi DUY NHẤT gọi `pdfjsLib.getDocument()` ở
 * server. KHÔNG liên quan gì tới browser renderer (TmbMap.tsx tự set
 * `workerSrc` riêng trỏ tới static asset `/tmb-poc/pdf.worker.min.mjs`, xem
 * comment ở đó — 2 context hoàn toàn tách biệt).
 *
 * ROOT CAUSE đã audit trực tiếp trên production Vercel + đọc thẳng nguồn thật
 * `node_modules/pdfjs-dist/legacy/build/pdf.mjs`:
 *
 *   GlobalWorkerOptions.workerSrc ||= "./pdf.worker.mjs";      // mặc định
 *   ...
 *   const worker = await import(/webpackIgnore/ this.workerSrc); // fake worker
 *
 * KHÔNG có workerSrc nào được set trước khi gọi getDocument() -> pdf.js rơi
 * vào default RELATIVE PATH "./pdf.worker.mjs", Node resolve theo vị trí
 * CHÍNH pdf.mjs (node_modules/pdfjs-dist/legacy/build/). Local dev/build có
 * nguyên node_modules trên đĩa nên việc này luôn thành công, KHÔNG lộ bug.
 * Trên Vercel, function serverless CHỈ chứa các file được Output File Tracing
 * (@vercel/nft) xác định là cần — pd.mjs KHÔNG chứa bất kỳ tham chiếu TĨNH nào
 * tới "pdf.worker.mjs" ở top-level (chỉ dùng `this.workerSrc`, 1 giá trị
 * COMPUTED lúc runtime, bên trong `_setupFakeWorker()` — KHÔNG static analyzer
 * nào lần ra được), nên nft không có cách nào tự suy luận cần include sibling
 * file đó cùng pdf.mjs — dù bản thân pdf.mjs load thành công. Đây CHÍNH XÁC
 * là log lỗi thật: "Cannot find module .../pdf.worker.mjs" — file KHÔNG tồn
 * tại trong bundle deploy, không phải path tính sai (`serverExternalPackages:
 * ['pdfjs-dist']`, next.config.ts, xử lý lớp KHÁC — chặn webpack bundle lại
 * pdfjs-dist — không liên quan việc Vercel có include đúng file hay không).
 *
 * FIX gồm 2 phần, cả 2 đều BẮT BUỘC:
 *
 * 1. Set `GlobalWorkerOptions.workerSrc` TƯỜNG MINH bằng path tuyệt đối tính
 *    qua `process.cwd()` (KHÔNG hard-code "/var/task/..." — process.cwd() TỰ
 *    ĐÚNG bằng "/var/task" trên Vercel runtime thật, xác nhận trực tiếp từ
 *    path trong log lỗi gốc, VÀ tự đúng bằng project root khi build/dev local
 *    — 1 API Node chuẩn, không phải path hard-code riêng cho môi trường nào).
 *    KHÔNG dùng require.resolve() trỏ thẳng vào pdf.worker.mjs/pdf.mjs — ĐÃ
 *    THỬ, webpack build server báo lỗi khác nhau tuỳ target (".mjs cần
 *    import", hoặc trả về module id dạng số thay vì path thật) vì 2 file đó
 *    là ESM thuần nằm trong package đã serverExternalPackages — require.resolve()
 *    bị chính webpack can thiệp theo cách không tương thích, đã verify bằng
 *    2 lần build thất bại thật, KHÔNG suy đoán.
 *
 * 2. `outputFileTracingIncludes` trong next.config.ts cho các route TMB
 *    (analyze/optimize/index) — vì KHÔNG cách nào (kể cả require.resolve()
 *    nếu dùng được) khiến @vercel/nft tự lần ra sibling file pdf.worker.mjs
 *    chỉ từ việc phân tích tĩnh pd.mjs (xem lý do ở trên), phần NÀY — không
 *    phải cách tính path — mới là cơ chế THẬT SỰ đảm bảo file có mặt trong
 *    bundle deploy. Đây là config Next.js chính thức cho đúng lớp vấn đề
 *    "sibling asset bị bỏ sót khỏi bundle deploy", không phải workaround
 *    filesystem tự chế. */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// pd.mjs gọi `import(this.workerSrc)` (dynamic ESM import) — trên Windows
// (local dev/build/test), 1 path tuyệt đối kiểu "D:\...\pdf.worker.mjs" bị
// Node hiểu NHẦM "D:" là URL scheme ("Received protocol 'd:'"), KHÔNG phải ổ
// đĩa — đã verify bằng chạy test thật, không suy đoán. `pathToFileURL()` là
// API Node CHUẨN chuyển filesystem path thành `file://` URL hợp lệ trên CẢ
// Windows lẫn POSIX (Vercel/Linux), an toàn cho dynamic import() ở mọi nền.
const workerPath = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs');
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

export { pdfjsLib };
