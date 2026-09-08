# P5-09 운영 worker 안전장치 실제 배포

## 대상 정정

실제 운영 서버는 EC2 인스턴스 목록이 아니라 서울 Lightsail의 `harin-coupang-worker-clean`이다. 기존 `harin-coupang-worker` Lightsail 인스턴스는 중지 상태이며 이번 작업에서 변경하지 않았다. 실행 service 이름은 별개로 `harin-coupang-worker`이다.

브라우저 SSH 주소: https://ap-northeast-2.console.aws.amazon.com/lightsail/remote/ap-northeast-2/instances/harin-coupang-worker-clean/terminal?protocol=ssh

기존 브라우저 도구의 연결을 초기화한 뒤 터미널의 paste 입력과 screenshot 출력으로 직접 작업할 수 있었다. 접근성 텍스트에 터미널 출력이 없어도 screenshot으로 결과를 확인할 수 있다. 사용자의 명령 대행이 필수라는 이전 안내는 더 이상 해당하지 않는다. 계속 사용할 탭은 markHandoff 해야 턴 종료 후 남는다.

## 배포 전

- 작업 디렉터리: `/opt/harin-food-hub/current`, 기존 리비전 `3dff233`, git 작업 트리 깨끗함.
- service active/running, 기존 PID 46246, 시작 시각 2026-09-07 07:02:21 UTC.
- 환경 파일은 기존 `/etc/harin-coupang-worker.env`를 유지. 비밀값은 출력하거나 다운로드하지 않았다.
- `coupang_sync_requests`와 `coupang_operation_requests`의 PENDING/RUNNING 건수 모두 0 확인.
- 실제 중지 명령 직전 다시 두 테이블을 조회하여 오류 또는 0이 아닌 건수면 중지하지 않도록 조건을 걸었다.
- 현재 종료 코드 자체는 실행 중 작업을 기다리는 graceful drain이 아니다. 이번에는 유휴 상태 확인 후 짧은 서비스 중지로 적용했으며 무중단 배포로 표현하지 않는다. 장기적으로 drain gate 보완 필요.

## 실행 및 검증

- 검증된 main 커밋 `014c195`를 fetch 후 fast-forward 적용. 강제 reset, 키 변경, 서버 재부팅 없음.
- 로컬 관련 시험 36/36 통과.
- 서버에서 worker syntax 검사 및 dispatch guard/readiness 시험 7/7 통과.
- 같은 systemd 서비스를 다시 시작했다. PID 49364, 시작 시각 2026-09-08 10:21:26 UTC, active/running, NRestarts 0 확인.
- 재가동 후 DB heartbeat: ONLINE, 2026-09-08 10:21:28.228 UTC, active_job_count 0.
- 후속 주기 heartbeat도 ONLINE, 10:22:28.749 UTC로 갱신됐다. 즉 최초 기동 신호만 확인한 것이 아니다.
- 핵심 worker/채널 실행 경로 차이는 발급 직전 주문 재검증, strict 주문 조회, 준비 상태 판정 보완이다.

## 적용 효과와 한계

HUB_ORDER 우체국 발급 직전에 서버 저장 주문의 취소·기존 송장·채널·배송묶음·조회 성공 여부를 다시 검사하는 안전장치가 이제 실제 worker에 적용됐다. 외부 플랫폼의 아직 수집되지 않은 최신 변경까지 보증하는 기능은 아니다.

실제 고객 주문 발급을 시험하거나 새 발급 요청을 넣지 않았다. Windows 앱의 발급 확인창/실행 IPC/진행 상태 연결과 실제 프린터 검증은 아직 미완료이며 이번에는 EXE를 변경하지 않았다. 새 유료 리소스·DB 스키마·API 권한·로그인 정책 변경 없음.

다음은 앱의 명시적 발급 확인, 요청 식별자 기반 진행 조회, 결과 불명 시 자동 재발급 금지 흐름을 구현하고 합성 데이터로 검증한다. 서버 배포 확인을 반복하는 대신 이 앱 연결 단계로 진행한다.
