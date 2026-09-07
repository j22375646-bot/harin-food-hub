# Task 3 보고서 · GA4 읽기 전용 측정 UI

## 상태

- 작업 상태: `IMPLEMENTATION_COMPLETE`
- 구현 커밋: `df32d3fc73eb9f315c102f7b69fb4749a07a0a07`
- 기준 커밋: `b6c406104eb24a970eac6f53e4bd01bc1083de1d`
- 브라우저 전체 검증·최종 빌드·릴리스: 루트 작업 범위

## 변경 파일

- `app/_phase28/pages/system-ga4-measurement.js`
- `app/_phase28/pages/system-ga4-measurement.css`
- `app/_phase28/pages/system-measurement-panel.js`
- `test/ga4-measurement-ui.test.js`
- `docs/operations/ga4-measurement.md`
- `.superpowers/sdd/ga4-measurement-plan/task-3-report.md` (이 보고서)

## 구현 동작

- 시스템의 기존 광고 링크 측정 패널 안에 `자사몰 구매·환불 측정` 읽기 전용 섹션을 한 번 마운트했다. 기존 UTM 폼·미리보기·저장·복사·이력 핸들러는 변경하지 않았다.
- 첫 마운트와 `저장 상태 다시 확인`은 명시적 GET으로 저장 상태만 읽는다. `GA4 자료 새로 확인`만 `{action:"REFRESH"}` POST를 보낸다.
- 실제 컴포넌트 수명주기에 `AbortController`, 요청 epoch, mounted 상태, ref 기반 컨트롤러와 같은 JavaScript 턴의 POST 잠금을 적용했다. 늦은 GET이 새 POST 결과를 덮거나 unmount 뒤 상태를 갱신하지 않는다.
- 모든 요청 시작 시 이전 성공 안내를 지운다. GET·POST 오류에서는 기존 보고서를 유지한다. `IN_FLIGHT`와 캐시 응답은 새 Google 수집 성공으로 표현하지 않는다.
- 최초 로딩, 최초 GET 실패, 실제 서버 응답의 `report:null`을 구분한다. 조회 실패는 저장 자료 존재 여부와 자동 일정을 `확인 필요`로 유지하며, 실제 응답이 있을 때만 빈 저장 자료를 안내한다.
- GA4와 Cafe24의 역할, 숫자 속성 ID와 `G-` 측정 ID의 차이, 허브 설정 부재가 쇼핑몰 태그 부재의 증거가 아니라는 점을 화면과 운영 문서에 설명했다. 실제 구매·환불 태그는 항상 `VERIFY_REQUIRED`다.
- 6개 고정 단계를 모두 표시하고 `null`은 `미관측` 또는 `확인 필요`, 명시적 `0`은 `0회`·`0명`·0 금액으로 구분한다. 사용자 합계와 단계 전환율은 만들지 않는다.
- 보고 기간은 브라우저 현재 날짜가 아니라 `report.fetchedAt`을 `report.window.timeZone`의 달력 날짜로 변환한 뒤 `7daysAgo ~ yesterday`를 계산한다. 시간대가 없거나 유효하지 않으면 기간을 확정하지 않는다.
- 정확한 호스트, GA4 속성 시간대, KST 가져온 시각, 통화 메타데이터, GA4 기록 구매액·환불액, 중복·누락 진단, 범위 진단, 서버 메모와 독립적인 `runtime.warning`을 표시한다.
- Phase 28 토큰만 사용하고 라이트·다크 테마를 상속한다. 최소 글자 크기는 13px이며 한쪽 강조선, 하드코딩 색상, 새 전역 테마나 내비게이션 변경은 없다.
- 운영 문서에는 Viewer 권한, Data API 활성화, 숫자 속성 ID, 서버 전용 환경 변수, Vercel 반영, GET/POST 구분, DebugView의 승인된 구매·환불 수동 검증, 동의·보고 지연, PII 및 채널/크로스도메인 제한을 기록하고 Google 공식 문서 링크를 사용했다.

## TDD 근거

모든 아래 명령은 다음 런타임을 사용했다.

`C:\Users\a\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`

### RED / GREEN 기록

1. 명령: `node --test test/ga4-measurement-ui.test.js`
   - RED: 1개 중 통과 0, 실패 1. 실제 컴포넌트 파일/내보내기가 없어 실패했다.
   - 최소 경계 GREEN: 1개 중 통과 1, 실패 0.
2. 명령: `node --test test/ga4-measurement-ui.test.js`
   - 상태·값·컨트롤러 계약 확장 RED: 9개 중 통과 1, 실패 8.
   - 구현 중간 결과: 9개 중 통과 6, 실패 3 → 통과 8, 실패 1.
   - GREEN: 9개 중 통과 9, 실패 0.
