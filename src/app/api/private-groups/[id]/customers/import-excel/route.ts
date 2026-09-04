import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getKhachHang } from '@/lib/data-access';
import { getCrmSessionUser } from '@/lib/crm-auth';
import { canViewPrivateGroup } from '@/lib/private-group-auth';
import {
  getPrivateGroup, listPrivateGroupMembers, importCustomersToPrivateGroupTransactional,
  GroupNotAllowedError, type PrivateGroupImportRow,
} from '@/lib/crm-funnel/private-group';
import { classifyRow, detectDuplicateNameWarnings, findImportSheets, phoneKey, type ExcelColumnMap } from '@/lib/khach-hang-excel-import';
import { TransactionalCrmRequiredError } from '@/lib/crm-funnel/transactional-workflow';

// File nhỏ (data 1 Sale tự khai thác, KHÔNG phải Dataset hàng nghìn dòng) —
// không cần chunk/checkpoint như /api/khach-hang/import-excel, nhưng vẫn đặt
// timeout riêng rộng hơn mặc định phòng file vài trăm dòng x transaction/dòng.
export const maxDuration = 30;

export interface PrivateGroupImportExcelResult {
  success: boolean;
  totalRows: number;
  imported: number;
  duplicateInFile: number;
  alreadyExists: number;
  invalid: number;
  errors: number;
  importedList: string[];
  duplicateInFileList: { ten_KH: string; so_dien_thoai: string }[];
  alreadyExistsList: { ten_KH: string; so_dien_thoai: string }[];
  invalidList: { row: number; reason: string; sheet: string }[];
  errorList: { ten_KH: string; error: string }[];
  duplicateNameWarnings: string[];
}

