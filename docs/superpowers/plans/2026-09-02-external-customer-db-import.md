# External Customer DB Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a safe administrator-only Excel/CSV migration wizard that reads every workbook sheet in the browser, maps legacy customer/visit/point data into LOOP’s fixed Google Sheet structure, previews conflicts, and imports confirmed data without automatic balance summation.

**Architecture:** Parse `.xlsx`, `.xls`, and `.csv` only in the browser using `xlsx`, then convert workbook cells into a normalized import model. The browser sends only normalized data and administrator decisions to a dedicated import API; the server repeats validation, compares normalized phone numbers against current LOOP customers, applies explicit conflict resolutions, writes only to the existing managed tabs, and records the normalized payload hash in spreadsheet-level Google Sheets `developerMetadata` so the same import cannot be committed twice. No source workbook and no new Google Sheet tab are stored.

**Tech Stack:** Next.js 15, React 19, TypeScript 5.7, Vitest, Google Sheets API via `googleapis`, SheetJS `xlsx` for browser-side workbook parsing.

**Spec:** `docs/superpowers/specs/2026-09-02-external-customer-db-import-design.md`

## Global Constraints

- Keep the fixed spreadsheet tab order unchanged: `대시보드` first, then the existing customer, point, and settings tabs.
- Do not create an Import tab, temporary spreadsheet, or server copy of the uploaded workbook.
- Supported source formats are `.xlsx`, `.xls`, and `.csv`.
- Scan every worksheet and let the administrator classify each as `고객정보`, `방문이력`, `포인트이력`, or `제외`.
- Ambiguous legacy balances must be explicitly mapped to `방문포인트`, `도장`, `결제포인트`, or `가져오지 않음`.
- Never automatically sum an existing LOOP customer’s balances with imported balances.
- When exact historical dates do not exist, preserve summary visit counts/balances but do not manufacture visit or transaction dates.
- Imported customers have no current LOOP privacy consent until they accept the current consent screen on a later kiosk visit.
- Existing customer duplicate resolution must support `keep-existing`, `use-imported`, and per-field manual selection.
- A final acknowledgment checkbox and valid administrator PIN are required for commit.
- Store import deduplication state in spreadsheet-level `developerMetadata`, not visible cells or new tabs.
- Reject malformed phone numbers, negative balances, invalid visit counts, and unparseable required dates before commit.
- The initial implementation limits a single file to 20 MB and 30,000 non-empty source rows to protect browser memory and deployment request limits; the UI must report this clearly instead of silently truncating data.

---

## File Structure

### Create

- `lib/import-types.ts` — shared import domain types, field names, conflict decisions, API DTOs, limits.
- `lib/import-normalize.ts` — pure header matching, value normalization, date parsing, role inference, record conversion, external-member-ID joins, summaries.
- `lib/import-normalize.test.ts` — unit tests for all normalization and matching rules.
- `lib/import-merge.ts` — pure server-side merge planner that converts normalized records + duplicate decisions + current customers into exact customer/visit/ledger writes.
- `lib/import-merge.test.ts` — tests for duplicate policies, baseline records, historical records, and no-auto-sum behavior.
- `app/api/import/route.ts` — administrator-only `preview` and `commit` endpoint.
- `app/components/ImportWizard.tsx` — browser workbook parser + multi-step import UI.
- `app/import-wizard.css` — responsive wizard styling.

### Modify

- `package.json` — add `xlsx` dependency.
- `package-lock.json` — lock dependency graph.
- `lib/sheets.ts` — import metadata helpers and bulk write helpers targeting only existing Korean tabs.
- `lib/sheets.test.ts` — verify sheet layout remains fixed and import metadata key helpers do not alter `SHEET_LAYOUT`.
- `app/page.tsx` — add administrator import entry point and refresh customer list after successful import.
- `app/layout.tsx` — load import wizard CSS.
- `README.md` — document legacy DB import workflow and safety behavior.

---

### Task 1: Define Import Domain Types and Pure Normalization Rules

**Files:**
- Create: `lib/import-types.ts`
- Create: `lib/import-normalize.ts`
- Test: `lib/import-normalize.test.ts`

