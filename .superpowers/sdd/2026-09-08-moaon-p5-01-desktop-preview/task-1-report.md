# Task 1 Report: 실행 가능한 안전한 앱 셸과 샘플 화면

## 결과

- `moaon://app/` custom protocol만 사용하는 Windows Electron 셸을 구현했다.
- 앱 이름은 `모아온 Preview`, 초기 창은 `1440x960`, 최소 창은 `1040x720`, 표준 Windows frame을 사용한다.
- single-instance, 창 닫기 시 종료, Preview 전용 `userData` 경로를 적용했다.
- `오늘`, `주문·배송`, `앱 설정` 세 화면과 샘플 주문 3건의 검색·선택·우측 상세·닫기, 라이트/다크 테마를 구현했다.
- 상단의 `시험 자료 · 실제 업무 연결 안 됨`, 가상 사업장 `모아온 데모`, 모든 수치의 샘플 표기와 실업무 기능 비활성 안내를 유지했다.

## 보안 경계

- 허용 URL은 정확히 다음 세 개다.
  - `moaon://app/index.html`
  - `moaon://app/styles.css`
  - `moaon://app/app.js`
- query, hash, credentials, port, 외부 host/scheme, 미등록 파일, encoded traversal/encoded filename을 fail-closed로 거절한다.
- Main에서 request, navigation, redirect, popup, webview, download, permission을 실제로 차단했다.
- `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`, `webSecurity:true`, `webviewTag:false`, preload/IPC 없음으로 구성했다.
- protocol 응답과 HTML meta에 `connect-src 'none'` CSP를 적용했다.

## TDD 및 검증

- RED: `node --test test/security.test.cjs` 실행 시 `Cannot find module '../security.cjs'`로 실패함을 확인했다.
- GREEN: 보안 helper 구현 후 같은 명령에서 4 tests, 4 pass, 0 fail을 확인했다.
- 구문: `node --check main.cjs`, `node --check security.cjs`, `node --check ui/app.js`를 통과했다.
- Parent 실행 검증: 실제 Electron에서 메뉴, 검색, 상세, 빈 검색 결과, 테마, popup/network 차단, runtime webPreferences, `1040x720` overflow 검사가 PASS로 보고되었다. 첫 창 준비 측정은 393ms였으며 사업 기능 성능을 뜻하지 않는다.

## UI 자체 검토

- 기존 Phase 28의 청색/민트 토큰, 44px 이상 주요 조작부, 큰 한국어 제목과 우측 상세 구조를 축약 재사용했다.
- 공통 제목 underline은 `scaleX(0)`에서 한 번 시작해 `scaleX(1)`로 끝나며 reduced-motion에서는 즉시 완료된다.
- 메뉴·주문·테마 선택 상태는 한쪽 강조띠 없이 균형 잡힌 전체 border/background를 사용한다.
- 기본 글꼴은 `Malgun Gothic`/system이고 본문은 15px, 주요 설명은 14px 이상이다.
- 메뉴, 검색, 상세 닫기, 테마 버튼에 명확한 accessible name을 제공하고, `Esc` 상세 닫기·포커스 복귀 및 `Ctrl+K` 주문 검색을 지원한다.
- 실제 발급/출력/가입/플랫폼 연결 버튼과 네트워크·IPC는 만들지 않았다.

## 한계와 후속

- 이 결과는 한 대 Windows PC의 합성 자료 Preview다. 모든 PC, 인쇄, 자동 업데이트, 운영 API/DB 연결을 검증한 결과가 아니다.
- installer/unpacked EXE 빌드, 해시, packaged E2E와 최종 산출물 보고는 parent 범위다.
