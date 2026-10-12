import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createStore } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const pub = (version, overrides={}) => ({ platform:'朋友圈', publishedAt:'2026-10-01T00:30:00+08:00', expectedVersion:version, idempotencyKey:'publication-test-001', ...overrides });
async function fixture(t) {
 const dir=await mkdtemp(path.join(tmpdir(),'liuji-test-'));
 const file=path.join(dir,'liuji.sqlite');const store=createStore(file);
 t.after(async()=>{store.close();await rm(dir,{recursive:true,force:true});});return {store,file,dir};
}
test('plain text, Unicode and line breaks persist; HTML stays escaped',async t=>{
 const {store}=await fixture(t);const text='一段文字\r\n\r\n<script>alert(1)</script> 👨‍👩‍👧‍👦';
 const e=store.createEntry({text});assert.equal(e.text,text.replaceAll('\r\n','\n'));assert.match(e.html,/&lt;script&gt;/);assert.equal(e.version,1);
 assert.throws(()=>store.createEntry({}),/text/);
});
test('publication snapshots survive edits, retries, trash and restore',async t=>{
 const {store}=await fixture(t);const e=store.createEntry({text:'原始文字'});
 const published=store.recordPublication(e.id,pub(e.version));assert.equal(published.publications.length,1);
 const changed=store.updateEntry(e.id,{text:'修改后的文字'},e.version);assert.equal(changed.version,2);
 assert.equal(store.timeline().items[0].snapshot.text,'原始文字');
 assert.equal(store.recordPublication(e.id,pub(e.version)).publications.length,1);
 assert.throws(()=>store.recordPublication(e.id,pub(e.version,{platform:'微博'})),/幂等/);
 assert.throws(()=>store.updateEntry(e.id,{text:'过时覆盖'},e.version),/另一处/);
 const trashed=store.trash(e.id,changed.version);assert.equal(store.timeline().total,0);assert.equal(store.list({status:'trash'}).total,1);
 assert.throws(()=>store.recordPublication(e.id,pub(trashed.version,{idempotencyKey:'new-test-publication'})),/恢复/);
 store.trash(e.id,trashed.version,true);assert.equal(store.timeline().total,1);assert.equal(store.timeline().items[0].snapshot.text,'原始文字');
});
test('multiple platforms, Shanghai month, snapshot search, pagination and drafts',async t=>{
 const {store}=await fixture(t);const e=store.createEntry({text:'跨月留念'});store.createEntry({text:'还没发布'});
 store.recordPublication(e.id,pub(1));store.recordPublication(e.id,pub(1,{platform:'小红书',publishedAt:'2026-09-01T00:00:00+08:00',idempotencyKey:'publication-test-002'}));
 store.updateEntry(e.id,{text:'原稿另写'},1);
 assert.equal(store.timeline({month:'2026-10'}).total,1);assert.equal(store.timeline({q:'跨月'}).total,2);assert.equal(store.timeline({q:'原稿另写'}).total,0);
 assert.equal(store.timeline({q:'title'}).total,0);assert.equal(store.timeline({platform:'小红书'}).total,1);
 assert.equal(store.timeline({limit:1,offset:1}).items.length,1);assert.equal(store.list({status:'drafts'}).total,1);assert.equal(store.stats().publications,2);
 assert.deepEqual(store.stats().months,['2026-10','2026-09']);
 assert.equal(store.list({platform:'小红书',month:'2026-10'}).total,0);
 assert.equal(store.list({platform:'小红书',month:'2026-09'}).total,1);
});
test('blank, future, unsafe links and conflicting versions are rejected',async t=>{
 const {store}=await fixture(t);let e=store.createEntry({text:' \n '});assert.throws(()=>store.recordPublication(e.id,pub(1)),/文字/);
 e=store.updateEntry(e.id,{text:'正文'},1);
 assert.throws(()=>store.recordPublication(e.id,pub(2,{publishedAt:'2099-01-01T00:00:00Z'})),/晚于/);
 assert.throws(()=>store.recordPublication(e.id,pub(2,{url:'javascript:alert(1)'})),/http/);
 assert.throws(()=>store.recordPublication(e.id,pub(1)),/更新/);assert.equal(store.stats().publications,0);
});
test('database reopens with notes, sessions, tokens and snapshots intact',async t=>{
 const {store,file}=await fixture(t);store.setPassword('local-test-password');const e=store.createEntry({text:'持久化'});store.recordPublication(e.id,pub(1));const token=store.issueToken('fixture','read');const session=store.session();
 const second=createStore(file);try{assert.equal(second.getEntry(e.id).text,'持久化');assert.equal(second.getEntry(e.id).publications.length,1);assert.equal(second.validSession(session),true);assert.equal(second.verifyToken(token.token).scope,'read');assert.equal(second.checkPassword('local-test-password'),true);}finally{second.close();}
});
async function webFixture(t) {
 const f=await fixture(t);f.store.setPassword('local-test-password');const server=createApp(f.store).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
 const url=`http://127.0.0.1:${server.address().port}`;
 const login=await fetch(url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'local-test-password'})});
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const request=(route,options={})=>fetch(url+route,{...options,headers:{cookie,'Content-Type':'application/json','X-Liuji-Action':'1',...options.headers},body:options.body===undefined?undefined:JSON.stringify(options.body)});
 return {...f,url,request,cookie};
}
test('HTTP authentication, CSRF, validation, save and online backup',async t=>{
 const {url,request,cookie,dir}=await webFixture(t);
 assert.equal((await fetch(url+'/api/entries')).status,401);
 assert.equal((await request('/api/entries',{method:'POST',body:{text:'test'},headers:{'X-Liuji-Action':''}})).status,403);
 assert.equal((await request('/api/entries',{method:'POST',body:{text:'test'},headers:{Origin:'https://foreign.invalid'}})).status,403);
 assert.equal((await request('/api/entries?limit=-1')).status,400);
 const made=await request('/api/entries',{method:'POST',body:{text:'HTTP正文'}});assert.equal(made.status,201);const e=await made.json();
 const saved=await request(`/api/entries/${e.id}`,{method:'PUT',body:{text:'HTTP新正文',expectedVersion:1}});assert.equal(saved.status,200);
 const record=await request(`/api/entries/${e.id}/publications`,{method:'POST',body:pub(2)});assert.equal(record.status,201);
 const response=await request('/api/backup');assert.equal(response.status,200);const file=path.join(dir,'backup.sqlite');await writeFile(file,Buffer.from(await response.arrayBuffer()));
 const db=new DatabaseSync(file);assert.equal(db.prepare('SELECT text FROM entries').get().text,'HTTP新正文');assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');db.close();
 await request('/api/logout',{method:'POST'});assert.equal((await fetch(url+'/api/entries',{headers:{cookie}})).status,401);
});
test('MCP protocol, tool scopes, writes, snapshot and immediate revocation',async t=>{
 const {url,store}=await webFixture(t);
 assert.equal((await fetch(url+'/mcp',{method:'POST'})).status,401);
 const read=store.issueToken('reader','read'),write=store.issueToken('writer','write');
 async function client(token){const c=new Client({name:'test',version:'1.0.0'});await c.connect(new StreamableHTTPClientTransport(new URL(url+'/mcp'),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));t.after(()=>c.close());return c;}
 const r=await client(read.token),w=await client(write.token);
 assert.equal((await r.listTools()).tools.length,4);assert.equal((await w.listTools()).tools.length,7);
 const denied=await r.callTool({name:'create_entry',arguments:{text:'denied'}});assert.equal(denied.isError,true);assert.equal(store.stats().entries,0);
 const created=await w.callTool({name:'create_entry',arguments:{text:'MCP 正文'}});assert.ok(!created.isError);const e=created.structuredContent;
 const updated=await w.callTool({name:'update_entry',arguments:{id:e.id,text:'MCP 新正文',expectedVersion:1}});assert.equal(updated.structuredContent.version,2);
 const recorded=await w.callTool({name:'record_publication',arguments:{id:e.id,...pub(2)}});assert.ok(!recorded.isError);
 const timeline=await r.callTool({name:'list_timeline',arguments:{}});assert.equal(timeline.structuredContent.items[0].snapshot.text,'MCP 新正文');
 assert.equal((await r.readResource({uri:'liuji://guide'})).contents.length,1);
 assert.ok(!JSON.stringify(store.tokenList()).includes(read.token));store.revokeToken(read.id);
 assert.equal((await fetch(url+'/mcp',{method:'POST',headers:{Authorization:`Bearer ${read.token}`}})).status,401);
});

