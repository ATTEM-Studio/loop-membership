import type {BalanceLedgerEntry,Customer,PaymentLedgerEntry,PointTransaction,VisitEntry} from './domain'
import type {DuplicateField,DuplicateResolution,ImportSummary,NormalizedImportCustomer,NormalizedImportPayload} from './import-types'

export type ImportPlan={
  customers:Customer[]
  visits:VisitEntry[]
  transactions:PointTransaction[]
  pointLedger:BalanceLedgerEntry[]
  stampLedger:BalanceLedgerEntry[]
  paymentLedger:PaymentLedgerEntry[]
  summary:ImportSummary
  blockingIssues:string[]
}

const balanceDescription=(importId:string)=>`기존 시스템 DB 이전 · ${importId}`
const historyDescription=(description:string|undefined,importId:string)=>`${description?.trim()||'기존 시스템 과거 이력'} · ${importId}`

function importedField<K extends keyof NormalizedImportCustomer>(row:NormalizedImportCustomer|undefined,key:K){return row?.[key]}

function choice(resolution:DuplicateResolution|undefined,field:DuplicateField){
  if(resolution?.strategy==='use-imported')return 'imported' as const
  if(resolution?.strategy==='keep-existing')return 'existing' as const
  return resolution?.fields?.[field]??'existing'
}

function provided<T>(value:T|undefined,fallback:T){return value===undefined?fallback:value}

function maxDate(...values:(string|undefined)[]){
  return values.filter((value):value is string=>Boolean(value)).sort().at(-1)??''
}

function groupCustomers(rows:NormalizedImportCustomer[]){
  const byPhone=new Map<string,NormalizedImportCustomer>()
  for(const row of rows){
    const previous=byPhone.get(row.phone)
    byPhone.set(row.phone,previous?{...previous,...Object.fromEntries(Object.entries(row).filter(([,value])=>value!==undefined))}:row)
  }
  return byPhone
}

function addVisitPointAdjustment(target:ImportPlan,phone:string,before:number,after:number,now:string,importId:string){
  if(before===after)return
  const delta=after-before,description=balanceDescription(importId)
  const transaction:PointTransaction={date:now,phone,type:'ADJUST',delta,balanceBefore:before,balanceAfter:after,description}
  const ledger:BalanceLedgerEntry={date:now,phone,delta,balanceBefore:before,balanceAfter:after,description}
  target.transactions.push(transaction);target.pointLedger.push(ledger)
}

function addBalanceAdjustment(target:BalanceLedgerEntry[],phone:string,before:number,after:number,now:string,importId:string){
  if(before===after)return
  target.push({date:now,phone,delta:after-before,balanceBefore:before,balanceAfter:after,description:balanceDescription(importId)})
}

function addPaymentAdjustment(target:PaymentLedgerEntry[],phone:string,before:number,after:number,now:string,importId:string){
  if(before===after)return
  target.push({date:now,phone,paymentAmount:0,rate:0,delta:after-before,balanceBefore:before,balanceAfter:after,description:balanceDescription(importId)})
}

