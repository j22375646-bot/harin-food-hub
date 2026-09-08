# P5-01 모아온 Windows 시제품

승인된 2026-09-07 multi-business-desktop-master-plan의 P4/P5 병행 실증을 실행한다. 사용자가 EXE 개발 지연을 지적해 인증의 추가 세부 검증보다 눈에 보이는 앱 시제품을 먼저 인도한다. 실제 다사업장 연결 게이트는 완화하지 않는다.

## Global Constraints

- Windows 전용, 샘플 자료만. 운영 로그인/UI/API/DB 변경 금지, 실사업자 키 입력 기능 없음.
- 기존 desktop-business-ui-design 표준 Windows 창, 왼쪽 메뉴/중앙 본문/우측 상세, 한국어 읽기 쉬운 크기, 라이트/다크 재사용.
- Electron44.2.0, electron-builder26.15.3, Playwright1.63.0은 desktop 독립 devDependencies로 고정. root lock/dependencies 변경 금지.
- nodeIntegration false, contextIsolation true, sandbox true, webSecurity true. preload/IPC 없음. 외부 URL/popup/permission/download 거절. local custom protocol의 명시적 파일만 제공. CSP connect-src none.
- 공개 배포/자동 업데이트/자동 시작/트레이 없음. 개인용 미서명 NSIS installer와 unpacked EXE를 local output에 생성. 설치파일은 로컬 제공만, Git에 바이너리 추가 금지.

### Task 1: 실행 가능한 안전한 앱 셸과 샘플 화면

Files: desktop/main.cjs, desktop/security.cjs, desktop/ui/index.html, desktop/ui/app.js, desktop/ui/styles.css, desktop/test/security.test.cjs.

1. security helper의 URL allowlist/자원 경로 검사를 실패 테스트 먼저 작성하고 구현. 등록된 moaon://app/index.html/styles.css/app.js만 접근 허용; query/hash/credentials/foreign host/encoded traversal 등 거절. 요청/탐색/팝업/download/permission은 Main에서 실제 연결.
2. 표준 Windows 프레임, 1440x960 초기 창, 1040x720 최소, single instance, 닫으면 종료, preview 전용 userData. App 이름 모아온 Preview. file:// 대신 custom protocol.
3. Main/Orders/CS 기존 app/_phase28/{orders-dashboard.js,cs-dashboard.js} 및 해당 main 화면/공통 css를 참조하고 간결한 샘플 UI. 오늘/주문·배송/앱 설정 3개 메뉴. 상단에 '시험 자료 · 실제 업무 연결 안 됨' 상시 표시, 가상 사업장 '모아온 데모'.
4. 오늘: 시제품에서 가능한 항목과 아직 연결 안 된 기능 명확화. 주문: 샘플 3건, 클릭 우측 상세 및 닫기, 검색, 실제 발급 버튼 없음. 설정: 라이트/다크 전환과 버전/제한 안내. 숫자는 모두 샘플로 표시. 모바일 새 디자인 범위 아님.
5. 문구·간격·키보드 focus/축소 창/다크모드 점검. 페이지 제목 underline 공통시작 scaleX0 ->1, 선택은 전체border/background이며 한쪽강조띠 금지. 기본폰트 Malgun Gothic/system, 본문14px이상, reduced-motion 지원.
6. 핵심보안 테스트 실행, syntax 확인, 자체검토, commit ownfiles. package/config/dependencies 및 실제Electron E2E/packaging은 parent가 담당.

## 인도 기준

실제 Electron 창 실행·메뉴/상세/검색/테마 검증과 런타임 보안설정 확인, 설치파일 빌드·해시 기록. 한 대 PC 실행만을 모든 PC/인쇄/업데이트 검증으로 확대하지 않는다. 새 사업장 가입과 실업무는 비활성 상태를 유지한다.
