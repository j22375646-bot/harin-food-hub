'use client';

export default function GlobalError({reset}) {
  return <html lang="ko"><body><main className="routeError" role="alert">
    <div className="routeErrorMark">!</div>
    <h1>허브를 다시 불러와 주세요</h1>
    <p>화면을 여는 중 문제가 생겼습니다. 저장된 운영 자료에는 영향을 주지 않습니다.</p>
    <button type="button" onClick={reset}>허브 다시 열기</button>
  </main></body></html>;
}
