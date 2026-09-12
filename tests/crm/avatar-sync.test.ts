import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

type Employee = { id: string; name: string; avatar: string };
type Image = { id: string; name: string; version: number; sharingCalls: number };

function runAvatarScript(employees: Employee[], images: Image[], mapping: string[][] = []) {
  const writes: Array<{ id: string; url: string }> = [];
  let report: Array<{ name: string; status: string; url: string; fileId?: string }> = [];
  const headers = ['id_nhan_vien', 'ho_ten', 'avatar_url'];
  const sheet = {
    getLastColumn: () => headers.length,
    getLastRow: () => employees.length + 1,
    getRange: (row: number, col: number) => ({
      getValues: () => row === 1 ? [headers] : employees.map(e => [e.id, e.name, e.avatar]),
      setValue: (url: string) => {
        const employee = employees[row - 2];
        assert.equal(col, 3);
        employee.avatar = url;
        writes.push({ id: employee.id, url });
      },
    }),
  };
  const mappingSheet = {
    getLastRow: () => mapping.length + 1,
    getRange: () => ({ getValues: () => mapping }),
  };
  const folder = {
    getName: () => 'avatars',
    getFiles: () => {
      let index = 0;
      return {
        hasNext: () => index < images.length,
        next: () => {
          const image = images[index++];
          return {
            getId: () => image.id,
            getName: () => image.name,
            getMimeType: () => 'image/jpeg',
            getLastUpdated: () => new Date(image.version),
            setSharing: () => { image.sharingCalls++; },
          };
        },
      };
    },
  };
  const context = {
    SpreadsheetApp: {
      getActive: () => ({
        getSheetByName: (name: string) => name === 'NHAN_VIEN' ? sheet : name === 'AVATAR_MAPPING' && mapping.length ? mappingSheet : null,
      }),
      getUi: () => ({ alert: () => undefined, ButtonSet: { OK: 'OK' } }),
    },
    DriveApp: {
      getFolderById: () => folder,
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
      Permission: { VIEW: 'VIEW' },
    },
    PropertiesService: {
      getScriptProperties: () => ({
        setProperty: (_key: string, value: string) => { report = JSON.parse(value).report; },
      }),
    },
    Logger: { log: () => undefined },
  };
  const source = readFileSync(resolve('scripts/google-apps-script-avatar-sync.js'), 'utf8')
    .replace("const AVATAR_FOLDER_ID = 'YOUR_FOLDER_ID_HERE';", "const AVATAR_FOLDER_ID = 'test-folder';");
  runInNewContext(source, context);
  return {
    sync: () => runInNewContext('syncAvatars()', context),
    writes,
    get report() { return report; },
  };
}

test('Sync Avatar refreshes existing and empty avatars, preserves unmatched values, and is idempotent', () => {
  const employees = [
    { id: '0001', name: 'Nguyễn Văn A', avatar: 'https://drive.google.com/thumbnail?id=old&sz=w400' },
    { id: '0002', name: 'Trần Thị B', avatar: '' },
    { id: '0003', name: 'Không Có Ảnh', avatar: 'https://example.test/existing.png' },
  ];
  const images = [
    { id: 'drive-a', name: 'Nguyen Van A.jpg', version: 1_780_000_000_000, sharingCalls: 0 },
    { id: 'drive-b', name: 'Tran Thi B.jpg', version: 1_780_000_000_000, sharingCalls: 0 },
  ];
  const script = runAvatarScript(employees, images);
  script.sync();
  assert.match(employees[0].avatar, /id=drive-a&sz=w400&v=1780000000000$/);
  assert.match(employees[1].avatar, /id=drive-b&sz=w400&v=1780000000000$/);
  assert.equal(employees[2].avatar, 'https://example.test/existing.png');
  assert.deepEqual(script.writes.map(w => w.id), ['0001', '0002']);
  assert.equal(script.report[2].url, employees[2].avatar);

  script.sync();
  assert.equal(script.writes.length, 2);
  assert.deepEqual(images.map(i => i.sharingCalls), [1, 1]);
  assert.equal(script.report.filter(r => r.status.includes('⏭️')).length, 2);

  images[0].version += 1000; // Same Drive file ID, changed source modification time.
  script.sync();
  assert.equal(script.writes.length, 3);
  assert.match(employees[0].avatar, /id=drive-a&sz=w400&v=1780000001000$/);
  assert.equal(images[0].sharingCalls, 2);
});

test('manual employee-ID mapping still takes precedence over filename matching', () => {
  const employees = [{ id: '0001', name: 'Nguyễn Văn A', avatar: '' }];
  const images = [
    { id: 'name-match', name: 'Nguyen Van A.jpg', version: 1000, sharingCalls: 0 },
    { id: 'manual-match', name: 'Other Person.jpg', version: 2000, sharingCalls: 0 },
  ];
  const script = runAvatarScript(employees, images, [['0001', 'Nguyễn Văn A', 'manual-match']]);
  script.sync();
  assert.match(employees[0].avatar, /id=manual-match&sz=w400&v=2000$/);
  assert.equal(script.report[0].fileId, 'manual-match');
});

test('existing Sheet-to-PostgreSQL and employee API path retain avatar_url', () => {
  const pgSync = readFileSync(resolve('src/lib/sync/nhan-vien-to-pg.ts'), 'utf8');
  const route = readFileSync(resolve('src/app/api/nhan-vien/sync/route.ts'), 'utf8');
  const employeeRepo = readFileSync(resolve('src/lib/repository/postgresql/employee.repo.ts'), 'utf8');
  const employeeApi = readFileSync(resolve('src/app/api/nhan-vien/route.ts'), 'utf8');
  assert.match(pgSync, /create:\s*\{[\s\S]*?avatar_url:\s*nv\.avatar_url/);
  assert.match(pgSync, /update:\s*\{[\s\S]*?avatar_url:\s*nv\.avatar_url/);
  assert.match(route, /syncNhanVienToPostgres\(\)/);
  assert.match(employeeRepo, /avatar_url:\s*row\.avatar_url/);
  assert.match(employeeApi, /const all = await getNhanVien\(\)/);
});
