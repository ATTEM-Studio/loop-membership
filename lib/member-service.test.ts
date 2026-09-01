import {describe, expect, it} from 'vitest'
import {
  PRIVACY_CONSENT_VERSION,
  type Customer,
  type EarningSettings,
  type Reward,
} from './domain'
import {
  ADMIN_PIN,
  acceptPrivacyConsent,
  adjustCustomerPoints,
  earnPaymentPoints,
  earnPoint,
  earnStamp,
  isAdminPin,
  redeemPaymentReward,
  redeemReward,
  redeemStampCoupon,
  requiresPaymentModeExitConfirmation,
  sanitizeEarningSettings,
} from './member-service'

const currentCustomer:Customer = {
  id:'1', phone:'01012345678', source:'네이버', visits:3, points:12, stamps:4, paymentPoints:2350, lastVisit:'2026-08-31',
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
  it('updates consent without changing any earning balances', () => {
    const stale:Customer={...currentCustomer,privacyConsentAt:undefined,privacyConsentVersion:undefined}
    const result=acceptPrivacyConsent([stale],stale.phone,'2026-09-01T00:00:00.000Z')
    expect(result.customer).toMatchObject({
      points:12,stamps:4,paymentPoints:2350,visits:3,
      privacyConsentAt:'2026-09-01T00:00:00.000Z',privacyConsentVersion:PRIVACY_CONSENT_VERSION,
    })
  })
})

describe('visit point earning', () => {
  it('requires explicit consent when registering a new customer', () => {
    expect(() => earnPoint([], {
      phone:'01011112222', source:'인스타', consent:false, now:'2026-09-01T00:00:00.000Z', id:'new-1'
    })).toThrow('CONSENT_REQUIRED')
  })

  it('records consent and only increases visit-point balance by 1', () => {
    const result = earnPoint([], {
      phone:'01011112222', source:'인스타', consent:true, now:'2026-09-01T00:00:00.000Z', id:'new-1'
    })
    expect(result.customer).toMatchObject({
      id:'new-1', visits:1, points:1, stamps:0, paymentPoints:0,
      privacyConsentVersion:PRIVACY_CONSENT_VERSION,privacyConsentAt:'2026-09-01T00:00:00.000Z'
    })
    expect(result.transaction).toMatchObject({type:'EARN',delta:1,balanceBefore:0,balanceAfter:1})
  })

  it('preserves stamp and payment balances for returning customers', () => {
    const result = earnPoint([currentCustomer], {
      phone:currentCustomer.phone, consent:false, now:'2026-09-01T00:00:00.000Z'
    })
    expect(result.customer).toMatchObject({visits:4,points:13,stamps:4,paymentPoints:2350})
  })
})

describe('stamp earning', () => {
  it('adds one stamp without changing either point balance', () => {
    const result=earnStamp([currentCustomer],{
      phone:currentCustomer.phone,consent:false,now:'2026-09-01T01:00:00.000Z'
    })
    expect(result.customer).toMatchObject({visits:4,points:12,stamps:5,paymentPoints:2350})
    expect(result.ledger).toMatchObject({delta:1,balanceBefore:4,balanceAfter:5,description:'방문 도장 적립'})
  })

  it('redeems one completed coupon and preserves overflow stamps', () => {
    const result=redeemStampCoupon([{...currentCustomer,stamps:12}],currentCustomer.phone,10,'아메리카노 1잔','2026-09-01T02:00:00.000Z')
    expect(result.customer.stamps).toBe(2)
    expect(result.ledger).toMatchObject({delta:-10,balanceBefore:12,balanceAfter:2,description:'아메리카노 1잔'})
  })

  it('rejects stamp redemption before the goal is reached', () => {
    expect(()=>redeemStampCoupon([{...currentCustomer,stamps:9}],currentCustomer.phone,10,'혜택','2026-09-01T02:00:00.000Z')).toThrow('STAMP_NOT_COMPLETE')
  })
})

