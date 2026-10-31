"use client";

import { useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SizeToggle } from "@/components/SizeToggle";

type P = { id: string; name: string; title: string | null };
type G = { id: string; name: string; users: P[] };

export function LoginFlow({ groups, instructors }: { groups: G[]; instructors: P[] }) {
  const [mode, setMode] = useState<"pick" | "student" | "instructor">("pick");
  const [group, setGroup] = useState<G | null>(null);
  const [person, setPerson] = useState<P | null>(null);
  const [secret, setSecret] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setMode("pick");
    setGroup(null);
    setPerson(null);
    setSecret("");
    setErr("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!person) return;
    setBusy(true);
    setErr("");
    const body =
      mode === "student"
        ? { kind: "student", userId: person.id, code: secret }
        : { kind: "instructor", userId: person.id, password: secret };
    const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (r.ok) {
      location.href = "/";
      return;
    }
    const d = await r.json().catch(() => ({}));
    setErr(d.error || "登入失敗");
    setSecret("");
  };

  return (
    <div className="login-wrap">
      <div className="row" style={{ marginBottom: "calc(28px * var(--z))" }}>
        <div>
          <div className="kicker">CMUH · Department of Medical Education</div>
          <h1 style={{ marginBottom: 0 }}>設計思考工作坊</h1>
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
              <button key={p.id} className="btn" onClick={() => setPerson(p)}>
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
              {mode === "student" ? <span className="muted">（{group?.name}）</span> : <span className="muted">（講師）</span>}
            </h2>
            <div className="spacer" />
            <button type="button" className="btn sm ghost" onClick={() => (setPerson(null), setSecret(""), setErr(""))}>
              返回
            </button>
          </div>
          {mode === "student" ? (
            <label className="field">
              <span>請輸入本組 4 位數字組別代碼</span>
              <input
                className="input code-input"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                autoFocus
                autoComplete="off"
                value={secret}
                onChange={(e) => setSecret(e.target.value.replace(/\D/g, "").slice(0, 4))}
              />
            </label>
          ) : (
            <label className="field">
              <span>密碼</span>
              <input
                className="input"
                type="password"
                autoFocus
                autoComplete="current-password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
              />
            </label>
          )}
          {err && <div className="notice err">{err}</div>}
          <button className="btn primary lg" disabled={busy || (mode === "student" ? secret.length !== 4 : !secret)}>
            {busy ? "登入中…" : "登入"}
          </button>
        </form>
      )}
    </div>
  );
}
