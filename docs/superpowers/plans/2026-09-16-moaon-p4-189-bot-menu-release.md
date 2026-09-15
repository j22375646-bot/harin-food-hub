# P4-189 봇 메뉴 1차 구현 · 2026-09-16

서버 1.69.0 / 데스크톱 0.151.0.

## 구현 범위

- WORK, SOLO, STUDY 각각 6개 하단 메뉴. 모아온의 봇 메뉴 탭에서 표시 항목과 순서를 저장한다. 최소 1개, 봇별 수정 버전, 충돌 시 편집 유지, 2열 미리보기.
- Hermes 기존 Telegram gateway에 좁은 메시지·callback bridge를 등록한다. 별도 polling 없음. 기본 프로필의 일반 대화는 그대로 통과한다.
- SOLO 개인 업무 연결: 로그인한 소유자 본인만 연결, Telegram private ID와 현재 봇 허용 설정·현재 사용자/사업장/멤버십 버전을 매 요청 확인. 본인에게 배정된 미삭제 OPEN 업무만 반환.
- 업무 완료·기한 변경: 준비 시 현재 revision을 확인하고 5분 확인 ID를 생성. 실제 확인 시 담당자·삭제·봇·연결·멤버십·업무 revision을 재검증한다. 반복 확인은 동일 결과. 준비 시간당 30회. 이미 내일 이후인 업무는 내일로 앞당기지 않는다.
- 오늘 집중할 일 최대 3개. SOLO 본인 프로필의 제한된 로컬 파일에 당일 선택 ID만 보관. 다음 한국 날짜에 초기화, 완료/삭제된 업무는 선택에서 제외.
- WORK: 주문·배송/문의/마감 업무는 기존 저장 자료 API. 채널 구분, 조회 키 발급자 업무 표시, 누락은 확인 필요.
- STUDY: 승인된 지식 원문·출처, 검토 대기 목록·승인 개수. 기억 테스트는 제목에 대한 자기 점검 후 원문 비교.
- SOLO 다시 알림 조회: 현재 봇 버전·현재 대화·해당 사용자만 반환.

## 이번 단계에서 안내/이동으로 연결한 메뉴

빠른 메모는 기존 대화 및 moaon-operations 등록안 요청 안내다. 별도 메모 DB나 자동 자연어 일정 생성은 추가하지 않았다. 자료 등록·지식 수정은 기존 moaon-learning 대화 스킬 안내를 제공한다. 승인/반려와 예약 취소·시간 변경은 모아온에서 수행한다. 하루 정리는 현재 미완료 업무 처리 화면이며 완료 통계 리포트는 아니다. 주문 개별 상세/발급 및 고객 메시지 자동 발송은 추가하지 않았다.

## 검증

- 서버 관련 Node 17개 통과 (개인/메뉴 SQL, 봇, 기존 자동화, 학습).
- 데스크톱 단위 459개 통과.
- Python 메뉴 5개 통과: 권한 거부, 일반 대화 통과, 준비와 확정 분리, 신뢰된 사용자 ID 전달, disabled 메뉴, 누락값, catalog 계약, Telegram callback 64-byte 한계.
- source와 packaged Electron: 봇 연결·개인 연결/해제, 메뉴 순서 저장·복원·충돌·최소 항목, 6개 화면/테마 확인.
- 실제 설치 앱 0.151.0: 저장 로그인, 오른쪽 보조 화면, 포커스 미탈취, 운영 MENU_READ/SAVE 및 개인 계정 연결 성공.
- 실제 시험 업무를 생성해 Hermes connector에서 내일 미루기 후 완료, DB revision 3/DONE 및 설치 앱 조회 확인 후 소프트 삭제.
- 실제 Telegram sendMessage: SOLO message 10, WORK 11, STUDY 3에 각각 6개 하단 메뉴 전송 성공. 사용자 실물 버튼 탭 자체는 이 검증에 포함하지 않는다.
- 운영 마이그레이션 personal_tasks, bot_menus, personal_accounting 적용. 연속 실행 중 전역 조회 10회 한도 소진 발견 후 확인 처리만 미차감하도록 수정. 인증·만료·30회 준비 제한 유지 및 회귀 4개 통과.
- Vercel dpl_BwPT73Tpp3ecQnoQADCEuQAzxGy9 READY, production alias 반영.
- 설치 산출물 desktop/dist/distribution-20260916-080938-400, 114239427 bytes, Ed25519 자동 업데이트 서명. Windows Authenticode는 NotSigned이며 기존 배포 정책과 동일.
- GitHub moaon-stable 0.151.0 서명 배포 완료. 마지막 확인 시 세 봇 RUNNING, timer active, service Result=success/ExecMainStatus=0. WORK 매일 09:00 예약은 켜진 상태를 유지한다.

## 운영 경계

키/토큰을 소스·로그에 기록하지 않는다. 조회 키 범위는 유지한다. 봇 설정 저장 시 기존 profile model 선택을 보존하며 인증·개인 대화는 복사하지 않는다. 자동 발송 시간과 수신처는 기존 모아온 설정을 유지한다.
