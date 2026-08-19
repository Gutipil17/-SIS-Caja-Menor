import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),{jsPDF}=require('../vendor/jspdf.umd.min.js');
const app=await readFile(new URL('../app.js',import.meta.url),'utf8'),start=app.indexOf('function supportHeaderLayout('),end=app.indexOf('\nasync function drawScof',start),source=app.slice(start,end);
const pageSize=doc=>({w:doc.internal.pageSize.getWidth(),h:doc.internal.pageSize.getHeight()}),addHeader=()=>{},imgDim=async()=>({w:1200,h:800}),fmtDate=()=> '15/08/2026',money=n=>`$ ${Number(n).toLocaleString('es-CO')}`,receiptConcept=item=>`${item.category}: ${item.detail}`;
const api=Function('pageSize','addHeader','imgDim','fmtDate','money','receiptConcept',`${source};return{supportHeaderLayout,drawSupportPage}`)(pageSize,addHeader,imgDim,fmtDate,money,receiptConcept);
const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'letter'}),image='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAEf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=';
const item={date:'2026-08-15',city:'Quibdó',amount:205275,thirdParty:'Hotel Farallones Quibdó '.repeat(8),category:'Alojamiento',detail:'Hotel Farallones alojamiento ingeniero de vuelo '.repeat(8),support:'Factura'};
await api.drawSupportPage(doc,image,item,'FACTURA HKF_ Jhon Alexander Agudelo Castano_SIS SOLUCIONES_DOCUMENTO_MUY_LARGO.pdf'.repeat(3),25,0,2,null,30);
const layout=api.supportHeaderLayout(doc,item,'archivo-muy-largo.pdf'.repeat(12),0,2,pageSize(doc).w-30);
assert.ok(layout.rows.length>5,'encabezado se divide dinámicamente');assert.ok(layout.height>23,'altura crece');
await writeFile('/tmp/Soporte_encabezado_largo_v1.9.6.pdf',Buffer.from(doc.output('arraybuffer')));
console.log('Encabezado adaptativo de soporte largo: OK');
