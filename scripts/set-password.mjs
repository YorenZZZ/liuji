import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import path from "node:path";
import { createStore } from "../server/store.mjs";
let hidden = false;
const output = new Writable({ write(chunk, _encoding, cb) {
  if (!hidden) process.stdout.write(chunk);
  cb();
} });
const rl = createInterface({ input: process.stdin, output, terminal: !!process.stdin.isTTY });
let password;
try {
  if (process.stdin.isTTY) {
    process.stdout.write("设置留迹登录密码（至少 10 位，输入不回显）：");
    hidden = true;
    password = await rl.question("");
    process.stdout.write("\n再次输入：");
    const confirm = await rl.question("");
    process.stdout.write("\n");
    if (password !== confirm) throw new Error("两次密码不同");
  } else {
    password = (await rl.question("")).trim();
  }
  const store = createStore(path.resolve(process.env.DATA_DIR || "data", "liuji.sqlite"));
  store.setPassword(password);
  store.close();
  hidden = false;
  console.log("登录密码已设置，既有网页会话已退出。MCP 令牌不受影响。");
} finally {
  rl.close();
}
