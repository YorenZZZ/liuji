import path from "node:path";
import { createStore } from "./store.mjs";
import { createApp } from "./app.mjs";
const port = Number(process.env.PORT || 18910), host = process.env.HOST || "127.0.0.1";
const store = createStore(path.resolve(process.env.DATA_DIR || "data", "liuji.sqlite"));
const server = createApp(store, { publicOrigin: process.env.PUBLIC_ORIGIN || "", secureCookie: process.env.COOKIE_SECURE === "true", authRequired: process.env.AUTH_REQUIRED !== "false" }).listen(port, host, () => {
  console.log(`留迹 v1.1.0 · http://${host}:${port}`);
  if (process.env.AUTH_REQUIRED !== "false" && !store.hasPassword()) console.log("首次使用：请在可信网络打开网页设置登录密码，或运行 npm run setup。");
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 1e4).unref();
});
