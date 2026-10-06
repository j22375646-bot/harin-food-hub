# P4-61R — 저장 제약조건·기본값·인덱스 점검 결과

기준3fd7aa7. 개발 저장소 D:\GPT\moaon. 제품 앱0.52.0 유지.

## 변경

`node scripts/check-moaon-credential-invariants.js`로 provider_credentials의 복합 기본키, 외래키2개, CHECK3개, updated_at 기본값과 기본키 인덱스를 읽기 전용으로 대조한다. 기존 진단 opt-in과 제한 역할 연결을 사용하며, 인수·env파일·임의SQL을 받지 않는다.

기본키 열 순서와 인덱스 유효/ready/live/unique/primary/immediate 상태, btree·내장 opclass·기본 collation, 추가 INCLUDE/부분/표현식 부재를 확인한다. 외래키는 대상 테이블/열 순서·동작·비지연·검증/강제 상태와 equality 연산자를 대조한다. CHECK는 플랫폼4개, 양수 revision, JSON object·32768바이트 제한의 정확한 PostgreSQL 표현을 확인한다. 추가 제약과 사용자 정의 함수/연산자 의존성도 거부한다.

카탈로그만 읽고 실제 행·암호문·저장된 표현식·업무 함수를 실행하지 않는다. 오류는 고정 code/status로 출력하고 연결 정리에 실패해도 BLOCKED를 반환한다. 성공 CREDENTIAL_INVARIANTS_MATCH_REQUIRES_OPERATIONS는 전체 운영 준비 완료가 아니다. 정책/함수 본문, 다른 테이블과 인덱스, collation 의미, 세션 fence·quota·키관리·ingress·실제 플랫폼 인증은 별도 UNVERIFIED로 남긴다.

## 검증

- 설치0.52.0 app.asar의 설정14개 시나리오와 Windows 격리 로컬 암호화 회귀 PASS. 오른쪽 보조 모니터에서 visible=true/focused=false/rightSecondary=true/contained=true를 확인했다. 캡처 D:\GPT\tmp\p461r-right-verification.png를 시각 확인했다. 개발 Electron의 synthetic IPC 시험이며 운영 서버 저장·플랫폼 인증과 구분한다.
- 신규4/4 및 기존 관련20/20 PASS. 실제 파일 존재를 확인한 명시적 목록으로 실행했으며 D:\GPT\tmp\p461r-final.log와 p461r-related.log에 기록했다. CLI 인수의 연결 전 거부, 안전한 JSON/exitcode, 연결 실패·정리 실패·잘못된 catalog 응답을 포함한다.
- 실제 후보 SQL을 PGlite18.3에 적용해 정상 기준과 약화 CHECK·NOT VALID·NOT ENFORCED·외래키 대상/동작·기본키 순서/INCLUDE/지연·추가 제약·기본값 상수·사용자 함수/연산자 위장·search_path 변경을 대조했다. 마지막 FK 연산자 배열 길이 강화 후에도 신규4개 전부 재검증했다.
- 격리 PostgreSQL17.11의 실제 제한 역할로 canonical 표현 일치를 확인한 사전1/1과 정상/NOT VALID 감지 최종1/1 PASS. 로그 p461r-native-canonical.log와 p461r-native-final.log. 이후 FK 배열 길이 조건만 강화했으며 해당 마지막 변경은 위 PGlite 회귀에서 검증했다. 지원 major는17·18이고 다른 major는 UNSUPPORTED/BLOCKED다.
- 구현자가 시험DB·역할 잔존0과 pg_ctl 정상 종료를 확인했다. Root도 p461r-postgres.log의 database system is shut down을 확인했다. 운영 DB에는 접속하지 않았다.
- 독립 검토 승인. 검토자도 최종 신규4/4 PASS를 직접 확인했으며 남은 차단 사항이 없다.

실제 제품 UI/기존 후보 SQL/운영 환경을 변경하지 않았다. 재패키징·전체 Next 빌드·운영 DB 점검/적용·실제 인증 완료를 주장하지 않는다. 운영 적용 전에는 runbook의 남은 정책/함수·운영 검증을 이어가야 한다.
