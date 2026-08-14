'use client';

export default function ErrorPage({error,reset}) {
  return <main className="routeError" role="alert">
    <div className="routeErrorMark">!</div>
    <h1>이 화면만 잠시 열리지 않아요</h1>
    <p>다른 메뉴는 그대로 사용할 수 있습니다. 잠시 후 다시 시도해 주세요.</p>
    {error?.digest&&<small>오류 번호 {error.digest}</small>}
    <button type="button" onClick={reset}>다시 불러오기</button>
  </main>;
}
