"use client";

import { useEffect, useState } from "react";

/** 字級切換：大字（預設，所有尺寸 ×2）／標準；只存在這台裝置 */
export function SizeToggle() {
  const [size, setSize] = useState<"large" | "normal">("large");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSize(document.documentElement.dataset.size === "normal" ? "normal" : "large");
  }, []);
  const toggle = () => {
    const next = size === "large" ? "normal" : "large";
    document.documentElement.dataset.size = next;
    try {
      localStorage.setItem("size", next);
    } catch {}
    setSize(next);
  };
  return (
    <button className="btn sm ghost" onClick={toggle} title="切換字級" aria-label="切換字級">
      {size === "large" ? "標準字" : "大字"}
    </button>
  );
}
