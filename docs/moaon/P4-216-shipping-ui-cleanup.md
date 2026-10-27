# P4-216 발급 진행 UI 정리

2026-10-27 · 모아온 0.216.0

## 요청 및 수정

- 주문별 단계 뱃지와 중복되는 전체 발급 진행 요약 박스를 제거했다. `setShippingJobNotice`는 화면 공간을 차지하지 않는 접근성 상태 알림만 남긴다. 주문별 단계 조회·재시작·발급·등록 로직은 변경하지 않았다.
- 단계 상세 팝업의 상단 색상 강조선(inset box-shadow)을 제거했다. 단계에 따른 배경/얇은 테두리와 바깥 그림자는 유지한다.
- `변경 확인` 뱃지를 우측 상단 절대 위치에서 상태 칸 내부의 세로 정렬로 옮겼다. 기본 상태 아래 간격을 두며 좁은 화면에서는 두 뱃지의 시작점을 맞춘다. 변경 뱃지 없는 주문은 기존 구조를 유지한다.

## 검증

- 발급 진행 상태·계약 시험 19개 PASS.
- 오른쪽 보조 모니터의 격리 Electron UI PASS: 전체 요약 박스/버튼 없음 및 화면 높이 불변, 주문별 단계 2개 유지, 팝업 열기·닫기, inset 강조선 없음, 변경 뱃지 겹침 없음, 라이트/다크, 1040/900px, 가로 넘침 없음. 실제 주문 발급·등록 쓰기 0회.
- 검증 창의 자료는 시험 자료다. 실제 로그인 세션의 발급 성공을 이 시험으로 주장하지 않는다.
- 첫 UI 시험은 시험 도구의 start 인자를 잘못 전달해 마지막 검증에서 실패했다. 앱 코드를 바꾸지 않고 시험 호출을 실제 계약에 맞춰 수정한 재실행이 PASS했다.

## 단계

이번 범위는 원인/구조 확인 → UI 정리 → 설치본 검증·배포의 3단계다. 최종 설치본과 공개 피드 결과는 아래에 기록한다. 기존 성능 개선 계획 6단계 중 3단계 완료 기준은 이번 UI 작업과 구분한다.

증거: `D:\GPT\Temp\shipping-ui-cleanup-216-final.log`, `D:\GPT\Temp\shipping-ui-cleanup-216-tests.log`, `D:\GPT\Temp\moaon-shipping-cleanup-216`.

## 설치본 검증

- 코드 커밋: `9a129453`.
- 빌드 폴더: `desktop/dist/distribution-20261027-151158-241`.
- 파일 165개 원본 일치 검사 PASS. app.asar SHA256 `427d5d0162bf2c2532c7c2dd06195b209746c65ae8d15738c86982ac299e3a99`.
- 설치파일 114467646 bytes, SHA256 `14123f65937539ec11e9b25f0bccca2ebf175aa2582aabe3ffc7909f4375abce`.
- Ed25519 업데이트 서명 생성 완료. Windows Authenticode는 NotSigned로, 유료 코드서명과 구분한다.
- 로컬 `D:\GPT\Apps\Moaon\releases\0.216.0` 및 바로가기/current.json 갱신 완료.
- 해당 설치 위치의 app.asar를 Electron으로 오른쪽 보조 모니터에서 실행한 격리 UI 시험 PASS. 자료와 응답은 시험 fixture이며 실제 사용자 인증 세션의 발급 처리를 실행하지 않았다. 증거: `D:\GPT\Temp\shipping-ui-cleanup-216-installed.log`.
- 사용자 앱은 작업 중 강제로 종료하지 않았다. 실제 사용 화면의 새 버전 적용은 앱 재시작 후 이루어진다.
- GitHub `moaon-stable` 0.216.0 게시 완료. 공개 피드 Ed25519 검증, 설치파일 HEAD HTTP 200, 크기·GitHub SHA256 일치 PASS. 증거: `D:\GPT\Temp\moaon-216-publish.log`, `D:\GPT\Temp\moaon-0.216.0-feed-proof.json`.
- 이번 3단계는 모두 완료, 남은 개발 단계 0개. 사용자 실제 로그인 세션의 재시작 적용은 별도 운영 확인이다.
