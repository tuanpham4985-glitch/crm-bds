import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync('src/app/stacking/TmbMap.tsx', 'utf8');
const pageSource = fs.readFileSync('src/app/stacking/page.tsx', 'utf8');

test('TmbMap: available unit marker stays compact so nearby units are not covered', () => {
  assert.match(source, /const MARKER_SIZE_PX = 12;/);
  assert.match(source, /border: `2px solid \$\{u\.available \? '#16a34a' : '#9ca3af'\}`/);
  assert.match(source, /0 0 0 3px rgba\(34,197,94,0\.28\)/);
  assert.doesNotMatch(source, /const MARKER_SIZE_PX = 18;/);
  assert.doesNotMatch(source, /0 0 0 5px rgba\(34,197,94,0\.35\)/);
});

test('TmbMap: clicking a matched available marker opens the list-detail popup row', () => {
  assert.match(source, /onPointerDown=\{e => \{[\s\S]*?e\.stopPropagation\(\);[\s\S]*?\}\}/);
  assert.match(source, /onClick=\{e => \{[\s\S]*?e\.stopPropagation\(\);[\s\S]*?onOpenUnit\(u\.match\.row\);[\s\S]*?\}\}/);
  assert.match(source, /if \(u\.available && u\.match\.kind === 'matched'\) onOpenUnit\(u\.match\.row\);/);
  assert.match(pageSource, /<TmbMap[\s\S]*onOpenUnit=\{row => setSelectedListRow\(row\)\}/);
  assert.match(pageSource, /selectedListRow && \([\s\S]*<ListUnitDetailModal[\s\S]*row=\{selectedListRow\}/);
});

test('TmbMap: loads PDF as full bytes before pdf.js parses it to avoid range offset errors', () => {
  assert.match(source, /fetch\(TMB_PDF_URL, \{ cache: 'no-store' \}\)/);
  assert.match(source, /new Uint8Array\(await pdfResponse\.arrayBuffer\(\)\)/);
  assert.match(source, /pdfjs\.getDocument\(\{ data: pdfBytes \}\)/);
  assert.doesNotMatch(source, /pdfjs\.getDocument\(TMB_PDF_URL\)/);
});
