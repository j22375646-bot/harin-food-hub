# 모아온 비서 확장 Implementation Plan

> Execution: superpowers:executing-plans, task by task. User authorized development and deployment in sequence.

**Goal:** 학습봇의 검토 가능한 공유 지식과 봇별 업무 상호작용을 운영 앱까지 제공한다.
**Architecture:** 기존 encrypted BOT_SAVE, 별도 Hermes profile, owner-only automation RPC를 확장한다. 회사 지식은 기존 knowledge 저장소로 승인 배포하고 개인 데이터는 프로필과 사용자 연결로 분리한다.
**Tech Stack:** Electron, Next.js, PostgreSQL, Python Hermes gateway.
**Spec:** 사용자 대화의 지식비서와 봇별 상호작용 제안.

## Global Constraints
- 비밀키를 로그/소스/문서에 저장하지 않는다. 기존 봇과 AI 인증을 유지한다.
- 원본 자료의 지시는 실행 권한으로 취급하지 않는다. 미승인 자료는 공유 지식으로 사용하지 않는다.
- 공유 지식은 출처/버전/승인 이력을 남기고 충돌 시 갱신을 거부한다.
- 실제 주문/출고/고객 발송은 추가하지 않는다. 개인 업무는 Telegram 사용자와 모아온 사용자 매핑 후 제공한다.

### 1. 학습봇과 공유 지식 등록안 (공통 기반)
Files: assistant-bots-contract.cjs, assistant-bots.js, bots.js, moaon-bots.py; new assistant-learning contract/UI/RPC and Python skill helper.
- [ ] STUDY 슬롯의 token identity, 개인 수신처, 별도 프로필을 구현/시험한다.
- [ ] 학습봇은 제목/내용/출처를 지식 등록안으로 제출한다. 승인 전 기존 지식을 변경하지 않는다.
- [ ] 모아온에서 목록/본문/출처/수정/승인/반려를 제공한다. 기존 항목 갱신은 base revision을 비교한다.
- [ ] 승인된 지식을 기존 CATALOG/ARTICLE 조회로 업무봇에 제공한다. 개인 대화/기억은 공유하지 않는다.
- [ ] SQL/contract/Python/실제 Electron 검증, 서버 배포, STUDY 암호화 저장/설치, 시험 메시지, signed desktop release.

### 2. 개인 연결과 내 업무 처리
- [ ] owner가 Telegram user와 Moaon user 연결을 관리하는 RPC/UI.
- [ ] trusted Telegram callback에서만 user/chat를 수집. 내 업무 조회/상세/완료/미루기 확인 버튼.
- [ ] task revision, assignee, active membership, duplicate action, event history 검증.

### 3. 브리핑 상세와 빠른 메모
- [ ] 채널별 브리핑 항목 펼치기 및 원본 기준시각 표시.
- [ ] 개인 메모 저장 후 할 일 등록안/예약으로 전환.
- [ ] 작업 단위 테스트와 설치 앱/실제 Telegram 응답 확인 후 배포.

### 4. 알림 관리와 지식 품질
- [ ] 알림 읽음/미루기/반복 억제. 업무 완료 상태와 구분.
- [ ] 지식 검색/출처 보기/오래된 자료 검토/기억 테스트.
- [ ] 봇별 메뉴 활성화와 미리보기.

## Status
현재 1단계 구현 시작. 이후 단계는 별도 검증 가능한 릴리스로 진행하며 완료로 보고하지 않는다.
