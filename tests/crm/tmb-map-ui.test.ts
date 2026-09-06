import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync('src/app/stacking/TmbMap.tsx', 'utf8');
const pageSource = fs.readFileSync('src/app/stacking/page.tsx', 'utf8');

test('TmbMap: available unit marker stays compact so nearby units are not covered', () => {
  assert.match(source, /const MARKER_SIZE_PX = 12;/);
  assert.match(source, /border: `2px solid \$\{isSearchMatch \? '#b91c1c' : u\.available \? '#16a34a' : '#9ca3af'\}`/);
  assert.match(source, /0 0 0 3px rgba\(34,197,94,0\.28\)/);
  assert.doesNotMatch(source, /const MARKER_SIZE_PX = 18;/);
  assert.doesNotMatch(source, /0 0 0 5px rgba\(34,197,94,0\.35\)/);
});

// ─── Ô tìm mã căn (Còn hàng) — nhập mã, tự phóng tới vị trí + đổi marker đỏ ─

test('TmbMap: ô tìm mã căn CHỈ khớp căn Còn hàng (u.available), so khớp chính xác không phân biệt hoa/thường', () => {
  assert.match(source, /const \[unitSearch, setUnitSearch\] = useState\(''\);/);
  assert.match(source, /units\.find\(u => u\.available && u\.unitCode\.toLowerCase\(\) === norm\)/);
});