describe('payment percentage earning', () => {
  it('floors percentage points and preserves other balances', () => {
    const result=earnPaymentPoints([currentCustomer],{
      phone:currentCustomer.phone,consent:false,now:'2026-09-01T03:00:00.000Z',paymentAmount:32550,rate:3,
    })
    expect(result.customer).toMatchObject({visits:4,points:12,stamps:4,paymentPoints:3326})
    expect(result.ledger).toMatchObject({paymentAmount:32550,rate:3,delta:976,balanceBefore:2350,balanceAfter:3326})
  })

  it('rejects invalid or zero-result payment earning', () => {
    expect(()=>earnPaymentPoints([currentCustomer],{
      phone:currentCustomer.phone,consent:false,now:'2026-09-01T03:00:00.000Z',paymentAmount:0,rate:3,
    })).toThrow('INVALID_PAYMENT_AMOUNT')
    expect(()=>earnPaymentPoints([currentCustomer],{
      phone:currentCustomer.phone,consent:false,now:'2026-09-01T03:00:00.000Z',paymentAmount:10,rate:1,
    })).toThrow('PAYMENT_POINTS_TOO_SMALL')
  })

  it('redeems rewards from payment points only', () => {
    const paymentReward:Reward={id:'cash-1000',name:'1,000원 할인',points:1000,enabled:true}
    const result=redeemPaymentReward([currentCustomer],currentCustomer.phone,paymentReward,'2026-09-01T04:00:00.000Z')
    expect(result.customer).toMatchObject({points:12,stamps:4,paymentPoints:1350})
    expect(result.ledger).toMatchObject({delta:-1000,balanceBefore:2350,balanceAfter:1350,description:'1,000원 할인'})
  })
})

describe('redeemReward', () => {
  it('subtracts the configured visit reward cost and records a negative transaction', () => {
    const result = redeemReward([currentCustomer], currentCustomer.phone, reward, '2026-09-01T00:00:00.000Z')
    expect(result.customer).toMatchObject({points:2,stamps:4,paymentPoints:2350})
    expect(result.transaction).toMatchObject({type:'REDEEM',delta:-10,balanceBefore:12,balanceAfter:2,description:'아메리카노 1잔'})
  })

  it('rejects rewards that cost more than the current balance', () => {
    expect(() => redeemReward([{...currentCustomer,points:5}], currentCustomer.phone, reward, '2026-09-01T00:00:00.000Z')).toThrow('INSUFFICIENT_POINTS')
  })
})

describe('earning settings', () => {
  it('sanitizes payment, stamp, industry and max six return reasons', () => {
    const settings=sanitizeEarningSettings({
      mode:'payment',paymentRate:2.5,stampGoal:8,stampRewardName:'무료 메뉴',industry:'restaurant',
      returnReasons:Array.from({length:8},(_,index)=>({id:`r${index}`,label:`이유 ${index}`,thanks:`감사 ${index}`})),
    })
    expect(settings).toMatchObject({mode:'payment',paymentRate:2.5,stampGoal:8,stampRewardName:'무료 메뉴',industry:'restaurant'})
    expect(settings.returnReasons).toHaveLength(6)
  })

  it('requires confirmation before leaving payment mode when balances remain', () => {
    const current:EarningSettings=sanitizeEarningSettings({mode:'payment'})
    const next:EarningSettings=sanitizeEarningSettings({mode:'stamp'})
    expect(requiresPaymentModeExitConfirmation(current,next,[currentCustomer])).toBe(true)
    expect(requiresPaymentModeExitConfirmation(current,next,[{...currentCustomer,paymentPoints:0}])).toBe(false)
    expect(requiresPaymentModeExitConfirmation({...current,mode:'visit'},next,[currentCustomer])).toBe(false)
  })
})

describe('adjustCustomerPoints', () => {
  it('records a positive ADJUST transaction when target visit-point balance is higher', () => {
    const result=adjustCustomerPoints([currentCustomer],currentCustomer.id,15,'2026-09-01T12:00:00.000Z')
    expect(result.customer).toMatchObject({points:15,stamps:4,paymentPoints:2350})
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
