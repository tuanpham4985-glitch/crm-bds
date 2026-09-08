import assert from 'node:assert/strict';
import fs from 'node:fs';
import test, { before, beforeEach } from 'node:test';

// TMB_HLX_RUNTIME_DIAGNOSTIC_READY — candidate diagnostic-only (KHÔNG watchdog
// behavioral) cho audit TMB_HLX_MOBILE_FAILURE_STAGE. tmb-diag.ts tự guard
// mọi truy cập browser API bằng `typeof X !== 'undefined'` (SSR-safe theo
// đúng pattern isTmbDiagEnabled() gốc), nên chỉ cần gán global TỐI THIỂU
// module thực sự dùng (window/document/navigator/performance/sessionStorage)
// — KHÔNG cần jsdom (repo không có, đúng convention test hiện có, xem
// tmb-map-initial-render-scale.test.ts).
//
// Import ĐỘNG (sau khi gán global) vì static `import` ở đầu file ESM luôn
// chạy TRƯỚC bất kỳ code nào khác trong file — nếu import tĩnh, tmb-diag.ts
// sẽ đọc `typeof window === 'undefined'` (true) NGAY LÚC module-eval và
// không có cách nào "bật lại" sau đó cho các hàm khai báo `if (typeof window
// === 'undefined') return` một lần rồi thôi (ở đây không xảy ra vì các hàm
// đọc lại typeof mỗi lần gọi, nhưng import động vẫn là cách an toàn/tường
// minh nhất để đảm bảo thứ tự gán-global-trước-khi-dùng).

type Listener = (evt?: unknown) => void;

function makeEventTargetStub() {
  const listeners = new Map<string, Listener[]>();
  return {
    addEventListener(type: string, fn: Listener) {
      const arr = listeners.get(type) ?? [];
      arr.push(fn);
      listeners.set(type, arr);
    },
    __fire(type: string, evt?: unknown) {
      for (const fn of listeners.get(type) ?? []) fn(evt);
    },
    // Test-only — xoá hết listener đã gắn giữa các test case, mô phỏng ĐÚNG
    // 1 trang/tab MỚI (window/document thật của 1 lượt tải trang không mang
    // theo listener của lượt TRƯỚC — chỉ module-level state trong tmb-diag.ts
    // mới có khái niệm "reset trong bộ nhớ nhưng sessionStorage còn nguyên").
    __clearListeners() {
      listeners.clear();
    },
  };
}

function makeSessionStorageStub() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    __store: store,
  };
}

let diag: typeof import('../../src/app/stacking/tmb-diag');
let windowStub: ReturnType<typeof makeEventTargetStub> & { location: { pathname: string; search: string } };
let documentStub: ReturnType<typeof makeEventTargetStub> & {
  visibilityState: string;
  body: { appendChild: (el: unknown) => void };
  createElement: (tag: string) => { style: Record<string, unknown>; setAttribute: () => void; textContent: string };
};
let sessionStorageStub: ReturnType<typeof makeSessionStorageStub>;

function setNavigationType(type: string) {
  (globalThis as unknown as { performance: { getEntriesByType: (t: string) => unknown[] } }).performance
    .getEntriesByType = (t: string) => (t === 'navigation' ? [{ type }] : []);
}

function setServiceWorkerController(controller: { scriptURL: string } | null) {
  (globalThis as unknown as { navigator: { serviceWorker: { controller: unknown } } }).navigator
    .serviceWorker.controller = controller;
}

before(async () => {
  windowStub = Object.assign(makeEventTargetStub(), { location: { pathname: '/stacking', search: '?tmbdiag=1' } });
  documentStub = Object.assign(makeEventTargetStub(), {
    visibilityState: 'visible',
    body: { appendChild: () => {} },
    createElement: () => ({ style: {}, setAttribute: () => {}, textContent: '' }),
  });
  sessionStorageStub = makeSessionStorageStub();

  // Node (>=18) đã có sẵn global `navigator`/`performance` dạng getter-only
  // (không writable qua gán trực tiếp `globalThis.navigator = ...`) — PHẢI
  // dùng defineProperty với configurable:true để override được trong test.
  const defineGlobal = (name: string, value: unknown) => {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  };
  defineGlobal('window', windowStub);
  defineGlobal('document', documentStub);
  defineGlobal('navigator', { serviceWorker: { controller: null } });
  defineGlobal('performance', {
    now: () => 0,
    getEntriesByType: (t: string) => (t === 'navigation' ? [{ type: 'navigate' }] : []),
  });
  defineGlobal('sessionStorage', sessionStorageStub);

  diag = await import('../../src/app/stacking/tmb-diag');
});

