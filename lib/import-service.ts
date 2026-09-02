import {createHash} from 'node:crypto'
import {maskPhone,normalizePhone,type Customer} from './domain'
import type {DuplicateField,DuplicateResolution,NormalizedImportCustomer,NormalizedImportPayload} from './import-types'

const DUPLICATE_FIELDS:DuplicateField[]=['visits','visitPoints','stamps','paymentPoints','lastVisit','source']

function stable(value:unknown):unknown{
  if(Array.isArray(value))return value.map(stable)
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,stable(item)]))
  }
  return value
}

function groupedImportedCustomers(rows:NormalizedImportCustomer[]){
  const map=new Map<string,NormalizedImportCustomer>()
  for(const row of rows){
    const previous=map.get(row.phone)
    map.set(row.phone,previous?{...previous,...Object.fromEntries(Object.entries(row).filter(([,value])=>value!==undefined))}:row)
  }
  return map
}

function comparison(customer:Customer){
  return {
    visits:customer.visits,
    visitPoints:customer.points,
    stamps:customer.stamps??0,
    paymentPoints:customer.paymentPoints??0,
    lastVisit:customer.lastVisit,
    source:customer.source,
  }
}

function importedComparison(customer:NormalizedImportCustomer){
  return {
    visits:customer.visits,
    visitPoints:customer.visitPoints,
    stamps:customer.stamps,
    paymentPoints:customer.paymentPoints,
    lastVisit:customer.lastVisit,
    source:customer.source,
  }
}

export function buildImportPreview(currentCustomers:Customer[],payload:NormalizedImportPayload){
  const currentByPhone=new Map(currentCustomers.map(customer=>[customer.phone,customer]))
  const imported=groupedImportedCustomers(payload.customers)
  const duplicates=[] as Array<{
    phone:string
    phoneMasked:string
    current:ReturnType<typeof comparison>
    imported:ReturnType<typeof importedComparison>
  }>
  let newCustomers=0
  for(const [phone,row] of imported){
    const current=currentByPhone.get(phone)
    if(!current){newCustomers++;continue}
    duplicates.push({phone,phoneMasked:maskPhone(phone),current:comparison(current),imported:importedComparison(row)})
  }
  return {
    newCustomers,
    duplicateCustomers:duplicates.length,
    duplicates,
    issues:payload.issues,
    unsupportedColumns:payload.unsupportedColumns,
    totals:{
      customers:imported.size,
      visits:payload.visits.length,
      pointHistory:payload.pointHistory.length,
      visitPoints:[...imported.values()].reduce((sum,row)=>sum+(row.visitPoints??0),0),
      stamps:[...imported.values()].reduce((sum,row)=>sum+(row.stamps??0),0),
      paymentPoints:[...imported.values()].reduce((sum,row)=>sum+(row.paymentPoints??0),0),
    },
  }
}

function assertNonNegativeInteger(value:unknown,code:string){
  if(value===undefined)return
  if(!Number.isInteger(value)||Number(value)<0)throw new Error(code)
}

function assertPayload(payload:NormalizedImportPayload){
  for(const customer of payload.customers){
    const normalized=normalizePhone(customer.phone)
    if(!/^010\d{8}$/.test(normalized)||normalized!==customer.phone)throw new Error('INVALID_IMPORT_PHONE')
    assertNonNegativeInteger(customer.visits,'INVALID_IMPORT_VISITS')
    assertNonNegativeInteger(customer.visitPoints,'INVALID_IMPORT_BALANCE')
    assertNonNegativeInteger(customer.stamps,'INVALID_IMPORT_BALANCE')
    assertNonNegativeInteger(customer.paymentPoints,'INVALID_IMPORT_BALANCE')
  }
  for(const visit of payload.visits){
    if(!/^010\d{8}$/.test(visit.phone))throw new Error('INVALID_IMPORT_PHONE')
    if(!/^\d{4}-\d{2}-\d{2}$/.test(visit.date))throw new Error('INVALID_IMPORT_DATE')
    if(visit.paymentAmount!==undefined&&(!Number.isFinite(visit.paymentAmount)||visit.paymentAmount<0))throw new Error('INVALID_IMPORT_PAYMENT_AMOUNT')
  }
  for(const entry of payload.pointHistory){
    if(!/^010\d{8}$/.test(entry.phone))throw new Error('INVALID_IMPORT_PHONE')
    if(!/^\d{4}-\d{2}-\d{2}$/.test(entry.date))throw new Error('INVALID_IMPORT_DATE')
    if(!Number.isFinite(entry.delta))throw new Error('INVALID_IMPORT_DELTA')
    if(!['visitPoints','stamps','paymentPoints'].includes(entry.target))throw new Error('INVALID_IMPORT_BALANCE_TARGET')
    if(entry.remainingBalance!==undefined)assertNonNegativeInteger(entry.remainingBalance,'INVALID_IMPORT_BALANCE')
  }
  if(payload.issues.some(issue=>issue.blocking))throw new Error('IMPORT_HAS_BLOCKING_ISSUES')
}

export function validateImportCommit(currentCustomers:Customer[],payload:NormalizedImportPayload,resolutions:DuplicateResolution[],acknowledged:boolean){
  if(!acknowledged)throw new Error('IMPORT_CONFIRM_REQUIRED')
  assertPayload(payload)
  const imported=groupedImportedCustomers(payload.customers)
  const currentByPhone=new Map(currentCustomers.map(customer=>[customer.phone,customer]))
  const resolutionByPhone=new Map(resolutions.map(resolution=>[resolution.phone,resolution]))

  for(const [phone,row] of imported){
    if(!currentByPhone.has(phone))continue
    const resolution=resolutionByPhone.get(phone)
    if(!resolution)throw new Error('DUPLICATE_RESOLUTION_REQUIRED')
    if(resolution.strategy==='manual'){
      for(const field of DUPLICATE_FIELDS){
        if((row as unknown as Record<string,unknown>)[field]!==undefined&&!resolution.fields?.[field])throw new Error('DUPLICATE_RESOLUTION_REQUIRED')
      }
    }
  }
  return {ok:true as const}
}

function semanticRow(row:Record<string,unknown>){
  const {sheetName:_sheetName,rowNumber:_rowNumber,...semantic}=row
  return semantic
}
function sortedSemanticRows<T extends {sheetName:string;rowNumber:number}>(rows:T[]){
  return rows.map(row=>semanticRow(row as unknown as Record<string,unknown>)).sort((a,b)=>JSON.stringify(stable(a)).localeCompare(JSON.stringify(stable(b))))
}

export function stableImportHash(payload:NormalizedImportPayload,resolutions:DuplicateResolution[]){
  const semantic={
    customers:sortedSemanticRows(payload.customers),
    visits:sortedSemanticRows(payload.visits),
    pointHistory:sortedSemanticRows(payload.pointHistory),
    resolutions:[...resolutions].map(resolution=>stable(resolution)).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),
  }
  const canonical=JSON.stringify(stable(semantic))
  return createHash('sha256').update(canonical).digest('hex')
}
