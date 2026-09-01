import {describe, expect, it} from 'vitest'
import {buildAnalytics} from './analytics'
import type {BalanceLedgerEntry, Customer, PaymentLedgerEntry, PointTransaction, VisitEntry} from './domain'

const customers:Customer[]=[
  {id:'1',phone:'01011111111',source:'네이버',visits:2,points:3,stamps:1,paymentPoints:120,lastVisit:'2026-09-02'},
  {id:'2',phone:'01022222222',source:'인스타',visits:1,points:1,stamps:0,paymentPoints:0,lastVisit:'2026-09-02'},
]
const visits:VisitEntry[]=[
  {date:'2026-09-01',phone:'01011111111',source:'네이버',points:1},
  {date:'2026-09-02',phone:'01011111111',source:'네이버',points:1},
  {date:'2026-09-02',phone:'01022222222',source:'인스타',points:1},
]
const transactions:PointTransaction[]=[
  {date:'2026-09-01T10:00:00.000Z',phone:'01011111111',type:'EARN',delta:1,balanceBefore:0,balanceAfter:1,description:'방문 포인트 적립'},
  {date:'2026-09-02T10:00:00.000Z',phone:'01011111111',type:'EARN',delta:2,balanceBefore:1,balanceAfter:3,description:'관리자 포함'},
  {date:'2026-09-02T11:00:00.000Z',phone:'01022222222',type:'EARN',delta:1,balanceBefore:0,balanceAfter:1,description:'방문 포인트 적립'},
]
const stamps:BalanceLedgerEntry[]=[
  {date:'2026-09-01T10:00:00.000Z',phone:'01011111111',delta:1,balanceBefore:0,balanceAfter:1,description:'방문 도장 적립'},
]
const payments:PaymentLedgerEntry[]=[
  {date:'2026-09-02T10:00:00.000Z',phone:'01011111111',paymentAmount:4000,rate:3,delta:120,balanceBefore:0,balanceAfter:120,description:'결제금액 포인트 적립'},
]

describe('buildAnalytics',()=>{
  it('builds cumulative unique customer and daily visit series',()=>{
    const analytics=buildAnalytics(customers,visits,transactions,stamps,payments,'visit')
    expect(analytics.customers.series).toEqual([
      {date:'2026-09-01',value:1},
      {date:'2026-09-02',value:2},
    ])
    expect(analytics.visits.series).toEqual([
      {date:'2026-09-01',value:1},
      {date:'2026-09-02',value:2},
    ])
  })

  it('counts second-and-later visit events as repeat activity',()=>{
    const analytics=buildAnalytics(customers,visits,transactions,stamps,payments,'visit')
    expect(analytics.repeat.series).toEqual([
      {date:'2026-09-01',value:0},
      {date:'2026-09-02',value:1},
    ])
  })

  it('uses the active earning ledger for running balance analytics',()=>{
    const visit=buildAnalytics(customers,visits,transactions,stamps,payments,'visit')
    const stamp=buildAnalytics(customers,visits,transactions,stamps,payments,'stamp')
    const payment=buildAnalytics(customers,visits,transactions,stamps,payments,'payment')
    expect(visit.balance.current).toBe(4)
    expect(visit.balance.series.at(-1)?.value).toBe(4)
    expect(stamp.balance.current).toBe(1)
    expect(stamp.balance.series.at(-1)?.value).toBe(1)
    expect(payment.balance.current).toBe(120)
    expect(payment.balance.series.at(-1)?.value).toBe(120)
  })
})
