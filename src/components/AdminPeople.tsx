"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type G = { id: string; name: string };
type S = { id: string; name: string; title: string | null; groupId: string | null; active: boolean };
type I = { id: string; name: string; isMe: boolean };

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.issues?.[0]?.message ? `${d.error}：${d.issues[0].message}` : d.error || "操作失敗");
  return d;
}

function StudentRow({ s, groups, onErr }: { s: S; groups: G[]; onErr: (m: string) => void }) {
  const router = useRouter();
  const [name, setName] = useState(s.name);
  const [title, setTitle] = useState(s.title ?? "");
  const dirty = name.trim() !== s.name || title.trim() !== (s.title ?? "");
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
      <td style={{ width: "calc(120px * var(--z))" }}>
        <input className="input" value={title} maxLength={20} placeholder="—" onChange={(e) => setTitle(e.target.value)} aria-label="職稱標籤" />
      </td>
      <td style={{ width: "calc(130px * var(--z))" }}>
        <select className="input" value={s.groupId ?? ""} onChange={(e) => void patch({ groupId: e.target.value })} aria-label="組別">
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </td>
      <td>
        <div className="row" style={{ gap: "calc(6px * var(--z))", flexWrap: "nowrap" }}>
          {dirty && (
            <button className="btn sm primary" disabled={!name.trim()} onClick={() => void patch({ name: name.trim(), title: title.trim() || null })}>
              儲存
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

export function AdminPeople({ groups, students, instructors }: { groups: G[]; students: S[]; instructors: I[] }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [shown, setShown] = useState<{ label: string; secret: string } | null>(null);
  const [nw, setNw] = useState({ name: "", groupId: groups[0]?.id ?? "", title: "" });
  const [pw, setPw] = useState({ current: "", next: "" });
  const [pwMsg, setPwMsg] = useState("");

  const run = async (f: () => Promise<void>) => {
    setErr("");
    try {
      await f();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <>
      {err && <div className="notice err">{err}</div>}
      {shown && (
        <div className="notice">
          <div className="row">
            <span>
              {shown.label}：<b className="mono" style={{ fontSize: "calc(26px * var(--z))", letterSpacing: "0.12em" }}>{shown.secret}</b>
            </span>
            <span className="muted small">只顯示這一次，請記下後關閉。</span>
            <div className="spacer" />
            <button className="btn sm" onClick={() => setShown(null)}>
              我記下了
            </button>
          </div>
        </div>
      )}

      <section className="card" id="students">
        <h2>學員</h2>
        <p className="muted small">可直接改名、改職稱標籤（例如「副院長」）、換組、停用。換組或停用會讓該學員重新登入。</p>
        {groups.map((g) => (
          <div key={g.id} style={{ marginBottom: "calc(18px * var(--z))" }}>
            <h3>{g.name}</h3>
            <div className="tscroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>姓名</th>
                    <th>標籤</th>
                    <th>組別</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {students
                    .filter((s) => s.groupId === g.id)
                    .map((s) => (
                      <StudentRow key={`${s.id}:${s.name}:${s.title}:${s.groupId}:${s.active}`} s={s} groups={groups} onErr={setErr} />
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

      <section className="card" id="codes">
        <h2>組別代碼</h2>
        <p className="muted small">代碼只以雜湊儲存，無法查看原碼；忘記時請重設，新代碼只顯示一次。</p>
        <div className="row">
          {groups.map((g) => (
            <button
              key={g.id}
              className="btn"
              onClick={() => {
                if (!confirm(`確定重設「${g.name}」的組別代碼？舊代碼會立即失效。`)) return;
                void run(async () => {
                  const d = await call(`/api/admin/groups/${g.id}/code`, "POST");
                  setShown({ label: `${g.name} 新代碼`, secret: d.code });
                });
              }}
            >
              重設 {g.name} 代碼
            </button>
          ))}
        </div>
      </section>

      <section className="card" id="instructors">
        <h2>講師</h2>
        <div className="grid c2">
          <div>
            <h3>重設其他講師密碼</h3>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {instructors
                .filter((i) => !i.isMe)
                .map((i) => (
                  <li key={i.id} className="row" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                    <span>{i.name}</span>
                    <div className="spacer" />
                    <button
                      className="btn sm"
                      onClick={() => {
                        if (!confirm(`確定重設 ${i.name} 的密碼？`)) return;
                        void run(async () => {
                          const d = await call(`/api/admin/instructors/${i.id}/password`, "POST", {});
                          setShown({ label: `${i.name} 新密碼`, secret: d.password });
                        });
                      }}
                    >
                      重設密碼
                    </button>
                  </li>
                ))}
            </ul>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPwMsg("");
              void run(async () => {
                await call("/api/me/password", "POST", pw);
                setPw({ current: "", next: "" });
                setPwMsg("已更新，下次登入請用新密碼。");
              });
            }}
          >
            <h3>修改我的密碼</h3>
            <label className="field">
              <span>目前密碼</span>
              <input className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            </label>
            <label className="field">
              <span>新密碼（至少 8 碼）</span>
              <input className="input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            </label>
            {pwMsg && <div className="notice">{pwMsg}</div>}
            <button className="btn primary" disabled={!pw.current || pw.next.length < 8}>
              更新密碼
            </button>
          </form>
        </div>
      </section>
    </>
  );
}
