import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const start=app.indexOf('function validateCommission('),end=app.indexOf('\nfunction setButtonBusy',start);
assert.ok(start>=0&&end>start,'validateCommission debe existir');
const source=app.slice(start,end);

function validatorFor(state,{outside=false}={}){
  const refreshMetaFromVisibleForm=()=>{};
  const normalizeAircraft=value=>String(value||'').replace(/[^A-Z0-9-]/g,'');
  const dateInPeriod=()=>!outside;
  return Function('state','refreshMetaFromVisibleForm','normalizeAircraft','dateInPeriod',`${source};return validateCommission;`)(state,refreshMetaFromVisibleForm,normalizeAircraft,dateInPeriod);
}

const valid=()=>({meta:{aircraft:'HK1234',placeDate:'Bogotá',responsible:'Piloto',startDate:'2026-08-01',endDate:'2026-08-05',initialBalance:1000000,secondDeposit:0},movements:[{date:'2026-08-02',amount:1121000}]});
for(const [label,amount,balance] of [['positivo',900000,100000],['cero',1000000,0],['negativo',1121000,-121000]]){
  const state=valid();state.movements[0].amount=amount;
  assert.equal(state.meta.initialBalance+state.meta.secondDeposit-state.movements[0].amount,balance,`${label}: saldo calculado`);
  assert.equal(validatorFor(state)({requireDates:true,requireMovements:true}),'',`${label}: permite vista previa, Excel y PDF`);
}

const requiredCases=[
  ['aeronave',state=>state.meta.aircraft='',/aeronave/i],
  ['lugar',state=>state.meta.placeDate='',/lugar/i],
  ['responsable',state=>state.meta.responsible='',/responsable/i],
  ['fechas',state=>state.meta.startDate='',/fecha inicial/i],
  ['periodo',state=>state.meta.endDate='2026-07-31',/fecha final/i],
  ['saldo inicial',state=>state.meta.initialBalance=-1,/saldo inicial/i],
  ['segundo depósito',state=>state.meta.secondDeposit=-1,/segundo depósito/i],
  ['movimientos',state=>state.movements=[],/movimientos/i]
];
for(const [label,mutate,expected] of requiredCases){const state=valid();mutate(state);assert.match(validatorFor(state)({requireDates:true,requireMovements:true}),expected,`${label}: validación conservada`)}
assert.match(validatorFor(valid(),{outside:true})({requireDates:true,requireMovements:true}),/fuera del periodo/i,'gastos fuera del periodo: validación conservada');
assert.match(app,/firma o soporte pendiente/,'soportes y firmas: validación conservada');
assert.match(app,/money\(t\.balance\)/,'vista previa conserva el saldo real');
assert.match(app,/result:grandTotals\.balance/,'Excel conserva el saldo real');
assert.match(app,/\['Saldo Final:',money\(t\.balance\)\]/,'PDF conserva el saldo real');
assert.doesNotMatch(app,/totals\(\)\.balance<0/,'no existe bloqueo por saldo negativo');

console.log('Saldos positivo, cero y negativo (-$121.000): vista previa, Excel y PDF habilitados; validaciones restantes intactas.');
