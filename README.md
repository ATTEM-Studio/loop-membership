# LOOP MVP

매장 태블릿용 고객 멤버십과 유입경로 CRM의 시연용 MVP입니다.

## 실행

```bash
npm install
npm run dev
```

고객 화면에서 전화번호를 입력하고, 신규 고객이면 유입경로를 선택합니다. 관리자 보기에서 적립·재방문·유입경로 데이터를 확인할 수 있습니다. 현재 데이터 저장소는 브라우저 `localStorage`이며, 다음 단계에서 `Repository` 인터페이스를 기준으로 Google Sheets API Route를 연결하면 됩니다.

## Google Sheets 연결 준비

`.env.example`을 `.env.local`로 복사하고 서비스 계정 이메일, private key, sheet id를 입력합니다. UI와 도메인 로직은 저장소 구현과 분리되어 있어 Google Sheets 연결 시 화면 변경을 최소화할 수 있습니다.

## Google Sheets 설정

1. Google Cloud에서 Sheets API를 활성화하고 서비스 계정을 만듭니다.
2. Google Sheet에 `Customers` 시트를 만들고 서비스 계정 이메일을 편집자로 공유합니다.
3. Vercel 환경변수에 `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEET_ID`를 등록합니다.
4. `GET /api/members`로 연결 상태를 확인하고, `POST /api/members`에 `{ "phone": "01012345678", "source": "인스타" }`를 보내 적립을 테스트합니다.
