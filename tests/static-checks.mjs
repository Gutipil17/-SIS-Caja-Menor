import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [app, html, worker, version] = await Promise.all([
  read('app.js'),
  read('index.html'),
  read('service-worker.js'),
  read('version.json')
]);
const bundleText = await read('assets-bundle.js');
const bundle = JSON.parse(bundleText.match(/window\.SIS_EMBEDDED_ASSETS=(\{.*\});/s)?.[1]||'{}');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

assert.match(app, /const APP_VERSION='1\.9\.3'/);
assert.match(html, /v1\.9\.3/);
assert.match(worker, /sis-gastos-v1\.9\.3/);
assert.equal(JSON.parse(version).version, '1.9.3');

assert.doesNotMatch(`${app}\n${html}`, /cdn\.jsdelivr\.net/);
assert.doesNotMatch(app, /ANDRES GUTIERREZ BECERRA/);
assert.doesNotMatch(app, /HK(?:3779|4692|5334|3882|3911|4900)/);
assert.match(html, /Content-Security-Policy/);
assert.match(app, /formato oficial admite máximo/);
assert.match(app, /p\.format!=='SIS_GASTOS_BACKUP'/);
assert.match(app, /Number\.isSafeInteger\(x\.amount\)/);
assert.doesNotMatch(bundleText, /ANDRES|GUTIERREZ|CARDENAS|CORREA|RUBIO|MAURICIO|GOMEZ|OLAYA/i);

for (const template of ['plantilla_SCOF01.xlsx', 'plantilla_VIATICOS.xlsx']) {
  const relative = `assets/${template}`;
  const embedded = Buffer.from(bundle[relative].split(',')[1], 'base64');
  const disk = await readFile(new URL(`../${relative}`, import.meta.url));
  assert.equal(sha256(embedded), sha256(disk), `${template} incrustada debe coincidir con la plantilla sanitizada`);
}

for (const asset of [
  './vendor/jspdf.umd.min.js',
  './vendor/exceljs.min.js',
  './vendor/pdf.min.js',
  './vendor/pdf.worker.min.js'
]) {
  assert.ok(worker.includes(asset), `${asset} debe quedar disponible sin conexión`);
}

console.log('Controles estáticos v1.9.3: OK');
