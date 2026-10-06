# P4-187 Telegram 브리핑 후속 동작

## 구현
- 모아온 브리핑 원본에 업무 등록안 만들기 / 1시간 뒤 다시 알림 버튼.
- 서버가 bot slot, 최신 bot revision, 허용 사용자, 원본 chat/message ID와 7일 유효기간을 검증한다. 전달된 메시지 텍스트 대신 저장된 브리핑을 사용한다.
- 카드/동작별 unique 제약으로 반복 클릭은 같은 등록안/예약을 반환한다.
- 등록안은 기존 모아온 PENDING 승인 흐름에만 추가하며 즉시 실제 업무로 등록하지 않는다. 기존 등록안 승인/반려 상태도 반영한다.
- 다시 알림은 모아온에서 확인/취소한다. 워커 claim 이후에는 취소하지 않으며 결과 불명은 재발송하지 않는다. 설정/수신처 변경 시 취소한다.
- Hermes adapter에 moa: prefix만 전달하는 좁은 bridge를 추가하는 설치기를 준비했다. 원본 모양 검사/백업/멱등 검증이 있고 다른 callback은 기존 처리기로 간다. 별도 Telegram polling은 만들지 않았다.

## 검증 완료
- PGlite 실제 SQL: 허용 사용자/slot/chat/message 변경 거부, 1시간 due_at, 반복 클릭, 승인대기, 취소, 예약 전 claim 거부, UNKNOWN 보존.
- Python worker 7 / callback 3 통과. 전송 성공 후 bind 실패도 UNKNOWN 유지.
- 데스크톱 459 통과; 소스/패키지 Electron 6 화면 상태 및 다시알림 취소/봇 분리 통과.
- 서버 전체 3028 중 3026 통과, 기존 tenant-recovery-review-request deadline 테스트(부모/하위 2건)가 병렬 부하에서 실패. 해당 파일 재실행 38/38 통과.
- Next webpack 빌드 통과. 0.149.0 Ed25519 서명 설치파일 생성, 선언 파일 131개 일치.
- Hermes 현행 adapter --check: CALLBACK_BRIDGE_COMPATIBLE. 실제 원본 파일은 아직 수정하지 않았다.

## 운영 반영 대기 (중요)
- Supabase apply_migration / execute_sql / list_migrations 모두 MCP -32603 Internal error.
- 최초 migration 호출의 반영 여부는 미확인이다. 재시도 전 to_regclass와 함수 정의를 확인해야 한다. 최초 호출 이후 DRAFT 반환 상태 표시를 보완했으므로 실제 함수와 최종 SQL 차이도 확인한다.
- Chrome에 Supabase 로그인 화면을 열고 사용자 로그인 요청을 보냈다.
- 서버/앱/고객 업데이트, Hermes bridge 설치, 실제 Telegram 버튼 클릭/다시알림 발송은 아직 적용/검증하지 않았다.
- 운영 0.148.1 및 WORK 매일09시 예약은 유지한다.
- 빌드: D:/GPT/moaon/desktop/dist/distribution-20260916-061722-336

## 재개 순서
1. DB 반영 여부와 최종 SQL 정의 확인 → 누락분 마이그레이션 적용.
2. 서버1.67.0 배포 READY 확인.
3. 두 봇 idle 확인 후 installer 실행, bridge 설치 및 named gateway 재시작, 기존 default/account 보존 확인.
4. 0.149.0 설치 앱에서 두 봇 시험 브리핑 요청, SENT 확인.
5. 실제 Telegram 버튼 및 승인대기/예약/취소/전송 확인. 테스트 예약의 시간 가속을 한다면 테스트 ID에만 적용하고 별도 기록한다.
6. 모아온 설치 UI 검증 후 GitHub moaon-stable 서명 업데이트 배포.

## 2026-09-16 운영 반영 재개
- 사용자 Supabase 로그인 후 MCP 복구. 기존 카드/RPC 미존재 확인 후 최종 migration 성공, 생성 확인.
- 서버 1.67.0 운영 READY. 설치 과정에서 CRLF 및 새 정적 파일의 proxy 공개 경로 누락을 발견하고 수정했다(d6ed3f4, e1871dc). 인증 회귀 17/17 통과. 최종 deployment dpl_Ap8VoAe5pP2yyLEAesEYdVFRMBXn READY.
- Hermes 설치 CALLBACK_BRIDGE_INSTALLED → 재검사 CALLBACK_BRIDGE_PRESENT. timer active, 두 named profile 연결 정상. 기존 계정 설정 변경 없음.
- 0.149.0 실제 설치 앱에서 업무비서 화면, 봇별 자동화/다시 알림 영역/오전9시 예약 확인. Playwright mouse click이 timeout되어 앱 DOM click으로 검증했다(사용자 OS 입력 없음).
- 설치 앱에서 두 봇 AUTO_TEST 요청. WORK message10, SOLO message9 모두 SENT(07:16 KST). 실제 사용자 Telegram 버튼 클릭 확인은 요청 후 대기 중이다. 아직 실제 snooze 예약/발송을 검증했다고 주장하지 않는다.
- 기존 WORK 매일09시 활성화 / SOLO 예약 꺼짐 유지.
- GitHub moaon-stable 서명 업데이트 0.149.0 published:true 확인. 실제 Telegram 클릭 후속 검증은 대기 중.
