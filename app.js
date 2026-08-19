'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const money=n=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(n)||0);
const uid=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;
const today=()=>new Date().toISOString().slice(0,10);
const fmtDate=s=>{if(!s)return'';const [y,m,d]=s.split('-');return `${d}/${m}/${y}`};
const safe=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const LEGALIZACION_EMAILS=Object.freeze(['facturacion@sisgnss.com','asistentecontable@sisgnss.com']);
let db,currentId=null,editingId=null,tempAttachments=[],tempSignature=null,deferredPrompt=null,previewReceiptId=null,previewSupportId=null,pendingLegalizationShare=null;
let activeModule=null;
function defaultState(module='caja'){return{meta:{reportType:module,placeDate:'',period:'',startDate:'',endDate:'',responsible:'',area:'',position:'',aircraft:'',customAircraft:'',cardNumber:'',initialBalance:0,secondDeposit:0,observations:''},movements:[],updatedAt:new Date().toISOString()}}
let state=defaultState('caja');
if(window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc='./vendor/pdf.worker.min.js';

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
function updateReportUI(){const name=reportName();if($('#appTitle'))$('#appTitle').textContent=`SIS ${name}`;if($('#reportDataTitle'))$('#reportDataTitle').textContent=`Datos de ${name.toLowerCase()}`;if($('#outputHelp'))$('#outputHelp').textContent=`Genera exclusivamente el Excel oficial y el PDF de ${name}, con sus propios movimientos, recibos, firmas y soportes.`;document.title=`SIS ${name} v1.9.7`;const quick=$('#quickAdd');if(quick)quick.textContent=`+ Añadir gasto de ${name}`;const labels=$$('.metric span');if(labels[0])labels[0].textContent=`Saldo inicial ${name}`;if(labels[1])labels[1].textContent=`Gastado ${name}`;if(labels[2])labels[2].textContent=isViaticos()?'Saldo final Viáticos':'Disponible Caja Menor';if($('#exportExcel'))$('#exportExcel').textContent=`Generar Excel de ${name}`;if($('#exportPdf'))$('#exportPdf').textContent=`Generar PDF de ${name}`;if($('#previewExcel'))$('#previewExcel').textContent=`Vista previa de ${name}`;if($('#historyView h2'))$('#historyView h2').textContent=`Historial de ${name}`;$('#secondDepositWrap')?.classList.toggle('hidden',isViaticos());}
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
  if(!String(state.meta.placeDate||'').trim())return 'Complete el lugar del informe.';
  if(!String(state.meta.responsible||'').trim())return 'Complete el nombre de la persona responsable.';
  if(requireDates&&(!state.meta.startDate||!state.meta.endDate))return 'Seleccione la fecha inicial y la fecha final de la comisión.';
  if(state.meta.startDate&&state.meta.endDate&&state.meta.endDate<state.meta.startDate)return 'La fecha final no puede ser anterior a la fecha inicial.';
  if(!Number.isFinite(Number(state.meta.initialBalance))||Number(state.meta.initialBalance)<0)return 'El saldo inicial debe ser un valor válido igual o mayor que cero.';
  if(!Number.isFinite(Number(state.meta.secondDeposit))||Number(state.meta.secondDeposit)<0)return 'El segundo depósito debe ser un valor válido igual o mayor que cero.';
  if(requireMovements&&!state.movements.length)return 'No hay movimientos registrados para generar la salida.';
  if(state.movements.some(x=>!dateInPeriod(x.date)))return 'Hay movimientos fuera del periodo. Corrija las fechas antes de generar la salida final.';
  return '';
}
function setButtonBusy(button,busy,label){
  if(!button)return;
  if(busy){button.dataset.originalText=button.textContent;button.disabled=true;button.textContent=label||'Procesando…';}
  else{button.disabled=false;button.textContent=button.dataset.originalText||button.textContent;delete button.dataset.originalText;}
}
function downloadBlob(blob,filename){
  if(window.AndroidFiles?.saveBase64){
    const reader=new FileReader();
    reader.onload=()=>window.AndroidFiles.saveBase64(String(reader.result||'').split(',')[1]||'',filename,blob.type||'application/octet-stream');
    reader.onerror=()=>alert('No fue posible preparar el archivo para guardarlo en Android.');
    reader.readAsDataURL(blob);
    return;
  }
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}

