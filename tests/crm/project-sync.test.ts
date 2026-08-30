import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

test('cron đồng bộ DU_AN và xóa cache dự án sau khi hoàn tất', () => {
  const source = fs.readFileSync(path.join(root, 'src/app/api/cron/sync-sheets/route.ts'), 'utf8');

  assert.match(source, /import \{ syncDuAnToPostgres \} from '@\/lib\/sync\/du-an-to-pg';/);
  assert.match(source, /const \[hrm, khachHang, pipeline, duAn\] = await Promise\.all\(\[/);
  assert.match(source, /syncDuAnToPostgres\(\),/);
  assert.match(source, /revalidateTag\('da', \{\}\);/);
  assert.match(source, /return NextResponse\.json\(\{ ok: true, elapsed_s: elapsed, hrm, khachHang, pipeline, duAn, tmUsers \}\);/);
});

test('đồng bộ DU_AN upsert đầy đủ các trường có thể thay đổi', () => {
  const source = fs.readFileSync(path.join(root, 'src/lib/sync/du-an-to-pg.ts'), 'utf8');

  for (const field of [
    'ma_du_an', 'ten_du_an', 'hien_thi', 'hoa_hong_mac_dinh',
    'link_tai_lieu', 'chu_dau_tu', 'link_du_an', 'stacking_config',
    'truong_nhom', 'ds_sale',
  ]) {
    assert.match(source, new RegExp(`${field}:`), `thiếu trường ${field}`);
  }

  assert.match(source, /await prisma\.duAn\.upsert\(\{/);
  assert.match(source, /create: \{ id_du_an: da\.id_du_an, \.\.\.data \},/);
  assert.match(source, /update: data,/);
});
