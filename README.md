# 留迹

Docker自部署时间轴笔记工具，可快速导出为截图。

在一张干净的纸上写字，导出为排版图片。自己发布到朋友圈、小红书或其他平台后，登记平台、链接与时间，让散落的表达回到同一条时间线上。

- **专注文字**：统一字号、保留段落，没有格式工具栏、图片上传或主题切换。
- **图片导出**：暖白纸面，1080px PNG，长文自动分页，可逐张预览、下载；兼容的设备支持系统分享。
- **发布留档**：每次发布保存独立正文快照，修改原稿不会改写历史；支持关键词、平台与月份筛选。
- **可靠保存**：服务端 SQLite 自动保存、版本冲突保护、回收站恢复和在线备份。
- **MCP**：独立只读／读写令牌，让其他工具按权限读取与管理档案。
- **轻量独立**：无 AI 调用、外部字体或 CDN；无需其他项目。界面中文，日期统一 Asia/Shanghai。

草稿可直接移入回收站：电脑点击卡片右下角红色垃圾桶，手机向左滑动后点击删除；编辑页也保留带垃圾桶图标的删除入口。

## 页面示例

![留迹时间轴页面](https://raw.githubusercontent.com/YorenZZZ/liuji/main/docs/images/timeline.jpg)

*截图使用虚构示例内容。*

## Docker 快速开始

镜像：[yorenzzz/liuji](https://hub.docker.com/r/yorenzzz/liuji) · 源码：[YorenZZZ/liuji](https://github.com/YorenZZZ/liuji) · 支持 `linux/amd64` 和 `linux/arm64`。

复制仓库的 `compose.yaml` 与 `.env.example`，将后者改名为 `.env`。默认仅在服务器本机开放 `http://127.0.0.1:18910`：

```sh
docker compose pull
docker compose up -d
docker compose ps
```

在内网其他设备上使用时，将 `.env` 的 `LIUJI_BIND_IP` 改为**你自己的 NAS 局域网 IP**，将 `LIUJI_PUBLIC_ORIGIN` 改为完整访问来源（协议、相同 IP 和端口），例如 `http://你的NAS地址:18910`。不要把示例文字原样填入。重建容器后，在同一内网打开此地址。

```dotenv
LIUJI_AUTH_REQUIRED=true
LIUJI_BIND_IP=127.0.0.1
LIUJI_PORT=18910
LIUJI_PUBLIC_ORIGIN=http://127.0.0.1:18910
LIUJI_COOKIE_SECURE=false
```

开源版默认启用登录。首次打开时设置并确认至少 10 个字符的密码；请先在可信网络完成初始化。登录后可在「连接与存档」直接设置新密码，无需再次输入旧密码；其他设备的旧会话立即失效，当前设备继续使用。支持确认后退出当前设备。

仅在可信内网需要免登录时，显式设 `LIUJI_AUTH_REQUIRED=false`。此时能访问地址的人可读写档案、管理 MCP 令牌及下载备份，页面隐藏密码与退出操作。MCP 始终要求令牌。反向代理 HTTPS 时设置准确的 `LIUJI_PUBLIC_ORIGIN` 与 `LIUJI_COOKIE_SECURE=true`；不支持 URL 子路径。

也可直接使用：

```yaml
services:
  liuji:
    image: yorenzzz/liuji:1.1.0
    ports:
      - "127.0.0.1:18910:18910"
    environment:
      AUTH_REQUIRED: "true"
      PUBLIC_ORIGIN: "http://127.0.0.1:18910"
    volumes:
      - liuji-data:/app/data
    restart: unless-stopped
volumes:
  liuji-data:
```

只启动一个实例。数据库位于持久卷 `/app/data/liuji.sqlite`；挂载宿主目录时应允许 UID/GID `1000:1000` 读写。仓库 Compose 还启用了非 root、只读根文件系统、临时目录和最小权限设置。`docker compose down` 保留数据，**`down -v` 会删除数据卷**。

## 使用

1. 点「写一段」，输入纯文字，停笔后自动保存。
2. 点图片导出，预览并逐页保存 PNG。字形使用设备系统字体，设备间可能略有差异。
3. 自己在目标平台发布，再回到留迹登记实际平台、时间和可选链接。
4. 在时间轴搜索与筛选；原稿可反复修改，每次发布快照保持独立。

留迹不会自动向社交平台发帖。断网或版本冲突时保留当前编辑区并提示重试／另存草稿，浏览器中没有离线业务副本。HTTP 内网浏览器可能不支持系统分享，仍可下载图片。

## MCP 接入

端点为 `http://你的NAS地址:18910/mcp`，传输为 **Streamable HTTP**。在「连接与存档」创建命名令牌，完整令牌只显示一次。客户端在服务端私密配置中保存，发送 `Authorization: Bearer <令牌>`，不要放入网页脚本或 Git。

| 权限 | 工具 | 用途 |
| --- | --- | --- |
| 只读 | `search_entries` | 搜索原稿、草稿及已发布内容 |
| 只读 | `get_entry` | 读取当前正文、版本号和发布快照 |
| 只读 | `list_timeline` | 按实际发布时间倒序读取快照，支持关键词／平台／上海自然月及分页 |
| 只读 | `get_stats` | 读取篇数、发布数、平台与月份 |
| 读写 | `create_entry` | 创建纯文字草稿 |
| 读写 | `update_entry` | 带 `expectedVersion` 完整更新原稿 |
| 读写 | `record_publication` | 登记用户确认已经发生的发布 |

创建参数为 `{ "text": "正文" }`。更新先 `get_entry`，再传 `id`、`text` 与当前 `expectedVersion`；冲突后重新核对，不能盲目覆盖。登记发布需 `id`、`platform`、带时区的 `publishedAt`、`expectedVersion`、8～100 字符的 `idempotencyKey`；可选 `url`、`note`。网络重试复用同一幂等键。

资源 `liuji://guide` 提供数据与权限说明。MCP 没有删除、备份、账户或令牌管理工具；撤销令牌即时生效。实现使用 [官方 TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server)。可用 `LIUJI_MCP_URL` 指定端点，将令牌从标准输入传给 `npm run mcp:smoke` 做只读检查；脚本不打印令牌或笔记。

## 备份、更新与恢复

在「连接与存档」下载 SQLite 在线备份，内含全部笔记、快照及凭据散列，请私密保存。运行中不要只复制主数据库而忽略 WAL。

更新先备份，再修改镜像标签并运行 `docker compose pull && docker compose up -d`。恢复时先停止容器、保留当前卷副本，将核验后的备份作为 `/app/data/liuji.sqlite` 恢复，归属 `1000:1000`；确认旧 WAL/SHM 不再参与恢复再重启。网页登录密码可用 `docker compose exec liuji npm run setup` 重置，MCP 令牌不受影响。

## 开发与验证

Node.js 24：

```sh
npm ci
npm run check
npm test
npm run build
AUTH_REQUIRED=false DATA_DIR=/tmp/liuji-dev npm start
```

前端开发另开终端运行 `npm run dev`。从源码构建镜像：`docker build -t liuji:dev .`。

测试使用临时 SQLite 和回环 HTTP，覆盖文字／换行、导出分页、持久化、发布快照、防重、筛选、冲突、鉴权及内网模式、在线备份和真实 MCP 协议／权限。不连接用户 NAS、调用 AI 或创建真实发布。CI 同时检查构建与公开文件；Docker 工作流支持双架构。

## License

[MIT](LICENSE)。
