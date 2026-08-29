import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessCskh } from '../../src/lib/crm-access-authority';

// REMEDIATION — Unify CSKH Access Authority: canAccessCskh() là NGUỒN THẬT
// DUY NHẤT cho "được thấy mục CSKH ở Sidebar VÀ được vào /phan-khach" — cả
// /api/crm-access/route.ts (server, resolve tín hiệu từ DB) lẫn
// /phan-khach/page.tsx (client, chỉ đọc canPhanKhach đã resolve qua hook)
// đều phải khớp CHÍNH XÁC hành vi của hàm thuần này. 6 scenario dưới đây là
// đúng 6 case được yêu cầu trong spec remediation.

const baseSignals = {
  isAdmin: false,
  crmModuleEnabled: true,
  vaiTro: 'Sale' as string | null,
  hasLegacyProjectAccess: false,
  hasCampaignCskhAccess: false,
};

test('Sale chưa được gán data nào (không Dự án, không Campaign) — vẫn được phép, vì vai_tro === "Sale" tự nó đã đủ (blanket, khớp /phan-khach cũ)', () => {
  assert.equal(canAccessCskh({ ...baseSignals, vaiTro: 'Sale', hasLegacyProjectAccess: false, hasCampaignCskhAccess: false }), true);
});

test('Sale có Campaign assignment (CampaignMembership.telesale_id) — được phép (đã đúng bởi nhánh vai_tro, Campaign chỉ củng cố thêm, không cần thiết trong case này nhưng vẫn phải true)', () => {
  assert.equal(canAccessCskh({ ...baseSignals, vaiTro: 'Sale', hasLegacyProjectAccess: false, hasCampaignCskhAccess: true }), true);
});

test('Campaign owner/Leader KHÔNG có vai_tro "Sale" (VD HR quản lý Campaign) — vẫn được phép nhờ nhánh hasCampaignCskhAccess — đây chính là gap mà remediation này vá (trước đây canAccessPage cũ chỉ check vai_tro Sale sẽ CHẶN NHẦM người này dù Sidebar đã cho thấy mục CSKH)', () => {
  assert.equal(canAccessCskh({ ...baseSignals, vaiTro: 'HR', hasLegacyProjectAccess: false, hasCampaignCskhAccess: true }), true);
});

test('HR/non-Sale không có bất kỳ tín hiệu nào (không vai_tro Sale, không Dự án, không Campaign) — KHÔNG được phép', () => {
  assert.equal(canAccessCskh({ ...baseSignals, vaiTro: 'HR', hasLegacyProjectAccess: false, hasCampaignCskhAccess: false }), false);
});

test('Admin — luôn được phép, bỏ qua MỌI điều kiện khác (kể cả CRM Module đang tắt)', () => {
  assert.equal(canAccessCskh({ isAdmin: true, crmModuleEnabled: false, vaiTro: 'HR', hasLegacyProjectAccess: false, hasCampaignCskhAccess: false }), true);
});

test('CRM Module đang TẮT — non-admin bị chặn hoàn toàn dù vai_tro là Sale / có Dự án / có Campaign (module gate luôn AND ở ngoài, không bị bất kỳ nhánh OR nào bypass)', () => {
  assert.equal(canAccessCskh({ isAdmin: false, crmModuleEnabled: false, vaiTro: 'Sale', hasLegacyProjectAccess: true, hasCampaignCskhAccess: true }), false);
});

test('Non-admin có phạm vi Dự án cũ (hasLegacyProjectAccess) nhưng KHÔNG phải Sale, KHÔNG có Campaign — vẫn được phép (giữ nguyên hành vi legacy trước remediation)', () => {
  assert.equal(canAccessCskh({ ...baseSignals, vaiTro: 'HR', hasLegacyProjectAccess: true, hasCampaignCskhAccess: false }), true);
});
