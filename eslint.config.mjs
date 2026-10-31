import next from "eslint-config-next";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...next,
  ...nextTs,
  {
    rules: {
      // 登入/登出後刻意整頁重載，讓 websocket 以新 session 重新連線
      "@next/next/no-location-assign-relative-destination": "off",
    },
  },
  {
    ignores: [".next/**", "dist/**", "node_modules/**", "reference/**", "public/**", ".azurite/**", "next-env.d.ts"],
  },
];

export default config;
