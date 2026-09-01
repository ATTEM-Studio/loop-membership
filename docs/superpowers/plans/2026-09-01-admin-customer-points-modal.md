# Admin Customer Points Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 고객 상세 팝업에서 전체 포인트 이력을 조회하고 최종 포인트를 조정하며, 전 화면의 줄바꿈을 PC·태블릿·모바일에서 자연스럽게 개선한다.

**Architecture:** 기존 Customers 잔액은 현재 상태의 권위 데이터로 유지하고 Transactions는 변경 이력을 기록한다. 새 `ADJUST` 거래 타입과 순수 조정 함수를 추가한 뒤 관리자 인증 API에서 상세 조회·조정을 제공하고, Dashboard가 해당 API를 사용하는 모달을 렌더링한다.

**Tech Stack:** Next.js 15, React, TypeScript, Vitest, Google Sheets API, Vercel

**Spec:** `docs/superpowers/specs/2026-09-01-admin-customer-points-modal-design.md`

## Global Constraints

- 관리자 PIN은 서버에서 검증하며 브라우저에 전체 전화번호를 반환하지 않는다.
- 포인트 조정은 기존 거래를 수정하지 않고 `ADJUST` 차액 거래를 추가한다.
- 목표 포인트는 0 이상의 정수만 허용한다.
- 기존 `EARN`/`REDEEM` 동작과 Google Sheets 컬럼 호환성을 깨지 않는다.
- 불필요한 강제 `<br>`를 제거하고 한국어 줄바꿈은 `word-break: keep-all` 중심으로 처리한다.

---

### Task 1: 포인트 조정 도메인과 서비스

**Files:**
- Modify: `lib/domain.ts`
- Modify: `lib/member-service.ts`
- Test: `lib/member-service.test.ts`

**Interfaces:**
- Produces: `PointTransaction['type'] = 'EARN'|'REDEEM'|'ADJUST'`
- Produces: `adjustCustomerPoints(customers: Customer[], customerId: string, targetPoints: number, now: string): MemberResult`

- [ ] **Step 1: Write the failing tests**

```ts
it('records a positive ADJUST transaction when target balance is higher', () => {
  const result=adjustCustomerPoints([currentCustomer], currentCustomer.id, 15, '2026-09-01T12:00:00.000Z')
  expect(result.customer.points).toBe(15)
  expect(result.transaction).toMatchObject({type:'ADJUST',delta:3,balanceBefore:12,balanceAfter:15,description:'관리자 포인트 조정'})
})

it('records a negative ADJUST transaction when target balance is lower', () => {
  const result=adjustCustomerPoints([currentCustomer], currentCustomer.id, 7, '2026-09-01T12:00:00.000Z')
  expect(result.transaction.delta).toBe(-5)
})

it('rejects invalid target balances', () => {
  expect(()=>adjustCustomerPoints([currentCustomer], currentCustomer.id, -1, '2026-09-01T12:00:00.000Z')).toThrow('INVALID_POINTS')
  expect(()=>adjustCustomerPoints([currentCustomer], currentCustomer.id, 1.5, '2026-09-01T12:00:00.000Z')).toThrow('INVALID_POINTS')
})

it('rejects unchanged balances', () => {
  expect(()=>adjustCustomerPoints([currentCustomer], currentCustomer.id, 12, '2026-09-01T12:00:00.000Z')).toThrow('POINTS_UNCHANGED')
})
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- lib/member-service.test.ts`
Expected: FAIL because `adjustCustomerPoints` and `ADJUST` do not exist.

- [ ] **Step 3: Implement the minimal service**

```ts
export function adjustCustomerPoints(customers:Customer[],customerId:string,targetPoints:number,now:string):MemberResult{
  if(!Number.isInteger(targetPoints)||targetPoints<0) throw new Error('INVALID_POINTS')
  const found=customers.find(customer=>customer.id===customerId)
  if(!found) throw new Error('CUSTOMER_NOT_FOUND')
  const delta=targetPoints-found.points
  if(delta===0) throw new Error('POINTS_UNCHANGED')
  const customer={...found,points:targetPoints}
  const transaction:PointTransaction={
    date:now,phone:found.phone,type:'ADJUST',delta,
    balanceBefore:found.points,balanceAfter:targetPoints,
    description:'관리자 포인트 조정',
  }
  return {customers:replaceCustomer(customers,customer),customer,transaction}
}
```

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `npm test -- lib/member-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain.ts lib/member-service.ts lib/member-service.test.ts
git commit -m "feat: add audited admin point adjustments"
```

### Task 2: 거래내역 조회와 관리자 API

**Files:**
- Modify: `lib/sheets.ts`
- Modify: `lib/sheets.test.ts`
- Modify: `app/api/members/route.ts`

**Interfaces:**
- Produces: `readTransactionsForPhone(phone: string): Promise<PointTransaction[]>`
- Adds actions: `detail`, `adjust`

- [ ] **Step 1: Write failing transaction parser/read tests**

