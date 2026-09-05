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
  // pdfjs-dist (dùng server-side trong tmb-optimizer.ts/tmb-indexer.ts) tự
  // dynamic-import worker module của chính nó lúc chạy trong Node — webpack
  // bundle lại code đó vào .next/.../vendor-chunks/ làm sai lệch đường dẫn
  // relative nó tự tìm, gây lỗi "Setting up fake worker failed: Cannot find
  // module ...pdf.worker.mjs". Loại pdfjs-dist khỏi bundle server (giữ
  // nguyên trong node_modules, Node tự require lúc runtime) để nó tự resolve
  // đúng file thật của chính nó.
  serverExternalPackages: ['pdfjs-dist'],
};

export default withPWA(nextConfig);
