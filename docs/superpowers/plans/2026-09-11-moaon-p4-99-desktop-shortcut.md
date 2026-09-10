# P4-99 — 중복 바탕화면 바로가기 수정
- 개인 바탕화면 D:/OneDrive/바탕 화면/모아온.lnk는0.85.0, 공용 C:/Users/Public/Desktop/모아온.lnk는 C 설치0.52.1을 가리키고 있었다. Windows가 두 바탕화면을 합쳐 보여주므로 개인 링크 갱신만으로 충분하지 않았다.
- 공용 구버전 링크를 D:/GPT/Apps/Moaon/shortcut-backups/2026-09-11-public-desktop/모아온.lnk로 백업하고 원본 링크만 삭제했다. 앱/사용자 자료는 삭제하지 않았다.
- 개인 바탕화면 바로가기로 실제 앱 실행. 모든 MoaonPreview 프로세스가 D:/GPT/Apps/Moaon/releases/0.85.0/MoaonPreview.exe인 것을 확인했다. 실제 창 핸들과 오른쪽 보조 모니터 배치를 확인했다.
- 설치된 app.asar 버전0.85.0/전체52파일 PASS. 앱 코드 변경이나 새 버전 생성은 없다.
- publish-local.ps1에 공용 바탕화면의 두 알려진 이름을 검사하고 정확한 C 구버전 대상에만 백업/정리하도록 추가했다. 다른 앱/대상 링크는 보존한다. PowerShell 구문 검사 PASS. 미래 버전의 실제 배포 실행은 이번에 수행하지 않았다.