**Interfaces:**
- Produces `ImportSheetRole = 'customers'|'visits'|'points'|'ignore'`.
- Produces `ImportBalanceTarget = 'visitPoints'|'stamps'|'paymentPoints'|'ignore'`.
- Produces `NormalizedImportCustomer`, `NormalizedImportVisit`, `NormalizedImportPointEntry`, `NormalizedImportPayload`, `ImportValidationIssue`.
- Produces `inferSheetRole(name, headers)`, `inferColumnTarget(header, role)`, `normalizeLegacyDate(value)`, `normalizeWorkbookRows(input)`, and `buildExternalIdPhoneMap(customers)`.

- [ ] **Step 1: Write failing normalization tests**

Add tests that assert:

```ts
expect(inferColumnTarget('휴대폰번호','customers')).toBe('phone')
expect(inferColumnTarget('총 방문수','customers')).toBe('visits')
expect(inferColumnTarget('잔여포인트','customers')).toBe('balance')
expect(inferSheetRole('회원목록',['회원번호','휴대폰','잔여P'])).toBe('customers')
expect(inferSheetRole('이용내역',['회원번호','이용일','결제금액'])).toBe('visits')
expect(inferSheetRole('적립내역',['회원번호','적립일','적립','사용'])).toBe('points')
```

Also test phone normalization, Excel serial dates, `YYYY.MM.DD`, negative-number rejection, unsupported column reporting, and joining a visit row containing only `회원번호` to the phone from the customer sheet.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- lib/import-normalize.test.ts`

Expected: FAIL because the import modules/functions do not exist.

- [ ] **Step 3: Implement import types and matching tables**

Create exact unions and DTOs, including:

```ts
export type ImportSheetRole='customers'|'visits'|'points'|'ignore'
export type ImportBalanceTarget='visitPoints'|'stamps'|'paymentPoints'|'ignore'
export type DuplicateStrategy='keep-existing'|'use-imported'|'manual'
export const MAX_IMPORT_FILE_BYTES=20*1024*1024
export const MAX_IMPORT_SOURCE_ROWS=30000
```

Define normalized customer fields as optional except `phone`, so a blank source value never overwrites an existing LOOP field accidentally.

- [ ] **Step 4: Implement normalization helpers**

Implement normalized header matching by trimming spaces, lowercasing English, and removing punctuation. Match common Korean/English aliases for phone, external member ID, visit count, balance, date, delta, transaction type, remaining balance, payment amount, source, and description.

`normalizeLegacyDate()` must return ISO `YYYY-MM-DD` or `undefined`; it must convert Excel serials using the workbook epoch and must not replace invalid values with the current date.

- [ ] **Step 5: Implement external member ID joins and issue collection**

Build `Map<string,string>` from customer-sheet external member IDs to normalized phone numbers. Visit/point rows may resolve phone from their direct phone column first and fall back to this map. Unresolvable rows become `ImportValidationIssue` with original sheet name and row number.

- [ ] **Step 6: Run tests and verify GREEN**

Run: `npm test -- lib/import-normalize.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

Commit message: `feat: add legacy workbook normalization model`.

---

### Task 2: Parse Every Workbook Sheet in the Browser

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create/Modify: `lib/import-normalize.test.ts`
- Create: browser parsing helpers inside `app/components/ImportWizard.tsx` initially; keep workbook IO out of server code.

**Interfaces:**
- Consumes Task 1 normalization types and inference helpers.
- Produces `ParsedWorkbook` containing file name, file size, worksheet descriptors, headers, sample rows, and raw row matrices held only in browser state.

- [ ] **Step 1: Add failing tests around workbook-to-row conversion using an in-memory workbook**

Construct an `xlsx` workbook with `회원목록`, `이용내역`, and `안내` sheets and assert all sheet names and cells are returned without dropping sheets.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- lib/import-normalize.test.ts`

Expected: FAIL because workbook parser is absent.

- [ ] **Step 3: Add `xlsx` dependency and implement browser parser**

Use `File.arrayBuffer()` + `XLSX.read(buffer,{type:'array',cellDates:false})`. Convert every worksheet with `XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:''})`.

Reject files larger than `MAX_IMPORT_FILE_BYTES` and workbooks whose non-empty data rows exceed `MAX_IMPORT_SOURCE_ROWS`. Never upload `File` or ArrayBuffer to the server.

- [ ] **Step 4: Compute a client file fingerprint and normalized payload fingerprint**

Use Web Crypto SHA-256 for the source ArrayBuffer to show an import identity in the UI. The server will independently compute the normalized payload hash at commit time; the client file hash is informational only.

- [ ] **Step 5: Run unit tests and build**

Run: `npm test -- lib/import-normalize.test.ts && npm run build`

Expected: PASS.

- [ ] **Step 6: Commit**

Commit message: `feat: parse multi-sheet legacy workbooks in browser`.

---

### Task 3: Build the Pure Import Merge Planner

**Files:**
- Create: `lib/import-merge.ts`
- Test: `lib/import-merge.test.ts`
- Modify: `lib/import-types.ts`

**Interfaces:**
- Consumes normalized import payload, current `Customer[]`, duplicate resolutions, and import timestamp.
- Produces `ImportPlan` with `customers`, `visits`, `transactions`, `pointLedger`, `stampLedger`, `paymentLedger`, `summary`, and `issues`.
- Exposes `planImport(currentCustomers,payload,resolutions,now)`.

- [ ] **Step 1: Write failing merge tests**

Cover at minimum:

```ts
// existing 5P + imported 8P must never become 13P
expect(plan.customer.points).toBe(8)

