"use client";

export function ThemeToggle() {
  const toggle = () => {
    const cur = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    const next = cur === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
    window.dispatchEvent(new CustomEvent("themechange", { detail: next }));
  };
  return (
    <button className="btn sm ghost" onClick={toggle} title="切換深色／淺色" aria-label="切換深色／淺色">
      深／淺
    </button>
  );
}

export function useThemeName(): "light" | "dark" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}
