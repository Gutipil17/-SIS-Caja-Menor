'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const money=n=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(n)||0);
const uid=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;
const today=()=>new Date().toISOString().slice(0,10);
const fmtDate=s=>{if(!s)return'';const [y,m,d]=s.split('-');return `${d}/${m}/${y}`};
const safe=s=>String(s||'').replace(/[<>]/g,'');
let db,currentId=null,editingId=null,tempAttachments=[],tempSignature=null,deferredPrompt=null,previewReceiptId=null,previewSupportId=null;
let activeModule=null;
function defaultState(module='caja'){return{meta:{reportType:module,placeDate:'',period:'',startDate:'',endDate:'',responsible:'ANDRES GUTIERREZ BECERRA',area:'OPERACIONES',position:'COPILOTO',aircraft:'HK4900',customAircraft:'',cardNumber:'',initialBalance:module==='caja'?1000000:0,secondDeposit:0,observations:''},movements:[],updatedAt:new Date().toISOString()}}
let state=defaultState('caja');
if(window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),2400)}
function openDB(){return new Promise((ok,fail)=>{const r=indexedDB.open('SIS_Caja_Menor',1);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains('boxes'))d.createObjectStore('boxes',{keyPath:'id'});if(!d.objectStoreNames.contains('draft'))d.createObjectStore('draft');};r.onsuccess=()=>{db=r.result;ok()};r.onerror=()=>fail(r.error)})}
function put(store,key,val){return new Promise((ok,fail)=>{const tx=db.transaction(store,'readwrite'),os=tx.objectStore(store),r=key===null?os.put(val):os.put(val,key);r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error)})}
function get(store,key){return new Promise((ok,fail)=>{const r=db.transaction(store).objectStore(store).get(key);r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error)})}
function getAll(store){return new Promise((ok,fail)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error)})}
function del(store,key){return new Promise((ok,fail)=>{const r=db.transaction(store,'readwrite').objectStore(store).delete(key);r.onsuccess=ok;r.onerror=()=>fail(r.error)})}
async function persistDraft(){if(!activeModule)return;state.meta.reportType=activeModule;state.movements.forEach(x=>x.reportType=activeModule);state.updatedAt=new Date().toISOString();await put('draft',`current_${activeModule}`,state)}
function totals(){const spent=state.movements.reduce((a,b)=>a+(+b.amount||0),0),initial=(+state.meta.initialBalance||0)+(+state.meta.secondDeposit||0);return{spent,balance:initial-spent,initial}}
function isViaticos(){return activeModule==='viaticos'}
function reportName(){return isViaticos()?'Viáticos':'Caja Menor'}
function reportSlug(){return isViaticos()?'Viaticos':'Caja_Menor'}
function updateReportUI(){const name=reportName();if($('#appTitle'))$('#appTitle').textContent=`SIS ${name}`;if($('#reportDataTitle'))$('#reportDataTitle').textContent=`Datos de ${name.toLowerCase()}`;if($('#outputHelp'))$('#outputHelp').textContent=`Genera exclusivamente el Excel oficial y el PDF de ${name}, con sus propios movimientos, recibos, firmas y soportes.`;document.title=`SIS ${name} v1.7.5`;const quick=$('#quickAdd');if(quick)quick.textContent=`+ Añadir gasto de ${name}`;const labels=$$('.metric span');if(labels[0])labels[0].textContent=`Saldo inicial ${name}`;if(labels[1])labels[1].textContent=`Gastado ${name}`;if(labels[2])labels[2].textContent=isViaticos()?'Saldo final Viáticos':'Disponible Caja Menor';if($('#exportExcel'))$('#exportExcel').textContent=`Generar Excel de ${name}`;if($('#exportPdf'))$('#exportPdf').textContent=`Generar PDF de ${name}`;if($('#previewExcel'))$('#previewExcel').textContent=`Vista previa de ${name}`;if($('#historyView h2'))$('#historyView h2').textContent=`Historial de ${name}`;$('#secondDepositWrap')?.classList.toggle('hidden',isViaticos());}
function normalizeAircraft(value){return String(value||'').toUpperCase().replace(/[^A-Z0-9-]/g,'').replace(/^HK-?/, 'HK')}
function formatPeriod(start,end){if(!start||!end)return '';const a=new Date(`${start}T00:00:00`),b=new Date(`${end}T00:00:00`);if(Number.isNaN(a)||Number.isNaN(b))return '';const months=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];if(a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth())return `DEL ${String(a.getDate()).padStart(2,'0')} AL ${String(b.getDate()).padStart(2,'0')} DE ${months[a.getMonth()]} DE ${a.getFullYear()}`;return `DEL ${fmtDate(start)} AL ${fmtDate(end)}`}
function dateInPeriod(date){
  if(!date)return false;
  const start=state.meta.startDate,end=state.meta.endDate;
  if(!start||!end)return true;
  return date>=start&&date<=end;
}
function refreshMetaFromVisibleForm(){
  const aircraft=selectedAircraft();
  if(aircraft)state.meta.aircraft=aircraft;
  for(const id of ['placeDate','startDate','endDate','responsible','area','position','cardNumber','observations']){
    const el=$('#'+id);if(el)state.meta[id]=el.value;
  }
  for(const id of ['initialBalance','secondDeposit']){
    const el=$('#'+id);if(el)state.meta[id]=Number(el.value)||0;
  }
  state.meta.period=formatPeriod(state.meta.startDate,state.meta.endDate);
  if($('#period'))$('#period').value=state.meta.period;
  if($('#periodDisplay'))$('#periodDisplay').textContent=state.meta.period||'Sin periodo definido';
}
function validateCommission({requireDates=false,requireMovements=false}={}){
  refreshMetaFromVisibleForm();
  if(!state.meta.aircraft)return 'Seleccione o escriba la aeronave.';
  if(requireDates&&(!state.meta.startDate||!state.meta.endDate))return 'Seleccione la fecha inicial y la fecha final de la comisión.';
  if(state.meta.startDate&&state.meta.endDate&&state.meta.endDate<state.meta.startDate)return 'La fecha final no puede ser anterior a la fecha inicial.';
  if(!Number.isFinite(Number(state.meta.initialBalance))||Number(state.meta.initialBalance)<0)return 'El saldo inicial debe ser un valor válido igual o mayor que cero.';
  if(!Number.isFinite(Number(state.meta.secondDeposit))||Number(state.meta.secondDeposit)<0)return 'El segundo depósito debe ser un valor válido igual o mayor que cero.';
  if(requireMovements&&!state.movements.length)return 'No hay movimientos registrados para generar la salida.';
  return '';
}
function setButtonBusy(button,busy,label){
  if(!button)return;
  if(busy){button.dataset.originalText=button.textContent;button.disabled=true;button.textContent=label||'Procesando…';}
  else{button.disabled=false;button.textContent=button.dataset.originalText||button.textContent;delete button.dataset.originalText;}
}
function downloadBlob(blob,filename){
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}

