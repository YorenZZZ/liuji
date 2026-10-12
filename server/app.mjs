import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { backup } from "node:sqlite";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { z } from "zod";
import { AppError } from "./store.mjs";
import { handleMcp } from "./mcp.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export function createApp(store, { publicOrigin = "", secureCookie = false, authRequired = true } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin", "X-Frame-Options": "DENY", "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" });
    if (req.path.startsWith("/api") || req.path === "/mcp") res.set("Cache-Control", "no-store");
    next();
  });
  app.get("/healthz", (_req, res) => {
    store.db.prepare("SELECT 1").get();
    res.json({ status: "ok", version: "1.1.0", authRequired, mcpConfigured: store.tokenList().length > 0 });
  });
  app.use((req, res, next) => {
    const origin = req.get("origin");
    if (origin) {
      let valid = false;
      try {
        const o = new URL(origin);
        valid = publicOrigin ? o.origin === new URL(publicOrigin).origin : o.host === req.get("host");
      } catch {
      }
      if (!valid) return res.status(403).json({ error: "不允许跨站请求" });
    }
    next();
  });
  app.use(express.json({ limit: "750kb" }));
  const cookie = (req) => (req.headers.cookie || "").split(";").map((s) => s.trim()).find((s) => s.startsWith("liuji_session="))?.slice(14);
  const requireSession = (req, res, next) => !authRequired || store.validSession(cookie(req)) ? next() : res.status(401).json({ error: "请先登录" });
  const setSessionCookie = (res) => res.cookie("liuji_session", store.session(), { httpOnly: true, sameSite: "strict", secure: secureCookie, maxAge: 7 * 864e5, path: "/" });
  const newPassword = z.object({ password: z.string().min(10).max(200), confirmation: z.string() }).refine((value) => value.password === value.confirmation, { message: "两次密码不一致" });
  app.get("/api/session", (req, res) => res.json({ authenticated: !authRequired || store.validSession(cookie(req)), authRequired, needsSetup: authRequired && !store.hasPassword() }));
  app.post("/api/setup", (req, res) => {
    if (!authRequired) return res.status(403).json({ error: "当前使用内网免登录模式" });
    if (req.get("x-liuji-action") !== "1") return res.status(403).json({ error: "缺少操作校验" });
    if (store.hasPassword()) return res.status(409).json({ error: "密码已设置，请登录" });
    const parsed = newPassword.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "密码需 10–200 个字符，且两次输入一致" });
    store.setPassword(parsed.data.password);
    setSessionCookie(res).status(201).json({ ok: true });
  });
  const attempts = /* @__PURE__ */ new Map();
  app.post("/api/login", (req, res) => {
    const key = req.socket.remoteAddress || "local", at = Date.now();
    for (const [k, v] of attempts) if (at - v.at > 15 * 6e4) attempts.delete(k);
    const a = attempts.get(key) || { at, n: 0 };
    if (a.n >= 8) return res.status(429).json({ error: "尝试次数较多，请 15 分钟后再试" });
    a.n++;
    attempts.set(key, a);
    if (!store.checkPassword(req.body.password)) return res.status(401).json({ error: "密码不正确" });
    attempts.delete(key);
    setSessionCookie(res);
    res.json({ ok: true });
  });
  app.all("/mcp", async (req, res, next) => {
    const auth = store.verifyToken(req.get("authorization")?.replace(/^Bearer /, ""));
    if (!auth) return res.status(401).set("WWW-Authenticate", 'Bearer realm="liuji"').json({ error: "需要有效的 MCP Bearer 令牌" });
    if (req.method !== "POST") return res.status(405).set("Allow", "POST").end();
    try {
      await handleMcp(req, res, store, auth.scope);
    } catch (e) {
      next(e);
    }
  });
  app.use("/api", requireSession);
  app.use("/api", (req, res, next) => {
    if (!["GET", "HEAD"].includes(req.method) && req.get("x-liuji-action") !== "1") return res.status(403).json({ error: "缺少操作校验" });
    next();
  });
  app.post("/api/logout", (req, res) => {
    store.logout(cookie(req));
    res.clearCookie("liuji_session", { path: "/" }).json({ ok: true });
  });
  app.post("/api/password", (req, res) => {
    // LAN mode is not an authenticated identity and must not grant password changes.
    if (!authRequired || !store.validSession(cookie(req))) return res.status(403).json({ error: "请登录后修改密码" });
    const parsed = newPassword.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "密码需 10–200 个字符，且两次输入一致" });
    store.setPassword(parsed.data.password);
    setSessionCookie(res).json({ ok: true });
  });
  app.get("/api/stats", (_req, res) => res.json(store.stats()));
  const filter = z.object({ q: z.string().max(200).optional(), platform: z.string().max(40).optional(), status: z.enum(["all", "drafts", "published", "trash"]).optional(), month: z.string().regex(/^\d{4}-\d{2}$/).optional(), tag: z.string().max(30).optional(), limit: z.coerce.number().int().min(1).max(100).optional(), offset: z.coerce.number().int().min(0).optional() });
  app.get("/api/entries", (req, res) => res.json(store.list(filter.parse(req.query))));
  app.get("/api/timeline", (req, res) => res.json(store.timeline(filter.parse(req.query))));
  app.get("/api/entries/:id", (req, res) => res.json(store.getEntry(req.params.id)));
  app.post("/api/entries", (req, res) => res.status(201).json(store.createEntry(req.body)));
  app.put("/api/entries/:id", (req, res) => res.json(store.updateEntry(req.params.id, req.body, z.number().int().positive().parse(req.body.expectedVersion))));
  app.post("/api/entries/:id/publications", (req, res) => res.status(201).json(store.recordPublication(req.params.id, req.body)));
  app.post("/api/entries/:id/trash", (req, res) => res.json(store.trash(req.params.id, z.number().int().positive().parse(req.body.expectedVersion), false, z.boolean().optional().parse(req.body.draftOnly) === true)));
  app.post("/api/entries/:id/restore", (req, res) => res.json(store.trash(req.params.id, z.number().int().positive().parse(req.body.expectedVersion), true)));
  app.get("/api/tokens", (_req, res) => res.json({ items: store.tokenList() }));
  app.post("/api/tokens", (req, res) => res.status(201).json(store.issueToken(req.body.name, req.body.scope)));
  app.delete("/api/tokens/:id", (req, res) => {
    store.revokeToken(req.params.id);
    res.json({ ok: true });
  });
  app.get("/api/backup", async (_req, res, next) => {
    let dir;
    try {
      dir = await mkdtemp(path.join(tmpdir(), "liuji-backup-"));
      const file = path.join(dir, "liuji.sqlite");
      await backup(store.db, file);
      res.download(file, `liuji-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.sqlite`, () => rm(dir, { recursive: true, force: true }));
    } catch (e) {
      if (dir) await rm(dir, { recursive: true, force: true });
      next(e);
    }
  });
  app.use("/api", (_req, res) => res.status(404).json({ error: "接口不存在" }));
  app.use(express.static(path.join(root, "dist"), { index: false, maxAge: 0 }));
  app.get("/{*path}", (_req, res) => res.sendFile(path.join(root, "dist/index.html")));
  app.use((err, _req, res, _next) => {
    if (res.headersSent) return;
    const status = err instanceof z.ZodError ? 400 : err.status || 500;
    res.status(status).json({ error: err instanceof z.ZodError ? "参数格式不正确，请检查必填项" : status < 500 ? err.message : "服务暂时无法完成操作，请稍后再试" });
  });
  return app;
}
