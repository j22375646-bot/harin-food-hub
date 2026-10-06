# P4-74 — 패키지 전체 파일 검증·배포 시점 확인

## 개발
- desktop/scripts/verify-package.cjs를 추가했다. 절대 경로 app.asar를 읽기 전용으로 검사한다.
- package.json의 name/version/main/production dependencies를 대조하고 build.files에 명시된 앱 파일과 ui 전체 하위 파일의 바이트를 비교한다.
- 파일 누락/변조/버전 불일치/의존성 차이는 FAIL과 비정상 종료 코드로 처리한다. 원문 파일/인증정보는 출력하지 않는다.
- SHA256·검사 파일 수·실패 항목을 JSON으로 출력한다. 허용하지 않은 glob·상위 경로·소스 심볼릭 링크는 거부한다.
- 실행 예: node desktop/scripts/verify-package.cjs D:/GPT/moaon/desktop/dist/p473/win-unpacked/resources/app.asar.
- 다음 패키지 전달 전 이 명령을 필수 실행하고 PASS 확인 후 화면 검증한다. 앱 기능 변경이 없어 버전/설치 파일은 0.62.0을 유지했다.

## 검증
- 시험 4 PASS: D:/GPT/tmp/p474-tests.log. 실제 가상 asar 생성 후 중첩 UI 변조, 버전/의존성 차이, 누락 파일, 잘못된 패턴, CLI 실패 종료를 확인했다.
- 처음 가상 asar 시험에서 쓰기 완료 전 읽기 및 Windows 중첩 경로 구분자 문제가 확인되어 스트림 종료 대기와 경로 정규화를 수정했다.
- 실제 0.62.0 패키지 전체 앱 파일 51개 PASS: D:/GPT/tmp/p474-package-verification.json.
- SHA256 0c6befd35114e654b3ea9aa2de02530aeb08396fda2584070be850d9212ceb40.
- 기존 패키지 화면 36 PASS: D:/GPT/tmp/p474-packaged-ui.log. 개발 Electron 호스트/격리 프로필에서 app.asar 실행, 오른쪽 보조 모니터·focused:false. 실제 로그인 자료 검증은 아니다.

## 서버 배포 시점
- Vercel 공식 제한은 Hobby 배포 생성 100회/일이다. 최근 24시간 창 기준이며 자정 초기화를 전제로 하지 않는다.
- 마지막 거절 P4-72: 2026-09-10 약03:10 KST, api-deployments-free-per-day, 24시간 후 재시도 안내. 이번에는 재배포 요청을 반복하지 않았다.
- 03:23 이후 팀 배포 API를 읽기 전용 조회했다. 최근100개 중24시간 이내80개가 반환되어 실제 제한 카운터와 동일하다고 단정할 수 없다. 삭제·실패·제외 기록의 과금/한도 집계와 목록의 대응은 검증되지 않았다.
- 정확한 해제 시각은 확인 불가. 2026-09-11 약03:10 KST는 마지막 오류 안내에 따른 보수적인 재확인 기준이며 보장된 해제 시각이 아니다. 더 일찍 풀릴 수 있다.
- 재확인/배포 자동 예약은 생성하지 않았다. P4-66~68/P4-71 서버 적용은 대기 상태다.
- 참고: https://vercel.com/docs/limits 및 https://community.vercel.com/t/daily-build-limit-not-resetting-when-does-it-actually-reset/25659.
