# P4-154 · 승인된 네 화면 디자인 적용

사용자가 선택한 주문 상세 → 문의 대화 → 업무 캘린더 체크리스트 → 재고 임박 표시 순서로 적용. 기존 보라색·민트·중성 톤과 다크 모드 토큰을 재사용한다.

## 변경 범위

- 주문: 제품 카드, 정보 구획, 라벨/값 정렬, 보조 버튼과 상세 펼침 스타일. 주문 renderer의 기존 메뉴·내용·액션 코드는 변경하지 않았다.
- 문의: 넓은 창에서 목록과 상세 대화를 함께 표시. 접수 본문은 말풍선, 답변 준비는 보라색 카드. 작성자 정보가 없는 저장 이력은 임의로 고객/직원 대화로 나누지 않는다. 실제 전송 기능은 추가하지 않았다.
- 업무 캘린더: 민트 업무 카드, 독립된 체크리스트 영역, 진행 막대와 완료 상태. 기존 등록·수정·체크 동작 유지.
- 재고: 현재 검색 조건의 잔량 있는 재고 중 오늘부터 30일 이내 기한을 날짜순 타임라인으로 표시. 만료/기한 미입력/수량 0 제외. 항목은 기존 입출고 이력을 열고, 목록 보기는 기존 임박 필터로 이동. 재고 원장 변경 없음.

## 검증

- 데스크톱 단위 404/404 PASS.
- 격리 PostgreSQL → 실제 HTTP/IPC → Electron UI 20개 명령 PASS. CS 템플릿 저장·재조회·복사, 반복 업무 생성/수정/삭제·체크, 행사 확보 수정/해제 회귀 포함. 실제 고객 발송·출고·운영 재고 변경 없음.
- 네 패널 밝음/다크 × 700/1040/1440px. 내부 넘침과 창 경계 잘림 검사. 주문 텍스트 및 버튼 문구/disabled 상태 비교 보존 PASS.
- 스크롤 위치와 유한 애니메이션 완료를 기다린 실제 화면 캡처 확인. 문의 기존 CSS의 선택 시 목록 숨김을 수정했다.
- 0.140.0 패키지와 D:/GPT/Apps/Moaon/releases/0.140.0/resources/app.asar 소스 99파일 대조 PASS.
- 테스트 로그: D:/GPT/tmp/p4154-geometry.log, p4154-final-unit.log, p4154-installed.log. 캡처 p4154-orders/cs/calendar/expiry-light/dark.png. 가상자료 화면이며 실제 로그인 계정 인수와 구분한다.

## 배포

- 이전 P4-153의 Vercel 인증 대기 해소. 웹 1.60.0 운영 배포 dpl_Dh15xvXq4bDg2pgPiNg8UEVf8aDQ READY, 운영 /login HTTP 200 / X-Harin-Version 1.60.0 확인.
- 설치파일 desktop/dist/distribution-20260913-234817-460/Moaon-0.140.0-Setup.exe, 114177637 bytes. SHA256 1E6AFCEE7504C09D347D2F89A807AE990A82C5872549BC1E5B8DEC2A5936A001. 기존 Ed25519 키 서명; Windows Authenticode 인증서는 사용하지 않는다.
- 설치 위치 ASAR의 가시 격리 UI 20명령 PASS. 오른쪽 보조 모니터에서 실행하고 실제 로그인 프로필과 운영 자료는 사용하지 않았다.
- 기능 커밋 c13b84c 푸시. GitHub moaon-stable 0.140.0 공개 게시 완료. 0.138.2 인식 격리 앱의 공개 다운로드·Ed25519 검증 READY PASS, 0.140.0 인식 앱 CURRENT 연속 두 번 PASS. 설치 프로그램 실행은 인수 시험에서 제외했다.
- 바탕화면 바로가기 및 current.json은 D:/GPT/Apps/Moaon/releases/0.140.0으로 갱신, 바로가기 대상 직접 확인. 사용자 실행 중 프로세스는 0.138.2이며 강제 종료하지 않았다. 사용자 앱 업데이트 적용 후 실제 계정 화면 전환 확인은 별도다.
- 공개 인수 로그: D:/GPT/tmp/p4154-publish.log, p4154-live-update.log, p4154-current-update.log.
- [0.140.0 설치파일](https://github.com/j22375646-bot/harin-food-hub/releases/download/moaon-stable/Moaon-0.140.0-Setup.exe)

전체 계획: [마스터 계획](./2026-09-07-multi-business-desktop-master-plan.md)
