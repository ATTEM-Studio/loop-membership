# LOOP Native Retail UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 Google Sheets·포인트·멀티테넌트·PWA 로직을 유지하면서 LOOP 고객 태블릿 화면과 관리자 대시보드를 `LOOP Native Retail UI`로 리디자인한다.

**Architecture:** 기존 `app/page.tsx`의 비즈니스 상태 흐름은 유지한다. 1차 구현에서는 마지막에 import되는 `app/native-retail.css`로 Design Token과 고객/관리자 정보 위계를 재정의하고, `layout.tsx`와 `page.tsx`에는 접근성·busy 상태·표현 계층에 필요한 최소 변경만 한다. 화면 분리는 리디자인 안정화 후 별도 리팩터링으로 남긴다.

**Tech Stack:** Next.js 15, React 19, TypeScript, CSS, Vitest, Vercel, PWA

**Spec:** `docs/superpowers/specs/2026-09-08-loop-native-retail-ui-design.md`

## Global Constraints

- Google Sheets 데이터 구조와 API 계약을 변경하지 않는다.
- 업체별 DeviceSession / tenant token 로직을 변경하지 않는다.
- 방문 포인트 / 도장 / 결제 포인트 계산 로직을 변경하지 않는다.
- 기존 12초 완료 화면 자동 초기화를 유지한다.
- `lock.current` 기반 중복 적립 방지를 유지한다.
- PWA 홈 화면 설치 구조를 유지한다.
- Capacitor Android 구조를 삭제하지 않는다.
- 고객 데이터 및 `/api/*` 응답을 Service Worker에 캐시하지 않는다.

---

### Task 1: Native Retail Design Token Layer

**Files:**
- Create: `app/native-retail.css`
- Modify: `app/layout.tsx`

**Produces:** LOOP 공통 색상, Radius, spacing, motion, typography, focus, button/input 상태와 canvas 규칙.

- [ ] **Step 1:** `native-retail.css`에 `--loop-*` 토큰과 전역 접근성/모션 규칙을 정의한다.
- [ ] **Step 2:** `layout.tsx`에서 기존 CSS 뒤에 `native-retail.css`를 import해 override layer로 사용한다.
- [ ] **Step 3:** CI에서 `npm test`와 `npm run build`를 실행해 기존 기능 회귀가 없는지 확인한다.

### Task 2: Customer Kiosk Native Retail UI

**Files:**
- Modify: `app/native-retail.css`
- Modify: `app/page.tsx`

**Produces:** 태블릿 중심 전화번호 입력, 동의, 유입경로, 재방문 설문, 적립/사용, 결제금액, 혜택 사용, 완료 화면 UI.

- [ ] **Step 1:** `kiosk`, `kiosk-card`, `phone-input`, `primary`, `choice`, `action-card`, `reward-choice`, `payment-input-wrap`, `stamp-coupon`, 완료 tier 스타일을 native retail 기준으로 재정의한다.
- [ ] **Step 2:** 적립 액션은 Primary, 사용 액션은 Secondary로 위계를 분리한다.
- [ ] **Step 3:** `aria-busy`와 disabled 상태를 주요 네트워크 CTA에 명시한다.
- [ ] **Step 4:** 완료 화면은 탭 즉시 초기화 가능하다는 affordance와 12초 자동 초기화 안내를 더 명확히 한다.
- [ ] **Step 5:** tablet/mobile viewport에서 52px 이상 터치 타겟과 `100dvh`/safe-area를 유지한다.

### Task 3: Admin Dashboard Information Hierarchy

**Files:**
- Modify: `app/native-retail.css`
- Modify: `app/page.tsx`

**Produces:** SaaS형 dashboard canvas, KPI hierarchy, settings panels, customer list, modal/panel hierarchy.

- [ ] **Step 1:** `main`, `hero`, `grid`, `stat`, `panel`, `dash-grid`, `customer-row`, `admin-badge`를 고밀도 admin 규칙으로 재정의한다.
- [ ] **Step 2:** KPI cards는 클릭 가능 여부가 명확하게 보이도록 hover/focus/press 상태를 추가한다.
- [ ] **Step 3:** 고객 목록은 카드 나열보다 하나의 list container처럼 보이도록 row separator와 hover state를 적용한다.
- [ ] **Step 4:** 관리자 modal은 desktop에서는 floating workspace, narrow viewport에서는 near-fullscreen sheet처럼 보이도록 재정의한다.

### Task 4: PWA / Responsive Polish

**Files:**
- Modify: `app/native-retail.css`
- Modify: `app/pwa.css`

**Produces:** 설치형 앱에서 주소창 없는 native-like canvas, safe-area, reduced-motion, mobile/tablet/desktop 정보 재배치.

- [ ] **Step 1:** standalone에서 topbar/kiosk/admin safe-area를 정리한다.
- [ ] **Step 2:** PWA 설치 버튼이 고객 입력을 방해하지 않도록 compact placement와 mobile 규칙을 조정한다.
- [ ] **Step 3:** 460px / 800px / tablet landscape 범위에서 overflow가 없도록 breakpoint를 조정한다.
- [ ] **Step 4:** `prefers-reduced-motion`에서 비필수 transition/animation을 제거한다.

### Task 5: Verification and Preview

**Files:**
- No production file required unless verification finds an issue.

- [ ] **Step 1:** GitHub CI `npm test` 성공 확인.
- [ ] **Step 2:** GitHub CI `npm run build` 성공 확인.
- [ ] **Step 3:** Vercel Preview가 READY인지 확인.
- [ ] **Step 4:** Preview에서 `/manifest.webmanifest` 200과 main page 200을 확인한다.
- [ ] **Step 5:** PR diff를 검토해 API/Sheets/domain 코드가 수정되지 않았는지 확인한다.