beforeEach(() => {
  diag.__resetDiagStateForTest();
  windowStub.__clearListeners();
  documentStub.__clearListeners();
  windowStub.location.search = '?tmbdiag=1';
  windowStub.location.pathname = '/stacking';
  setNavigationType('navigate');
  setServiceWorkerController(null);
});

// ─── 1-2. Gate theo ?tmbdiag=1 ──────────────────────────────────────────────

test('1. isTmbDiagEnabled() === false khi KHÔNG có ?tmbdiag=1 (thiếu param, hoặc =0)', () => {
  windowStub.location.search = '';
  assert.equal(diag.isTmbDiagEnabled(), false);
  windowStub.location.search = '?tmbdiag=0';
  assert.equal(diag.isTmbDiagEnabled(), false);
  windowStub.location.search = '?other=1';
  assert.equal(diag.isTmbDiagEnabled(), false);
});

test('2. isTmbDiagEnabled() === true khi có ?tmbdiag=1 (kể cả kèm param khác)', () => {
  windowStub.location.search = '?tmbdiag=1';
  assert.equal(diag.isTmbDiagEnabled(), true);
  windowStub.location.search = '?foo=bar&tmbdiag=1';
  assert.equal(diag.isTmbDiagEnabled(), true);
});

// ─── 3. Bounded sessionStorage persistence ─────────────────────────────────

test('3. diagMark() ghi liên tục vẫn bị BOUND đúng TMB_DIAG_MAX_STORED_LINES trong sessionStorage, không phình vô hạn', () => {
  const total = diag.TMB_DIAG_MAX_STORED_LINES + 50;
  for (let i = 0; i < total; i++) diag.diagMark('SC_TEST', `stage-${i}`);
  const raw = sessionStorageStub.getItem('tmb-diag-log-v1');
  assert.ok(raw, 'phải ghi được vào sessionStorage khi diag bật');
  const parsed = JSON.parse(raw!) as string[];
  assert.ok(Array.isArray(parsed));
  assert.ok(parsed.length <= diag.TMB_DIAG_MAX_STORED_LINES, `buffer phải <= ${diag.TMB_DIAG_MAX_STORED_LINES} dòng, thực tế ${parsed.length}`);
  // Dòng CUỐI phải là mốc mới nhất (bound bằng cách cắt ĐẦU, giữ ĐUÔI — không mất log gần nhất)
  assert.match(parsed[parsed.length - 1], new RegExp(`stage-${total - 1}\\b`));
});

// ─── 4. Khôi phục log lượt trước SAU reload (sessionStorage sống sót) ──────

test('4. Log của lượt tải TRƯỚC được khôi phục sau khi mô phỏng reload (sessionStorage giữ nguyên, state trong bộ nhớ reset)', () => {
  diag.diagMark('SC_HLX', 'MOUNT', { label: 'HLX' });
  diag.diagMark('SC_HLX', 'asset-fetch:start');
  const beforeReload = [...diag.__getDiagLinesForTest()];
  assert.equal(beforeReload.length, 2);

  // Mô phỏng RELOAD BÌNH THƯỜNG trong CÙNG tab — module state reset (module
  // JS chạy lại từ đầu) NHƯNG sessionStorage KHÔNG bị xoá (khác 1 tab/session mới).
  diag.__resetInMemoryStateOnlyForTest();
  assert.equal(diag.__getDiagLinesForTest().length, 0, 'state trong bộ nhớ phải rỗng NGAY sau khi module "chạy lại"');

  diag.initTmbDiagSessionOnce();
  const afterReload = diag.__getDiagLinesForTest();
  assert.ok(afterReload.length > beforeReload.length, 'phải có nhiều dòng hơn sau khi khôi phục + thêm marker mới');
  assert.ok(afterReload.some(l => l.includes('MOUNT')), '2 dòng của lượt TRƯỚC phải còn trong buffer đã khôi phục');
  assert.ok(afterReload.some(l => l.includes('asset-fetch:start')), '2 dòng của lượt TRƯỚC phải còn trong buffer đã khôi phục');
});

// ─── 5. Marker "=== NEW PAGE LOAD ===" ─────────────────────────────────────

