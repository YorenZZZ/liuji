import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowDownToLine, ArrowLeft, ArrowUpRight, BookOpen, Check, ChevronRight, Clock3, Copy, Feather, FileText, KeyRound, Loader2, LogOut, Plus, Search, Settings, Trash2, X } from "lucide-react";
import { api, formatDate, shanghaiInput, newKey } from "./api";
import { downloadCard, prepareCards, renderCard } from "./export";
import "./style.css";
const defaultPlatforms = ["朋友圈", "小红书", "公众号", "微博", "即刻", "X"];
const Icon = ({ icon: C, ...props }) => <C size={18} strokeWidth={1.65} aria-hidden="true" {...props} />;
function Button({ children, icon, kind = "", ...props }) {
  return <button className={`button ${kind}`} {...props}>{icon && <Icon icon={icon} />}<span>{children}</span></button>;
}
function Dialog({ title, children, onClose, wide = false }) {
  const ref = useRef(), closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const el = ref.current;
    el.showModal();
    const cancel = (e) => {
      e.preventDefault();
      closeRef.current();
    };
    el.addEventListener("cancel", cancel);
    return () => {
      el.removeEventListener("cancel", cancel);
      el.close();
    };
  }, []);
  return <dialog ref={ref} className={wide ? "wide" : ""} aria-label={title}><header className="dialog-header"><h2>{title}</h2><button className="icon-button" aria-label="关闭" onClick={onClose}><Icon icon={X} /></button></header><div className="dialog-body">{children}</div></dialog>;
}
function Login({ onLogin, needsSetup }) {
  const [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [setup, setSetup] = useState(needsSetup);
  return <main className="login"><div className="login-paper"><div className="brand"><span className="brand-mark"><Feather size={25} /></span><b>留迹</b></div><h1>写下此刻，<br />留住每一次表达。</h1><p>{setup ? "第一次见面，为你的文字设置一把钥匙。" : "散落在各处的文字，在这里慢慢成册。"}</p><form onSubmit={async (event) => {
    event.preventDefault(); if (busy) return;
    if (setup && password !== confirmation) { setError("两次密码不一致"); return; }
    setBusy(true); setError("");
    try { await api(setup ? "/setup" : "/login", { method: "POST", body: { password, ...(setup ? { confirmation } : {}) } }); onLogin(); }
    catch (error) { setError(error.message); if (setup && error.status === 409) { setSetup(false); setPassword(""); setConfirmation(""); } }
    finally { setBusy(false); }
  }}><label htmlFor="password">{setup ? "设置密码 · 至少 10 个字符" : "打开你的文字档案"}</label><input id="password" type="password" autoComplete={setup ? "new-password" : "current-password"} minLength={setup ? 10 : 1} maxLength={200} required disabled={busy} value={password} placeholder={setup ? "设置一个私密密码" : "输入密码"} onChange={(event) => setPassword(event.target.value)} />{setup && <><label htmlFor="password-confirmation">再次输入密码</label><input id="password-confirmation" type="password" autoComplete="new-password" minLength={10} maxLength={200} required disabled={busy} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></>}{error && <p role="alert" className="error">{error}</p>}<Button kind="primary" disabled={busy}>{busy ? "正在打开…" : setup ? "设置密码并进入" : "进入留迹"}<ChevronRight size={16} /></Button></form><small>{setup ? "请先在可信网络完成首次设置" : "忘记密码？请由部署管理员在 Docker 终端重置。"}</small></div></main>;
}
function PasswordSettings({ notify }) {
  const [editing, setEditing] = useState(false), [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  return <section className="settings-section"><div className="section-label"><KeyRound size={18} /><h3>登录密码</h3></div><p className="subtle">你已经登录，可以直接设置新密码。修改后其他设备需要重新登录，当前设备继续使用。</p>{editing ? <form onSubmit={async (event) => {
    event.preventDefault(); if (busy) return;
    if (password !== confirmation) { setError("两次密码不一致"); return; }
    setBusy(true); setError("");
    try { await api("/password", { method: "POST", body: { password, confirmation } }); setEditing(false); setPassword(""); setConfirmation(""); notify("密码已更新，其他设备的旧会话已退出"); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }}><label htmlFor="new-password">新密码 · 至少 10 个字符</label><input id="new-password" type="password" autoComplete="new-password" minLength={10} maxLength={200} required disabled={busy} value={password} onChange={(event) => setPassword(event.target.value)} /><label htmlFor="confirm-new-password">再次输入新密码</label><input id="confirm-new-password" type="password" autoComplete="new-password" minLength={10} maxLength={200} required disabled={busy} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />{error && <p role="alert" className="error">{error}</p>}<div className="form-footer"><Button type="button" disabled={busy} onClick={() => { setEditing(false); setPassword(""); setConfirmation(""); setError(""); }}>取消</Button><Button kind="primary" disabled={busy}>{busy ? "正在更新…" : "保存新密码"}</Button></div></form> : <Button onClick={() => setEditing(true)}>修改密码</Button>}</section>;
}
function ExportDialog({ text, date, onClose }) {
  const [pages, setPages] = useState([]), [page, setPage] = useState(0), [card, setCard] = useState(null), [error, setError] = useState(""), [done, setDone] = useState("");
  useEffect(() => {
    let disposed = false;
    prepareCards(text).then((items) => {
      if (!disposed) setPages(items);
    }).catch((e) => {
      if (!disposed) setError(e.message);
    });
    return () => {
      disposed = true;
    };
  }, [text]);
  useEffect(() => {
    if (!pages.length) return;
    let disposed = false, url;
    setCard(null);
    setDone("");
    renderCard(pages[page], date, page, pages.length).then((item) => {
      url = item.url;
      if (disposed) URL.revokeObjectURL(url);
      else setCard(item);
    }).catch((e) => {
      if (!disposed) setError(e.message);
    });
    return () => {
      disposed = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [pages, page, date]);
  const shareFile = card ? new File([card.blob], card.name, { type: "image/png" }) : null;
  return <Dialog title="把文字，存成图片" wide onClose={onClose}><p className="subtle">统一排版，保留你写下的每一段。{pages.length > 1 ? `共 ${pages.length} 张，按顺序保存即可。` : "保存后，就可以去发朋友圈了。"}</p>{error && <p className="error" role="alert">{error}</p>}{!card && !error && <div className="empty compact"><Loader2 className="spin" />正在排版…</div>}{pages.length > 1 && <div className="export-navigation"><Button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>上一张</Button><span>{page + 1} / {pages.length}</span><Button disabled={page === pages.length - 1} onClick={() => setPage((p) => p + 1)}>下一张</Button></div>}{card && <div className="export-preview"><img src={card.url} alt={`文字图片，第 ${page + 1} 张`} /><Button kind="primary" icon={ArrowDownToLine} onClick={() => {
    downloadCard(card);
    setDone(`第 ${page + 1} 张已开始下载`);
  }}>保存{pages.length > 1 ? `第 ${page + 1} 张` : "图片"}</Button>{navigator.canShare?.({ files: [shareFile] }) && <Button onClick={async () => {
    try {
      await navigator.share({ files: [shareFile] });
    } catch (e) {
      if (e.name !== "AbortError") setError("系统分享暂不可用，请保存图片。");
    }
  }}>用系统分享</Button>}</div>}<p role="status" className="subtle">{done}</p></Dialog>;
}
function PublishDialog({ entry, onClose, onDone }) {
  const [platform, setPlatform] = useState("朋友圈"), [date, setDate] = useState(shanghaiInput()), [url, setUrl] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const key = useRef(newKey());
  return <Dialog title="记下这次发布" onClose={() => {
    if (!busy) onClose();
  }}><p className="subtle">发完之后，给这段文字留下一个时间坐标。</p><form onSubmit={async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const saved = await api(`/entries/${entry.id}/publications`, { method: "POST", body: { platform, publishedAt: `${date}:00+08:00`, url, note: "", expectedVersion: entry.version, idempotencyKey: key.current } });
      onDone(saved);
    } catch (e2) {
      setError(e2.message);
    } finally {
      setBusy(false);
    }
  }}><label htmlFor="platform">发布到</label><div className="platform-choices">{defaultPlatforms.slice(0, 4).map((p) => <button type="button" disabled={busy} key={p} className={p === platform ? "selected" : ""} onClick={() => {
    setPlatform(p);
    key.current = newKey();
  }}>{p}</button>)}</div><input id="platform" maxLength={40} value={platform} disabled={busy} onChange={(e) => {
    setPlatform(e.target.value);
    key.current = newKey();
  }} required placeholder="也可以填写其他平台" /><label htmlFor="date">发布时间 <span className="subtle">· 上海时间</span></label><input id="date" type="datetime-local" required value={date} max={shanghaiInput()} disabled={busy} onChange={(e) => {
    setDate(e.target.value);
    key.current = newKey();
  }} /><label htmlFor="post-url">原帖链接 <span className="subtle">· 选填</span></label><input id="post-url" type="url" value={url} disabled={busy} placeholder="朋友圈没有链接，可以留空" onChange={(e) => {
    setUrl(e.target.value);
    key.current = newKey();
  }} />{error && <p role="alert" className="error">{error}</p>}<div className="form-footer"><span className="subtle">只记录，不会自动发帖</span><Button kind="primary" disabled={busy || !platform.trim()}>{busy ? "记录中…" : "确认已发布"}</Button></div></form></Dialog>;
}
function Editor({ initial, onBack, onChanged, notify }) {
  const [entry, setEntry] = useState(initial), [text, setText] = useState(initial.text), [saveState, setSaveState] = useState("saved"), [error, setError] = useState(""), [modal, setModal] = useState(""), [actionBusy, setActionBusy] = useState(false);
  const current = useRef(initial), value = useRef(initial.text), saved = useRef(initial.text), pending = useRef(null), mounted = useRef(true);
  const area = useRef();
  useEffect(() => {
    mounted.current = true;
    area.current?.focus();
    return () => {
      mounted.current = false;
    };
  }, []);
  async function flush() {
    if (pending.current) return pending.current;
    pending.current = (async () => {
      while (value.current !== saved.current) {
        setSaveState("saving");
        const snapshot = value.current;
        try {
          const result = await api(`/entries/${current.current.id}`, { method: "PUT", body: { text: snapshot, expectedVersion: current.current.version } });
          current.current = result;
          saved.current = snapshot;
          if (mounted.current) {
            setEntry(result);
            onChanged();
          }
        } catch (e) {
          setError(e.message);
          setSaveState("error");
          throw e;
        }
      }
      setSaveState("saved");
      setError("");
      return current.current;
    })();
    try {
      return await pending.current;
    } finally {
      pending.current = null;
    }
  }
  useEffect(() => {
    if (text === saved.current) return;
    setSaveState("pending");
    const timer = setTimeout(() => flush().catch(() => {
    }), 850);
    return () => clearTimeout(timer);
  }, [text]);
  useEffect(() => {
    const handler = (e) => {
      if (value.current !== saved.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);
  async function action(fn) {
    setActionBusy(true);
    try {
      const savedEntry = await flush();
      await fn(savedEntry);
    } catch (e) {
      setError(e.message);
    } finally {
      setActionBusy(false);
    }
  }
  const count = Array.from(text.replace(/\s/g, "")).length;
  return <section className="editor-page"><header className="editor-header"><Button icon={ArrowLeft} onClick={() => action(() => onBack())} disabled={actionBusy}>返回</Button><div className={`save-state ${saveState === "error" ? "error" : ""}`} role="status">{saveState === "saved" ? <><Check size={14} />已保存</> : saveState === "saving" ? "保存中…" : saveState === "error" ? "未保存" : "等待保存…"}</div><div className="editor-actions"><Button icon={ArrowDownToLine} onClick={() => action(() => setModal("export"))} disabled={!text.trim() || actionBusy}>存成图片</Button><Button kind="primary" onClick={() => action(() => setModal("publish"))} disabled={!text.trim() || actionBusy}>记录发布</Button></div></header><div className="writing-wrap"><div className="writing-meta"><span>{formatDate(initial.createdAt, { year: "numeric", month: "long", day: "numeric" })}</span><span>随手写下，不必命题</span></div><textarea ref={area} className="writing-paper" aria-label="笔记正文" placeholder={"此刻，有什么想写下的？\n\n从一句话开始就好。"} maxLength={1e5} readOnly={actionBusy} value={text} onChange={(e) => {
    value.current = e.target.value;
    setText(e.target.value);
  }} spellCheck="false" />{error && <div className="save-error" role="alert"><p>{error}。当前文字仍保留在编辑区。</p><Button onClick={() => action(() => {
  })}>重试保存</Button><Button onClick={() => setModal("export")}>先存成图片</Button><Button disabled={actionBusy} onClick={async () => {
    setActionBusy(true);
    try {
      const rescued = await api("/entries", { method: "POST", body: { text: value.current } });
      current.current = rescued;
      saved.current = value.current;
      setEntry(rescued);
      setError("");
      setSaveState("saved");
      notify("已另存为新草稿，原稿保留");
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setActionBusy(false);
    }
  }}>另存新草稿</Button></div>}<footer className="writing-footer"><span>{count} 字 · 自动保存</span><button className="text-button editor-delete" disabled={actionBusy} onClick={() => action(async (savedEntry) => {
    if (savedEntry.publications.length) { setModal("trash"); return; }
    await api(`/entries/${savedEntry.id}/trash`, { method: "POST", body: { expectedVersion: savedEntry.version, draftOnly: true } });
    onChanged(); onBack(); notify("草稿已移至回收站，可随时恢复。");
  })}><Trash2 size={17} aria-hidden="true" />删除</button></footer>{entry.publications.length > 0 && <div className="entry-history"><h3>这段文字的足迹</h3>{entry.publications.map((p) => <div key={p.id}><span className="platform-dot" />{p.platform}<time>{formatDate(p.publishedAt, { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}</time></div>)}</div>}</div>{modal === "export" && <ExportDialog text={text} date={entry.createdAt} onClose={() => setModal("")} />}{modal === "publish" && <PublishDialog entry={current.current} onClose={() => setModal("")} onDone={(e) => {
    current.current = e;
    setEntry(e);
    setModal("");
    onChanged();
    notify("发布已记录，时间轴多了一枚足迹。");
  }} />}{modal === "trash" && <Dialog title="删除这篇正文？" onClose={() => setModal("")}><p>这篇正文已经发布。删除后，原稿和发布记录会一起移入回收站，之后可以恢复。</p><div className="form-footer"><Button onClick={() => setModal("")}>取消</Button><Button kind="primary" disabled={actionBusy} onClick={() => action(async (e) => {
    await api(`/entries/${e.id}/trash`, { method: "POST", body: { expectedVersion: e.version } });
    onChanged();
    onBack();
    notify("已移至回收站，可随时恢复。");
  })}>确认删除</Button></div></Dialog>}</section>;
}
function SettingsDialog({ onClose, onLogout, notify, authRequired }) {
  const [tokens, setTokens] = useState([]), [name, setName] = useState("工作台"), [scope, setScope] = useState("read"), [issued, setIssued] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [revoke, setRevoke] = useState(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const endpoint = `${location.origin}/mcp`;
  const load = () => api("/tokens").then((x) => setTokens(x.items)).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  return <Dialog title="连接与存档" onClose={onClose}>{authRequired && <PasswordSettings notify={notify} />}<section className="settings-section"><div className="section-label"><KeyRound size={18} /><h3>MCP 连接</h3></div><p className="subtle">让工作台读写这里的文字，内容始终保存在留迹。</p><label>Streamable HTTP 地址</label><div className="copy-row"><code>{endpoint}</code><button className="icon-button" aria-label="复制 MCP 地址" onClick={async () => {
    try {
      await navigator.clipboard.writeText(endpoint);
      notify("地址已复制");
    } catch {
      setError("请选中上方地址手动复制。");
    }
  }}><Copy size={16} /></button></div><div className="token-form"><input aria-label="连接名称" value={name} maxLength={50} onChange={(e) => setName(e.target.value)} /><select aria-label="MCP 权限" value={scope} onChange={(e) => setScope(e.target.value)}><option value="read">只读</option><option value="write">读写</option></select><Button disabled={busy || !name.trim()} onClick={async () => {
    setBusy(true);
    try {
      setIssued(await api("/tokens", { method: "POST", body: { name, scope } }));
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }}>创建令牌</Button></div>{issued && <div className="token-reveal"><strong>令牌只显示这一次，请保存到工作台的凭据设置。</strong><textarea readOnly aria-label="新 MCP 令牌" value={issued.token} onFocus={(e) => e.target.select()} /><small>请求头使用 Authorization: Bearer &lt;令牌&gt;</small><Button onClick={() => setIssued(null)}>已保存，收起</Button></div>}<div className="tokens">{tokens.map((t) => <div key={t.id}><span>{t.name}<small>{t.scope === "write" ? "读写" : "只读"} · 尾号 {t.tail}</small></span><button className="text-button" onClick={() => setRevoke(t)}>撤销</button></div>)}</div>{revoke && <div className="notice">撤销「{revoke.name}」后，该连接会立即失效。<div className="form-footer"><Button onClick={() => setRevoke(null)}>取消</Button><Button disabled={busy} onClick={async () => {
    setBusy(true);
    try {
      await api(`/tokens/${revoke.id}`, { method: "DELETE" });
      setRevoke(null);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }}>确认撤销</Button></div></div>}</section><section className="settings-section"><div className="section-label"><ArrowDownToLine size={18} /><h3>完整备份</h3></div><p className="subtle">下载 SQLite 备份，包含全部文字、发布快照及私密连接信息，请妥善保管。</p><a className="button" href="/api/backup" download>下载备份</a></section>{error && <p className="error" role="alert">{error}</p>}<div className="settings-footer"><span>留迹 v1.1.0</span>{authRequired && <Button icon={LogOut} onClick={() => setConfirmLogout(true)}>退出登录</Button>}</div>{confirmLogout && <div className="notice">退出当前设备？已保存的文字仍会留在这里。<div className="form-footer"><Button onClick={() => setConfirmLogout(false)}>取消</Button><Button kind="primary" disabled={busy} onClick={async () => { setBusy(true); try { await onLogout(); } finally { setBusy(false); setConfirmLogout(false); } }}>确认退出</Button></div></div>}</Dialog>;
}
function DraftSwipe({ enabled, disabled, onDelete, children }) {
  const [offset, setOffset] = useState(0), [dragging, setDragging] = useState(false);
  const gesture = useRef(null), currentOffset = useRef(0), suppressClick = useRef(0);
  const shift = value => { currentOffset.current = value; setOffset(value); };
  const opened = offset <= -40;
  const finish = (event, cancelled = false) => {
    const g = gesture.current; gesture.current = null; setDragging(false);
    if (!g) return;
    if (g.axis === 'x') {
      suppressClick.current = Date.now() + 400;
      shift(cancelled ? g.start : currentOffset.current <= -40 ? -88 : 0);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  if (!enabled) return children;
  return <div className={`draft-swipe${opened ? ' is-open' : ''}${dragging ? ' is-dragging' : ''}`} style={{ '--draft-offset': `${offset}px` }} tabIndex={0} aria-label="草稿操作，向左滑动或按左方向键显示删除" onKeyDown={event => {
    if (disabled || event.target !== event.currentTarget) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); shift(-88); }
    if (event.key === 'ArrowRight' || event.key === 'Escape') { event.preventDefault(); shift(0); }
  }} onPointerDown={event => {
    if (disabled || !matchMedia('(max-width: 720px), (pointer: coarse)').matches || event.button !== 0 || event.target.closest('.draft-swipe-delete')) return;
    gesture.current = { x: event.clientX, y: event.clientY, start: currentOffset.current, axis: '' };
  }} onPointerMove={event => {
    const g = gesture.current; if (!g) return;
    const dx = event.clientX - g.x, dy = event.clientY - g.y;
    if (!g.axis && Math.max(Math.abs(dx),Math.abs(dy)) > 8) g.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
    if (g.axis !== 'x') return;
    event.currentTarget.setPointerCapture(event.pointerId); setDragging(true);
    shift(Math.max(-88, Math.min(0, g.start + dx)));
  }} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onClickCapture={event => {
    if (event.target.closest('.draft-swipe-delete')) return;
    if (Date.now() < suppressClick.current || opened) { event.preventDefault(); event.stopPropagation(); if (Date.now() >= suppressClick.current) shift(0); }
  }}><button type="button" className="draft-swipe-delete" aria-label="删除草稿" aria-hidden={!opened} tabIndex={opened ? 0 : -1} disabled={disabled || !opened} onClick={onDelete}><Trash2 size={20} /><span>{disabled ? '删除中' : '删除'}</span></button>{children}</div>;
}

function App() {
  const [session, setSession] = useState(null), [view, setView] = useState(["timeline", "drafts", "trash"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "timeline"), [platform, setPlatform] = useState(""), [query, setQuery] = useState(""), [month, setMonth] = useState(""), [data, setData] = useState({ items: [], total: 0 }), [stats, setStats] = useState({ entries: 0, drafts: 0, publications: 0, platforms: [], months: [] }), [loading, setLoading] = useState(true), [error, setError] = useState(""), [entry, setEntry] = useState(null), [reading, setReading] = useState(null), [exported, setExported] = useState(null), [settings, setSettings] = useState(false), [refresh, setRefresh] = useState(0), [toast, setToast] = useState(""), [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const deleting = useRef(false);
  const request = useRef(0), toastTimer = useRef();
  const notify = (message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  };
  const changed = () => setRefresh((n) => n + 1);
  useEffect(() => {
    api("/session").then(setSession).catch((e) => {
      setError(e.message);
      setLoading(false);
    });
  }, []);
  useEffect(() => {
    const f = () => {
      const h = location.hash.slice(1);
      if (["timeline", "drafts", "trash"].includes(h)) setView(h);
    };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  useEffect(() => {
    if (!session?.authenticated || entry) return;
    const seq = ++request.current;
    setLoading(true);
    setData({ items: [], total: 0 });
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query, platform, limit: "40", ...month ? { month } : {}, ...view !== "timeline" ? { status: view } : {} });
        const [list, s] = await Promise.all([api(`/${view === "timeline" ? "timeline" : "entries"}?${params}`), api("/stats")]);
        if (seq === request.current) {
          setData({ ...list, view });
          setStats(s);
          setError("");
        }
      } catch (e) {
        if (seq === request.current) {
          setError(e.message);
          if (e.status === 401) setSession({ authenticated: false });
        }
      } finally {
        if (seq === request.current) setLoading(false);
      }
    }, query ? 200 : 0);
    return () => {
      clearTimeout(timer);
      request.current++;
    };
  }, [session, view, platform, query, month, refresh, entry]);
  async function more() {
    const seq = request.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: query, platform, limit: "40", offset: String(data.items.length), ...month ? { month } : {}, ...view !== "timeline" ? { status: view } : {} });
      const next = await api(`/${view === "timeline" ? "timeline" : "entries"}?${params}`);
      if (seq === request.current) setData((d) => ({ ...d, items: [...d.items, ...next.items], total: next.total }));
    } catch (e) {
      setError(e.message);
    } finally {
      if (seq === request.current) setLoading(false);
    }
  }
  async function deleteDraft(item) {
    if (deleting.current) return;
    deleting.current = true; setDeletingId(item.id);
    try {
      await api(`/entries/${item.id}/trash`, { method: "POST", body: { expectedVersion: item.version, draftOnly: true } });
      request.current++;
      setData(value => ({ ...value, items: value.items.filter(entry => entry.id !== item.id), total: Math.max(0, value.total - 1) }));
      changed(); notify("草稿已移到回收站，可以随时恢复");
    } catch (error) { notify(error.message); }
    finally { deleting.current = false; setDeletingId(""); }
  }
  async function openEntry(id) {
    try {
      const e = await api(`/entries/${id}`);
      if (e.trashedAt) {
        notify("这篇内容已在回收站");
        return;
      }
      setReading(null);
      setEntry(e);
    } catch (e) {
      notify(e.message);
    }
  }
  function switchView(next) {
    setView(next);
    setPlatform("");
    setMonth("");
    location.hash = next;
  }
  if (!session) return <div className="app-loading">{error ? <><p>{error}</p><Button onClick={() => location.reload()}>重新连接</Button></> : <><Feather /><span>正在打开留迹…</span></>}</div>;
  if (!session.authenticated) return <Login needsSetup={session.needsSetup} onLogin={() => setSession({ authenticated: true, authRequired: true })} />;
  const filtered = !!query || !!platform || !!month;
  const visibleData = data.view === view ? data : { items: [], total: 0 };
  return <div className="app-shell"><aside className="sidebar"><a className="brand" href="#timeline" onClick={(e) => {
    if (entry) e.preventDefault();
    else switchView("timeline");
  }}><span className="brand-mark"><Feather size={24} /></span><div><b>留迹</b><small>表达有迹可循</small></div></a><Button kind="primary write-button" icon={Plus} disabled={creating || !!entry} onClick={async () => {
    setCreating(true);
    try {
      const e = await api("/entries", { method: "POST", body: { text: "" } });
      setEntry(e);
      changed();
    } catch (e) {
      notify(e.message);
    } finally {
      setCreating(false);
    }
  }}>写一段</Button><nav aria-label="档案导航"><button disabled={!!entry} className={view === "timeline" ? "active" : ""} onClick={() => switchView("timeline")}><Icon icon={Clock3} /><span>时间轴</span><small>{stats.publications || ""}</small></button><button disabled={!!entry} className={view === "drafts" ? "active" : ""} onClick={() => switchView("drafts")}><Icon icon={FileText} /><span>草稿</span><small>{stats.drafts || ""}</small></button></nav><div className="platform-nav"><span className="eyebrow">我的发布平台</span>{stats.platforms.length ? stats.platforms.map((p) => <button disabled={!!entry} key={p.platform} className={platform === p.platform ? "active" : ""} onClick={() => {
    setView("timeline");
    location.hash = "timeline";
    setPlatform(platform === p.platform ? "" : p.platform);
  }}><span className="platform-dot" /><span>{p.platform}</span><small>{p.count}</small></button>) : <p>第一次发布之后，<br />你的平台会出现在这里。</p>}</div><div className="sidebar-bottom"><p className="sidebar-quote">文字会散落，<br />表达值得留下。</p><button aria-label="回收站" disabled={!!entry} className={view === "trash" ? "active" : ""} onClick={() => switchView("trash")}><Icon icon={Trash2} /><span>回收站</span></button><button aria-label="连接与存档" onClick={() => setSettings(true)}><Icon icon={Settings} /><span>连接与存档</span></button></div></aside><main className="main">{entry ? <Editor key={entry.id} initial={entry} onBack={() => {
    setEntry(null);
    changed();
  }} onChanged={changed} notify={notify} /> : <><header className="page-header"><div className="eyebrow">YOUR WORDS, OVER TIME</div><div className="heading-row"><h1>{view === "timeline" ? "每一次表达，都有迹可循。" : view === "drafts" ? "还没说完的话，慢慢写。" : "暂时收起的文字。"}</h1><span className="header-count">{view === "timeline" ? stats.publications : view === "drafts" ? stats.drafts : visibleData.total}<small>{view === "timeline" ? "次发布" : view === "drafts" ? "篇草稿" : "篇文字"}</small></span></div><p>{view === "timeline" ? "在不同的地方发声，在同一条时间线上重逢。" : view === "drafts" ? "这里没有进度条。一句话，也值得好好留下。" : "恢复后，文字和它的发布记录会一起回来。"}</p></header><div className="filterbar"><div className="view-label"><BookOpen size={18} /><span>{platform || { timeline: "全部足迹", drafts: "我的草稿", trash: "回收站" }[view]}</span>{platform && <button className="icon-button" aria-label="清除平台筛选" onClick={() => setPlatform("")}><X size={14} /></button>}</div><div className="filters">{view === "timeline" && stats.platforms.length > 0 && <select className="mobile-platform-filter" aria-label="按平台筛选" value={platform} onChange={(e) => setPlatform(e.target.value)}><option value="">所有平台</option>{stats.platforms.map((p) => <option key={p.platform} value={p.platform}>{p.platform}</option>)}</select>}{view === "timeline" && stats.months.length > 0 && <select aria-label="按月份筛选" value={month} onChange={(e) => setMonth(e.target.value)}><option value="">所有月份</option>{stats.months.map((m) => <option key={m} value={m}>{m.replace("-", " 年 ")} 月</option>)}</select>}<label className="search"><Search size={16} /><input aria-label="搜索文字" value={query} maxLength={200} onChange={(e) => setQuery(e.target.value)} placeholder="找一段文字…" />{query && <button aria-label="清空搜索" onClick={() => setQuery("")}><X size={14} /></button>}</label></div></div>{error && <div className="notice error" role="alert">{error}<Button onClick={changed}>重试</Button></div>}<div className="timeline" aria-busy={loading}>{loading && !visibleData.items.length ? <div className="empty"><Loader2 className="spin" /><p>正在翻开档案…</p></div> : !visibleData.items.length ? <div className="empty"><div className="empty-art"><div className="paper-a" /><div className="paper-b"><Feather size={28} /><i /><i /><i /></div></div><h2>{filtered ? "还没找到这段文字" : view === "timeline" ? "从第一段想说的话开始" : view === "drafts" ? "你的下一句话，写在这里" : "这里空空的，很好。"}</h2><p>{filtered ? "试试别的关键词，或清除筛选。" : view === "timeline" ? "写下来，存成图片。发布之后，把这一刻留在这里。" : view === "drafts" ? "写一段属于此刻的文字，不必急着发布。" : "暂时没有移入回收站的内容。"}</p>{filtered ? <Button onClick={() => {
    setQuery("");
    setPlatform("");
    setMonth("");
  }}>清除筛选</Button> : view !== "trash" && <Button kind="primary" icon={Plus} disabled={creating} onClick={async () => {
    setCreating(true);
    try {
      setEntry(await api("/entries", { method: "POST", body: { text: "" } }));
      changed();
    } catch (e) {
      notify(e.message);
    } finally {
      setCreating(false);
    }
  }}>写下第一段</Button>}</div> : visibleData.items.map((item, index) => {
    const pub = view === "timeline", body = pub ? item.snapshot : item, date = pub ? item.publishedAt : item.updatedAt, group = formatDate(date, { year: "numeric", month: "long" }), prev = visibleData.items[index - 1], previous = prev ? formatDate(pub ? prev.publishedAt : prev.updatedAt, { year: "numeric", month: "long" }) : "";
    return <React.Fragment key={item.id}>{group !== previous && <div className="month-heading"><span>{group}</span><div /></div>}<article className="timeline-row"><div className="date-rail"><strong>{formatDate(date, { day: "2-digit" }).replace("日", "")}</strong><small>{formatDate(date, { weekday: "short" })}</small></div><DraftSwipe enabled={view === "drafts"} disabled={!!deletingId} onDelete={() => deleteDraft(item)}><div className="entry-card"><div className="card-top"><span className="platform-badge"><span className="platform-dot" />{pub ? item.platform : view === "trash" ? "已收起" : "未发布"}</span><time>{formatDate(date, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}</time></div><button className="card-text" onClick={() => view === "trash" ? setReading({ snapshot: body, ...item }) : pub ? setReading(item) : openEntry(item.id)}>{body.text || "还没有写下文字…"}</button><div className="card-footer"><span>{Array.from((body.text || "").replace(/\s/g, "")).length} 字</span>{view === "trash" ? <button className="text-button" onClick={async () => {
      try {
        await api(`/entries/${item.id}/restore`, { method: "POST", body: { expectedVersion: item.version } });
        changed();
        notify("文字已恢复");
      } catch (e) {
        notify(e.message);
      }
    }}>恢复这篇</button> : <button className="text-button" onClick={() => pub ? setReading(item) : openEntry(item.id)}>{pub ? "展开这段文字" : "继续写"}<ArrowUpRight size={15} /></button>}{view === "drafts" && <button type="button" className="icon-button draft-desktop-delete" aria-label="删除草稿" title="删除草稿" disabled={!!deletingId} onClick={() => deleteDraft(item)}>{deletingId === item.id ? <Loader2 size={18} className="spin" /> : <Trash2 size={18} aria-hidden="true" />}</button>}</div></div></DraftSwipe></article></React.Fragment>;
  })}{visibleData.items.length < visibleData.total && <div className="load-more"><Button disabled={loading} onClick={more}>{loading ? "读取中…" : "再往前翻一翻"}</Button></div>}{visibleData.items.length > 0 && visibleData.items.length >= visibleData.total && <p className="timeline-end">—— 表达留在这里，生活继续向前 ——</p>}</div></>}</main>{toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}{reading && <Dialog title={reading.platform ? `发布于${reading.platform}` : "这段文字"} wide onClose={() => setReading(null)}><p className="reading-meta">{formatDate(reading.publishedAt || reading.updatedAt, { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}</p><div className="reading-text">{reading.snapshot.text || "还没有写下文字。"}</div><div className="reading-actions"><Button icon={ArrowDownToLine} disabled={!reading.snapshot.text.trim()} onClick={() => {
    setExported({ text: reading.snapshot.text, date: reading.publishedAt || reading.updatedAt });
  }}>存成图片</Button>{reading.entryId && <Button onClick={() => openEntry(reading.entryId)}>编辑原稿</Button>}{reading.url && <a className="button" href={reading.url} target="_blank" rel="noopener noreferrer">查看原帖<ArrowUpRight size={15} /></a>}</div>{reading.platform && <p className="subtle">这是发布时保存的文字，编辑原稿不会改变它。</p>}</Dialog>}{exported && <ExportDialog {...exported} onClose={() => setExported(null)} />}{settings && <SettingsDialog authRequired={session.authRequired} onClose={() => setSettings(false)} notify={notify} onLogout={async () => {
    if (entry) {
      notify("请先保存并返回，再退出登录。");
      return;
    }
    try {
      await api("/logout", { method: "POST" });
      setSettings(false);
      setSession({ authenticated: false });
    } catch (e) {
      notify(e.message);
    }
  }} />}</div>;
}
createRoot(document.getElementById("root")).render(<App />);