function migrateState(){const module=activeModule||state.meta?.reportType||'caja';state.meta=state.meta||{};for(const [k,v] of Object.entries(defaultState(module).meta))if(state.meta[k]===undefined)state.meta[k]=v;state.meta.reportType=module;state.meta.aircraft=normalizeAircraft(state.meta.aircraft)||'HK4900';state.movements=(state.movements||[]).filter(x=>!x.reportType||x.reportType===module).map(x=>({...x,reportType:module}))}
function selectedAircraft(){const sel=$('#aircraft');if(!sel)return state.meta.aircraft;return sel.value==='OTHER'?normalizeAircraft($('#customAircraft').value):normalizeAircraft(sel.value)}
function updatePeriodUI(){const period=formatPeriod($('#startDate')?.value,$('#endDate')?.value);if($('#period'))$('#period').value=period;if($('#periodDisplay'))$('#periodDisplay').textContent=period||'Sin periodo definido';return period}
function syncMetaToForm(){migrateState();const known=['HK3779','HK4692','HK5334','HK3882','HK3911','HK4900'];const aircraft=normalizeAircraft(state.meta.aircraft);if($('#aircraft'))$('#aircraft').value=known.includes(aircraft)?aircraft:'OTHER';if($('#customAircraft'))$('#customAircraft').value=known.includes(aircraft)?'':aircraft;$('#customAircraftWrap')?.classList.toggle('hidden',known.includes(aircraft));Object.keys(state.meta).forEach(k=>{if(k==='aircraft'||k==='customAircraft')return;const el=$('#'+k);if(el)el.value=state.meta[k]??''});if(!state.meta.period)state.meta.period=formatPeriod(state.meta.startDate,state.meta.endDate);updatePeriodUI();updateReportUI();$('#boxTitle').textContent=`${reportName()} · ${state.meta.aircraft||'Sin aeronave'} · ${state.meta.period||'Informe actual'}`}
function syncMetaFromForm(){state.meta.aircraft=selectedAircraft();state.meta.customAircraft=$('#customAircraft')?.value||'';Object.keys(state.meta).forEach(k=>{if(k==='aircraft'||k==='customAircraft'||k==='period')return;const el=$('#'+k);if(el)state.meta[k]=el.type==='number'?+el.value:el.value});state.meta.period=updatePeriodUI();persistDraft();render()}
function render(){updateReportUI();const t=totals();$('#mInitial').textContent=money(t.initial);$('#mSpent').textContent=money(t.spent);$('#mBalance').textContent=money(t.balance);$('#mCount').textContent=state.movements.length;$('#boxTitle').textContent=`${reportName()} · ${state.meta.aircraft||'Sin aeronave'} · ${state.meta.period||'Informe actual'}`;renderMovements()}
function movementStatus(x){
  const isReceipt=x.support==='Recibo de Caja';
  const receiptOk=isReceipt;
  const signOk=!isReceipt||!!x.signature;
  const supportOk=isReceipt||!!x.attachments?.length;
  const complete=receiptOk&&signOk&&supportOk || (!isReceipt&&supportOk);
  return{isReceipt,receiptOk,signOk,supportOk,complete};
}
function renderMovements(){
  const box=$('#movementList'),filter=$('#filter').value;
  let arr=[...state.movements].sort((a,b)=>(a.date+a.createdAt).localeCompare(b.date+b.createdAt));
  if(filter==='pending')arr=arr.filter(x=>!movementStatus(x).complete);
  if(filter==='receipt')arr=arr.filter(x=>x.support==='Recibo de Caja');
  if(filter==='invoice')arr=arr.filter(x=>x.support==='Factura');
  box.innerHTML='';
  if(!arr.length){box.innerHTML='<p class="muted">Todavía no hay movimientos en esta vista.</p>';return}
  for(const x of arr){
    const s=movementStatus(x),d=document.createElement('article');
    d.className=`movement${s.complete?' complete':''}`;
    const idLabel=/nit|rut/i.test(x.idType||'')?'NIT':'CC';
    const attachCount=(x.attachments||[]).reduce((n,a)=>n+(a.pages?.length||0),0);
    d.innerHTML=`<div><div class="title">${safe(receiptConcept(x))}</div><div class="person">${safe(x.thirdParty||'Sin tercero')}</div><div class="idline">${x.idNumber?`${idLabel} ${safe(x.idNumber)} · `:''}${fmtDate(x.date)} · ${safe(x.city)}</div><div class="meta">${safe(x.support)} · ${safe(x.category)}</div><div class="badges">${s.isReceipt?`<span class="badge ok">Recibo</span><span class="badge ${s.signOk?'ok':'warn'}">${s.signOk?'Firma lista':'Falta firma'}</span>`:`<span class="badge ${s.supportOk?'ok':'warn'}">${s.supportOk?`Soporte listo (${attachCount})`:'Falta soporte'}</span>`}${s.complete?'<span class="badge complete">✓ Movimiento completo</span>':''}</div></div><div class="amount">${money(x.amount)}</div><div class="actions">${s.isReceipt?'<button data-receipt class="primary-action">📄 Recibo</button><button data-sign>✍ Firmar</button>':(s.supportOk?'<button data-view-support class="primary-action">👁 Ver soporte</button>':'<button data-scan>📷 Escanear</button>')}<button data-edit>Editar</button><button data-copy>Duplicar</button><button data-delete class="danger">Eliminar</button></div>`;
    d.querySelector('[data-edit]').onclick=()=>openExpense(x.id);
    d.querySelector('[data-receipt]')?.addEventListener('click',()=>openReceiptPreview(x.id));
    d.querySelector('[data-sign]')?.addEventListener('click',()=>openExpenseAction(x.id,'sign'));
    d.querySelector('[data-scan]')?.addEventListener('click',()=>openExpenseAction(x.id,'scan'));
    d.querySelector('[data-view-support]')?.addEventListener('click',()=>openSupportPreview(x.id));
    d.querySelector('[data-copy]').onclick=()=>{const c=structuredClone(x);c.id=uid();c.createdAt=new Date().toISOString();c.signature=null;state.movements.push(c);persistDraft();render();toast('Movimiento duplicado')};
    d.querySelector('[data-delete]').onclick=async()=>{if(confirm('¿Eliminar este movimiento?')){state.movements=state.movements.filter(m=>m.id!==x.id);await persistDraft();render()}};
    box.appendChild(d)
  }
}