test('5. initTmbDiagSessionOnce() chèn đúng 1 dòng "=== NEW PAGE LOAD ===" mỗi lượt tải trang', () => {
  diag.initTmbDiagSessionOnce();
  const lines = diag.__getDiagLinesForTest();
  const markers = lines.filter(l => l.includes('=== NEW PAGE LOAD ==='));
  assert.equal(markers.length, 1);

  // Gọi lại lần 2 (VD attachGlobalDiagListenersOnce gọi lại trong CÙNG lượt tải)
  // — module-level guard PHẢI chặn, không được chèn thêm marker thứ 2.
  diag.initTmbDiagSessionOnce();
  assert.equal(diag.__getDiagLinesForTest().filter(l => l.includes('=== NEW PAGE LOAD ===')).length, 1);
});

test('5b. Marker "=== NEW PAGE LOAD ===" kèm đúng pathname/search hiện tại', () => {
  windowStub.location.pathname = '/stacking';
  windowStub.location.search = '?tmbdiag=1';
  diag.initTmbDiagSessionOnce();
  const marker = diag.__getDiagLinesForTest().find(l => l.includes('=== NEW PAGE LOAD ==='));
  assert.ok(marker);
  assert.match(marker!, /pathname=\/stacking/);
  assert.match(marker!, /search=\?tmbdiag=1/);
});

// ─── 6. PerformanceNavigationTiming.type ───────────────────────────────────

test('6. navigationType đọc từ PerformanceNavigationTiming.type được ghi vào marker NEW PAGE LOAD', () => {
  setNavigationType('reload');
  diag.initTmbDiagSessionOnce();
  const marker = diag.__getDiagLinesForTest().find(l => l.includes('=== NEW PAGE LOAD ==='));
  assert.ok(marker);
  assert.match(marker!, /navigationType=reload/);
});

test('6b. navigationType="unknown" nếu performance.getEntriesByType không khả dụng (browser cũ) — KHÔNG throw', () => {
  const perf = (globalThis as unknown as { performance: Record<string, unknown> }).performance;
  const original = perf.getEntriesByType;
  delete perf.getEntriesByType;
  try {
    assert.doesNotThrow(() => diag.initTmbDiagSessionOnce());
    const marker = diag.__getDiagLinesForTest().find(l => l.includes('=== NEW PAGE LOAD ==='));
    assert.match(marker!, /navigationType=unknown/);
  } finally {
    perf.getEntriesByType = original;
  }
});

// ─── 7. pageshow / pagehide / visibilitychange / beforeunload ──────────────

test('7. attachGlobalDiagListenersOnce() ghi log khi pageshow/pagehide/visibilitychange/beforeunload fire, kèm đúng persisted/visibilityState', () => {
  diag.attachGlobalDiagListenersOnce();
  diag.__resetInMemoryStateOnlyForTest(); // xoá riêng buffer hiển thị để test không lẫn dòng NEW PAGE LOAD, listener vẫn còn gắn (module-level)
  windowStub.__fire('pageshow', { persisted: true });
  windowStub.__fire('pagehide', { persisted: false });
  windowStub.__fire('beforeunload');
  documentStub.visibilityState = 'hidden';
  documentStub.__fire('visibilitychange');

  const lines = diag.__getDiagLinesForTest();
  assert.ok(lines.some(l => l.includes('pageshow') && l.includes('persisted=true')), 'thiếu log pageshow persisted=true');
  assert.ok(lines.some(l => l.includes('pagehide') && l.includes('persisted=false')), 'thiếu log pagehide persisted=false');
  assert.ok(lines.some(l => l.includes('beforeunload')), 'thiếu log beforeunload');
  assert.ok(lines.some(l => l.includes('visibilitychange') && l.includes('visibilityState=hidden')), 'thiếu log visibilitychange');
});

test('7b. attachGlobalDiagListenersOnce() chỉ gắn listener 1 LẦN DUY NHẤT (module-level guard) — gọi lại không gắn trùng', () => {
  diag.attachGlobalDiagListenersOnce();
  diag.attachGlobalDiagListenersOnce();
  diag.__resetInMemoryStateOnlyForTest();
  windowStub.__fire('beforeunload');
  const count = diag.__getDiagLinesForTest().filter(l => l.includes('beforeunload')).length;
  assert.equal(count, 1, 'gọi attachGlobalDiagListenersOnce() 2 lần KHÔNG được gắn listener trùng (log 2 lần cho 1 sự kiện)');
});

