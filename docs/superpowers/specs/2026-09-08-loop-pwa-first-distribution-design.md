# LOOP PWA 우선 배포 설계

## 목표

LOOP의 기본 배포 방식을 `Vercel 웹 → Capacitor APK 설치` 중심에서 `Vercel 웹 → PWA 홈 화면 설치` 중심으로 전환한다.

기존 Capacitor/Android 프로젝트는 제거하지 않는다. PWA를 기본 배포 방식으로 사용하고, Android 시스템 제어가 필요한 매장만 동일 프론트엔드를 Capacitor APK로 감싸는 2단계 구조로 유지한다.

## 최종 배포 구조

```text
LOOP 코드베이스
    │
    ├─ Vercel Web / PWA  ← 기본
    │    ├─ 매장 A 태블릿 → 매장 A Google Sheet
    │    ├─ 매장 B 태블릿 → 매장 B Google Sheet
    │    └─ 매장 C 태블릿 → 매장 C Google Sheet
    │
    └─ Capacitor Android APK ← 선택 확장
         └─ 완전 키오스크/부팅 자동실행/Android 제어가 필요한 매장
```

## 왜 PWA를 기본으로 하는가

- 업체 전달은 URL 하나로 가능하다.
- 홈 화면 설치 후 standalone 모드로 실행할 수 있다.
- Vercel 배포가 즉시 모든 매장에 반영된다.
- 업체별 Google Sheets/DeviceSession 구조를 그대로 재사용한다.
- APK 파일 교체와 재설치 관리가 기본 운영에 필요하지 않다.
- 무료 범위의 현재 LOOP 아키텍처와 가장 잘 맞는다.

## 설치 온보딩

### 최초 설치

1. 매장 태블릿에서 LOOP 연결 URL을 연다.
2. `?loop-connect=1` 진입 시 구글시트 주소/ID와 매장 연결코드를 입력한다.
3. 서버가 연결을 검증하고 DeviceSession token을 발급한다.
4. DeviceSession은 기존 로컬 저장 방식으로 저장한다.
5. 브라우저가 PWA 설치를 지원하면 `홈 화면에 LOOP 설치` 액션을 노출한다.
6. 설치 후 홈 화면의 LOOP 아이콘을 실행한다.
7. `start_url=/`에서 기존 DeviceSession을 읽어 곧바로 해당 매장 고객 화면을 연다.

### 이후 실행

```text
홈 화면 LOOP 아이콘
→ standalone 실행
→ DeviceSession 복원
→ 해당 매장 설정 로드
→ 고객 전화번호 입력 화면
```

매 실행마다 로그인이나 시트 선택을 요구하지 않는다.

## PWA Manifest

필수 항목을 명시한다.

- `id: /`
- `name: LOOP — 매장 멤버십`
- `short_name: LOOP`
- `start_url: /`
- `scope: /`
- `display: standalone`
- `background_color: #F3F5F8`
- `theme_color: #F3F5F8`
- 192×192 PNG icon
- 512×512 PNG icon
- maskable 512 icon

아이콘 PNG는 바이너리 파일을 수동 관리하지 않고 Next.js ImageResponse route에서 생성한다. manifest는 해당 PNG route를 참조한다.

## 설치 버튼

브라우저가 `beforeinstallprompt` 이벤트를 제공할 때만 `홈 화면에 LOOP 설치` 버튼을 노출한다.

- 이미 standalone 상태면 숨긴다.
- 설치 프롬프트를 사용할 수 없는 브라우저에서는 버튼을 노출하지 않는다.
- 설치 거절 후에는 같은 세션에서 반복적으로 방해하지 않는다.
- 고객의 적립 CTA와 경쟁하지 않도록 Topbar의 보조 액션으로 둔다.

## Service Worker

PWA 설치 자체와 별개로 앱 셸 안정성을 위해 경량 Service Worker를 사용한다.

### 캐시하는 것

- `/_next/static/*` 정적 번들
- PWA 아이콘 route

### 캐시하지 않는 것

- `/api/*`
- Google Sheets에서 파생된 고객 데이터
- POST/PUT/DELETE 요청
- HTML document를 장기 캐시하지 않는다.

목적은 완전 오프라인 적립이 아니라, 정적 자산 로딩 안정성과 앱 실행 체감을 높이는 것이다.

## 데이터 및 보안 원칙

PWA 전환으로 데이터 저장 위치는 바뀌지 않는다.

- 고객 데이터: 업체별 Google Sheets
- DeviceSession: 기존 로컬 저장소
- Google 서비스 계정 비밀키: Vercel 서버 환경변수
- 관리자 PIN: 기존 서버 검증

Service Worker Cache Storage에 고객 목록, 전화번호, 포인트 거래 API 응답을 저장하지 않는다.

## UI/UX와의 결합

이 설계는 `2026-09-08-loop-native-retail-ui-design.md`의 기반 배포 계층이다.

우선순위는 다음과 같다.

1. PWA 설치/standalone 기반 완성
2. LOOP Native Retail Design Token 적용
3. 고객 Kiosk UI 재설계
4. 관리자 Dashboard 재설계
5. 필요 매장에만 Capacitor APK 제공

## Responsive / Installed Mode

CSS에서 다음을 고려한다.

- `min-height: 100dvh`
- `env(safe-area-inset-top)`
- `env(safe-area-inset-bottom)`
- standalone 환경에서 브라우저 UI를 전제로 한 여백 제거
- Android 가상 키보드가 열려도 주요 CTA 접근 가능

필요 시 `@media (display-mode: standalone)`으로 설치형 실행 전용 보정을 추가한다.

## Capacitor의 새 역할

Capacitor는 폐기하지 않는다.

다음 요구가 생길 때만 선택한다.

- Android 완전 키오스크 모드
- 시스템 뒤로가기 강제 제어
- 부팅 후 자동 실행
- 화면 꺼짐 방지의 강한 제어
- 네이티브 하드웨어 API
- Play Store 배포

기본 UI와 비즈니스 로직은 PWA와 APK가 공유한다.

## 완료 기준

1. Android Chromium 계열 브라우저에서 LOOP가 설치 가능한 PWA로 인식된다.
2. 홈 화면 설치 후 주소창 없는 standalone 창으로 실행된다.
3. 앱 아이콘과 시작 스플래시가 LOOP 브랜드로 표시된다.
4. 설치 후에도 기존 DeviceSession이 유지되어 매장 연결을 다시 요구하지 않는다.
5. PWA와 일반 브라우저 접근 모두 기존 고객/포인트 기능이 동일하게 동작한다.
6. Service Worker는 고객 데이터 API 응답을 캐시하지 않는다.
7. Vercel 새 배포 시 HTML을 장기 캐시하지 않아 새 버전이 정상 반영된다.
8. 기존 Capacitor/Android 빌드 구조는 삭제되지 않는다.
9. production build와 기존 테스트가 통과한다.
