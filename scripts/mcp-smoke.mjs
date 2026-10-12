// Read-only production smoke check. Supply the token over stdin, never as an argument.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const endpoint = process.env.LIUJI_MCP_URL;
if (!endpoint) throw new Error('需要 LIUJI_MCP_URL，例如 http://NAS:18910/mcp');
if (process.stdin.isTTY) throw new Error('请从安全的标准输入传入 MCP 令牌，不要将它写进命令行参数。');
let token='';for await(const chunk of process.stdin)token+=chunk;token=token.trim();
if(!token)throw new Error('缺少 MCP 令牌');
const client=new Client({name:'liuji-smoke',version:'1.1.0'});
try {
 await client.connect(new StreamableHTTPClientTransport(new URL(endpoint),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
 const list=await client.listTools();
 const result=await client.callTool({name:'get_stats',arguments:{}});
 if(result.isError)throw new Error('统计工具调用失败');
 console.log(JSON.stringify({ok:true,tools:list.tools.map(t=>t.name),statsReadable:!!result.structuredContent}));
} finally { await client.close(); }
