# LOOP APK 및 업체별 Google Sheets 연결 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 LOOP 기능을 유지하면서 업체별 Google Sheets 연결과 자동 로그인 가능한 Android APK를 추가한다.

**Architecture:** Vercel의 기존 서버리스 API를 유지하고, 요청별 서명 토큰에서 업체의 spreadsheet ID를 얻는다. 고객 데이터는 계속 각 업체의 Google Sheets에 저장하며, APK는 같은 Vercel 웹앱을 전체 화면으로 감싼다. 기존 `GOOGLE_SHEET_ID` 환경변수 모드는 fallback으로 유지한다.

**Tech Stack:** Next.js 15, TypeScript, Google Sheets API, Node `crypto`, Android WebView 하이브리드 셸

**Spec:** `docs/superpowers/specs/2026-09-02-loop-apk-multitenant-design.md`

## Global Constraints

- 고객·포인트·도장·결제포인트·엑셀 가져오기 도메인 로직을 변경하지 않는다.
- 기존 Google Sheets 탭 이름과 대시보드 첫 번째 배치 규칙을 유지한다.
- Google 서비스 계정 Private Key는 APK와 브라우저에 노출하지 않는다.
- 토큰이 없을 때 기존 `GOOGLE_SHEET_ID` 환경변수 fallback을 유지한다.
- 유료 데이터베이스나 별도 유료 서버를 추가하지 않는다.
- 모든 새 API와 인증 유틸리티에는 자동화 테스트를 추가한다.

### Task 1: Tenant token domain utility

**Files:**
- Create: `lib/tenant-auth.ts`
- Test: `lib/tenant-auth.test.ts`

**Interfaces:**
- `type TenantTokenPayload = { spreadsheetId: string; deviceId: string; issuedAt: number; version: 1 }`
- `createTenantToken(payload: TenantTokenPayload, secret: string): string`
- `verifyTenantToken(token: string, secret: string): TenantTokenPayload`
- `extractSpreadsheetId(value: string): string`

- [ ] **Step 1: Write failing tests** for round-trip signing, tampered signature rejection, malformed payload rejection, and Google Sheets URL parsing.
- [ ] **Step 2: Run `npm test -- lib/tenant-auth.test.ts`** and verify the new tests fail because the module does not exist.
- [ ] **Step 3: Implement HMAC-SHA256 signing with base64url payload and signature using Node `crypto.timingSafeEqual` for signature comparison.
- [ ] **Step 4: Run `npm test -- lib/tenant-auth.test.ts`** and verify all tests pass.
- [ ] **Step 5: Commit with `git add lib/tenant-auth.ts lib/tenant-auth.test.ts && git commit -m "feat: add signed tenant token utility"`.

### Task 2: Request-scoped Google Sheets context

**Files:**
- Modify: `lib/sheets.ts`
- Test: `lib/sheets.test.ts`

**Interfaces:**
- `type SheetContext = { spreadsheetId: string }`
- `getDefaultSheetContext(): SheetContext`
- Existing public sheet functions accept an optional `context?: SheetContext` and remain callable without it.

- [ ] **Step 1: Add failing tests** proving two contexts produce requests for different spreadsheet IDs and the default context still uses `GOOGLE_SHEET_ID`.
- [ ] **Step 2: Run the targeted sheet tests and verify failure.
- [ ] **Step 3: Refactor client creation and every sheet range operation to use `context.spreadsheetId`, defaulting to the environment context. Replace the single workbook layout Promise with a Map keyed by spreadsheet ID.
- [ ] **Step 4: Add the `설정_매장연결` sheet spec with headers `업체명`, `연결코드`, `사용상태`, `앱표시명` at the end of the settings group. Add read and write helpers without changing existing sheet headers.
- [ ] **Step 5: Run `npm test` and verify all existing tests pass.
- [ ] **Step 6: Commit with `git add lib/sheets.ts lib/sheets.test.ts && git commit -m "feat: support request-scoped spreadsheets"`.

### Task 3: Device activation API

**Files:**
- Create: `app/api/device/activate/route.ts`
- Create: `lib/tenant-request.ts`
- Test: `lib/tenant-request.test.ts`

**Interfaces:**
- `getTenantContext(request: Request): Promise<SheetContext | null>`
- `POST /api/device/activate` accepts `{ spreadsheetId: string; connectionCode: string; deviceId: string }` and returns `{ token, storeName, appName }`.

