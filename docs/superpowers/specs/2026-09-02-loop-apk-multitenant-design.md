# LOOP APK 및 업체별 Google Sheets 연결 설계

## 목표

기존 LOOP의 고객·포인트·설정·외부 DB 가져오기 기능을 유지하면서, 하나의 Android APK가 업체별 Google Sheets를 분리해 사용하도록 만든다. 업체는 태블릿에서 최초 1회 매장 연결코드를 입력하고, 이후에는 앱을 다시 로그인하지 않는다.

## 현재 상태

- Next.js 15 + TypeScript + Vercel 배포
- Google Sheets API를 `googleapis`로 호출
- `lib/sheets.ts`가 `process.env.GOOGLE_SHEET_ID`를 직접 사용
- 현재는 환경변수 기준 단일 업체 모드
- 고객, 방문, 포인트, 도장, 결제포인트, 설정, 엑셀 가져오기 기능은 유지 대상

## 결정된 방향

### 데이터와 실행 계층

- 고객·포인트·설정 데이터는 업체별 Google Sheets에 계속 저장한다.
- Vercel의 기존 서버리스 API를 유지한다. 유료 데이터베이스나 별도 서버는 추가하지 않는다.
- 하나의 LOOP APK가 동일한 Vercel URL을 불러온다.
- Google 서비스 계정과 Private Key는 APK에 넣지 않고 Vercel 환경변수에만 둔다.
- 각 업체의 Google Sheet는 LOOP 서비스 계정에 편집자 권한으로 공유한다.

### 업체 연결

- 기존 시트 순서와 이름은 보존한다.
- 설정 그룹 마지막에 `설정_매장연결` 시트를 추가한다.
- `설정_매장연결` 컬럼은 `업체명`, `연결코드`, `사용상태`, `앱표시명`으로 한다.
- 최초 연결 요청은 `spreadsheetId` 또는 Google Sheets URL과 `연결코드`를 받는다.
- 서버는 해당 시트의 연결 설정을 확인한 뒤 서명된 지속 토큰을 발급한다.
- APK/웹앱은 토큰을 로컬에 저장하고 이후 요청에 전달한다.
- 토큰이 없으면 기존 `GOOGLE_SHEET_ID` 환경변수를 사용하는 단일 업체 fallback을 유지한다.

### 인증 토큰

- 토큰은 `LOOP_AUTH_SECRET` 환경변수로 HMAC-SHA256 서명한다.
- payload에는 `spreadsheetId`, `deviceId`, `issuedAt`, `version`을 포함한다.
- 토큰 검증에 실패하면 데이터 API는 실행하지 않는다.
- 초기 무료 MVP에서는 중앙 기기 DB를 만들지 않는다. 앱 데이터 삭제·초기화 후에는 다시 연결코드를 입력한다.
- 토큰은 Google 자격증명이 아니며, Google 서비스 계정 정보는 절대 포함하지 않는다.

### 기존 코드 보존 원칙

- 도메인 모델과 포인트 계산 로직은 변경하지 않는다.
- 모든 공개 Sheets 함수에 선택적 `SheetContext`를 추가해 기존 호출 호환성을 유지한다.
- 시트 레이아웃 초기화 캐시는 단일 전역 Promise가 아니라 spreadsheet ID별로 분리한다.
- 현재 환경변수 기반 단일 업체 호출은 테스트와 기존 배포를 위해 계속 동작해야 한다.

## API 흐름

### 매장 연결

`POST /api/device/activate`

```json
{
  "spreadsheetId": "Google Sheets ID 또는 URL에서 추출한 ID",
  "connectionCode": "LOOP-CAFE-4821",
  "deviceId": "기기별 로컬 UUID"
}
```

성공 응답:

```json
{
  "token": "signed-token",
  "storeName": "꿈카페",
  "appName": "꿈카페 멤버십"
}
```

### 기존 데이터 API

- `Authorization: Bearer <token>` 또는 `x-loop-tenant-token`을 우선 사용한다.
- 유효한 토큰에서 `spreadsheetId`를 얻는다.
- 클라이언트가 데이터 API payload로 보낸 임의의 sheet ID는 사용하지 않는다.
- 토큰이 없을 때만 기존 환경변수 fallback을 사용한다.

## APK

- 기존 Vercel 웹앱을 불러오는 Android 하이브리드 앱으로 시작한다.
- 앱 내부에 매장 연결 화면을 둔다.
- 연결 성공 후 Vercel 페이지를 전체 화면으로 표시한다.
- 브라우저 주소창, 새로고침, 뒤로가기 이탈을 막는다.
- 화면 자동 꺼짐 방지와 태블릿 화면 최적화를 적용한다.
- 네이티브 앱 전체 재작성은 이번 범위에서 제외한다.

## 오류 처리

- 잘못된 시트 주소: `INVALID_SPREADSHEET_ID`
- LOOP 서비스 계정이 시트에 접근할 수 없음: `SHEET_ACCESS_DENIED`
- 연결코드 불일치: `INVALID_CONNECTION_CODE`
- 사용 중지된 매장: `STORE_INACTIVE`
- 토큰 위조·손상: `INVALID_TENANT_TOKEN`
- 기존 단일 업체 환경변수 미설정: 기존 `GOOGLE_SHEETS_NOT_CONFIGURED` 유지

## 검증 기준

1. 기존 단일 업체 환경변수 모드의 테스트가 모두 통과한다.
2. 서로 다른 두 Google Sheet의 고객·설정·거래가 섞이지 않는다.
3. 연결코드가 맞지 않으면 어떤 고객 데이터도 반환하지 않는다.
4. APK를 재실행해도 연결코드를 다시 요구하지 않는다.
5. 앱 데이터 삭제 후에는 매장 연결 화면이 다시 나타난다.
6. 기존 외부 고객 DB 가져오기와 포인트 방식별 기능이 유지된다.
7. Android 프로젝트가 debug APK를 생성할 수 있다.