function showView(id){$$('.view').forEach(v=>v.classList.toggle('active',v.id===id));$$('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===id));if(id==='historyView')renderHistory()}
$$('.bottom-nav button').forEach(b=>b.onclick=()=>showView(b.dataset.view));

function resetExpense(){editingId=null;tempAttachments=[];tempSignature=null;$('#expenseTitle').textContent='Añadir gasto';$('#eDate').value=today();$('#eCity').value=state.movements.at(-1)?.city||'';$('#eSupport').value='Recibo de Caja';$('#eCategory').value='Transporte';$('#eDetail').value='';$('#eThirdParty').value='';$('#eIdType').value='Cédula de Ciudadanía';$('#eIdNumber').value='';$('#eAmount').value='';renderAttachmentPreview();renderSignatureStatus()}
function openExpense(id=null){resetExpense();if(id){const x=state.movements.find(m=>m.id===id);if(!x)return;editingId=id;$('#expenseTitle').textContent='Editar gasto';$('#eDate').value=x.date;$('#eCity').value=x.city;$('#eSupport').value=x.support;$('#eCategory').value=x.category;$('#eDetail').value=x.detail;$('#eThirdParty').value=x.thirdParty;$('#eIdType').value=x.idType;$('#eIdNumber').value=x.idNumber;$('#eAmount').value=x.amount;tempAttachments=structuredClone(x.attachments||[]);tempSignature=x.signature||null;renderAttachmentPreview();renderSignatureStatus()}$('#expenseModal').classList.remove('hidden')}
$('#quickAdd').onclick=()=>openExpense();$('#closeExpense').onclick=()=>$('#expenseModal').classList.add('hidden');
function openExpenseAction(id,action){openExpense(id);setTimeout(()=>{if(action==='sign')$('#signReceipt').click();if(action==='scan')$('#eFiles').click()},180)}
$$('.quick-types button').forEach(b=>b.onclick=()=>{$('#eCategory').value=b.dataset.cat;$('#eDetail').value=b.dataset.desc;$('#eSupport').value=b.dataset.support||'Otro';renderSignatureStatus();if(!b.dataset.desc)$('#eDetail').focus();else $('#eThirdParty').focus()});
function renderSignatureStatus(){$('#signatureStatus').textContent=$('#eSupport').value==='Recibo de Caja'?(tempSignature?'Firma guardada para este recibo.':'Este recibo aún no tiene firma.'):'La firma solo aplica a Recibos de Caja.'}
$('#eSupport').onchange=renderSignatureStatus;
async function fileToDataURL(file){return new Promise((ok,fail)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=fail;r.readAsDataURL(file)})}
async function imageCompressed(file){const src=await fileToDataURL(file);return new Promise((ok,fail)=>{const im=new Image();im.onload=()=>{const max=1800,ratio=Math.min(1,max/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.round(im.width*ratio);c.height=Math.round(im.height*ratio);c.getContext('2d').drawImage(im,0,0,c.width,c.height);ok(c.toDataURL('image/jpeg',.82))};im.onerror=fail;im.src=src})}
async function pdfPages(file){const data=await file.arrayBuffer(),pdf=await pdfjsLib.getDocument({data}).promise,pages=[];for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i),vp=p.getViewport({scale:1.7}),c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;await p.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;pages.push(c.toDataURL('image/jpeg',.82))}return pages}
$('#eFiles').onchange=async e=>{for(const f of [...e.target.files]){toast(`Procesando ${f.name}`);const pages=f.type==='application/pdf'?await pdfPages(f):[await imageCompressed(f)];tempAttachments.push({name:f.name,type:f.type,pages})}renderAttachmentPreview();e.target.value=''};
function renderAttachmentPreview(){const box=$('#attachmentPreview');box.innerHTML='';tempAttachments.forEach((a,i)=>{const d=document.createElement('div');d.className='attachment-card';d.innerHTML=`<img src="${a.pages[0]}"><small>${safe(a.name)}${a.pages.length>1?` (${a.pages.length})`:''}</small><button class="danger">Quitar</button>`;d.querySelector('button').onclick=()=>{tempAttachments.splice(i,1);renderAttachmentPreview()};box.appendChild(d)})}
$('#saveExpense').onclick=async()=>{const x={id:editingId||uid(),date:$('#eDate').value,city:$('#eCity').value.trim(),support:$('#eSupport').value,category:$('#eCategory').value,detail:$('#eDetail').value.trim(),thirdParty:$('#eThirdParty').value.trim(),idType:$('#eIdType').value,idNumber:$('#eIdNumber').value.trim(),amount:+$('#eAmount').value||0,attachments:tempAttachments,signature:$('#eSupport').value==='Recibo de Caja'?tempSignature:null,createdAt:editingId?(state.movements.find(m=>m.id===editingId)?.createdAt||new Date().toISOString()):new Date().toISOString(),reportType:activeModule};if(!x.date||!x.city||!x.detail||!x.amount)return alert('Complete fecha, ciudad, detalle y valor.');const isTaxi=x.category==='Transporte'&&/^taxi\b/i.test(x.detail);if(isTaxi&&(!x.thirdParty||!x.idNumber))return alert('Para gastos de taxi debe registrar el nombre del conductor y su número de cédula.');if(x.support==='Recibo de Caja'&&(!x.thirdParty||!x.idNumber))return alert('Todo recibo de caja debe incluir el nombre del beneficiario y su número de identificación.');if(!dateInPeriod(x.date)&&!confirm(`La fecha ${fmtDate(x.date)} está fuera del periodo ${state.meta.period||'definido'}. ¿Guardar de todas formas?`))return;if(editingId)state.movements=state.movements.map(m=>m.id===editingId?x:m);else state.movements.push(x);await persistDraft();$('#expenseModal').classList.add('hidden');render();toast('Gasto guardado')};

// Firma táctil por recibo
const sig=$('#signatureCanvas'),ctx=sig.getContext('2d');let drawing=false,last=null;
function resizeSig(){const rect=sig.getBoundingClientRect(),scale=devicePixelRatio||1;sig.width=rect.width*scale;sig.height=220*scale;ctx.setTransform(scale,0,0,scale,0,0);ctx.lineWidth=2.2;ctx.lineCap='round';ctx.strokeStyle='#111';ctx.fillStyle='#fff';ctx.fillRect(0,0,rect.width,220);if(tempSignature){const im=new Image();im.onload=()=>ctx.drawImage(im,0,0,rect.width,220);im.src=tempSignature}}
function pt(e){const r=sig.getBoundingClientRect(),t=e.touches?.[0]||e;return{x:t.clientX-r.left,y:t.clientY-r.top}}
function start(e){e.preventDefault();drawing=true;last=pt(e)}function move(e){if(!drawing)return;e.preventDefault();const p=pt(e);ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p}function end(){drawing=false}
['pointerdown','touchstart'].forEach(n=>sig.addEventListener(n,start,{passive:false}));['pointermove','touchmove'].forEach(n=>sig.addEventListener(n,move,{passive:false}));['pointerup','pointercancel','touchend'].forEach(n=>sig.addEventListener(n,end));
$('#signReceipt').onclick=()=>{if($('#eSupport').value!=='Recibo de Caja')return alert('La firma se usa únicamente para Recibo de Caja.');$('#signatureModal').classList.remove('hidden');requestAnimationFrame(resizeSig)};$('#closeSignature').onclick=()=>$('#signatureModal').classList.add('hidden');$('#clearSignature').onclick=()=>{tempSignature=null;resizeSig()};$('#confirmSignature').onclick=()=>{tempSignature=sig.toDataURL('image/png');$('#signatureModal').classList.add('hidden');renderSignatureStatus();toast('Firma guardada')};

$('#saveBox').onclick=()=>{syncMetaFromForm();toast('Datos guardados')};
$('#newBox').onclick=async()=>{if(!confirm(`¿Iniciar un informe nuevo de ${reportName()}? El informe actual debe guardarse en historial si desea conservarlo.`))return;currentId=null;state=defaultState(activeModule);syncMetaToForm();await persistDraft();render();showView('homeView')};
async function archiveCurrent(){syncMetaFromForm();const id=currentId||uid(),payload={...structuredClone(state),id,module:activeModule};currentId=id;await put('boxes',null,payload);toast(`${reportName()} guardado en historial`);return payload}

