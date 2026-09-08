# 모아온 Windows Preview 0.1.0

실행 가능한 Windows 앱 시제품이다. 실제 계정/사업장/주문/송장/API와 연결되지 않으며 화면의 자료는 모두 시험 자료다. 독립 창으로 실행되지만 실제 서비스 완성이나 오프라인 업무 지원을 의미하지 않는다.

## 개발·빌드

Windows x64 / Node24, desktop 디렉터리에서:

```powershell
npm ci --ignore-scripts
node node_modules/electron/install.js
npm test
npm run start
npm run pack
```

Electron은 명시 실행한 공식 installer가 고정 버전 checksum을 확인해 다운로드한다. 빌드 도구는 추가 빌드용 바이너리를 다운로드할 수 있다. 설치는 OS 전역 개발도구/클라우드 자원을 만들지 않는다. npm lockfile을 보존한다.

- 설치파일: `dist/Moaon-Preview-0.1.0-Setup.exe`
- 폴더 실행본: `dist/win-unpacked/MoaonPreview.exe` (폴더 전체가 필요; exe만 복사하지 않는다)
- 공개 업로드·자동 업데이트·자동 시작은 사용하지 않는다.
- 개인 시험용 미서명 빌드로 Windows에서 게시자 미확인/SmartScreen 경고가 나타날 수 있다. 보안 기능을 끄지 않는다.
- 이 PC의 실행 검증은 다른 PC의 설치/제거/프린터 검증을 대신하지 않는다.

## 보안 경계

로컬 허용 파일만 제공하는 custom protocol, renderer sandbox/context isolation, Node 비활성, IPC 없음, CSP 외부 연결 차단, 외부 탐색/팝업/권한/다운로드 거절. 새로운 실사업장 계정과 API 키는 아직 입력하지 않는다.

## 다음 인도

P5-02에서 설치/재실행/업데이트 경로와 기존 하린식품 업무 연결 방식을 검증한다. 다사업장 실사용은 P1/P2/P3 격리 조건을 충족한 뒤 활성화한다. 서명 인증서 구매·공개 배포는 별도 승인 대상이다.
