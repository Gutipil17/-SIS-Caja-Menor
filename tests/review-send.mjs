import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const app=await readFile(new URL('../app.js',import.meta.url),'utf8'),html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const start=app.indexOf('function commissionDates('),end=app.indexOf('\nfunction reviewRow',start),source=app.slice(start,end);
const makeApi=(state,type='Caja Menor')=>Function('state','reportName','normalizeAircraft','LEGALIZACION_EMAILS',`${source};return{commissionDateRange,legalizationEmailSubject,legalizationEmailBody,legalizationEmailsText,legalizationReviewStats}`)(state,()=>type,value=>String(value||'').toUpperCase().replace(/[^A-Z0-9-]/g,'').replace(/^HK-?/, 'HK'),['facturacion@sisgnss.com','asistentecontable@sisgnss.com']);
const movement=(overrides={})=>({date:'2026-08-15',category:'Transporte',detail:'Taxi',amount:50000,support:'Factura',attachments:[{name:'soporte.pdf'}],signature:null,...overrides});

{
  const state={meta:{startDate:'2026-08-16',endDate:'2026-08-31',aircraft:'HK3911'},movements:[movement(),movement({amount:205275})]},api=makeApi(state),stats=api.legalizationReviewStats();
  assert.deepEqual(stats,{movements:2,total:255275,withSupport:2,withoutSupport:0,missingData:0,documents:2});
  assert.equal(api.legalizationEmailSubject(),'Caja Menor – Comisión del 16 al 31 de agosto de 2026 – HK-3911');
  assert.equal(api.legalizationEmailBody(),'Buen día,\n\nEnvío documentación caja menor de la comisión del 16 al 31 de agosto de 2026.\n\nAtentamente,\n\nCapitán Andrés Gutiérrez');
  assert.equal(api.legalizationEmailsText(),'facturacion@sisgnss.com, asistentecontable@sisgnss.com');
}
{
  const state={meta:{startDate:'2026-08-16',endDate:'2026-08-31',aircraft:'HK-3911'},movements:[]},api=makeApi(state,'Viáticos');
  assert.equal(api.legalizationEmailSubject(),'Viáticos – Comisión del 16 al 31 de agosto de 2026 – HK-3911');
  assert.equal(api.legalizationEmailBody(),'Buen día,\n\nEnvío documentación referente a viáticos de la comisión del 16 al 31 de agosto de 2026.\n\nAtentamente,\n\nCapitán Andrés Gutiérrez');
}
{
  const api=makeApi({meta:{startDate:'2026-08-28',endDate:'2026-09-05',aircraft:'HK3911'},movements:[]});assert.equal(api.commissionDateRange(),'del 28 de agosto al 5 de septiembre de 2026');
  const crossYear=makeApi({meta:{startDate:'2026-12-28',endDate:'2027-01-05',aircraft:'HK3911'},movements:[]});assert.equal(crossYear.commissionDateRange(),'del 28 de diciembre de 2026 al 5 de enero de 2027');
  const fallback=makeApi({meta:{aircraft:'HK3911'},movements:[movement({date:'2026-08-31'}),movement({date:'2026-08-16'})]});assert.equal(fallback.commissionDateRange(),'del 16 al 31 de agosto de 2026');
}
{
  const state={meta:{},movements:[movement(),movement({attachments:[]})]},stats=makeApi(state).legalizationReviewStats();assert.equal(stats.withoutSupport,1);assert.equal(stats.movements,2);
}
{
  const state={meta:{},movements:[movement({attachments:[]}),movement({attachments:[]}),movement()]},stats=makeApi(state).legalizationReviewStats();assert.equal(stats.withoutSupport,2);
}
assert.deepEqual([...app.matchAll(/(?:facturacion|asistentecontable)@sisgnss\.com/g)].map(match=>match[0]),['facturacion@sisgnss.com','asistentecontable@sisgnss.com']);
assert.match(app,/buildConsolidatedPdf\(\{reviewMode:true\}\)/);
assert.match(app,/if\(review\.error\).*button\.disabled=true/);
{
  const pdfStart=app.indexOf('async function buildConsolidatedPdf('),pdfEnd=app.indexOf("\n$('#exportPdf')",pdfStart),pdfSource=app.slice(pdfStart,pdfEnd),build=Function('window',`${pdfSource};return buildConsolidatedPdf`)({jspdf:null});
  await assert.rejects(()=>build({reviewMode:true}),/No se cargó el generador local de PDF/);
}
assert.match(app,/navigator\.share/);assert.doesNotMatch(app,/mailto:/);assert.match(app,/downloadBlob\(prepared\.pdf\.blob/);assert.match(app,/navigator\.clipboard\?\.writeText/);assert.match(app,/document\.execCommand\('copy'\)/);
assert.match(html,/id="reviewAndSend"/);assert.match(html,/id="sendReviewModal"/);assert.match(html,/CONTINUAR Y ENVIAR/);assert.match(html,/COPIAR CORREOS/);
{
  const copyStart=app.indexOf('async function copyLegalizationEmails('),copyEnd=app.indexOf("\n$('#reviewAndSend')",copyStart),copySource=app.slice(copyStart,copyEnd);let copied='',message='';
  const copy=Function('navigator','document','toast','legalizationEmailsText','console',`${copySource};return copyLegalizationEmails`)({clipboard:{writeText:async text=>{copied=text}}},{},text=>{message=text},()=> 'facturacion@sisgnss.com, asistentecontable@sisgnss.com',{error(){}});
  await copy();assert.equal(copied,'facturacion@sisgnss.com, asistentecontable@sisgnss.com');assert.equal(message,'Correos copiados');
}
{
  let selected='',message='',area=null;const document={createElement(){area={value:'',style:{},setAttribute(){},select(){selected=this.value},remove(){this.removed=true}};return area},body:{appendChild(){}},execCommand(command){return command==='copy'&&selected==='facturacion@sisgnss.com, asistentecontable@sisgnss.com'}};
  const copyStart=app.indexOf('async function copyLegalizationEmails('),copyEnd=app.indexOf("\n$('#reviewAndSend')",copyStart),copySource=app.slice(copyStart,copyEnd),copy=Function('navigator','document','toast','legalizationEmailsText','console',`${copySource};return copyLegalizationEmails`)({},document,text=>{message=text},()=> 'facturacion@sisgnss.com, asistentecontable@sisgnss.com',{error(){}});
  await copy();assert.equal(selected,'facturacion@sisgnss.com, asistentecontable@sisgnss.com');assert.equal(message,'Correos copiados');assert.equal(area.removed,true);
}
assert.doesNotMatch(source,/persistDraft|archiveCurrent|put\(|del\(/);
console.log('Revisión y preparación de correo: 12 escenarios específicos OK');
