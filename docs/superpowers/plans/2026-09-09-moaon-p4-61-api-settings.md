# P4-61 API 설정 Implementation Plan

**Goal:** 기존 하린식품 서버 연결을 보존하면서 새 사업장의 플랫폼 API 입력과 PC 암호화 초안 저장을 제공한다.

**Architecture:** 렌더러는 입력만 수집하고 신뢰된 IPC로 전달한다. 메인 프로세스가 Windows 암호화 저장을 담당한다. 반환값은 사업장 이름·플랫폼·미검증 상태뿐이다. 로컬 사업장 이름은 서버 권한 식별자가 아니며 실제 연결/키 교체를 하지 않는다.

**Tech Stack:** 기존 Electron, safeStorage, Node fs, 기존 앱 CSS. 추가 패키지 없음.

## 범위와 제한

- 하린식품 비밀키를 서버에서 내려받거나 앱에 하드코딩하지 않는다. 현재 서버 인증을 그대로 사용한다.
- Cafe24 mallId/clientId/clientSecret, Naver Commerce clientId/clientSecret, Coupang vendorId/accessKey/secretKey, ePost customerId/apiKey를 입력한다. Cafe24 OAuth 승인과 각 공급자 권한 검사는 별도 단계다.
- 저장은 연결 성공이 아니다. SAVED_UNVERIFIED를 표시한다. 새 사업장 자동 연결은 활성화하지 않는다.
- Windows 동일 사용자로 실행되는 악성 프로그램까지 막는 암호화는 아니다. 다른 PC로 자동 이전하지 않는다.

## 구현 순서

- [x] desktop/api-drafts.cjs와 test/api-drafts.test.cjs: 정확한 스키마 검증, 50개 한도, 암호화 미지원/손상 시 저장 차단, 직렬화·원자 교체, 메타데이터만 반환. 신뢰된 렌더러 IPC만 허용. 실패 시험 후 통과 확인.
- [x] desktop/ui/api-settings.js, index.html, app-common.css: 기존 서버/새 사업장 선택, 플랫폼별 필드, 저장과 저장 목록, 저장 직후 비밀값 비우기. 화면 이동/로그아웃에도 비움. 테스트에서 시험키로 실제 암호화 저장 확인.
- [x] main.cjs/preload.cjs/security.cjs/package.json: 허용 IPC와 앱 리소스·패키지 연결. 키 원문 조회 IPC는 만들지 않는다.
- [x] 앱 전체 테스트와 격리 프로필 패키지 UI 검증, 설치·해시 확인.

## 구현·검증 결과

0.50.0에 플랫폼 입력 화면, 저장 목록과 삭제, Windows 암호화 저장소, 신뢰된 IPC를 구현했다. 서브 에이전트가 저장소를 담당하고 메인 작업에서 통합 검증했다. 입력값은 저장 후/화면 이동/로그아웃 때 비운다. 키 원문 조회 API는 없다.

앱 전체 280개 테스트 통과. Windows 실제 safeStorage를 사용하는 격리 프로필에서 시험 키 저장·목록·삭제, 키 원문 비반환, 입력 비움과 1040/1440 폭을 검증했다. 시험 키는 실제 서비스 키가 아니다. 하린식품의 운영 키는 읽거나 복사·교체하지 않았다. 하린식품은 기존 서버 연결을 계속 사용한다.

[Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)의 Windows DPAPI를 사용한다. 같은 Windows 사용자로 실행되는 프로그램으로부터 보호하는 비밀 저장소는 아니다. 로컬 암호화는 서버의 사업장별 권한 검증을 대신하지 않는다.

## 후속 실제 연결 단계

설치 결과: 0.50.0 설치 종료 코드 0, 설치 app.asar와 패키지 산출물 SHA-256 일치. 기존 로그인 프로필을 삭제하지 않았다. 암호화 저장 시험은 임시 프로필에서만 수행했으며 사용자 프로필에 시험 키를 넣지 않았다.

서버에서 인증된 tenant ID/소유자 권한에 따라 암호화 인증정보를 저장하고 공급자 검증을 수행해야 한다. 검증 전에 하린식품 환경변수를 다른 사업장 값으로 덮어쓰지 않는다. Cafe24 OAuth와 고정 IP 공급자 검증, 갱신/철회, 잘못된 키·다른 사업장 거부 검증 후 활성화한다.
