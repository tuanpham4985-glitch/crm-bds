import assert from 'node:assert/strict';
import test from 'node:test';
import { cached, invalidate } from '../../src/lib/mem-cache';

// Root cause đã audit (GOOGLE_SHEETS_READ_AMPLIFICATION_ROOT_CAUSE_PROVEN):
// `cached()` TRƯỚC ĐÂY chỉ nhớ KẾT QUẢ đã resolve, KHÔNG nhớ Promise ĐANG
// CHẠY — 2 lời gọi cùng key gần như đồng thời đều thấy cache miss và mỗi
// lời gọi tự chạy `fn()` riêng, nhân đôi số Sheets read cho đúng 1 dữ liệu.
// Test dưới đây verify HÀNH VI THẬT (không phải chỉ đọc source) vì mem-cache.ts
// là module thuần, không cần network/DOM — dùng `fn` giả (đếm số lần gọi)
// thay cho Google Sheets call thật.

function uniqueKey(prefix: string): string {
  return `${prefix}:${Math.random().toString(36).slice(2)}:${Date.now()}`;
}

// ─── In-flight dedup: 2 lời gọi CÙNG key, gần như đồng thời -> fn() chỉ chạy 1 lần ─

test('cached(): 2 lời gọi ĐỒNG THỜI (chưa await lần đầu) cùng key -> fn() CHỈ được gọi 1 LẦN, cả 2 nhận CÙNG kết quả', async () => {
  const key = uniqueKey('dedup');
  let callCount = 0;
  const fn = async () => {
    callCount++;
    await new Promise(r => setTimeout(r, 20));
    return { value: 'real-data', callCount };
  };

  const [r1, r2] = await Promise.all([cached(key, 5_000, fn), cached(key, 5_000, fn)]);
  assert.equal(callCount, 1, `fn() phải chỉ chạy 1 lần cho 2 lời gọi đồng thời cùng key, thực tế chạy ${callCount} lần`);
  assert.deepEqual(r1, r2);
  assert.deepEqual(r1, { value: 'real-data', callCount: 1 });
});

test('cached(): 3 lời gọi đồng thời cùng key -> vẫn chỉ 1 lần gọi fn() (không phải giảm dần, mà LUÔN đúng 1)', async () => {
  const key = uniqueKey('dedup3');
  let callCount = 0;
  const fn = async () => { callCount++; await new Promise(r => setTimeout(r, 15)); return callCount; };

  await Promise.all([cached(key, 5_000, fn), cached(key, 5_000, fn), cached(key, 5_000, fn)]);
  assert.equal(callCount, 1);
});

// ─── Cache hit sau khi resolve: gọi lại trong TTL không chạy fn() nữa ───────

test('cached(): gọi lại SAU KHI lần đầu đã resolve (trong TTL) -> fn() KHÔNG chạy lại, trả kết quả cache', async () => {
  const key = uniqueKey('ttl-hit');
  let callCount = 0;
  const fn = async () => { callCount++; return 'v' + callCount; };

  const first = await cached(key, 5_000, fn);
  const second = await cached(key, 5_000, fn);
  assert.equal(callCount, 1);
  assert.equal(first, 'v1');
  assert.equal(second, 'v1');
});

test('cached(): TTL hết hạn -> lần gọi kế tiếp chạy lại fn() (không kẹt cache vĩnh viễn)', async () => {
  const key = uniqueKey('ttl-expire');
  let callCount = 0;
  const fn = async () => { callCount++; return callCount; };

  const first = await cached(key, 10, fn); // TTL rất ngắn
  await new Promise(r => setTimeout(r, 30)); // đợi hết hạn
  const second = await cached(key, 10, fn);
  assert.equal(first, 1);
  assert.equal(second, 2, 'sau khi TTL hết hạn, fn() phải chạy lại — không phải trả mãi kết quả cũ');
});

// ─── Key khác nhau KHÔNG bị trộn (đúng yêu cầu "khác project/sheet/range không gộp") ─

