# Earning Modes, Analytics, and Return Reasons Design

**Date:** 2026-09-02

## Goal

Expand LOOP from a single fixed +1P visit system into a configurable multi-mode membership system while preserving each mode's historical balance independently. Add clickable admin KPI analytics and a configurable repeat-visit survey with industry presets.

## Approved Product Decisions

- Admin chooses exactly one active earning mode at a time.
- Supported modes: visit point, stamp coupon, payment-percentage point.
- Switching modes never converts, merges, or deletes balances from another mode.
- Returning to a previously used mode resumes the preserved balance.
- Leaving payment-percentage mode for another mode requires an explicit warning/confirmation when payment-point balances exist.
- Repeat-visit survey uses an industry preset plus editable copy, max 6 choices, with a witty thank-you response per choice.
- Dashboard KPI cards are clickable and open a compact analytics modal with a date-based line graph.

## Data Model

### Customers

Keep existing columns and append mode-specific balances:

`id | phone | source | visits | points | lastVisit | privacyConsentAt | privacyConsentVersion | stamps | paymentPoints`

- `points`: visit-point balance. Existing customer points remain here unchanged.
- `stamps`: active stamp count. Default 0 for legacy rows.
- `paymentPoints`: payment-percentage point balance. Default 0 for legacy rows.

### Separate Sheets

1. `PointLedger`
   - `date | phone | delta | balanceBefore | balanceAfter | description`
2. `StampLedger`
   - `date | phone | delta | balanceBefore | balanceAfter | description`
3. `PaymentPointLedger`
   - `date | phone | paymentAmount | rate | delta | balanceBefore | balanceAfter | description`
4. `ReturnReasons`
   - `date | phone | visitNumber | reasonId | reasonLabel`
5. `EarningSettings`
   - `mode | paymentRate | stampGoal | stampRewardName | industry | returnReasonsJson`
6. Existing `Settings`
   - visit-point redemption rewards
7. New `PaymentRewards`
   - payment-point redemption rewards

Existing `Visits` and `Transactions` remain for backward compatibility and visit-point audit history.

## Earning Modes

### Visit Point

- Each earn action adds +1 visit point.
- Writes Customers.points, Visits, Transactions, and PointLedger.
- Existing point rewards continue to use the existing Settings sheet.

### Stamp Coupon

- Each earn action adds +1 stamp.
- Writes Customers.stamps, Visits, and StampLedger.
- Customer screen shows a visual coupon with stamp slots and a stamp-in animation.
- Default goal is 10 stamps; admin can change the goal.
- At or above the goal, coupon remains completed until redeemed.
- Redemption requires staff/admin PIN and subtracts one full goal count, preserving overflow stamps.
- Completion reward name is configurable in EarningSettings.

### Payment Percentage

- Staff/customer flow asks for payment amount before earning.
- Points earned = `floor(paymentAmount * rate / 100)`.
- Rate is configurable in admin settings.
- Writes Customers.paymentPoints, Visits, and PaymentPointLedger.
- Payment-point rewards are stored separately in PaymentRewards and never use visit-point balances.
- Payment amount must be a positive integer and resulting earned points must be at least 1.

## Mode Switching Safety

When previous mode is `payment` and new mode is not `payment`:

- Server checks whether any customer has paymentPoints > 0.
- If so, save is rejected unless `confirmPaymentModeExit === true`.
- UI shows a modal explaining:
  - existing payment points remain preserved,
  - they are not converted or combined with visit points/stamps,
  - returning to payment mode resumes previous balances.
- Confirmation checkbox is required before the final change button enables.

## Repeat-Visit Survey

### Trigger

- Existing member lookup with current privacy consent enters a repeat-reason step before the normal earn/use action screen.
- Survey is optional; a small `건너뛰기` action is available.
- Selecting a reason saves immediately and briefly shows its thank-you response before moving on.

### Presets

Admin selects one preset and may edit labels/messages afterwards. Each preset supplies up to 6 choices.

Presets:
- 카페/베이커리
- 음식점
- 병·의원
- 미용/뷰티
- 헬스/운동
- 직접 설정

Each reason has:

```ts
{ id: string; label: string; thanks: string }
```

Stored survey rows preserve both `reasonId` and `reasonLabel`, so later copy edits do not rewrite historical meaning.

## Admin Analytics

Top cards remain visually compact but become interactive:

- 전체 고객
- 누적 방문
- 재방문 고객
- active-mode balance total

Click opens one reusable analytics modal with:

- metric title/value
- current summary
- 30일 / 90일 / 전체 range selector
- responsive SVG line chart
- small supporting metrics

Server returns only aggregated date/value series; raw phone numbers are never sent by analytics endpoints.

### Series Definitions

- Total customers: cumulative unique first-visit count by date.
- Visits: visits per date.
- Repeat customers: repeat-visit events per date (second and later visits per customer).
- Active balance:
  - visit mode: running visit-point balance from Transactions, preserving legacy history.
  - stamp mode: running total from StampLedger.
  - payment mode: running total from PaymentPointLedger.

## API Changes

### `/api/settings`

GET returns:

```ts
{
  rewards,
  paymentRewards,
  earningSettings
}
```

PUT accepts admin PIN plus those settings. It enforces the payment-mode exit confirmation rule.

### `/api/members`

New/extended actions:

- `earn` accepts optional paymentAmount and dispatches by active earning mode.
- `returnReason` stores a selected repeat reason without changing balances.
- `redeemStamp` requires admin PIN and redeems one completed coupon.
- `redeem` uses the reward set and balance for the current point mode (`visit` or `payment`).

Kiosk customer response adds `stamps` and `paymentPoints`.

### `/api/analytics`

Admin-PIN protected GET returning aggregate series and mode-aware summaries only.

## UI Changes

### Kiosk

- Mode-aware balance wording.
- Repeat reason survey before action screen for returning customers.
- Stamp mode shows a physical-coupon-inspired card with filled/empty slots and stamp animation.
- Payment mode adds amount-entry step and live earned-point preview.
- Reward list uses visit rewards or payment rewards according to active mode.
- Stamp completion uses a dedicated staff-PIN redemption flow.

### Admin

- Clickable KPI cards with hover/focus feedback.
- Analytics modal with responsive SVG line chart.
- New `적립 방식 설정` panel with three selectable cards.
- Visit mode shows fixed `방문 1회 = 1P`.
- Stamp mode configures goal and completion reward name.
- Payment mode configures percentage rate.
- Repeat survey panel: preset select plus max 6 editable label/thank-you pairs.
- Reward editor switches between visit rewards and payment rewards based on active mode; stamp mode uses its completion reward field.

## Compatibility and Safety

- Legacy Customers rows without new columns read stamps/paymentPoints as 0.
- Existing `points` and existing Settings rewards are preserved.
- No automatic balance conversion is performed.
- Existing masked-phone admin behavior remains unchanged.
- Analytics responses contain no phone numbers.
- Existing transaction/append non-atomicity remains an architectural limitation; this update does not claim atomic multi-sheet writes.

## Testing

Unit tests cover:

- legacy customer row parsing with zero new balances
- visit/stamp/payment earning calculations and independent balances
- payment floor calculation and invalid payment validation
- stamp redemption with overflow preservation
- earning-settings sanitization and max-six return reasons
- payment-mode exit confirmation requirement
- ledger row serialization/parsing and analytics aggregation helpers
- repeat reason row format

CI must run `npm test` and `npm run build` successfully before merge to main.