// Recursos oficiales incluidos dentro de la aplicación para evitar fallos de red o caché.
function embeddedAsset(path){return window.SIS_EMBEDDED_ASSETS?.[path]||null}
function base64ToArrayBuffer(dataUrl){
  const comma=dataUrl.indexOf(',');if(comma<0)throw new Error('Recurso interno inválido.');
  const binary=atob(dataUrl.slice(comma+1)),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return bytes.buffer;
}
async function assetArrayBuffer(path){
  const embedded=embeddedAsset(path);if(embedded)return base64ToArrayBuffer(embedded);
  const response=await fetch(new URL(path,document.baseURI).href,{cache:'no-store'});
  if(!response.ok)throw new Error(`No se encontró el recurso oficial ${path} (${response.status}).`);
  return response.arrayBuffer();
}
function assetDataUrl(path){return embeddedAsset(path)||new URL(path,document.baseURI).href}
function setAccountingCell(cell,value,{wrap=false,number=false,date=false}={}){
  cell.value=value;
  cell.alignment={...(cell.alignment||{}),vertical:'middle',horizontal:number?'right':(cell.alignment?.horizontal||'center'),wrapText:wrap,shrinkToFit:!wrap};
  if(date)cell.numFmt='dd/mm/yy';
  if(number)cell.numFmt='[$$-es-CO] #,##0';
  if(cell.font)cell.font={...cell.font,size:Math.min(Number(cell.font.size)||7,7)};
}
// Excel oficial basado en la plantilla entregada
function excelSerial(s){const d=new Date(`${s}T00:00:00`);return (d-Date.UTC(1899,11,30))/86400000}
$('#exportExcel').onclick=async()=>{
  const button=$('#exportExcel');setButtonBusy(button,true,'Generando Excel…');
  try{
    const validation=validateCommission({requireDates:true});if(validation)return alert(validation);
    if(typeof ExcelJS==='undefined')throw new Error('No se cargó el generador de Excel. Verifique la conexión a internet y vuelva a abrir la aplicación.');
    const template=isViaticos()?'assets/plantilla_VIATICOS.xlsx':'assets/plantilla_SCOF01.xlsx';
    const buf=await assetArrayBuffer(template),wb=new ExcelJS.Workbook();await wb.xlsx.load(buf);
    const m=state.meta,all=[...state.movements].sort((a,b)=>(a.date+a.createdAt).localeCompare(b.date+b.createdAt)),t=totals();
    if(isViaticos()){
      const ws=wb.worksheets.find(sheet=>sheet.name.trim()==='Viaticos (V2)');if(!ws)throw new Error('La plantilla no contiene la hoja “Viaticos (V2)”.');
      setAccountingCell(ws.getCell('D5'),m.placeDate);setAccountingCell(ws.getCell('D7'),m.period);setAccountingCell(ws.getCell('J5'),m.responsible);setAccountingCell(ws.getCell('J6'),m.area);setAccountingCell(ws.getCell('J7'),m.position);setAccountingCell(ws.getCell('D10'),m.cardNumber);setAccountingCell(ws.getCell('D11'),+m.initialBalance||0,{number:true});setAccountingCell(ws.getCell('D12'),t.spent,{number:true});setAccountingCell(ws.getCell('D13'),t.balance,{number:true});
      for(let r=19;r<=48;r++)for(const c of ['C','D','E','F','G','H','I','K'])ws.getCell(`${c}${r}`).value=null;
      all.slice(0,30).forEach((x,i)=>{const r=19+i;setAccountingCell(ws.getCell(`C${r}`),new Date(`${x.date}T00:00:00`),{date:true});setAccountingCell(ws.getCell(`D${r}`),x.city);setAccountingCell(ws.getCell(`E${r}`),x.support);setAccountingCell(ws.getCell(`F${r}`),x.thirdParty);setAccountingCell(ws.getCell(`G${r}`),x.idType);setAccountingCell(ws.getCell(`H${r}`),x.idNumber);setAccountingCell(ws.getCell(`I${r}`),x.category);setAccountingCell(ws.getCell(`K${r}`),x.amount,{number:true})});
      setAccountingCell(ws.getCell('K49'),t.spent,{number:true});setAccountingCell(ws.getCell('C52'),m.observations||'',{wrap:true});
      
    }else{
      const ws=wb.worksheets.find(sheet=>sheet.name.trim()==='Caja Menor');if(!ws)throw new Error('La plantilla no contiene la hoja “Caja Menor”.');
      setAccountingCell(ws.getCell('D5'),m.placeDate);setAccountingCell(ws.getCell('D7'),m.period);setAccountingCell(ws.getCell('I5'),m.responsible);setAccountingCell(ws.getCell('I6'),m.area);setAccountingCell(ws.getCell('I7'),m.position);setAccountingCell(ws.getCell('I8'),m.aircraft);setAccountingCell(ws.getCell('D10'),m.cardNumber);setAccountingCell(ws.getCell('D11'),+m.initialBalance||0,{number:true});setAccountingCell(ws.getCell('D12'),+m.secondDeposit||0,{number:true});setAccountingCell(ws.getCell('D13'),t.spent,{number:true});setAccountingCell(ws.getCell('D14'),t.balance,{number:true});
      for(let r=20;r<=62;r++)for(const c of ['C','D','E','F','G','H','I','K'])ws.getCell(`${c}${r}`).value=null;
      all.slice(0,43).forEach((x,i)=>{const r=20+i;setAccountingCell(ws.getCell(`C${r}`),new Date(`${x.date}T00:00:00`),{date:true});setAccountingCell(ws.getCell(`D${r}`),x.city);setAccountingCell(ws.getCell(`E${r}`),x.support);setAccountingCell(ws.getCell(`F${r}`),x.thirdParty);setAccountingCell(ws.getCell(`G${r}`),x.idType);setAccountingCell(ws.getCell(`H${r}`),x.idNumber);setAccountingCell(ws.getCell(`I${r}`),x.category);setAccountingCell(ws.getCell(`K${r}`),x.amount,{number:true})});
      setAccountingCell(ws.getCell('K63'),t.spent,{number:true});setAccountingCell(ws.getCell('C65'),'OBSERVACIONES:');setAccountingCell(ws.getCell('D65'),m.observations,{wrap:true});
      
    }
    const out=await wb.xlsx.writeBuffer();downloadBlob(new Blob([out],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`SIS_${reportSlug()}_${m.aircraft||'SCOF01'}_${today()}.xlsx`);
    await archiveCurrent();toast(`Excel de ${reportName()} generado correctamente`);
  }catch(e){console.error(e);alert('No fue posible generar el Excel: '+e.message)}
  finally{setButtonBusy(button,false)}
};

function logoData(){return Promise.resolve(assetDataUrl('assets/sis-logo.png'))}
function words(n){const u=['','UNO','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE','DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISÉIS','DIECISIETE','DIECIOCHO','DIECINUEVE','VEINTE'],t=['','','VEINTE','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA'],h=['','CIENTO','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS','SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS'];function p(x){x=Math.floor(x);if(x===0)return'CERO';if(x===100)return'CIEN';if(x<21)return u[x];if(x<100)return t[Math.floor(x/10)]+(x%10?' Y '+u[x%10]:'');if(x<1000)return h[Math.floor(x/100)]+(x%100?' '+p(x%100):'');if(x<1e6)return (Math.floor(x/1000)===1?'MIL':p(Math.floor(x/1000))+' MIL')+(x%1000?' '+p(x%1000):'');if(x<1e9)return (Math.floor(x/1e6)===1?'UN MILLÓN':p(Math.floor(x/1e6))+' MILLONES')+(x%1e6?' '+p(x%1e6):'');return String(x)}return p(Number(n)||0)}
function pageSize(doc){return{w:doc.internal.pageSize.getWidth(),h:doc.internal.pageSize.getHeight()}}
function addHeader(doc,title,logo,page){const {w}=pageSize(doc);if(logo)doc.addImage(logo,'PNG',12,8,32,10);doc.setFont('helvetica','bold');doc.setTextColor(15,39,66);doc.setFontSize(12);doc.text(title,w/2,14,{align:'center'});doc.setFontSize(7);doc.text(`SIS SOLUCIONES INTEGRALES · ${state.meta.aircraft||''} · Página ${page}`,w-12,14,{align:'right'});doc.setDrawColor(15,39,66);doc.line(12,20,w-12,20);doc.setTextColor(0)}
function fit(doc,text,x,y,w,max=2,size=7,style='normal'){doc.setFont('helvetica',style);doc.setFontSize(size);const lines=doc.splitTextToSize(String(text||''),w).slice(0,max);doc.text(lines,x,y)}
function imageData(url){return Promise.resolve(assetDataUrl(url))}
function createLandscapePdf(){const {jsPDF}=window.jspdf;return new jsPDF({orientation:'landscape',unit:'mm',format:'letter',compress:true})}
async function drawScof(doc,all,logo){
  const viaticos=isViaticos();
  const asset=viaticos?'assets/formato_VIATICOS_oficial.png':'assets/formato_SCOF01_oficial.png';
  const dims=viaticos?{w:1485,h:1230}:{w:1468,h:1202};
  const bg=await imageData(asset),m=state.meta,t=totals(),rect=pdfImageRect(doc,dims.w,dims.h);
  doc.addImage(bg,'PNG',rect.x,rect.y,rect.w,rect.h,undefined,'FAST');
  doc.setTextColor(0);
  const put=(text,px,py,pw,lines=1,size=6,style='normal',align='left')=>{
    const pt=pdfAt(rect,px,py),width=pdfWidth(rect,pw);
    doc.setFont('helvetica',style);doc.setFontSize(size);
    if(align==='right'){doc.text(String(text||''),pt.x+width,pt.y,{align:'right'});return}
    fit(doc,text,pt.x,pt.y,width,lines,size,style);
  };
  if(viaticos){
    // Posiciones medidas sobre la imagen oficial de Viáticos (2105 x 1489).
    put(m.placeDate,275,159,345,1,5.5);put(m.period,275,187,345,1,5.5);
    put(m.responsible,1230,159,240,1,5.2);put(m.area,1230,176,240,1,5.2);put(m.position,1230,193,240,1,5.2);
    put(m.cardNumber,270,245,165,1,6.6,'bold');put(money(m.initialBalance),270,269,165,1,6.6,'bold');put(money(t.spent),270,293,165,1,6.6,'bold');put(money(t.balance),270,317,165,1,6.6,'bold');
    const xs=[26,288,462,644,828,1009,1178,1384], widths=[250,160,170,172,170,155,195,82], y0=410,row=17.9;
    all.slice(0,30).forEach((x,i)=>{const y=y0+i*row;const vals=[fmtDate(x.date),x.city,x.support,x.thirdParty,x.idType,x.idNumber,x.category,new Intl.NumberFormat('es-CO').format(x.amount)];vals.forEach((v,j)=>put(v,xs[j],y,widths[j],1,j===7?4.8:4.2,j===7?'bold':'normal',j===7?'right':'left'))});
    put(new Intl.NumberFormat('es-CO').format(t.spent),1384,946,82,1,5,'bold','right');put(m.observations,26,984,1430,3,5.0);
  }else{
    // Posiciones medidas sobre la imagen oficial de Caja Menor (2520 x 1530).
    put(m.placeDate,172,125,400,1,5.4);put(m.period,172,154,400,1,5.4);
    put(m.responsible,1100,125,220,1,5.1);put(m.area,1100,144,220,1,5.1);put(m.position,1100,162,220,1,5.1);put(m.aircraft,1100,181,220,1,5.1);
    put(m.cardNumber,175,207,190,1,5.5,'bold');put(money(m.initialBalance),175,224,190,1,5.5,'bold');put(money(m.secondDeposit),175,241,190,1,5.5,'bold');put(money(t.spent),175,258,190,1,5.5,'bold');put(money(t.balance),175,275,190,1,5.5,'bold');
    const xs=[18,177,370,577,781,950,1105,1281], widths=[150,184,198,195,160,145,165,166], y0=336,row=18.0;
    all.slice(0,35).forEach((x,i)=>{const y=y0+i*row;const vals=[fmtDate(x.date),x.city,x.support,x.thirdParty,x.idType,x.idNumber,x.category,new Intl.NumberFormat('es-CO').format(x.amount)];vals.forEach((v,j)=>put(v,xs[j],y,widths[j],1,j===7?4.6:4.0,j===7?'bold':'normal',j===7?'right':'left'))});
    put(new Intl.NumberFormat('es-CO').format(t.spent),1281,975,166,1,5,'bold','right');put(m.observations,20,1013,1410,3,5.0);
  }
}
function receiptConcept(item){
  const category=String(item.category||'').trim();
  const detail=String(item.detail||'').trim();
  if(category&&detail&&detail.toLowerCase()!==category.toLowerCase())return `${category}: ${detail}`;
  return detail||category||'Sin descripción';
}
function pdfImageRect(doc,imgW,imgH){
  const {w,h}=pageSize(doc),margin=4;
  const scale=Math.min((w-margin*2)/imgW,(h-margin*2)/imgH);
  const rw=imgW*scale,rh=imgH*scale;
  return{x:(w-rw)/2,y:(h-rh)/2,w:rw,h:rh,sx:rw/imgW,sy:rh/imgH};
}
function pdfAt(rect,px,py){return{x:rect.x+px*rect.sx,y:rect.y+py*rect.sy}}
function pdfWidth(rect,px){return px*rect.sx}
function drawReceipt(doc,x,y,w,h,item,num,logo){
  // Tamaño fijo diseñado para cuatro recibos por hoja A4 horizontal.
  const green=[42,145,38],pale=[242,247,239],line=[120,112,58];
  const headerH=17,dateH=10,paidH=10,conceptH=16,lettersH=14,bottomH=15;
  const totalH=headerH+dateH+paidH+conceptH+lettersH+bottomH;
  const baseY=y+(h-totalH)/2;
  doc.setDrawColor(...line);doc.setLineWidth(.3);doc.roundedRect(x,baseY,w,totalH,1.5,1.5);
  if(logo)doc.addImage(logo,'PNG',x+3,baseY+2,24,8);
  doc.setFillColor(...green);doc.roundedRect(x+w-46,baseY+2,43,13,1.3,1.3,'F');
  doc.setTextColor(255);doc.setFont('helvetica','bold');doc.setFontSize(7.2);doc.text('RECIBO DE',x+w-24.5,baseY+7,{align:'center'});doc.text('CAJA MENOR',x+w-24.5,baseY+11.5,{align:'center'});doc.setTextColor(0);

  const top=baseY+headerH,c1=x+w*.40,c2=x+w*.50,c3=x+w*.60,c4=x+w*.74;
  doc.rect(x,top,w,dateH);[c1,c2,c3,c4].forEach(xx=>doc.line(xx,top,xx,top+dateH));
  doc.setFont('helvetica','bold');doc.setFontSize(5.6);doc.text('CIUDAD',x+2,top+3);doc.text('DÍA',c1+1.5,top+3);doc.text('MES',c2+1.5,top+3);doc.text('AÑO',c3+1.5,top+3);doc.text('No.',c4+1.5,top+3);
  const d=new Date(item.date+'T00:00:00');fit(doc,item.city,x+2,top+7.2,c1-x-4,1,6.6,'bold');doc.setFont('helvetica','bold');doc.setFontSize(6.4);doc.text(String(d.getDate()).padStart(2,'0'),c1+5,top+7.2);doc.text(String(d.getMonth()+1).padStart(2,'0'),c2+5,top+7.2);doc.text(String(d.getFullYear()),c3+4,top+7.2);doc.text(`RC-${String(num).padStart(3,'0')}`,c4+2,top+7.2);

  let yy=top+dateH;doc.rect(x,yy,w,paidH);doc.line(x+w*.72,yy,x+w*.72,yy+paidH);doc.setFont('helvetica','bold');doc.setFontSize(5.6);doc.text('PAGADO A',x+2,yy+3);doc.text('$',x+w*.74,yy+7);fit(doc,item.thirdParty,x+2,yy+7.2,w*.67,1,6.6,'bold');doc.setFont('helvetica','bold');doc.setFontSize(7.0);doc.text(new Intl.NumberFormat('es-CO').format(item.amount),x+w-2.5,yy+7.2,{align:'right'});

  yy+=paidH;doc.rect(x,yy,w,conceptH);doc.setFont('helvetica','bold');doc.setFontSize(5.6);doc.text('CONCEPTO / DESCRIPCIÓN',x+2,yy+3);fit(doc,receiptConcept(item),x+2,yy+7,w-4,3,6.3,'bold');

  yy+=conceptH;doc.setFillColor(...pale);doc.rect(x,yy,w,lettersH,'FD');doc.setFont('helvetica','bold');doc.setFontSize(5.6);doc.text('VALOR (EN LETRAS)',x+2,yy+3);fit(doc,`${words(item.amount)} PESOS M/CTE`,x+2,yy+7,w-4,2,6.1,'bold');

  yy+=lettersH;doc.rect(x,yy,w,bottomH);const leftW=w*.34;doc.line(x+leftW,yy,x+leftW,yy+bottomH);doc.line(x,yy+bottomH/2,x+leftW,yy+bottomH/2);doc.setFont('helvetica','bold');doc.setFontSize(5.3);doc.text('CÓDIGO',x+2,yy+3.5);doc.text('APROBADO',x+2,yy+bottomH/2+3.5);doc.text('FIRMA DE RECIBIDO',x+leftW+2,yy+3.5);
  const sigY=yy+bottomH-4;if(item.signature)doc.addImage(item.signature,'PNG',x+leftW+20,yy+1,w-leftW-24,bottomH-5);doc.line(x+leftW+2,sigY,x+w-2,sigY);doc.setFont('helvetica','bold');doc.setFontSize(5.2);const isNit=/nit|rut/i.test(item.idType||'');doc.text(isNit?'NIT:':'C.C.:',x+leftW+2,yy+bottomH-1.2);fit(doc,item.idNumber,x+leftW+13,yy+bottomH-1.2,w-leftW-15,1,5.8,'bold');
}
function receiptNumber(item){const sorted=[...state.movements].filter(x=>x.support==='Recibo de Caja').sort((a,b)=>(a.date+a.createdAt).localeCompare(b.date+b.createdAt));return Math.max(1,sorted.findIndex(x=>x.id===item.id)+1)}
function receiptHtml(item){
  const d=new Date(item.date+'T00:00:00'),num=receiptNumber(item),idLabel=/nit|rut/i.test(item.idType||'')?'NIT':'C.C.';
  return `<div class="receipt-paper"><div class="receipt-top"><div class="receipt-brand"><img src="assets/sis-logo.png" alt="SIS"></div><div class="receipt-title">RECIBO DE<br>CAJA MENOR</div></div><div class="receipt-grid"><div class="receipt-row receipt-date"><div><div class="receipt-label">Ciudad</div><div class="receipt-value">${safe(item.city)}</div></div><div><div class="receipt-label">Día</div><div class="receipt-value">${String(d.getDate()).padStart(2,'0')}</div></div><div><div class="receipt-label">Mes</div><div class="receipt-value">${String(d.getMonth()+1).padStart(2,'0')}</div></div><div><div class="receipt-label">Año</div><div class="receipt-value">${d.getFullYear()}</div></div><div><div class="receipt-label">No.</div><div class="receipt-value">RC-${String(num).padStart(3,'0')}</div></div></div><div class="receipt-row receipt-paid"><div><div class="receipt-label">Pagado a</div><div class="receipt-value">${safe(item.thirdParty)}</div></div><div><div class="receipt-label">Valor</div><div class="receipt-amount">${money(item.amount)}</div></div></div><div class="receipt-row receipt-one"><div><div class="receipt-label">Concepto</div><div class="receipt-value">${safe(receiptConcept(item))}</div></div></div><div class="receipt-row receipt-one receipt-words"><div><div class="receipt-label">Valor en letras</div><div class="receipt-value">${words(item.amount)} PESOS M/CTE</div></div></div><div class="receipt-row receipt-bottom"><div class="receipt-bottom-left"><div><div class="receipt-label">Código</div><div class="receipt-value"></div></div><div><div class="receipt-label">Aprobado</div><div class="receipt-value"></div></div></div><div class="receipt-signature"><div class="receipt-label">Firma de recibido</div>${item.signature?`<img src="${item.signature}" alt="Firma">`:'<div class="receipt-value receipt-missing">Falta firma</div>'}<div class="receipt-sign-line">${idLabel}: ${safe(item.idNumber)}</div></div></div></div></div>`;
}

function openSupportPreview(id){
  const item=state.movements.find(x=>x.id===id);if(!item)return;
  const pages=(item.attachments||[]).flatMap((a,ai)=>(a.pages||[]).map((src,pi)=>({src,name:a.name,index:`${ai+1}.${pi+1}`})));
  if(!pages.length)return openExpenseAction(id,'scan');
  previewSupportId=id;$('#supportTitle').textContent=`Soportes · ${item.detail||item.category}`;$('#supportInfo').textContent=`${fmtDate(item.date)} · ${item.thirdParty||'Sin tercero'} · ${money(item.amount)} · ${pages.length} página(s)`;
  $('#supportGallery').innerHTML=pages.map((p,i)=>`<article class="support-page"><img src="${p.src}" alt="Soporte ${i+1}"><div><strong>Página ${i+1}</strong><small>${safe(p.name)}</small></div></article>`).join('');
  $('#supportModal').classList.remove('hidden');
}
$('#closeSupport').onclick=()=>$('#supportModal').classList.add('hidden');
$('#supportEdit').onclick=()=>{const id=previewSupportId;$('#supportModal').classList.add('hidden');openExpense(id)};
$('#supportDownload').onclick=()=>{const item=state.movements.find(x=>x.id===previewSupportId);if(!item)return;let n=0;for(const a of item.attachments||[])for(const src of a.pages||[]){n++;const link=document.createElement('a');link.href=src;link.download=`Soporte_${item.date}_${String(n).padStart(2,'0')}.jpg`;link.click()}toast('Descarga iniciada')};

function openReceiptPreview(id){
  const item=state.movements.find(x=>x.id===id);if(!item)return;
  if(item.support!=='Recibo de Caja')return alert('Este movimiento no corresponde a un Recibo de Caja.');
  previewReceiptId=id;$('#receiptPreview').innerHTML=receiptHtml(item);$('#receiptModal').classList.remove('hidden');
}
$('#closeReceipt').onclick=()=>$('#receiptModal').classList.add('hidden');
$('#receiptEdit').onclick=()=>{const id=previewReceiptId;$('#receiptModal').classList.add('hidden');openExpense(id)};
$('#receiptDownload').onclick=async()=>{
  const item=state.movements.find(x=>x.id===previewReceiptId);if(!item)return;
  if(!item.signature&&!confirm('Este recibo todavía no tiene firma. ¿Descargar de todas formas?'))return;
  if(!window.jspdf?.jsPDF)throw new Error('No se cargó el generador de PDF. Verifique la conexión a internet y vuelva a abrir la aplicación.');const doc=createLandscapePdf(),logo=await logoData();
  addHeader(doc,'RECIBO DE CAJA MENOR',logo,1);drawReceipt(doc,12,27,134,82,item,receiptNumber(item),logo);
  doc.save(`Recibo_RC-${String(receiptNumber(item)).padStart(3,'0')}_${item.thirdParty||'SIS'}_${item.date}.pdf`);
};

async function imgDim(src){return new Promise((ok,fail)=>{const im=new Image();const timer=setTimeout(()=>fail(new Error('El soporte tardó demasiado en cargarse.')),12000);im.onload=()=>{clearTimeout(timer);ok({w:im.naturalWidth||im.width,h:im.naturalHeight||im.height})};im.onerror=()=>{clearTimeout(timer);fail(new Error('No se pudo leer una imagen de soporte.'));};im.src=src})}
$('#exportPdf').onclick=async()=>{const button=$('#exportPdf');setButtonBusy(button,true,'Generando PDF…');try{const validation=validateCommission({requireDates:true,requireMovements:true});if(validation)return alert(validation);const missing=state.movements.filter(x=>(x.support==='Recibo de Caja'&&!x.signature)||(!x.attachments?.length&&x.support!=='Recibo de Caja'));if(missing.length&&!confirm(`Hay ${missing.length} movimiento(s) con firma o soporte pendiente. ¿Generar de todas formas?`))return;if(!window.jspdf?.jsPDF)throw new Error('No se cargó el generador de PDF. Verifique la conexión a internet y vuelva a abrir la aplicación.');const doc=createLandscapePdf(),logo=await logoData(),all=[...state.movements].sort((a,b)=>(a.date+a.createdAt).localeCompare(b.date+b.createdAt));await drawScof(doc,all,logo);let page=1,receipts=all.filter(x=>x.support==='Recibo de Caja');for(let i=0;i<receipts.length;i+=4){doc.addPage('a4','landscape');addHeader(doc,'RECIBOS DE CAJA MENOR',logo,++page);const group=receipts.slice(i,i+4);const slots=[{x:12,y:27},{x:151,y:27},{x:12,y:113},{x:151,y:113}];for(let j=0;j<group.length;j++){drawReceipt(doc,slots[j].x,slots[j].y,134,82,group[j],i+j+1,logo)}}for(const [idx,x] of all.entries()){for(const a of x.attachments||[]){for(let p=0;p<a.pages.length;p++){const dim=await imgDim(a.pages[p]);doc.addPage('a4','landscape');addHeader(doc,`SOPORTE ${idx+1} - ${x.support.toUpperCase()}`,logo,++page);const ps=pageSize(doc),maxW=ps.w-24,maxH=ps.h-43;doc.setFont('helvetica','bold');fit(doc,`${fmtDate(x.date)} | ${x.thirdParty||''} | ${receiptConcept(x)} | ${money(x.amount)} | ${a.name}${a.pages.length>1?` - Página ${p+1}/${a.pages.length}`:''}`,12,28,maxW,2,7,'bold');const ratio=Math.min(maxW/dim.w,maxH/dim.h),iw=dim.w*ratio,ih=dim.h*ratio;doc.addImage(a.pages[p],'JPEG',ps.w/2-iw/2,35,iw,ih,undefined,'FAST')}}}doc.save(`SIS_${reportSlug()}_${state.meta.aircraft||'SCOF01'}_${today()}.pdf`);await archiveCurrent();toast(`PDF de ${reportName()} generado correctamente`)}catch(e){console.error(e);alert('No fue posible generar el PDF: '+e.message)}finally{setButtonBusy(button,false)}};

async function renderHistory(){const box=$('#historyList'),items=(await getAll('boxes')).filter(p=>(p.module||p.meta?.reportType||'caja')===activeModule).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));box.innerHTML=items.length?'':`<p class="muted">No hay informes de ${reportName()} guardados.</p>`;for(const p of items){const spent=p.movements.reduce((sum,x)=>sum+(+x.amount||0),0),d=document.createElement('div');d.className='history-item';d.innerHTML=`<strong>${safe(reportName())} · ${safe(p.meta.aircraft||'Sin aeronave')} · ${safe(p.meta.period||'Sin periodo')}</strong><small>${p.movements.length} movimientos · ${money(spent)} · ${new Date(p.updatedAt).toLocaleString('es-CO')}</small><div class="button-row"><button data-open>Abrir</button><button data-copy>Duplicar</button><button data-del class="danger">Eliminar</button></div>`;d.querySelector('[data-open]').onclick=async()=>{state=structuredClone(p);currentId=p.id;delete state.id;delete state.module;migrateState();syncMetaToForm();await persistDraft();render();showView('homeView')};d.querySelector('[data-copy]').onclick=async()=>{state=structuredClone(p);delete state.id;delete state.module;currentId=null;state.meta.period='';state.meta.startDate='';state.meta.endDate='';state.movements=state.movements.map(x=>({...x,id:uid(),signature:null,reportType:activeModule}));syncMetaToForm();await persistDraft();render();showView('homeView');toast(`Informe de ${reportName()} duplicado`)};d.querySelector('[data-del]').onclick=async()=>{if(confirm(`¿Eliminar este informe de ${reportName()}?`)){await del('boxes',p.id);renderHistory()}};box.appendChild(d)}}
$('#refreshHistory').onclick=renderHistory;$('#filter').onchange=renderMovements;
$('#backup').onclick=async()=>{
  const button=$('#backup');setButtonBusy(button,true,'Creando copia…');
  try{
    refreshMetaFromVisibleForm();await persistDraft();
    const history=(await getAll('boxes')).filter(p=>(p.module||p.meta?.reportType||'caja')===activeModule);
    const payload={format:'SIS_GASTOS_BACKUP',version:3,module:activeModule,createdAt:new Date().toISOString(),draft:state,history};
    downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),`SIS_${reportSlug()}_respaldo_${today()}.json`);toast(`Copia de seguridad de ${reportName()} creada`);
  }catch(err){console.error(err);alert('No fue posible crear la copia de seguridad: '+err.message)}
  finally{setButtonBusy(button,false)}
};
$('#restore').onchange=async e=>{
  const input=e.target,file=input.files?.[0];if(!file)return;
  try{
    const p=JSON.parse(await file.text());
    if(!p||typeof p!=='object'||(!p.draft&&!Array.isArray(p.history)))throw new Error('El archivo no corresponde a una copia de SIS Gastos.');
    const backupModule=p.module||p.draft?.meta?.reportType||'caja';if(backupModule!==activeModule)throw new Error(`Esta copia corresponde a ${backupModule==='viaticos'?'Viáticos':'Caja Menor'}. Cambie de módulo antes de restaurarla.`);
    if(p.draft){state=structuredClone(p.draft);migrateState();await persistDraft()}
    for(const b of p.history||[]){if(b&&b.id&&b.meta&&Array.isArray(b.movements))await put('boxes',null,b)}
    syncMetaToForm();render();toast('Copia restaurada correctamente');
  }catch(err){console.error(err);alert('Copia inválida: '+err.message)}
  finally{input.value=''}
};