test('TmbMap: tìm thấy căn -> tự cuộn/zoom tới vị trí (pendingScrollTargetRef + contentPointToScroll + zoom tối thiểu SEARCH_FOCUS_ZOOM, không zoom lùi nếu đã zoom sâu hơn)', () => {
  assert.match(source, /const SEARCH_FOCUS_ZOOM = 6;/);
  assert.match(source, /pendingScrollTargetRef\.current = \{ x: matchedUnit\.viewX, y: matchedUnit\.viewY \};/);
  assert.match(source, /contentPointToScroll\(\s*matchedUnit\.viewX, matchedUnit\.viewY, effectiveScale/);
  assert.match(source, /setZoomMultiplier\(z => Math\.max\(z, SEARCH_FOCUS_ZOOM\)\);/);
});

test('TmbMap: marker khớp tìm kiếm đổi màu đỏ nổi bật (khác hẳn xanh "Còn hàng" thường), có pulse animation riêng', () => {
  assert.match(source, /background: isSearchMatch \? '#ef4444' : u\.available \? '#22c55e' : 'rgba\(156,163,175,0\.32\)',/);
  assert.match(source, /className=\{isSearchMatch \? 'tmb-search-match' : undefined\}/);
  assert.match(source, /@keyframes tmbSearchPulse/);
});

test('TmbMap: clicking a matched available marker opens the list-detail popup row', () => {
  assert.match(source, /onPointerDown=\{e => \{[\s\S]*?e\.stopPropagation\(\);[\s\S]*?\}\}/);
  assert.match(source, /onClick=\{e => \{[\s\S]*?e\.stopPropagation\(\);[\s\S]*?onOpenUnit\(u\.match\.row\);[\s\S]*?\}\}/);
  assert.match(source, /if \(u\.available && u\.match\.kind === 'matched'\) onOpenUnit\(u\.match\.row\);/);
  assert.match(pageSource, /<TmbMap[\s\S]*onOpenUnit=\{row => setSelectedListRow\(row\)\}/);
  assert.match(pageSource, /selectedListRow && \([\s\S]*<ListUnitDetailModal[\s\S]*row=\{selectedListRow\}/);
});

test('TmbMap: loads PDF as full bytes before pdf.js parses it to avoid range offset errors', () => {
  assert.match(source, /fetch\(profile\.pdfUrl, \{ cache: 'no-store' \}\)/);
  assert.match(source, /new Uint8Array\(await pdfResponse\.arrayBuffer\(\)\)/);
  assert.match(source, /pdfjs\.getDocument\(\{ data: pdfBytes \}\)/);
  assert.doesNotMatch(source, /pdfjs\.getDocument\(profile\.pdfUrl\)/);
});

// ─── Multi-project TMB profile (task hiện tại) ──────────────────────────────

test('TmbMap: KHÔNG hard-code PDF/unit của bất kỳ dự án nào — nhận toàn bộ qua prop `profile` (project-agnostic renderer, dùng chung cho nhiều dự án)', () => {
  assert.match(source, /profile: TmbMapProfile;/);
  // zIndex (thêm cho TMB Review Preview, TmbManagerPanel.tsx "Xem TMB") là
  // optional với default = 700 (giá trị cũ) — [\s\S]*? cho phép match dù có
  // hay không tham số này, miễn 4 tham số CHÍNH (profile/listRows/onOpenUnit/
  // onClose) vẫn nguyên vẹn đúng thứ tự, giữ đúng tinh thần test này (renderer
  // vẫn nhận toàn bộ qua props, KHÔNG hard-code theo dự án).
  assert.match(source, /export default function TmbMap\(\{ profile, listRows, onOpenUnit, onClose[\s\S]*? \}: Props\)/);
  assert.doesNotMatch(source, /import \{ TMB_PDF_URL/, 'TmbMap.tsx không được import thẳng TMB_PDF_URL (hardcode 1 dự án) nữa');
  assert.doesNotMatch(source, /import \{[^}]*TMB_MAP_UNITS/, 'TmbMap.tsx không được import thẳng TMB_MAP_UNITS (hardcode 1 dự án) nữa');
});

test('TmbMap: dùng profile.units/profile.pdfPageNumber cho spatial mapping + page load, KHÔNG còn hằng số 1 dự án', () => {
  assert.match(source, /profile\.units\.map\(h => \{/);
  assert.match(source, /doc\.getPage\(profile\.pdfPageNumber\)/);
  assert.match(source, /profile\.units\.map\(h => resolveTmbUnitState\(h\.unitCode, maCanIndex\)\)/);
});

test('page.tsx: resolve ĐÚNG TmbMapProfile theo StackingConfig đang chọn (resolveTmbMapProfile) rồi truyền xuống TmbMap qua prop `profile` — KHÔNG if/else theo project trong component', () => {
  const pageSource = fs.readFileSync('src/app/stacking/page.tsx', 'utf8');
  assert.match(pageSource, /import \{ resolveTmbMapProfile, tmbShortLabel \} from '\.\/tmb-map-data';/);
  assert.match(pageSource, /const staticTmbProfile = resolveTmbMapProfile\(selectedConfig\);/);
  assert.match(pageSource, /<TmbMap[\s\S]*?profile=\{tmbProfile\}/);
});

// ─── TMB Manager v1: 0..N map profile/project (DB-managed CỘNG THÊM profile tĩnh) ─

test('page.tsx: hỗ trợ 0..N map profile/project — cộng profile DB-managed (ACTIVE) vào cùng danh sách với profile tĩnh, KHÔNG thay thế', () => {
  assert.match(pageSource, /import \{ useDbTmbMapProfiles \} from '\.\/tmb-map-registry';/);
  assert.match(pageSource, /const dbTmbProfiles = useDbTmbMapProfiles\(selectedConfig\?\.id\);/);
  assert.match(pageSource, /if \(staticTmbProfile && !list\.some\(p => p\.configId === staticTmbProfile\.configId\)\) list\.unshift\(staticTmbProfile\);/);
});

test('page.tsx: >1 map profile -> hiện dropdown chọn map; chỉ 1 map (Saigon Park/HLX VBM1 hiện tại) -> KHÔNG hiện dropdown, giữ nguyên UX cũ', () => {
  assert.match(pageSource, /\{tmbProfiles\.length > 1 && \(/);
  assert.match(pageSource, /<select[\s\S]*?value=\{selectedTmbProfileIdx\}/);
});
