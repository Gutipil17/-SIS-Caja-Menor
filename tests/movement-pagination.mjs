import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const ExcelJS=require('../vendor/exceljs.min.js');
const {jsPDF}=require('../vendor/jspdf.umd.min.js');
globalThis.window=globalThis;
await import('../official-pagination.js');

const template=await readFile(new URL('../assets/plantilla_SCOF01.xlsx',import.meta.url));
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
assert.doesNotMatch(app,/divídalo antes de exportar/);
assert.match(app,/for\(let i=0;i<officialPages\.length;i\+\+\)/);

for(const count of [43,44,86,87]){
  const movements=Array.from({length:count},(_,index)=>({id:`MOV-${String(index+1).padStart(3,'0')}`,amount:index+1}));
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(template);
  const source=workbook.worksheets.find(sheet=>sheet.name.trim()==='Caja Menor');
  const sourceWidths=source.columns.map(column=>column.width),sourceHeights=Array.from({length:78},(_,index)=>source.getRow(index+1).height),sourceMerges=source.model.merges.length,sourceImages=source.getImages().length;
  const pages=SISOfficialPagination.pagedWorksheets(workbook,source,movements,43,'Caja Menor');
  pages.forEach(({worksheet,pageCount,index,movements:pageMovements})=>{
    worksheet.getCell('K3').value=`Paginas: ${index+1} de ${pageCount}`;
    for(let row=20;row<=62;row++){worksheet.getCell(`C${row}`).value=null;worksheet.getCell(`K${row}`).value=null}
    pageMovements.forEach((movement,offset)=>{worksheet.getCell(`C${20+offset}`).value=movement.id;worksheet.getCell(`K${20+offset}`).value=movement.amount});
    worksheet.getCell('K63').value={formula:'SUM(K20:K62)'};
  });
  const output=await workbook.xlsx.writeBuffer(),reloaded=new ExcelJS.Workbook();await reloaded.xlsx.load(output);
  const officialSheets=reloaded.worksheets.filter(sheet=>sheet.name.trim().startsWith('Caja Menor'));
  assert.equal(officialSheets.length,Math.ceil(count/43),`${count}: cantidad de hojas`);
  const exported=officialSheets.flatMap(sheet=>Array.from({length:43},(_,offset)=>sheet.getCell(`C${20+offset}`).value).filter(Boolean));
  assert.deepEqual(exported,movements.map(item=>item.id),`${count}: movimientos completos y en orden`);
  for(const sheet of officialSheets){
    assert.deepEqual(sheet.columns.map(column=>column.width),sourceWidths,`${count}: anchos conservados`);
    assert.deepEqual(Array.from({length:78},(_,index)=>sheet.getRow(index+1).height),sourceHeights,`${count}: altos conservados`);
    assert.equal(sheet.model.merges.length,sourceMerges,`${count}: combinaciones conservadas`);
    assert.equal(sheet.getImages().length,sourceImages,`${count}: encabezado gráfico conservado`);
    assert.equal(sheet.getCell('K63').formula,'SUM(K20:K62)',`${count}: fórmula total conservada`);
  }
  const pdfPages=SISOfficialPagination.paginate(movements,43),doc=new jsPDF({orientation:'landscape',unit:'mm',format:'letter'});
  pdfPages.forEach((page,index)=>{if(index)doc.addPage('letter','landscape');doc.text(page.map(item=>item.id).join(','),10,10)});
  assert.equal(doc.getNumberOfPages(),Math.ceil(count/43),`${count}: páginas oficiales del PDF`);
  assert.deepEqual(pdfPages.flat().map(item=>item.id),movements.map(item=>item.id),`${count}: movimientos completos en PDF`);
  console.log(`${count} movimientos: ${officialSheets.length} hoja(s) Excel, ${doc.getNumberOfPages()} página(s) PDF, sin pérdidas`);
}