test('cached(): 2 KEY KHÁC NHAU -> fn() chạy ĐỘC LẬP cho mỗi key, KHÔNG trộn kết quả (mô phỏng 2 dự án/sheet khác nhau)', async () => {
  const keyA = uniqueKey('projA');
  const keyB = uniqueKey('projB');
  const fnA = async () => 'data-for-A';
  const fnB = async () => 'data-for-B';

  const [a, b] = await Promise.all([cached(keyA, 5_000, fnA), cached(keyB, 5_000, fnB)]);
  assert.equal(a, 'data-for-A');
  assert.equal(b, 'data-for-B');
});

// ─── Lỗi (VD 429) KHÔNG được cache — không "che" lỗi thành dữ liệu rỗng ─────

test('cached(): fn() reject (mô phỏng lỗi 429) -> lời gọi throw ĐÚNG lỗi đó, KHÔNG bị nuốt/trả về rỗng', async () => {
  const key = uniqueKey('error');
  const err = new Error('429 Quota exceeded for quota metric "Read requests"');
  const fn = async () => { throw err; };

  await assert.rejects(() => cached(key, 5_000, fn), (e: Error) => e.message === err.message);
});

test('cached(): SAU KHI lỗi, lần gọi KẾ TIẾP thử lại fn() từ đầu (không kẹt vĩnh viễn ở lỗi cũ, không cache lỗi)', async () => {
  const key = uniqueKey('error-retry');
  let callCount = 0;
  const fn = async () => {
    callCount++;
    if (callCount === 1) throw new Error('429');
    return 'ok-second-try';
  };

  await assert.rejects(() => cached(key, 5_000, fn));
  const result = await cached(key, 5_000, fn);
  assert.equal(callCount, 2, 'lần gọi thứ 2 PHẢI thực sự chạy lại fn(), không dùng lại promise lỗi cũ');
  assert.equal(result, 'ok-second-try');
});

test('cached(): 2 lời gọi đồng thời cùng key, fn() reject -> CẢ 2 đều nhận đúng lỗi (không có lời gọi nào "im lặng" thành công giả)', async () => {
  const key = uniqueKey('error-concurrent');
  const err = new Error('429');
  let callCount = 0;
  const fn = async () => { callCount++; await new Promise(r => setTimeout(r, 15)); throw err; };

  const results = await Promise.allSettled([cached(key, 5_000, fn), cached(key, 5_000, fn)]);
  assert.equal(callCount, 1, 'vẫn chỉ 1 lần gọi fn() thật dù reject — in-flight dedup áp dụng cho cả trường hợp lỗi');
  assert.equal(results[0].status, 'rejected');
  assert.equal(results[1].status, 'rejected');
});

// ─── invalidate(): "Làm mới" thủ công phải thấy dữ liệu MỚI, không bị TTL che ─

test('invalidate(prefix): xoá đúng entry theo prefix -> lần cached() kế tiếp chạy lại fn() dù TTL chưa hết (mô phỏng nút "Làm mới")', async () => {
  const key = uniqueKey('gs:stacking_list:sheetX:tabY');
  let callCount = 0;
  const fn = async () => { callCount++; return 'v' + callCount; };

  const first = await cached(key, 60_000, fn); // TTL dài — vẫn còn hạn
  invalidate(key);
  const second = await cached(key, 60_000, fn);
  assert.equal(first, 'v1');
  assert.equal(second, 'v2', 'invalidate() phải buộc fn() chạy lại dù TTL 60s chưa hết — đúng ý nghĩa "Làm mới"');
});

test('invalidate(prefix): CHỈ xoá entry khớp prefix, KHÔNG ảnh hưởng key khác (không refresh nhầm dự án khác)', async () => {
  const keyA = uniqueKey('gs:stacking_list:sheetA:tab1');
  const keyB = uniqueKey('gs:stacking_list:sheetB:tab1');
  let callsA = 0, callsB = 0;
  const fnA = async () => { callsA++; return 'A' + callsA; };
  const fnB = async () => { callsB++; return 'B' + callsB; };

  await cached(keyA, 60_000, fnA);
  await cached(keyB, 60_000, fnB);
  invalidate(keyA); // chỉ invalidate key A
  await cached(keyA, 60_000, fnA);
  await cached(keyB, 60_000, fnB);

  assert.equal(callsA, 2, 'key A bị invalidate -> fn() chạy lại');
  assert.equal(callsB, 1, 'key B KHÔNG bị đụng tới -> fn() không chạy lại thừa');
});
