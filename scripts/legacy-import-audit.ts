/**
 * READ-ONLY audit for customers created by pre-Import-Batch Excel imports
 * (import_batch_id IS NULL) that may have been corrupted by the old
 * fixed-column-index parser (fixed in commit "map customer excel import by
 * headers"). Never writes, never deletes. Prints a report for an Admin to
 * review manually before deciding what — if anything — to clean up.
 *
 * Multiple independent signals are combined (per row) instead of relying on
 * a single heuristic, exactly as required — this script never decides on
 * its own that a row is "bad"; it only surfaces evidence.
 *
 *   tsx --env-file=.env.local scripts/legacy-import-audit.ts
 *   tsx --env-file=.env.local scripts/legacy-import-audit.ts --json   (machine-readable output)
 */
import { prisma } from '../src/lib/db/client';
import { getDuAn, getNhanVien, getPipeline } from '../src/lib/data-access';
import { customerDeleteBlockReason } from '../src/lib/crm-auth';
import { toKhachHang } from '../src/lib/repository/postgresql/customer.repo';

const AS_JSON = process.argv.includes('--json');
const VN_PHONE_SHAPE = /^0\d{9}$/;

interface CandidateRow {
  id_khach_hang: string;
  ten_KH: string;
  so_dien_thoai: string;
  created_at: string;
  signals: string[];
  hasCrmActivity: boolean;
  crmActivitySummary: string;
  deletionEligible: boolean;
  deletionBlockReason: string | null;
}

async function main() {
  const [legacyRows, employees, projects, pipelines] = await Promise.all([
    prisma.khachHang.findMany({ where: { import_batch_id: null }, orderBy: { created_at: 'asc' } }),
    getNhanVien(),
    getDuAn(),
    getPipeline(),
  ]);

  const employeeNames = new Set(employees.map(e => e.ho_ten));
  const projectNames = new Set(projects.map(p => p.ten_du_an));

  const candidates: CandidateRow[] = [];

  for (const row of legacyRows) {
    const kh = toKhachHang(row);
    const signals: string[] = [];

    const phoneShapeOk = VN_PHONE_SHAPE.test(kh.so_dien_thoai || '');
    if (!phoneShapeOk) signals.push(`SĐT không đúng định dạng VN ("${kh.so_dien_thoai}")`);

    if (kh.sale_phu_trach && !employeeNames.has(kh.sale_phu_trach)) {
      signals.push(`sale_phu_trach="${kh.sale_phu_trach}" không khớp nhân viên nào hiện có`);
    }
    if (kh.du_an && !projectNames.has(kh.du_an)) {
      signals.push(`du_an="${kh.du_an}" không khớp dự án nào hiện có`);
    }
    // Ghi chú/nhu cầu bị nhồi nhiều field cách nhau bởi " | " là dấu hiệu đặc trưng
    // của buildNhuCau() trong parser cũ (đã bị xoá) — không phải free-text bình thường.
    if (kh.nhu_cau && kh.nhu_cau.includes(' | ') && /Dịch vụ:|Tài chính:|Quan tâm:|Tầng:|Vay:/.test(kh.nhu_cau)) {
      signals.push('nhu_cau có định dạng ghép cột đặc trưng của parser cũ (buildNhuCau)');
    }

    if (signals.length === 0) continue; // không có bằng chứng bất thường -> không phải candidate

    const hasCrmActivity = Number(kh.so_lan_lien_he || 0) > 0
      || Boolean(kh.lich_su_cham_soc && kh.lich_su_cham_soc !== '[]')
      || Boolean(kh.lich_su_ban_giao && kh.lich_su_ban_giao !== '[]')
      || (kh.trang_thai_ban_giao ?? 'Chưa bàn giao') !== 'Chưa bàn giao'
      || pipelines.some(p => p.id_khach_hang === kh.id_khach_hang);

    const blockReason = customerDeleteBlockReason(kh, pipelines);

    candidates.push({
      id_khach_hang: kh.id_khach_hang,
      ten_KH: kh.ten_KH,
      so_dien_thoai: kh.so_dien_thoai,
      created_at: row.created_at.toISOString(),
      signals,
      hasCrmActivity,
      crmActivitySummary: hasCrmActivity
        ? `so_lan_lien_he=${kh.so_lan_lien_he ?? 0}, trang_thai_ban_giao=${kh.trang_thai_ban_giao ?? 'Chưa bàn giao'}, pipeline=${pipelines.some(p => p.id_khach_hang === kh.id_khach_hang) ? 'có' : 'không'}`
        : 'không có hoạt động CRM nào',
      deletionEligible: !blockReason,
      deletionBlockReason: blockReason,
    });
  }

  if (AS_JSON) {
    console.log(JSON.stringify({ totalLegacy: legacyRows.length, candidateCount: candidates.length, candidates }, null, 2));
    return;
  }

  console.log(`Tổng customer legacy (import_batch_id = NULL): ${legacyRows.length}`);
  console.log(`Candidate có dấu hiệu bất thường: ${candidates.length}\n`);

  for (const c of candidates) {
    console.log(`— ${c.id_khach_hang} | ${c.ten_KH} | ${c.so_dien_thoai} | created_at=${c.created_at}`);
    for (const s of c.signals) console.log(`    dấu hiệu: ${s}`);
    console.log(`    hoạt động CRM: ${c.crmActivitySummary}`);
    console.log(`    đủ điều kiện xóa theo guard hiện tại: ${c.deletionEligible ? 'CÓ' : `KHÔNG (${c.deletionBlockReason})`}`);
    console.log('');
  }

  console.log('--- Đây là audit READ-ONLY. Không có gì bị xóa hay sửa. ---');
  console.log('Nếu muốn xóa, Admin tự chọn từng candidate đủ điều kiện và dùng "Xóa đã chọn" hiện có trên trang Khách hàng.');
}

main().finally(() => prisma.$disconnect());
