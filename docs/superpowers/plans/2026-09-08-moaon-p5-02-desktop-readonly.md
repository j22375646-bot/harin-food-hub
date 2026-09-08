# P5-02 — 기존 하린식품 로그인과 주문 조회 연결

승인된 P5-01 후속 인도 계획을 실행한다. Spec: ../specs/2026-09-07-desktop-business-ui-design.md 및 multi-business-desktop-hub-design.md. 전체 다사업장 개방이 아닌 기존 하린식품 호환 조회만 제공한다.

## Global Constraints

- 운영 Next.js/UI/인증/DB를 수정하지 않는다. 기존 https://harin-cafe24-sync.vercel.app 서버가 매 요청 OWNER 세션을 확인한다. 다른 사업장 가입·서버주소/API키 입력은 제공하지 않는다.
- 로그인은 해당 HTTPS 서버의 기존 로그인 폼을 별도 sandbox 창에서 사용자가 직접 입력. 암호/쿠키를 IPC·로그·파일에 복사하지 않는다. 원격 창에는 preload/Node/IPC 없음. 로컬 셸에만 최소 contextBridge 세 메서드 제공.
- 원격 연결은 메모리 partition(cache:false), 앱 종료/연결 해제 시 소거. 로컬 theme만 기존 저장. 주문은 메모리에만 표시, sample과 절대 합치지 않음. 화면에 하린식품·조회 전용·조회 범위·확인 시각 표시. 실패/미로그인/부분 실패를 0건으로 표시 금지.
- 실업무 쓰기·자동수집·인쇄·export 없음. 허용 POST는 로그인 폼뿐. Main의 고정 주문 GET만 조회. 임의 URL/헤더/HTTP 메서드/경로를 IPC 인자로 받지 않는다. sandbox/contextIsolation/webSecurity 유지, 팝업/download/권한/webview 거절.
- 14px 이상 본문, P5-01 표준 창·테마·최소 창 유지. 별도 사용자 승인 없는 비밀번호 입력/보안 해제/유료 서비스 구매 없음.

### Task 1: 제한된 실제 조회 연결과 UI

Own files: desktop/main.cjs, new desktop/connection-policy.cjs, desktop/hub-connection.cjs, desktop/preload.cjs, desktop/ui/index.html/app.js/styles.css, desktop/test/connection.test.cjs. Parent owns package/version/build/smoke/installer/E2E/doc.

1. TDD: 고정 origin 및 method/path 정책, IPC sender 검증, 응답 projection/status, timeout/late completion/disconnect 검증. 기준 커밋은 3f2f7f0이다.
2. local preload exposes frozen moaonHub {connect(), refresh(), disconnect()} only. ipcMain sender must be exact mainWindow.webContents and event.senderFrame === mainFrame and URL moaon://app/index.html. Reject all arguments. No generic invoke/event/raw object exposure. Existing local renderer CSP connect-none remains.
3. Connection owns ephemeral session partition moaon-harin-readonly. Policy allow same fixed HTTPS origin only: GET /login (valid bounded query), GET /_next/static/* assets + favicon/local required assets (no arbitrary API/static-looking paths), POST /api/dashboard/login ONLY while login window active. GET fixed /api/orders/page?stage=ACTIVE&platform=ALL ONLY from Main (webContentsId disallow remote window for API). Deny all other network/methods/navigation/popup/download/permissions. Login success redirects '/' intercepted/prevented and closes dialog, then actual API GET verifies authorization; do not treat redirect/cookie alone as authentication proof. Login cancel/loadfail distinct safe errors. No authentication credentials in main code.
4. session.fetch fixed URL GET credentials include cache no-store redirect error, abort timeout15s, bounded response5MB + JSON validation. Main returns only {status,orders,total,hasMore,checkedAt,partial,message}; orders project allowlisted strings hubOrderId/platform/productName/stage, finite quantity/amount (unknown staysnull), orderedAt. Exclude receiver/address/contact/images/items/rawbody/tokens. Max20 rows. status READY/PARTIAL/LOGIN_REQUIRED/FORBIDDEN/UNAVAILABLE/DISCONNECTED/LOGIN_OPEN as needed. No raw errors/messages/providerpayload exposed. Don't claim upstream channel sync succeeded: this queries stored orders.
5. Guard duplicate login windows and requests, disconnect aborts reads/closes login/clears session and invalidates generation; late completions never restore old data. Close all children when main closes. Idle app restart never auto-fetch production.
6. UI explicit '하린식품 연결' button from local sample screen/settings starts connect. Show neutral cleared list while connecting. On successful read replace sample entirely; allow refresh and disconnect. Readonly active order first20/total/hasMore clearly labeled, no all-orders claim. Error and partial status visible; authentication failure/disconnect clears actual data and details immediately. User can explicitly return to sample (never automatic fallback on failed live request). Existing theme/nav sample tests preserved. No PII logging/screenshot during live verification.
7. Unit/syntax tests and report, commit owned files only. Read report template contract: status, commits, focused tests, unresolved concerns; detailed report in task-1-report.md (ignored, do not force-add scratch).

## Parent delivery

Version0.2.0, buildfiles include newMainmodules/preload. Synthetic real Electron E2E transport responses including 401/partial/timeout/disconnect race and sender rejection; login window restrictions verified without typing real credentials. Existing unit suite + root regression once atfinal. NSIS build; isolated user-level install/relaunch/uninstall test if supported (no existing install overwrite); package/hash/source match. Open final app login for owner input, no claim authenticated order read until live proof. Private local output only, unsigned limitation retained.
