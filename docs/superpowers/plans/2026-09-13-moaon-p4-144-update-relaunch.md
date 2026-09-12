# P4-144 · 설치 완료 후 모아온 실행 · 0.131.0

- 사용자 요청: 업데이트 완료 후 모아온을 다시 수동으로 열지 않도록 한다.
- 발견: 앱 내부 업데이트는 이미 `quitAndInstall(true,true)`로 무인 설치/재실행을 요청했다. NSIS 설치 파일은 `runAfterFinish:false`라 일반 설치 완료 화면의 실행 선택이 숨겨져 있었다. 이 설정을 true로 바꿔 설치 후 실행을 기본 선택으로 제공한다.
- 설치기를 직접 실행한 경우 완료 화면의 실행 기본 선택을 유지하고 마치면 모아온을 연다. 앱 내부 업데이트의 기존 force-run 경로도 유지한다. 일반 앱 종료 시 무조건 설치하거나 Windows 부팅 자동 시작을 추가하지 않는다.
- 관련 업데이트/서명/트레이 시험 23개 PASS. 배포 설정/스키마 시험 3개 PASS. 자동 업데이트가 silent=true, forceRun=true를 전달하며 수동·자동 배포 설정 모두 runAfterFinish=true를 유지하는지 확인했다.
- 소스 및 설치 위치 격리 Electron 업데이트 UI: 다운로드 동의·진행률·재시작 요청·작업 중 보호·반응형 PASS. 실제 사용자 앱을 끄거나 운영 설치 프로그램을 시험 실행하지 않았다.
- 패키지 `D:/GPT/moaon/desktop/dist/distribution-20260913-050932-277`, ASAR 소스 93개 대조 PASS. 로컬 설치 `D:/GPT/Apps/Moaon/releases/0.131.0`, 바탕화면 바로가기 갱신.
- 설치파일 114155834 bytes, SHA256 `fbe7119b90d116e3491daa6dccdc4df80a49535a820f786479c91806a5192365`.
- 로그: `D:/GPT/tmp/p4144-update-test.log`, `p4144-distribution-test.log`, `p4144-update-ui.log`, `p4144-installed-ui.log`, `p4144-build.log`.
- 코드 5826c26 푸시 및 GitHub moaon-stable 서명 업데이트 게시 완료. 0.130.0으로 인식하는 격리 앱에서 0.131.0 다운로드/서명 검증 READY PASS (`p4144-live-update.log`). 실제 설치 프로그램은 인수 시험에서 실행하지 않았다. 고객 PC의 실제 설치 종료/재실행은 별도 확인 범위다.

- [0.131.0 설치파일](https://github.com/j22375646-bot/harin-food-hub/releases/download/moaon-stable/Moaon-0.131.0-Setup.exe)
