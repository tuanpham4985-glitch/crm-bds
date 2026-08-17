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
};

export default withPWA(nextConfig);
