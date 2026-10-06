# P4-61N — 앱의 서버 API 설정 저장 흐름

기준 fedd482. D:\GPT\moaon, 새 산출물/캐시/로그/시험 DB는 D. 앱0.52.0. 마우스·포커스 점유 금지. 구현/독립 검토 스킬 절차를 사용한다. 기존브랜치 commit/push, 앱 빌드/업데이트/숨김자동검증까지 사용자 승인범위. 운영 서버 SQL/키/env/배포 활성화는 이번에 수행하지 않는다.

## 공통 서버/앱 계약

- 고정 endpoint /api/moaon/credentials.
- GET ?tenantId=<UUID>&provider=<CAFE24|NAVER|COUPANG|EPOST>, 정확히2개 query. HTTPS origin/cookie/OWNER/session/deadline 동일 보호. 응답 {ok:true,tenantId,provider,revision:0|positive,status:NOT_SAVED|SAVED_UNVERIFIED}. revision0만 NOT_SAVED. 비밀값/암호문/키ID/다른사업장정보는 반환하지 않는다.
- POST 기존 exact {tenantId,provider,expectedRevision,fields} 및 응답 보존. 메타 조회/저장 모두 기존 credential admission budget을 사용해 readDOS/비싼identity요청도 제한한다. GET1회와 POST1회는 각각1회 사용하며 자동 polling하지 않는다. 별도권한확장/SQL변경없음.
- setup503 또는 미배포404는 SETUP_REQUIRED,401/403는 ACCESS_DENIED,429 RATE_LIMITED,409 CONFLICT. POST timeout/network/잘못된 성공응답/unknown503는 RESULT_UNKNOWN이며 자동 재전송 금지. 다른 확정오류는 UNAVAILABLE/INVALID. GET실패를 revision0으로 처리하지 않는다.
- desktop IPC readCredentialMetadata({tenantId,provider}), saveServerCredential({tenantId,provider,expectedRevision,fields}). 결과는 위 안전metadata 또는 {status:SETUP_REQUIRED|ACCESS_DENIED|RATE_LIMITED|CONFLICT|RESULT_UNKNOWN|UNAVAILABLE|INVALID|BUSY}. 성공은 metadata에 status NOT_SAVED/SAVED_UNVERIFIED (ok optional desktopboundary, test exact agreed). rawbody/error/statusdetail/secret출력금지.

## Task1 서버 read metadata

기존 credential-store에 readMetadata를 추가: 같은 DBtransaction sessionfence와 ACTIVE OWNER를 재검증하고 revision만 SELECT, 없을때0. read-onlyidentity touch:false, finalsession재확인. 요청 처리기 GET 정확query/cookie/origin validation과metadata응답 검증. runtime공통singleflight/close/maxConcurrent/admission/deadline을 공유. POST안전성보존. route GETdelegate 추가. 기본disabled/미설정으로503, 운영변경없음. Nextlocalrouteguide먼저읽고 TDD. 실제PGlite/가능시제한PG test로 교차사업장/권한/폐기/없는revision/secret없는응답 검증.

## Task2 Desktop Main transport/IPC

새 credential-transport.cjs + 기존 hub-connection/policy/preload연결. Main고정origin/session.fetch만, trustedrenderer/arity/exactschema검증. GET/POST전 listBusinesses fresh OWNER 확인. 의미상단일작업busy, disconnect/logout/generationabort, late결과 폐기. 정확한url/method/Main-only permit을 요청동안만 열고finally폐쇄; renderer임의fetch/다른pathquery차단. bodybounded, no redirect, cache no-store, Originheader. 비밀정보로그금지, POST자동retry/자동localfallback금지. 기존로컬draft동작유지. 단위시험 상태매핑/권한실패/noextraPOST/timeoutlate/logout/permit폐쇄/secret sanitation.

## Task3 UI 및 인수(root)

기존 소유자 사업장 모드에만 서버상태조회와서버저장 버튼 추가. 임시사업장/기존하린설정 localflow보존. 사용자수동조회로 현재선택tenant/provider의 revision을 얻어야서버저장가능. 선택변경/화면닫기/로그아웃 시 metadata/확인상태/fields무효화, 비동기늦은결과버림. 저장은 앱내 inline 확인 dialog(네이티브팝업금지)1회, 사업장/provider/revision과연결검증전 표시. 확인시snapshottedfields/identity와버전고정, duplicatebusy. 완료/실패시비밀필드지움. unknown/conflict/setup/rate/denied를구분하며 성공만서버저장됨표시, 실제연결성공표시금지. 모의UI와 실제서버검증구분.

자동화는 숨김격리 Electron (초기show:false +show/focus억제)로 소스/패키지에서 synthetictransport를 주입해 UI선택변경/확인취소/중복저장/성공/unknown/오류를 확인한다. 사용자프로필/키복사/실제서버POST/마우스조작금지. 앱0.52.0 빌드하고 기존 설치 업데이트; 사용자앱은 테스트용으로 포커스획득하지않는다. 설치중 기존앱종료가필요하면 사용자요청에따른 업데이트의한정된정상종료와버전확인만 수행, 새앱자동전면실행없음.

서버전체회귀와빌드(기존D Windowswebpack보정사용), 앱회귀·소스/패키지UI·설치패키지검증,독립review, 문서/master/commit/push까지완료. 과도한벽시계timeout시험은deterministicbarrier로의도한단계검증. 미배포상태를준비안됨으로표시하는설치본이며운영저장활성화와플랫폼인증완료는아님.
