# 작업폴더 인계 기준

## 기준 폴더

`C:\Users\a\OneDrive\사진\문서\ChatGPT\하린식품 허브 개발`

이 폴더와 연결된 GitHub 저장소를 모든 후속 개발의 기준으로 사용한다. 기능 추가·수정·삭제 후에는 빌드 검증, 커밋, 푸시까지 완료하여 다른 작업에서도 같은 최신 소스를 사용할 수 있게 한다.

## 운영 구성

- 프런트/서버: Next.js 16 App Router
- 배포: Vercel `harin-cafe24-sync`
- DB: Supabase
- 플랫폼: Cafe24, 네이버 검색광고, 쿠팡 WING/로켓그로스
- 운영 URL: https://harin-cafe24-sync.vercel.app/

## 비밀정보 규칙

- `.env*`는 Git에서 제외한다. 단, 빈 예시 파일 `.env.example`은 포함한다.
- `SUPABASE_SERVICE_ROLE_KEY`, 플랫폼 API Secret, OAuth Token은 서버 환경변수로만 사용한다.
- 화면 코드와 `NEXT_PUBLIC_` 환경변수에 서버 비밀키를 넣지 않는다.

## 쿠팡 수집 규칙

- 자동 전체수집은 집 PC에서 매일 오전 8시 10분 한 번만 실행한다.
- 5분 간격 워커는 허브의 수동 요청을 확인하는 역할만 하며, 요청이 없을 때 쿠팡 API를 호출하지 않는다.
- 로컬 예약작업은 PowerShell 숨김 창으로 실행하여 콘솔창을 띄우지 않는다.
- 수동 버튼은 `/api/coupang/sync`에 요청을 저장하고 집 PC 워커가 최대 5분 안에 처리한다.
