# 每日开讲 · DailySpeaking

**每天认识一个新概念，再用自己的话讲出来。**

无需注册的中文演讲练习网站。选择一个感兴趣的领域，由 DeepSeek 随机抽取关键词，生成研究材料和口语讲解稿；用 10 分钟理解，用 3–5 分钟练习表达。

[访问网站](http://123.56.166.126/dailyspeaking) · [GitHub 仓库](https://github.com/wantedfast/DailySpeaking)

![每日开讲首页：冰蓝背景、珊瑚色按钮与半透明卡片](preview-glass.png)

## 如何练习

1. **选一个领域**：会计、AI、计算机、自然、人力资源。抽到关键词后可以换一个，系统尽量避开本浏览器最近 30 个词。
2. **花 10 分钟理解**：材料包含定义、原理、例子、常见误解、总结与讲解提示，另附三个自测问题。完整加载后手动启动计时，支持暂停、继续和提前完成。
3. **准备讲解**：选择 3、4 或 5 分钟，生成对应长度的口语讲解稿与提纲，先看稿再开始。
4. **开口讲出来**：自由切换全文、提纲和隐藏稿件。时间结束后可再次练习，也可以探索新的主题。

界面采用冰蓝与珊瑚色搭配半透明卡片，适配电脑和手机。计时依据截止时间计算，支持后台计时和刷新恢复；到时保留材料，不强制跳页。每天可练习多次。

## 本地运行

需要 **Node.js 22.13+** 和 npm。项目使用 Next.js、React、TypeScript、Zod，以及 Node 内置 SQLite。

```sh
git clone https://github.com/wantedfast/DailySpeaking.git
cd DailySpeaking
npm ci
```

复制 `.env.example` 为 `.env.local`，在编辑器中填写 `DEEPSEEK_API_KEY`：

```powershell
# Windows PowerShell
Copy-Item .env.example .env.local
```

```sh
# macOS / Linux
cp .env.example .env.local
```

```sh
npm run dev
```

打开 [本地页面](http://127.0.0.1:3000)。Key 仅由服务端读取，不要使用 `NEXT_PUBLIC_` 前缀保存 Key，也不要提交 `.env.local`。没有 Key 时页面仍可打开，生成操作会明确提示配置缺失。

要先体验流程，可在 `.env.local` 中设置 `MOCK_AI=true` 后重启开发服务器。模拟材料有明确标识，仅用于测试，内容和长度不代表正式生成结果；生产模式始终忽略这个开关。正式使用设回 `false`。

## 配置说明

| 变量 | 默认值 | 用途 |
|---|---|---|
| `DEEPSEEK_API_KEY` | 空 | 服务端 DeepSeek Key |
| `DEEPSEEK_MODEL` | `deepseek-v4-flash` | 模型 ID，可按账号可用模型修改 |
| `AI_TIMEOUT_MS` | `90000` | 生成超时毫秒，最高 110000 |
| `SQLITE_PATH` | `./data/quotas.sqlite` | 持久化限流数据库 |
| `RATE_LIMIT_PER_MINUTE` | `5` | 每 IP 每分钟生成请求数 |
| `RATE_LIMIT_PER_DAY` | `60` | 每 IP 每天生成请求数 |
| `RATE_LIMIT_GLOBAL_PER_DAY` | `500` | 全站每天生成请求数 |
| `TRUST_PROXY` | `false` | 仅在可信代理覆盖 `X-Real-IP` 时开启 |
| `MOCK_AI` | `false` | 仅非生产环境的模拟生成 |
| `NEXT_PUBLIC_BASE_PATH` | 空 | **构建时**设置访问前缀，例如 `/dailyspeaking` |
| `DOMAIN` | `speak.example.com` | 可选 Docker Compose / Caddy 部署的域名 |

`NEXT_PUBLIC_BASE_PATH` 影响 API 请求、静态资源与首页链接。默认部署在 `/`；子路径部署须在构建时设为 `/dailyspeaking`，不带末尾斜杠，改变后必须重新构建，仅修改运行环境不会改变已有产物。

限流使用 UTC 固定分钟和日窗口，失败的有效生成请求也消耗额度。一次完整练习通常调用三次生成接口。限流控制请求次数，**不是费用硬上限**。未开启可信代理时，所有访客共享匿名 IP 配额；开启后必须确保代理覆盖访客传入的 `X-Real-IP`，且应用端口不直接暴露公网。

## 部署：现有 Nginx + systemd

当前部署采用单个 Node 应用实例，由现有 Nginx 将 `/dailyspeaking` 转发到 `127.0.0.1:3014`。仓库提供 [systemd 服务模板](deploy/dailyspeaking.service) 和 [Nginx 配置片段](deploy/nginx-dailyspeaking.conf)，适用于已有网站的服务器。

目录约定：

```text
/opt/dailyspeaking/releases/<sha>/  # 每个版本的 standalone 产物
/opt/dailyspeaking/current         # 指向当前版本的符号链接
/etc/dailyspeaking.env             # 私有运行配置，不进入仓库
/var/lib/dailyspeaking/quotas.sqlite
```

在源码目录构建，并整理可独立运行的发布产物：

```sh
npm ci
NEXT_PUBLIC_BASE_PATH=/dailyspeaking npm run build
# 将 .next/standalone/ 的内容复制到 releases/<sha>/
# 将 .next/static/ 复制到该版本目录的 .next/static/
# 将 public/ 复制到该版本目录的 public/
```

为服务建立独立的非特权用户，并保证它能读取发布目录、写入 `/var/lib/dailyspeaking`。在 `/etc/dailyspeaking.env` 设置服务端配置，限制文件权限，仅允许必要的管理员和服务读取：

```dotenv
NODE_ENV=production
HOSTNAME=127.0.0.1
PORT=3014
DEEPSEEK_API_KEY=填入有效的服务端密钥
DEEPSEEK_MODEL=deepseek-v4-flash
SQLITE_PATH=/var/lib/dailyspeaking/quotas.sqlite
TRUST_PROXY=true
MOCK_AI=false
```

安装服务模板前核对其中的用户与 Node 可执行文件路径；将 `deploy/dailyspeaking-proxy.conf` 复制为 `/etc/nginx/snippets/dailyspeaking-proxy.conf`，将 `deploy/nginx-dailyspeaking.conf` 复制为 `/etc/nginx/snippets/dailyspeaking-routes.conf`，在目标站点的 `server` 块内加入 `include /etc/nginx/snippets/dailyspeaking-routes.conf;`。代理保留 `/dailyspeaking` 路径并覆盖 `X-Real-IP`。将服务模板安装到 `/etc/systemd/system/dailyspeaking.service`，更新 `current` 链接后启动或重启服务：

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now dailyspeaking
sudo nginx -t
sudo systemctl reload nginx
curl --fail http://127.0.0.1:3014/dailyspeaking/api/health
```

更新版本时，保留旧发布目录，切换 `current` 并执行 `sudo systemctl restart dailyspeaking`；需要回滚时将链接切回旧版本再重启。SQLite 与密钥独立于发布目录，不随版本替换。使用 `journalctl -u dailyspeaking` 查看运行日志。

`/dailyspeaking/api/health` 只检查应用存活，**不会验证 DeepSeek Key、余额或上游生成能力**。上线验收还应从公网完成一次真实抽词、材料和讲解稿生成。当前公开入口使用 HTTP；如需 HTTPS，可在现有 Nginx 站点配置域名和证书。

### 可选：Docker

Dockerfile 支持 standalone 运行和构建参数：

```sh
docker build --build-arg NEXT_PUBLIC_BASE_PATH=/dailyspeaking -t dailyspeaking .
```

容器部署需挂载 SQLite 持久目录，并通过环境变量传入服务端 Key；接入现有 Nginx 时只向回环地址映射应用端口。仓库还保留独立域名的 Compose + Caddy 方案：复制 `.env.example` 为 `.env`，填写 Key 和 `DOMAIN` 后运行 `docker compose up -d --build`。该方案默认占用宿主机 80/443 端口，适用于没有现有 Web 服务占用这些端口的独立部署。持久卷保存配额与证书，更新时不要执行 `down -v`。

## 数据、隐私与内容边界

- 无账号、无注册。当前材料、阶段、计时和最近 30 次完成记录保存在浏览器 `localStorage`；清除网站数据会删除它们，不跨设备同步。
- 生成时会将分类、关键词，以及生成讲解稿所需的研究材料发送至本网站服务端和 DeepSeek。抽词会发送最近 30 个词用于避重，不上传整份练习历史。
- 服务端 SQLite 保存配额计数及用于计数的 IP 哈希；启用代理时，Nginx 也可能按服务器配置记录访问日志。
- 不录音、不转写、不做 AI 评分。完成记录表示完成计时，不能验证是否实际发言。
- 不联网检索、不展示来源；AI 内容可能有误。研究正文目标为 1,800–2,500 中文字，讲解稿按每分钟约 220–260 字生成，实际长度与阅读速度会有变化。
- 模型输出按文本显示，不执行生成的 HTML。生成失败保留已经完成的内容，可重试，不会自动用模拟结果替代。

## 接口与验证

以下路径为根路径模式；子路径部署时统一加 `/dailyspeaking` 前缀。三个 POST 接口均接受 JSON，实施结构校验与限流，错误返回 `{ "error": "可显示的中文提示" }`。

| 方法与路径 | 输入 | 输出 |
|---|---|---|
| `POST /api/topic` | `category`, `recentWords`（最多 30） | `word`, `intro` |
| `POST /api/research` | `category`, `word` | `sections[{title,body}]`（6 段）, `questions`（3 条） |
| `POST /api/speech` | `word`, `research`, `minutes`（3/4/5） | `paragraphs`, `outline` |
| `GET /api/health` | 无 | 应用存活状态 |

分类值为 `accounting`、`ai`、`computing`、`nature`、`hr`。请求体上限为 64 KB。DeepSeek 请求采用 JSON 输出、关闭思考模式，并限制输出预算与超时。

```sh
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

浏览器测试在本地 3100 端口启动开发服务器，明确启用模拟内容，覆盖分类、时长、计时恢复、稿件模式、记录与错误重试等流程。运行前请停止同一项目目录下其他 `next dev` 进程：即使端口不同，它们也会争用 `.next` 开发锁。测试采用默认根路径，运行时不要设置生产子路径构建变量。

模拟测试用于验证交互与异常处理，不等同于真实 DeepSeek 内容质量或公网可用性验收。部署后请单独验证有效 Key 下的完整生成流程。
