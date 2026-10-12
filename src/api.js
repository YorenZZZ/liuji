export async function api(url, options = {}) {
  let response;
  try {
    response = await fetch(`/api${url}`, {
      ...options,
      signal: options.signal || AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', 'X-Liuji-Action': '1', ...options.headers },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
  } catch {
    throw new Error('暂时连不上留迹，请检查网络后重试');
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error('服务返回异常，请稍后重试'); }
  if (!response.ok) {
    const error = new Error(data.error || '请求失败'); error.status = response.status; throw error;
  }
  return data;
}
export const formatDate = (date, options = {}) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', ...options }).format(new Date(date));
export function shanghaiInput(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date).replace(' ', 'T');
}
export function newKey() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
