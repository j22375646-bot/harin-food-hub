# P4-71 — 고객·CS 본문·저장 이력 / 0.60.0

## 구현 범위
- 네이버/Cafe24 암호화 제목·본문을 기존 서버 암호화 모듈로 복원한다. 쿠팡 온라인 문의 원문과 CALL_CENTER 암호화 상담 이력을 읽는다.
- 원본 상태/접수 번호는 기존 목록 판정을 유지한다. 미처리 조회 범위 내 자료만 표시하며 완료 건 전체 이력 조회는 아니다.
- 제목 200자, 본문 2,000자, 최근 저장 이력 5개/개당 1,000자로 제한하고 잘림을 명시한다. 시각 누락, 자료 없음, 복원 실패는 확인 필요로 표시한다.
- 쿠팡 원본 JSON 전체 대신 thread_envelope:raw_data->cs_thread_encrypted만 읽는다. 응답은 표시 텍스트·시각·상태만 포함하며 암호문/내부 오류/원본 JSON은 제외한다.
- 앱은 고정 GET에 x-moaon-cs-details:1을 전송한다. 권한 확인 후에만 상세 조회를 허용하며 구 앱 요청에는 기존 metadata와 크기를 유지한다. 새 앱도 구 서버 응답을 받고 서버 반영 필요를 표시한다.
- 앱 상세는 textContent로 출력하고 줄바꿈·긴 문자열 줄바꿈을 지원한다. 답변 전송·처리 승인·실시간 수집은 추가하지 않았다.

## 검증
- 관련 코드 시험 126 PASS: D:/GPT/tmp/p471-tests.log. 암호화/복원 실패, 잘림, 채널 분리, 응답 검증, 구 버전 opt-in, OWNER 재확인 포함.
- 실제 Supabase JS 클라이언트의 가상 fetch로 select JSON 경로·필터·상한 요청을 검증했다. 실운영 DB 조회 시험은 아니다.
- 소스 화면 24 PASS: D:/GPT/tmp/p471-ui.log. 가상 DB → 실제 로더 → transport → Main IPC → DOM. 본문, HTML 텍스트 처리, 이력 5개, 잘림 안내, 구 서버 호환 및 기존 페이지/초점/좁은 화면 회귀 포함.
- 최초 재검증에서 오른쪽 시험 창 focused:true가 감지됐다. 가시 시험 bootstrap에 setFocusable(false)를 추가하고 최종 source 시험에서 right:true, focused:false를 확인했다. 사용자 입력을 조작하지 않는다.
- 화면: D:/GPT/tmp/moaon-cs-worklist.png.

## 운영 적용과 다음 작업
- P4-66의 일일 배포 제한 발생 후 약 30분밖에 지나지 않아 이번에는 Vercel 배포를 반복 요청하지 않았다. 한도 해제 여부는 미확인이다.
- 따라서 본문/이력은 운영 미적용 서버 후보이며 실제 로그인 자료 검증 완료로 표시하지 않는다. P4-66~68 데이터 확장과 함께 배포·실자료 대조가 남아 있다.
- 다음은 운영 배포 가능 여부 확인과 서버 적용·실자료 대조다. 이후 완료 접수 이력 범위와 추가 이력 조회를 확장한다.
- 개발 소스·임시 파일·시험 프로필·패키지는 D:/GPT 아래에 저장한다. 기존 설치 앱은 교체하지 않는다.

## 최종 패키지 검증·실행
- 폴더 빌드 exit 0: D:/GPT/tmp/p471-package-final.log. 최종 manifest 0.60.0, 앱 파일 5개 소스 바이트 일치.
- app.asar SHA256: c6de760c4f40eab6c5bdbd28ed77ba8e38ddac16870ae8f83ae6c891dfbe46c0.
- 패키지 화면 24 PASS: D:/GPT/tmp/p471-packaged-ui.log, right:true/focused:false. 개발 Electron 호스트가 완성된 app.asar를 격리 프로필에서 로드한 검증이며 설치 EXE/실제 로그인 시험은 아니다.
- 실행: D:/GPT/moaon/desktop/dist/p471/모아온 0.60.0 열기.lnk (--display-right). 기존 앱을 닫고 실행한다. win-unpacked 폴더 전체를 유지한다.
- Supabase 공식 select 문서와 changelog를 확인했다. 관련 REST select 변경 사항은 없었고 실제 클라이언트 요청 검증을 수행했다. 참고 https://supabase.com/docs/reference/javascript/select 및 https://supabase.com/changelog.md.
