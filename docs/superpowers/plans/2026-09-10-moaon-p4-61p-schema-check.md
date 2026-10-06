# P4-61P — DB 구조 읽기 전용 점검과 보이는 앱 검증

기준8d9146c. D:\GPT\moaon, 앱0.52.0 유지.

## 사용자 보완

숨김 검증뿐 아니라 설치 모아온을 실제로 열어 보여준다. 마우스/키보드 원격 조작은 하지 않는다. 사용자의 기존 설치 앱은 정상 실행하고, 자동 시험은 별도 D 격리 프로필과 설치 app.asar에 가상 서버 응답을 사용한다. 보이는 시험 창에는 시험 자료/실제 서버 저장 아님을 표시한다. 기본 hidden 모드는 유지하며 명시적인 --visible-demo만 가시 실행한다.

## Task1 DB 진단

lib/tenancy/credential-schema-check.js + scripts/check-moaon-credential-schema.js + 시험. MOAON_CONTROL_DB_DIAGNOSTIC=1 명시 opt-in, 기존 고정 역할 DB adapter 사용. 단일 고정 catalog SELECT로 runtime 필수 table9개 존재/RLS 및 quota function2개 exactsignature/boolean scalar/securityinvoker shape 검사. business/user/key/quota실데이터 읽기 및 RPC호출·쓰기·migration 금지. factory/query/close 오류 sanitized 고정code, finallyclose.

결과는 SCHEMA_PRESENT_REQUIRES_OPERATIONS 또는 BLOCKED이며 ACL/정책/함수정의/실세션fence/ingress/platform은 UNVERIFIED. catalog shape 통과를 실제동작/운영준비완료로 표시하지 않는다. 실제PGlite catalog drift와 lifecycle/no-optin/noSQL/rawerror누출방지 시험.

## Task2 보이는 검증(root)

기존 credential-settings-smoke.cjs에 --visible-demo 옵션 추가. synthetic응답/격리프로필/설치패키지 동일성 유지, 보이는banner/단계간짧은간격/완료표시/캡처. nativeinput API없음. 기본hidden경로 회귀확인. 사용자 정정대로 오른쪽 보조 모니터에 showInactive로 표시하며 메인 모니터 포커스를 가져오지 않는다. 가로/세로 작업영역 안 배치와 비포커스를 확인한다. AGENTS에 사용자선호 반영. 앱제품코드불변이므로 installer버전갱신없음.

## 완료 검증

신규/관련 서버 집중시험, 설치패키지 가시14시나리오와 기본숨김 회귀, 독립검토, runbook/report/master, commit/push. 운영 접속/SQL적용/키교체/배포는 자동 실행하지 않는다. 현재 환경에 연결설정이 없다면 그사실을 운영조회성공으로 표시하지 않는다.
