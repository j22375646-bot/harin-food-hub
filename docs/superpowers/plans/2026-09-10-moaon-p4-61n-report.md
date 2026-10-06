# P4-61N — 앱의 서버 API 설정 저장 흐름

기준 fedd482. 개발 저장소 D:\GPT\moaon. 앱 대상 버전0.52.0.

## 변경한 동작

설정 → 플랫폼 API 연결 → 내 사업장에 서버 저장 상태 조회와 서버 저장을 추가했다. 사용자가 현재 사업장·플랫폼의 revision을 조회한 뒤, 앱 안의 확인창에서 사업장/플랫폼/교체 버전을 확인해야 저장한다. 사업장·플랫폼·화면 변경은 이전 상태와 확인을 무효화하고, 입력 키는 취소·완료·실패·화면 종료 시 지운다. 조회 실패를 새 설정(revision0)으로 간주하지 않는다.

성공은 서버 저장됨·연결 검증 전이다. 충돌·권한·요청 한도·서버 준비 전·결과 불명을 구분한다. POST 결과 불명은 자동 재전송하지 않으며 다시 상태를 조회하고 명시적으로 확인해야 한다. 기존 PC 암호화 저장은 별도 동작으로 보존했고, 서버 확인 중 로컬 저장과 충돌하지 않게 잠근다.

Main은 고정 origin의 정확한 GET/POST에만 잠시 네트워크 허용을 열고 매번 소유자 사업장 목록을 새로 확인한다. renderer의 임의 요청은 허용하지 않는다. 로그아웃과 모든 연결 generation 변경에서 요청을 취소하고 늦은 결과를 폐기한다. 반환 본문 크기·전체 기한을 제한하고 키 원문/서버 오류 본문은 IPC에 반환하지 않는다.

서버 GET은 ACTIVE OWNER·세션 잠금·최종 세션 확인을 거쳐 revision만 읽는다. 암호문/키 ID/키 원문을 조회하지 않는다. GET과 POST는 기존 공통 admission budget을 각각1회 사용한다. 새 SQL/권한 확대 없이 기존 제한 역할을 사용한다.

## 검증

- 서버405개 시험 파일의 전체 목록을 비교해 누락0 확인. 빠른 묶음2,666 PASS+빌드 전용3 skip, 별도 요청시험38 PASS, 파일영속성 묶음24 PASS, 빌드 후3개까지 확인하여 최종 **2,731 PASS / 0 FAIL / 0 SKIP**. 빌드 후 실행의 일반시험3개 중복은 합산하지 않았다.
- Next webpack production build exit0. 로컬 실행 GET/POST 미인증401+no-store, 로그인200 확인 후 시험 서버 종료.
- 전체 앱 **297/297 PASS**. 최종 generation 보완은 관련117/117과 독립 회귀로 추가 확인했다.
- Native PostgreSQL 전체 최초5/6 PASS. 디스크 동시 I/O 중 connection acquire 실패한 기존 cap 시험1개만 다시 실행하여1/1 PASS. 새 GET-before/POST/GET-after 및 quota4 검증 PASS. 변경 없이6개 모두 통과 증거 확보. 시험 DB0/역할0 확인 후 PostgreSQL 정상 종료.
- NSIS 빌드 exit0, 설치 /S exit0. 설치 레지스트리0.52.0 확인. 설치 app.asar와 D 빌드 app.asar SHA256 동일(8581B59926B35674888A5E72BB837B5A52E35F9F1B60ACA4ED3F9EE91AFB53F9). 바탕화면 모아온 바로가기의 실행 대상 존재 확인.

- 소스 숨김 Electron: 14가지 서버 저장 UI 시나리오와 실제 Windows 암호화 로컬 저장·조회·삭제 PASS. 서버 저장 응답만 synthetic IPC이며 실제 자격증명이나 운영 POST는 사용하지 않았다.
- 독립 리뷰: 요청 generation 취소 누락과 로컬 저장/서버 확인 충돌을 수정하고 승인. 검토자가 관련13개+추가 회귀1개를 직접 확인했다.
- 숨김 소스/설치 패키지 로그인 보호 PASS: sandbox/contextIsolation, renderer Node 비노출, 업무화면 inert, 모든 창 hidden/unfocused.
- 설치 app.asar UI 최종 재시험 PASS: 14가지 동작+1040/1440 폭+실제 Windows 로컬 암호화 회귀+패키지0.52.0 확인. 첫 실행의 버전 증명 코드는 Electron evaluate에 require가 없어 실패했으며, 외부 시험 실행기에서 asar metadata를 읽도록 고쳤다. 앱 코드는 변경하지 않았다.

명령: `node desktop/test/credential-settings-smoke.cjs [--installed-package]`, `node desktop/test/background-login-smoke.cjs [--installed-package]`. 개발 Electron44.2.0으로 실제 소스 또는 설치 app.asar를 실행하며 사용자 세션을 복사하지 않는다. 인증된 설치 EXE 전체 업무·운영 플랫폼 성공 검증과는 구분한다. 새 개발 산출물/시험 프로필/로그는 D:\GPT, 기존 설치 위치는 C:\Users\a\AppData\Local\Programs\Moaon Preview이다.

설치 파일: D:\GPT\moaon\desktop\dist\Moaon-Preview-0.52.0-Setup.exe (113601972 bytes). 실행 바로가기: C:\Users\Public\Desktop\모아온.lnk.

## 운영 적용 경계

이번 단계에서는 서버 운영 SQL/키/env/권한/배포를 활성화하지 않았다. 설치 앱의 서버 저장 UI는 준비했지만 운영 endpoint 준비/로그인 상태에 따라 준비 전 또는 권한 필요로 표시된다. 실제 사업장의 플랫폼 인증 성공·주문 수집 전환 검증 결과가 아니다.

다음은 운영 활성화 사전 점검이다. 전역 proxy의 OWNER 정책과 다사업장 정책 대조, 최소권한/세션 fence/공유 요청 제한 SQL 적용 상태, 암호화 키 보관·교체 및 ingress 설정을 확인한 뒤 별도 운영 적용 범위를 정해야 한다. 기존 하린식품 운영 인증정보는 변경하지 않았다.
