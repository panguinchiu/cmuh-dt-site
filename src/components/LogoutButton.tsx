"use client";

export function LogoutButton() {
  return (
    <button
      className="btn sm"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        location.href = "/login";
      }}
    >
      登出
    </button>
  );
}
