import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  LEAD_QUALITY_RANK_LABELS, QUALIFICATION_STATUS_LABELS,
  leadQualityRankLabel, qualificationStatusLabel,
} from '../../src/lib/crm-funnel/quality-labels';

// DATA TIỀM NĂNG — VIỆT HÓA UI: pure label mapping (display layer only,
// KHÔNG đổi giá trị enum thật lưu trên KhachHang.qualification_status/
// lead_quality_rank hay filter contract QualifiedLeadFilters.rank).

test('qualificationStatusLabel: map đủ 6 giá trị enum thật (QualificationStatus) sang tiếng Việt ngắn gọn', () => {
  assert.equal(qualificationStatusLabel('RAW'), 'Chưa chăm sóc');
  assert.equal(qualificationStatusLabel('CONTACTED'), 'Đã liên hệ');
  assert.equal(qualificationStatusLabel('INTERESTED'), 'Quan tâm');
  assert.equal(qualificationStatusLabel('QUALIFIED'), 'Đủ điều kiện');
  assert.equal(qualificationStatusLabel('HOT'), 'Tiềm năng cao');
  assert.equal(qualificationStatusLabel('UNQUALIFIED'), 'Chưa đủ điều kiện');
});

test('leadQualityRankLabel: map đủ 4 giá trị enum thật (LeadQualityRank) sang tiếng Việt ngắn gọn', () => {
  assert.equal(leadQualityRankLabel('HOT'), 'Tiềm năng cao');
  assert.equal(leadQualityRankLabel('QUALIFIED'), 'Đủ điều kiện');
  assert.equal(leadQualityRankLabel('WARM'), 'Tiềm năng trung bình');
  assert.equal(leadQualityRankLabel('UNQUALIFIED'), 'Chưa đủ điều kiện');
});

test('qualificationStatusLabel/leadQualityRankLabel: giá trị lạ hoặc rỗng (dữ liệu Sheets cũ) -> trả nguyên giá trị gốc, không throw, không trả rỗng bất ngờ', () => {
  assert.equal(qualificationStatusLabel(''), '');
  assert.equal(qualificationStatusLabel('SOME_LEGACY_VALUE'), 'SOME_LEGACY_VALUE');
  assert.equal(leadQualityRankLabel(''), '');
  assert.equal(leadQualityRankLabel('SOME_LEGACY_VALUE'), 'SOME_LEGACY_VALUE');
});

test('QUALIFICATION_STATUS_LABELS/LEAD_QUALITY_RANK_LABELS: đúng key set với type QualificationStatus/LeadQualityRank trong types.ts (không thiếu, không thừa)', () => {
  assert.deepEqual(Object.keys(QUALIFICATION_STATUS_LABELS).sort(), ['CONTACTED', 'HOT', 'INTERESTED', 'QUALIFIED', 'RAW', 'UNQUALIFIED']);
  assert.deepEqual(Object.keys(LEAD_QUALITY_RANK_LABELS).sort(), ['HOT', 'QUALIFIED', 'UNQUALIFIED', 'WARM']);
});

// --- UI: page.tsx không còn lộ terminology kỹ thuật/English cho end-user ---

const PAGE_PATH = 'src/app/data-chat-luong/page.tsx';

function stripJsxComments(src: string): string {
  return src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

test('data-chat-luong/page.tsx: không còn "authoritative"/"legacy" hiển thị cho user (chỉ được phép xuất hiện trong code comment, không phải trong JSX text/label)', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  const userFacing = stripJsxComments(src);
  assert.doesNotMatch(userFacing, /authoritative/i);
  assert.doesNotMatch(userFacing, /legacy/i);
});

