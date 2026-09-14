# P4-166 고정 AI 대화 버튼과 실제 연결 복구

데스크톱 0.147.4 / 서버 1.64.1. 분석 페이지 오른쪽 아래에 고정된 AI와 대화 버튼을 추가했다. 클릭하면 우측 대화창을 열고, 닫은 뒤에도 버튼이 남는다. 화면 너비에 따라 패널 폭과 높이를 조절하며 기존 보고서 선택, 대화 이력, 근거 검증, 취소 동작을 유지한다. 네이버 내부 광고 분석은 CLOVA, 공개 추이 해석은 Gemini로 분리한다.

## 실제 오류와 수정

- 인증 문맥 조회가 원거리 배포에서 약 7.35초씩 걸려 반복 검증 후 요청이 만료됐다. 연결 설정과 두 AI 경로를 Supabase와 같은 싱가포르 리전에 배치한 뒤 약 250~300ms로 확인했다.
- 설정 메타데이터의 계산된 require 경로가 운영 번들에서 실패했다. 정적 모듈 참조로 바꿔 저장된 두 키가 READY임을 실제 앱에서 확인했다.
- CLOVA HCX-007 구조화 응답은 thinking effort none이 필요했다. 해당 설정과 카드별 근거 참조 지시를 추가했다. 숫자·근거 검증은 유지한다.
- Gemini 2.5 Flash-Lite는 실제 신규 계정 요청에 404를 반환했다. 공식 무료 등급 지원 모델 gemini-3.5-flash-lite, thinkingLevel minimal로 변경했다. 응답의 thoughtSignature 메타데이터를 허용하되 UI나 저장 결과에는 전달하지 않는다. 무료 프로젝트 확인 및 일일 요청 제한을 유지한다.

## 검증

- 실제 사용자 로그인 세션, 설치 ASAR 0.147.4에서 고정 버튼 열기/닫기/재열기 모두 확인했다. 기존 사용자 세션은 유지했다.
- CLOVA: 실제 네이버 주간 보고서 질문 응답 및 저장 성공. 재시작한 최신 설치본에서 같은 질문의 저장된 응답 재사용을 확인했다.
- Gemini: 실제 작두콩차 최근 30일 공개 추이 해석 성공. 서버 근거 검증과 저장 통과, 설치본에 지표와 해석 표시 확인. DB에 각 제공자 성공 결과 한 건씩 저장됨을 확인했다.
- 데스크톱 단위 시험 451/451. 서버 전체 2997개 중 2996 통과, 변경 이력 버전 누락 1개 수정 후 해당 시험 포함 관련 18/18 통과. 신규 Gemini 메타데이터 회귀 시험 포함.
- 설치본 격리 Electron UI 시험: 분석 대화와 공개 추이 각각 PASS. 700/1040/1440px 라이트·다크, 고정 버튼과 패널 겹침 없음, 사용자 포커스 침범 없음. 이 시험은 가상자료이며 위 실제 연결 결과와 구분한다.
- 설치 ASAR 114개 소스 파일 일치. SHA256 549a7a2061b1a447d8e9dc228a2685f61bccc992e0dfefdbaeb8e1fea3759e37.

## 배포

운영 Vercel dpl_2W9sB9VeFEHcqvEozDwjmkSZqZBc READY. distribution-20260915-004625-918을 Ed25519 검증 후 moaon-stable에 게시했다. 설치 D:/GPT/Apps/Moaon/releases/0.147.4와 바탕화면·시작메뉴·작업표시줄 바로가기, current.json을 갱신했다. 실패한 과거 요청의 불확실 사용량 예약은 임의 초기화하지 않았다.

공식 참고: https://api.ncloud-docs.com/docs/clovastudio-chatcompletionsv3-so , https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite , https://ai.google.dev/gemini-api/docs/pricing , https://ai.google.dev/gemini-api/docs/generate-content/thinking
