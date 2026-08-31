import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

test('getPipeline falls back to Google Sheets when the PostgreSQL replica is empty', () => {
  const src = readFileSync(resolve('src/lib/data-access.ts'), 'utf8');
  const start = src.indexOf('export async function getPipeline()');
  const end = src.indexOf('export function addPipeline', start);

  assert.ok(start >= 0 && end > start, 'getPipeline must exist');

  const getPipelineSource = src.slice(start, end);
  assert.match(getPipelineSource, /const rows = await _pgPipeline\(\)/);
  assert.match(getPipelineSource, /if \(rows\.length > 0\) return rows/);
  assert.match(
    getPipelineSource,
    /return cached\('gs:pl', 30_000, \(\) => GS\.getPipeline\(\)\)/,
    'an empty PostgreSQL replica must not hide Pipeline data that still exists in Google Sheets',
  );
});
