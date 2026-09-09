<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 모아온 전용 개발 지침

- 사용자 지정 작업 저장소는 D:\GPT\moaon이다. 새 임시 파일·로그·캐시·시험 DB는 D:\GPT 아래에 저장한다.
- 매 개발 단계에서 코드/DB 시험에 더해 Electron 자동화로 실제 앱의 변경 범위에 맞는 화면과 동작을 확인한다. 기존 desktop/test 자동 검증을 우선 사용하고, 사용자의 마우스·키보드·포커스를 가져가는 원격 UI 조작은 사용하지 않는다. 코드시험, 격리 DB시험, 설치앱 확인 결과를 구분해 보고한다.
- 앱 변경 시 자동 빌드·업데이트·실행 검증까지 진행한다. UI 변경이 없더라도 기본 조회/화면 회귀를 자동화로 확인한다. 운영 미적용 서버 후보를 설치앱에서 검증했다고 주장하지 않는다.
- 실제 로그인 비밀번호 입력은 사용자에게 맡긴다. 조회 검증을 이유로 실주문 발급/출고 또는 API 키 변경을 실행하지 않는다.

- 2026-09-10 사용자 보완: 숨김 시험만으로 끝내지 말고 설치 모아온을 실제로 열어 보여준다. 필요하면 시험 자료임을 명시한 별도 가시 자동 검증 창을 사용한다. 마우스·키보드 원격 조작은 계속 금지하며, 사용자가 요청한 앱 표시/자동 검증 창 표시에는 별도 확인을 요구하지 않는다. 실제 사용자 세션 검증과 격리 시험을 구분한다.
- 2026-09-10 추가 정정: 모아온과 보이는 자동 검증 창은 오른쪽 보조 모니터에 표시한다. 사용자가 다른 작업 중인 메인 모니터에 띄우거나 포커스를 가져오지 않는다. 보조 모니터가 없으면 메인에 대신 띄우지 말고 알린다.
