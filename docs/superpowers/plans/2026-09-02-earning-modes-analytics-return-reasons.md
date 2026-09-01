# Earning Modes, Analytics, and Return Reasons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three independently preserved earning modes, industry-configurable repeat-visit reasons, and clickable admin analytics with line charts.

**Architecture:** Extend Customers with separate visit/stamp/payment balances, add dedicated ledgers/settings sheets, and make the existing member API dispatch earning/redeeming by the active mode. Add a protected aggregate analytics endpoint and keep the browser DTO free of raw phone numbers. UI remains in the existing Next.js app but gets focused helper components for earning settings, repeat survey, stamp coupon, payment amount, and analytics modal.

**Tech Stack:** Next.js 15, React, TypeScript, Google Sheets API, Vitest, existing CSS/Lucide icons, inline SVG charts (no chart dependency).

**Spec:** `docs/superpowers/specs/2026-09-02-earning-modes-analytics-return-reasons-design.md`

## Global Constraints

- Existing visit-point balances must remain unchanged.
- Visit points, stamps, and payment points never auto-convert or combine.
- Leaving payment mode with preserved payment balances requires explicit server-validated confirmation.
- Repeat reasons expose at most 6 choices and remain skippable.
- Analytics API must not return phone numbers.
- Do not add a charting dependency; use responsive SVG.
- Preserve existing masked-phone and privacy-consent behavior.
- Every behavior change follows RED → GREEN TDD.

---

### Task 1: Domain types and earning calculations

**Files:**
- Modify: `lib/domain.ts`
- Modify: `lib/member-service.ts`
- Test: `lib/domain.test.ts`
- Test: `lib/member-service.test.ts`

**Interfaces:**
- Produces `EarningMode`, `EarningSettings`, `ReturnReason`, extended `Customer`.
- Produces `earnVisitPoint`, `earnStamp`, `earnPaymentPoints`, `redeemStampCoupon`, `sanitizeEarningSettings`.

- [ ] Write failing tests for legacy/default balances, +1 visit earn, +1 stamp earn, payment percentage floor calculation, invalid payment amount, and stamp overflow redemption.
- [ ] Run `npm test -- lib/domain.test.ts lib/member-service.test.ts` and confirm failures are due to missing types/functions.
- [ ] Implement the minimal domain/service code.
- [ ] Run the same tests and confirm green.
- [ ] Refactor shared customer replacement/audit helpers without changing behavior.

### Task 2: Sheet schemas and separated ledgers/settings

**Files:**
- Modify: `lib/sheets.ts`
- Test: `lib/sheets.test.ts`

**Interfaces:**
- Produces `readEarningSettings`, `saveEarningSettings`, `readPaymentRewards`, `savePaymentRewards`.
- Produces append/read helpers for PointLedger, StampLedger, PaymentPointLedger, ReturnReasons, and visits used by analytics.

- [ ] Write failing parser/serializer tests for extended Customers and each new row format.
- [ ] Run `npm test -- lib/sheets.test.ts` and confirm RED.
- [ ] Add automatic sheet/header creation and backward-compatible defaults.
- [ ] Run sheet tests and confirm GREEN.

### Task 3: Settings validation and payment-mode exit guard

**Files:**
- Modify: `app/api/settings/route.ts`
- Modify: `lib/member-service.ts`
- Test: `lib/member-service.test.ts`

**Interfaces:**
- `GET /api/settings` returns visit rewards, payment rewards, earning settings.
- `PUT /api/settings` accepts `confirmPaymentModeExit?: boolean` and rejects unsafe exit with `PAYMENT_MODE_EXIT_CONFIRM_REQUIRED`.

- [ ] Write failing service tests for max-six return reasons and payment-mode exit confirmation decision.
- [ ] Run tests and confirm RED.
- [ ] Implement sanitization/guard and update route persistence.
- [ ] Run tests and confirm GREEN.

