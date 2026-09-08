# P4-10 실제 풀러 주소 확보·운영 연결 항목 등록

공식 Supabase 소스의 ConnectSheet URL 파라미터를 확인하여 showConnect=true&connectTab=direct&method=session으로 연결 화면을 열었다. 브라우저 클릭 API가 없어도 주소 조회가 가능했다. 이전 사용자에게 Host를 요청했던 장애는 해소되었다.

실제 프로젝트 화면에서 aws-0-ap-southeast-1.pooler.supabase.com:5432, database=postgres 확인. 예시 주소를 추정한 것이 아니다. 개발 PC에서 이 주소 TCP 연결 POOLER_TCP_CONNECTED 확인. 이는 TLS/DB 로그인 성공을 의미하지 않는다.

Vercel harin-cafe24-sync Production에 다음 5개 항목을 신규 등록하고 목록에서 재확인했다. CLI는 모두 Sensitive로 저장했다. Preview/Development에는 추가하지 않았다.

- MOAON_CONTROL_DB_MODE=supabase-session
- MOAON_CONTROL_DB_PROJECT_REF=llnlphdmcmwgjnpndaam
- MOAON_CONTROL_DB_HOST=aws-0-ap-southeast-1.pooler.supabase.com
- MOAON_CONTROL_DB_PORT=5432
- MOAON_CONTROL_DB_NAME=postgres

비밀번호 변수는 등록하지 않았다. 전용 역할 LOGIN 활성화, 비밀번호 생성, 사용자 데이터 변경, 웹 재배포/EXE 교체 없음. 현재 route는 설정 모듈을 사용하지 않아 이 등록만으로 기능이 개방되지 않는다. 다음 배포에도 비밀번호 없이 소비하면 구성 오류로 닫혀야 한다.

다음 단계는 비밀값을 출력하지 않는 전용 자격 증명 제공 → TLS·로그인·역할·세션 초기화·트랜잭션 실검증 → 사업장 소유권 대조 및 route 연결이다. 사용자에게 Host를 다시 요청할 필요는 없다. 신규 유료 자원 없음.

프로젝트 연결 화면: https://supabase.com/dashboard/project/llnlphdmcmwgjnpndaam?showConnect=true&connectTab=direct&method=session

[전체 계획](./2026-09-07-multi-business-desktop-master-plan.md)
