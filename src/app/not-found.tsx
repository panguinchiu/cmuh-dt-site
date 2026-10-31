import Link from "next/link";

export default function NotFound() {
  return (
    <div className="login-wrap">
      <h1>找不到這個頁面</h1>
      <p className="muted">可能不存在，或你沒有權限查看。</p>
      <Link className="btn" href="/">
        回首頁
      </Link>
    </div>
  );
}
