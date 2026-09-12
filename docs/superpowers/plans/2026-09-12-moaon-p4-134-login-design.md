# P4-134 로그인 디자인 및 Windows 표시 식별자

- 버전: 0.121.0. 서버 인증/API 변경 없음.
- 원격 서버 소유 로그인 폼에 데스크톱 CSS 적용: 모아온 로고, 라일락/민트 배경, 제한된 부유/등장 효과, reduced-motion 대응.
- 계정 선택은 native select의 base-select picker를 사용하여 펼친 목록까지 디자인. 선택 이벤트와 서버 POST 경로 유지. 사장 계정 전환 시 비밀번호 4자리 반영 확인.
- 로그인 WebContentsView 위 48px에 항상 남는 별도 드래그 영역 추가. 앱 본문에서는 숨김.
- 창 icon을 실제 디스크 ICO로 setIcon. Windows 표시 AppUserModelID를 com.moaon.desktop.main으로 분리하고 시작 메뉴 링크에도 동일 적용. 업데이트 서명의 com.moaon.preview와 사용자 데이터 경로는 유지.
- 테스트 bootstrap의 앱 그룹은 com.moaon.verification으로 분리. 기존 검증 창이 정식 앱과 같은 그룹을 사용하던 문제 해소.

## 검증
- 데스크톱 단위 시험 375 PASS.
- 실제 공개 서버 로그인 GET을 격리 Electron에서 확인: 640/1040/1440 폭, 입력 높이 58px, 가로 넘침 없음, base-select picker, 단일 비밀번호 폼, 원격 폼 Node/앱 bridge 없음. 실제 비밀번호 입력/POST 없음.
- 격리 synthetic POST 로그인 흐름 PASS.
- 0.121.0 패키지 팀/프로필/체크리스트/설정/Windows 알림 표시 회귀 PASS. 운영 업무 변경 없음.
- 패키지 소스 일치 82개 PASS, asar SHA256 3a4fb7d792c8190ca87df393325749dceab8ddba6150e5c50834e1f1b38a9db2.
- 로컬 정식 0.121.0 실행. HWND 속성에서 com.moaon.desktop.main과 별도 재실행 속성 2/3/4가 비어 있음을 직접 확인.
- 0.119.0의 WM_GETICON 및 EXE 아이콘은 정상이었지만 사용자 작업표시줄은 Electron으로 남았다. 0.120.0 별도 그룹은 흰 문서로 보였다. 실행 중인 창의 RelaunchCommand/IconResource/DisplayName 속성을 제거하고 새 그룹 com.moaon.desktop.main을 적용하자 사용자가 모아온 로고 표시를 확인했다. 0.121.0은 이 검증된 방식을 영구 적용한다. setAppDetails는 appId만 지정하고 실제 setIcon과 EXE 아이콘을 사용한다.
- GitHub 게시 직후 release.json CDN이 이전 버전을 반환하는 동안 업데이트 검증은 ERROR로 안전 중단됨. 공개 파일 동기화 후 0.120.0 다운로드 및 Ed25519 검증 PASS. 최종 0.121.0도 0.120.0에서 다운로드·서명 검증 PASS. 시험에서 설치파일 실행은 하지 않았으며, 로컬 검증은 publish-local로 검증한 패키지를 사용했다.

## 산출물
- desktop/dist/distribution-20260912-213618-933
- Setup SHA256 FCE3A894FDD212E17D22BE141C5BEBDDB05B5341293FAEAA4BDC05A506F67A8F
- 스크린샷 D:/GPT/tmp/moaon-public-inline-login.png, moaon-login-picker.png
- Windows Authenticode 유료 서명 없음. 기존 Ed25519 업데이트 서명 유지.

- 최종 GitHub moaon-stable 0.121.0 게시 완료. 로컬 0.121.0 실제 실행 확인.
