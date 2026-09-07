# MOAON 기존 로그인 trusted identity 조합 계약

P1-03 Task 1의 서버 경계다. 기존 로그인·proxy·route에는 자동 연결하지 않는다.

```js
const { createDashboardIdentityVerifier } = require('../../../lib/tenancy/dashboard-identity.js');
const { createTenantControlStore } = require('../../../lib/tenancy/control-store.js');

const verifySession = createDashboardIdentityVerifier({
  db: existingDashboardDatabase,
  authAdmin: serverSupabaseClient.auth.admin,
});
const store = createTenantControlStore({ database: restrictedControlDatabase, verifySession });
```

- `db`와 `authAdmin`은 서버가 명시적으로 주입한다. 환경 fallback, 브라우저 입력, service-role 업무 DB adapter를 만들지 않는다.
- credential은 앞뒤 공백 없는 1~4096자 문자열만 받는다. 매 호출은 기존 `dashboard-auth.validateSession(credential, { db, touch:false })`로 서명·DB 세션을 두 번 확인한다. `resolveRequestSession`, proxy 신뢰 헤더, global profile role은 사용하지 않는다.
- 가운데에서 같은 `dashboard_users.user_id`의 `active === true`와 Auth Admin `getUserById(userId)` 결과를 확인한다. 공식 문서상 이 Admin API는 서버 전용이다: <https://supabase.com/docs/reference/javascript/auth-admin-getuserbyid>.
- profile/Auth 이메일이 정규화 후 같아야 한다. `emailVerified`는 현재보다 미래가 아닌 유효한 `email_confirmed_at`만 증거로 삼는다. phone `confirmed_at`, metadata, profile flag, caller claim은 권한 증거가 아니다.
- `is_anonymous === false`가 아닌 계정, 삭제·현재 차단 계정, 변형/폐기/만료 세션, identity 변경은 거부한다. 두 세션 만료 중 이른 값을 사용하며 결과는 `{id,userId,email,emailVerified,expiresAt}`만 담은 frozen 객체다.
- 전체 검증 제한 시간은 기본 10초다. 재시도·cache·계정 쓰기·로그가 없고 오류는 `AUTH_REQUIRED` 또는 `IDENTITY_UNAVAILABLE`의 일반 메시지만 노출한다.
- 테스트에서만 factory 조합 시 session validator, clock, timeout을 바꿀 수 있다. 운영 조합은 기본 실제 validator와 실제 clock을 쓴다.

## 활성화 전 남은 gate

- SMTP와 실제 이메일 전달·확인 lifecycle을 staging에서 검증한다.
- 비밀번호 reset hook과 기존 dashboard session 폐기를 구현·검증한다. 현재 Auth `updated_at`을 비밀번호 변경 증거로 추정하지 않는다.
- 제어 저장소 제한 DB 역할/접속을 provisioning하고 hosted 환경에서 검증한다.
- P2 주문·금액·파일·cache 격리를 끝내기 전 공개 가입·초대 route 또는 신규 실사업장을 열지 않는다.
- 기존 사용자의 비밀번호를 변경·재사용·일괄 초기화하지 않는다.
