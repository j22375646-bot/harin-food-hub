# 하린식품 허브 운영 릴리스 절차

모든 운영 배포는 소스, 버전, 변경 이력, 실제 운영 확인을 한 묶음으로 남깁니다.

1. `package.json`의 버전을 올립니다.
2. `CHANGELOG.md` 맨 위에 같은 버전과 변경 내용을 기록합니다.
3. 전체 테스트와 빌드를 통과시킵니다.
4. 변경 파일을 의도적으로 커밋하고 `main` 브랜치에 푸시합니다.
5. 아래처럼 해당 커밋에 주석 태그를 만들고 푸시합니다.

```powershell
$VERSION = (Get-Content package.json | ConvertFrom-Json).version
git tag -a v$VERSION -m "Harin Food Hub v$VERSION"
git push origin main
git push origin v$VERSION
```

6. Vercel 운영 배포가 `READY`인지 확인합니다.
7. 고정 주소 `https://harin-cafe24-sync.vercel.app/`에서 로그인, 주문, 데이터수집, 주요 API 오류를 확인합니다.
8. AWS 고정 IP 워커가 포함된 변경이면 서비스를 재시작하고 `active` 상태와 최근 오류 로그를 확인합니다.

## 복구 기준

- 화면 문제: 직전 Git 태그로 새 배포를 만들거나 Vercel 직전 정상 배포를 승격합니다.
- 워커 문제: 변경 전 백업 파일을 복원하고 서비스를 재시작합니다.
- 데이터 쓰기 문제: 실패 요청은 성공으로 표시하지 않고 재시도 목록에 유지합니다.
