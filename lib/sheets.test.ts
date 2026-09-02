import {describe, expect, it} from 'vitest'
import * as sheetModule from './sheets'
import {
  IMPORT_METADATA_KEY,
  SHEET_LAYOUT,
  balanceLedgerFromRow,
  balanceLedgerToRow,
  customerFromRow,
  customerToRow,
  earningSettingsFromRow,
  earningSettingsToRow,
  importMetadataRequest,
  importRowsForPlan,
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
import type {ImportPlan} from './import-merge'

describe('managed Google Sheet layout', () => {
  it('groups customer, point history, and settings tabs with Korean names', () => {
    expect(SHEET_LAYOUT.map(sheet=>[sheet.key,sheet.title,sheet.legacyTitle,sheet.group])).toEqual([
      ['customers','고객_목록','Customers','customer'],
      ['visits','고객_방문기록','Visits','customer'],
      ['returnReasons','고객_재방문설문','ReturnReasons','customer'],
      ['transactions','포인트_전체거래내역','Transactions','point'],
      ['pointLedger','포인트_방문적립내역','PointLedger','point'],
      ['stampLedger','포인트_도장적립내역','StampLedger','point'],
      ['paymentLedger','포인트_결제적립내역','PaymentPointLedger','point'],
      ['rewards','설정_방문포인트혜택','Settings','settings'],
      ['paymentRewards','설정_결제포인트혜택','PaymentRewards','settings'],
      ['earningSettings','설정_적립방식','EarningSettings','settings'],
    ])
  })

  it('uses Korean column headers for store operators', () => {
    const byKey=Object.fromEntries(SHEET_LAYOUT.map(sheet=>[sheet.key,sheet.headers]))
    expect(byKey.customers).toEqual(['고객ID','전화번호','최초유입경로','방문횟수','방문포인트','최근방문일','개인정보동의일시','개인정보동의버전','도장개수','결제포인트'])
    expect(byKey.visits).toEqual(['날짜','전화번호','최초유입경로','당시방문포인트'])
    expect(byKey.returnReasons).toEqual(['날짜','전화번호','방문회차','사유ID','재방문사유'])
    expect(byKey.earningSettings).toEqual(['적립방식','결제적립률','도장목표개수','도장완성혜택','업종','재방문설문설정'])
  })

  it('keeps an existing dashboard first and starts managed tabs after it', () => {
    const planner=(sheetModule as unknown as {sheetLayoutIndexes?:Function}).sheetLayoutIndexes
    expect(planner).toBeTypeOf('function')
    expect(planner?.([
      {sheetId:7,title:'고객_목록'},
      {sheetId:99,title:'대시보드'},
      {sheetId:8,title:'고객_방문기록'},
    ])).toEqual([
      {sheetId:99,index:0},
      {sheetId:7,index:1},
      {sheetId:8,index:2},
    ])
  })
})

describe('legacy import persistence layout',()=>{
  const plan:ImportPlan={
    customers:[{id:'1',phone:'01012345678',visits:3,points:8,stamps:2,paymentPoints:500,lastVisit:'2026-08-20'}],
    visits:[{date:'2026-08-20',phone:'01012345678',points:0}],
    transactions:[{date:'2026-09-02T00:00:00.000Z',phone:'01012345678',type:'ADJUST',delta:8,balanceBefore:0,balanceAfter:8,description:'기존 시스템 DB 이전'}],
    pointLedger:[{date:'2026-09-02T00:00:00.000Z',phone:'01012345678',delta:8,balanceBefore:0,balanceAfter:8,description:'기존 시스템 DB 이전'}],
    stampLedger:[{date:'2026-09-02T00:00:00.000Z',phone:'01012345678',delta:2,balanceBefore:0,balanceAfter:2,description:'기존 시스템 DB 이전'}],
    paymentLedger:[{date:'2026-09-02T00:00:00.000Z',phone:'01012345678',paymentAmount:0,rate:0,delta:500,balanceBefore:0,balanceAfter:500,description:'기존 시스템 DB 이전'}],
    summary:{analyzedRows:1,newCustomers:1,duplicateCustomers:0,excludedRows:0,errorRows:0,visits:1,visitPoints:8,stamps:2,paymentPoints:500},blockingIssues:[],
  }

  it('writes imports only to existing customer and point tabs',()=>{
    expect(importRowsForPlan(plan).map(item=>item.key)).toEqual([
      'customers','visits','transactions','pointLedger','stampLedger','paymentLedger',
    ])
    expect(SHEET_LAYOUT).toHaveLength(10)
  })

  it('stores duplicate-import fingerprints as spreadsheet developer metadata',()=>{
    expect(IMPORT_METADATA_KEY).toBe('LOOP_IMPORT_HASH')
    expect(importMetadataRequest('sha256-value')).toEqual({
      createDeveloperMetadata:{developerMetadata:{metadataKey:'LOOP_IMPORT_HASH',metadataValue:'sha256-value',visibility:'DOCUMENT'}},
    })
  })
})

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