function migrateState(){const module=activeModule||state.meta?.reportType||'caja';state.meta=state.meta||{};for(const [k,v] of Object.entries(defaultState(module).meta))if(state.meta[k]===undefined)state.meta[k]=v;state.meta.reportType=module;state.meta.aircraft=normalizeAircraft(state.meta.aircraft);state.movements=(state.movements||[]).filter(x=>!x.reportType||x.reportType===module).map(x=>({...x,reportType:module,createdAt:x.createdAt||new Date().toISOString()}))}
function selectedAircraft(){const sel=$('#aircraft');if(!sel)return state.meta.aircraft;return sel.value==='OTHER'?normalizeAircraft($('#customAircraft').value):normalizeAircraft(sel.value)}
function updatePeriodUI(){const period=formatPeriod($('#startDate')?.value,$('#endDate')?.value);if($('#period'))$('#period').value=period;if($('#periodDisplay'))$('#periodDisplay').textContent=period||'Sin periodo definido';return period}
function syncMetaToForm(){migrateState();const aircraft=normalizeAircraft(state.meta.aircraft);if($('#aircraft'))$('#aircraft').value=aircraft?'OTHER':'';if($('#customAircraft'))$('#customAircraft').value=aircraft;$('#customAircraftWrap')?.classList.toggle('hidden',!aircraft);Object.keys(state.meta).forEach(k=>{if(k==='aircraft'||k==='customAircraft')return;const el=$('#'+k);if(el)el.value=state.meta[k]??''});if(!state.meta.period)state.meta.period=formatPeriod(state.meta.startDate,state.meta.endDate);updatePeriodUI();updateReportUI();$('#boxTitle').textContent=`${reportName()} · ${state.meta.aircraft||'Sin aeronave'} · ${state.meta.period||'Informe actual'}`}
function syncMetaFromForm(){state.meta.aircraft=selectedAircraft();state.meta.customAircraft=$('#customAircraft')?.value||'';Object.keys(state.meta).forEach(k=>{if(k==='aircraft'||k==='customAircraft'||k==='period')return;const el=$('#'+k);if(el)state.meta[k]=el.type==='number'?+el.value:el.value});state.meta.period=updatePeriodUI();persistDraft();render()}
function render(){updateReportUI();const t=totals();$('#mInitial').textContent=money(t.initial);$('#mSpent').textContent=money(t.spent);$('#mBalance').textContent=money(t.balance);$('#mCount').textContent=state.movements.length;$('#boxTitle').textContent=`${reportName()} · ${state.meta.aircraft||'Sin aeronave'} · ${state.meta.period||'Informe actual'}`;renderMovements()}
function movementStatus(x){
  const isReceipt=x.support==='Recibo de Caja';
  const receiptOk=!isReceipt||!!x.thirdParty&&!!x.idNumber;
  const signOk=!isReceipt||!!x.signature;
  const supportOk=isReceipt||!!x.attachments?.length;
  const complete=isReceipt?receiptOk&&signOk:supportOk;
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
    const attachCount=(x.attachments||[]).reduce((n,a)=>n+(a.type==='application/pdf'&&a.data?1:(a.pages?.length||0)),0);
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

function resetExpense(){editingId=null;tempAttachments=[];tempSignature=null;$('#expenseTitle').textContent='Añadir gasto';$('#eDate').value=today();$('#eCity').value=state.movements.at(-1)?.city||'';$('#eSupport').value='Recibo de Caja';$('#eCategory').value='Transporte';$('#eDetail').value='';$('#eThirdParty').value='';$('#eIdType').value='Cédula de Ciudadanía';$('#eIdNumber').value='';$('#eAmount').value='';renderAttachmentPreview();renderSignatureStatus();updateAttachmentRequirementUI()}
function openExpense(id=null){resetExpense();if(id){const x=state.movements.find(m=>m.id===id);if(!x)return;editingId=id;$('#expenseTitle').textContent='Editar gasto';$('#eDate').value=x.date;$('#eCity').value=x.city;$('#eSupport').value=x.support;$('#eCategory').value=x.category;$('#eDetail').value=x.detail;$('#eThirdParty').value=x.thirdParty;$('#eIdType').value=x.idType;$('#eIdNumber').value=x.idNumber;$('#eAmount').value=x.amount;tempAttachments=structuredClone(x.attachments||[]);tempSignature=x.signature||null;renderAttachmentPreview();renderSignatureStatus();updateAttachmentRequirementUI()}$('#expenseModal').classList.remove('hidden')}
$('#quickAdd').onclick=()=>openExpense();$('#closeExpense').onclick=()=>$('#expenseModal').classList.add('hidden');
function openExpenseAction(id,action){openExpense(id);setTimeout(()=>{if(action==='sign')$('#signReceipt').click();if(action==='scan')$('#eFiles').click()},180)}
$$('.quick-types button').forEach(b=>b.onclick=()=>{$('#eCategory').value=b.dataset.cat;$('#eDetail').value=b.dataset.desc;$('#eSupport').value=b.dataset.support||'Otro';renderSignatureStatus();updateAttachmentRequirementUI();if(!b.dataset.desc)$('#eDetail').focus();else $('#eThirdParty').focus()});
function renderSignatureStatus(){$('#signatureStatus').textContent=$('#eSupport').value==='Recibo de Caja'?(tempSignature?'Firma guardada para este recibo.':'Este recibo aún no tiene firma.'):'La firma solo aplica a Recibos de Caja.'}
function updateAttachmentRequirementUI(){const receipt=$('#eSupport').value==='Recibo de Caja',field=$('#attachmentField'),help=$('#attachmentHelp');field?.classList.toggle('attachment-not-required',receipt);if(help)help.textContent=receipt?'No requerido: el soporte principal es el recibo firmado. Puede anexar evidencia adicional con confirmación.':'Requerido: adjunte al menos un PDF, JPG, JPEG o PNG.'}
$('#eSupport').onchange=()=>{renderSignatureStatus();updateAttachmentRequirementUI()};
async function fileToDataURL(file){return new Promise((ok,fail)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=fail;r.readAsDataURL(file)})}
async function imageCompressed(file){const src=await fileToDataURL(file);return new Promise((ok,fail)=>{const im=new Image();im.onload=()=>{const max=1800,ratio=Math.min(1,max/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.round(im.width*ratio);c.height=Math.round(im.height*ratio);c.getContext('2d').drawImage(im,0,0,c.width,c.height);ok(c.toDataURL('image/jpeg',.82))};im.onerror=fail;im.src=src})}
$('#eFiles').onchange=async e=>{const files=[...e.target.files];if(!files.length)return;if($('#eSupport').value==='Recibo de Caja'&&!confirm('Este movimiento está configurado como Recibo de Caja. Normalmente no requiere factura ni archivo adjunto porque el soporte es el recibo firmado generado por la aplicación. ¿Desea adjuntar este archivo de todas formas?')){e.target.value='';return}for(const f of files){const isPdf=f.type==='application/pdf'||/\.pdf$/i.test(f.name),isImage=/^image\/(jpeg|png)$/i.test(f.type)||/\.(jpe?g|png)$/i.test(f.name);if(!isPdf&&!isImage){alert(`${f.name}: formato no permitido.`);continue}toast(`Procesando ${f.name}`);const attachment=isPdf?{name:f.name,type:'application/pdf',size:f.size,data:await fileToDataURL(f),pages:[]}:{name:f.name,type:f.type,size:f.size,pages:[await imageCompressed(f)]};attachment.hash=await SISSupportUtils.attachmentHash(attachment);tempAttachments.push(attachment)}renderAttachmentPreview();e.target.value=''};
function openOriginalSupport(attachment){if(!attachment?.data)return;const link=document.createElement('a');link.href=attachment.data;link.target='_blank';link.rel='noopener';link.click()}
function renderAttachmentPreview(){const box=$('#attachmentPreview');box.innerHTML='';tempAttachments.forEach((a,i)=>{const d=document.createElement('div');d.className='attachment-card';const isPdf=a.type==='application/pdf'&&a.data;d.innerHTML=isPdf?`<button type="button" data-open>📄 Abrir PDF</button><small>${safe(a.name)}</small><button class="danger" data-remove>Quitar</button>`:`<img src="${a.pages[0]}"><small>${safe(a.name)}${a.pages.length>1?` (${a.pages.length})`:''}</small><button class="danger" data-remove>Quitar</button>`;d.querySelector('[data-open]')?.addEventListener('click',()=>openOriginalSupport(a));d.querySelector('[data-remove]').onclick=()=>{tempAttachments.splice(i,1);renderAttachmentPreview()};box.appendChild(d)})}
function duplicateSupportMessage(groups,title='Este archivo ya está asociado a otro movimiento.'){return`${title}\n\n${groups.map(group=>group.map(({movement,attachment})=>`${fmtDate(movement.date)} · ${movement.thirdParty||'Sin tercero'} · ${money(movement.amount)}\nArchivo: ${attachment.name}`).join('\n↔\n')).join('\n\n')}`}
async function confirmMovementDuplicates(candidate){const others=state.movements.filter(m=>m.id!==candidate.id),groups=(await SISSupportUtils.duplicateGroups([...others,candidate])).filter(group=>group.some(item=>item.movement.id===candidate.id));if(!groups.length)return true;return confirm(`${duplicateSupportMessage(groups)}\n\nRevise antes de continuar.\n\nAceptar: continuar conscientemente. Cancelar: volver a editar.`)}
$('#saveExpense').onclick=async()=>{const x={id:editingId||uid(),date:$('#eDate').value,city:$('#eCity').value.trim(),support:$('#eSupport').value,category:$('#eCategory').value,detail:$('#eDetail').value.trim(),thirdParty:$('#eThirdParty').value.trim(),idType:$('#eIdType').value,idNumber:$('#eIdNumber').value.trim(),amount:Number($('#eAmount').value),attachments:tempAttachments,signature:$('#eSupport').value==='Recibo de Caja'?tempSignature:null,createdAt:editingId?(state.movements.find(m=>m.id===editingId)?.createdAt||new Date().toISOString()):new Date().toISOString(),reportType:activeModule};if(!x.date||!x.city||!x.detail||!Number.isSafeInteger(x.amount)||x.amount<=0)return alert('Complete fecha, ciudad, detalle y un valor entero mayor que cero.');const isTaxi=x.category==='Transporte'&&/^taxi\b/i.test(x.detail);if(isTaxi&&(!x.thirdParty||!x.idNumber))return alert('Para gastos de taxi debe registrar el nombre del conductor y su número de cédula.');if(x.support==='Recibo de Caja'&&(!x.thirdParty||!x.idNumber))return alert('Todo recibo de caja debe incluir el nombre del beneficiario y su número de identificación.');if(!await confirmMovementDuplicates(x))return;if(!dateInPeriod(x.date)&&!confirm(`La fecha ${fmtDate(x.date)} está fuera del periodo ${state.meta.period||'definido'}. ¿Guardar de todas formas?`))return;if(editingId)state.movements=state.movements.map(m=>m.id===editingId?x:m);else state.movements.push(x);try{await persistDraft()}catch(error){return alert('No se pudo guardar el gasto. El almacenamiento del dispositivo puede estar lleno. Cree una copia de seguridad y libere espacio antes de continuar.')}$('#expenseModal').classList.add('hidden');render();toast('Gasto guardado')};

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
  cell.value=typeof value==='string'&&!value.trim()?null:value;
  cell.alignment={...(cell.alignment||{}),vertical:'middle',horizontal:'center',wrapText:wrap,shrinkToFit:!wrap};
  if(date)cell.numFmt='dd/mm/yy';
  if(number)cell.numFmt='[$$-es-CO] #,##0';
  if(cell.font)cell.font={...cell.font,size:Math.min(Number(cell.font.size)||7,7)};
}
// Excel oficial basado en la plantilla entregada
function excelSerial(s){const d=new Date(`${s}T00:00:00`);return (d-Date.UTC(1899,11,30))/86400000}
function fillOfficialSheet(ws,movements,pageNumber,pageCount,grandTotals,officialSheets){
  // Regla permanente: SCOF01 y VIÁTICOS son plantillas inmutables; solo se diligencian sus celdas maestras existentes.
  const m=state.meta,viaticos=isViaticos(),startRow=viaticos?19:20,endRow=viaticos?48:62,totalRow=viaticos?49:63;
  ws.name=pageNumber===1?(viaticos?'Viaticos (V2)':'Caja Menor '):`${viaticos?'Viaticos':'Caja Menor'} ${pageNumber}`;
  ws.pageSetup={...(ws.pageSetup||{}),orientation:'landscape',paperSize:1,fitToPage:true,fitToWidth:1,fitToHeight:1,margins:{left:.25,right:.25,top:.3,bottom:.3,header:.1,footer:.1}};
  const paginationCell=ws.getCell('J3');paginationCell.value=`Paginas: ${String(pageNumber).padStart(2,'0')} de ${String(pageCount).padStart(2,'0')}`;paginationCell.alignment={...(paginationCell.alignment||{}),horizontal:'center',vertical:'middle',wrapText:false,shrinkToFit:true};
  setAccountingCell(ws.getCell('D5'),m.placeDate);setAccountingCell(ws.getCell('D7'),m.period);
  const totalFormula=`SUM(${officialSheets.map(sheet=>`'${sheet.name.replaceAll("'","''")}'!K${totalRow}`).join(',')})`;
  if(viaticos){
    setAccountingCell(ws.getCell('J5'),m.responsible);setAccountingCell(ws.getCell('J6'),m.area);setAccountingCell(ws.getCell('J7'),m.position);setAccountingCell(ws.getCell('D10'),m.cardNumber);setAccountingCell(ws.getCell('D11'),+m.initialBalance||0,{number:true});setAccountingCell(ws.getCell('D12'),{formula:totalFormula,result:grandTotals.spent},{number:true});setAccountingCell(ws.getCell('D13'),{formula:'D11-D12',result:grandTotals.balance},{number:true});
  }else{
    setAccountingCell(ws.getCell('I5'),m.responsible);setAccountingCell(ws.getCell('I6'),m.area);setAccountingCell(ws.getCell('I7'),m.position);setAccountingCell(ws.getCell('I8'),m.aircraft);setAccountingCell(ws.getCell('D10'),m.cardNumber);setAccountingCell(ws.getCell('D11'),+m.initialBalance||0,{number:true});setAccountingCell(ws.getCell('D12'),+m.secondDeposit||0,{number:true});setAccountingCell(ws.getCell('D13'),{formula:totalFormula,result:grandTotals.spent},{number:true});setAccountingCell(ws.getCell('D14'),{formula:'D11+D12-D13',result:grandTotals.balance},{number:true});
  }
  for(let r=startRow;r<=endRow;r++)for(const c of ['C','D','E','F','G','H','I','K'])ws.getCell(`${c}${r}`).value=null;
  movements.forEach((x,i)=>{const r=startRow+i;setAccountingCell(ws.getCell(`C${r}`),new Date(`${x.date}T00:00:00`),{date:true});setAccountingCell(ws.getCell(`D${r}`),x.city);setAccountingCell(ws.getCell(`E${r}`),x.support);setAccountingCell(ws.getCell(`F${r}`),x.thirdParty);setAccountingCell(ws.getCell(`G${r}`),x.idType);setAccountingCell(ws.getCell(`H${r}`),x.idNumber);setAccountingCell(ws.getCell(`I${r}`),x.category);setAccountingCell(ws.getCell(`K${r}`),x.amount,{number:true})});
  setAccountingCell(ws.getCell(`K${totalRow}`),{formula:`SUM(K${startRow}:K${endRow})`,result:movements.reduce((sum,x)=>sum+(+x.amount||0),0)},{number:true});
  if(viaticos)setAccountingCell(ws.getCell('C52'),m.observations||'',{wrap:true});else{setAccountingCell(ws.getCell('C65'),'OBSERVACIONES:');setAccountingCell(ws.getCell('D65'),m.observations,{wrap:true})}
}
$('#exportExcel').onclick=async()=>{
  const button=$('#exportExcel');setButtonBusy(button,true,'Generando Excel…');
  try{
    const validation=validateCommission({requireDates:true,requireMovements:true});if(validation)return alert(validation);
    if(typeof ExcelJS==='undefined')throw new Error('No se cargó el generador de Excel. Verifique la conexión a internet y vuelva a abrir la aplicación.');
    const template=isViaticos()?'assets/plantilla_VIATICOS.xlsx':'assets/plantilla_SCOF01.xlsx';
    const buf=await assetArrayBuffer(template),wb=new ExcelJS.Workbook();await wb.xlsx.load(buf);
    const m=state.meta,all=[...state.movements].sort((a,b)=>(a.date+a.createdAt).localeCompare(b.date+b.createdAt)),t=totals(),viaticos=isViaticos(),source=wb.worksheets.find(sheet=>sheet.name.trim()===(viaticos?'Viaticos (V2)':'Caja Menor'));
    if(!source)throw new Error(`La plantilla no contiene la hoja “${viaticos?'Viaticos (V2)':'Caja Menor'}”.`);
    if(!window.SISOfficialPagination)throw new Error('No se cargó el paginador del formato oficial. Cierre y vuelva a abrir la aplicación.');
    const pages=window.SISOfficialPagination.pagedWorksheets(wb,source,all,viaticos?30:43,viaticos?'Viaticos':'Caja Menor');
    const officialSheets=pages.map(page=>page.worksheet);
    for(const page of pages)fillOfficialSheet(page.worksheet,page.movements,page.index+1,page.pageCount,t,officialSheets);
    const out=await wb.xlsx.writeBuffer();downloadBlob(new Blob([out],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`SIS_${reportSlug()}_${m.aircraft||'SCOF01'}_${today()}.xlsx`);
    await archiveCurrent();toast(`Excel de ${reportName()} generado correctamente`);
  }catch(e){console.error(e);alert('No fue posible generar el Excel: '+e.message)}
  finally{setButtonBusy(button,false)}
};

function logoData(){return Promise.resolve(assetDataUrl('assets/sis-logo.png'))}
function words(n){const u=['','UNO','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE','DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISÉIS','DIECISIETE','DIECIOCHO','DIECINUEVE','VEINTE'],t=['','','VEINTE','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA'],h=['','CIENTO','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS','SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS'];function p(x){x=Math.floor(x);if(x===0)return'CERO';if(x===100)return'CIEN';if(x<21)return u[x];if(x<100)return t[Math.floor(x/10)]+(x%10?' Y '+u[x%10]:'');if(x<1000)return h[Math.floor(x/100)]+(x%100?' '+p(x%100):'');if(x<1e6)return (Math.floor(x/1000)===1?'MIL':p(Math.floor(x/1000))+' MIL')+(x%1000?' '+p(x%1000):'');if(x<1e9)return (Math.floor(x/1e6)===1?'UN MILLÓN':p(Math.floor(x/1e6))+' MILLONES')+(x%1e6?' '+p(x%1e6):'');return String(x)}return p(Number(n)||0)}
function pageSize(doc){return{w:doc.internal.pageSize.getWidth(),h:doc.internal.pageSize.getHeight()}}
function addHeader(doc,title,logo,page){const {w,h}=pageSize(doc);if(logo)doc.addImage(logo,'PNG',12,7,30,10);doc.setFont('helvetica','bold');doc.setTextColor(15,39,66);doc.setFontSize(12);doc.text(title,w/2,13.5,{align:'center'});doc.setFontSize(7);doc.setFont('helvetica','normal');doc.text(`${state.meta.aircraft||reportName()} · ${state.meta.period||''}`,w-12,10.5,{align:'right'});doc.setDrawColor(15,39,66);doc.setLineWidth(.35);doc.line(12,20,w-12,20);doc.setFontSize(6.8);doc.setTextColor(80);doc.text('Documento generado localmente por SIS Gastos',12,h-5);doc.text(`Página ${page}`,w-12,h-5,{align:'right'});doc.setTextColor(0)}
function fit(doc,text,x,y,w,max=2,size=7,style='normal'){doc.setFont('helvetica',style);doc.setFontSize(size);const lines=doc.splitTextToSize(String(text||''),w).slice(0,max);doc.text(lines,x,y)}
function imageData(url){return Promise.resolve(assetDataUrl(url))}
function createLandscapePdf(){const {jsPDF}=window.jspdf;return new jsPDF({orientation:'landscape',unit:'mm',format:'letter',compress:true})}
function drawMovementDetailPages(doc,all,logo,startPage){
  const ps=pageSize(doc),mx=12,top=27,bottom=13,W=ps.w-mx*2;
  const widths=[22,29,33,46,31,25,50,19],headers=['FECHA','CIUDAD','SOPORTE','TERCERO','IDENTIFICACIÓN','CONCEPTO','DETALLE','VALOR'];
  const rowH=12,headH=9,rowsPerPage=Math.max(1,Math.floor((ps.h-top-bottom-headH)/rowH));
  let page=startPage;
  for(let offset=0;offset<all.length;offset+=rowsPerPage){
    doc.addPage('letter','landscape');addHeader(doc,`DETALLE DE MOVIMIENTOS - ${reportName().toUpperCase()}`,logo,++page);
    const group=all.slice(offset,offset+rowsPerPage);let x=mx;
    doc.setFillColor(15,39,66);doc.setDrawColor(190,200,210);doc.setTextColor(255);
    widths.forEach((w,i)=>{doc.setFillColor(15,39,66);doc.setTextColor(255);doc.rect(x,top,w,headH,'FD');doc.setFont('helvetica','bold');doc.setFontSize(6.8);doc.text(headers[i],x+w/2,top+5.6,{align:'center'});x+=w;});
    doc.setTextColor(0);
    group.forEach((item,index)=>{
      const y=top+headH+index*rowH;x=mx;
      if(index%2===0){doc.setFillColor(246,249,252);doc.rect(mx,y,W,rowH,'F');}
      const id=[item.idType,item.idNumber].filter(Boolean).join(' ');
      const values=[fmtDate(item.date),item.city,item.support,item.thirdParty||'No suministrado',id||'No suministrado',item.category,receiptConcept(item),money(item.amount)];
      widths.forEach((w,i)=>{doc.setDrawColor(205,212,220);doc.rect(x,y,w,rowH);doc.setFont('helvetica',i===6||i===7?'bold':'normal');doc.setFontSize(i===6?7.35:7.1);const lines=doc.splitTextToSize(String(values[i]||''),w-3).slice(0,2);const yy=y+(lines.length===1?7.2:5.1);doc.text(lines,i===7?x+w-1.5:x+1.5,yy,{align:i===7?'right':'left'});x+=w;});
    });
    doc.setFillColor(231,238,245);doc.rect(mx,ps.h-18,W,7,'F');doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(15,39,66);doc.text(`Movimientos ${offset+1}-${offset+group.length} de ${all.length}`,mx+2,ps.h-13.3);doc.text(`Total legalizado: ${money(totals().spent)}`,mx+W-2,ps.h-13.3,{align:'right'});doc.setTextColor(0);
  }
  return page;
}
function supportHeaderLayout(doc,item,fileName,pageIndex,pageCount,width){
  const entries=[{text:`${fmtDate(item.date)} · ${item.city||''} · ${money(item.amount)}`,style:'bold',size:8.2},{text:item.thirdParty||'No suministrado',style:'bold',size:7.7},{text:`${item.category||'Concepto'}: ${receiptConcept(item)}`,style:'normal',size:7.3},{text:`Archivo: ${fileName||'Sin nombre'}`,style:'normal',size:7.1}];
  if(pageCount>1)entries.push({text:`Hoja ${pageIndex+1} de ${pageCount}`,style:'bold',size:7.2});
  const rows=[];for(const entry of entries){doc.setFont('helvetica',entry.style);doc.setFontSize(entry.size);for(const line of doc.splitTextToSize(String(entry.text),width))rows.push({...entry,text:line})}
  return{rows,height:Math.max(23,7+rows.reduce((sum,row)=>sum+row.size*.36+1.05,0))};
}
async function drawSupportPage(doc,src,item,fileName,supportNumber,pageIndex,pageCount,logo,pdfPageNumber){
  const dim=await imgDim(src),ps=pageSize(doc),mx=12,title=`SOPORTE ${supportNumber} - ${String(item.support||'DOCUMENTO').toUpperCase()}${pageCount>1?` · Hoja ${pageIndex+1} de ${pageCount}`:''}`;
  addHeader(doc,title,logo,pdfPageNumber);
  const layout=supportHeaderLayout(doc,item,fileName,pageIndex,pageCount,ps.w-mx*2-6),infoY=25;
  doc.setFillColor(239,244,249);doc.setDrawColor(182,194,205);doc.roundedRect(mx,infoY,ps.w-mx*2,layout.height,2,2,'FD');
  doc.setTextColor(15,39,66);let y=infoY+5;
  for(const row of layout.rows){doc.setFont('helvetica',row.style);doc.setFontSize(row.size);doc.text(row.text,mx+3,y);y+=row.size*.36+1.05}
  const frameY=infoY+layout.height+4,frame={x:mx,y:frameY,w:ps.w-mx*2,h:ps.h-frameY-13};
  doc.setFillColor(255);doc.setDrawColor(165,175,185);doc.roundedRect(frame.x,frame.y,frame.w,frame.h,1.5,1.5,'FD');
  const inner=4,ratio=Math.min((frame.w-inner*2)/dim.w,(frame.h-inner*2)/dim.h),iw=dim.w*ratio,ih=dim.h*ratio;
  doc.addImage(src,'JPEG',frame.x+(frame.w-iw)/2,frame.y+(frame.h-ih)/2,iw,ih,undefined,'FAST');
}
async function drawScof(doc,all,logo,pageIndex=0,pageCount=1){
  // v1.7.7: formulario vectorial. No se superpone texto sobre una imagen.
  // Todas las líneas, celdas y textos se dibujan en el mismo sistema de coordenadas.
  const m=state.meta,t=totals(),viaticos=isViaticos(),rowCount=viaticos?30:43,pageMovements=all.slice(pageIndex*rowCount,(pageIndex+1)*rowCount),pageSpent=pageMovements.reduce((sum,item)=>sum+(+item.amount||0),0);
  const ps=pageSize(doc),mx=4.5,my=4.5,W=ps.w-2*mx,H=ps.h-2*my;
  const blue=[218,228,239], ink=[0,0,0];
  doc.setTextColor(...ink);doc.setDrawColor(...ink);doc.setLineWidth(.22);
  const txt=(text,x,y,size=5.8,style='normal',align='left',maxW=0)=>{
    doc.setFont('helvetica',style);doc.setFontSize(size);
    const value=String(text??'');
    if(maxW){const lines=doc.splitTextToSize(value,maxW).slice(0,2);doc.text(lines,x,y,{align});}
    else doc.text(value,x,y,{align});
  };
  const cellText=(text,x,y,w,h,size=5.2,style='normal',align='left')=>{
    doc.setFont('helvetica',style);doc.setFontSize(size);
    const pad=1.2, value=String(text??'');
    const lines=doc.splitTextToSize(value,w-pad*2).slice(0,2);
    const lineH=size*0.36, total=lineH*lines.length;
    let yy=y+h/2-total/2+lineH*.78;
    for(const line of lines){let xx=x+pad;if(align==='center')xx=x+w/2;if(align==='right')xx=x+w-pad;doc.text(line,xx,yy,{align});yy+=lineH;}
  };
  // Encabezado oficial
  const headH=15, codeW=43;
  doc.setFillColor(...blue);doc.rect(mx,my,W,headH,'FD');
  doc.line(mx+W-codeW,my,mx+W-codeW,my+headH);
  // La división central existe únicamente en la primera fila; FECHA y Páginas son celdas combinadas en la plantilla oficial.
  doc.line(mx+W-codeW/2,my,mx+W-codeW/2,my+8);
  doc.line(mx+W-codeW,my+8,mx+W,my+8);
  doc.line(mx+W-codeW,my+11.5,mx+W,my+11.5);
  if(logo)doc.addImage(logo,'PNG',mx+3,my+2,24,9);
  txt(viaticos?'VIÁTICOS':'CAJA MENOR',mx+W/2,my+9.3,11,'bold','center');
  txt('SCOF01',mx+W-codeW*0.75,my+4.8,5.2,'bold','center');
  txt('VERSIÓN No:002',mx+W-codeW*0.25,my+4.8,5.0,'bold','center');
  txt('FECHA: 2025-06-19',mx+W-codeW/2,my+10.4,4.5,'bold','center');
  txt(`Páginas: ${String(pageIndex+1).padStart(2,'0')} de ${String(pageCount).padStart(2,'0')}`,mx+W-codeW/2,my+14.1,4.5,'bold','center');

  // Datos generales
  const top=my+18,leftW=104,rightX=mx+177;
  txt('LUGAR Y FECHA',mx,top+2.2,5.1,'bold');doc.line(mx+30,top+3,mx+leftW,top+3);cellText(m.placeDate,mx+30,top-1,leftW-30,5,5.4,'normal');
  txt('PERIODO',mx,top+8.2,5.1,'bold');doc.line(mx+30,top+9,mx+leftW,top+9);cellText(m.period,mx+30,top+5,leftW-30,5,5.4,'normal');
  const labels=viaticos?['NOMBRE:','ÁREA:','CARGO:']:['NOMBRE RESPONSABLE:','ÁREA:','CARGO:','AERONAVE:'];
  const vals=viaticos?[m.responsible,m.area,m.position]:[m.responsible,m.area,m.position,m.aircraft];
  labels.forEach((lab,i)=>{const yy=top+i*4.4;txt(lab,rightX,yy+2.2,4.8,'bold');doc.line(rightX+31,yy+3,rightX+72,yy+3);cellText(vals[i],rightX+31,yy-1,41,4.5,5.1,'normal');});

  // Resumen de saldos
  const boxX=mx,boxY=top+14,boxW=67,rowH=3.75,labelW=30;
  const rows=viaticos?[
    ['TARJETA PEOPLE PASS:',m.cardNumber],['Saldo Inicial:',money(m.initialBalance)],['Gastos Viáticos:',money(t.spent)],['Saldo Final:',money(t.balance)]
  ]:[
    ['TARJETA PEOPLE PASS:',m.cardNumber],['Saldo Inicial:',money(m.initialBalance)],['2do Depósito:',money(m.secondDeposit)],['Gastos Caja Menor:',money(t.spent)],['Saldo Final:',money(t.balance)]
  ];
  rows.forEach((r,i)=>{const y=boxY+i*rowH;doc.setFillColor(...(i%2?[255,255,255]:blue));doc.rect(boxX,y,boxW,rowH,'FD');doc.line(boxX+labelW,y,boxX+labelW,y+rowH);cellText(r[0],boxX,y,labelW,rowH,4.6,'bold');cellText(r[1],boxX+labelW,y,boxW-labelW,rowH,5.1,'bold','right');});

  // Tabla contable: dimensiones fijas dentro de la hoja carta horizontal
  const tableY=top+36, tableH=117, header=6.2;
  const colPct=[.11,.135,.145,.145,.12,.11,.16,.075];
  const colNames=['FECHA','CIUDAD DEL GASTO','DOCUMENTO SOPORTE','NOMBRE TERCERO','TIPO ID','NÚMERO ID','CONCEPTO','TOTAL'];
  let xs=[mx];for(const p of colPct)xs.push(xs[xs.length-1]+W*p);
  doc.rect(mx,tableY,W,tableH);
  for(let i=1;i<xs.length-1;i++)doc.line(xs[i],tableY,xs[i],tableY+tableH);
  doc.setFillColor(245,247,249);doc.rect(mx,tableY,W,header,'F');doc.rect(mx,tableY,W,header);
  colNames.forEach((n,i)=>cellText(n,xs[i],tableY,xs[i+1]-xs[i],header,4.7,'bold','center'));
  const row=(tableH-header-4.5)/rowCount;
  for(let i=0;i<=rowCount;i++){const y=tableY+header+i*row;doc.line(mx,y,mx+W,y);}
  pageMovements.forEach((it,i)=>{
    const y=tableY+header+i*row;
    const vals2=[fmtDate(it.date),it.city,it.support,it.thirdParty,it.idType,it.idNumber,it.category,new Intl.NumberFormat('es-CO').format(it.amount)];
    vals2.forEach((v,j)=>cellText(v,xs[j],y,xs[j+1]-xs[j],row,4.15,j===7?'bold':'normal',j===7?'right':'left'));
  });
  const totalY=tableY+tableH-4.5;doc.line(xs[6],totalY,mx+W,totalY);cellText('TOTAL',xs[6],totalY,xs[7]-xs[6],4.5,4.7,'bold','right');cellText(new Intl.NumberFormat('es-CO').format(pageSpent),xs[7],totalY,xs[8]-xs[7],4.5,5.0,'bold','right');

  // Observaciones
  const obsY=tableY+tableH+2,obsH=13;doc.rect(mx,obsY,W,obsH);txt(viaticos?'OBSERVACIONES (MOTIVO DEL VIAJE):':'OBSERVACIONES:',mx+1,obsY+3,4.8,'bold');cellText(m.observations,mx+1,obsY+3,W-2,obsH-3,5.0,'normal');

  // Instrucciones y aprobaciones
  const footY=obsY+obsH+3,signW=66,signX=mx+W-signW;
  txt('INSTRUCCIONES',mx,footY+2.2,4.6,'bold');
  const instr=viaticos?[
    '1) Las sumas fijadas para viáticos diarios incluyen alojamiento, comida, representaciones, propinas.',
    '2) Las cuentas deberán presentarse dentro de los diez (10) días siguientes a la terminación del viaje.',
    '3) Contabilidad ordenará el pago cuando la cuenta esté debidamente aprobada.',
    '4) Anexar documentos soporte, tiquetes, pasabordos e informe de actividades.'
  ]:[
    '1) Las sumas fijadas para viáticos diarios incluyen alojamiento, comida, representaciones, propinas.',
    '2) Las cuentas deberán presentarse dentro de los diez (10) días siguientes a la terminación del viaje.',
    '3) Contabilidad ordenará el pago cuando la cuenta esté debidamente aprobada.',
    '4) Anexar documentos soporte de los gastos varios, tiquetes y pasabordos utilizados.'
  ];
  instr.forEach((z,i)=>txt(z,mx,footY+5+i*2.5,3.7,'normal'));
  doc.setFillColor(...blue);doc.rect(signX,footY,signW,19,'FD');
  ['FIRMA','Vo.Bo.','APROBADA','CÁRGUESE'].forEach((z,i)=>{const y=footY+i*4.75;if(i)doc.line(signX,y,signX+signW,y);txt(z,signX+20,y+3.1,4.5,'bold','right');doc.line(signX+22,y+3.2,signX+signW-2,y+3.2);});
}
function receiptConcept(item){
  const category=String(item.category||'').trim();
  const detail=String(item.detail||'').trim();
  if(category&&detail&&detail.toLowerCase()!==category.toLowerCase())return `${category}: ${detail}`;
  return detail||category||'Sin descripción';
}
function pdfImageRect(doc,imgW,imgH){
  // Hoja carta horizontal con margen estrecho fijo de 4 mm.
  // Se usa toda el área útil para que el formato contable no quede reducido.
  const {w,h}=pageSize(doc),margin=4;
  const rw=w-margin*2,rh=h-margin*2;
  return{x:margin,y:margin,w:rw,h:rh,sx:rw/imgW,sy:rh/imgH};
}
function pdfAt(rect,px,py){return{x:rect.x+px*rect.sx,y:rect.y+py*rect.sy}}
function pdfWidth(rect,px){return px*rect.sx}
function drawReceipt(doc,x,y,w,h,item,num,logo){
  // Recibo compacto profesional para impresión eficiente: cuadrícula 2 x 2.
  const green=[42,145,38],navy=[15,39,66],pale=[240,245,249],line=[92,108,120];
  const headerH=17,dateH=10,paidH=10,conceptH=17,lettersH=15,bottomH=16;
  const totalH=headerH+dateH+paidH+conceptH+lettersH+bottomH;
  const baseY=y+(h-totalH)/2;
  doc.setDrawColor(...line);doc.setLineWidth(.32);doc.roundedRect(x,baseY,w,totalH,1.5,1.5);
  doc.setFillColor(...navy);doc.roundedRect(x,baseY,w,2.2,1.5,1.5,'F');
  if(logo)doc.addImage(logo,'PNG',x+3,baseY+2,25,8.5);
  doc.setFillColor(...green);doc.roundedRect(x+w-47,baseY+3,44,12,1.3,1.3,'F');
  doc.setTextColor(255);doc.setFont('helvetica','bold');doc.setFontSize(8.0);doc.text('RECIBO DE',x+w-25,baseY+7.4,{align:'center'});doc.text('CAJA MENOR',x+w-25,baseY+11.8,{align:'center'});doc.setTextColor(...navy);
  const top=baseY+headerH,c1=x+w*.40,c2=x+w*.50,c3=x+w*.60,c4=x+w*.74;
  doc.rect(x,top,w,dateH);[c1,c2,c3,c4].forEach(xx=>doc.line(xx,top,xx,top+dateH));
  doc.setFont('helvetica','bold');doc.setFontSize(7.3);doc.text('CIUDAD',x+2,top+3);doc.text('DÍA',c1+1.5,top+3);doc.text('MES',c2+1.5,top+3);doc.text('AÑO',c3+1.5,top+3);doc.setTextColor(...green);doc.text('No.',c4+1.5,top+3);doc.setTextColor(...navy);
  const d=new Date(item.date+'T00:00:00');fit(doc,item.city,x+2,top+7.7,c1-x-4,1,8.8,'bold');doc.setFont('helvetica','bold');doc.setFontSize(8.3);doc.text(String(d.getDate()).padStart(2,'0'),c1+5,top+7.7);doc.text(String(d.getMonth()+1).padStart(2,'0'),c2+5,top+7.7);doc.text(String(d.getFullYear()),c3+4,top+7.7);doc.text(`RC-${String(num).padStart(3,'0')}`,c4+2,top+7.7);
  let yy=top+dateH;doc.rect(x,yy,w,paidH);doc.line(x+w*.72,yy,x+w*.72,yy+paidH);doc.setFont('helvetica','bold');doc.setFontSize(7.3);doc.text('PAGADO A',x+2,yy+3);doc.text('$',x+w*.74,yy+7.7);fit(doc,item.thirdParty,x+2,yy+7.7,w*.67,1,8.8,'bold');doc.setFont('helvetica','bold');doc.setFontSize(9.2);doc.text(new Intl.NumberFormat('es-CO').format(item.amount),x+w-2.5,yy+7.7,{align:'right'});
  yy+=paidH;doc.rect(x,yy,w,conceptH);doc.setFont('helvetica','bold');doc.setFontSize(7.4);doc.text('CONCEPTO / DESCRIPCIÓN',x+2,yy+3.2);fit(doc,receiptConcept(item),x+2,yy+8,w-4,2,9.35,'bold');
  yy+=conceptH;doc.setFillColor(...pale);doc.rect(x,yy,w,lettersH,'FD');doc.setFont('helvetica','bold');doc.setFontSize(7.2);doc.text('VALOR (EN LETRAS)',x+2,yy+3.2);fit(doc,`${words(item.amount)} PESOS M/CTE`,x+2,yy+8,w-4,2,8.3,'bold');
  yy+=lettersH;doc.rect(x,yy,w,bottomH);const leftW=w*.34;doc.line(x+leftW,yy,x+leftW,yy+bottomH);doc.line(x,yy+bottomH/2,x+leftW,yy+bottomH/2);doc.setFont('helvetica','bold');doc.setFontSize(7.0);doc.setTextColor(...navy);doc.text('CÓDIGO',x+2,yy+3.7);doc.text('APROBADO',x+2,yy+bottomH/2+3.7);doc.text('FIRMA DE RECIBIDO',x+leftW+2,yy+3.7);
  const sigY=yy+bottomH-4;if(item.signature)doc.addImage(item.signature,'PNG',x+leftW+20,yy+1,w-leftW-24,bottomH-5);doc.line(x+leftW+2,sigY,x+w-2,sigY);doc.setFont('helvetica','bold');doc.setFontSize(6.2);const isNit=/nit|rut/i.test(item.idType||'');doc.text(isNit?'NIT:':'C.C.:',x+leftW+2,yy+bottomH-1.2);fit(doc,item.idNumber,x+leftW+14,yy+bottomH-1.2,w-leftW-16,1,8.0,'bold');doc.setTextColor(0);
}
function receiptNumber(item){const sorted=[...state.movements].filter(x=>x.support==='Recibo de Caja').sort((a,b)=>(a.date+a.createdAt).localeCompare(b.date+b.createdAt));return Math.max(1,sorted.findIndex(x=>x.id===item.id)+1)}
function receiptHtml(item){
  const d=new Date(item.date+'T00:00:00'),num=receiptNumber(item),idLabel=/nit|rut/i.test(item.idType||'')?'NIT':'C.C.';
  return `<div class="receipt-paper"><div class="receipt-top"><div class="receipt-brand"><img src="assets/sis-logo.png" alt="SIS"></div><div class="receipt-title">RECIBO DE<br>CAJA MENOR</div></div><div class="receipt-grid"><div class="receipt-row receipt-date"><div><div class="receipt-label">Ciudad</div><div class="receipt-value">${safe(item.city)}</div></div><div><div class="receipt-label">Día</div><div class="receipt-value">${String(d.getDate()).padStart(2,'0')}</div></div><div><div class="receipt-label">Mes</div><div class="receipt-value">${String(d.getMonth()+1).padStart(2,'0')}</div></div><div><div class="receipt-label">Año</div><div class="receipt-value">${d.getFullYear()}</div></div><div><div class="receipt-label">No.</div><div class="receipt-value">RC-${String(num).padStart(3,'0')}</div></div></div><div class="receipt-row receipt-paid"><div><div class="receipt-label">Pagado a</div><div class="receipt-value">${safe(item.thirdParty)}</div></div><div><div class="receipt-label">Valor</div><div class="receipt-amount">${money(item.amount)}</div></div></div><div class="receipt-row receipt-one"><div><div class="receipt-label">Concepto</div><div class="receipt-value">${safe(receiptConcept(item))}</div></div></div><div class="receipt-row receipt-one receipt-words"><div><div class="receipt-label">Valor en letras</div><div class="receipt-value">${words(item.amount)} PESOS M/CTE</div></div></div><div class="receipt-row receipt-bottom"><div class="receipt-bottom-left"><div><div class="receipt-label">Código</div><div class="receipt-value"></div></div><div><div class="receipt-label">Aprobado</div><div class="receipt-value"></div></div></div><div class="receipt-signature"><div class="receipt-label">Firma de recibido</div>${item.signature?`<img src="${item.signature}" alt="Firma">`:'<div class="receipt-value receipt-missing">Falta firma</div>'}<div class="receipt-sign-line">${idLabel}: ${safe(item.idNumber)}</div></div></div></div></div>`;
}

function openSupportPreview(id){
  const item=state.movements.find(x=>x.id===id);if(!item)return;
  const attachments=item.attachments||[];
  if(!attachments.length)return openExpenseAction(id,'scan');
  previewSupportId=id;$('#supportTitle').textContent=`Soportes · ${item.detail||item.category}`;$('#supportInfo').textContent=`${fmtDate(item.date)} · ${item.thirdParty||'Sin tercero'} · ${money(item.amount)} · ${attachments.length} archivo(s)`;
  $('#supportGallery').innerHTML=attachments.flatMap((a,ai)=>a.type==='application/pdf'&&a.data?[`<article class="support-page"><button type="button" data-pdf="${ai}">📄 Abrir PDF</button><div><strong>Documento PDF</strong><small>${safe(a.name)}</small></div></article>`]:(a.pages||[]).map((src,pi)=>`<article class="support-page"><img src="${src}" alt="Soporte ${ai+1}.${pi+1}"><div><strong>Página ${pi+1}</strong><small>${safe(a.name)}</small></div></article>`)).join('');
  $('#supportGallery').querySelectorAll('[data-pdf]').forEach(button=>button.onclick=()=>openOriginalSupport(attachments[Number(button.dataset.pdf)]));
  $('#supportModal').classList.remove('hidden');
}
$('#closeSupport').onclick=()=>$('#supportModal').classList.add('hidden');
$('#supportEdit').onclick=()=>{const id=previewSupportId;$('#supportModal').classList.add('hidden');openExpense(id)};
$('#supportDownload').onclick=()=>{const item=state.movements.find(x=>x.id===previewSupportId);if(!item)return;let n=0;for(const a of item.attachments||[]){if(a.type==='application/pdf'&&a.data){const link=document.createElement('a');link.href=a.data;link.download=a.name||`Soporte_${item.date}.pdf`;link.click();continue}for(const src of a.pages||[]){n++;const link=document.createElement('a');link.href=src;link.download=`Soporte_${item.date}_${String(n).padStart(2,'0')}.jpg`;link.click()}}toast('Descarga iniciada')};

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
  if(!window.jspdf?.jsPDF)throw new Error('No se cargó el generador local de PDF. Cierre y vuelva a abrir la aplicación.');const doc=createLandscapePdf(),logo=await logoData();
  addHeader(doc,'RECIBO DE CAJA MENOR',logo,1);drawReceipt(doc,12,40,pageSize(doc).w-24,112,item,receiptNumber(item),logo);
  downloadBlob(doc.output('blob'),`Recibo_RC-${String(receiptNumber(item)).padStart(3,'0')}_${item.thirdParty||'SIS'}_${item.date}.pdf`);
};

