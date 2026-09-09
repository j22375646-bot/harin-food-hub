# P4-72 — 고객·CS 연속 탐색·내용 검색 / 0.61.0

## 배포 재확인
- 배포 전 관련 서버 시험 22 PASS: D:/GPT/tmp/p472-tests.log.
- 2026-09-10 03:10 KST 이후 현재 커밋 9ce7ade로 기존 프로젝트 harin-cafe24-sync에 운영 배포를 한 번 요청했다.
- Vercel 일일 한도로 재거절: api-deployments-free-per-day, try again in 24 hours. D:/GPT/tmp/p472-deploy.log. 새 운영 빌드는 시작되지 않았고 한도 우회/요금 변경/반복 재시도는 하지 않았다.
- 실제 운영 CS/inventory 두 경로의 비로그인 응답은 각각 401 UNAUTHENTICATED, private/no-store였다. 로그인 자료 대조나 서버 신기능 적용 증거는 아니다.

## 앱 개선
- 고객·CS 상세에 이전/다음 접수와 현재 순번을 추가했다. 현재 검색·채널·유형·정렬 조건 안에서 목록 페이지 경계를 넘어 이동한다.
- 상세를 닫으면 마지막으로 본 접수의 페이지와 초점으로 돌아간다. 첫/마지막 및 검색 결과 1건에서는 해당 이동 버튼을 비활성화한다.
- 접수 번호 외 제목·본문·저장 상담 이력도 검색한다. 서버에서 조회한 텍스트만 검색하며 잘린 원문은 검색되지 않는다고 명시한다.
- 기존 서버 응답에서는 접수 번호 검색과 상세 연속 이동이 작동한다. 본문·이력 검색은 P4-71 서버 적용 후 사용할 수 있다.
- 상세 이동·검색에 추가 네트워크 요청을 만들지 않는다. 이번 단계는 서버 코드 변경 없음.

## 검증
- 앱 연결/CS/서버 CS 회귀 115 PASS: D:/GPT/tmp/p472-regression.log.
- 소스 화면 31 PASS: D:/GPT/tmp/p472-ui.log. 가상 DB → 실제 로더 → transport → Main IPC → DOM.
- 25→26번째 경계 양방향 이동, 돌아갈 페이지/초점, 추가 요청 없음, 제목·본문·이력 검색, 검색 범위 안내, 구 서버 접수 번호 검색, 결과 1건 경계 포함.
- 오른쪽 보조 모니터 right:true, focused:false. 사용자 마우스·키보드·포커스를 점유하지 않았다.
- 화면 D:/GPT/tmp/moaon-cs-worklist.png. 실제 로그인/설치 앱 시험과 구분한다.

## 남은 범위
- P4-66~68 및 P4-71 서버 확장은 운영 적용 대기. 배포 가능 시 서버 빌드/READY와 실제 로그인 자료 대조가 필요하다.
- 완료 접수 전체 이력·추가 원문 조회·답변 전송은 이번 범위가 아니다.
- 소스·임시 자료·검증 프로필·패키지는 D:/GPT에 저장한다. 기존 실행/설치 앱을 교체하지 않는다.

## 최종 패키지
- electron-builder 폴더 빌드 exit 0: D:/GPT/tmp/p472-package.log. Manifest 0.61.0, 앱 파일 5개 소스 바이트 일치.
- app.asar SHA256: 1e0f4f00c5bccce114248f7b0678393ffdd6abb495cc2a900826d2a4426f2832.
- 패키지 화면 31 PASS: D:/GPT/tmp/p472-packaged-ui.log. 개발 Electron 호스트가 완성된 app.asar를 격리 프로필에서 로드한 시험이다. right:true, focused:false. 실제 설치 EXE/로그인 자료 대조는 아니다.
- 실행 바로가기 D:/GPT/moaon/desktop/dist/p472/모아온 0.61.0 열기.lnk (--display-right). 기존 앱을 닫고 실행하며 win-unpacked 폴더 전체를 유지한다.
