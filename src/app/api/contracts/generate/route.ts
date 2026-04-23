import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

export const runtime = 'nodejs';

/**
 * Helper: Inspect XML for split tags or common Word artifacts
 * that break Docxtemplater tags like {{field_name}}
 */
function inspectXMLTags(zip: PizZip) {
  try {
    const docXml = zip.file("word/document.xml")?.asText();
    if (!docXml) return;

    console.log("--- Template Tag Inspection ---");
    
    // Find all raw occurrences of {{ and }} to see if they are split
    const openTags = (docXml.match(/{{/g) || []).length;
    const closeTags = (docXml.match(/}}/g) || []).length;
    
    console.log(`Total {{ found: ${openTags}`);
    console.log(`Total }} found: ${closeTags}`);

    if (openTags !== closeTags) {
      console.error("CRITICAL: Mismatch between open and close tags count!");
    }

    // Detect tags split by XML elements (e.g., {{ <w:p> field_name }} )
    // This is a common issue when Word adds formatting or proofing marks inside a tag
    const splitTagRegex = /{{[^}]*<[^>]+>[^}]*}}/g;
    const splitTags = docXml.match(splitTagRegex);
    if (splitTags) {
      console.error("WARNING: Found tags split by XML elements (broken tags):");
      splitTags.forEach(tag => console.error(` -> "${tag}"`));
      console.info("TIP: To fix, select the whole tag in Word, Cut (Ctrl+X) and Paste Plain Text (Ctrl+Shift+V).");
    }

    // List all clean tags
    const cleanTagRegex = /{{([^{}]+)}}/g;
    let match;
    const detectedTags = new Set();
    while ((match = cleanTagRegex.exec(docXml)) !== null) {
      detectedTags.add(match[1].trim());
    }
    console.log("Detected Clean Tags:", Array.from(detectedTags));
    console.log("-------------------------------");
  } catch (err) {
    console.error("Failed to inspect XML:", err);
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json();
    
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

    const filePath = path.join(process.cwd(), "public", "templates", templateFileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Template not found at: ${filePath}`);
    }

    const content = fs.readFileSync(filePath);
    const zip = new PizZip(content);

    // DEBUG: Inspect XML structure for broken tags
    inspectXMLTags(zip);

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      // Error handling configuration
      delimiters: { start: "{{", end: "}}" },
    });

    const exportData = {
      so_hop_dong: data.so_hop_dong || '',
      loai_hop_dong: data.contract_type || '',
      ngay_bat_dau: data.ngay_bat_dau || '',
      ngay_ket_thuc: data.ngay_ket_thuc || '',
      luong_co_ban: data.luong_co_ban || '',
      ngay_ky: data.ngay_ky || new Date().getDate().toString(),
      thang_ky: data.thang_ky || (new Date().getMonth() + 1).toString(),
      nam_ky: data.nam_ky || new Date().getFullYear().toString(),
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
      so_tk_ngan_hang: data.so_tk_ngan_hang || '',
      ten_ngan_hang_thu_huong: data.ten_ngan_hang_thu_huong || '',
      chuc_danh: data.employee_type || '',
      khoi_lam_viec: data.department === 'KD' ? 'Khối Kinh doanh' : 'Khối BO',
      phong_KD: data.phong_KD || '',
    };

    try {
      doc.setData(exportData);
      doc.render();
    } catch (renderError: any) {
      // DEEP DEBUG: Log all specific template errors
      console.error("--- DOCX RENDER ERROR DETAILS ---");
      if (renderError.properties && renderError.properties.errors) {
        renderError.properties.errors.forEach((err: any) => {
          console.error(`Error ID: ${err.id}`);
          console.error(`Message: ${err.message}`);
          if (err.properties && err.properties.xtag) {
            console.error(`Broken Tag: "${err.properties.xtag}"`);
            console.error(`Context: ${err.properties.context}`);
          }
          console.error("---");
        });
      } else {
        console.error(renderError);
      }
      throw renderError;
    }

    const outputBuffer = doc.getZip().generate({
      type: "nodebuffer",
      compression: "DEFLATE",
    });

    const fileName = `hop-dong-${data.so_hop_dong || 'draft'}.docx`;

    return new Response(new Uint8Array(outputBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      },
    });
  } catch (error: any) {
    console.error('[Contract Generate] API Error:', error);
    
    // Return specific error message if it's a multi-error
    let detailMessage = error.message;
    if (error.properties && error.properties.errors) {
      detailMessage = error.properties.errors.map((e: any) => e.message).join(" | ");
    }

    return NextResponse.json(
      { 
        error: "Template generation failed", 
        message: detailMessage,
        hint: "Check server logs for broken tags list (split by XML elements)."
      },
      { status: 500 }
    );
  }
}