- [ ] **Step 1: Write failing tests** for missing fields, invalid sheet ID, invalid connection code, inactive store, and successful token creation.
- [ ] **Step 2: Run targeted tests and verify failure.
- [ ] **Step 3: Implement activation by extracting the spreadsheet ID, reading only `설정_매장연결`, validating the code and active status, and signing a token with `LOOP_AUTH_SECRET`.
- [ ] **Step 4: Implement request token resolution from `Authorization` and `x-loop-tenant-token`, with environment fallback only when no token is present.
- [ ] **Step 5: Run `npm test` and verify all tests pass.
- [ ] **Step 6: Commit with `git add app/api/device/activate/route.ts lib/tenant-request.ts lib/tenant-request.test.ts && git commit -m "feat: add store device activation"`.

### Task 4: Apply tenant context to existing API routes

**Files:**
- Modify: `app/api/members/route.ts`
- Modify: `app/api/settings/route.ts`
- Modify: `app/api/analytics/route.ts`
- Modify: `app/api/import/route.ts`
- Test: existing route/service tests plus new request-context cases where available

**Interfaces:**
- Each route calls `getTenantContext(request)` once and passes the returned context to all Sheets service functions.
- Client-provided spreadsheet IDs are ignored by data routes.

- [ ] **Step 1: Add failing route/service tests** showing a valid tenant token selects the tenant spreadsheet and a missing token preserves fallback behavior.
- [ ] **Step 2: Run targeted tests and verify failure.
- [ ] **Step 3: Thread the optional `SheetContext` through member, settings, analytics, and import operations without changing domain payloads.
- [ ] **Step 4: Preserve all existing error codes and map tenant errors to 400/401/403/503 responses.
- [ ] **Step 5: Run `npm test` and `npm run build`.
- [ ] **Step 6: Commit with `git add app/api lib && git commit -m "feat: route APIs by tenant sheet"`.

### Task 5: Web activation and persistence UI

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Create: `lib/device-client.ts`
- Test: `lib/device-client.test.ts`

**Interfaces:**
- `loadTenantToken(): string | null`
- `saveTenantToken(token: string): void`
- `clearTenantToken(): void`
- API requests add the saved tenant token header when present.

- [ ] **Step 1: Write failing tests** for token persistence and conditional request headers.
- [ ] **Step 2: Run the targeted tests and verify failure.
- [ ] **Step 3: Add a first-run `매장 연결` screen requesting Google Sheets URL/ID and connection code, generating a device UUID, and calling `/api/device/activate`.
- [ ] **Step 4: Store the returned token and app display name locally, then render the existing kiosk and admin flows unchanged.
- [ ] **Step 5: Add a settings-only disconnect action that clears the local token without changing sheet data.
- [ ] **Step 6: Run `npm test` and `npm run build`.
- [ ] **Step 7: Commit with `git add app/page.tsx app/globals.css lib/device-client.ts lib/device-client.test.ts && git commit -m "feat: add first-run store connection"`.

### Task 6: Android APK shell

**Files:**
- Create: `android/` or `capacitor/` Android project files
- Modify: `package.json` and project configuration only as required by the chosen shell
- Create: `README.md` installation and build notes section

**Interfaces:**
- Debug APK launches the production Vercel URL.
- The web app owns the store connection flow and token persistence.

- [ ] **Step 1: Verify Android SDK, Gradle, and Java requirements; record exact missing dependency if the environment cannot compile.
- [ ] **Step 2: Create the smallest hybrid Android shell that loads the production URL, enables JavaScript/local storage, hides browser chrome, locks the app to the tablet orientation, and prevents accidental external navigation.
- [ ] **Step 3: Add Android back-button handling that stays inside the kiosk flow.
- [ ] **Step 4: Build a debug APK and verify the APK launches the existing Vercel page.
- [ ] **Step 5: If the local environment lacks Android SDK, commit the complete project scaffold and provide the exact SDK build command without claiming that an APK was built.
- [ ] **Step 6: Commit with `git add android package.json README.md && git commit -m "feat: add LOOP Android kiosk shell"`.

### Task 7: End-to-end verification

**Files:**
- Modify: `README.md` with setup and onboarding instructions
- Test: full test suite and manual two-sheet verification checklist

- [ ] **Step 1: Run `npm test`.
- [ ] **Step 2: Run `npm run build`.
- [ ] **Step 3: Test existing single-sheet fallback with current environment variables.
- [ ] **Step 4: Test two test sheets with different customers and verify reads/writes never cross.
- [ ] **Step 5: Test wrong code, inaccessible sheet, inactive store, app restart, and local token deletion.
- [ ] **Step 6: Verify the APK build artifact or document the exact environment blocker.
- [ ] **Step 7: Commit documentation with `git add README.md && git commit -m "docs: document LOOP store connection"`.
