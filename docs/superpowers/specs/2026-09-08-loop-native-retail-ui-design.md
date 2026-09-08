# LOOP Native Retail UI 리디자인 설계

## 1. 목표

LOOP의 기존 멤버십·포인트·도장·결제 포인트·재방문 설문·관리자 대시보드·외부 고객 DB 가져오기·업체별 Google Sheets 연결 기능을 유지하면서, 고객용 태블릿 화면은 네이티브 키오스크 앱처럼, 관리자 화면은 밀도 높은 SaaS 관리 도구처럼 느껴지도록 UI/UX를 전면 정리한다.

이번 작업의 핵심은 색상이나 Radius 교체가 아니라 다음 네 가지다.

1. 고객이 다음 행동을 고민하지 않게 만든다.
2. 터치·입력·완료 피드백을 즉각적으로 만든다.
3. 고객 화면과 관리자 화면은 밀도가 달라도 하나의 Design System을 공유한다.
4. Capacitor 기반 APK에서도 브라우저를 감싼 웹이 아니라 전용 매장 앱처럼 느껴지게 한다.

내부 디자인 명칭은 **LOOP Native Retail UI**로 한다.

---

## 2. 현재 구조에서 확인한 문제

### 2.1 고객/관리자 화면 책임이 `app/page.tsx`에 과도하게 집중

현재 `app/page.tsx` 안에 다음 기능이 함께 존재한다.

- StoreConnection
- Kiosk 전체 단계 흐름
- StampCoupon
- ReturnReasonStep
- CustomerDetailModal
- AnalyticsModal / LineChart
- PaymentExitWarning
- Dashboard
- AdminLogin
- Home 모드 전환

기능 자체는 동작하지만 화면별 책임이 섞여 있어 디자인 시스템을 전역 적용하기 어렵고, 한 화면 수정이 다른 화면에 영향을 줄 가능성이 높다.

### 2.2 고객용 화면과 관리자 화면이 같은 밀도 규칙을 사용

고객 태블릿에서는 한 번에 한 행동이 강조되어야 하지만 현재는 일부 화면에서 선택 카드, 안내 문구, 관리 진입 UI가 동시에 경쟁한다.

관리자 화면은 반대로 많은 정보를 빠르게 훑어야 하는데, 여러 Panel/Card가 동일한 시각적 무게를 가져 중요도 구분이 약하다.

### 2.3 성공·오류·삭제 UX가 통일되지 않음

고객 적립 흐름에는 `busy`와 `lock`이 있어 중복 요청을 막고 있지만, 관리자 삭제는 `window.confirm()`을 사용하며 일부 상태 피드백은 문자열 표시 방식이다.

이번 리디자인에서 서버 요청 로직은 유지하되, 사용자가 보는 상태 표현을 공통 컴포넌트로 통일한다.

### 2.4 APK 특성 대비 웹 UI 흔적

Capacitor 구조와 업체별 최초 연결 방식은 이미 존재한다. 따라서 네이티브 재작성보다 다음 UX 보강이 우선이다.

- 전체 화면 기준 레이아웃
- 태블릿 터치 영역 확대
- safe-area 대응
- 키보드가 열렸을 때 CTA 가림 방지
- 화면 전환의 위치 관계 표현
- 앱 내부에서 불필요한 웹페이지 느낌 제거

---

## 3. 범위와 보존 원칙

### 유지하는 것

- Google Sheets 데이터 구조
- 업체별 Spreadsheet 분리 방식
- 연결코드 / DeviceSession / tenant token
- `/api/members`, `/api/settings`, `/api/analytics` 등 기존 API 계약
- 방문 포인트 / 도장 / 결제금액 적립 계산 로직
- 개인정보 동의 흐름
- 재방문 이유 설문 데이터 구조
- 관리자 PIN 인증
- 외부 고객 DB 가져오기
- 현재 12초 완료 화면 자동 초기화 기본값
- 중복 적립 방지를 위한 request lock

### 이번 리디자인에서 바꾸는 것

- Design Token
- Layout 구조
- 고객용 Kiosk 화면 구성
- 관리자 Dashboard 정보 위계
- Modal / Bottom Sheet / Desktop Panel 역할 구분
- 버튼·입력·Badge·List·Toast·Empty·Loading·Error 상태
- Responsive / Safe Area
- Motion
- 접근성
- 코드 컴포넌트 책임 분리

### 이번 범위에서 하지 않는 것

- 네이티브 Android 화면으로 전체 재작성
- Google Sheets를 Supabase 등 다른 DB로 이전
- 포인트 정책 변경
- 신규 과금 기능
- 기존 데이터를 자동 변환하는 마이그레이션

