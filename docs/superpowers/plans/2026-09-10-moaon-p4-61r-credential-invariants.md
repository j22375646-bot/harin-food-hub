# P4-61R — 저장 제약조건·기본값·인덱스 대조

기준3fd7aa7. D:\GPT\moaon. 앱0.52.0 유지, 실제 설치 패키지 가시 검증은 오른쪽 보조 모니터에 비포커스로 표시한다.

## 구현

새 읽기전용 opt-in CLI/module: credential-invariants-check. 기존 제한-role/TLS/timeout/diagnostic-noop/항상close를 사용하고 안전한 고정code/status만 반환한다. env파일·임의SQL·대상·운영통과인수를 받지 않는다. provider_credentials 실제 행을 읽거나 CHECK/default/업무함수를 실행하지 않는다.

후보 credential-store.sql의 PK(tenant_id,provider)와 backing index의 유효/ready/unique/primary/immediate·열 순서·partial/expression부재, FK2개 대상/열/validated/nondeferrable/actions, CHECK3개(provider allowlist,revision>0,envelope object/size32768), updated_at defaultclock_timestamp를 대조한다. 실제 PostgreSQL이 출력한 canonical 정의를 정확히 비교하며 위험한공백/구문제거·부분문자열대조를 사용하지 않는다. 사용자 함수/연산자에 의존하는 spoof를 거부한다.

버전은 실제확인된canonical만 지원하고 미확인major는 통과시키지 않는다. 현재 번들PGlite는PG18.3이며 기존격리nativePG17에서도 정의와실행을 대조할 수 있는지 확인한다. 지원버전/제약범위 밖은 명시적으로 남긴다.

성공 CREDENTIAL_INVARIANTS_MATCH_REQUIRES_OPERATIONS도 전체운영준비완료가 아니다. RLS정책/함수본문/다른테이블제약/실제quota/세션fence/ingress/플랫폼인증은 UNVERIFIED. 운영DB접속/SQL변경/키저장/배포없음.

## 검증 및 완료

구현자: 실제후보SQL의정상기준과 누락/약화CHECK/NOTVALID/wrongFK/action/PK/defaultconstant/사용자함수spoof 등의 격리catalog시험, CLI수명주기/비밀누출/opt-in거부. native17은 별도격리DB만 쓰고생성/정리/PG정지증거확인.
Root: 문서/runbook/마스터, 관련회귀, 설치가시14시나리오/오른쪽비포커스/캡처, 독립검토후기존브랜치commit/push. 제품UI변경없어재패키징하지않으며 이전전체시험을재실행한것으로표시하지않는다.
