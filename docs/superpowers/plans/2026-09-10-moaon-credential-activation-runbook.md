# 서버 API 설정 저장 활성화 점검

이 문서는 운영 변경을 자동 실행하지 않는다. 설정 형식 점검과 운영 증거를 구분한다. 플랫폼 연결과 주문 수집 전환은 자격증명 저장 다음 단계다.

## 1. 후보 설정 점검

신뢰할 수 있는 서버 배포 환경에서 다음 도구를 실행한다. 로컬 셸에서 실행한 결과는 그 셸에 전달된 값만 검사한다. .env 파일이나 원격 배포 환경을 자동으로 읽지 않는다. 키를 명령줄 인수로 넣거나 출력하지 않는다.

```powershell
. D:\GPT\enter-moaon.ps1
node scripts/check-moaon-credential-readiness.js
```

기존 runtime의 암호화 키 구성, HTTPS origin/ingress, 별도 최소권한 DB/TLS 설정과 신원 확인 설정을 재사용한다. 앱의 고정 origin과 다른 주소는 거부한다. switch가 비활성이어도 후보 설정을 검사하되 입력 환경을 변경하지 않는다. exit0은 설정 형식 점검 통과일 뿐, 운영 저장 준비 완료가 아니다. exit1은 누락/부적합이며 고정 상태 코드만 기록한다.

## 2. 권한 정책 대조

현재 proxy.js는 로그인 세션을 touch:true로 검사한 다음 전역 session.role OWNER를 요구한다. 따라서 사업장 membership만 OWNER인 전역 비OWNER 사용자는 route에 도달하기 전에403이다. credential-store는 다시 ACTIVE tenant + ACTIVE OWNER membership과 세션 잠금을 검사한다. 전역 OWNER도 다른 사업장 소유 권한을 자동으로 얻지 않는다.

실제 운영 인수에는 전역OWNER/소유사업장, 전역OWNER/타사업장, 전역비OWNER/소유사업장, 비활성사업장, 폐기/만료세션을 각각 대조해야 한다. 다사업장 계정에 필요한 정책을 확인하기 전에는 proxy 보호를 우회하거나 일괄 OWNER 승격하지 않는다. runtime 내부 admission은 전역 proxy의 선행 인증 조회와 touch까지 제한하지 않으므로 ingress/전역 인증 요청 제한도 별도 점검한다.

## 3. DB 적용 증거

변경 전 백업·권한 차이·실행 대상과 복구안을 확인한다. 후보 SQL은 자동 migration이 아니다. control-plane/control-role/auth-session-fence/credential-store의 선행 관계를 확인한 뒤 credential-runtime-role, credential-request-admission을 대조한다. 특히 credential-runtime-role.sql은 NOLOGIN 역할만 허용하므로 이미 LOGIN인 운영 역할에 그대로 재실행하지 않는다. 로그인/비밀번호 부여는 별도 최소권한 절차다.

검증 대상 파일:

- lib/tenancy/sql/control-plane.sql 및 control-role.sql
- lib/tenancy/sql/auth-session-fence.sql
- lib/tenancy/sql/credential-store.sql
- lib/tenancy/sql/credential-runtime-role.sql
- lib/tenancy/sql/credential-request-admission.sql

실제 연결 역할의 소유권/상속/DDL/BYPASSRLS 부재, 필요한 열 권한·정책, 세션 폐기와 저장의 동일 잠금 순서, 계정 비활성화 차단을 검증한다. quota는300초 GLOBAL120/IP30/USER10이며 GET과POST가 각각1회를 사용한다. 한도 행 보존/정리와 HMAC 교체 시 한도 초기화 영향을 함께 정한다. 오프라인 도구는 이 상태를 검사하지 않는다.

### 읽기 전용 구조 점검 명령

위 대상의 별도 최소권한 연결 설정을 가진 운영 환경에서 다음을 실행한다. 기본은 opt-in 꺼짐이며 DB 연결조차 만들지 않는다. CLI는 env 파일이나 인수를 자동으로 받아 대상으로 삼지 않는다.

```powershell
$env:MOAON_CONTROL_DB_DIAGNOSTIC='1'
node scripts/check-moaon-credential-schema.js
```

도구의 진단 SQL은 고정 catalog SELECT이며 테이블9개의 존재/RLS, quota 함수2개의 인수/반환형/일반 함수/security invoker 형태만 확인한다. 기존 adapter의 세션 초기화·timeout 설정·제한 역할 검사가 함께 실행된다. 사용자/사업장/키/quota 행 조회, quota 함수 실행, DDL과 데이터 변경은 하지 않는다. 함수 본문과 열 구조·ACL·정책·실제 fence/한도 동작은 별도 점검이다.

exit0/SCHEMA_PRESENT_REQUIRES_OPERATIONS도 운영 준비 완료가 아니다. 누락·RLS 없음·함수 형태 불일치·쿼리/정리 실패는 BLOCKED/exit1이다. 반환은 고정 code/status뿐이며 실제 주소·연결값·예외 원문은 출력하지 않는다. 점검 종료 시 DB pool을 정리한다.

## 4. 키·진입 경로·배포

암호화 키 저장 위치와 접근자, active key ID 교체 및 이전 키 복호화 유지, HMAC 분리와 복구 절차를 마련한다. 키 원문을 문서·대화·시험 로그에 복사하지 않는다. VERCEL 환경 변수 값만으로 실제 운영 진입 경로를 증명할 수 없다. 실제 production 배포와 직접 ingress, 단일 IP 헤더 일치 정책을 확인한다.

승인된 배포 대상으로만 적용하고 switch는 준비 증거가 완성될 때까지 비활성으로 둔다. 활성화 후에는 먼저 비밀값을 반환하지 않는 metadata GET을 확인한다. 실제 키 저장은 소유자가 사업장·플랫폼을 확인하고 명시적으로 실행하는 작업이다. 저장됨은 인증됨을 의미하지 않는다.

## 5. 중단·복구

문제가 생기면 저장 기능 switch를 비활성으로 되돌린 설정으로 새 배포 또는 서버 재시작을 수행하고, 실제 요청의503 SETUP_REQUIRED를 확인한다. runtime은 생성 때 설정을 읽으므로 환경 값 수정만으로 이미 실행 중인 인스턴스가 즉시 중단되지는 않는다. 비활성은 GET과POST를 함께 차단한다. 이미 시작된 요청이 취소·롤백되었다고 가정하지 않는다. POST 결과 불명은 다시 보내지 않는다. 비활성 중에는 권한 있는 운영자의 읽기 전용 DB 점검으로 revision을 확인하거나, 장애 해결과 통제된 재활성화 후 metadata GET으로 확인한다. 비활성 endpoint에서 GET이 계속 동작한다고 가정하지 않는다. 키/암호문/이력 또는 quota 행을 즉흥 삭제하지 않는다. 기존 하린식품 운영 인증정보를 새 설정으로 자동 교체하지 않는다.
