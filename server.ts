/**
 * Custom server：同一個 http.Server 掛 Next handler 與 ws（路徑 /ws）。
 * 部署為單一 instance（白板狀態在記憶體，見 README）。
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import next from "next";
import { createHub } from "@/ws/hub-impl";
import { setHub } from "@/lib/hub";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOST || "0.0.0.0";

function securityHeaders(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  const path = (req.url || "/").split("?")[0];
  // 遊戲路徑由 route handler 自己設定 sandbox CSP
  if (path.startsWith("/play/")) return;
  const host = req.headers.host || "localhost";
  const gameOrigin = process.env.GAME_ORIGIN || "";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    `connect-src 'self' ws://${host} wss://${host}`,
    `frame-src 'self' ${gameOrigin}`.trim(),
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join("; ");
  res.setHeader("Content-Security-Policy", csp);
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
}

async function main() {
  const app = next({ dev, hostname, port, turbopack: dev });
  const handle = app.getRequestHandler();
  await app.prepare();
  const nextUpgrade = app.getUpgradeHandler();

  const hub = createHub();
  setHub(hub.api);

  const server = createServer((req, res) => {
    securityHeaders(req, res);
    void handle(req, res);
  });

  server.on("upgrade", (req, socket, head) => {
    const path = (req.url || "/").split("?")[0];
    if (path === "/ws") void hub.handleUpgrade(req, socket, head);
    else void nextUpgrade(req, socket, head);
  });

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://localhost:${port} (${dev ? "dev" : "production"})`);
  });

  let closing = false;
  const stop = async (sig: string) => {
    if (closing) return;
    closing = true;
    console.log(`[server] ${sig}：flush 白板後關閉`);
    await hub.shutdown();
    server.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop("SIGTERM"));
  process.on("SIGINT", () => void stop("SIGINT"));
}

void main();
