# P1-04-16 ingress regression and activation readiness

Continuation of the approved account integration gates and P1-04-15 deferred regression finding. This is a verification increment, not a new user-facing authentication feature. Base 4300cb4.

## Global Constraints

기존 로그인·UI·업무 API·SQL·환경 설정을 변경하지 않는다. 공개 인증 경로를 추가하지 않는다. 비밀값·개인정보 조회/출력, 운영 자료 복사, 유료 자원 생성, 실계정 인증은 하지 않는다.

### Task 1: Close ignored-header regression coverage

Only edit test/tenant-vercel-auth-request-admission.test.js. Under the existing valid Vercel production environment helper, test requests with each of Forwarded, CF-Connecting-IP, True-Client-IP, X-Client-IP, Host and x-vercel-id individually and all combined, with neither required IP header. Every attempt must throw a fresh safe AuthIngressError and perform zero RPC calls. Also verify valid required IP headers continue to use the expected canonical IP quota hash even when all ignored headers contain contradictory values; reuse existing fixtures/hash assertion patterns. Exercise real createVercelAuthRequestAdmission, not a mock implementation. Restore environment and avoid network. Production source must not change. This adds regression coverage to already-correct behavior, so report initial GREEN honestly, not fabricated RED.

Run focused test plus tenant-auth-request-admission.test.js, tenant-auth-client-ip.test.js, tenant-session-logout-request.test.js; self-review, syntax/diff check, commit only test file. Parent runs full suite and read-only readiness audit, owns docs. No subagents. Report exact command/results and limitations in task-1-report.md.

## Parent work

Verify existing isolated workspace and baseline. Read actual public authentication wiring and provider configuration names without loading secrets. Identify which live gates cannot be proven from current routes. Document blockers and exact next required action rather than add a public IP echo endpoint or falsely claim activation. Task review and final review, full suite, Git release with existing application version (test/docs only), verify READY and protected route responses. No version bump for test-only readiness increment.
