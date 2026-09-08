# P4-11 제한 DB 계정 실제 연결 및 TLS 검증

## 이번 결과

이전에는 주소와 연결 코드만 준비된 상태였다. 이번에는 실제 운영 Supabase에 관리자 아닌 전용 계정으로 로그인하고, 허브의 PostgreSQL adapter를 통해 조회·트랜잭션까지 검증했다. 다사업장 기능 전체 완료나 사용자 화면 배포를 뜻하지 않는다.

## 실제 반영

- 32바이트 암호학적 난수 기반 비밀번호를 메모리에서 생성했다. 원문은 파일·Git·명령 인자에 쓰지 않고 Vercel CLI 표준입력으로 Production Sensitive 변수 `MOAON_CONTROL_DB_PASSWORD`에 저장했다.
- DB에는 SCRAM 검증값으로 `moaon_control_app` LOGIN을 활성화했다. 기존 관리자 비밀번호는 변경하지 않았다. 관리 migration `moaon_control_app_login_credential`로 적용했으며 검증값은 이 문서나 Git에 싣지 않는다.
- 적용 후 LOGIN=true, superuser/createdb/createrole/inherit/bypassrls=false, connection limit=4를 다시 확인했다. 앱의 프로세스별 pool 최대값 2는 유지했다. 총 웹 인스턴스 수가 늘면 연결 한도는 별도 부하 검증 대상이다.
- 최초 실제 접속의 `SELF_SIGNED_CERT_IN_CHAIN`을 확인했다. 공식 대시보드 소스가 안내하는 CA를 사용해 해결했다. `rejectUnauthorized: true`와 호스트 검증은 유지했다.
- `MOAON_CONTROL_DB_CA`를 설정 모듈에 추가했다. 명시한 CA가 비정상·빈 값·CA가 아닌 인증서이면 안전한 구성 오류로 차단한다. 미설정은 기존 시스템 신뢰 동작을 유지한다. 공식 CA는 Vercel Production에 저장했다.
- 서버 변수 7개가 모두 Production/Hidden/Sensitive로 등록된 것을 목록에서 재확인했다. Preview/Development로 복제하지 않았다.

공식 인증서 지문 SHA256: `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`. 유효 종료 2031-04-26. 인증서 갱신 시 공식 배포처와 지문을 재검증해야 한다.

## 검증 결과

| 항목 | 실제 결과 |
|---|---|
| DB 접속 사용자/세션 사용자 | 둘 다 `moaon_control_app` |
| 실제 adapter 역할 검사 | 통과 |
| tenants/memberships/invitations | 모두 0건, 이번 작업에서 등록하지 않음 |
| 감사 테이블 읽기 제한 | 전용 계정 SELECT 거부 42501, 설계한 INSERT-only 권한 유지 |
| 감사 테이블 자료 수 | 관리자 읽기 전용 조회로 0건 확인 |
| 읽기 트랜잭션 | SELECT 1 → 정상 commit |
| 오류 롤백 | 의도한 callback 오류 반환 후 다음 조회 성공 |
| 세션 초기화 | 임시 application_name이 다음 lease에 Supavisor 기본값으로 복구 |
| 자동 테스트 | 새 CA 테스트 2개 실패 확인 후 구현, 관련 총 83개 통과 |

감사 테이블까지 한 번에 count하는 최초 점검 쿼리는 권한 거부로 실패했다. 이는 연결 결함이 아니라 과도한 점검 쿼리였으며 권한을 넓히지 않고 검사 범위를 수정했다. 운영 자료 INSERT/UPDATE/DELETE, 실제 회원 초대는 실행하지 않았다.

테스트 명령:

```text
node --test test/control-database-config.test.js test/tenant-postgres-control-database.test.js test/tenant-control-store.test.js test/business-list-service.test.js test/business-list-request.test.js
```

실접속은 개발 PC에서 운영 Session pooler를 대상으로 수행했다. Vercel 함수 내부 실접속이나 UI 종단간 시험은 아니다. 실제 운영 DB 쓰기/동시성 시험 역시 하지 않았다. 관련 소스만 검증했으며 전체 Next 빌드는 이번 범위에 포함하지 않았다.

## 사용자에게 아직 달라지지 않는 부분

사업장 목록 route는 아직 이 연결 모듈을 주입받지 않아 `SETUP_REQUIRED` 상태다. 기존 하린식품 로그인·주문·정산·EXE를 교체하지 않았다. 이 변경만으로 새 사업장을 사용할 수 있다고 표시하지 않는다. 운영 재배포는 아직 하지 않았다.

새 DB 인스턴스, 테스트 브랜치, 유료 IPv4, 요금제 상향은 만들지 않았다. 기존 자원의 통상 사용량 외 새 유료 자원은 추가하지 않았다.

## 다음 P4-12

1. 기존 로그인 사용자와 하린식품의 소유권 매핑 근거를 대조한다. 임의 UUID로 사업장 소유권을 만들지 않는다.
2. 검증된 인증과 제한 DB를 사업장 목록 API에 연결하고, 미등록·만료·교차 사용자 조회를 분리 검증한다.
3. Next 빌드와 운영 배포 후 Vercel 내부 접속을 확인한다. DB 연결 한도/지연·오류 응답도 확인한다.
4. 검증된 목록을 앱 사업장 선택 UI로 연결한다. 실제 업무 데이터의 다사업장 격리 완료 전 타 사업장의 주문·정산 쓰기는 열지 않는다.

[전체 개발계획 및 단계별 진행 현황](./2026-09-07-multi-business-desktop-master-plan.md)

[Supabase TLS 공식 안내](https://supabase.com/docs/guides/platform/ssl-enforcement)

[공식 대시보드 CA 배포 주소 정의](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json)