---

## 4. 검토한 접근 방식

### A. CSS만 전면 교체

장점: 구현이 가장 빠르다.

단점: `page.tsx`의 구조적 복잡성이 남고, 고객/관리자 정보 위계를 제대로 바꾸기 어렵다. 앞으로 기능이 추가될수록 다시 스타일이 분산된다.

### B. 전체 화면을 새로 다시 작성

장점: 가장 깨끗한 결과물을 만들 수 있다.

단점: 현재 포인트·개인정보·멀티테넌트 로직까지 건드릴 위험이 크고 회귀 테스트 범위가 커진다.

### C. 기능 로직은 보존하고 View Layer와 Design System만 단계적으로 분리

**채택한다.**

- 기존 API와 상태 흐름을 우선 보존한다.
- Design Token과 공통 Primitive를 만든다.
- Kiosk와 Dashboard를 별도 화면 컴포넌트로 분리한다.
- UI 피드백과 Responsive를 단계적으로 교체한다.

기능 안정성과 향후 유지보수성을 동시에 확보할 수 있기 때문이다.

---

## 5. Design System

### 5.1 Color Token

```css
--loop-canvas: #F3F5F8;
--loop-canvas-secondary: #E9EDF3;
--loop-surface: rgba(255,255,255,.82);
--loop-surface-strong: #FFFFFF;

--loop-text: #15191F;
--loop-text-secondary: #3C4552;
--loop-muted: #7A8492;
--loop-subtle: #9AA3AF;

--loop-primary: #0A84FF;
--loop-primary-dark: #0071E3;
--loop-primary-soft: rgba(10,132,255,.11);

--loop-success: #30B36F;
--loop-warning: #FF9F0A;
--loop-danger: #FF453A;

--loop-border: rgba(28,39,52,.08);
--loop-border-strong: rgba(28,39,52,.13);
```

색상은 장식이 아니라 상태와 행동 의미에만 사용한다.

### 5.2 Radius

- sm: 12px
- md: 16px
- lg: 22px
- xl: 28px
- pill: 999px

### 5.3 Spacing

주 사용 단위는 8 / 12 / 16 / 20 / 24 / 32 / 40px로 제한한다.

### 5.4 Motion

- press: 140ms
- normal: 240ms
- screen/sheet: 260ms
- general easing: `cubic-bezier(.22,.61,.36,1)`

`prefers-reduced-motion`을 지원한다.

### 5.5 Typography

Pretendard 우선, Apple/system font fallback을 사용한다.

한국어에서는 `word-break: keep-all`을 기본 적용하고 숫자에는 `font-variant-numeric: tabular-nums`를 사용한다.

---

## 6. 공통 UI Primitive

다음 컴포넌트를 공통화한다.

- `LoopButton`
- `LoopInput`
- `LoopIconButton`
- `LoopBadge`
- `LoopSurface`
- `LoopList`
- `LoopEmptyState`
- `LoopToast`
- `LoopSpinner`
- `LoopSheet`
- `LoopModal`
- `LoopPanel`
- `SegmentedControl`

같은 의미의 행동은 고객/관리자 화면 모두 같은 토큰과 상태 표현을 사용한다.

Primary Button은 한 화면에 원칙적으로 하나만 둔다.

---

## 7. 고객용 Kiosk 재설계

### 7.1 전체 원칙

고객 화면은 SaaS가 아니라 **매장 키오스크**로 본다.

한 화면에 하나의 주요 질문 또는 행동만 배치한다.

기본 태블릿 기준 터치 타겟은 52px 이상, 핵심 CTA는 56~64px를 권장한다.

### 7.2 전화번호 입력

우선순위:

1. 매장/LOOP 식별
2. 짧은 환영 문구
3. 전화번호 입력
4. Primary CTA
5. 최소 개인정보 안내

관리자 진입 버튼은 고객의 핵심 행동과 경쟁하지 않도록 상단의 작은 보조 액션으로 둔다.

### 7.3 개인정보 동의

필수 동의 여부를 하나의 명확한 선택으로 보여준다.

긴 설명을 화면 본문에 모두 노출하지 않고 핵심 요약 + 상세 펼치기를 사용한다.

동의하지 않으면 진행되지 않는다는 점을 입력 근처에 즉시 보여준다.

### 7.4 신규 고객 유입경로

질문:

`저희 매장을 어떻게 알게 되셨나요?`

선택지는 2열 또는 화면 폭에 맞춘 큰 Chip/Button Grid로 배치한다.