async function imgDim(src){return new Promise((ok,fail)=>{const im=new Image();const timer=setTimeout(()=>fail(new Error('El soporte tardó demasiado en cargarse.')),12000);im.onload=()=>{clearTimeout(timer);ok({w:im.naturalWidth||im.width,h:im.naturalHeight||im.height})};im.onerror=()=>{clearTimeout(timer);fail(new Error('No se pudo leer una imagen de soporte.'));};im.src=src})}
async function pdfPagesForExport(dataUrl,fileName='PDF adjunto'){const encoded=String(dataUrl||'').split(',')[1];if(!encoded)throw new Error('El PDF adjunto no contiene datos válidos.');const binary=atob(encoded),data=Uint8Array.from(binary,ch=>ch.charCodeAt(0)),pdf=await pdfjsLib.getDocument({data}).promise,pages=[];for(let i=1;i<=pdf.numPages;i++){const source=await pdf.getPage(i),viewport=source.getViewport({scale:1.7}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);const context=canvas.getContext('2d',{willReadFrequently:true});await source.render({canvasContext:context,viewport}).promise;let text='';try{text=(await source.getTextContent()).items.map(item=>item.str||'').join(' ')}catch(error){console.warn('[SIS PDF] No se pudo analizar texto',fileName,i,error)}const result=SISSupportUtils.isEffectivelyBlankPdfPage(context.getImageData(0,0,canvas.width,canvas.height),text);console.info(`[SIS PDF] ${fileName} · página ${i}: ${result.blank?'omitida':'conservada'} · ${result.reason}`,result.metrics);if(!result.blank)pages.push(canvas.toDataURL('image/jpeg',.82))}return pages}
async function buildConsolidatedPdf({reviewMode=false}={}){
  if(!reviewMode){
    const validation=validateCommission({requireDates:true,requireMovements:true});if(validation)throw new Error(validation);
    const missing=state.movements.filter(x=>!movementStatus(x).complete);if(missing.length&&!confirm(`Hay ${missing.length} movimiento(s) con firma o soporte pendiente. ¿Generar de todas formas?`))return null;
    const receiptAttachments=state.movements.filter(x=>x.support==='Recibo de Caja'&&x.attachments?.length);if(receiptAttachments.length&&!confirm(`Hay ${receiptAttachments.length} Recibo(s) de Caja con archivos adicionales. El soporte principal es el recibo firmado. ¿Continuar con esos anexos?`))return null;
    const duplicateGroups=await SISSupportUtils.duplicateGroups(state.movements);if(duplicateGroups.length&&!confirm(`${duplicateSupportMessage(duplicateGroups,'Se detectaron soportes repetidos entre movimientos. Revise los adjuntos antes de generar el informe.')}\n\nAceptar: generar conscientemente. Cancelar: volver a editar.`))return null;
  }
  if(!window.jspdf?.jsPDF)throw new Error('No se cargó el generador local de PDF. Cierre y vuelva a abrir la aplicación.');
  if(!window.SISOfficialPagination)throw new Error('No se cargó el paginador del formato oficial. Cierre y vuelva a abrir la aplicación.');
  const doc=createLandscapePdf(),logo=await logoData(),all=[...state.movements].sort((a,b)=>(a.date+a.createdAt).localeCompare(b.date+b.createdAt)),officialPages=window.SISOfficialPagination.paginate(all,isViaticos()?30:43);
  for(let i=0;i<officialPages.length;i++){if(i)doc.addPage('letter','landscape');await drawScof(doc,all,logo,i,officialPages.length)}
  let page=officialPages.length,receipts=all.filter(x=>x.support==='Recibo de Caja');
  for(let i=0;i<receipts.length;i+=4){doc.addPage('letter','landscape');addHeader(doc,'RECIBOS DE CAJA MENOR',logo,++page);const group=receipts.slice(i,i+4),slots=[{x:5,y:24},{x:141,y:24},{x:5,y:111},{x:141,y:111}];for(let j=0;j<group.length;j++)drawReceipt(doc,slots[j].x,slots[j].y,134,82,group[j],i+j+1,logo)}
  let supportNumber=page;
  for(const x of all){for(const a of x.attachments||[]){const supportPages=a.type==='application/pdf'&&a.data?await pdfPagesForExport(a.data,a.name):(a.pages||[]);if(!supportPages.length){console.warn('[SIS PDF] Soporte omitido porque todas sus páginas estaban vacías:',a.name);continue}supportNumber++;for(let p=0;p<supportPages.length;p++){doc.addPage('letter','landscape');await drawSupportPage(doc,supportPages[p],x,a.name,supportNumber,p,supportPages.length,logo,++page)}}}
  const blob=doc.output('blob');if(!blob?.size)throw new Error('El PDF consolidado se generó sin contenido.');
  const signature=new TextDecoder().decode((await blob.slice(0,5).arrayBuffer()));if(signature!=='%PDF-')throw new Error('El archivo final no tiene un formato PDF válido.');
  return{blob,filename:`SIS_${reportSlug()}_${state.meta.aircraft||'SCOF01'}_${today()}.pdf`,pages:doc.getNumberOfPages()};
}
$('#exportPdf').onclick=async()=>{
  const button=$('#exportPdf');setButtonBusy(button,true,'Generando PDF…');
  try{const result=await buildConsolidatedPdf();if(!result)return;downloadBlob(result.blob,result.filename);await archiveCurrent();toast(`PDF de ${reportName()} generado correctamente`)}
  catch(e){console.error(e);alert('No fue posible generar el PDF: '+e.message)}finally{setButtonBusy(button,false)}
};

