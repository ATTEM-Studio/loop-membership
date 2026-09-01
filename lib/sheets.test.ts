import {describe, expect, it} from 'vitest'
import {
  balanceLedgerFromRow,
  balanceLedgerToRow,
  customerFromRow,
  customerToRow,
  earningSettingsFromRow,
  earningSettingsToRow,
  paymentLedgerFromRow,
  paymentLedgerToRow,
  returnReasonFromRow,
  returnReasonToRow,
  rewardFromRow,
  rewardToRow,
  transactionFromRow,
  transactionToRow,
} from './sheets'
import type {BalanceLedgerEntry, EarningSettings, PaymentLedgerEntry, PointTransaction, ReturnReasonEntry, Reward} from './domain'

describe('customer sheet rows', () => {
  it('reads legacy six-column rows with zero mode-specific balances', () => {
    expect(customerFromRow(['1','01012345678','네이버','2','5','2026-08-31'])).toEqual({
      id:'1', phone:'01012345678', source:'네이버', visits:2, points:5, lastVisit:'2026-08-31',
      privacyConsentAt:undefined, privacyConsentVersion:undefined,stamps:0,paymentPoints:0,
    })
  })

  it('round-trips current customer rows with separated balances', () => {
    const row = ['1','01012345678','네이버','2','5','2026-08-31','2026-09-01T00:00:00.000Z','2026-09-01-v1','4','2350']
    expect(customerToRow(customerFromRow(row))).toEqual(row)
  })
})

describe('reward sheet rows', () => {
  it('round-trips enabled rewards', () => {
    const reward:Reward = {id:'coffee',name:'아메리카노 1잔',points:10,enabled:true}
    expect(rewardFromRow(rewardToRow(reward))).toEqual(reward)
  })
})

describe('transaction rows', () => {
  it('serializes balance history', () => {
    const transaction:PointTransaction = {
      date:'2026-09-01T01:02:03.000Z', phone:'01012345678', type:'REDEEM', delta:-10,
      balanceBefore:12, balanceAfter:2, description:'아메리카노 1잔',
    }
    expect(transactionToRow(transaction)).toEqual([
      '2026-09-01T01:02:03.000Z','01012345678','REDEEM',-10,12,2,'아메리카노 1잔'
    ])
  })

  it('parses ADJUST transaction rows', () => {
    expect(transactionFromRow([
      '2026-09-01T12:00:00.000Z','01012345678','ADJUST','3','12','15','관리자 포인트 조정'
    ])).toEqual({
      date:'2026-09-01T12:00:00.000Z',phone:'01012345678',type:'ADJUST',delta:3,
      balanceBefore:12,balanceAfter:15,description:'관리자 포인트 조정'
    })
  })
})

describe('mode ledger rows', () => {
  it('round-trips visit/stamp balance ledgers', () => {
    const entry:BalanceLedgerEntry={
      date:'2026-09-01T10:00:00.000Z',phone:'01012345678',delta:1,balanceBefore:4,balanceAfter:5,description:'방문 도장 적립'
    }
    expect(balanceLedgerFromRow(balanceLedgerToRow(entry))).toEqual(entry)
  })

  it('round-trips payment ledgers including amount and rate', () => {
    const entry:PaymentLedgerEntry={
      date:'2026-09-01T10:00:00.000Z',phone:'01012345678',paymentAmount:32550,rate:3,delta:976,balanceBefore:2350,balanceAfter:3326,description:'결제금액 포인트 적립'
    }
    expect(paymentLedgerFromRow(paymentLedgerToRow(entry))).toEqual(entry)
  })

  it('round-trips return reason rows', () => {
    const entry:ReturnReasonEntry={
      date:'2026-09-01T10:00:00.000Z',phone:'01012345678',visitNumber:4,reasonId:'coffee',reasonLabel:'커피 생각나서'
    }
    expect(returnReasonFromRow(returnReasonToRow(entry))).toEqual(entry)
  })
})

describe('earning settings row', () => {
  it('round-trips editable return reason configuration', () => {
    const settings:EarningSettings={
      mode:'payment',paymentRate:2.5,stampGoal:8,stampRewardName:'무료 메뉴',industry:'restaurant',
      returnReasons:[{id:'menu',label:'메뉴 생각나서',thanks:'또 생각나셨다니 오늘도 맛있게 준비할게요.'}],
    }
    expect(earningSettingsFromRow(earningSettingsToRow(settings))).toEqual(settings)
  })
})
