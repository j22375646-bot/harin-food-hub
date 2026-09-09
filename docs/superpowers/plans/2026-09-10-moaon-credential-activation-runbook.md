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

### 자격증명 열 구조와 보호 테이블 권한 대조

같은 제한 역할 연결 설정과 진단 opt-in으로 다음을 실행한다. 진단 opt-in은 자격증명 저장 기능의 활성화 switch와 별개다.

```powershell
$env:MOAON_CONTROL_DB_DIAGNOSTIC='1'
node scripts/check-moaon-credential-contract.js
```

provider_credentials의6개 열 이름·자료형·NOT NULL·생성열 여부와 updated_at 기본값 존재를 대조한다. 기본값의 표현식과 제약조건/인덱스 의미까지 검증하지 않는다. 추가 열도 현재 저장 계약과 달라 INVALID로 처리한다.

보호 대상4개 테이블에서 moaon_control_app에 적용되는 열 권한은 아래 계약과 정확히 같아야 한다. 전체 테이블/PUBLIC 부여로 생긴 유효 권한도 포함한다. 다른 열의 추가 권한 및 DELETE/TRUNCATE/TRIGGER/REFERENCES는 허용하지 않는다.

| 테이블 | SELECT | INSERT | UPDATE |
| --- | --- | --- | --- |
| provider_credentials | tenant_id,provider,revision | tenant_id,provider,revision,envelope,updated_by | revision,envelope,updated_by,updated_at |
| account_state | user_id,blocked | 없음 | user_id |
| dashboard_users | user_id,active | 없음 | user_id |
| dashboard_sessions | id,user_id,token_hash,revoked_at,expires_at | 없음 | id |

인증 테이블의 좁은 UPDATE 권한은 세션 보호용 잠금과 함께 설계돼 있다. 이 점검은 RLS 정책 본문을 검증하지 않으므로 실제 데이터 변경 차단까지 보증하지 않는다. 나머지 테이블/역할의 ACL도 별도 대상이다.

exit0/CREDENTIAL_CONTRACT_MATCHES_REQUIRES_OPERATIONS는 이 열·권한 계약의 일치만 의미한다. 운영 준비 완료, 함수 본문 안전성, 실제 세션 폐기 경합, 플랫폼 인증을 의미하지 않는다. BLOCKED는 자동 GRANT나 스키마 변경으로 고치지 말고 후보 SQL과 차이를 검토한다. 도구는 실데이터/암호문 조회 및 권한 변경을 하지 않는다.

### 저장 제약조건·기본값·인덱스 대조

같은 진단 opt-in과 제한 역할 연결로 저장 테이블의 제약조건을 점검한다.

```powershell
$env:MOAON_CONTROL_DB_DIAGNOSTIC='1'
node scripts/check-moaon-credential-invariants.js
```

이 점검은 provider_credentials의 아래 구조만 대조한다.

- 사업장/플랫폼 복합 기본키와 유효한 고유 인덱스
- tenants(id), memberships(tenant_id,user_id)로 향하는 검증된 외래키
- 허용 플랫폼4개, 양수 revision, object형 암호문과32768바이트 제한 CHECK
- updated_at의 기본 clock_timestamp 호출 정의

격리 PostgreSQL17.11과 PGlite18.3에서 실제 후보를 적용해 확인한 canonical 표현과 catalog 참조 대상을 비교한다. 지원 major는17·18이며 패치별 표현 차이가 생겨도 자동 완화하지 않는다. 비슷한 문자열로 임의 정규화하거나 사용자 정의 함수·연산자를 실행하지 않는다. 지원하지 않는 PostgreSQL major는 정상으로 처리하지 않으며 표현 차이도 검토가 필요하다. 같은 이름의 다른 함수·연산자·인덱스 구성, 약해진/추가된 제약, NOT VALID, NOT ENFORCED 또는 지연 제약은 통과하지 않는다.

성공 CREDENTIAL_INVARIANTS_MATCH_REQUIRES_OPERATIONS는 이 저장 테이블의 검사 대상과 일치한다는 뜻이다. 다른 테이블의 제약, RLS정책, 업무 함수 본문, 실제 세션 폐기 경합과 플랫폼 인증은 별도다. 데이터의 무결성을 직접 스캔하거나 운영 쓰기 시험을 실행한 결과도 아니다. 구조를 자동으로 수정하거나 삭제하지 않는다.

### 인증 잠금과 저장 RLS 정책 대조

```powershell
$env:MOAON_CONTROL_DB_DIAGNOSTIC='1'
node scripts/check-moaon-credential-policies.js
```

보호 테이블4개에서 런타임에 적용되는 정책과 예약 정책 이름을 후보 SQL과 대조한다. SELECT는 USING(true), 인증 테이블3개의 UPDATE 잠금은 USING(true)/WITH CHECK(false), provider_credentials의 INSERT/UPDATE는 후보의 true 조건이어야 한다. 정확한 명령·permissive·단일 역할·정책 집합, RLS 활성·비소유자·역할 멤버십 부재·row_security=on을 함께 검사한다. 추가 PUBLIC/런타임 정책과 예약 이름을 차지한 다른 역할 정책도 차이로 처리한다.

정책 표현과 의존성을 카탈로그에서 읽지만 실행하지 않는다. 사용자 함수가 들어 있거나 동등해 보이는 다른 표현도 자동으로 허용하지 않는다. 성공 CREDENTIAL_POLICIES_MATCH_REQUIRES_OPERATIONS는 이4개 테이블의 제한된 정책 대조만 의미한다. 다른 역할 전용 정책, 다른 테이블 정책, 열 권한, 함수/트리거/룰, OWNER·세션·quota 실제 동작은 별도다. 자동 CREATE/ALTER POLICY를 실행하지 않는다.

## 4. 키·진입 경로·배포

암호화 키 저장 위치와 접근자, active key ID 교체 및 이전 키 복호화 유지, HMAC 분리와 복구 절차를 마련한다. 키 원문을 문서·대화·시험 로그에 복사하지 않는다. VERCEL 환경 변수 값만으로 실제 운영 진입 경로를 증명할 수 없다. 실제 production 배포와 직접 ingress, 단일 IP 헤더 일치 정책을 확인한다.

승인된 배포 대상으로만 적용하고 switch는 준비 증거가 완성될 때까지 비활성으로 둔다. 활성화 후에는 먼저 비밀값을 반환하지 않는 metadata GET을 확인한다. 실제 키 저장은 소유자가 사업장·플랫폼을 확인하고 명시적으로 실행하는 작업이다. 저장됨은 인증됨을 의미하지 않는다.

## 5. 중단·복구

문제가 생기면 저장 기능 switch를 비활성으로 되돌린 설정으로 새 배포 또는 서버 재시작을 수행하고, 실제 요청의503 SETUP_REQUIRED를 확인한다. runtime은 생성 때 설정을 읽으므로 환경 값 수정만으로 이미 실행 중인 인스턴스가 즉시 중단되지는 않는다. 비활성은 GET과POST를 함께 차단한다. 이미 시작된 요청이 취소·롤백되었다고 가정하지 않는다. POST 결과 불명은 다시 보내지 않는다. 비활성 중에는 권한 있는 운영자의 읽기 전용 DB 점검으로 revision을 확인하거나, 장애 해결과 통제된 재활성화 후 metadata GET으로 확인한다. 비활성 endpoint에서 GET이 계속 동작한다고 가정하지 않는다. 키/암호문/이력 또는 quota 행을 즉흥 삭제하지 않는다. 기존 하린식품 운영 인증정보를 새 설정으로 자동 교체하지 않는다.
