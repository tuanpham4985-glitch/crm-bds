import { NextResponse } from 'next/server';
import { isTmbUploadStorageConfigured } from '@/lib/tmb-storage';

// Trả về thông tin public để UI hướng dẫn user share sheet + trạng thái cấu
// hình object storage cho TMB self-service upload (Simple Mode dùng để báo rõ
// "Chưa cấu hình Object Storage" thay vì để Admin bấm rồi lỗi khó hiểu giữa
// chừng — KHÔNG lộ giá trị token, chỉ 1 boolean).
export async function GET() {
  return NextResponse.json({
    success: true,
    sa_email: process.env.GOOGLE_CLIENT_EMAIL || '',
    tmb_storage_configured: isTmbUploadStorageConfigured(),
  });
}
