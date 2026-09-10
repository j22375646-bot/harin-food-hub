# P4-92 — 분석·정산 재방문 / 0.80.0

## 변경과 측정
- 두 화면의 ensure에서 중복 render를 제거했다. 초기 조회/필터/새 응답/clear가 직접 렌더링하며,5분 경과 재조회 조건과 busy 잠금은 유지한다.
- 정산에서 펼친 비용 내역과 분석 상세 DOM을 재방문 시 보존한다.
- 가상 자료20회 설정↔대상 왕복,showRoute 동기 처리 측정. 분석 중앙값1.7→1.5ms,p95 2.6→1.7ms. 정산 중앙값2.9→2.3ms,p95 5.1→3.5ms. 목록 교체는 두 화면20→0회.
- 단일 PC/시험 실행의 수치이며 변동 가능하다. 서버 응답 시간/화면 완전 표시 시간 측정은 아니다. 시간 임계값 대신 DOM 동일성/교체0회를 검증한다.

## 검증
- 소스 두 화면 PASS. 기존 비교값0/미확인/부분값/음수,검색,상세/닫기/초점,전환 애니메이션,좁은 폭/라이트·다크,오류/로그아웃 회귀를 유지한다.
- MOAON_EXPECT_REUSE=1에서 목록 재사용·정산 비용 펼침·분석 상세 DOM을 검증한다.
- renderer 시계를300001ms 앞으로 이동하여 ensure를2번 호출한 뒤 신규 요청1회를 확인하고 시계를 복원한다. 실제5분 대기를 생략한 시험이며 자동 백그라운드 조회를 새로 추가한 것은 아니다.
- 오른쪽 보조 모니터의 비포커스 Electron과 가상 네트워크 응답이다. 실자료 입금/보고서 대조는 아니다.
- 로그 D:/GPT/tmp/p492-insights-before.log,p492-settlement-before.log,p492-insights-after.log,p492-settlement-after.log.

## 최종 결과
- 코드18개/소스·패키지 두 화면 PASS.5분 경과 요청1회 및 조회 오류/로그아웃 비움 포함.
- 52파일/버전/의존성 PASS. SHA256 4760cffb0babd3a980816b0c15e7f77358a32bebcc816190878ac074992e22c5.
- 로그 D:/GPT/tmp/p492-tests.log,p492-insights-package.log,p492-settlement-package.log,p492-package-verification.json. 최종 정산 화면 캡처 직접 확인.
- D:/GPT/Apps/Moaon/releases/0.80.0 배치·복사 후 검사·D:/OneDrive/바탕 화면/모아온.lnk 갱신 완료. 현재/이전/실행 중 관리형 버전 보존,사용자 앱 강제 종료 없음. 로그 p492-local-publish.log.
- 외부 자동 업데이트 주소/서명은 기존 미설정 상태다.
