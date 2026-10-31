"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PublicResource } from "@/lib/resources";
import { ResourceLink } from "./ResourceList";

type Opt = { id: string; name: string };
type Student = Opt & { groupName: string };
type Vis = "all_students" | "groups" | "users" | "instructors_only";
type Form = {
  id?: string;
  type: "file" | "link" | "html_game";
  title: string;
  description: string;
  url: string;
  visibility: Vis;
  groupIds: string[];
  userIds: string[];
  agendaItemId: string;
  sortOrder: number;
};

const VIS_LABEL: Record<Vis, string> = { all_students: "全體學員", groups: "指定組別", users: "指定個人", instructors_only: "僅講師" };
const TYPE_LABEL = { file: "檔案", link: "連結", html_game: "HTML 遊戲" } as const;
const empty: Form = { type: "link", title: "", description: "", url: "", visibility: "all_students", groupIds: [], userIds: [], agendaItemId: "", sortOrder: 0 };

export function ResourceManager({
  resources,
  groups,
  students,
  agenda,
}: {
  resources: PublicResource[];
  groups: Opt[];
  students: Student[];
  agenda: { id: string; no: number; title: string }[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<Form | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (p: Partial<Form>) => setForm((f) => (f ? { ...f, ...p } : f));
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const nameOf = (ids: string[] | undefined, list: Opt[]) => (ids ?? []).map((i) => list.find((x) => x.id === i)?.name ?? "?").join("、");

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setErr("");
    const meta = {
      title: form.title,
      description: form.description || null,
      visibility: form.visibility,
      groupIds: form.groupIds,
      userIds: form.userIds,
      agendaItemId: form.agendaItemId || null,
      sortOrder: form.sortOrder,
    };
    let r: Response;
    if (form.id) {
      r = await fetch(`/api/resources/${form.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...meta, ...(form.type === "link" ? { url: form.url } : {}) }) });
    } else if (form.type === "link") {
      r = await fetch("/api/resources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...meta, type: "link", url: form.url }) });
    } else {
      if (!file) {
        setBusy(false);
        return setErr("請選擇檔案");
      }
      const fd = new FormData();
      fd.set("type", form.type);
      fd.set("meta", JSON.stringify(meta));
      fd.set("file", file);
      r = await fetch("/api/resources", { method: "POST", body: fd });
    }
    setBusy(false);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      return setErr(d.issues?.[0]?.message ? `${d.error}：${d.issues[0].path?.join(".")} ${d.issues[0].message}` : d.error || "儲存失敗");
    }
    setForm(null);
    setFile(null);
    router.refresh();
  };

  const remove = async (r: PublicResource) => {
    if (!confirm(`確定刪除「${r.title}」？`)) return;
    const res = await fetch(`/api/resources/${r.id}`, { method: "DELETE" });
    if (!res.ok) alert("刪除失敗");
    router.refresh();
  };

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="btn primary" onClick={() => (setForm({ ...empty }), setFile(null), setErr(""))}>
          新增資源
        </button>
        <span className="muted small">可見範圍由伺服器強制；講師永遠看得到全部。</span>
      </div>

      {form && (
        <section className="card">
          <h3>{form.id ? "編輯資源" : "新增資源"}</h3>
          {!form.id && (
            <div className="row" style={{ marginBottom: 14 }}>
              {(["link", "file", "html_game"] as const).map((t) => (
                <button key={t} className={`btn sm ${form.type === t ? "primary" : ""}`} onClick={() => (set({ type: t }), setFile(null))}>
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          )}
          <div className="grid c2">
            <div>
              <label className="field">
                <span>標題</span>
                <input className="input" value={form.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} />
              </label>
              <label className="field">
                <span>說明（選填）</span>
                <textarea className="input" value={form.description} maxLength={1000} onChange={(e) => set({ description: e.target.value })} />
              </label>
              {form.type === "link" ? (
                <label className="field">
                  <span>網址（開新分頁）</span>
                  <input className="input" type="url" placeholder="https://" value={form.url} onChange={(e) => set({ url: e.target.value })} />
                </label>
              ) : !form.id ? (
                <label className="field">
                  <span>{form.type === "file" ? "檔案（≤ 50MB；pdf、pptx、docx、xlsx、png、jpg、mp4、zip、html）" : "遊戲（單一 .html，或 .zip 內含 index.html）"}</span>
                  <input className="input" type="file" accept={form.type === "file" ? ".pdf,.pptx,.docx,.xlsx,.png,.jpg,.jpeg,.mp4,.zip,.html" : ".html,.zip"} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </label>
              ) : null}
            </div>
            <div>
              <label className="field">
                <span>可見範圍</span>
                <select className="input" value={form.visibility} onChange={(e) => set({ visibility: e.target.value as Vis })}>
                  {(Object.keys(VIS_LABEL) as Vis[]).map((v) => (
                    <option key={v} value={v}>
                      {VIS_LABEL[v]}
                    </option>
                  ))}
                </select>
              </label>
              {form.visibility === "groups" && (
                <div className="field row" style={{ gap: 8 }}>
                  {groups.map((g) => (
                    <label key={g.id} className="badge" style={{ padding: "6px 10px", cursor: "pointer" }}>
                      <input type="checkbox" checked={form.groupIds.includes(g.id)} onChange={() => set({ groupIds: toggle(form.groupIds, g.id) })} /> {g.name}
                    </label>
                  ))}
                </div>
              )}
              {form.visibility === "users" && (
                <div className="field" style={{ maxHeight: 220, overflow: "auto", border: "1px solid var(--line)", borderRadius: 5, padding: 8 }}>
                  {students.map((u) => (
                    <label key={u.id} style={{ display: "block", cursor: "pointer" }}>
                      <input type="checkbox" checked={form.userIds.includes(u.id)} onChange={() => set({ userIds: toggle(form.userIds, u.id) })} /> {u.name}
                      <span className="muted small">（{u.groupName}）</span>
                    </label>
                  ))}
                </div>
              )}
              <label className="field">
                <span>綁定段落（選填，首頁「本段落資源」會顯示）</span>
                <select className="input" value={form.agendaItemId} onChange={(e) => set({ agendaItemId: e.target.value })}>
                  <option value="">（不綁定）</option>
                  {agenda.map((a) => (
                    <option key={a.id} value={a.id}>
                      {String(a.no).padStart(2, "0")} {a.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>排序（數字小的在前）</span>
                <input className="input" type="number" value={form.sortOrder} onChange={(e) => set({ sortOrder: Number(e.target.value) || 0 })} />
              </label>
            </div>
          </div>
          {err && <div className="notice err">{err}</div>}
          <div className="row">
            <button className="btn primary" disabled={busy || !form.title.trim()} onClick={() => void save()}>
              {busy ? "儲存中…" : "儲存"}
            </button>
            <button className="btn ghost" onClick={() => setForm(null)}>
              取消
            </button>
          </div>
        </section>
      )}

      <section className="card">
        {resources.length === 0 ? (
          <p className="muted">還沒有資源。</p>
        ) : (
          <div className="tscroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>資源</th>
                  <th>類型</th>
                  <th>可見範圍</th>
                  <th>段落</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {resources.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <ResourceLink r={r} />
                      {r.description ? <div className="muted small">{r.description}</div> : null}
                    </td>
                    <td>
                      <span className="badge">{TYPE_LABEL[r.type]}</span>
                    </td>
                    <td className="small">
                      {VIS_LABEL[r.visibility as Vis]}
                      {r.visibility === "groups" ? `：${nameOf(r.groupIds, groups)}` : ""}
                      {r.visibility === "users" ? `：${nameOf(r.userIds, students)}` : ""}
                    </td>
                    <td className="small">{agenda.find((a) => a.id === r.agendaItemId)?.title ?? "—"}</td>
                    <td>
                      <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                        <button
                          className="btn sm"
                          onClick={() => (
                            setErr(""),
                            setForm({
                              id: r.id,
                              type: r.type,
                              title: r.title,
                              description: r.description ?? "",
                              url: r.url ?? "",
                              visibility: r.visibility as Vis,
                              groupIds: r.groupIds ?? [],
                              userIds: r.userIds ?? [],
                              agendaItemId: r.agendaItemId ?? "",
                              sortOrder: r.sortOrder,
                            })
                          )}
                        >
                          編輯
                        </button>
                        <button className="btn sm danger" onClick={() => void remove(r)}>
                          刪除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
