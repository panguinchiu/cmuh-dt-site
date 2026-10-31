import type { PublicResource } from "@/lib/resources";

const TYPE_LABEL = { file: "檔案", link: "連結", html_game: "HTML 遊戲" } as const;

export function ResourceLink({ r }: { r: PublicResource }) {
  if (r.type === "link")
    return (
      <a href={r.url ?? "#"} target="_blank" rel="noopener noreferrer">
        {r.title}
      </a>
    );
  if (r.type === "html_game") return <a href={`/resources/${r.id}/play`}>{r.title}</a>;
  return <a href={`/api/resources/${r.id}/download`}>{r.title}</a>;
}

export function ResourceList({ items, empty = "目前沒有資源" }: { items: PublicResource[]; empty?: string }) {
  if (!items.length) return <p className="muted">{empty}</p>;
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {items.map((r) => (
        <li key={r.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="badge">{TYPE_LABEL[r.type]}</span>
            <ResourceLink r={r} />
          </div>
          {r.description ? <div className="muted small">{r.description}</div> : null}
        </li>
      ))}
    </ul>
  );
}
