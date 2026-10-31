"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useWsEvent } from "./ws";

type G = { id: string; name: string };
type Person = { id: string; name: string; title: string | null; groupId: string | null; active: boolean; email: string | null; hasPassword: boolean; resetRequested: boolean };
type I = { id: string; name: string; isMe: boolean; email: string | null; hasPassword: boolean; resetRequested: boolean };

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.issues?.[0]?.message ? `${d.error}：${d.issues[0].message}` : d.error || "操作失敗");
  return d;
}

function PwStatus({ p }: { p: { hasPassword: boolean; resetRequested: boolean } }) {
  if (p.resetRequested) return <span className="badge warn">申請重設中</span>;
  return p.hasPassword ? <span className="badge accent">已設定密碼</span> : <span className="badge">尚未登入過</span>;
}

function StudentRow({ s, groups, onErr, onReset }: { s: Person; groups: G[]; onErr: (m: string) => void; onReset: (id: string, name: string) => void }) {
  const router = useRouter();
  const [name, setName] = useState(s.name);
  const [title, setTitle] = useState(s.title ?? "");
  const [email, setEmail] = useState(s.email ?? "");
  const dirty = name.trim() !== s.name || title.trim() !== (s.title ?? "") || email.trim() !== (s.email ?? "");
  const patch = async (b: object) => {
    onErr("");
    try {
      await call(`/api/admin/students/${s.id}`, "PATCH", b);
      router.refresh();
    } catch (e) {
      onErr((e as Error).message);
    }
  };
  return (
    <tr style={s.active ? undefined : { opacity: 0.55 }}>
      <td>
        <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="姓名" />
      </td>
      <td style={{ width: "calc(110px * var(--z))" }}>
        <input className="input" value={title} maxLength={20} placeholder="—" onChange={(e) => setTitle(e.target.value)} aria-label="職稱標籤" />
      </td>
      <td>
        <input className="input" type="email" value={email} placeholder="（未填）" onChange={(e) => setEmail(e.target.value)} aria-label="email" />
      </td>
      <td style={{ width: "calc(120px * var(--z))" }}>
        <select className="input" value={s.groupId ?? ""} onChange={(e) => void patch({ groupId: e.target.value })} aria-label="組別">
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </td>
      <td>
        <PwStatus p={s} />
      </td>
      <td>
        <div className="row" style={{ gap: "calc(6px * var(--z))", flexWrap: "nowrap" }}>
          {dirty && (
            <button className="btn sm primary" disabled={!name.trim()} onClick={() => void patch({ name: name.trim(), title: title.trim() || null, email: email.trim() })}>
              儲存
            </button>
          )}
          {s.hasPassword && (
            <button className="btn sm" onClick={() => onReset(s.id, s.name)}>
              重設密碼
            </button>
          )}
          <button className={`btn sm ${s.active ? "danger" : ""}`} onClick={() => void patch({ active: !s.active })}>
            {s.active ? "停用" : "啟用"}
          </button>
        </div>
      </td>
    </tr>
  );
}

