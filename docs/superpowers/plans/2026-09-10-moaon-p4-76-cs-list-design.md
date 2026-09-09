# P4-76 — 고객·CS 목록 밀도·정렬 / 0.64.0

## UI 변경
- 기존 세로 카드의 항목을 두 줄/세 열로 배치했다. 왼쪽 채널·접수 번호, 가운데 제목·내용 상태, 오른쪽 접수 시각·처리 상태로 정렬한다.
- 제목은 16px, 메타데이터는 14px로 유지한다. 짧은 자료의 행 높이는 약96px이며 긴 번호/제목은 줄바꿈한다.
- 850px 이하에서는 두 열과 여러 줄로 재배치한다. 검색/필터/상세/초점 복귀와 원본 상태 판정은 유지한다.
- frontend-design 스킬을 적용하되 기존 모아온 팔레트·공통 화면·읽기 크기를 보존했다.

## 확인
- 앱 연결·CS 통신·패키지 검증 회귀111 PASS: D:/GPT/tmp/p476-tests.log.
- 데스크톱 목록 캡처 D:/GPT/tmp/moaon-cs-availability.png 확인. 기존보다 한 화면에서 더 많은 접수가 보이며 세 열 정렬을 유지한다.
- 가상 자료 → 실제 로더 → transport → Main IPC → DOM 시험. 실제 로그인 자료 인수와 구분한다.

## Vercel 가격 확인 (2026-09-10)
- Hobby $0/월, Pro 기본 $20/월, Enterprise 별도 견적. 공식 https://vercel.com/pricing.
- Pro 기본료에 배포 가능한 팀원1명과 월$20 사용량 크레딧이 포함된다. 추가 배포 팀원은1명당 월$20. 크레딧 초과 사용량·추가 옵션·세금은 별도. https://vercel.com/docs/plans/pro-plan.
- 배포 생성 한도 Hobby100회/일, Pro6,000회/일. https://vercel.com/docs/limits.
- 가격 안내만 수행했으며 플랜/결제 변경은 하지 않았다.

## 운영
- 이번 단계 서버 변경 없음. 서버 데이터 확장은 기존 배포 제한으로 적용 대기이며 재배포를 요청하지 않았다.
- 소스·로그·스테이징·검증 프로필·패키지는 D:/GPT 아래 저장. 기존 설치 앱은 교체하지 않는다.

## 최종 검증·실행
- 소스 화면47 PASS: D:/GPT/tmp/p476-ui.log. 데스크톱 행 높이/16px 제목/좁은 화면 목록·필터 재배치를 포함한다.
- 패키지 화면47 PASS: D:/GPT/tmp/p476-packaged-ui.log, right:true/focused:false. 개발 Electron 호스트의 격리 app.asar 시험이다.
- 빌드 exit0, 전체51파일/버전0.64.0/의존성 PASS: D:/GPT/tmp/p476-package-verification.json.
- SHA256 eeeadcb3c7ed21f958492fee57c7ba0371ddb63dd93b9461b67aa35b2025e4fd.
- 좁은 화면 D:/GPT/tmp/moaon-cs-narrow.png 직접 확인.
- 실행 D:/GPT/moaon/desktop/dist/p476/모아온 0.64.0 열기.lnk (--display-right). 기존 앱을 닫고 실행하며 win-unpacked 폴더 전체를 유지한다.
