import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutText, paginateLines, CARD } from '../src/export.js';
const measure=s=>Array.from(new Intl.Segmenter('zh-CN',{granularity:'grapheme'}).segment(s)).length;
test('line wrapping preserves paragraphs, Unicode graphemes and punctuation',()=>{
 assert.deepEqual(layoutText('第一段\r\n\r\n下一段',measure,5),['第一段','','下一段']);
 assert.deepEqual(layoutText('你好世界，下一句',measure,4),['你好世界，','下一句']);
 const emoji='👨‍👩‍👧‍👦';assert.deepEqual(layoutText(emoji+emoji+'你好',measure,1),[emoji,emoji,'你','好']);
 const text='中文English 123🚀'.repeat(50);assert.equal(layoutText(text,measure,17).join(''),text);
});
test('pagination keeps every line once and all text inside the image footer',()=>{
 const lines=Array.from({length:501},(_,i)=>`第${i}行`);const pages=paginateLines(lines);assert.deepEqual(pages.flat(),lines);assert.equal(pages.length,34);
 for(const p of pages){assert.ok(p.length<=CARD.maxLines);const bottom=124+(p.length-1)*CARD.lineHeight+CARD.fontSize;const height=Math.max(800,p.length*CARD.lineHeight+292);assert.ok(bottom<height-116);assert.ok(height<=1440);}
});
