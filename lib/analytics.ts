import type {
  BalanceLedgerEntry,
  Customer,
  EarningMode,
  PaymentLedgerEntry,
  PointTransaction,
  VisitEntry,
} from './domain'

export type AnalyticsPoint={date:string;value:number}
export type AnalyticsMetric={label:string;current:number;unit:string;series:AnalyticsPoint[];note:string}
export type AnalyticsBundle={
  customers:AnalyticsMetric
  visits:AnalyticsMetric
  repeat:AnalyticsMetric
  balance:AnalyticsMetric
}

function day(value:string){return String(value??'').slice(0,10)}
function sortedDates(values:Iterable<string>){return [...new Set([...values].filter(Boolean))].sort()}
function mapSeries(dates:string[],values:Map<string,number>){return dates.map(date=>({date,value:values.get(date)??0}))}
function sum<T>(items:T[],value:(item:T)=>number){return items.reduce((total,item)=>total+value(item),0)}

export function buildAnalytics(
  customers:Customer[],
  visits:VisitEntry[],
  transactions:PointTransaction[],
  stampLedger:BalanceLedgerEntry[],
  paymentLedger:PaymentLedgerEntry[],
  mode:EarningMode,
):AnalyticsBundle{
  const eventDates=[
    ...visits.map(item=>day(item.date)),
    ...transactions.map(item=>day(item.date)),
    ...stampLedger.map(item=>day(item.date)),
    ...paymentLedger.map(item=>day(item.date)),
  ]
  let dates=sortedDates(eventDates)
  if(!dates.length){
    dates=sortedDates(customers.map(customer=>day(customer.lastVisit)))
  }

  const firstVisitByPhone=new Map<string,string>()
  visits.forEach(visit=>{
    const date=day(visit.date)
    const current=firstVisitByPhone.get(visit.phone)
    if(date&&(!current||date<current)) firstVisitByPhone.set(visit.phone,date)
  })
  const newByDate=new Map<string,number>()
  firstVisitByPhone.forEach(date=>newByDate.set(date,(newByDate.get(date)??0)+1))
  let customerRunning=Math.max(0,customers.length-firstVisitByPhone.size)
  const customerSeries=dates.map(date=>{
    customerRunning+=newByDate.get(date)??0
    return {date,value:customerRunning}
  })

  const visitsByDate=new Map<string,number>()
  visits.forEach(visit=>{
    const date=day(visit.date)
    if(date) visitsByDate.set(date,(visitsByDate.get(date)??0)+1)
  })

  const repeatByDate=new Map<string,number>()
  const seenByPhone=new Map<string,number>()
  visits.map((visit,index)=>({visit,index})).sort((a,b)=>{
    const dateCompare=day(a.visit.date).localeCompare(day(b.visit.date))
    return dateCompare||a.index-b.index
  }).forEach(({visit})=>{
    const seen=seenByPhone.get(visit.phone)??0
    if(seen>=1){
      const date=day(visit.date)
      if(date) repeatByDate.set(date,(repeatByDate.get(date)??0)+1)
    }
    seenByPhone.set(visit.phone,seen+1)
  })

  const balanceEntries:BalanceLedgerEntry[] = mode==='visit'
    ?transactions.map(transaction=>({
      date:transaction.date,phone:transaction.phone,delta:transaction.delta,
      balanceBefore:transaction.balanceBefore,balanceAfter:transaction.balanceAfter,description:transaction.description,
    }))
    :mode==='stamp'?stampLedger:paymentLedger
  const deltaByDate=new Map<string,number>()
  balanceEntries.forEach(entry=>{
    const date=day(entry.date)
    if(date) deltaByDate.set(date,(deltaByDate.get(date)??0)+entry.delta)
  })
  const currentBalance=mode==='visit'
    ?sum(customers,customer=>customer.points)
    :mode==='stamp'
      ?sum(customers,customer=>customer.stamps??0)
      :sum(customers,customer=>customer.paymentPoints??0)
  const recordedDelta=sum(balanceEntries,entry=>entry.delta)
  let balanceRunning=currentBalance-recordedDelta
  const balanceSeries=dates.map(date=>{
    balanceRunning+=deltaByDate.get(date)??0
    return {date,value:balanceRunning}
  })

  const totalVisits=sum(customers,customer=>customer.visits)
  const repeatCustomers=customers.filter(customer=>customer.visits>1).length
  const balanceLabel=mode==='stamp'?'보유 도장 합계':mode==='payment'?'결제 포인트 합계':'보유 포인트 합계'
  const balanceUnit=mode==='stamp'?'개':'P'

  return {
    customers:{label:'전체 고객',current:customers.length,unit:'명',series:customerSeries,note:'최초 방문 기준 누적 고객'},
    visits:{label:'누적 방문',current:totalVisits,unit:'회',series:mapSeries(dates,visitsByDate),note:'날짜별 방문 횟수'},
    repeat:{label:'재방문 고객',current:repeatCustomers,unit:'명',series:mapSeries(dates,repeatByDate),note:'두 번째 이후 방문이 발생한 날짜'},
    balance:{label:balanceLabel,current:currentBalance,unit:balanceUnit,series:balanceSeries,note:'현재 적립 방식의 잔액 추이'},
  }
}
