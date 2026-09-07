# GA4 자사몰 구매·환불 측정 운영 안내

## 무엇을 측정하나요?

GA4는 공식몰 방문자가 상품을 보고, 장바구니와 결제를 거쳐 구매하거나 환불한 흐름을 분석합니다. Cafe24 주문·배송·정산 자료를 가져오는 기능과는 별개입니다. 허브의 GA4 화면은 Google Analytics Data API의 저장된 관측값만 읽으며 Cafe24 주문 합계나 정산액을 대체하지 않습니다.

`GA4 속성 ID`는 분석 공간의 숫자 식별자입니다. Cafe24 쇼핑몰 ID도, `G-`로 시작하는 웹 데이터 스트림의 측정 ID도 아닙니다. Google Analytics의 **관리 → 속성 설정 → 속성 ID**에서 숫자 값을 확인합니다.

허브에 GA4 설정이 없더라도 공식몰에 Google 태그가 없다고 단정할 수 없습니다. 반대로 Data API에서 이벤트가 보여도 구매·환불 태그가 정확하다고 단정할 수 없습니다. 실제 태그 검증 상태는 항상 `VERIFY_REQUIRED`입니다.

## 준비 사항

1. 공식몰에 연결된 GA4 속성과 숫자 속성 ID를 확인합니다.
2. Google Cloud 프로젝트에서 Google Analytics Data API v1을 활성화합니다.
3. 읽기용 서비스 계정을 준비합니다.
4. Google Analytics의 **관리 → 속성 액세스 관리**에서 서비스 계정 이메일을 사용자로 추가하고 `Viewer` 역할을 부여합니다. Viewer는 설정과 자료를 UI 및 API에서 볼 수 있으며 속성 설정을 수정할 수 없습니다.
5. `HUB_OWNED_SITE_URL`에 공식몰의 정확한 HTTPS 원본 주소를 정합니다. 이 호스트만 허브 보고 범위에 포함됩니다.

## 서버 환경 변수

다음 값은 로컬 브라우저나 입력 폼이 아닌 비공개 서버 환경 변수에 넣습니다.

| 이름 | 값 | 비밀 여부 |
| --- | --- | --- |
| `HUB_OWNED_SITE_URL` | 공식몰의 정확한 HTTPS 원본 주소 | 아니요 |
| `GOOGLE_GA4_PROPERTY_ID` | 숫자로만 된 GA4 속성 ID | 아니요 |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Viewer 역할을 받은 서비스 계정 이메일 | 아니요 |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | 서비스 계정 비밀키 전체 | 예 |

`GOOGLE_GA4_ENABLED=false`는 GA4 읽기와 예약 작업을 잠급니다. 값을 생략하거나 `true`로 두어도 위 필수 항목이 빠지면 화면은 `SETUP_REQUIRED`를 유지합니다.

Vercel에서는 프로젝트의 Environment Variables에 값을 개별 등록합니다. 비밀키를 클라이언트 변수나 저장소에 넣지 마세요. 환경 변수를 바꾼 뒤 새 배포를 만들어 서버 런타임에 반영합니다.

## 허브에서 확인하는 순서

1. 운영 배포에 로그인한 뒤 **시스템 → 받는 자료 → 자사몰 구매·환불 측정**을 엽니다.
2. 첫 화면의 GET은 저장된 상태만 읽습니다. Google에 새 조회를 요청하지 않습니다.
3. `SETUP_REQUIRED`면 화면에 나온 누락 항목을 서버 환경 변수와 대조합니다.
4. 설정이 준비되면 `GA4 자료 새로 확인`을 한 번 누릅니다. 이 POST만 Google 읽기와 결과 저장을 요청합니다.
5. `IN_FLIGHT`면 다른 읽기 작업이 진행 중입니다. `저장 상태 다시 확인`은 GET으로 저장 상태만 다시 읽으며 Google을 호출하지 않습니다.
6. `FAILED` 또는 `STALE`에서도 이전 성공 보고서가 있으면 그대로 표시됩니다. 실패 시각과 이전 성공 시각을 함께 확인합니다.

매일 05:30(한국시간)은 예약 시각입니다. 화면에 `SCHEDULED`가 보이더라도 해당 실행의 성공을 뜻하지 않습니다. 최근 시도와 최근 성공 시각으로 결과를 확인합니다.

