"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useWsEvent } from "./ws";
import { ThemeToggle } from "./ThemeToggle";
import { LogoutButton } from "./LogoutButton";

export interface ShellUser {
  name: string;
  role: "student" | "instructor";
  groupName: string | null;
  title: string | null;
}

export function Shell({
  user,
  current,
  gamePublished,
  children,
}: {
  user: ShellUser;
  current: { seq: string; time: string; title: string } | null;
  gamePublished: boolean;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const isI = user.role === "instructor";

  // 目前時段 / 賽局公開狀態 變更 → 重新抓 server component
  useWsEvent("agenda:current", () => router.refresh());
  useWsEvent("game:publish", () => router.refresh());

  const links: { href: string; label: string; show: boolean }[] = [
    { href: "/", label: "首頁", show: true },
    { href: "/board", label: "我的白板", show: !isI },
    { href: "/overview", label: "白板總覽", show: isI },
    { href: "/resources", label: "資源庫", show: true },
    { href: "/game", label: "賽局", show: true },
    { href: "/game/dashboard", label: isI ? "賽局儀表板" : "賽局結果", show: isI || gamePublished },
    { href: "/admin", label: "管理", show: isI },
  ];
  const active = (href: string) =>
    href === "/" ? path === "/" : href === "/game" ? path === "/game" : path === href || path.startsWith(href + "/");

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? "open" : ""}`} onClick={() => setOpen(false)}>
        <div className="brand">
          <div className="k">CMUH · Design Thinking</div>
          <div className="t">設計思考工作坊</div>
        </div>
        <nav className="nav">
          {links
            .filter((l) => l.show)
            .map((l) => (
              <Link key={l.href} href={l.href} className={active(l.href) ? "active" : ""}>
                {l.label}
              </Link>
            ))}
        </nav>
        <div className="foot">
          中國附醫教學部
          <br />
          <Link href="/about">About／授權聲明</Link>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="btn sm menu-btn" onClick={() => setOpen(true)} aria-label="開啟選單">
            選單
          </button>
          <div className="now">
            <span className="lab">目前時段</span>
            <span className="val">
              {current ? (
                <>
                  <span className="mono">{current.time}</span>　{current.title}
                </>
              ) : (
                <span className="muted">尚未開始</span>
              )}
            </span>
          </div>
          <div className="who">
            <span>
              {user.name}
              {user.title ? <span className="badge accent" style={{ marginLeft: 6 }}>{user.title}</span> : null}
            </span>
            <span className="badge">{isI ? "講師" : user.groupName}</span>
            <ThemeToggle />
            <LogoutButton />
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
