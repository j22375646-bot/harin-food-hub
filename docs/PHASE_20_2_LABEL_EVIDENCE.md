# Phase 20-2 · 상품별 표시정보 교차검증

## 목적

선택 상품의 품목제조보고, 국내 영양성분, HACCP 제조업소·식품유형 지정, 원재료 사용조건, 해외 비교값을 역할별로 분리해 확인한다. 공식 DB 결과도 실제 포장과 사장님 확인 전에는 제품의 확정 표시정보로 사용하지 않는다.

## 공급자 경계

| 공급자 | 확인 범위 | 확정하지 않는 것 |
|---|---|---|
| 식약처 식품영양성분 DB | 품목보고번호, 제공량, 주요 영양성분 | 현재 포장 라벨과의 최종 일치 |
| 식품안전나라 HACCP I0580 | 제조업소·식품유형 지정상태 | 개별 판매상품의 HACCP 인증 |
| 식품안전나라 원재료 I1020 | 원재료명, 학명, 분류, 사용조건 | 선택 상품의 실제 배합과 함량 |
| USDA FoodData Central | 해외 식품 영양성분 비교 | 국내 제품 표시값과 표시 적합성 |

## 운영 흐름

1. 기준상품 프로젝트 자료실에서 `표시정보 교차검증`을 연다.
2. 19-2에서 저장한 품목제조보고번호·영업 인허가번호·원재료 문구가 있으면 기본값으로 불러온다.
3. 필요한 공급자만 선택하고 `표시정보 교차 확인`을 누른다.
4. 공급자별 결과와 공식 원문을 비교한다.
5. 관련 후보만 상품 전용 자료실에 `PROXY · OWNER_CONFIRMATION_REQUIRED`로 저장한다.
6. 실제 포장 사진·OCR과 대조한 뒤 사장님이 확정한다.

## 안전 기준

- 화면 GET 요청은 외부 공급자를 호출하지 않는다.
- 네 공급자의 읽기와 오류를 `Promise.allSettled`로 격리한다.
- `NO_DATA`를 영양성분 0, 미인증, 표시 불필요로 변환하지 않는다.
- 알레르기 후보 스캔은 실제 표시 검수용 체크리스트이며 부재 증명이 아니다.
- 고객 이름, 연락처, 주소, 주문정보를 공급자에 전송하지 않는다.
- 후보 URL은 `data.go.kr`, `foodsafetykorea.go.kr`, `fdc.nal.usda.gov`만 허용한다.
- API 키와 후보 서명값은 서버 전용이며 `NEXT_PUBLIC_` 환경변수를 사용하지 않는다.

## 유예 키

- `DATA_GO_KR_SERVICE_KEY`
- `FOOD_SAFETY_KOREA_API_KEY`
- `USDA_FDC_API_KEY`

세 키는 Phase 18~21 완료 후 다른 유예 키와 함께 운영 환경에 입력한다. 입력 전 공급자는 성공으로 표시하지 않고 `SETUP_REQUIRED` 상태를 유지한다.

## 공식 출처

- 식약처 식품영양성분 DB: https://www.data.go.kr/data/15127578/openapi.do
- 식품안전나라 HACCP 적용업소 지정 현황: https://www.data.go.kr/data/15098712/openapi.do
- 식품안전나라 OpenAPI: https://www.foodsafetykorea.go.kr/api/openApiInfo.do
- USDA FoodData Central API: https://fdc.nal.usda.gov/api-guide/