```ts
it('parses ADJUST transaction rows', () => {
  expect(transactionFromRow(['2026-09-01T12:00:00.000Z','01012345678','ADJUST','3','12','15','관리자 포인트 조정']))
    .toEqual({date:'2026-09-01T12:00:00.000Z',phone:'01012345678',type:'ADJUST',delta:3,balanceBefore:12,balanceAfter:15,description:'관리자 포인트 조정'})
})
```

- [ ] **Step 2: Run sheet tests and verify RED**

Run: `npm test -- lib/sheets.test.ts`
Expected: FAIL because `transactionFromRow` does not exist.

- [ ] **Step 3: Implement transaction parsing and phone-filtered read**

```ts
export function transactionFromRow(row:unknown[]):PointTransaction{
  return {
    date:String(row[0]??''),phone:String(row[1]??''),
    type:String(row[2]??'EARN') as PointTransaction['type'],
    delta:Number(row[3]??0),balanceBefore:Number(row[4]??0),balanceAfter:Number(row[5]??0),
    description:String(row[6]??''),
  }
}

export async function readTransactionsForPhone(phone:string){
  const sheets=requiredClient(); await ensureSheet(sheets,'Transactions',transactionHeaders)
  const result=await sheets.spreadsheets.values.get({spreadsheetId:process.env.GOOGLE_SHEET_ID!,range:'Transactions!A:G'})
  return (result.data.values??[]).slice(1).filter(row=>String(row[1]??'')===phone).map(transactionFromRow).reverse()
}
```

- [ ] **Step 4: Add authenticated detail/adjust API paths**

`detail` validates PIN and `customerId`, finds the customer server-side, reads that phone's transactions, and returns only masked customer metadata plus transactions without raw phone. `adjust` validates PIN, re-reads Customers immediately before mutation, calls `adjustCustomerPoints`, persists Customers, appends the transaction, and returns the updated masked customer plus transaction.

- [ ] **Step 5: Run unit tests and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/sheets.ts lib/sheets.test.ts app/api/members/route.ts
git commit -m "feat: add admin customer transaction APIs"
```

### Task 3: 관리자 고객 상세 모달

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `POST /api/members` actions `detail` and `adjust`
- Produces: clickable customer rows and `CustomerDetailModal`

- [ ] **Step 1: Add modal state and API integration**

Add `selectedCustomer`, `detail`, `targetPoints`, `loading`, `saving`, and `error` state. Clicking a customer row requests `detail` with `{action:'detail', customerId, pin}`. Adjustment posts `{action:'adjust', customerId, targetPoints, pin}` and updates both modal detail and parent `customers` state.

- [ ] **Step 2: Render audited point history**

Each transaction displays localized date, label (`적립`, `사용`, `관리자 조정`), signed delta, balance after, and description. Positive deltas use a plus sign; negative values retain their minus sign.

- [ ] **Step 3: Protect destructive button interaction**

The existing delete button calls `event.stopPropagation()` before deletion so it never opens the detail modal.

- [ ] **Step 4: Add responsive modal CSS**

Desktop modal max width ~720px with scrollable history. Tablet reduces padding. Mobile uses `width:calc(100% - 24px)`, max-height around `90dvh`, stacked summary cards and full-width point adjustment controls.

- [ ] **Step 5: Run build**

Run: `npm run build`
Expected: PASS.

### Task 4: 자연스러운 반응형 줄바꿈

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Remove unnecessary hard line breaks**

Remove presentation-only `<br/>` from kiosk headings/descriptions, dashboard hero, login modal, done screen and redemption copy. Keep semantic spans only where a short item must stay together.

- [ ] **Step 2: Add typography wrapping rules**

```css
.kiosk-card h1,.kiosk-card>p,.hero .title,.hero .sub,.admin-login h2,.admin-login p,.customer-detail-modal h2{
  word-break:keep-all;
  overflow-wrap:break-word;
  text-wrap:balance;
}
.kiosk-card h1{font-size:clamp(2rem,5vw,3.4rem);max-width:14ch;margin-inline:auto}
.kiosk-card>p{max-width:34rem;margin-inline:auto}
```

Add tablet/mobile media queries for content width and padding rather than manually inserted line breaks.

- [ ] **Step 3: Run full verification**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx app/globals.css
git commit -m "feat: add responsive customer detail admin UX"
```

### Task 5: CI, review, and deployment readiness

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Ensure the feature branch is covered by CI**

Add `feature/admin-customer-points-modal` to push branches.

- [ ] **Step 2: Verify GitHub Actions**

Wait for the branch workflow to complete with `conclusion: success`.

- [ ] **Step 3: Review diff against `main`**

Confirm no raw phone exposure, no unrelated refactor, and no changes to existing reward/consent behavior.

- [ ] **Step 4: Use finishing-a-development-branch**

Present integration options after fresh verification; do not claim Production is updated until the selected integration path and Vercel deployment are verified.
