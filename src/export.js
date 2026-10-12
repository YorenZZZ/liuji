// Fixed typography: the first line is body text, with no separate title treatment.
export const CARD = { width: 1080, padding: 106, fontSize: 42, lineHeight: 76, maxLines: 15 };
const font = '"PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif';
const punctuation = /^[，。！？、；：）》」』】…,.!?;:)\]]/;
export function layoutText(text, measure, maxWidth) {
  const lines = [];
  const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!paragraph) { lines.push(''); continue; }
    let line = '';
    for (const { segment } of segmenter.segment(paragraph)) {
      if (line && measure(line + segment) > maxWidth) {
        if (punctuation.test(segment)) { lines.push(line + segment); line = ''; }
        else { lines.push(line); line = segment; }
      } else line += segment;
    }
    if (line) lines.push(line);
  }
  return lines;
}
export function paginateLines(lines) {
  const pages = [];
  for (let i = 0; i < lines.length; i += CARD.maxLines) pages.push(lines.slice(i, i + CARD.maxLines));
  return pages.length ? pages : [['']];
}
export async function prepareCards(text) {
  await document.fonts.ready;
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = `400 ${CARD.fontSize}px ${font}`;
  // Reserve one full glyph for hanging punctuation at the right edge.
  return paginateLines(layoutText(text, value => probe.measureText(value).width, CARD.width - CARD.padding * 2 - CARD.fontSize));
}
export async function renderCard(lines, date, index, total) {
  const canvas = document.createElement('canvas');
  canvas.width = CARD.width;
  canvas.height = Math.max(800, lines.length * CARD.lineHeight + 292);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f8f6f0'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#303b34'; ctx.font = `400 ${CARD.fontSize}px ${font}`; ctx.textBaseline = 'top';
  lines.forEach((line, i) => ctx.fillText(line, CARD.padding, 124 + i * CARD.lineHeight));
  ctx.fillStyle = '#7c8477'; ctx.fillRect(CARD.padding, canvas.height - 116, 40, 2);
  ctx.font = `400 23px ${font}`;
  const dateLabel = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date));
  ctx.fillText(dateLabel, CARD.padding, canvas.height - 87);
  if (total > 1) { ctx.textAlign = 'right'; ctx.fillText(`${index + 1} / ${total}`, canvas.width - CARD.padding, canvas.height - 87); }
  const blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('图片生成失败')), 'image/png'));
  return { url: URL.createObjectURL(blob), blob, name: `留迹-${dateLabel}-${index + 1}.png`, width: canvas.width, height: canvas.height };
}
export function downloadCard(card) {
  const a = document.createElement('a'); a.href = card.url; a.download = card.name;
  document.body.appendChild(a); a.click(); a.remove();
}
