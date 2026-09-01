import {describe, expect, it} from 'vitest'
import {
  PRIVACY_CONSENT_VERSION,
  hasCurrentPrivacyConsent,
  redeemPoints,
  type Customer,
} from './domain'

const customer: Customer = {
  id: '1',
  phone: '01012345678',
  visits: 3,
  points: 12,
  lastVisit: '2026-09-01',
  privacyConsentAt: '2026-09-01T00:00:00.000Z',
  privacyConsentVersion: PRIVACY_CONSENT_VERSION,
}

describe('privacy consent', () => {
  it('accepts only the current consent version', () => {
    expect(hasCurrentPrivacyConsent(customer)).toBe(true)
    expect(hasCurrentPrivacyConsent({...customer, privacyConsentVersion: 'old'})).toBe(false)
    expect(hasCurrentPrivacyConsent({...customer, privacyConsentAt: undefined})).toBe(false)
  })
})

describe('point redemption', () => {
  it('subtracts points without changing visit count', () => {
    expect(redeemPoints(customer, 10)).toMatchObject({points: 2, visits: 3})
  })

  it('rejects redemption larger than balance', () => {
    expect(() => redeemPoints(customer, 20)).toThrow('INSUFFICIENT_POINTS')
  })

  it('rejects non-positive redemption values', () => {
    expect(() => redeemPoints(customer, 0)).toThrow('INVALID_POINTS')
  })
})
