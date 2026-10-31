"use client";

import Link from "next/link";
import { useState } from "react";
import { SizeToggle } from "@/components/SizeToggle";
import { ThemeToggle } from "@/components/ThemeToggle";

/** 忘記密碼信中的連結：設定新密碼 */
export function ResetForm({ token }: { token: string }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (pw.length < 6) return setErr("密碼至少 6 碼");
    if (pw !== pw2) return setErr("兩次輸入的密碼不一樣");
    setBusy(true);
    const r = await fetch("/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password: pw }) });
    setBusy(false);
    if (r.ok) {
      location.href = "/";
      return;
    }
    const d = await r.json().catch(() => ({}));
    setErr(d.issues?.[0]?.message || d.error || "設定失敗");
  };

  return (
    <div className="login-wrap">
      <div className="row" style={{ marginBottom: "calc(28px * var(--z))" }}>
        <div>
          <div className="kicker">CMUH · Department of Medical Education</div>
          <h1 style={{ marginBottom: 0 }}>重設密碼</h1>
        </div>
        <div className="spacer" />
        <SizeToggle />
        <ThemeToggle />
      </div>
      {!token ? (
        <div className="card">
          <p>連結不完整，請從信中的連結重新開啟，或回登入頁重新申請忘記密碼。</p>
          <Link className="btn" href="/login">
            回登入頁
          </Link>
        </div>
      ) : (
        <form className="card" onSubmit={submit}>
          <label className="field">
            <span>新密碼（至少 6 碼）</span>
            <input className="input" type="password" autoFocus autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </label>
          <label className="field">
            <span>再輸入一次</span>
            <input className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </label>
          {err && <div className="notice err">{err}</div>}
          <div className="row">
            <button className="btn primary lg" disabled={busy || !pw || !pw2}>
              {busy ? "處理中…" : "設定新密碼並登入"}
            </button>
            <Link className="btn ghost" href="/login">
              回登入頁
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
