# P4-214 — 가족 계정의 봇 메뉴·대화 연결

## 원인
개인 알림 수신처 인증은 정상이어도 Hermes 허용 사용자와 MENU_OPEN 수신처는 공용 기본 사용자에 묶여 있었다. SOLO 업무 연결도 tenant singleton이었다.

## 변경
- 내 알림에 봇별 메뉴·대화 opt-in을 추가했다. 인증된 활성 OWNER만 자신의 Telegram DM을 연결한다. 알림 예약은 변경하지 않는다.
- 매 요청에서 현재 인증, 회원 버전, 역할, 봇 활성화와 opt-in을 검사한다. 개인 업무 메뉴는 해당 회원의 assigned_to로 조회하고 변경 직전에도 확인한다.
- BOT_CONFIG는 개인 연결을 합쳐 전달한다. 연결 내용의 fingerprint 변경 시 해당 봇만 재구성한다.
- 새 사용자별 Hermes 프로필을 native profile_routes로 연결한다. 토큰은 원래 transport에만 있어 중복 polling하지 않는다. 기존 대화·memory·auth 파일을 복사하지 않는다. 모델 인증은 기존 Hermes global fallback을 사용한다.
- 새 프로필의 AI 도구는 memory로 제한한다. 자유 대화와 개인 기억은 가능하지만 자료 조회·업무 처리는 모아온 메뉴를 사용한다. 자유 대화에서 terminal/업무등록 스킬을 실행하는 기능은 이번 범위에 포함하지 않는다. OS 차원의 악의적인 사용자 격리를 주장하지 않는다.
- 메뉴의 WORK 자료 조회도 Telegram 인증 계정 context로 전환했다. shared issuer의 개인 업무를 노출하지 않는다.
- 광고 수동 요청은 요청자의 수신처를 보존하고 사용자별 dedupe를 적용한다. 기존 공용 예약과 개인 알림은 유지한다.
- /start, 메뉴를 통해 persistent reply keyboard를 표시한다. 비허용 메뉴 요청은 모아온 연결 절차를 안내한다.

## 검증
- PGlite/API: 24개 통과. 계정별 opt-in, 권한·회원버전 취소, 과거 confirmation 차단, scoped read 및 조회 후 권한 재확인 포함.
- Python 메뉴 9개, worker 기존 프로필/사용자별 route/토큰 분리/취소 동기화 시험 통과.
- Electron 0.175.0 stage 및 설치 ASAR에서 개인 설정 저장·계정 전환·지연 응답 격리·화면 검증 통과. 가이드 3경로/11단계/6레이아웃 통과. 격리 시험 자료 사용, 실제 가족 로그인 조작 아님.
- 실제 서버: 어머니의 기존 인증 계정만 다섯 chat_slots 활성화. MENU_OPEN 5종, PERSONAL_LIST 성공. 별도 WORK 사용자 프로필의 모델 응답 시험 성공.
- 어머니의 5개 봇에 persistent 메뉴를 각각 1회 무음 전송: Telegram API 모두 성공. handset 표시 및 실제 inbound AI 응답은 사용자 확인과 구분한다.
- 서버 1.85.1 READY. 1.85.0의 설치 스크립트 CRLF를 LF로 수정하여 재배포했고 실제 installer/timer 정상 완료.

## 운영 유의
설정 저장부터 Hermes sync까지 약 2분. 프로필 프로세스 RUNNING만으로 모델 응답이나 Telegram 수신 성공을 단정하지 않는다. 비활성 사용자 프로필의 기록은 삭제하지 않으며 라우트/권한만 해제한다. 관리자는 서버 파일에 접근할 수 있다.
