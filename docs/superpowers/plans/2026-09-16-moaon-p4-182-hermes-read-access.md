# P4-182 · Hermes 업무 자료 조회 연결

서버 1.64.6 / 데스크톱 0.147.19 (2026-09-16)

## 제공 범위

- `POST /api/moaon/assistant/access`: 로그인한 고정 하린식품 사업장 OWNER의 STATUS / ISSUE / REVOKE. 같은 출처, 현재 세션과 소유자 멤버십 검증, revision 충돌 방지.
- `GET /api/moaon/assistant/read`: Bearer 조회 키. 주문/업무/문의/보고서 중 발급 시 선택한 항목만 실행하고 반환. 쿠키와 임의 쿼리 미허용.
- 발급 키 원문은 최초 응답에서만 제공. DB에는 SHA-256만 저장. 30일 만료, 분당 10회, 해제 또는 소유자 멤버십 변경 시 차단. 자료 조회 후 다시 권한을 검사.
- 공통 사업장 자료를 조회한다. 업무 건수는 발급자에게 배정된 미완료 업무이며, 다른 Telegram 사용자의 개인 업무로 해석하면 안 된다.
- 네이버 저장 보고서 요약, 채널별 주문/미답변 건수만 제공. 개인정보가 있는 주문 상세, 개인 대화, 직접 DB 접근, 변경·발급·발송 API는 제공하지 않는다.
- 현재는 사업장당 조회 키 하나. 재발급하면 기존 서버의 키도 교체해야 한다.

## Hermes 설치

기존 AI, Telegram, 허용 사용자, SOUL, 메모리 설정을 수정하지 않는다. `/integrations/moaon-hermes.py`를 Hermes 사용자로 실행하고 `--install`에 대화형으로 조회 키를 입력한다. 입력은 getpass로 숨긴다. 키로 실제 API 조회가 성공한 후에만 설치한다.

- HERMES_HOME/integrations/moaon/read.key: 0600
- HERMES_HOME/integrations/moaon/read.py: 고정 HTTPS GET, 리다이렉트 금지, 오류에 키/예외 원문 출력 안 함
- HERMES_HOME/skills/moaon-read/SKILL.md: 공통 업무 자료 조회 규칙
- `/moaon-read 오늘 업무 요약해 줘`로 호출. 서버에 승인된 사용자는 이 공유 범위를 읽을 수 있다. 개인 대화 격리 자체를 보장하는 변경은 아니다.

공식 스킬 형식 참고: https://hermes-agent.nousresearch.com/docs/user-guide/features/skills/

## 검증

- 전체 서버 시험 3021개 중 변경 이력 누락 1개 발견, 변경 이력 추가 후 해당 시험 통과. 나머지 3020개 통과.
- 데스크톱 전체 456개 통과. 추가 고정 URL/메인 프로세스 한정 요청 검사 통과.
- PGlite: 해제, 만료, 소유자 비활성화, 멤버십 변경, revision 충돌, 범위 검증, 분당 제한, 익명 접근 차단.
- Python 연결기 3개 시험: 잘못된 키는 통신 안 함, 고정 GET 요청/정상 응답, 리다이렉트 거절.
- Next webpack build 통과. 운영 DB migration 적용 후 anon 테이블/RPC 접근 거부, service_role RPC 실행 허용 확인.
- Electron 소스 및 패키지: 700/1060/1660 폭 × light/dark × 3탭, 발급/해제 시험 응답 및 키 localStorage 미저장/탭 이탈 시 제거 검증.
- 설치 앱 0.147.19: 실제 로그인 세션으로 4개 업무 자료 카드와 권한 미발급 상태 조회 확인. 실제 키 발급·입력은 사용자 수행.
- 운영 서버 1.64.6: 키 없는 GET 401, 설치 파일 원문 일치 확인.
- Hermes 설치 및 Telegram 답변은 사용자 터미널 결과 확인 후 최종 기록한다. 현재 문서만으로 성공을 주장하지 않는다.

## 0.147.20 후속 수정

사용자가 실제 키를 발급했으나 password 입력칸에서 복사하기 어려운 문제가 있어 명시적 키 복사와 보기/가리기 버튼을 추가했다. 복사는 기존 신뢰된 렌더러 클립보드 IPC를 사용하고 사용자 버튼 클릭 때만 실행한다. 키를 로그나 설정 저장소에 저장하지 않는다. Electron 시험은 시험 키와 클립보드 IPC mock을 사용하여 사용자 클립보드를 덮어쓰지 않는다.

## 운영 연결 확인 (2026-09-16 04:02 KST)

- 사용자 터미널에서 설치기 실행 결과 `ok:true`, `installed:true`, `home:/opt/data`, `status:READY` 확인.
- Hermes 서버가 실제 외부 Bearer API를 호출해 orders/tasks/cs/reports 네 범위 조회에 성공한 후 키/스킬을 저장했다. retrievedAt: 2026-09-15T19:02:41.561Z.
- 원문 키는 사용자가 앱의 복사 버튼으로 복사하여 getpass 입력창에 직접 입력했다. 에이전트가 키를 추출하거나 로그에 출력하지 않았다.
- 데스크톱 0.147.20 서명 업데이트 GitHub moaon-stable published:true 확인. 실제 설치 앱에서도 기존 로그인으로 4개 카드 및 권한 상태 확인.
- Telegram `/moaon-read` 답변 검증은 사용자에게 요청했으며 이 기록 시점에는 결과 대기 중이다.

## Telegram 최종 확인

- 최초 `/moaon-read`는 Telegram gateway에서 Unknown command를 반환했다.
- 일반 메시지 `moaon-read 스킬을 불러와서 모아온의 오늘 업무를 요약해 줘`는 성공했다. 사용자 제공 실제 답변에서 2026-09-16 04:04 KST 조회, 채널별 주문·미답변 건수, 발급자 배정 업무 범위, 네이버 보고서 요약 및 원본 수집시각 불명확 안내를 확인했다.
- 설치 안내도 일반 메시지로 수정했다(서버 1.64.7). 기존 AI/Telegram 설정은 유지하며, 개인 대화 공유 기능은 추가하지 않는다.