### Task 4: Mode-aware member API

**Files:**
- Modify: `app/api/members/route.ts`
- Modify: `lib/member-service.ts`
- Modify: `lib/sheets.ts`
- Test: `lib/member-service.test.ts`

**Interfaces:**
- `earn` dispatches by current `earningSettings.mode`.
- New actions: `returnReason`, `redeemStamp`.
- `redeem` reads visit or payment rewards based on active mode.

- [ ] Write failing tests for independent balance mutation and stamp/payment transactions.
- [ ] Run unit tests and confirm RED.
- [ ] Implement API dispatch and ledger writes.
- [ ] Run all unit tests and confirm GREEN.

### Task 5: Aggregate analytics backend

**Files:**
- Create: `lib/analytics.ts`
- Create: `lib/analytics.test.ts`
- Create: `app/api/analytics/route.ts`

**Interfaces:**
- `buildAnalytics(customers, visits, transactions, stampLedger, paymentLedger, mode)` returns four date/value series plus summary values.
- API requires `x-admin-pin` and returns no raw phone fields.

- [ ] Write failing tests for first-visit cumulative customers, daily visits, repeat events, and mode-aware running balances.
- [ ] Run `npm test -- lib/analytics.test.ts` and confirm RED.
- [ ] Implement pure aggregation helpers.
- [ ] Run analytics tests and confirm GREEN.
- [ ] Add protected API route using those helpers.

### Task 6: Kiosk repeat survey and earning-mode UI

**Files:**
- Modify: `app/page.tsx`
- Create: `app/earning-modes.css`
- Modify: `app/layout.tsx`

**Interfaces:**
- Kiosk receives `earningSettings`, `rewards`, `paymentRewards`.
- Existing customer enters optional repeat-reason step.
- Payment mode gets an amount-entry step with live preview.
- Stamp mode renders coupon and redemption flow.

- [ ] Implement repeat reason grid capped at six, skip action, and short thank-you transition.
- [ ] Implement mode-aware action copy/balances.
- [ ] Implement payment amount form and preview.
- [ ] Implement stamp coupon slots, completion state, and stamp animation.
- [ ] Implement mode-aware reward/redeem flow.
- [ ] Verify TypeScript build after UI integration.

### Task 7: Admin earning settings and repeat-reason editor

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/earning-modes.css`

**Interfaces:**
- Admin can select visit/stamp/payment mode and edit relevant fields.
- Admin can select industry preset and edit up to six reason label/thanks pairs.
- Payment-mode exit warning requires checkbox before save.

- [ ] Add three mode selection cards.
- [ ] Add stamp goal/reward and payment-rate controls.
- [ ] Add industry preset selector and six-row reason editor.
- [ ] Add payment exit warning modal with required confirmation checkbox.
- [ ] Wire save to `/api/settings` and refresh kiosk settings.

### Task 8: Clickable KPI analytics modal

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/earning-modes.css`

**Interfaces:**
- KPI card click fetches `/api/analytics` once per dashboard session or refresh.
- Reusable modal accepts selected metric and supports 30d/90d/all filters.

- [ ] Make all four stat cards keyboard/click interactive.
- [ ] Add analytics modal and responsive SVG line chart with empty-state behavior.
- [ ] Show active-mode-aware fourth KPI label/value.
- [ ] Add hover/focus/mobile styles.

### Task 9: Full regression verification and docs

**Files:**
- Modify: `README.md`

- [ ] Update README with new sheets, modes, and admin settings.
- [ ] Run `npm test` and confirm all tests pass.
- [ ] Run `npm run build` and confirm production build succeeds.
- [ ] Review API responses to ensure analytics/detail lists do not expose raw phone beyond existing kiosk lookup behavior.
- [ ] Commit feature branch and open PR to `main`.
- [ ] Merge only after CI passes.
- [ ] Verify Vercel production deployment is READY on the merged main commit and public home returns HTTP 200.
