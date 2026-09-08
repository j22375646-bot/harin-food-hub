# 운영 연결 선행 점검 — P4-08 후속

새 기능 완료 단계가 아니라 실제 접속 경로 점검이다.

## 확인한 증거

- 연결된 Vercel 프로젝트 harin-cafe24-sync의 production 환경 변수 목록 조회 성공. MOAON_CONTROL_DB_HOST/PORT/NAME/PASSWORD 없음. 기존 비밀 변수는 Hidden 표시이며 비밀값을 가져오거나 변경하지 않았다.
- db.llnlphdmcmwgjnpndaam.supabase.co DNS: IPv4 A 응답 없음, IPv6 AAAA 응답 있음.
- 개발 PC Node 호스트 접속은 ENOTFOUND. 조회한 IPv6 주소로 직접 TCP 5432 연결은 ENETUNREACH. 인증 이전의 네트워크 실패이며 비밀번호 오류가 아니다.
- 이 결과는 개발 PC 기준이며 Vercel 런타임 네트워크를 직접 시험한 결과가 아니다.

## 다음 구현 경로

Supabase 공식 문서는 IPv4 전용 환경에서 shared session pooler를 직접 연결 대안으로 제시한다. 기존 adapter는 실제 session_user/current_user 고정 역할 및 DISCARD ALL 등 세션 보장을 전제로 한다. 따라서 transaction pooler로 단순 주소 치환하지 않는다. 프로젝트 Connect 화면의 실제 session pooler 주소 확인, 접속 사용자 접미사와 서버의 실제 역할 구분, 세션 초기화/트랜잭션/SSL 시험이 필요하다.

현재 P4-08 설정은 직접 연결 사용자만 지원한다. 환경 값만 채우면 모든 환경에서 연결된다는 의미가 아니다. 자격 증명을 생성하기 전에 지원 경로를 확정한다. 추가 유료 IPv4 옵션은 신청하지 않았다.

참고: https://supabase.com/docs/guides/database/connecting-to-postgres

운영 역할/비밀번호/환경 변수/데이터 변경, 웹 및 EXE 배포 없음. 기존 서비스 중단 없음. 테스트 재실행 없음(코드 변경 없음).

[전체 개발계획](./2026-09-07-multi-business-desktop-master-plan.md)
