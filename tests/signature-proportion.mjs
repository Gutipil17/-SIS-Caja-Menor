import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const start=app.indexOf('function proportionalImageRect('),end=app.indexOf('\nfunction resizeSig',start),source=app.slice(start,end);
assert.ok(start>=0&&end>start,'proportionalImageRect debe existir');
const fit=Function(`${source};return proportionalImageRect`)();

const wide=fit(1200,300,10,20,90,24);
assert.equal(wide.w/wide.h,4);assert.ok(wide.w<=90&&wide.h<=24);assert.equal(wide.y,20.75);
const tall=fit(300,1200,10,20,90,24);
assert.equal(tall.w/tall.h,.25);assert.ok(tall.w<=90&&tall.h<=24);
assert.match(app,/properties=doc\.getImageProperties\(item\.signature\)/);
assert.match(app,/proportionalImageRect\(properties\.width,properties\.height,box\.x,box\.y,box\.w,box\.h\)/);
assert.match(app,/doc\.addImage\(item\.signature,'PNG',p\.x,p\.y,p\.w,p\.h\)/);
assert.match(app,/ctx\.drawImage\(im,p\.x,p\.y,p\.w,p\.h\)/);
assert.doesNotMatch(app,/ctx\.drawImage\(im,0,0,rect\.width,220\)/);
assert.doesNotMatch(app,/doc\.addImage\(item\.signature,'PNG',x\+leftW\+20,yy\+1,w-leftW-24,bottomH-5\)/);
console.log('Firmas: proporción, centrado y límites conservados en canvas y PDF');