선택 후 별도 확인 버튼 없이 기존 로직대로 적립 단계로 이동할 수 있다.

### 7.5 재방문 이유

최대 6개 선택지를 유지한다.

선택 즉시 감사 피드백을 보여주고 기존 1.05초 후 다음 단계로 이동하는 흐름은 유지한다.

`건너뛰기`는 Secondary/Text Action으로 둔다.

### 7.6 적립/사용 선택

현재 잔액을 가장 먼저 보여준다.

적립은 Primary Action, 포인트 사용/쿠폰 사용은 Secondary Action으로 시각적 위계를 둔다.

두 액션을 완전히 동일한 카드 무게로 경쟁시키지 않는다.

### 7.7 결제금액 입력

금액 입력 필드는 가장 큰 시각 요소로 만든다.

`결제금액 × 적립률 = 예상 적립 P`를 바로 아래에서 실시간 표시한다.

키보드가 열려도 확정 CTA가 화면 밖으로 밀리지 않도록 `dvh`와 sticky action 영역을 고려한다.

### 7.8 완료 화면

방문 단계별 감사 문구를 유지하면서 시각적 차이를 강화한다.

- 첫 방문: Welcome
- 2~4회: Returning
- 5~9회: Regular
- 10회 이상: VIP

완료 화면은 Check/Gift/Tier 아이콘 + 한 줄 감사 문구 + 현재 잔액/도장 + 자동 복귀 카운트다운 구조로 한다.

기본 자동 초기화는 현재 12초를 유지한다.

화면을 터치하면 즉시 초기 화면으로 돌아갈 수 있게 하되 적립 요청이 다시 실행되지 않도록 한다.

### 7.9 중복 적립 방지 UX

현재 `lock.current` 기반 중복 요청 방지는 유지한다.

추가 UI 원칙:

- 클릭 즉시 button disabled
- CTA 문구를 `적립 중...`으로 변경
- spinner 표시
- 완료 전 뒤로가기/다른 CTA 비활성
- 요청 실패 시 lock 해제 후 행동 가능한 오류 문구 표시

---

## 8. 관리자 Dashboard 재설계

### 8.1 Dashboard 상단

마케팅 랜딩페이지 Hero처럼 보이지 않게 한다.

상단은 다음 순서다.

- `오늘` 또는 현재 상태 Eyebrow
- 한 문장 요약
- 핵심 KPI 3~4개

KPI 우선순위:

1. 전체 고객
2. 누적 방문
3. 재방문 고객
4. 현재 적립 방식의 잔액 합계

KPI는 클릭 가능한 경우 hover/touch 상태를 명확히 둔다.

### 8.2 설정 영역

현재 여러 Panel을 유지하되 중요도에 따라 그룹을 정리한다.

- 적립 방식
- 혜택
- 재방문 설문

Desktop에서는 Section Panel, 작은 화면에서는 Accordion 또는 Fullscreen 관리 화면을 사용한다.

### 8.3 고객 목록

최근 고객은 개별 카드 나열보다 하나의 List Container + Row 구조를 사용한다.

각 Row:

- 마스킹 전화번호
- 유입경로 / 방문 수
- 현재 적립 방식 잔액
- 상세 진입 chevron

삭제 아이콘은 기본 Row 핵심 액션에서 분리해 상세 화면의 위험 행동으로 이동하는 것을 우선한다.

### 8.4 고객 상세

Desktop: Floating Workspace Panel

Mobile/Tablet narrow: Fullscreen Screen

포인트 수정, 전체 거래 내역, 개인정보 삭제를 한 화면에 정리한다.

삭제는 `window.confirm()` 대신 Destructive Confirmation Sheet를 사용한다.

### 8.5 분석

현재 AnalyticsModal과 LineChart는 유지하되 Segmented Control을 공통 컴포넌트로 바꾼다.

30일 / 90일 / 전체 범위 선택은 같은 레벨의 전환이므로 segmented control 규칙을 적용한다.

### 8.6 상태 피드백

문자열 상태 영역 대신 Toast를 기본으로 한다.

- 저장 성공: Success Toast
- 저장 실패: Error Toast
- 삭제 완료: Success Toast
- 설정값 검증 오류: 해당 입력 주변 Inline Error

---

## 9. Responsive / APK 전략

### Tablet / APK

LOOP의 핵심 사용 환경으로 본다.

- `100dvh`
- safe-area 적용
- 터치 타겟 확대
- 세로/가로 전환에서도 주요 CTA 유지
- Android WebView 키보드 열림 시 layout shift 최소화

### Mobile

