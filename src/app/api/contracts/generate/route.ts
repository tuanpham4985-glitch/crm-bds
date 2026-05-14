import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

export const runtime = 'nodejs';

const TEMPLATES_DIR = path.join(process.cwd(), "public", "templates");

/**
 * Helper: Inspect XML for split tags or common Word artifacts
 * that break Docxtemplater tags like {{field_name}}
 */
function inspectXMLTags(zip: PizZip) {
  try {
    const docXml = zip.file("word/document.xml")?.asText();
    if (!docXml) return;

    console.log("--- Template Tag Inspection ---");
    const openTags = (docXml.match(/{{/g) || []).length;
    const closeTags = (docXml.match(/}}/g) || []).length;
    console.log(`Total {{ found: ${openTags}`);
    console.log(`Total }} found: ${closeTags}`);
    if (openTags !== closeTags) {
      console.error("CRITICAL: Mismatch between open and close tags count!");
    }
    const splitTagRegex = /{{[^}]*<[^>]+>[^}]*}}/g;
    const splitTags = docXml.match(splitTagRegex);
    if (splitTags) {
      console.error("WARNING: Found tags split by XML elements (broken tags):");
      splitTags.forEach(tag => console.error(` -> "${tag}"`));
    }
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

/**
 * Generate a .docx buffer from a template file + data using Docxtemplater.
 */