$('#aircraft').onchange=()=>{const other=$('#aircraft').value==='OTHER';$('#customAircraftWrap').classList.toggle('hidden',!other);if(other)setTimeout(()=>$('#customAircraft').focus(),50);syncMetaFromForm()};
$('#customAircraft').oninput=()=>{state.meta.aircraft=selectedAircraft();render()};
$('#startDate').onchange=()=>{updatePeriodUI();syncMetaFromForm()};
$('#endDate').onchange=()=>{updatePeriodUI();syncMetaFromForm()};
function showExcelPreview(){try{const validation=validateCommission({requireDates:true});if(validation)return alert(validation);const all=[...state.movements].sort((a,b)=>(a.date+a.createdAt).localeCompare(b.date+b.createdAt)),t=totals(),outside=all.filter(x=>!dateInPeriod(x.date));$('#excelPreviewSummary').innerHTML=`<div><small>Tipo de informe</small><strong>${reportName()}</strong></div><div><small>Aeronave</small><strong>${safe(state.meta.aircraft)}</strong></div><div><small>Periodo</small><strong>${safe(state.meta.period)}</strong></div><div><small>Saldo inicial</small><strong>${money(state.meta.initialBalance)}</strong></div><div><small>Segundo depósito</small><strong>${money(state.meta.secondDeposit)}</strong></div><div><small>Total gastado</small><strong>${money(t.spent)}</strong></div><div><small>Disponible</small><strong>${money(t.balance)}</strong></div>${outside.length?`<div class="field-warning"><small>Advertencia</small><strong>${outside.length} gasto(s) fuera del periodo</strong></div>`:''}`;$('#excelPreviewRows').innerHTML=all.length?all.map(x=>`<tr class="${dateInPeriod(x.date)?'':'out-period'}"><td>${fmtDate(x.date)}</td><td>${safe(x.city)}</td><td>${safe(x.support)}</td><td>${safe(x.thirdParty)}</td><td>${safe(x.idNumber)}</td><td>${safe(x.category)}</td><td>${money(x.amount)}</td></tr>`).join(''):'<tr><td colspan="7">No hay movimientos registrados.</td></tr>';$('#excelPreviewModal').classList.remove('hidden')}catch(e){console.error(e);alert('No fue posible mostrar la vista previa: '+e.message)}}
$('#previewExcel').onclick=showExcelPreview;$('#closeExcelPreview').onclick=()=>$('#excelPreviewModal').classList.add('hidden');$('#excelPreviewEdit').onclick=()=>$('#excelPreviewModal').classList.add('hidden');$('#excelPreviewDownload').onclick=()=>{ $('#excelPreviewModal').classList.add('hidden');$('#exportExcel').click() };