## 실제 태그 검증

Data API 보고서와 별도로 다음 수동 검증을 수행합니다.

1. Google Analytics에서 해당 속성의 **관리 → 데이터 표시 → DebugView**를 엽니다.
2. Tag Assistant 또는 미리보기 모드로 개인 검증 기기의 디버그 모드를 켭니다.
3. 공식몰에서 테스트 상품 조회, 장바구니, 결제 시작을 차례로 수행합니다.
4. 승인된 테스트 주문으로 `purchase` 이벤트를 확인합니다. `transaction_id`, 통화, 값, 상품 항목이 테스트 주문과 일치하는지 확인합니다.
5. 같은 테스트 주문의 승인된 환불 절차로 `refund` 이벤트를 확인합니다. 전체 또는 부분 환불 금액과 원래 `transaction_id`의 연결을 확인합니다.
6. DebugView, 실시간 보고서, 다음 날의 일반 보고서를 각각 확인합니다. 일반 보고서와 탐색 보고서는 반영까지 최대 24시간이 걸릴 수 있습니다.

동의 관리가 분석 쿠키를 허용하지 않으면 DebugView에도 이벤트가 나타나지 않을 수 있습니다. 동의 상태를 우회하지 말고 테스트 기기에서 허용 상태와 거부 상태를 구분해 기록합니다.

## 개인정보와 범위 제한

- 이벤트 이름, 캠페인명, 검색어, `transaction_id`, `item_id`에 이름, 전화번호, 이메일, 주소 같은 개인정보를 넣지 않습니다.
- 허브는 집계값과 중복·누락 진단 수만 표시합니다. 원본 거래 식별자는 화면에 표시하지 않습니다.
- `HUB_OWNED_SITE_URL`의 호스트만 필터링합니다. 외부 결제창이나 다른 체크아웃 도메인까지 연결된 전체 퍼널이라고 주장하지 않습니다.
- 네이버, 쿠팡, Cafe24 내부 퍼널이나 정산 성과를 GA4 자사몰 퍼널로 합치지 않습니다.
- GA4 기록 구매액·환불액은 분석 이벤트 값입니다. 회계 매출, Cafe24 주문 합계, 실제 정산액으로 사용하지 않습니다.

## 상태 해석

| 상태 | 뜻 | 다음 확인 |
| --- | --- | --- |
| `LOCKED` | 서버 안전 스위치가 읽기를 잠금 | `GOOGLE_GA4_ENABLED` 운영 정책 확인 |
| `SETUP_REQUIRED` | 필수 서버 설정이 빠짐 | 화면의 누락 변수 이름 확인 |
| `VERIFY_REQUIRED` | 설정은 있으나 저장된 관측 결과가 없음 | 수동 읽기 후 DebugView 검증 |
| `IN_FLIGHT` | 다른 읽기 작업이 진행 중 | GET으로 저장 상태 다시 확인 |
| `OBSERVED` | 선택 범위에서 이벤트 관측 | 태그 정확성은 DebugView에서 별도 확인 |
| `NO_DATA` | 선택 범위에서 관측 행이 없음 | 태그, 동의, 날짜, 호스트 확인 |
| `PARTIAL` | 일부 응답이나 식별자 진단이 불완전 | 범위 진단과 응답 메모 확인 |
| `STALE` | 최근 성공 자료가 26시간보다 오래됨 | 수동 갱신과 예약 작업 이력 확인 |
| `FAILED` | 최근 읽기 또는 저장 실패 | 안전 오류 문구와 이전 성공 시각 확인 |

## Google 공식 문서

- [Google Analytics Data API 빠른 시작](https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart)
- [숫자 GA4 속성 ID 확인](https://developers.google.com/analytics/devguides/reporting/data/v1/property-id)
- [Google Analytics 역할과 Viewer 권한](https://support.google.com/analytics/answer/9305587)
- [Google Analytics 사용자 추가](https://support.google.com/analytics/answer/9305788)
- [권장 전자상거래 이벤트](https://support.google.com/analytics/answer/9267735)
- [전자상거래 이벤트 설정과 보고 지연](https://support.google.com/analytics/answer/12200568)
- [DebugView로 이벤트 확인](https://support.google.com/analytics/answer/7201382)
