"use client";

import { useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SizeToggle } from "@/components/SizeToggle";

type P = { id: string; name: string; title: string | null; hasPassword: boolean };
type G = { id: string; name: string; users: P[] };

/**
 * 登入：學員選組別 → 選名字；講師選名字。
 * 已設定密碼 → 輸入個人密碼；第一次登入 → 輸入課程通關密碼並自行設定密碼。
 */
export function LoginFlow({ groups, instructors }: { groups: G[]; instructors: P[] }) {
  const [mode, setMode] = useState<"pick" | "student" | "instructor">("pick");
  const [group, setGroup] = useState<G | null>(null);
  const [person, setPerson] = useState<P | null>(null);
  const [setup, setSetup] = useState(false);
  const [password, setPassword] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const clear = () => {
    setPassword("");
    setPassphrase("");
    setNewPw("");
    setNewPw2("");
    setEmail("");
    setErr("");
    setInfo("");
  };
  const reset = () => {
    setMode("pick");
    setGroup(null);
    setPerson(null);
    clear();
  };
  const choose = (p: P) => {
    setPerson(p);
    setSetup(!p.hasPassword);
    clear();
  };

  const post = (url: string, body: object) =>
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!person) return;
    setErr("");
    if (setup) {
      if (newPw.length < 6) return setErr("密碼至少 6 碼");
      if (newPw !== newPw2) return setErr("兩次輸入的密碼不一樣");
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr("請填寫正確的 email（忘記密碼時會寄到這裡）");
    }
    setBusy(true);
    const r = setup
      ? await post("/api/auth/setup", { userId: person.id, passphrase, password: newPw, email: email.trim() })
      : await post("/api/auth/login", { userId: person.id, password });
    setBusy(false);
    if (r.ok) {
      location.href = "/";
      return;
    }
    const d = await r.json().catch(() => ({}));
    if (!setup && d.needsSetup) {
      setSetup(true);
      clear();
      setErr("這是你第一次登入，請輸入課程通關密碼並設定自己的密碼。");
      return;
    }
    if (setup && r.status === 409) {
      setSetup(false);
      clear();
    }
    setErr(d.issues?.[0]?.message || d.error || "登入失敗");
    setPassword("");
  };

  const forgot = async () => {
    if (!person) return;
    setErr("");
    setInfo("");
    setBusy(true);
    const r = await post("/api/auth/forgot", { userId: person.id });
    setBusy(false);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(d.error || "申請失敗");
    if (d.via === "email") setInfo(`重設密碼的信已寄到 ${d.to}，請在 30 分鐘內點信中的連結設定新密碼。沒收到請看垃圾郵件匣。`);
    else if (d.via === "setup") {
      setSetup(true);
      setInfo(d.message);
    }
    else setInfo("已通知講師。講師核准後，請回到這裡用課程通關密碼重新設定密碼。");
  };

  return (
    <div className="login-wrap">
      <div className="row" style={{ marginBottom: "calc(28px * var(--z))" }}>
        <div>
          <span className="pill">中國附醫教學部 · 不含真實病人資料</span>
          <h1 style={{ margin: "calc(14px * var(--z)) 0 0" }}>設計思考工作坊</h1>
        </div>
        <div className="spacer" />
        <SizeToggle />
        <ThemeToggle />
      </div>

      {mode === "pick" && (
        <div className="card">
          <h2>你是哪一組？</h2>
          <div className="big-choices" style={{ marginTop: "calc(14px * var(--z))" }}>
            {groups.map((g) => (
              <button key={g.id} className="btn" onClick={() => (setGroup(g), setMode("student"))}>
                {g.name}
              </button>
            ))}
          </div>
          <hr />
          <button className="btn" onClick={() => setMode("instructor")}>
            講師登入
          </button>
        </div>
      )}

      {mode !== "pick" && !person && (
        <div className="card">
          <div className="row" style={{ marginBottom: "calc(12px * var(--z))" }}>
            <h2 style={{ margin: 0 }}>{mode === "student" ? `${group?.name}：請選你的名字` : "講師：請選你的名字"}</h2>
            <div className="spacer" />
            <button className="btn sm ghost" onClick={reset}>
              返回
            </button>
          </div>
          <div className="big-choices">
            {(mode === "student" ? group?.users ?? [] : instructors).map((p) => (
              <button key={p.id} className="btn" onClick={() => choose(p)}>
                {p.name}
                {p.title ? <span className="badge accent">{p.title}</span> : null}
              </button>
            ))}
          </div>
        </div>
      )}

      {person && (
        <form className="card" onSubmit={submit}>
          <div className="row" style={{ marginBottom: "calc(12px * var(--z))" }}>
            <h2 style={{ margin: 0 }}>
              {person.name}
              <span className="muted">（{mode === "student" ? group?.name : "講師"}）</span>
            </h2>
            <div className="spacer" />
            <button type="button" className="btn sm ghost" onClick={() => (setPerson(null), clear())}>
              返回
            </button>
          </div>

          {setup ? (
            <>
              <p className="muted">第一次登入：請輸入老師公布的「設計思考課程通關密碼」，設定你自己的密碼（至少 6 碼）並留下 email，之後就用這組密碼登入。</p>
              <label className="field">
                <span>課程通關密碼</span>
                <input className="input" autoFocus autoComplete="off" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
              </label>
              <label className="field">
                <span>設定你的密碼（至少 6 碼）</span>
                <input className="input" type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
              </label>
              <label className="field">
                <span>再輸入一次密碼</span>
                <input className="input" type="password" autoComplete="new-password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} />
              </label>
              <label className="field">
                <span>你的 email（忘記密碼時會寄重設連結到這裡）</span>
                <input className="input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
            </>
          ) : (
            <label className="field">
              <span>密碼</span>
              <input className="input" type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
          )}
          {err && <div className="notice err">{err}</div>}
          {info && <div className="notice">{info}</div>}
          <button className="btn primary lg" disabled={busy || (setup ? !passphrase || !newPw || !newPw2 || !email : !password)}>
            {busy ? "處理中…" : setup ? "設定密碼並登入" : "登入"}
          </button>
          {!setup && (
            <div style={{ marginTop: "calc(14px * var(--z))" }}>
              <button type="button" className="btn ghost" disabled={busy} onClick={() => void forgot()}>
                忘記密碼
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