export function planImport(currentCustomers:Customer[],payload:NormalizedImportPayload,resolutions:DuplicateResolution[],now:string,importId:string):ImportPlan{
  const importedByPhone=groupCustomers(payload.customers)
  const resolutionByPhone=new Map(resolutions.map(item=>[item.phone,item]))
  const currentByPhone=new Map(currentCustomers.map(customer=>[customer.phone,customer]))
  const plan:ImportPlan={
    customers:currentCustomers.map(customer=>({...customer,stamps:customer.stamps??0,paymentPoints:customer.paymentPoints??0})),
    visits:[],transactions:[],pointLedger:[],stampLedger:[],paymentLedger:[],
    summary:{analyzedRows:payload.customers.length+payload.visits.length+payload.pointHistory.length,newCustomers:0,duplicateCustomers:0,excludedRows:0,errorRows:payload.issues.length,visits:0,visitPoints:0,stamps:0,paymentPoints:0},
    blockingIssues:payload.issues.filter(issue=>issue.blocking).map(issue=>`${issue.sheetName}:${issue.rowNumber}:${issue.code}`),
  }

  const replaceCustomer=(customer:Customer)=>{
    const index=plan.customers.findIndex(item=>item.phone===customer.phone)
    if(index>=0)plan.customers[index]=customer;else plan.customers.push(customer)
  }

  for(const [phone,imported] of importedByPhone){
    const existing=currentByPhone.get(phone)
    if(!existing){
      const customer:Customer={
        id:crypto.randomUUID(),phone,source:imported.source,visits:imported.visits??0,points:imported.visitPoints??0,
        stamps:imported.stamps??0,paymentPoints:imported.paymentPoints??0,lastVisit:imported.lastVisit??'',
        privacyConsentAt:undefined,privacyConsentVersion:undefined,
      }
      replaceCustomer(customer)
      plan.summary.newCustomers++
      addVisitPointAdjustment(plan,phone,0,customer.points,now,importId)
      addBalanceAdjustment(plan.stampLedger,phone,0,customer.stamps??0,now,importId)
      addPaymentAdjustment(plan.paymentLedger,phone,0,customer.paymentPoints??0,now,importId)
      continue
    }

    plan.summary.duplicateCustomers++
    const resolution=resolutionByPhone.get(phone)
    if(!resolution){plan.blockingIssues.push(`DUPLICATE_RESOLUTION_REQUIRED:${phone}`);continue}
    if(resolution.strategy==='keep-existing')continue

    const next:Customer={...existing,stamps:existing.stamps??0,paymentPoints:existing.paymentPoints??0}
    if(choice(resolution,'visits')==='imported')next.visits=provided(importedField(imported,'visits'),next.visits)
    if(choice(resolution,'visitPoints')==='imported')next.points=provided(importedField(imported,'visitPoints'),next.points)
    if(choice(resolution,'stamps')==='imported')next.stamps=provided(importedField(imported,'stamps'),next.stamps??0)
    if(choice(resolution,'paymentPoints')==='imported')next.paymentPoints=provided(importedField(imported,'paymentPoints'),next.paymentPoints??0)
    if(choice(resolution,'lastVisit')==='imported')next.lastVisit=provided(importedField(imported,'lastVisit'),next.lastVisit)
    if(choice(resolution,'source')==='imported')next.source=provided(importedField(imported,'source'),next.source)
    replaceCustomer(next)
    addVisitPointAdjustment(plan,phone,existing.points,next.points,now,importId)
    addBalanceAdjustment(plan.stampLedger,phone,existing.stamps??0,next.stamps??0,now,importId)
    addPaymentAdjustment(plan.paymentLedger,phone,existing.paymentPoints??0,next.paymentPoints??0,now,importId)
  }

  for(const importedVisit of payload.visits){
    const existing=currentByPhone.get(importedVisit.phone)
    const resolution=resolutionByPhone.get(importedVisit.phone)
    if(existing&&resolution?.strategy==='keep-existing'&&!resolution.includeHistoricalRows)continue
    plan.visits.push({date:importedVisit.date,phone:importedVisit.phone,source:importedVisit.source,points:0})
  }

  const historyBalances=new Map<string,number>()
  for(const entry of payload.pointHistory.slice().sort((a,b)=>a.date.localeCompare(b.date)||a.rowNumber-b.rowNumber)){
    const existing=currentByPhone.get(entry.phone),resolution=resolutionByPhone.get(entry.phone)
    if(existing&&resolution?.strategy==='keep-existing'&&!resolution.includeHistoricalRows)continue
    const key=`${entry.phone}:${entry.target}`,before=historyBalances.get(key)??0,after=before+entry.delta
    historyBalances.set(key,after)
    const description=historyDescription(entry.description,importId)
    if(entry.target==='visitPoints'){
      plan.transactions.push({date:entry.date,phone:entry.phone,type:entry.delta>=0?'EARN':'ADJUST',delta:entry.delta,balanceBefore:before,balanceAfter:after,description})
      plan.pointLedger.push({date:entry.date,phone:entry.phone,delta:entry.delta,balanceBefore:before,balanceAfter:after,description})
    }else if(entry.target==='stamps'){
      plan.stampLedger.push({date:entry.date,phone:entry.phone,delta:entry.delta,balanceBefore:before,balanceAfter:after,description})
    }else{
      plan.paymentLedger.push({date:entry.date,phone:entry.phone,paymentAmount:0,rate:0,delta:entry.delta,balanceBefore:before,balanceAfter:after,description})
    }
  }

  // If an imported customer has no summary visit count, real historical visits are the only trustworthy count.
  for(const customer of plan.customers){
    const imported=importedByPhone.get(customer.phone)
    if(imported&&imported.visits===undefined){
      const dates=payload.visits.filter(visit=>visit.phone===customer.phone).map(visit=>visit.date)
      if(dates.length){customer.visits=dates.length;customer.lastVisit=maxDate(customer.lastVisit,...dates)}
    }
  }

  plan.summary.visits=plan.visits.length
  plan.summary.visitPoints=plan.customers.reduce((sum,customer)=>sum+customer.points,0)
  plan.summary.stamps=plan.customers.reduce((sum,customer)=>sum+(customer.stamps??0),0)
  plan.summary.paymentPoints=plan.customers.reduce((sum,customer)=>sum+(customer.paymentPoints??0),0)
  return plan
}
