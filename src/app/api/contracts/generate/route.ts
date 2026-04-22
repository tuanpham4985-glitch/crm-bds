import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

export async function POST(req: Request) {
  try {
    const data = await req.json();

    const templateFileName = data.template_file || "contract-template.docx";
    const filePath = path.join(
      process.cwd(),
      "templates",
      templateFileName
    );

    const content = fs.readFileSync(filePath, "binary");

    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    // Map all fields from contract + employee data
    doc.setData({
      // Contract fields
      so_hop_dong: data.so_hop_dong || '',
      loai_hop_dong: data.contract_type || '',
      ngay_bat_dau: data.ngay_bat_dau || '',
      ngay_ket_thuc: data.ngay_ket_thuc || '',
      luong_co_ban: data.luong_co_ban || '',

      // Signing date parts
      ngay_ky: data.ngay_ky || new Date().getDate().toString(),
      thang_ky: data.thang_ky || (new Date().getMonth() + 1).toString(),
      nam_ky: data.nam_ky || new Date().getFullYear().toString(),

      // Employee fields
      ten_nhan_vien: data.ten_nhan_vien || data.ten_ctv || '',
      ten_ctv: data.ten_ctv || data.ten_nhan_vien || '',
      so_cccd: data.so_cccd || '',
      dia_chi: data.dia_chi || data.hk_thuong_tru || '',
      ngay_thang_nam_cap: data.ngay_thang_nam_cap || '',
      noi_cap: data.noi_cap || '',
      hk_thuong_tru: data.hk_thuong_tru || data.dia_chi || '',
      ma_so_thue: data.ma_so_thue || '',

      // Bank info
      so_tk_ngan_hang: data.so_tk_ngan_hang || '',
      ten_ngan_hang_thu_huong: data.ten_ngan_hang_thu_huong || '',

      // HRM info
      chuc_danh: data.chuc_danh || '',
      khoi_lam_viec: data.department === 'KD' ? 'Khối Kinh doanh' : 'Khối BO',
      phong_KD: data.phong_KD || '',
    });

    doc.render();

    // ✅ QUAN TRỌNG: dùng nodebuffer
    const buffer = doc.getZip().generate({
      type: "nodebuffer",
    });

    const fileName = `hop-dong-${data.so_hop_dong || 'draft'}.docx`;

    // ✅ FIX TRIỆT ĐỂ lỗi TypeScript
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename=${fileName}`,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Generate failed" },
      { status: 500 }
    );
  }
}