function legalizationEmailSubject(){const context=[String(state.meta.placeDate||'').trim(),String(state.meta.period||'').trim()].filter(Boolean);return`Legalización ${reportName()} - ${context.length?context.join(' - '):fmtDate(today())}`}
function legalizationEmailBody(){return`Buenos días,\n\nAdjunto envío la documentación correspondiente a la legalización de ${reportName()}.\n\nAgradezco su apoyo con la revisión y trámite correspondiente.\n\nCordial saludo.`}
function legalizationEmailsText(){return LEGALIZACION_EMAILS.join(', ')}
function legalizationReviewStats(){
  const movements=state.movements||[],withSupport=movements.filter(x=>x.support==='Recibo de Caja'?!!x.signature:!!x.attachments?.length).length,missingData=movements.filter(x=>!x.date||!String(x.category||x.detail||'').trim()||!Number.isFinite(Number(x.amount))||Number(x.amount)<=0).length;
  return{movements:movements.length,total:movements.reduce((sum,x)=>sum+(Number(x.amount)||0),0),withSupport,withoutSupport:movements.length-withSupport,missingData,documents:movements.reduce((sum,x)=>sum+(x.support==='Recibo de Caja'?1:(x.attachments?.length||0)),0)};
}
function reviewRow(level,title,detail=''){const icons={ok:'✓',warning:'⚠',error:'✕'};return`<div class="send-check ${level}"><span>${icons[level]}</span><div><strong>${safe(title)}</strong>${detail?`<small>${safe(detail)}</small>`:''}</div></div>`}
function renderSendReview(review){
  const box=$('#sendReviewSummary'),button=$('#continueSend');
  $('#sendRecipientList').innerHTML=`<small>CORREOS SIS</small>${LEGALIZACION_EMAILS.map(email=>`<strong>${safe(email)}</strong>`).join('')}`;
  if(review.error){box.innerHTML=reviewRow('error','No fue posible preparar el PDF',review.error);$('#sendReviewMessage').textContent='Corrija el error técnico o vuelva a intentarlo. No se abrirá un correo sin un PDF válido.';button.disabled=true;return}
  const s=review.stats,rows=[reviewRow('ok',`${s.movements} gasto(s) registrado(s)`,`Valor total: ${money(s.total)}`),reviewRow('ok',`${s.withSupport} gasto(s) con soporte`),s.withoutSupport?reviewRow('warning',`${s.withoutSupport} gasto(s) sin soporte`,'Esta advertencia no impide continuar.'):reviewRow('ok','Todos los gastos tienen soporte'),s.missingData?reviewRow('warning',`${s.missingData} gasto(s) con información principal incompleta`,'Revise fecha, concepto y valor si corresponde.'):reviewRow('ok','Datos principales disponibles'),review.duplicateCount?reviewRow('warning',`${review.duplicateCount} soporte(s) repetido(s)`,'Puede continuar y corregirlos posteriormente si es necesario.'):reviewRow('ok','Sin soportes duplicados detectados'),reviewRow('ok','PDF consolidado generado',`${review.pdf.pages} página(s) · ${s.documents} documento(s) aproximado(s)`),reviewRow('ok','Destinatarios configurados',LEGALIZACION_EMAILS.join(' · '))];
  box.innerHTML=rows.join('');$('#sendReviewMessage').textContent=s.withoutSupport||s.missingData||review.duplicateCount?'Se encontraron advertencias documentales. Puede continuar con el envío.':'La legalización está lista para preparar el correo.';button.disabled=false;
}
async function reviewLegalizationForSend(){
  const button=$('#reviewAndSend');setButtonBusy(button,true,'REVISANDO…');pendingLegalizationShare=null;$('#sendReviewModal').classList.remove('hidden');$('#sendReviewSummary').innerHTML=reviewRow('ok','Generando y verificando el PDF…');$('#sendReviewMessage').textContent='La revisión no modifica los gastos ni sus soportes.';$('#continueSend').disabled=true;
  try{refreshMetaFromVisibleForm();const stats=legalizationReviewStats(),duplicateCount=(await SISSupportUtils.duplicateGroups(state.movements)).length,pdf=await buildConsolidatedPdf({reviewMode:true});pendingLegalizationShare={pdf,subject:legalizationEmailSubject(),body:legalizationEmailBody()};renderSendReview({stats,duplicateCount,pdf})}
  catch(error){console.error(error);renderSendReview({error:error.message||'Ocurrió un error técnico desconocido.'})}finally{setButtonBusy(button,false)}
}
async function prepareLegalizationEmail(){
  const prepared=pendingLegalizationShare;if(!prepared?.pdf?.blob?.size)return alert('El PDF final no está disponible. Vuelva a revisar la legalización.');
  const button=$('#continueSend');setButtonBusy(button,true,'PREPARANDO…');
  try{
    const file=new File([prepared.pdf.blob],prepared.pdf.filename,{type:'application/pdf'}),shareData={files:[file],title:prepared.subject,text:prepared.body},canShareFiles=!!navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}));
    if(canShareFiles){await navigator.share(shareData);toast('Documento preparado para compartir')}
    else{downloadBlob(prepared.pdf.blob,prepared.pdf.filename);toast('PDF descargado. Compártalo desde Archivos o Descargas.')}
  }catch(error){if(error?.name!=='AbortError'){console.error(error);alert('No fue posible abrir el mecanismo de compartir: '+error.message)}}finally{setButtonBusy(button,false)}
}
async function copyLegalizationEmails(){
  const text=legalizationEmailsText();
  try{
    if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
    else{const area=document.createElement('textarea');area.value=text;area.setAttribute('readonly','');area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();const copied=document.execCommand('copy');area.remove();if(!copied)throw new Error('El navegador rechazó la copia.')}
    toast('Correos copiados');
  }catch(error){console.error(error);toast('No fue posible copiar. Los correos permanecen visibles para copiarlos manualmente.')}
}
$('#reviewAndSend').onclick=reviewLegalizationForSend;$('#retrySendReview').onclick=reviewLegalizationForSend;$('#closeSendReview').onclick=()=>$('#sendReviewModal').classList.add('hidden');$('#continueSend').onclick=prepareLegalizationEmail;$('#copyLegalizationEmails').onclick=copyLegalizationEmails;

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
    if(file.size>100*1024*1024)throw new Error('La copia supera el límite de seguridad de 100 MB.');
    const p=JSON.parse(await file.text());
    if(!p||typeof p!=='object'||p.format!=='SIS_GASTOS_BACKUP'||p.version!==3||(!p.draft&&!Array.isArray(p.history)))throw new Error('El archivo no corresponde a una copia compatible de SIS Gastos.');
    const backupModule=p.module||p.draft?.meta?.reportType||'caja';if(backupModule!==activeModule)throw new Error(`Esta copia corresponde a ${backupModule==='viaticos'?'Viáticos':'Caja Menor'}. Cambie de módulo antes de restaurarla.`);
    const validReport=b=>b&&typeof b==='object'&&b.meta&&typeof b.meta==='object'&&Array.isArray(b.movements)&&b.movements.every(x=>x&&typeof x==='object'&&typeof x.id==='string'&&Number.isSafeInteger(Number(x.amount))&&Number(x.amount)>0);
    if(p.draft&&!validReport(p.draft))throw new Error('El borrador contiene datos inválidos.');
    if((p.history||[]).some(b=>!validReport(b)||typeof b.id!=='string'))throw new Error('El historial contiene datos inválidos.');
    if(!confirm('La restauración puede reemplazar informes con el mismo identificador. ¿Desea continuar?'))return;
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
function showExcelPreview(){try{const validation=validateCommission({requireDates:true,requireMovements:true});if(validation)return alert(validation);const all=[...state.movements].sort((a,b)=>(a.date+a.createdAt).localeCompare(b.date+b.createdAt)),t=totals(),outside=all.filter(x=>!dateInPeriod(x.date));$('#excelPreviewSummary').innerHTML=`<div><small>Tipo de informe</small><strong>${reportName()}</strong></div><div><small>Aeronave</small><strong>${safe(state.meta.aircraft)}</strong></div><div><small>Periodo</small><strong>${safe(state.meta.period)}</strong></div><div><small>Saldo inicial</small><strong>${money(state.meta.initialBalance)}</strong></div><div><small>Segundo depósito</small><strong>${money(state.meta.secondDeposit)}</strong></div><div><small>Total gastado</small><strong>${money(t.spent)}</strong></div><div><small>Disponible</small><strong>${money(t.balance)}</strong></div>${outside.length?`<div class="field-warning"><small>Advertencia</small><strong>${outside.length} gasto(s) fuera del periodo</strong></div>`:''}`;$('#excelPreviewRows').innerHTML=all.length?all.map(x=>`<tr class="${dateInPeriod(x.date)?'':'out-period'}"><td>${fmtDate(x.date)}</td><td>${safe(x.city)}</td><td>${safe(x.support)}</td><td>${safe(x.thirdParty)}</td><td>${safe(x.idNumber)}</td><td>${safe(x.category)}</td><td>${money(x.amount)}</td></tr>`).join(''):'<tr><td colspan="7">No hay movimientos registrados.</td></tr>';$('#excelPreviewModal').classList.remove('hidden')}catch(e){console.error(e);alert('No fue posible mostrar la vista previa: '+e.message)}}
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
const APP_VERSION='1.9.7';
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
