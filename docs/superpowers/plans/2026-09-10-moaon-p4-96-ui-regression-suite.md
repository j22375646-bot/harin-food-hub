# P4-96 — 배포본 통합 UI 검증

## 개발
- desktop/scripts/verify-ui-suite.cjs 추가. 전달한 app.asar를 현재 소스와 전체 파일 비교한 뒤10개 UI 검증을 순서대로 실행한다.
- 오늘/주문/정산/분석/캘린더/재고/CS/설정 및 날짜·월 전환을 포함한다. 격리 Electron은 오른쪽 보조 모니터에 표시하고 포커스를 가져오지 않는다.
- 새 D드라이브 결과 폴더만 허용하고 기존 검증 기록을 덮어쓰지 않는다. 각 시험 로그와 summary.json에 결과/소요시간/패키지 해시를 남기며 실패가 있으면 종료1이다.
- 실행 예: D:/GPT/enter-moaon.ps1 적용 후 node desktop/scripts/verify-ui-suite.cjs D:/GPT/Apps/Moaon/releases/0.83.0/resources/app.asar D:/GPT/tmp/새로운-검증폴더

## 발견·수정
- 최초10개 중 today-date 실패: 월 전환 기능 추가 이후 일정 시험이 financeAttemptMonth를 초기화하지 않아 시험 범위 밖 재무 조회가 끼어들었다. 앱 코드의 오류로 확인된 것은 아니다.
- 일정 시험의 초기/가상 날짜 이동 시 재무 월 상태를 맞췄다. 일정/재무 IPC 시험의 실제 네트워크는503 가상 응답으로 차단했다.
- 최초 실패 로그 D:/GPT/tmp/p496-ui-suite/today-date.log 유지. 재검증은 별도 p496-ui-suite-final 폴더에 기록한다.

## 범위
- 앱 코드/버전은0.83.0 유지. 이번 변경은 개발 검증 도구와 시험 격리 보완이다.
- 가상 자료를 사용하는 배포 코드 UI 시험이며 실제 로그인/운영 주문·정산 대조가 아니다. 외부 자동 업데이트 주소/서명/서버 후보 배포의 미완료 상태는 그대로다.
- 전체 앱 코드329개 PASS: D:/GPT/tmp/p496-tests.log.

## 최종 결과
- p496-ui-suite-final/summary.json 전체 PASS.10개 흐름 모두 종료0. 배포본0.83.0 전체52파일 PASS, SHA256 bd5c03f335550200ae0972ed58c2505c856b894ed981901f38da17dfd16af272.
- 월 전환 최종 캡처 직접 확인. 새로운 EXE 생성·바로가기 변경 없이 검증된 기존0.83.0을 유지한다.
