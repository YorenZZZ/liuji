import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID, createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";
export const entryInput = z.object({ text: z.string().max(1e5) });
export const publicationInput = z.object({ platform: z.string().trim().min(1).max(40), publishedAt: z.string().datetime({ offset: true }), url: z.string().max(2e3).default(""), note: z.string().max(500).default(""), expectedVersion: z.number().int().positive(), idempotencyKey: z.string().min(8).max(100) });
export const hash = (v) => createHash("sha256").update(v).digest("hex");
export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const now = () => (/* @__PURE__ */ new Date()).toISOString();
export function createStore(file) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 448 });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
  db.exec(`CREATE TABLE IF NOT EXISTS entries(id TEXT PRIMARY KEY,title TEXT NOT NULL,html TEXT NOT NULL,text TEXT NOT NULL,tags TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,trashed_at TEXT);
 CREATE TABLE IF NOT EXISTS publications(id TEXT PRIMARY KEY,entry_id TEXT NOT NULL REFERENCES entries(id),platform TEXT NOT NULL,published_at TEXT NOT NULL,url TEXT NOT NULL,note TEXT NOT NULL,snapshot TEXT NOT NULL,idempotency_key TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS pub_date ON publications(published_at DESC);
 CREATE INDEX IF NOT EXISTS pub_entry ON publications(entry_id);
 CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS tokens(id TEXT PRIMARY KEY,name TEXT NOT NULL,scope TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,tail TEXT NOT NULL,created_at TEXT NOT NULL,last_used_at TEXT);
 PRAGMA user_version=1;`);
  const setting = (k) => db.prepare("SELECT value FROM settings WHERE key=?").get(k)?.value;
  const setSetting = (k, v) => db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(k, v);
  const publications = (id) => db.prepare("SELECT * FROM publications WHERE entry_id=? ORDER BY published_at DESC,id DESC").all(id).map((p) => ({ id: p.id, entryId: p.entry_id, platform: p.platform, publishedAt: p.published_at, url: p.url, note: p.note, snapshot: JSON.parse(p.snapshot) }));
  function getEntry(id) {
    const e = db.prepare("SELECT * FROM entries WHERE id=?").get(id);
    if (!e) throw new AppError("这篇内容不存在", 404);
    return { id: e.id, title: e.title, html: e.html, text: e.text, tags: JSON.parse(e.tags), createdAt: e.created_at, updatedAt: e.updated_at, version: e.version, trashedAt: e.trashed_at, publications: publications(id) };
  }
  function normalized(input) {
    const v = entryInput.parse(input);
    const text = v.text.replace(/\r\n?/g, "\n");
    const title = text.split("\n").find((line) => line.trim())?.trim().slice(0, 80) || "";
    const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    return { title, text, html: text.split("\n").map((p) => `<p>${escape(p) || "<br>"}</p>`).join(""), tags: [] };
  }
  function createEntry(input) {
    const e = normalized(input), id = randomUUID(), at = now();
    db.prepare("INSERT INTO entries(id,title,html,text,tags,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run(id, e.title, e.html, e.text, JSON.stringify(e.tags), at, at);
    return getEntry(id);
  }
  function updateEntry(id, input, version) {
    const e = normalized(input);
    const r = db.prepare("UPDATE entries SET title=?,html=?,text=?,tags=?,updated_at=?,version=version+1 WHERE id=? AND version=? AND trashed_at IS NULL").run(e.title, e.html, e.text, JSON.stringify(e.tags), now(), id, version);
    if (!r.changes) throw new AppError("内容已在另一处更新或移入回收站，请保留当前文字并重新打开", 409);
    return getEntry(id);
  }
  function list({ q = "", platform = "", status = "all", tag = "", month = "", limit = 50, offset = 0 } = {}) {
    if (!["all", "published", "drafts", "trash"].includes(status)) throw new AppError("筛选状态不正确");
    const where = [status === "trash" ? "e.trashed_at IS NOT NULL" : "e.trashed_at IS NULL"], args = [];
    if (q) {
      where.push("(instr(lower(e.title),lower(?))>0 OR instr(lower(e.text),lower(?))>0)");
      args.push(q, q);
    }
    if (tag) {
      where.push("EXISTS(SELECT 1 FROM json_each(e.tags) WHERE value=?)");
      args.push(tag);
    }
    if (status === "drafts") where.push("NOT EXISTS(SELECT 1 FROM publications p WHERE p.entry_id=e.id)");
    if (status === "published") where.push("EXISTS(SELECT 1 FROM publications p WHERE p.entry_id=e.id)");
    if (platform || month) {
      const publicationFilters = ["p.entry_id=e.id"];
      if (platform) {
        publicationFilters.push("p.platform=?");
        args.push(platform);
      }
      if (month) {
        publicationFilters.push("strftime('%Y-%m',p.published_at,'+8 hours')=?");
        args.push(month);
      }
      where.push(`EXISTS(SELECT 1 FROM publications p WHERE ${publicationFilters.join(" AND ")})`);
    }
    const clause = where.join(" AND "), total = db.prepare(`SELECT count(*) AS n FROM entries e WHERE ${clause}`).get(...args).n;
    const rows = db.prepare(`SELECT e.id FROM entries e WHERE ${clause} ORDER BY COALESCE((SELECT MAX(p.published_at) FROM publications p WHERE p.entry_id=e.id),e.updated_at) DESC,e.id DESC LIMIT ? OFFSET ?`).all(...args, Math.min(Math.max(Number(limit) || 50, 1), 100), Math.max(Number(offset) || 0, 0));
    return { items: rows.map((e) => getEntry(e.id)), total };
  }
  function timeline({ q = "", platform = "", month = "", limit = 50, offset = 0 } = {}) {
    const where = ["e.trashed_at IS NULL"], args = [];
    if (q) {
      where.push("(instr(lower(json_extract(p.snapshot,'$.text')),lower(?))>0 OR instr(lower(p.note),lower(?))>0)");
      args.push(q, q);
    }
    if (platform) {
      where.push("p.platform=?");
      args.push(platform);
    }
    if (month) {
      where.push("strftime('%Y-%m',p.published_at,'+8 hours')=?");
      args.push(month);
    }
    const clause = where.join(" AND ");
    return { total: db.prepare(`SELECT count(*) AS n FROM publications p JOIN entries e ON e.id=p.entry_id WHERE ${clause}`).get(...args).n, items: db.prepare(`SELECT p.* FROM publications p JOIN entries e ON e.id=p.entry_id WHERE ${clause} ORDER BY p.published_at DESC,p.id DESC LIMIT ? OFFSET ?`).all(...args, Math.min(Math.max(Number(limit) || 50, 1), 100), Math.max(Number(offset) || 0, 0)).map((p) => ({ id: p.id, entryId: p.entry_id, platform: p.platform, publishedAt: p.published_at, url: p.url, note: p.note, snapshot: JSON.parse(p.snapshot) })) };
  }
  function recordPublication(id, input) {
    const p = publicationInput.parse(input);
    if (p.url && !/^https?:\/\//i.test(p.url)) throw new AppError("原帖链接须以 http:// 或 https:// 开头");
    if (p.url) {
      try {
        new URL(p.url);
      } catch {
        throw new AppError("原帖链接格式不正确");
      }
    }
    const existing = db.prepare("SELECT id,entry_id,platform,published_at,url,note FROM publications WHERE idempotency_key=?").get(p.idempotencyKey);
    if (existing) {
      if (existing.entry_id !== id || existing.platform !== p.platform || existing.published_at !== new Date(p.publishedAt).toISOString() || existing.url !== p.url || existing.note !== p.note) throw new AppError("相同幂等键已用于另一条发布记录", 409);
      return getEntry(id);
    }
    const e = getEntry(id);
    if (e.trashedAt) throw new AppError("请先恢复这篇内容");
    if (e.version !== p.expectedVersion) throw new AppError("内容已更新，请重新打开后记录发布", 409);
    if (!e.text.trim()) throw new AppError("先写一点文字");
    if (Date.parse(p.publishedAt) > Date.now() + 6e4) throw new AppError("发布时间不能晚于当前时间");
    const snapshot = { title: e.title, html: e.html, text: e.text, tags: e.tags, version: e.version };
    db.prepare("INSERT INTO publications VALUES(?,?,?,?,?,?,?,?,?)").run(randomUUID(), id, p.platform, new Date(p.publishedAt).toISOString(), p.url, p.note, JSON.stringify(snapshot), p.idempotencyKey, now());
    return getEntry(id);
  }
  function stats() {
    return { entries: db.prepare("SELECT count(*) n FROM entries WHERE trashed_at IS NULL").get().n, drafts: db.prepare("SELECT count(*) n FROM entries e WHERE trashed_at IS NULL AND NOT EXISTS(SELECT 1 FROM publications p WHERE p.entry_id=e.id)").get().n, publications: db.prepare("SELECT count(*) n FROM publications p JOIN entries e ON p.entry_id=e.id WHERE e.trashed_at IS NULL").get().n, platforms: db.prepare("SELECT p.platform,count(*) count FROM publications p JOIN entries e ON p.entry_id=e.id WHERE e.trashed_at IS NULL GROUP BY platform ORDER BY count DESC").all(), months: db.prepare("SELECT DISTINCT strftime('%Y-%m',p.published_at,'+8 hours') month FROM publications p JOIN entries e ON p.entry_id=e.id WHERE e.trashed_at IS NULL ORDER BY month DESC").all().map((x) => x.month) };
  }
  function trash(id, version, restore = false) {
    const r = db.prepare(`UPDATE entries SET trashed_at=?,version=version+1,updated_at=? WHERE id=? AND version=?`).run(restore ? null : now(), now(), id, version);
    if (!r.changes) throw new AppError("内容已更新，请刷新后重试", 409);
    return getEntry(id);
  }
  function setPassword(password) {
    if (typeof password !== "string" || password.length < 10 || password.length > 200) throw new AppError("密码需要 10–200 个字符");
    const salt = randomBytes(16).toString("hex");
    const derived = `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
    db.exec("BEGIN IMMEDIATE");
    try {
      setSetting("password", derived);
      db.prepare("DELETE FROM sessions").run();
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  function checkPassword(password) {
    const saved = setting("password");
    if (!saved || typeof password !== "string" || password.length > 200) return false;
    const [salt, key] = saved.split(":");
    return timingSafeEqual(Buffer.from(key, "hex"), scryptSync(password, salt, 64));
  }
  function session() {
    db.prepare("DELETE FROM sessions WHERE expires_at<?").run(Date.now());
    const token = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions VALUES(?,?)").run(hash(token), Date.now() + 7 * 864e5);
    return token;
  }
  function tokenList() {
    return db.prepare("SELECT id,name,scope,tail,created_at AS createdAt,last_used_at AS lastUsedAt FROM tokens ORDER BY created_at DESC").all();
  }
  function issueToken(name, scope) {
    const data = z.object({ name: z.string().trim().min(1).max(50), scope: z.enum(["read", "write"]) }).parse({ name, scope });
    const token = `lj_${randomBytes(32).toString("base64url")}`, id = randomUUID();
    db.prepare("INSERT INTO tokens VALUES(?,?,?,?,?,?,NULL)").run(id, data.name, data.scope, hash(token), token.slice(-6), now());
    return { id, token, ...data };
  }
  function verifyToken(token) {
    if (!token) return null;
    const t = db.prepare("SELECT id,scope FROM tokens WHERE token_hash=?").get(hash(token));
    if (t) db.prepare("UPDATE tokens SET last_used_at=? WHERE id=?").run(now(), t.id);
    return t;
  }
  return { db, close: () => db.close(), getEntry, createEntry, updateEntry, list, timeline, stats, recordPublication, trash, setPassword, checkPassword, hasPassword: () => !!setting("password"), session, validSession: (t) => !!(t && db.prepare("SELECT token_hash FROM sessions WHERE token_hash=? AND expires_at>?").get(hash(t), Date.now())), logout: (t) => db.prepare("DELETE FROM sessions WHERE token_hash=?").run(hash(t || "")), tokenList, issueToken, verifyToken, revokeToken: (id) => db.prepare("DELETE FROM tokens WHERE id=?").run(id) };
}