export function AdminPeople({ groups, students, instructors, mailReady }: { groups: G[]; students: Person[]; instructors: I[]; mailReady: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [nw, setNw] = useState({ name: "", groupId: groups[0]?.id ?? "", title: "" });
  const [pass, setPass] = useState({ a: "", b: "" });
  useWsEvent("admin:reset-request", () => router.refresh());

  const run = async (f: () => Promise<void>) => {
    setErr("");
    setMsg("");
    try {
      await f();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const resetPw = (id: string, name: string) => {
    if (!confirm(`確定重設 ${name} 的密碼？\n對方會被登出，下次登入時用課程通關密碼重新設定密碼。`)) return;
    void run(async () => {
      await call(`/api/admin/users/${id}/reset-password`, "POST");
      setMsg(`已重設 ${name} 的密碼，請對方用課程通關密碼重新設定。`);
      router.refresh();
    });
  };
  const requests = [...students, ...instructors].filter((p) => p.resetRequested);

  return (
    <>
      {err && <div className="notice err">{err}</div>}
      {msg && <div className="notice">{msg}</div>}

      {requests.length > 0 && (
        <section className="card" id="requests" style={{ borderColor: "var(--warn)" }}>
          <h2>忘記密碼申請</h2>
          <p className="muted small">核准後對方的密碼會清空，請對方回登入頁用課程通關密碼重新設定。</p>
          {requests.map((p) => (
            <div key={p.id} className="row" style={{ padding: "calc(8px * var(--z)) 0", borderBottom: "1px solid var(--line)" }}>
              <b>{p.name}</b>
              <span className="muted small">{"groupId" in p && p.groupId ? groups.find((g) => g.id === p.groupId)?.name : "講師"}</span>
              <div className="spacer" />
              <button
                className="btn sm primary"
                onClick={() =>
                  void run(async () => {
                    await call(`/api/admin/users/${p.id}/reset-password`, "POST");
                    setMsg(`已核准 ${p.name} 重設密碼。`);
                    router.refresh();
                  })
                }
              >
                核准重設
              </button>
              <button
                className="btn sm ghost"
                onClick={() =>
                  void run(async () => {
                    await call(`/api/admin/users/${p.id}/dismiss-reset`, "POST");
                    router.refresh();
                  })
                }
              >
                忽略
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="card" id="passphrase">
        <h2>設計思考課程通關密碼</h2>
        <p className="muted small">
          每個人第一次登入時，用這組通關密碼設定自己的密碼。只存雜湊、無法查看原文；改了之後，已設定好密碼的人不受影響。
        </p>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (pass.a !== pass.b) return setErr("兩次輸入的通關密碼不一樣");
            void run(async () => {
              await call("/api/admin/course-pass", "PUT", { passphrase: pass.a });
              setPass({ a: "", b: "" });
              setMsg("已更新課程通關密碼。");
            });
          }}
        >
          <input className="input" style={{ maxWidth: "calc(240px * var(--z))" }} placeholder="新的通關密碼" autoComplete="off" value={pass.a} onChange={(e) => setPass({ ...pass, a: e.target.value })} />
          <input className="input" style={{ maxWidth: "calc(240px * var(--z))" }} placeholder="再輸入一次" autoComplete="off" value={pass.b} onChange={(e) => setPass({ ...pass, b: e.target.value })} />
          <button className="btn primary" disabled={pass.a.trim().length < 4 || !pass.b}>
            更新通關密碼
          </button>
        </form>
        <p className="small" style={{ marginTop: "calc(12px * var(--z))" }}>
          忘記密碼自動寄信：
          {mailReady ? <span className="badge accent">已啟用</span> : <span className="badge warn">未設定（目前改由講師核准）</span>}
        </p>
      </section>

      <section className="card" id="students">
        <h2>學員</h2>
        <p className="muted small">可直接改名、改標籤（例如「副院長」）、改 email、換組、停用。換組或停用會讓該學員重新登入。</p>
        {groups.map((g) => (
          <div key={g.id} style={{ marginBottom: "calc(18px * var(--z))" }}>
            <h3>{g.name}</h3>
            <div className="tscroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>姓名</th>
                    <th>標籤</th>
                    <th>Email</th>
                    <th>組別</th>
                    <th>密碼</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {students
                    .filter((s) => s.groupId === g.id)
                    .map((s) => (
                      <StudentRow key={`${s.id}:${s.name}:${s.title}:${s.groupId}:${s.active}:${s.email}:${s.hasPassword}`} s={s} groups={groups} onErr={setErr} onReset={resetPw} />
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await call("/api/admin/students", "POST", { name: nw.name.trim(), groupId: nw.groupId, title: nw.title.trim() || null });
              setNw({ ...nw, name: "", title: "" });
              router.refresh();
            });
          }}
        >
          <input className="input" style={{ maxWidth: "calc(200px * var(--z))" }} placeholder="新學員姓名" value={nw.name} maxLength={40} onChange={(e) => setNw({ ...nw, name: e.target.value })} />
          <input className="input" style={{ maxWidth: "calc(140px * var(--z))" }} placeholder="標籤（選填）" value={nw.title} maxLength={20} onChange={(e) => setNw({ ...nw, title: e.target.value })} />
          <select className="input" style={{ maxWidth: "calc(140px * var(--z))" }} value={nw.groupId} onChange={(e) => setNw({ ...nw, groupId: e.target.value })}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <button className="btn primary" disabled={!nw.name.trim()}>
            新增學員
          </button>
        </form>
      </section>

      <section className="card" id="instructors">
        <h2>講師</h2>
        <p className="muted small">自己的密碼與 email 請到右上角姓名（我的帳號）修改。</p>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {instructors.map((i) => (
            <li key={i.id} className="row" style={{ padding: "calc(8px * var(--z)) 0", borderBottom: "1px solid var(--line)" }}>
              <span>{i.name}</span>
              <PwStatus p={i} />
              <span className="muted small">{i.email ?? "（未填 email）"}</span>
              <div className="spacer" />
              {!i.isMe && i.hasPassword && (
                <button className="btn sm" onClick={() => resetPw(i.id, i.name)}>
                  重設密碼
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
