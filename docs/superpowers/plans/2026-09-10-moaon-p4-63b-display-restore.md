# P4-63B — 업데이트 재실행을 위한 오른쪽 모니터 선택 보존

기준 e0e4b3c. 이전에는 --display-right가 매번 필요해 updater가 인수 없이 재실행하면 메인 모니터에 열릴 수 있었다. 이번 변경은 사용자가 지정한 오른쪽 표시 선택을 앱 사용자 자료 폴더의 display-preference.json에 보존한다. 좌표를 그대로 저장하지 않고 실행 시 현재 모니터 배치에서 오른쪽 보조 모니터를 다시 찾는다.

## 변경

- 명시적 오른쪽 실행을 한 번 수행하면 이후 실행 인수가 없어도 오른쪽 보조 모니터에서 showInactive로 표시한다.
- 이미 실행 중인 앱을 다시 실행할 때도 오른쪽 선택을 적용하고 show/focus를 호출하지 않는다. 일반 실행 사용자의 기존 동작은 보존한다.
- 오른쪽 모니터가 없으면 메인 모니터에 대신 열지 않는다. 설정 파일 손상·지원하지 않는 형식·읽기 실패도 메인 표시로 바꾸지 않고 중단한다. 명시적 --display-right는 손상된 표시 설정을 다시 저장할 수 있다.
- 설정은 작은 version/display 기록만 저장한다. 임시 파일을 쓰고 rename으로 교체하며 인증정보와 업무 자료를 변경하지 않는다.

## 검증 및 적용 범위

위치 선택·설정 보존/손상·비포커스 표시와 기존 업데이트 검사 총12개 PASS. 로그: D:\GPT\tmp\p463b-tests.log.

가시 개발 앱 시험은 기존 검증 bootstrap의 위치 강제 지정과 showInactive 대체를 사용하지 않는다. 실제 Main 코드가 오른쪽 위치와 비포커스 표시를 수행해야 통과한다. 시험 bootstrap은 예상치 못한 show/focus 호출을 실패시켜 사용자 작업을 보호하며, 사용자 자료는 D의 격리 프로필만 사용한다. 실제 로그인·주문 처리는 실행하지 않는다.

최종 가시 시험 PASS: 명시적 오른쪽 실행 → 종료 → 같은 프로필로 인수 없이 재실행, 각 실행 중 별도 Electron 프로세스의 실제 중복 실행을 확인했다. 로그인 진입 화면 로드·창 전체 영역의 오른쪽 모니터 포함·visible=true/focused=false도 확인했다. 로그: D:\GPT\tmp\p463b-display-ui.log. 화면: D:\GPT\tmp\moaon-display-restored.png. 최소화 상태/모니터 분리 중의 OS 창 재배치는 이번 시험 범위 밖이다.

실제 서명된 설치 파일을 통한 업데이트·업데이트 후 로그인 보존 인수는 여전히 별도다. 설치본0.52.1은 교체하지 않고 소스 앱을 검증한다. 새 의존성 설치나 전체 D드라이브 이전 작업도 수행하지 않는다.

참고: [Electron BrowserWindow 문서](https://www.electronjs.org/docs/latest/api/browser-window), [중복 실행 이벤트 문서](https://www.electronjs.org/docs/latest/api/app#event-second-instance).
