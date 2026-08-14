import Link from 'next/link';

export default function NotFound() {
  return <main className="routeError">
    <div className="routeErrorMark">?</div>
    <h1>찾을 수 없는 화면이에요</h1>
    <p>주소가 바뀌었거나 더 이상 사용하지 않는 메뉴입니다.</p>
    <Link href="/">메인으로 돌아가기</Link>
  </main>;
}
