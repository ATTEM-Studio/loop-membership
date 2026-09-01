# LOOP Points Redemption & Privacy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable point rewards, point redemption with employee PIN confirmation, privacy consent logging, and PIN-protected admin mode to the existing LOOP membership app.

**Architecture:** Extend the existing Customer/Google Sheets model rather than introducing a new database. Keep customer state in `Customers`, store point history append-only in `Transactions`, store reward configuration in `Settings`, and enforce redemption rules server-side in the existing members API. The client adds a consent step for customers who lack the current consent version and a PIN gate before admin access or redemption confirmation.

**Tech Stack:** Next.js 15, React 19, TypeScript, Google Sheets API, Vitest

**Spec:** `docs/superpowers/specs/2026-09-01-points-redemption-privacy-design.md`

## Global Constraints
- Admin PIN is `9999` for this version.
- New customers must actively check required privacy consent; the checkbox is never pre-selected.
- Existing customers with the current consent version are not asked on every visit.
- Redemption must be rejected server-side when the current balance is insufficient.
- Every successful earn and redeem operation must append a transaction row.
- Existing Customers sheet columns must remain backward compatible.

---

### Task 1: Domain rules for consent, rewards, and point redemption

**Files:**
- Create: `lib/domain.test.ts`
- Modify: `lib/domain.ts`

**Interfaces:**
- Produces: `PRIVACY_CONSENT_VERSION`, `Reward`, `PointTransaction`, `hasCurrentPrivacyConsent(customer)`, `redeemPoints(customer, points)`.

- [ ] **Step 1: Write failing domain tests**

```ts
import {describe, expect, it} from 'vitest'
import {PRIVACY_CONSENT_VERSION, hasCurrentPrivacyConsent, redeemPoints} from './domain'

const customer = {
  id:'1', phone:'01012345678', visits:3, points:12, lastVisit:'2026-09-01',
  privacyConsentAt:'2026-09-01T00:00:00.000Z', privacyConsentVersion:PRIVACY_CONSENT_VERSION
}

describe('privacy consent',()=>{
  it('accepts only the current consent version',()=>{
    expect(hasCurrentPrivacyConsent(customer)).toBe(true)
    expect(hasCurrentPrivacyConsent({...customer,privacyConsentVersion:'old'})).toBe(false)
  })
})

describe('point redemption',()=>{
  it('subtracts points without changing visit count',()=>{
    expect(redeemPoints(customer,10)).toMatchObject({points:2,visits:3})
  })
  it('rejects redemption larger than balance',()=>{
    expect(()=>redeemPoints(customer,20)).toThrow('INSUFFICIENT_POINTS')
  })
})
```

- [ ] **Step 2: Run `npm test -- lib/domain.test.ts` and verify RED**
Expected: missing exports/functions.

- [ ] **Step 3: Implement the minimal types and helpers in `lib/domain.ts`**
Add consent fields as optional Customer fields for backward compatibility and implement validation in `redeemPoints`.

- [ ] **Step 4: Run `npm test -- lib/domain.test.ts` and verify GREEN**
Expected: all domain tests pass.

### Task 2: Google Sheets persistence for consent, settings, and transactions

**Files:**
- Create: `lib/sheets.test.ts`
- Modify: `lib/sheets.ts`

**Interfaces:**
- Produces: extended `readCustomers/replaceCustomers`, `appendTransaction(transaction)`, `readRewards()`, `saveRewards(rewards)`.

- [ ] **Step 1: Write failing tests around row serialization helpers**
Extract pure row conversion helpers so tests do not require Google credentials. Verify old six-column Customer rows load with empty consent fields and new eight-column rows round-trip.

- [ ] **Step 2: Run `npm test -- lib/sheets.test.ts` and verify RED**
Expected: helper exports do not yet exist.

- [ ] **Step 3: Implement serialization and persistence**
Use Customers columns `A:H` with appended `privacyConsentAt`, `privacyConsentVersion`. Add `Transactions!A:G` append logic. Store reward rows in `Settings!A:C` as `id,name,points` and treat all stored rows as enabled.

- [ ] **Step 4: Run `npm test -- lib/sheets.test.ts` and verify GREEN**

### Task 3: Server API for lookup, earn, consent, redeem, and reward settings

**Files:**
- Create: `lib/member-service.ts`
- Create: `lib/member-service.test.ts`
- Modify: `app/api/members/route.ts`
- Create: `app/api/settings/route.ts`

**Interfaces:**
- `POST /api/members` accepts `{action:'lookup'|'earn'|'redeem', phone, source?, consent?, rewardId?}`.
- `GET /api/settings` returns `{rewards}`.
- `PUT /api/settings` accepts `{pin:'9999', rewards}` and rejects invalid PIN.

- [ ] **Step 1: Write failing service tests**
Test: lookup does not earn; new earn requires consent; existing current-consent customer can earn; redeem rejects insufficient balance; redeem returns negative transaction delta.

- [ ] **Step 2: Run service tests and verify RED**

- [ ] **Step 3: Implement pure member service operations**
Keep validation independent from Google Sheets for deterministic testing.

- [ ] **Step 4: Wire API routes to Sheets persistence**
Server re-reads customer before redemption, applies reward cost from persisted settings, replaces customer, then appends transaction.

- [ ] **Step 5: Run all tests and verify GREEN**

### Task 4: Customer kiosk UX and privacy notice

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Phone submit first performs lookup.
- New/outdated-consent customer sees unchecked required consent with detail disclosure.
- Existing customer sees current point balance and `포인트 적립` / `포인트 사용` choices.
- Redeem flow shows configured rewards and asks for employee PIN before final request.

- [ ] **Step 1: Add failing UI behavior tests if component extraction is needed**
Prefer extracting state-independent helpers over brittle full-page DOM tests.

- [ ] **Step 2: Implement the customer flow**
Do not pre-check consent. Include concise disclosure plus expandable details: purpose, item, retention, refusal consequence.

- [ ] **Step 3: Implement reward selection and PIN confirmation**
Disable rewards the customer cannot afford. Lock rapid duplicate actions.

- [ ] **Step 4: Run tests and `npm run build`**
Expected: tests pass and Next.js production build succeeds.

### Task 5: PIN-protected admin mode and reward editor

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Selecting 관리자 보기 opens a PIN gate.
- `9999` unlocks admin view for the current browser session.
- Admin can edit reward name and required points and persist via `/api/settings`.

- [ ] **Step 1: Implement the PIN gate without exposing PIN in visible copy**

- [ ] **Step 2: Add reward editor to the dashboard**
Validate name non-empty and points integer >= 1.

- [ ] **Step 3: Save settings via API and show success/error state**

- [ ] **Step 4: Run `npm test` and `npm run build`**

### Task 6: Documentation and final verification

**Files:**
- Modify: `README.md`
- Modify: `.env.example` only if new environment variables are introduced (none required for PIN in this version).

- [ ] **Step 1: Document Sheets tabs and headers**
Document `Customers`, `Transactions`, and `Settings` layouts.

- [ ] **Step 2: Run final verification**
Run `npm test` and `npm run build`; both must pass with clean output.

- [ ] **Step 3: Review diff for privacy and secret leakage**
Confirm service-account credentials are not committed and PIN is only used as the requested app-level gate.
