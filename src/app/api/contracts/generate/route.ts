import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

export async function POST(req: Request) {
  try {
    const data = await req.json();
    
    // Mapping old filenames to new ones for backward compatibility
    const TEMPLATE_MAP: Record<string, string> = {
      'MẪU VIC_HĐTV (KHỐI BO).docx': 'MAU_VIC_HDTV_BO.docx',
      'MẪU VIC_HĐTV (KHỐI KD).docx': 'MAU_VIC_HDTV_KD.docx',
      'MẪU VIC_HĐLĐ (KHỐI BO).docx': 'MAU_VIC_HDLD_BO.docx',
      'MẪU VIC_HĐLĐ (KHỐI KD).docx': 'MAU_VIC_HDLD_KD.docx',
    };

    let templateFileName = data.template_file || "MAU_VIC_HDTV_KD.docx";
    if (TEMPLATE_MAP[templateFileName]) {
      templateFileName = TEMPLATE_MAP[templateFileName];
    }

    const filePath = path.join(
      process.cwd(),
      "public",
      "templates",
      templateFileName
    );

    const content = fs.readFileSync(filePath);
    
    // Use Uint8Array to ensure binary integrity across environments
    const zip = new PizZip(new Uint8Array(content));
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    // Build the export data object — keys MUST match .docx placeholders exactly
    const exportData = {
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

      // Employee fields from NHAN_VIEN — exact placeholder keys
      ho_ten: data.ho_ten || data.ten_nhan_vien || '',
      ten_nhan_vien: data.ten_nhan_vien || data.ho_ten || '',
      ten_ctv: data.ten_ctv || data.ho_ten || '',
      ngay_sinh: data.ngay_sinh || '',
      gioi_tinh: data.gioi_tinh || '',
      so_cccd: data.so_cccd || '',
      ngay_cap: data.ngay_cap || '',
      ngay_thang_nam_cap: data.ngay_thang_nam_cap || data.ngay_cap || '',
      noi_cap: data.noi_cap || '',
      HKTT: data.HKTT || '',
      hk_thuong_tru: data.HKTT || data.hk_thuong_tru || '',
      dia_chi: data.dia_chi || data.HKTT || '',
      ma_so_thue: data.ma_so_thue || '',

      // Bank info
      so_tk_ngan_hang: data.so_tk_ngan_hang || '',
      ten_ngan_hang_thu_huong: data.ten_ngan_hang_thu_huong || '',

      // HRM info
      chuc_danh: data.employee_type || '',
      khoi_lam_viec: data.department === 'KD' ? 'Khối Kinh doanh' : 'Khối BO',
      phong_KD: data.phong_KD || '',
    };

    console.log('[Contract Generate] data merge successful');

    doc.setData(exportData);
    doc.render();

    const outputBuffer = doc.getZip().generate({
      type: "nodebuffer",
      compression: "DEFLATE",
    });

    const fileName = `hop-dong-${data.so_hop_dong || 'draft'}.docx`;

    return new NextResponse(new Uint8Array(outputBuffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename=${fileName}`,
      },
    });
  } catch (error: any) {
    console.error('[Contract Generate] Error:', error);
    return NextResponse.json(
      { error: "Generate failed", message: error.message },
      { status: 500 }
    );
  }
}