3. 명령: `node --test test/ga4-measurement-ui.test.js`
   - 불완전 6단계 및 FAILED 응답 성공문구 방지 RED: 11개 중 통과 9, 실패 2.
   - GREEN: 11개 중 통과 11, 실패 0.
4. 명령: `node --test test/ga4-measurement-ui.test.js`
   - 초기 조회 실패 신뢰 경계 RED: 12개 중 통과 11, 실패 1. 출력은 `/저장 자료를 확인하고 있습니다/` 불일치로, 로딩 화면이 빈 저장소와 일정을 단정하는 문제를 재현했다.
   - GREEN: 12개 중 통과 12, 실패 0, 취소 0, 스킵 0, `duration_ms 316.4901`.

테스트는 실제 클라이언트 소스를 Next SWC로 변환해 실제 React DOM 서버 렌더링을 검사하고, 컴포넌트가 쓰는 실제 요청 컨트롤러에만 가짜 HTTP 경계를 주입한다. 테스트 전용 비즈니스 로직이나 훅 복제는 없다.

## 최종 검증

- 집중 회귀 명령:
  `node --test test/ga4-measurement-ui.test.js test/measurement-ui.test.js test/measurement-utm.test.js test/ga4-measurement-service.test.js test/ga4-measurement-api.test.js`
  - 결과: 65개 중 통과 65, 실패 0, 취소 0, 스킵 0, `duration_ms 506.9345`.
- UI 가드 명령: `pnpm ui:guard`
  - 결과: `[ui:guard] 통과: 새 디자인 금지 패턴 없음 (현재 부채 518건)`.
- 전체 회귀 명령: `pnpm test`
  - 결과: 1,925개 중 통과 1,922, 실패 0, 취소 0, 기존 스킵 3, `duration_ms 12337.0888`.
- 정적 점검: `git diff --cached --check`
  - 결과: 오류 없음. Windows 작업 트리의 LF→CRLF 안내만 있었다.
- 테스트 중 기존 `MODULE_TYPELESS_PACKAGE_JSON` 경고가 있었지만 실패는 없었다. 의존성이나 `package.json`은 범위 밖이므로 변경하지 않았다.

## 브라우저 검증 전달 사항

작업자는 브라우저 세션이나 루트의 합성 fixture를 사용·수정하지 않았다. 루트가 별도 실제 React/합성 HTTP 경계로 다음을 보고했다.

- 라이트·다크, 390px·1280px에서 가로 넘침 없음, 최소 글자 13px.
- 미관측과 명시적 0 구분.
- 같은 JavaScript 턴의 두 번 클릭에서 POST 1회.
- POST 500 뒤 기존 `KRW 55,000` 보고서 유지.
- 초기 GET 실패에서 저장 자료 유무 확인 불가와 자동 일정 `상태 확인 필요` 표시.
- 저장 상태 재시도는 누적 GET 2회, POST 0회.

최종 브라우저 상태 묶음과 빌드는 루트가 계속 검증한다.

## 자가검토

- 백엔드, 공유 셸·인증·테마·내비게이션, 종속성, 외부 시스템, 자격 증명, 배포 파일을 변경하지 않았다.
- `system-measurement-panel.js` 변경은 새 컴포넌트 import와 기존 readiness 안내 한 곳의 교체뿐이다.
- 환경 변수 이름만 표시하고 값 입력 UI, 원본 거래 ID, 개인정보를 만들지 않았다.
- 네이버·쿠팡·Cafe24 자료나 쓰기 경로를 GA4에 합치지 않았다.
- GET 재시도, 캐시, `IN_FLIGHT`, 예약 시각을 새 수집 성공으로 오인할 문구가 없는지 확인했다.
- 초기 GET 실패를 실제 빈 저장소로 단정하지 않고, 이전 성공 보고서는 실패 뒤에도 보존되는지 확인했다.

## 실제 한계와 운영 상태

- 실제 Google API, GA4 속성, 서비스 계정, 쇼핑몰 태그, DebugView, 운영 예약 실행은 이 작업에서 연결하거나 검증하지 않았다.
- 루트가 제공한 운영 컨텍스트상 `HUB_OWNED_SITE_URL`은 있으나 `GOOGLE_GA4_PROPERTY_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`는 없다. 작업자는 운영 환경을 직접 조회하지 않았고 어떤 환경 변수도 변경하지 않았다.
- 허브 GA4 설정 부재는 공식몰 태그 부재 증거가 아니다. 실제 `purchase`·`refund` 태그 증명은 운영자가 승인된 테스트 주문과 환불을 DebugView에서 확인할 때까지 항상 `VERIFY_REQUIRED`다.
- 빌드, 운영의 실제 미설정 상태 확인, 자격 증명 등록, 배포와 릴리스 판정은 루트 작업 범위다.