// keep-existing leaves all existing values untouched
expect(plan.keepExistingCustomer).toEqual(existing)

// summary-only visits do not manufacture historical visit rows
expect(plan.visits).toHaveLength(0)
expect(plan.customer.visits).toBe(12)

// summary-only 8P creates a baseline ADJUST/import ledger record
expect(plan.transactions[0].description).toContain('기존 시스템 DB 이전')

// imported customers have no privacy consent
expect(plan.customer.privacyConsentAt).toBeUndefined()
```

Also test manual per-field selection, stamps/payment-point separation, source preservation, newest valid last-visit selection, historical point reconciliation, and invalid-history exclusion.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- lib/import-merge.test.ts`

Expected: FAIL because merge planner does not exist.

- [ ] **Step 3: Implement duplicate resolution semantics**

`keep-existing`: ignore imported customer summary fields and imported baseline balances for that phone, but allow explicitly selected historical rows only if the resolution requests them.

`use-imported`: imported provided fields replace corresponding existing fields; missing imported fields preserve existing values. Never sum balances.

`manual`: each field (`visits`, `visitPoints`, `stamps`, `paymentPoints`, `lastVisit`, `source`) has `existing` or `imported` source choice.

- [ ] **Step 4: Implement baseline and historical write planning**

If only current balance exists, generate import-time baseline records with description `기존 시스템 DB 이전`.

If historical point records exist, preserve their original dates. If history-derived balance differs from imported summary balance and administrator selected summary as authoritative, append one import-time adjustment record to reach the summary balance.

Do not generate fake visit dates from visit count.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npm test -- lib/import-merge.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

Commit message: `feat: plan safe legacy customer merges`.

---

### Task 4: Add Import Hash Metadata and Existing-Sheet Bulk Persistence

**Files:**
- Modify: `lib/sheets.ts`
- Modify: `lib/sheets.test.ts`

**Interfaces:**
- Consumes `ImportPlan`.
- Produces `hasImportPayloadHash(hash): Promise<boolean>` and `applyImportPlan(plan,hash,importId): Promise<void>`.
- `applyImportPlan` writes only to currently managed sheets and adds spreadsheet-level developer metadata key `LOOP_IMPORT_HASH` with the normalized hash after successful writes.

- [ ] **Step 1: Add failing sheet-helper tests**

Assert `SHEET_LAYOUT` remains exactly the current ten managed tabs and that import metadata is not represented as a new `SheetSpec`.

