function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`缺少環境變數 ${name}`);
  return v;
}

export const env = {
  get sessionSecret() {
    return required("SESSION_SECRET");
  },
  get appOrigin() {
    return process.env.APP_ORIGIN || "http://localhost:3000";
  },
  get gameOrigin() {
    return process.env.GAME_ORIGIN || "";
  },
  get isProd() {
    return process.env.NODE_ENV === "production";
  },
  get secureCookies() {
    return (process.env.APP_ORIGIN || "").startsWith("https://");
  },
};