test('data-chat-luong/page.tsx: các label/tag tiếng Anh cũ (Telesale/Score/Qualification/Handoff/Sale đơn lẻ, Lead Rank) không còn xuất hiện làm text hiển thị', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  const userFacing = stripJsxComments(src);
  assert.doesNotMatch(userFacing, />Telesale</);
  assert.doesNotMatch(userFacing, />Score</);
  assert.doesNotMatch(userFacing, />Qualification</);
  assert.doesNotMatch(userFacing, />Handoff</);
  assert.doesNotMatch(userFacing, />Pipeline</);
  assert.doesNotMatch(userFacing, /label="Telesale"/);
  assert.doesNotMatch(userFacing, /label="Sale"/, 'label "Sale" đơn lẻ phải đổi thành "Sale nhận khách" — cột này thực chất bind vào sale_nhan_khach (Sale nhận bàn giao), không phải sale_phu_trach, nên "Sale phụ trách" sẽ sai nghĩa dữ liệu');
  assert.doesNotMatch(userFacing, /label="Lead Rank"/);
  assert.doesNotMatch(userFacing, /'Qualified'/);
  assert.doesNotMatch(userFacing, /'Hot'/);
});

test('data-chat-luong/page.tsx: terminology mới đúng theo mapping yêu cầu — Sale CSKH (Telesale), Xếp hạng (Lead Rank), Trạng thái (Qualification), Bàn giao (Handoff), Giao dịch (Pipeline), Điểm (Score)', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  assert.match(src, /label="Sale CSKH"/);
  assert.match(src, /label="Xếp hạng"/);
  assert.match(src, /<th>Trạng thái<\/th>/);
  assert.match(src, /label="Bàn giao"/);
  assert.match(src, /label="Giao dịch"/);
  assert.match(src, /<th>Điểm<\/th>/);
  assert.match(src, /Bàn giao \/ Giao dịch/);
  assert.match(src, /leadQualityRankLabel\(row\.lead_quality_rank\)/, 'phải dùng label function thay vì hiển thị thẳng enum thô row.lead_quality_rank');
  assert.match(src, /qualificationStatusLabel\(row\.qualification_status\)/, 'phải dùng label function thay vì hiển thị thẳng enum thô row.qualification_status');
});

test('data-chat-luong/page.tsx: filter "rank" vẫn gửi ĐÚNG giá trị enum gốc (HOT/QUALIFIED/WARM/UNQUALIFIED) lên state/API — chỉ label hiển thị đổi qua optionLabel, không đổi filter contract', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  assert.match(src, /options=\{\['HOT', 'QUALIFIED', 'WARM', 'UNQUALIFIED'\]\}\s*optionLabel=\{leadQualityRankLabel\}/);
});

test('data-chat-luong/page.tsx: warning box đổi sang câu tiếng Việt dễ hiểu, không còn nhắc "legacy"/"đóng băng" kỹ thuật với end-user, và định hướng đúng nơi xem CSKH theo Campaign', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  const warningMatch = src.match(/background: '#fffbeb', color: '#a16207'[\s\S]{0,40}>\s*\n\s*([^<]+)</);
  assert.ok(warningMatch, 'phải tìm được nội dung warning box màu vàng');
  const warningText = warningMatch![1];
  assert.match(warningText, /Campaign được quản lý riêng tại CSKH/);
  assert.doesNotMatch(warningText, /legacy|đóng băng|authoritative/i);
});

// --- Export (Excel/Google Sheets, dùng chung quality-export.ts) ---

test('quality-export.ts: header đã Việt hóa (Điểm, Xếp hạng, Sale CSKH, Trạng thái, Trạng thái Bàn giao, Trạng thái Giao dịch) — không còn header tiếng Anh', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/quality-export.ts'), 'utf8');
  assert.match(src, /'Điểm'/);
  assert.match(src, /'Xếp hạng'/);
  assert.match(src, /'Sale CSKH'/);
  assert.match(src, /'Trạng thái'/);
  assert.match(src, /'Trạng thái Bàn giao'/);
  assert.match(src, /'Trạng thái Giao dịch'/);
  assert.doesNotMatch(src, /'Lead Score'|'Lead Rank'|'Telesale'|'Trạng thái qualification'|'Trạng thái handoff'|'Trạng thái Pipeline'/);
});

test('quality-export.ts: dùng leadQualityRankLabel/qualificationStatusLabel để dịch giá trị enum trước khi ghi ra cột "Xếp hạng"/"Trạng thái" — export không được lộ enum thô (HOT/RAW/...) ra file cho end-user', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/quality-export.ts'), 'utf8');
  assert.match(src, /leadQualityRankLabel\(row\.lead_quality_rank\)/);
  assert.match(src, /qualificationStatusLabel\(row\.qualification_status\)/);
});
