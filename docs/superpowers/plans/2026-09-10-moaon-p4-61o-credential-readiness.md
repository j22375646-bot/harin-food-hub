# P4-61O — 서버 저장 활성화 사전 점검

기준3c47ee0, D:\GPT\moaon. 설치0.52.0 유지(앱 코드 변경 없음).

## 완료 범위

운영 활성화 전에 필요한 설정을 기존 runtime validator로 검사하는 오프라인 도구를 추가한다. process.env를 변경하지 않고 env파일을 자동으로 읽지 않으며 네트워크·DB·SQL·자격증명 저장을 실행하지 않는다. 비활성 상태에서도 복사본으로 후보 설정을 검사한다. 결과에는 고정된 code/status만 넣고 비밀값·keyID·hostname·오류본문을 출력하지 않는다.

정상 설정은 CONFIGURATION_VALID_REQUIRES_OPERATIONS이며 READY가 아니다. 활성화 switch는 별도 표시한다. 실제 DB ACL/schema/fence/quota/ingress/owner-policy/key-custody/platform verification은 언제나 UNVERIFIED로 남긴다. 운영 검증을 통과했다고 수동 플래그로 꾸미는 기능은 없다.

Task1 구현자: lib/tenancy/credential-readiness.js + scripts/check-moaon-credential-readiness.js + 테스트. 기존 설정검사 재사용, exact desktop origin, identity config, missing/invalid/disabled/secret redaction/immutability/CLI exit 시험.
Task2 root: 현재 proxy/SQL와 대조한 운영 점검 runbook, 실제 현재 process 환경에서 안전한 진단 실행(운영환경 확인으로 오인 금지), 관련 회귀 및 소스/설치 숨김 로그인/UI 검증. 앱 불변이므로 재패키징하지 않는다.
Task3 독립 검토, 수정, 결과·master 갱신, 기존브랜치 commit/push.

운영 SQL/role/키/env/배포·실제 API 인증정보 변경은 이 단계에 포함하지 않는다. 현재 코드의 전역 OWNER 및 사업장 ACTIVE OWNER 검사를 보존한다. 과거 전체회귀 결과를 현재 재실행한 것으로 보고하지 않는다. 디스크 집약 작업은 겹치지 않게 실행한다.