function generateDocx(templateFileName: string, exportData: Record<string, string>): Buffer {
  const filePath = path.join(TEMPLATES_DIR, templateFileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Template not found at: ${filePath}`);
  }
  const content = fs.readFileSync(filePath);
  const zip = new PizZip(content);
  inspectXMLTags(zip);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
  });

  try {
    doc.setData(exportData);
    doc.render();
  } catch (renderError: any) {
    console.error("--- DOCX RENDER ERROR DETAILS ---");
    if (renderError.properties?.errors) {
      renderError.properties.errors.forEach((err: any) => {
        console.error(`Error ID: ${err.id}`);
        console.error(`Message: ${err.message}`);
        if (err.properties?.xtag) {
          console.error(`Broken Tag: "${err.properties.xtag}"`);
        }
      });
    } else {
      console.error(renderError);
    }
    throw renderError;
  }

  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
}

/**
 * Try to process a file (including .doc) as an OOXML template with Docxtemplater.
 * Many .doc files are actually OOXML zip-based format — Docxtemplater can handle them.
 * Returns processed buffer if successful, null if the file is truly binary .doc.
 */
function tryProcessTemplate(
  filePath: string,
  exportData: Record<string, string>
): { buffer: Buffer; isDocx: boolean } | null {
  try {
    const content = fs.readFileSync(filePath);
    const zip = new PizZip(content);

    // Check if it's a valid OOXML zip (has word/document.xml)
    if (!zip.file("word/document.xml")) {
      console.log(`[Generate] ${path.basename(filePath)} is binary .doc (no OOXML structure), serving as-is`);
      return null;
    }

    console.log(`[Generate] ${path.basename(filePath)} is OOXML-compatible, applying template...`);

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: "{{", end: "}}" },
      // Use nullGetter to avoid errors for missing tags — leave them blank
      nullGetter(part: any) {
        if (!part.module) return "";
        return "";
      },
    });

    doc.setData(exportData);

    try {
      doc.render();
    } catch (renderErr: any) {
      // Log render errors but don't throw — some tags may be complex
      console.warn(`[Generate] Template render warning for ${path.basename(filePath)}:`, renderErr.message);
      if (renderErr.properties?.errors) {
        renderErr.properties.errors.forEach((e: any) =>
          console.warn(`  - Tag error: ${e.id} — ${e.message}`)
        );
      }
      // Still try to get output even with partial errors
    }

    const outputBuffer = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
    console.log(`[Generate] ✅ Template processed: ${path.basename(filePath)} → ${outputBuffer.length} bytes`);
    return { buffer: outputBuffer, isDocx: true };

  } catch (err: any) {
    console.warn(`[Generate] Cannot process ${path.basename(filePath)} as template (${err.message}), serving as static file`);
    return null;
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
      'PHIẾU NHÂN SỰ': 'MAU_VIC_PHIEU_NHAN_SU.docx',
    };

    let templateFileName = data.template_file || "MAU_VIC_HDTV_KD.docx";
    if (TEMPLATE_MAP[templateFileName]) {
      templateFileName = TEMPLATE_MAP[templateFileName];
    }

    // ---- Export data for template variables ----
    const exportData: Record<string, string> = {
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
      so_dien_thoai: data.so_dien_thoai || '',
      email: data.email || '',
      Email: data.email || '',
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
      phong_ban: data.phong_KD || '',
      Phong_Ban: data.phong_KD || '',
    };

    // ---- 1. Generate main contract .docx ----
    const mainDocxBuffer = generateDocx(templateFileName, exportData);
    const mainFileName = `${data.so_hop_dong || 'hop-dong'}.docx`;

    // ---- 2. Determine additional documents ----
    // Rule 1: Cam kết bảo mật → ALL standard contracts
    const contractType = (data.contract_type || '').toLowerCase();
    const needsBaoMat =
      contractType.includes('chính thức') ||
      contractType.includes('thử việc') ||
      contractType.includes('học viên') ||
      !!templateFileName;

    // Rule 2: Cam kết ứng xử → only Khối KD
    const isKD = data.department === 'KD';

    /**
     * Resolve template file: prefer .docx (OOXML) over .doc (OLE2 binary).
     * OLE2 binary .doc files CANNOT be processed by PizZip/Docxtemplater.
     * Always save cam kết templates as .docx in Word before deploying.
     */
    function resolveTemplateFile(baseName: string): { fileName: string; displayName: string } | null {
      const docxName = baseName.replace(/\.doc$/, '.docx');
      const docxPath = path.join(TEMPLATES_DIR, docxName);
      const docPath  = path.join(TEMPLATES_DIR, baseName);

      if (fs.existsSync(docxPath)) {
        console.log(`[Generate] Using .docx version: ${docxName}`);
        return { fileName: docxName, displayName: docxName };
      }
      if (fs.existsSync(docPath)) {
        // Check if it's OLE2 binary (D0 CF 11 E0) — cannot process
        const header = fs.readFileSync(docPath).slice(0, 4);
        const isOLE2 = header[0] === 0xD0 && header[1] === 0xCF;
        if (isOLE2) {
          console.warn(
            `[Generate] ⚠️  ${baseName} is OLE2 binary .doc — cannot fill {{tags}}. ` +
            `Please open in Word and Save As .docx: ${docxName}`
          );
        }
        return { fileName: baseName, displayName: baseName };
      }
      console.warn(`[Generate] Template not found: ${baseName} or ${docxName}`);
      return null;
    }

    const additionalFiles: Array<{ fileName: string; displayName: string }> = [];

    if (needsBaoMat) {
      const f = resolveTemplateFile('MAU_CAM_KET_BAO_MAT_THONG_TIN.doc');
      if (f) additionalFiles.push(f);
    }
    if (isKD) {
      const f = resolveTemplateFile('MAU_CAM_KET_UNG_XU_NVKD.doc');
      if (f) additionalFiles.push(f);
    }

    // ---- 3. If no additional files → return single .docx (backward compat) ----
    if (additionalFiles.length === 0) {
      const fileName = mainFileName;
      return new Response(new Uint8Array(mainDocxBuffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
        },
      });
    }

    // ---- 4. Bundle all files into a ZIP ----
    const outputZip = new PizZip();

    // Add main contract
    outputZip.file(mainFileName, mainDocxBuffer);

    // Add additional files — try template processing first, fallback to static
    for (const additional of additionalFiles) {
      const additionalPath = path.join(TEMPLATES_DIR, additional.fileName);
      if (!fs.existsSync(additionalPath)) {
        console.warn(`[Generate] Additional template not found (skipped): ${additionalPath}`);
        continue;
      }

      // Try to process as OOXML template (fill {{tags}})
      const processed = tryProcessTemplate(additionalPath, exportData);
      if (processed) {
        // Successfully processed — save as .docx (with filled data)
        const outName = additional.displayName.replace(/\.doc$/, '.docx');
        outputZip.file(outName, processed.buffer);
        console.log(`[Generate] ✅ Added processed template: ${outName}`);
      } else {
        // Fallback: serve as static file
        const fileContent = fs.readFileSync(additionalPath);
        outputZip.file(additional.displayName, fileContent);
        console.log(`[Generate] 📄 Added static file: ${additional.displayName}`);
      }
    }

    const zipBuffer = outputZip.generate({
      type: "nodebuffer",
      compression: "DEFLATE",
    });

    const zipFileName = `ho-so-${data.so_hop_dong || 'hop-dong'}.zip`;

    console.log(`[Generate] ZIP created: ${zipFileName} with ${1 + additionalFiles.length} file(s)`);

    return new Response(new Uint8Array(zipBuffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(zipFileName)}"`,
        "X-File-Count": String(1 + additionalFiles.length),
      },
    });

  } catch (error: any) {
    console.error('[Contract Generate] API Error:', error);
    let detailMessage = error.message;
    if (error.properties?.errors) {
      detailMessage = error.properties.errors.map((e: any) => e.message).join(" | ");
    }
    return NextResponse.json(
      {
        error: "Template generation failed",
        message: detailMessage,
        hint: "Check server logs for broken tags list (split by XML elements).",
      },
      { status: 500 }
    );
  }
}