Test pure request builders so metadata key/value and target Korean sheet titles are correct.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- lib/sheets.test.ts`

Expected: FAIL for missing import helpers.

- [ ] **Step 3: Implement import metadata reads**

Extend spreadsheet property loading to request `developerMetadata` when needed. `hasImportPayloadHash()` must match spreadsheet-scoped metadata with key `LOOP_IMPORT_HASH` and exact hash value.

- [ ] **Step 4: Implement bulk writes to existing tabs**

Use the existing Korean sheet specs. Update `고객_목록`, append actual visit rows to `고객_방문기록`, append visit-point audit rows to both `포인트_전체거래내역` and `포인트_방문적립내역`, and append stamp/payment records only to their specific ledgers.

Do not write to settings sheets or `고객_재방문설문` during migration.

Where possible use bounded `values.batchUpdate`/`values.append` calls. Every generated import description must contain the short import ID so retry diagnosis is visible without revealing the raw file name.

- [ ] **Step 5: Add metadata only after all data writes succeed**

If any write throws, do not record `LOOP_IMPORT_HASH`. A retry must re-read current customers and the planner must produce idempotent target balances; imported historical rows include deterministic normalized identity keys so the persistence helper filters rows already present from the same `importId` before appending.

- [ ] **Step 6: Run sheet tests and full tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 7: Commit**

Commit message: `feat: persist legacy imports without changing sheet layout`.

---

### Task 5: Add Administrator Import Preview and Commit API

**Files:**
- Create: `app/api/import/route.ts`
- Create: `app/api/import/route.test.ts` if route-test pattern is practical; otherwise test server validation in `lib/import-merge.test.ts` and keep route thin.
- Modify: `lib/import-types.ts`

**Interfaces:**
- `POST /api/import` with `{action:'preview', pin, payload}` returns masked duplicate comparisons, server validation issues, and current-state summary.
- `POST /api/import` with `{action:'commit', pin, payload, resolutions, acknowledged:true, importId}` returns import summary and refreshed masked customers.

- [ ] **Step 1: Write failing validation tests**

Test invalid PIN, missing acknowledgment, negative balances, missing duplicate decisions, duplicate payload hash, and normalized phone collisions inside the uploaded payload.

- [ ] **Step 2: Run tests and verify RED**

Run relevant Vitest file(s).

Expected: FAIL for missing import service/route behavior.

- [ ] **Step 3: Implement preview**

Require `isAdminPin`. Re-normalize all payload fields even though browser already normalized them. Read current customers. Return duplicate rows with masked phones only and current/imported values; never return raw existing LOOP phone numbers beyond what the administrator’s uploaded payload already contains.

Preview does not mutate Google Sheets.

- [ ] **Step 4: Implement commit**

Require PIN + `acknowledged === true`. Compute SHA-256 of a stable canonical serialization of normalized payload plus resolutions. Reject if `hasImportPayloadHash(hash)` is true with `IMPORT_ALREADY_APPLIED`.

Call `planImport()`, reject unresolved blocking issues, then call `applyImportPlan()`.

- [ ] **Step 5: Return refreshed administrator customer DTOs**

Return masked phones and balances only, matching the existing admin list contract so `app/page.tsx` can replace the dashboard list immediately.

- [ ] **Step 6: Run tests and build**

Run: `npm test && npm run build`

Expected: PASS.

- [ ] **Step 7: Commit**

Commit message: `feat: add protected legacy DB import API`.

---

### Task 6: Build the Multi-Step Import Wizard

**Files:**
- Create: `app/components/ImportWizard.tsx`
- Create: `app/import-wizard.css`
- Modify: `app/page.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- `ImportWizard({open,pin,currentMode,onClose,onImported})`.
- Calls `/api/import` preview and commit endpoints.
- `onImported(customers)` refreshes dashboard state after success.

- [ ] **Step 1: Add component-level tests for critical UI decisions where practical**

At minimum test pure wizard view-model helpers for sheet-role updates, point-target mapping, duplicate resolution completeness, and commit-button enablement.

- [ ] **Step 2: Add an administrator entry point**

Place `기존 고객 DB 가져오기` in the admin area near customer management, not inside kiosk UI. Include concise helper copy: `다른 포인트 시스템의 Excel/CSV 고객 DB를 LOOP 형식으로 변환합니다.`

- [ ] **Step 3: Implement Step 1 — file selection and workbook summary**

Show file name, size, number of worksheets, total non-empty rows, and file-type validation. Do not auto-commit after file selection.

- [ ] **Step 4: Implement Step 2 — all-sheet classification**

Display every sheet. Preselect inferred role and allow `고객정보 / 방문이력 / 포인트이력 / 제외` changes. Show sample headers and first few rows without overwhelming the screen.

- [ ] **Step 5: Implement Step 3 — per-sheet column mapping**

For each used sheet, show each source column with a target select. Balance-like columns must use explicit target selector `방문포인트 / 도장 / 결제포인트 / 가져오지 않음`. Show an active-mode mismatch warning without blocking import.

Display unsupported source columns under `LOOP에서 사용하지 않는 정보` instead of silently dropping them.

- [ ] **Step 6: Implement Step 4 — server preview**

Send normalized payload to preview API. Show totals for normal rows, errors, unsupported/excluded fields, new customers, duplicate customers, visit history, each balance type, and source sheets.

- [ ] **Step 7: Implement Step 5 — duplicate comparison**

