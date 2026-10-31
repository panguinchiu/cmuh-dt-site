"use client";

import { useState } from "react";

async function call(url: string, method: string, body: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.issues?.[0]?.message || d.error || "操作失敗");
}

/** 我的帳號：改 email（忘記密碼信收件地址）、改密碼 */
export function AccountForms({ email: initial }: { email: string }) {
  const [email, setEmail] = useState(initial);
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pw, setPw] = useState({ current: "", next: "", next2: "" });
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; t: string } | null>(null);

  return (
    <div className="grid c2" style={{ alignItems: "start" }}>
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await call("/api/me/profile", "PATCH", { email: email.trim() });
            setEmailMsg({ ok: true, t: "已更新 email。" });
          } catch (er) {
            setEmailMsg({ ok: false, t: (er as Error).message });
          }
        }}
      >
        <h3>Email</h3>
        <p className="muted small">忘記密碼時，重設連結會寄到這裡。</p>
        <label className="field">
          <span>Email</span>
          <input className="input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {emailMsg && <div className={`notice ${emailMsg.ok ? "" : "err"}`}>{emailMsg.t}</div>}
        <button className="btn primary" disabled={!email.trim()}>
          儲存 email
        </button>
      </form>
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          if (pw.next !== pw.next2) return setPwMsg({ ok: false, t: "兩次輸入的新密碼不一樣" });
          try {
            await call("/api/me/password", "POST", { current: pw.current, next: pw.next });
            setPw({ current: "", next: "", next2: "" });
            setPwMsg({ ok: true, t: "已更新密碼，下次登入請用新密碼。" });
          } catch (er) {
            setPwMsg({ ok: false, t: (er as Error).message });
          }
        }}
      >
        <h3>修改密碼</h3>
        <label className="field">
          <span>目前密碼</span>
          <input className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
        </label>
        <label className="field">
          <span>新密碼（至少 6 碼）</span>
          <input className="input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
        </label>
        <label className="field">
          <span>再輸入一次新密碼</span>
          <input className="input" type="password" autoComplete="new-password" value={pw.next2} onChange={(e) => setPw({ ...pw, next2: e.target.value })} />
        </label>
        {pwMsg && <div className={`notice ${pwMsg.ok ? "" : "err"}`}>{pwMsg.t}</div>}
        <button className="btn primary" disabled={!pw.current || pw.next.length < 6 || !pw.next2}>
          更新密碼
        </button>
      </form>
    </div>
  );
}
