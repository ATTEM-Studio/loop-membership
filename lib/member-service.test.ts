import {describe, expect, it} from 'vitest'
import {PRIVACY_CONSENT_VERSION, type Customer, type Reward} from './domain'
import {ADMIN_PIN, acceptPrivacyConsent, adjustCustomerPoints, earnPoint, isAdminPin, redeemReward} from './member-service'

const currentCustomer:Customer = {
  id:'1', phone:'01012345678', source:'네이버', visits:3, points:12, lastVisit:'2026-08-31',
  privacyConsentAt:'2026-08-01T00:00:00.000Z', privacyConsentVersion:PRIVACY_CONSENT_VERSION,
}
const reward:Reward = {id:'coffee',name:'아메리카노 1잔',points:10,enabled:true}

describe('admin pin', () => {
  it('uses the requested 9999 pin', () => {
    expect(ADMIN_PIN).toBe('9999')
    expect(isAdminPin('9999')).toBe(true)
    expect(isAdminPin('1234')).toBe(false)
  })
})

describe('privacy consent', () => {
  it('updates consent without changing points or visits', () => {
    const stale:Customer={...currentCustomer,privacyConsentAt:undefined,privacyConsentVersion:undefined}
    const result=acceptPrivacyConsent([stale],stale.phone,'2026-09-01T00:00:00.000Z')
    expect(result.customer).toMatchObject({
      points:12,visits:3,privacyConsentAt:'2026-09-01T00:00:00.000Z',privacyConsentVersion:PRIVACY_CONSENT_VERSION,
    })
  })
})

describe('earnPoint', () => {
  it('requires explicit consent when registering a new customer', () => {
    expect(() => earnPoint([], {
      phone:'01011112222', source:'인스타', consent:false, now:'2026-09-01T00:00:00.000Z', id:'new-1'
    })).toThrow('CONSENT_REQUIRED')
  })

  it('records consent and a +1 transaction for a new customer', () => {
    const result = earnPoint([], {
      phone:'01011112222', source:'인스타', consent:true, now:'2026-09-01T00:00:00.000Z', id:'new-1'
    })
    expect(result.customer).toMatchObject({
      id:'new-1', visits:1, points:1, privacyConsentVersion:PRIVACY_CONSENT_VERSION,
      privacyConsentAt:'2026-09-01T00:00:00.000Z'
    })
    expect(result.transaction).toMatchObject({type:'EARN',delta:1,balanceBefore:0,balanceAfter:1})
  })

  it('does not require repeat consent when the saved version is current', () => {
    const result = earnPoint([currentCustomer], {
      phone:currentCustomer.phone, consent:false, now:'2026-09-01T00:00:00.000Z'
    })
    expect(result.customer).toMatchObject({visits:4,points:13})
  })
})

describe('redeemReward', () => {
  it('subtracts the configured reward cost and records a negative transaction', () => {
    const result = redeemReward([currentCustomer], currentCustomer.phone, reward, '2026-09-01T00:00:00.000Z')
    expect(result.customer.points).toBe(2)
    expect(result.transaction).toMatchObject({type:'REDEEM',delta:-10,balanceBefore:12,balanceAfter:2,description:'아메리카노 1잔'})
  })

  it('rejects rewards that cost more than the current balance', () => {
    expect(() => redeemReward([{...currentCustomer,points:5}], currentCustomer.phone, reward, '2026-09-01T00:00:00.000Z')).toThrow('INSUFFICIENT_POINTS')
  })
})

describe('adjustCustomerPoints', () => {
  it('records a positive ADJUST transaction when target balance is higher', () => {
    const result=adjustCustomerPoints([currentCustomer],currentCustomer.id,15,'2026-09-01T12:00:00.000Z')
    expect(result.customer.points).toBe(15)
    expect(result.transaction).toMatchObject({
      type:'ADJUST',delta:3,balanceBefore:12,balanceAfter:15,description:'관리자 포인트 조정'
    })
  })

  it('records a negative ADJUST transaction when target balance is lower', () => {
    const result=adjustCustomerPoints([currentCustomer],currentCustomer.id,7,'2026-09-01T12:00:00.000Z')
    expect(result.customer.points).toBe(7)
    expect(result.transaction).toMatchObject({type:'ADJUST',delta:-5,balanceBefore:12,balanceAfter:7})
  })

  it('rejects invalid target balances', () => {
    expect(()=>adjustCustomerPoints([currentCustomer],currentCustomer.id,-1,'2026-09-01T12:00:00.000Z')).toThrow('INVALID_POINTS')
    expect(()=>adjustCustomerPoints([currentCustomer],currentCustomer.id,1.5,'2026-09-01T12:00:00.000Z')).toThrow('INVALID_POINTS')
  })

  it('rejects unchanged balances', () => {
    expect(()=>adjustCustomerPoints([currentCustomer],currentCustomer.id,12,'2026-09-01T12:00:00.000Z')).toThrow('POINTS_UNCHANGED')
  })
})