// ─── 8. serviceWorker controller metadata ──────────────────────────────────

test('8. serviceWorker controller presence=false + scriptURL="n/a" khi không có SW nào control trang', () => {
  setServiceWorkerController(null);
  diag.initTmbDiagSessionOnce();
  const marker = diag.__getDiagLinesForTest().find(l => l.includes('=== NEW PAGE LOAD ==='));
  assert.match(marker!, /swControllerPresent=false/);
  assert.match(marker!, /swScriptURL=n\/a/);
});

test('8b. serviceWorker controller presence=true + đúng scriptURL khi có SW đang control', () => {
  setServiceWorkerController({ scriptURL: 'https://app.example.com/sw.js' });
  diag.initTmbDiagSessionOnce();
  const marker = diag.__getDiagLinesForTest().find(l => l.includes('=== NEW PAGE LOAD ==='));
  assert.match(marker!, /swControllerPresent=true/);
  assert.match(marker!, /swScriptURL=https:\/\/app\.example\.com\/sw\.js/);
});

test('8c. Không có navigator.serviceWorker (browser cũ/SSR) -> presence=false, KHÔNG throw', () => {
  const nav = (globalThis as unknown as { navigator: Record<string, unknown> }).navigator;
  const original = nav.serviceWorker;
  delete nav.serviceWorker;
  try {
    assert.doesNotThrow(() => diag.initTmbDiagSessionOnce());
    const marker = diag.__getDiagLinesForTest().find(l => l.includes('=== NEW PAGE LOAD ==='));
    assert.match(marker!, /swControllerPresent=false/);
  } finally {
    nav.serviceWorker = original;
  }
});

// ─── 9-12. Static source audit (đúng convention repo — không có jsdom/RTL,
// đọc SOURCE THẬT + assert cấu trúc/wiring bằng regex cho phần gắn vào
// TmbMap.tsx, xem tmb-map-initial-render-scale.test.ts) ────────────────────

const tmbMapSource = fs.readFileSync('src/app/stacking/TmbMap.tsx', 'utf8');
const tmbDiagSource = fs.readFileSync('src/app/stacking/tmb-diag.ts', 'utf8');

test('9. TmbMap.tsx vẫn instrument đủ các mốc bắt buộc (mount/unmount, asset-fetch, getDocument/getPage, canvas, render, error, onClose)', () => {
  const requiredStages = [
    "'MOUNT'", "diagMark(profile.configId, 'UNMOUNT')",
    "'asset-fetch:start'", "'asset-fetch:response-headers'", "'asset-fetch:full-bytes-received'",
    "'getDocument:start'", "'getDocument:done'", "'getPage:start'", "'getPage:done'",
    "'geometry-viewport'", "'initial-raster-scale'", "'canvas-allocated'",
    "'page.render:start'", "'page.render:complete'", "'marker-overlay-computed'",
    "'STABLE-OPEN-STATE-REACHED'", "'CAUGHT-ERROR'",
    "'onClose:backdrop-click'", "'onClose:X-button-click'",
  ];
  for (const stage of requiredStages) {
    assert.ok(tmbMapSource.includes(stage), `thiếu diagnostic stage bắt buộc: ${stage}`);
  }
});

test('10. tmb-diag.ts KHÔNG tự gọi onClose/navigation/setSelectedConfig — diagnostic-only, không có side-effect nghiệp vụ', () => {
  // Yêu cầu cú pháp GỌI HÀM thật (có dấu ngoặc/gán) — tránh false-positive từ
  // chính các dòng COMMENT giải thích "KHÔNG gọi onClose/navigation/
  // setSelectedConfig" (identifier trần xuất hiện trong prose, không phải code).
  const forbidden = ['onClose(', 'router.push(', 'router.replace(', 'setSelectedConfig(', 'location.href =', 'location.reload('];
  for (const token of forbidden) {
    assert.ok(!tmbDiagSource.includes(token), `tmb-diag.ts KHÔNG được chứa "${token}" — diagnostic phải thuần đọc/log, không điều hướng/đổi state nghiệp vụ`);
  }
});