test('LAN mode opens without login; MCP and cross-site writes remain guarded',async t=>{
 const {store}=await fixture(t);const server=createApp(store,{authRequired:false}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));const url=`http://127.0.0.1:${server.address().port}`;
 const session=await fetch(url+'/api/session').then(r=>r.json());assert.deepEqual(session,{authenticated:true,authRequired:false,needsSetup:false});
 for (const route of ['/api/setup','/api/password']) assert.equal((await fetch(url+route,{method:'POST',headers:{'Content-Type':'application/json','X-Liuji-Action':'1'},body:JSON.stringify({password:'new-test-password',confirmation:'new-test-password'})})).status,403);
 assert.equal((await fetch(url+'/api/entries')).status,200);
 const headers={'Content-Type':'application/json','X-Liuji-Action':'1'};
 assert.equal((await fetch(url+'/api/entries',{method:'POST',headers,body:JSON.stringify({text:'局域网正文'})})).status,201);
 assert.equal((await fetch(url+'/api/entries',{method:'POST',headers:{...headers,Origin:'https://foreign.invalid'},body:'{}'})).status,403);
 assert.equal((await fetch(url+'/api/entries',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
 assert.equal((await fetch(url+'/mcp',{method:'POST'})).status,401);
 assert.equal((await fetch(url+'/healthz').then(r=>r.json())).mcpConfigured,false);
 const response=await fetch(url+'/api/tokens',{method:'POST',headers,body:JSON.stringify({name:'LAN client',scope:'read'})});assert.equal(response.status,201);
 const {token}=await response.json();assert.equal(store.verifyToken(token).scope,'read');
 assert.equal((await fetch(url+'/healthz').then(r=>r.json())).mcpConfigured,true);
});

test('first-use password setup is guarded, one-time and creates a login session', async t => {
 const {store}=await fixture(t);const server=createApp(store).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
 const base=`http://127.0.0.1:${server.address().port}`;
 const setup=(body,headers={})=>fetch(base+'/api/setup',{method:'POST',headers:{'Content-Type':'application/json','X-Liuji-Action':'1',...headers},body:JSON.stringify(body)});
 assert.equal((await fetch(base+'/api/session').then(r=>r.json())).needsSetup,true);
 assert.equal((await setup({password:'short',confirmation:'short'})).status,400);
 const body={password:'first-test-password',confirmation:'first-test-password'};
 assert.equal((await setup(body,{'X-Liuji-Action':''})).status,403);
 assert.equal((await setup(body,{Origin:'https://foreign.invalid'})).status,403);
 assert.equal((await setup({...body,confirmation:'different-password'})).status,400);
 const response=await setup(body);assert.equal(response.status,201);
 const cookie=response.headers.get('set-cookie').split(';')[0];
 assert.equal((await fetch(base+'/api/stats',{headers:{cookie}})).status,200);
 assert.equal((await setup(body)).status,409);
 assert.equal(store.checkPassword(body.password),true);
});

test('logged-in password changes require no old password and revoke all old sessions', async t => {
 const {url,request,cookie,store}=await webFixture(t); const other=store.session();const token=store.issueToken('retained-mcp','read');
 const body={password:'changed-test-password',confirmation:'changed-test-password'};
 assert.equal((await fetch(url+'/api/password',{method:'POST',headers:{'Content-Type':'application/json','X-Liuji-Action':'1'},body:JSON.stringify(body)})).status,401);
 assert.equal((await request('/api/password',{method:'POST',body,headers:{Origin:'https://foreign.invalid'}})).status,403);
 assert.equal((await request('/api/password',{method:'POST',body,headers:{'X-Liuji-Action':''}})).status,403);
 assert.equal((await request('/api/password',{method:'POST',body:{...body,confirmation:'wrong'}})).status,400);
 assert.equal(store.validSession(other),true);
 const response=await request('/api/password',{method:'POST',body});assert.equal(response.status,200);
 const renewed=response.headers.get('set-cookie').split(';')[0];assert.notEqual(renewed,cookie);
 assert.equal(store.validSession(other),false);assert.equal((await request('/api/stats')).status,401);
 assert.equal((await fetch(url+'/api/stats',{headers:{cookie:renewed}})).status,200);
 assert.equal(store.checkPassword('local-test-password'),false);assert.equal(store.checkPassword(body.password),true);
 assert.equal(store.verifyToken(token.token).scope,'read');
 assert.equal((await fetch(url+'/api/logout',{method:'POST',headers:{cookie:renewed,'X-Liuji-Action':'1'}})).status,200);
 assert.equal((await fetch(url+'/api/stats',{headers:{cookie:renewed}})).status,401);
});
