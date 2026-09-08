# P4-32 앱 전용 주문 작업실 재구성

## Global Constraints

사용자 승인 시안 docs/superpowers/designs/studio-v3/index.html 및 첨부 비교 화면이 디자인 기준. 기존 웹 UI 배치와 긴 제목은 가져오지 않는다. Pretendard 유지, 84px rail, compact app chrome, 28px 주문 작업실 title, lavender selected rows, dark inspector, 상품 이미지와 채널/상태/사은품 badges. 데이터·API·보안·주문·발급·인쇄 로직은 유지. 미확인값은 0으로 꾸미지 않음. 운영 송장 발급/인쇄는 테스트하지 않음. 기존 숨겨진 중요 경고는 실행 전 다시 명확히 표시. 모바일 앱 범위 제외.

## Task 1: 화면 구조와 UI 연결

desktop/ui/index.html 및 app.js 소유. 주문 heading을 주문 작업실로 단순화. 탭 아래 한 줄 tools, 추가 필터 disclosure, table column heading, 간결한 상세 상품/금액/수취 정보 후 추가 정보 disclosure. 기존 버튼 id/action과 안전장치 유지. selection toolbar 1건 선택/내용 확인/선택 해제 구현(대량 처리로 오인 금지). 실제 결과 표시만, 가짜 성공 금지. source test 먼저 실행 RED 후 GREEN. CSS는 root가 담당. Tests own new desktop/test/app-workspace-smoke.cjs. 보고서 .superpowers/p432-task1-report.md.

## Task 2: 스타일과 패키지 통합

root 담당. studio.css를 시안 기준 단일 coherent app stylesheet로 재구성. 기존 styles.css 기능 selectors 유지하면서 orders 화면 집중 재배치. 1040/1440 px, light/dark, focus/reduced motion, horizontal overflow 검증. 준비된 0.21.0 패키지 설치.

## Task 3: 시각 및 기능 검수

독립 reviewer가 base f90fcc7 이후 diff와 스크린샷 대조. 기존 데이터·발급·라벨·검색·목록 이동 손실 점검. 보고서 및 전체 계획 갱신. 남은 불일치는 명시. 실제 안전한 저장 주문 조회만 수행.