test('11. Candidate KHÔNG include watchdog behavioral WIP — TmbMap.tsx không import/dùng tmb-map-load-watchdog, giữ nguyên LOAD_TIMEOUT_MS phẳng cũ', () => {
  assert.ok(!tmbMapSource.includes("from './tmb-map-load-watchdog'"), 'TmbMap.tsx KHÔNG được import từ tmb-map-load-watchdog trong candidate diagnostic-only này');
  assert.ok(!/\bAbortController\b/.test(tmbMapSource), 'candidate không dùng AbortController (đó là 1 phần watchdog WIP, không phải diagnostic)');
  assert.match(tmbMapSource, /const LOAD_TIMEOUT_MS = 20000;/, 'phải giữ NGUYÊN timeout phẳng 20000ms đã release (không đổi sang progress-aware watchdog)');

  // watchdog WIP file vẫn PHẢI còn tồn tại nguyên vẹn trên disk (không bị xoá/
  // discard) — chỉ đơn giản KHÔNG được dùng bởi candidate này.
  assert.ok(fs.existsSync('src/app/stacking/tmb-map-load-watchdog.ts'), 'watchdog WIP phải được BẢO TOÀN trên disk, không bị xoá/discard');
  const watchdogSource = fs.readFileSync('src/app/stacking/tmb-map-load-watchdog.ts', 'utf8');
  assert.match(watchdogSource, /DEFAULT_TMB_LOAD_WATCHDOG_CONFIG/, 'nội dung watchdog WIP phải còn nguyên vẹn (không bị sửa/rỗng hoá)');
  assert.ok(fs.existsSync('tests/crm/tmb-map-load-watchdog.test.ts'), 'test của watchdog WIP phải được giữ nguyên, không xoá');
});

test('12. Mọi lời gọi diagMark/mountDiagOverlayOnce/attachGlobalDiagListenersOnce trong TmbMap.tsx đều được gate bởi isTmbDiagEnabled()/diagOn (inline HOẶC qua early-return guard đầu block chứa nó) — KHÔNG hành vi nào chạy khi tmbdiag tắt', () => {
  const lines = tmbMapSource.split('\n');
  const guardTokens = ['isTmbDiagEnabled()', 'diagOn'];
  const calleeTokens = ['diagMark(', 'mountDiagOverlayOnce(', 'attachGlobalDiagListenersOnce('];
  // Ranh giới 1 block (effect/callback) — quét NGƯỢC từ dòng gọi tới ranh giới
  // GẦN NHẤT này (hoặc guard token, tuỳ cái nào gặp trước) để bắt đúng cả 2
  // kiểu gate đang dùng trong file: inline (`if (diagOn) diagMark(...)`) LẪN
  // early-return đầu block (`if (!isTmbDiagEnabled()) return;` rồi các lệnh
  // sau đó, kể cả `return () => diagMark(...)` cleanup, đều đã được gate).
  const blockBoundary = /useEffect\(\(\) => \{|useCallback\(async|const\s+\w+\s*=\s*useCallback\(/;
  const MAX_LOOKBACK = 30;
  const unguarded: string[] = [];
  lines.forEach((line, i) => {
    if (!calleeTokens.some(c => line.includes(c))) return;
    let guarded = guardTokens.some(g => line.includes(g));
    for (let back = 1; !guarded && back <= MAX_LOOKBACK && i - back >= 0; back++) {
      const prevLine = lines[i - back];
      if (guardTokens.some(g => prevLine.includes(g))) { guarded = true; break; }
      if (blockBoundary.test(prevLine)) break; // hết block chứa nó mà chưa thấy guard -> dừng, coi là unguarded
    }
    if (!guarded) unguarded.push(`dòng ${i + 1}: ${line.trim()}`);
  });
  assert.deepEqual(unguarded, [], `Có lời gọi diagnostic KHÔNG được gate — sẽ chạy dù tmbdiag tắt:\n${unguarded.join('\n')}`);
});

test('12b. Effect MOUNT return sớm ("if (!isTmbDiagEnabled()) return;") TRƯỚC bất kỳ lời gọi diagnostic nào — không có side-effect nào (kể cả addEventListener/tạo overlay DOM) khi tắt', () => {
  const mountEffectMatch = tmbMapSource.match(/useEffect\(\(\) => \{\s*if \(!isTmbDiagEnabled\(\)\) return;[\s\S]*?\}, \[\]\);/);
  assert.ok(mountEffectMatch, 'không tìm thấy effect MOUNT diagnostic với early-return guard đúng vị trí đầu tiên');
});
