# P4-162 AI API 키 직접 저장

요청: 앱 설정/API에서 Gemini·CLOVA·OpenAI 키를 직접 입력하고 저장한다. OpenAI는 아직 사용하지 않는다.

기존 하린식품 전용 managed-key owner 인증/RPC/암호화 저장 경로를 확장한다. 별도 미활성 다사업장 credential-store 경로는 확장하지 않는다.

- CLOVA: API 키·비용관리용 계정 구분 ID·단가·단가 기준·크레딧 만료일. Gemini: API 키·Google Cloud 프로젝트 ID. OpenAI: API 키만 보관.
- LIST는 기존 cards 4개를 유지하고 aiCards 3개를 별도로 추가하여 구버전 설정 UI를 보존한다.
- AI 키는 입력 후 서버 암호화 저장. 저장된 비밀키를 UI로 다시 반환하는 REVEAL을 금지한다. 저장 결과는 revision과 상태만 반환한다.
- CHECK는 저장 및 사용 준비 상태를 확인하며 AI 생성/연결 시험/과금 요청을 하지 않는다.
- CLOVA/Gemini 분석은 인증 완료 후 요청마다 저장 키를 읽는다. 사용자 정정에 따라 한 번의 저장 확인으로 자동 활성화한다. Gemini는 무료 프로젝트/공개자료 처리 확인, CLOVA는 집계 자료 처리와 단가/크레딧 설정을 같은 화면에서 확인한다. 긴급 중지 설정은 우선한다. 실제 공급자 인증 성공과는 구분한다.
- OpenAI는 저장만 지원하고 신규 호출 경로를 연결하지 않는다.
- 실제 사용자 키·provider 호출 시험 없이 가상 키로 암호화/권한/충돌/자동 활성화/화면 동작을 검증한다. 운영 DB에서는 스키마와 권한만 확인한다.

## 실행 순서

서버 정의·RPC migration → IPC/UI → 키 읽기와 AI runtime 연결 → 독립 검토·격리 DB 및 실제 앱 검증 → 운영 migration·웹·서명 앱 배포·설치/업데이트 확인.