// POST /api/private-groups/[id]/customers/import-excel — import hàng loạt
// Customer, TỰ ĐỘNG gắn vào ĐÚNG Nhóm riêng đang mở (group xác định qua URL,
// KHÔNG cho chọn nhóm khác) — cùng nguyên tắc "+ Thêm khách hàng" từ group
// detail (KHÔNG phải Import Excel chung ở /khach-hang: route đó Admin-only +
// bắt buộc chọn Dataset, 2 tính năng hoàn toàn độc lập).
//
// TÁI DÙNG NGUYÊN VẸN pipeline parse/classify của Import Excel chung
// (findImportSheets/classifyRow/phoneKey/detectDuplicateNameWarnings, xem
// khach-hang-excel-import.ts) — CHỈ khác điểm ghi: mỗi dòng 'ready' vừa tạo
// Customer VỪA gắn PrivateGroupCustomer ngay (importCustomersToPrivateGroupTransactional),
// KHÔNG có Dataset/Import Batch (Private Group độc lập khỏi 2 hệ đó).
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCrmSessionUser();
  if (!user) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  try {
    const { id } = await context.params;
    const group = await getPrivateGroup(id);
    if (!group) return NextResponse.json({ success: false, error: 'Không tìm thấy Nhóm riêng' }, { status: 404 });
    const members = await listPrivateGroupMembers(id);
    if (!canViewPrivateGroup(user, group, members)) {
      return NextResponse.json({ success: false, error: 'Không có quyền xem Nhóm riêng này' }, { status: 403 });
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (e: unknown) {
      return NextResponse.json({ success: false, error: 'Không đọc được form data: ' + (e instanceof Error ? e.message : String(e)) }, { status: 400 });
    }

    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ success: false, error: 'Thiếu file Excel' }, { status: 400 });

    let buffer: Buffer;
    try {
      buffer = Buffer.from(await file.arrayBuffer());
    } catch (e: unknown) {
      return NextResponse.json({ success: false, error: 'Không đọc được file: ' + (e instanceof Error ? e.message : String(e)) }, { status: 400 });
    }

    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buffer, { type: 'buffer' });
    } catch (e: unknown) {
      return NextResponse.json(
        { success: false, error: 'File không phải định dạng Excel hợp lệ (.xlsx/.xls): ' + (e instanceof Error ? e.message : String(e)) },
        { status: 422 }
      );
    }

    // Quét MỌI sheet — cùng lý do với Import Excel chung (1 workbook có thể
    // có nhiều sheet dữ liệu thật xen giữa sheet mẫu/rỗng, xem findImportSheets).
    const sheets = wb.SheetNames.map(sheetName => ({
      sheetName,
      rows: XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' }) as unknown[][],
    }));
    const resolvedSheets = findImportSheets(sheets);
    if (resolvedSheets.length === 0) {
      return NextResponse.json({
        success: false,
        error: `File không có dữ liệu phù hợp để import: không tìm thấy sheet nào có cột "Tên"/"Tên KH" và cột "SĐT"/"Số điện thoại" CÙNG một dòng tiêu đề (đã quét ${sheets.length} sheet: ${wb.SheetNames.join(', ') || '(không có sheet)'}). Đặt tên cột theo mẫu: Tên/Tên KH/Tên khách hàng/Họ tên/Tên NK, SĐT/Số điện thoại/Điện thoại/Phone (có thể đánh số 1, 2...), Email (tuỳ chọn).`,
      }, { status: 422 });
    }

    interface WorkRow { sheetName: string; columns: ExcelColumnMap; row: readonly unknown[]; excelRow: number }
    const workRows: WorkRow[] = [];
    for (const sheet of resolvedSheets) {
      const sheetDataRows = sheet.rows.slice(sheet.headerRowIndex + 1);
      sheetDataRows.forEach((row, i) => {
        workRows.push({ sheetName: sheet.sheetName, columns: sheet.columns, row, excelRow: sheet.headerRowIndex + i + 2 });
      });
    }
    if (workRows.length === 0) {
      return NextResponse.json({ success: false, error: 'File không có dòng dữ liệu ở các sheet hợp lệ' }, { status: 422 });
    }

    // Dedupe theo phoneKey — GIỐNG HỆT Import Excel chung: snapshot DB TRƯỚC
    // khi xử lý dòng nào, cộng dồn seenInFilePhoneKeys khi phân loại 'ready'
    // (không chờ ghi DB xong) để 2 dòng trùng SĐT trong CÙNG file vẫn nhận
    // diện đúng dòng thứ 2 là duplicate_in_file.
    const existing = await getKhachHang();
    const existingDbPhoneKeys = new Set(existing.map(kh => phoneKey(kh.so_dien_thoai)));
    const seenInFilePhoneKeys = new Set<string>();

    const readyRows: PrivateGroupImportRow[] = [];
    const duplicateInFileList: { ten_KH: string; so_dien_thoai: string }[] = [];
    const alreadyExistsList: { ten_KH: string; so_dien_thoai: string }[] = [];
    const invalidList: { row: number; reason: string; sheet: string }[] = [];

    for (const { sheetName, columns, row, excelRow } of workRows) {
      const classification = classifyRow(row, columns, existingDbPhoneKeys, seenInFilePhoneKeys);
      if (classification.status === 'blank') continue;
      if (classification.status === 'invalid') {
        invalidList.push({ row: excelRow, reason: classification.reason, sheet: sheetName });
        continue;
      }
      if (classification.status === 'already_exists') {
        alreadyExistsList.push({ ten_KH: classification.ten_KH, so_dien_thoai: classification.so_dien_thoai });
        continue;
      }
      if (classification.status === 'duplicate_in_file') {
        duplicateInFileList.push({ ten_KH: classification.ten_KH, so_dien_thoai: classification.so_dien_thoai });
        continue;
      }
      seenInFilePhoneKeys.add(phoneKey(classification.so_dien_thoai));
      readyRows.push({ ten_KH: classification.ten_KH, so_dien_thoai: classification.so_dien_thoai, email: classification.email });
    }

    const duplicateNameWarnings = detectDuplicateNameWarnings(readyRows);

    // Actor có thực sự Leader/member của ĐÚNG group này không -> validate BÊN
    // TRONG importCustomersToPrivateGroupTransactional (GroupNotAllowedError
    // nếu không) — canViewPrivateGroup ở trên chỉ gate "xem được", KHÔNG phải
    // "được ghi" (cùng ranh giới READ/WRITE với add đơn, xem private-group.ts).
    const result = await importCustomersToPrivateGroupTransactional({ actor: user, groupId: id, rows: readyRows });

    return NextResponse.json({
      success: true,
      totalRows: workRows.length,
      imported: result.imported.length,
      duplicateInFile: duplicateInFileList.length,
      alreadyExists: alreadyExistsList.length,
      invalid: invalidList.length,
      errors: result.errors.length,
      importedList: result.imported,
      duplicateInFileList,
      alreadyExistsList,
      invalidList,
      errorList: result.errors,
      duplicateNameWarnings,
    } satisfies PrivateGroupImportExcelResult);
  } catch (error: unknown) {
    if (error instanceof GroupNotAllowedError) return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    if (error instanceof TransactionalCrmRequiredError) return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    console.error('[PrivateGroup import-excel] Unexpected error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi server khi import' }, { status: 500 });
  }
}
