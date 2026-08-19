import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),{jsPDF}=require('../vendor/jspdf.umd.min.js');
const app=await readFile(new URL('../app.js',import.meta.url),'utf8'),start=app.indexOf('async function drawScof('),end=app.indexOf('\nfunction receiptConcept',start),source=app.slice(start,end);
assert.ok(start>0&&end>start,'drawScof disponible');
const state={meta:{placeDate:'QUIBDÓ',period:'DEL 01 AL 16 DE AGOSTO DE 2026',responsible:'Andrés Gutiérrez',area:'Operaciones',position:'Copiloto',aircraft:'HK3911',cardNumber:'4495931****9708',initialBalance:750000,secondDeposit:3500000,observations:''},movements:[]};
const drawScof=Function('state','totals','isViaticos','pageSize','money','fmtDate','receiptConcept',`${source};return drawScof`)(state,()=>({spent:4371230,balance:-121230}),()=>false,doc=>({w:doc.internal.pageSize.getWidth(),h:doc.internal.pageSize.getHeight()}),n=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n),x=>x,x=>x.detail||x.category||'');
const labels=[[0,1],[0,2],[1,2],[8,12],[11,12]],doc=new jsPDF({orientation:'landscape',unit:'mm',format:'letter'});
for(let i=0;i<labels.length;i++){if(i)doc.addPage('letter','landscape');await drawScof(doc,[],null,...labels[i])}
const bytes=Buffer.from(doc.output('arraybuffer')),text=Buffer.from(bytes).toString('latin1');
for(const label of ['01 de 01','01 de 02','02 de 02','09 de 12','12 de 12'])assert.ok(text.includes(label),`${label} presente`);
await writeFile('/tmp/SCOF01_encabezados_v1.9.6.pdf',bytes);
console.log('Encabezados SCOF01 01/01, 01/02, 02/02, 09/12 y 12/12: OK');
