# P4-63A — 자동 업데이트 흐름과 작업 보호

기준63bd424. 사용자가 반복적인 삭제·설치 대신 배포 후 앱 내 업데이트를 요청했다. 이번 단계는 업데이트 클라이언트와 UI를 구현하고 개발 앱에서 검증한다. 설치본0.52.1은 유지하며 실제 업데이트 배포는 별도 준비가 필요하다.

## 구현

앱 시작10초 후 새 버전을 확인하고, 유효한 상위 버전이 있으면 백그라운드 다운로드를 준비한다. 프로그램 정보 카드에 확인/다운로드/진행률/재시작 버튼을 표시하고 준비 완료는 상단에도 알린다. 설치는 명시적인 재시작 버튼으로만 수행하며 일반 종료 시 자동 설치는 비활성화한다.

Main의 기존 업무 IPC를 공통 gate로 감싼다. 진행 중인 비동기 업무나 별도 창이 있으면 업데이트 재시작을 거부한다. 재시작 진입은 동기적으로 gate를 닫아 새 업무가 끼어들지 못하게 하며 설치 호출 실패 시 다시 연다. 이는 업데이트로 인한 종료에 적용되며, 원래의 일반 창 닫기 동작을 변경한 것이 아니다. 서버에서 이미 접수된 비동기 작업의 완료를 의미하지도 않는다.

업데이트 IPC에는 URL/경로/버전 인수를 받지 않고 기존 trusted-renderer 검사를 적용한다. 고정 상태와 검증한 버전/진행률만 반환한다. 다운로드 실패·서로 다른 버전·비정상 정보·오래된 버전은 적용 준비로 승격하지 않는다. 중복 요청, 늦은 다운로드 이벤트, 설치 호출 실패도 시험한다.

update-channel.json은 enabled=false다. 활성화하려면 설치 앱·Windows·HTTPS 배포 주소·서명자와 빌드된 app-update.yml의 generic URL/publisherName이 정확히 일치해야 한다. 누락 시 SETUP_REQUIRED로 표시하고 transport를 생성하지 않는다. electron-updater의 해시/Windows 서명 검증을 우회하지 않는다.

## 실제 배포를 위해 남은 항목

1. 배포용 HTTPS 저장소와 코드 서명 인증서/발행자를 정한다. 다운로드 경로는 앱에 고정하며 고객에게 저장소 접근 토큰을 넣게 하지 않는다.
2. release config와 electron-builder publish.generic / win.publisherName 및 실제 서명을 일치시킨다. 현재 publish=null/signAndEditExecutable=false인 개발 설정으로 운영 활성화하지 않는다.
3. 모든 소스를 확정한 뒤 서명한 설치 파일·blockmap·latest.yml을 생성한다. 설치 파일을 먼저 배포하고 metadata를 마지막에 공개한다.
4. 격리 Windows 인수 환경에서 구버전→신버전 실제 설치, 변조/서명 불일치 거부, 다운로드 중단, 작업 중 재시작 차단, 설정/로그인 보존, 업데이트 후 모니터 위치와 복구 절차를 검증한다. 현재 --display-right 실행 옵션이 자동 설치 후 재실행에 보존되는지는 인수 대상이다.
5. 현재0.52.1에는 updater가 없으므로 클라이언트가 포함된 첫 버전은 한 번 배포/설치해야 한다. 이후부터 앱 내 업데이트가 가능하다.

실제 배포 주소/인증서 없이 임의 주소로 공개하거나 서명 검사를 끄지 않는다. 이번 가상 UI/상태 시험은 실제 자동 설치 성공 증거가 아니다.

## 검증 기록

상태/작업 gate/IPC/서명 metadata 검사 최종8개 PASS. 예약된 설치 직전 오류는 설치를 취소하고, 실패한 업무도 gate를 해제한다. 관련 설정 저장·인증정보·보안36개 PASS(업데이트 초기7개 포함), 최종 업데이트8개는 별도 재검증했다.

개발 앱의 SETUP_REQUIRED→AVAILABLE→DOWNLOADING(42%)→READY→BUSY→ERROR 상태를 오른쪽 모니터에서 비포커스로 확인했다. 실제 설치/재시작은 실행하지 않았다. 실제 electron-updater6.8.9 NsisUpdater 생성도 Electron 안에서 PASS이며 네트워크 조회·다운로드·설치는 호출하지 않았다. 기본 서명 검사와 autoInstallOnAppQuit=false 동작은 설치한 라이브러리 소스로 확인했다.

로그: D:\GPT\tmp\p463-updates-tests.log, p463-regression.log, p463-adapter.log, p463-update-ui-final.log. 화면: D:\GPT\tmp\moaon-updates-ready.png. 실제 배포 인수는 위의 별도 남은 항목이다.

기존 설정 화면14개 시나리오도 소스 앱으로 PASS(p463-settings-ui.log). 실제 Windows 암호화 초안 저장/삭제 회귀와 가상 IPC 응답을 사용했으며, 실사용 API 키·서버 저장은 실행하지 않았다. 보이는 검증 창이 오른쪽 보조 모니터 안에 있고 포커스를 가져오지 않음을 확인했다.

## 의존성과 개발 환경

electron-updater6.8.9와 기존 잠금 버전인 js-yaml4.3.2를 운영 의존성으로 명시하고 package-lock을 갱신했다. 새 Main 파일3개를 패키지 목록에 포함했다. 설치 스크립트 없이 D:\GPT\deps\moaon-updater-runtime에 필요한 라이브러리16개를 준비하고 실제 모듈 생성 시험에 이 경로를 사용했다. test/app-updates-adapter-smoke.cjs의 MOAON_UPDATE_TEST_DEPENDENCIES는 이 격리 시험에만 쓰는 옵션이다.

전체 개발 의존성 복사/새 설치는 지연 때문에 중단했으며 desktop/node_modules의 기존 C드라이브 junction을 전환하지 않았다. root node_modules와 기존 설치 앱도 그대로다. D:\GPT\deps\moaon-desktop-node_modules 및 moaon-desktop-runtime은 일부 준비 자료가 남아 있으므로 완성된 개발 환경으로 사용하지 않는다. 별도로 공식 Electron44.2.0 ZIP의 SHA-256을 패키지 checksums.json과 대조하고 D의 runtime 폴더에 풀었지만 전체 개발 의존성 이전 완료는 아니다. C 자료 삭제·용량 회수는 수행하지 않았다.

이번 단계는 새 설치 파일을 만들거나 설치본을 교체하지 않았다. 다음 패키지 생성 전에는 완전한 D 의존성 환경을 준비해야 하며, 기존 C junction을 통해 npm install을 실행하지 않는다.

참고: [electron-builder 공식 자동 업데이트 문서](https://www.electron.build/v26/docs/features/auto-update/).
