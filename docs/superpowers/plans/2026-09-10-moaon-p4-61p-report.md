# P4-61P — DB 구조 점검 및 보이는 앱 검증

기준8d9146c. D:\GPT\moaon. 설치 앱0.52.0 유지.

## 개발 내용

`check-moaon-credential-schema.js`는 명시적 MOAON_CONTROL_DB_DIAGNOSTIC=1에서만 제한 역할 DB adapter를 생성한다. 고정 catalog 진단으로 필수 테이블9개의 존재/RLS와 quota 함수2개의 형태를 검사한다. 기존 adapter의 세션 초기화/timeout/역할 확인은 함께 실행한다. 실데이터·키·사업장 행을 읽거나 quota 함수·DDL을 실행하지 않는다.

결과는 SCHEMA_PRESENT_REQUIRES_OPERATIONS 또는 BLOCKED이며 열 구조/ACL/정책/함수 본문/실제 quota와 session fence/운영 ingress/인증은 UNVERIFIED다. 쿼리 실패와 pool 정리 실패도 안전한 고정코드로 반환한다. 기존 factory에 optional diagnostic callback을 추가해 이 CLI에서는 별도 console 진단 출력을 차단하고 기존 호출 동작은 보존한다.

[운영 절차](./2026-09-10-moaon-credential-activation-runbook.md)에 명령·반환값·남은 점검 경계를 추가했다. 이번에는 운영 DB 접속·적용·키 변경을 하지 않았다.

## 사용자에게 보이는 검증

사용자 요청으로 실제 설치 MoaonPreview.exe를 정상 실행했다. 이후 사용자의 모니터 지정 정정에 따라 오른쪽 보조 모니터로 NOACTIVATE 이동했다. 오른쪽은 현재 DISPLAY2이고 메인은 DISPLAY1이다. 마우스/키보드 원격 입력 없이 수행했다.

`node desktop/test/credential-settings-smoke.cjs --installed-package --visible-demo`는 별도 D 격리 프로필의 실제 설치 app.asar를 개발 Electron44.2.0에서 실행한다. 시험 자료 배너, 단계별 간격, 통과 안내와 캡처를 제공한다. 실제 서버 저장 응답은 synthetic IPC이며 로컬 암호화는 격리 Windows 환경에서 실제 저장/삭제한다. 사용자 세션을 복사하지 않는다.

가시 시험 창은 오른쪽 보조 모니터에서 showInactive로 표시하고 focus를 억제한다. 오른쪽 화면이 없으면 메인으로 대체하지 않는다. 가로/세로 크기를 작업영역에 맞추고 최종 visible=true/focused=false/rightSecondary=true/contained=true를 검사한다. 기본 hidden 경로는 유지한다. 이 검증 선호를 AGENTS에 반영했다.

## 검증 범위

- root 관련 서버60/60 PASS. PGlite catalog drift, opt-in 비활성/no factory, 고정 SQL/안전 projection, close/쿼리 오류, 실제 기본 adapter 실패 시 순수 JSON과 timeout/정리 검증. 구현자67/67 및 독립 신규4/4 확인도 있었지만 중복 합산하지 않는다.
- 설치 패키지 가시14개 설정 시나리오 및 기존 로컬 암호화 회귀 PASS. 최종 로그 visible=true/focused=false/rightSecondary=true/contained=true,exit0 확인. 캡처 D:\GPT\tmp\p461p-right-verification.png.
- 설치 패키지 기본 숨김 로그인 보호 및14개 설정/로컬 암호화 회귀 PASS. 창 hidden/unfocused 확인.
- 현재 셸의 진단 opt-in 없는 실행은 DIAGNOSTIC_OPT_IN DISABLED/BLOCKED,exit1. DB 연결 없이 종료. 운영 DB 검사 결과가 아니다.
- 독립 검토 승인. 가시 창 세로 크기 제한과 y/bottom 검사 지적을 반영했다. 앱 제품 코드가 바뀌지 않아 재설치하지 않았으며 운영 배포/전체빌드/전체회귀 재실행을 주장하지 않는다.

남은 것은 실제 배포 환경에서의 DB 구조/ACL/정책/함수 본문 대조, 활성화, 소유자 확인 후 실제 플랫폼 인증이다.