- Single Column
- 16~20px padding
- 복잡한 관리자 작업은 Fullscreen Screen
- 짧은 확인/선택은 Bottom Sheet

### Desktop

- Admin 중심 고밀도
- max-width container
- 2-column dashboard 허용
- Floating Workspace Panel 사용

단순한 화면 축소/확대가 아니라 각 환경에서 정보 구조를 재배치한다.

---

## 10. 코드 구조 변경 방향

현재 `app/page.tsx`를 다음 책임으로 분리한다.

```text
app/
  page.tsx
  components/
    kiosk/
      Kiosk.tsx
      PhoneStep.tsx
      ConsentStep.tsx
      SourceStep.tsx
      ReturnReasonStep.tsx
      ActionStep.tsx
      PaymentStep.tsx
      RewardStep.tsx
      CompletionStep.tsx
      StampCoupon.tsx
    admin/
      Dashboard.tsx
      DashboardHero.tsx
      CustomerList.tsx
      CustomerDetailPanel.tsx
      AnalyticsPanel.tsx
      EarningSettings.tsx
      ReturnSurveySettings.tsx
      RewardSettings.tsx
    ui/
      Button.tsx
      Input.tsx
      Badge.tsx
      Surface.tsx
      Toast.tsx
      Sheet.tsx
      Modal.tsx
      SegmentedControl.tsx
```

데이터 fetch와 비즈니스 로직을 무리하게 새 아키텍처로 바꾸지 않는다.

1차 목표는 화면 책임과 표현 계층을 분리하는 것이다.

---

## 11. 접근성

반드시 적용한다.

- semantic button/input
- aria-label
- aria-expanded
- keyboard focus visible
- disabled state
- 색상 외 텍스트/아이콘 상태 표시
- 충분한 대비
- `prefers-reduced-motion`

---

## 12. 테스트 전략

### 회귀 테스트

기존 테스트 전체가 계속 통과해야 한다.

특히 다음 기능은 리디자인 전후 동일해야 한다.

- 기존 고객 조회
- 신규 고객 동의
- 유입경로 저장
- 재방문 이유 저장
- 방문 포인트 적립
- 도장 적립/사용
- 결제 포인트 적립/사용
- 관리자 PIN
- 고객 삭제
- 고객 포인트 조정
- 설정 저장
- 업체별 tenant 분리

### UI 테스트

추가 확인한다.

- CTA 클릭 직후 중복 클릭 차단
- Loading/Error/Success 표시
- 완료 후 12초 자동 초기화
- 완료 화면 터치 즉시 초기화
- 좁은 화면에서 horizontal overflow 없음
- Android 태블릿 키보드 열림 상태에서 주요 버튼 접근 가능
- modal/sheet focus 처리
- reduced motion

---

## 13. 구현 순서

1. Design Token과 전역 Canvas/Typography 정리
2. 공통 UI Primitive 생성
3. Kiosk 화면 컴포넌트 분리
4. Kiosk UI 리디자인
5. 완료/Loading/Error/Motion 보강
6. Dashboard 컴포넌트 분리
7. Dashboard 정보 위계 및 List/Panel 정리
8. confirm 기반 위험 행동을 Confirmation UI로 교체
9. Responsive / Safe Area / APK WebView 보강
10. 기존 테스트 + build + 실제 화면 검증

---

## 14. 완료 기준

다음 조건을 모두 충족하면 완료로 본다.

1. 첫 화면에서 고객이 무엇을 해야 하는지 3초 안에 이해할 수 있다.
2. 고객 화면의 주요 CTA는 한 화면에 하나만 명확하게 강조된다.
3. 적립 버튼을 빠르게 여러 번 눌러도 한 번만 처리된다.
4. 완료 후 즉시 성공을 이해할 수 있고 자동 초기화가 동작한다.
5. 관리자 대시보드에서 핵심 KPI와 관리 기능의 우선순위가 구분된다.
6. 고객/관리자 화면이 같은 Design Token을 사용한다.
7. Mobile / Tablet / Desktop이 각각 자연스럽다.
8. APK에서 주소창이 없는 전용 앱처럼 느껴진다.
9. 기존 Google Sheets·멀티테넌트·포인트 로직에 회귀가 없다.
10. 기존 테스트와 production build가 통과한다.

---

## 최종 원칙

LOOP Native Retail UI는 화려한 앱이 아니라 **매장에서 고객이 생각하지 않고 쓸 수 있는 도구**를 목표로 한다.

고객 화면은 빠르고 단순하게,
관리자 화면은 정돈되고 밀도 있게,
둘은 하나의 LOOP 제품처럼 보여야 한다.
