import {describe, expect, it} from 'vitest'
import {
  customerFromRow,
  customerToRow,
  rewardFromRow,
  rewardToRow,
  transactionToRow,
} from './sheets'
import type {PointTransaction, Reward} from './domain'

describe('customer sheet rows', () => {
  it('reads legacy six-column rows without consent data', () => {
    expect(customerFromRow(['1','01012345678','네이버','2','5','2026-08-31'])).toEqual({
      id:'1', phone:'01012345678', source:'네이버', visits:2, points:5, lastVisit:'2026-08-31',
      privacyConsentAt:undefined, privacyConsentVersion:undefined,
    })
  })

  it('round-trips current customer rows with consent data', () => {
    const row = ['1','01012345678','네이버','2','5','2026-08-31','2026-09-01T00:00:00.000Z','2026-09-01-v1']
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
})