window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('#installBtn').classList.remove('hidden')});$('#installBtn').onclick=async()=>{if(deferredPrompt){deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$('#installBtn').classList.add('hidden')}else alert('En iPhone: abra Compartir y pulse “Añadir a pantalla de inicio”.')};
if('serviceWorker' in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
async function loadModule(module){activeModule=module;localStorage.setItem('sisActiveModule',module);currentId=null;const key=`current_${module}`;let d=await get('draft',key);if(!d&&module==='caja'){const legacy=await get('draft','current');if(legacy){d=legacy;d.meta=d.meta||{};d.meta.reportType='caja';d.movements=(d.movements||[]).map(x=>({...x,reportType:'caja'}));await put('draft',key,d)}}state=d?structuredClone(d):defaultState(module);migrateState();$('#moduleChooser').classList.add('hidden');$('#appShell').classList.remove('hidden');syncMetaToForm();render();showView('homeView');await persistDraft()}
function showModuleChooser(){if(activeModule)persistDraft();$('#appShell').classList.add('hidden');$('#moduleChooser').classList.remove('hidden')}
$('#chooseCaja').onclick=()=>loadModule('caja').catch(e=>alert('No se pudo abrir Caja Menor: '+e.message));
$('#chooseViaticos').onclick=()=>loadModule('viaticos').catch(e=>alert('No se pudo abrir Viáticos: '+e.message));
$('#switchModuleBtn').onclick=showModuleChooser;
openDB().then(()=>showModuleChooser()).catch(e=>alert('No se pudo iniciar el almacenamiento local: '+e.message));

// Administrador de actualizaciones v1.7
const APP_VERSION='1.7.5';
let swRegistration=null;
let updateReloadPending=false;

function compareVersions(a,b){
  const pa=String(a).split('.').map(n=>parseInt(n,10)||0),pb=String(b).split('.').map(n=>parseInt(n,10)||0);
  for(let i=0;i<Math.max(pa.length,pb.length);i++){
    const d=(pa[i]||0)-(pb[i]||0);
    if(d!==0)return d;
  }
  return 0;
}

async function activateWaitingWorker(registration){
  if(!registration?.waiting)return false;
  updateReloadPending=true;
  registration.waiting.postMessage({type:'SKIP_WAITING'});
  return true;
}

async function checkForAppUpdate({manual=false}={}){
  const button=$('#updateBtn');
  if(button){button.classList.add('updating');button.textContent='Buscando…'}if($('#aboutStatus'))$('#aboutStatus').textContent='Buscando actualizaciones…';
  try{
    const response=await fetch(`./version.json?t=${Date.now()}`,{cache:'no-store'});
    if(!response.ok)throw new Error('No se pudo consultar la versión publicada');
    const published=await response.json();
    const registration=swRegistration||await navigator.serviceWorker?.getRegistration('./');
    if(registration)await registration.update();

    if(registration?.waiting){
      if(confirm(`Está disponible la versión ${published.version||'nueva'}. ¿Actualizar ahora?`)){
        await activateWaitingWorker(registration);
        toast('Instalando actualización…');
      }
      return;
    }

    if(compareVersions(published.version,APP_VERSION)>0){
      toast(`Nueva versión ${published.version} detectada. Preparando actualización…`);
      if(registration){
        await new Promise(resolve=>setTimeout(resolve,1200));
        if(registration.waiting){
          if(confirm(`La versión ${published.version} está lista. ¿Instalarla ahora?`))await activateWaitingWorker(registration);
        }else if(manual){
          alert('La actualización fue detectada. Cierre y abra la aplicación nuevamente en unos segundos.');
        }
      }
    }else{if($('#aboutStatus'))$('#aboutStatus').textContent=`Actualizada · v${APP_VERSION}`;if($('#updateState'))$('#updateState').textContent=`v${APP_VERSION}`;if(manual)alert(`La aplicación está actualizada. Versión instalada: v${APP_VERSION}.`);}
  }catch(error){
    if($('#aboutStatus'))$('#aboutStatus').textContent='No se pudo verificar';if(manual)alert(`No fue posible verificar la actualización. Revise la conexión a internet y vuelva a intentarlo.\n\n${error.message}`);
  }finally{
    if(button){button.classList.remove('updating');button.textContent='Actualizar'}
  }
}

$('#updateBtn').onclick=()=>checkForAppUpdate({manual:true});$('#aboutUpdateBtn').onclick=()=>checkForAppUpdate({manual:true});

if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(updateReloadPending){updateReloadPending=false;window.location.reload()}
  });
  navigator.serviceWorker.ready.then(registration=>{
    swRegistration=registration;
    registration.addEventListener('updatefound',()=>{
      const worker=registration.installing;
      if(!worker)return;
      worker.addEventListener('statechange',()=>{
        if(worker.state==='installed'&&navigator.serviceWorker.controller){
          toast('Nueva actualización lista. Pulse “Actualizar”.');
        }
      });
    });
    setTimeout(()=>checkForAppUpdate(),2500);
  }).catch(()=>{});
}
