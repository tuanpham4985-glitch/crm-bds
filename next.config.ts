import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  // Nạp thêm handler Web Push (push + notificationclick) vào service worker
  workboxOptions: {
    importScripts: ["/push-sw.js"],
  },
});

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.1.25'],
  // pdfjs-dist (dùng server-side trong tmb-optimizer.ts/tmb-indexer.ts, qua
  // tmb-pdfjs-server.ts) tự dynamic-import worker module của chính nó lúc
  // chạy trong Node — webpack bundle lại code đó vào .next/.../vendor-chunks/
  // làm sai lệch đường dẫn relative nó tự tìm. Loại pdfjs-dist khỏi bundle
  // server (giữ nguyên trong node_modules, Node tự require lúc runtime) để nó
  // tự resolve đúng file thật của chính nó — layer NÀY xử lý webpack bundling,
  // KHÔNG xử lý việc Vercel Output File Tracing có include đúng file
  // pdf.worker.mjs vào bundle deploy hay không (2 vấn đề khác nhau, xem
  // outputFileTracingIncludes bên dưới cho vấn đề thứ 2).
  serverExternalPackages: ['pdfjs-dist'],
  // Bảo hiểm THỨ HAI cho đúng bug production đã audit: "Setting up fake
  // worker failed: Cannot find module .../pdf.worker.mjs" trên Vercel — dù
  // tmb-pdfjs-server.ts đã set workerSrc bằng require.resolve() tường minh
  // (cách Next.js/Vercel Output File Tracing @vercel/nft nhận diện để tự
  // include file), khai báo THÊM ở đây để chắc chắn 3 route TMB thật sự gọi
  // getDocument() server-side (analyze/optimize/index — optimize/index đều
  // gọi analyzePdf()/extractPdfUnitLabels() nội bộ) có sibling file này trong
  // bundle deploy dù nft có bỏ sót require.resolve() vì lý do gì đó. Đây là
  // config Next.js CHÍNH THỨC (outputFileTracingIncludes), không phải
  // workaround filesystem tự chế.
  outputFileTracingIncludes: {
    '/api/stacking/tmb-profiles/**': ['./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'],
  },
};

export default withPWA(nextConfig);