For every duplicate phone, show current LOOP vs imported values side-by-side with:

```text
기존 LOOP 유지
가져온 DB 값으로 갱신
항목별 직접 선택
```

Manual mode exposes individual selectors for visit count, visit points, stamps, payment points, last visit, and source. Do not offer automatic addition.

- [ ] **Step 8: Implement Step 6 — final confirmation and commit**

Show a compact final summary and error list. Allow non-blocking invalid rows to be excluded. Require `위 내용을 확인했습니다` before enabling `DB 가져오기 실행`.

On success show imported/new/updated/visit/point totals and a `완료` button, then refresh dashboard customers through `onImported`.

- [ ] **Step 9: Implement responsive styles**

Desktop: centered large modal with left progress rail and wide mapping tables.

Tablet/mobile: full-height sheet, horizontal step indicator, mapping rows stacked into cards, sticky bottom action bar. Keep touch targets at least 44px high and avoid horizontal scrolling for primary controls.

- [ ] **Step 10: Run tests and build**

Run: `npm test && npm run build`

Expected: PASS.

- [ ] **Step 11: Commit**

Commit message: `feat: add legacy customer DB import wizard`.

---

### Task 7: Verify Privacy, Regression Behavior, and Documentation

**Files:**
- Modify: `README.md`
- Modify tests as required.

**Interfaces:**
- No new runtime interface; this task proves the feature is safe to ship.

- [ ] **Step 1: Add regression tests for current spreadsheet structure**

Assert dashboard preservation logic and `SHEET_LAYOUT` Korean names/order remain unchanged after adding import helpers.

- [ ] **Step 2: Add migration privacy regression tests**

Assert imported customers have blank `privacyConsentAt` and `privacyConsentVersion`, and existing kiosk lookup therefore routes them through the current consent flow before earning/redeeming.

- [ ] **Step 3: Add duplicate-import regression test**

Verify a recorded normalized payload hash yields `IMPORT_ALREADY_APPLIED` before any write planner is executed.

- [ ] **Step 4: Document the administrator workflow**

README must explain supported formats, multi-sheet analysis, column mapping, duplicate comparison, non-summing policy, no fabricated history, re-consent behavior, file/row limits, and that source files are processed locally in the browser.

- [ ] **Step 5: Run final verification**

Run:

```bash
npm test
npm run build
```

Expected: all tests pass and Next production build completes without TypeScript errors.

- [ ] **Step 6: Open PR and verify CI/Preview**

Open a PR from `feature/external-db-import` to `main`. Verify GitHub Actions `npm test` + `npm run build` success. Verify Vercel Preview returns HTTP 200 and the admin dashboard exposes the import entry point.

- [ ] **Step 7: Merge and verify Production**

Merge only after CI success. Verify the Production deployment targets the merge SHA and reaches `READY`. Fetch the public site and `/api/settings` read-only endpoint; do not run a production import against real customer data unless the user provides a safe test workbook and explicitly asks to mutate it.

- [ ] **Step 8: Commit docs if any final adjustments were needed**

Commit message: `docs: document legacy DB migration workflow`.

---

## Plan Self-Review

### Spec coverage

- Multi-sheet discovery and role selection: Tasks 1, 2, 6.
- Automatic column inference + manual mapping: Tasks 1, 6.
- External member ID joins: Task 1.
- Visit/point/history conversion: Tasks 1, 3, 4.
- Visit points/stamps/payment points separated: Tasks 1, 3, 6.
- Duplicate comparison/no auto sum/manual field choices: Tasks 3, 5, 6.
- No fabricated dates: Tasks 1, 3.
- No new Google Sheet tabs: Tasks 4, 7.
- Import hash duplicate prevention: Tasks 4, 5, 7.
- Unsupported data visibility: Tasks 1, 6.
- Re-consent for imported customers: Tasks 3, 7.
- Final acknowledgment/PIN: Tasks 5, 6.
- Responsive/readable UI: Task 6.
- Test/build/deploy verification: Task 7.

### Placeholder scan

No `TBD`, `TODO`, or deferred implementation placeholders remain. Every task names concrete files, interfaces, validation rules, tests, commands, and expected outcomes.

### Type consistency

The plan consistently uses `ImportSheetRole`, `ImportBalanceTarget`, `DuplicateStrategy`, `NormalizedImportPayload`, `ImportPlan`, `planImport()`, `hasImportPayloadHash()`, and `applyImportPlan()` across tasks.