import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const start=app.indexOf('function supportImagePlacement('),end=app.indexOf('\nasync function drawSupportPage',start),source=app.slice(start,end);
assert.ok(start>=0&&end>start,'supportImagePlacement debe existir');
const place=Function(`${source};return supportImagePlacement`)();
const frame={x:5,y:50.5,w:269.4,h:157.4};
const inside=p=>p.x>=frame.x&&p.y>=frame.y&&p.x+p.w<=frame.x+frame.w+1e-9&&p.y+p.h<=frame.y+frame.h+1e-9;

const vertical=place({w:850,h:1100},frame);
assert.equal(vertical.rotated,true);assert.ok(vertical.rotatedScale>vertical.originalScale);assert.ok(inside(vertical));assert.ok(Math.abs(vertical.w/vertical.h-1100/850)<1e-10);

const horizontal=place({w:1600,h:900},frame);
assert.equal(horizontal.rotated,false);assert.ok(horizontal.originalScale>=horizontal.rotatedScale);assert.ok(inside(horizontal));assert.ok(Math.abs(horizontal.w/horizontal.h-1600/900)<1e-10);

const square=place({w:1000,h:1000},frame);
assert.equal(square.rotated,false);assert.ok(inside(square));assert.equal(square.w,square.h);

const oldFrame={x:12,y:52,w:255.4,h:150.9},oldScale=Math.min((oldFrame.w-8)/850,(oldFrame.h-8)/1100);
assert.ok(vertical.scale/oldScale>1.35,'la factura vertical debe crecer al menos 35 % linealmente');
assert.match(app,/getViewport\(\{scale:2\.2\}\)/);assert.match(app,/toDataURL\('image\/jpeg',\.94\)/);
assert.doesNotMatch(source,/state|indexedDB|localStorage|attachments/);

console.log(`Colocación de soportes: vertical rota y crece ${((vertical.scale/oldScale-1)*100).toFixed(1)} %, horizontal conserva orientación, proporciones y límites OK`);
