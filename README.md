# 星链智运 · 智慧物流 AI 决策大屏（全栈版 v2.0）

一套**可投入实际使用**的物流决策软件：Node.js 后端 API + 响应式大屏前端，**电脑、平板、手机自适应**，内置 AI 决策引擎（本地规则引擎离线可用，可选接入大模型）。

> 内置演示数据：10,000 条物流运单（2026-07-14 ~ 2026-10-10）+ 31 省份维度，开箱即有完整效果；接入真实业务数据见「生产化指南」。

---

## 一、快速开始

### 方式 A：一键启动（推荐给非技术同学）

| 系统 | 操作 |
|---|---|
| Windows | 双击 `start.bat` |
| macOS / Linux | 终端执行 `bash start.sh` |

脚本会自动：检查 Node 环境 → 首次运行安装依赖 → 生成配置 → 启动服务 → 打开浏览器。

### 方式 B：手动命令

```bash
npm install        # 首次运行安装依赖（约 1-2 分钟）
cp .env.example .env   # Windows 用 copy .env.example .env
npm start
```

启动后访问：

- **电脑**：http://localhost:3000
- **手机/平板**：与电脑连同一 Wi-Fi，浏览器访问 `http://<电脑局域网IP>:3000`
  （电脑 IP 查询：Windows 命令行 `ipconfig` 看 IPv4 地址；macOS `ifconfig | grep inet`）

> 唯一前置要求：安装 Node.js ≥ 18（官网 https://nodejs.org/zh-cn 下载 LTS 版，一路下一步即可）。

---

## 二、功能总览

- **决策大屏**：8 项核心 KPI、单量/准时率趋势、货类×方式旭日图、多式联运桑基图、全国地图（干线飞线+枢纽涟漪）、省份排行、三联仪表盘、六维健康雷达
- **穿透联动**：点击地图省份 / 排行榜 / 旭日图 / 桑基走廊，全页面组件联动刷新
- **运单监控**：后端分页查询（10 页/秒级），点击单号弹出详情抽屉
- **实时预警**：模板预警 + 数据驱动动态预警（滞留聚集、准时率破线自动生成）
- **AI 决策引擎**：
  - 本地规则引擎：零配置、离线可用，输出健康度评分 + 分级洞察
  - 大模型接入：两种任选——① 服务端 `.env` 配置（密钥不出服务器）；② 前端「大模型设置」弹窗配置（密钥只存你自己浏览器）
- **登录鉴权**：默认关闭（内网直接用），一行配置开启 JWT 登录
- **响应式**：≥1600px 三列宽屏 / 1024–1599px 两列 / <1024px 单列移动端，触屏优化

---

## 三、配置说明（.env）

复制 `.env.example` 为 `.env` 后修改（改完重启服务生效）：

| 配置项 | 默认 | 说明 |
|---|---|---|
| `PORT` | `3000` | 服务端口，被占用时改这里 |
| `HOST` | `0.0.0.0` | 允许局域网访问；仅本机用改 `127.0.0.1` |
| `AUTH_ENABLED` | `false` | `true` 开启登录页 |
| `ADMIN_USER` / `ADMIN_PASS` | `admin` / `admin123` | 登录账号密码（内网用） |
| `ADMIN_PASS_HASH` | 空 | 生产推荐 bcrypt 哈希，生成：`npm run gen-hash -- 你的密码`（设置后明文失效） |
| `JWT_SECRET` | 示例值 | **生产必改**为随机长字符串 |
| `LLM_BASE` / `LLM_KEY` / `LLM_MODEL` | 空 | 服务端大模型配置（兼容 OpenAI 格式接口均可） |
| `DATA_DIR` | `./data` | 数据文件目录 |

### 开启登录示例

```ini
AUTH_ENABLED=true
ADMIN_USER=boss
JWT_SECRET=换成一长串随机字符
```

### 接入大模型示例（DeepSeek）

```ini
LLM_BASE=https://api.deepseek.com/v1
LLM_KEY=sk-xxxxxxxx
LLM_MODEL=deepseek-chat
```

不配大模型时，AI 面板自动使用内置本地规则引擎，功能完整可用。

---

## 四、API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查（无需鉴权） |
| POST | `/api/auth/login` | 登录，返回 JWT |
| GET | `/api/meta` | 静态域（省份/枢纽/方式/日期范围） |
| GET | `/api/overview?day=d7&prov=广东&mode=公路&cargo=生鲜` | 大屏全量数据（一次取齐） |
| GET | `/api/shipments?day=d7&page=1&size=16` | 运单分页查询 |
| POST | `/api/ai/advice` | AI 决策建议 `{filter, llm?}` |

- `day` 取值：`d1` / `d3` / `d7` / `d30`
- 开启鉴权后，除 `/api/health` 外均需请求头 `Authorization: Bearer <token>`
- AI 接口内置限流（30 次/分钟/IP），登录接口 10 次/分钟/IP

---

## 五、Docker 部署（服务器投产）

```bash
# 方式一：compose（推荐）
cp .env.example .env   # 按需修改配置
docker compose up -d --build

# 方式二：纯 docker
docker build -t starlink-dashboard .
docker run -d -p 3000:3000 --env-file .env --name starlink starlink-dashboard
```

容器内置健康检查（`/api/health`）。需要 HTTPS 时，在前面套一层 nginx / caddy 反向代理即可。

---

## 六、目录结构

```
starlink-app/
├── server/                  # 后端
│   ├── index.js             # 服务入口（Express）
│   ├── routes/api.js        # REST API 路由（鉴权/限流/接口）
│   └── services/
│       ├── dataService.js   # 数据层：CSV→内存索引、过滤聚合（可替换为数据库）
│       └── aiService.js     # AI 层：规则引擎 + 大模型代理
├── public/                  # 前端（响应式大屏）
│   ├── index.html
│   ├── css/app.css
│   └── js/  (app.js / echarts.min.js / china.js / icons.js)
├── data/                    # 演示数据（shipments.csv 1万行 / provinces.csv 31行）
├── scripts/gen-password-hash.js
├── .env.example             # 配置模板
├── start.bat / start.sh     # 一键启动
├── Dockerfile / docker-compose.yml
└── package.json
```

---

## 七、生产化指南（接入真实业务）

1. **换数据（最快）**：直接替换 `data/shipments.csv` 与 `data/provinces.csv`，列名保持一致，重启即生效。
2. **换数据库（正式投产）**：`server/services/dataService.js` 是唯一数据入口，导出函数签名保持稳定（`computeCore / computeTrend / computeMap / ...`），将内部实现改为查询 PostgreSQL / MySQL / ClickHouse 即可，**路由层与前端零改动**。
3. **定时同步**：可在 `dataService` 加载处接入你们 OMS/TMS 的导出任务或消息队列，重启或热加载刷新内存索引。
4. **多用户权限**：当前内置单管理员账号；如需多账号/角色，扩展 `routes/api.js` 的登录签发与 `authGuard` 中间件即可。

### 数据口径说明（重要）

- KPI、趋势、地图单量、桑基流量、货类结构、准时率、成本、碳排：**全部来自 CSV 真实聚合**
- 「仓储利用率」暂无仓储实测数据，采用基于省份权重的仿真基准值（代码中有标注），接入 WMS 数据后替换即可
- `d1/d3` 短周期的分时分布为基于真实总量的日内波形仿真；`d7/d30` 为逐日真实聚合

---

## 八、常见问题（FAQ）

**Q1：启动提示端口被占用？**
改 `.env` 里 `PORT=3100`（或其他空闲端口），重启即可。

**Q2：手机访问打不开？**
① 确认手机与电脑在同一 Wi-Fi；② 用电脑的局域网 IP（不是 localhost）；③ Windows 防火墙首次会弹窗，选择「允许」。

**Q3：AI 按钮点了没反应/提示回退本地引擎？**
大模型配置不完整或接口不可达时会自动回退本地规则引擎，大屏功能不受影响。检查 `.env` 三项是否填全、Key 是否有效。

**Q4：忘记管理员密码？**
关掉鉴权（`AUTH_ENABLED=false`）重启即可免登录；或重新执行 `npm run gen-hash -- 新密码` 更新哈希。

**Q5：如何更新演示数据为实时数据？**
见「生产化指南」第 1/2 条。CSV 替换后重启服务；数据库方案按函数签名实现即可。

---

© 星链智运 · 智慧物流 AI 决策中台 v2.0 ｜ 技术栈：Node.js 20 · Express 5 · ECharts 5

---

# v3.0 多端互通版使用指南

## 一、电脑端：绿色单文件 EXE（免安装）
- 文件：`dist/星链智运-决策大屏-v3.0.exe`（约 74MB，内嵌全部页面、图表引擎与演示数据）
- 使用：**双击即用**，首次启动自动打开浏览器进入大屏；默认端口 3000，被占用会自动顺延。
- 自定义数据：在 exe 同级目录新建 `data/` 文件夹，放入你自己的 `shipments.csv`（列结构与示例一致即可），重启 exe 即生效。
- 自定义配置：在 exe 同级放 `.env`（参考 `.env.example`）可改端口、开启登录鉴权、接入大模型 API。

## 二、手机端：两种方式（数据与电脑实时互通）
### 方式 A（零安装，推荐先试）：浏览器直连
1. 电脑上启动 exe（或 `npm start`）。
2. 手机连**同一 WiFi**，浏览器打开大屏右上角「互联」里显示的**手机访问地址**（形如 `http://192.168.x.x:3000`）。
3. iOS/安卓均可在浏览器菜单选择"添加到主屏幕"，获得接近原生 APP 的独立窗口体验（已内置 PWA 支持）。

### 方式 B：安装 APK
本工程已内置完整 Android 工程（`android/` 目录，Capacitor WebView 壳，底部五标签导航）。
1. 安装 JDK 17 与 Android Studio（含 SDK），设置 `ANDROID_HOME`。
2. 双击运行 `build-apk.bat`（Windows）或 `bash build-apk.sh`（macOS/Linux）。
3. 产物在 `android/app/build/outputs/apk/debug/app-debug.apk`，传到手机安装。
4. **首次打开 APP 会自动弹出「互联」设置页**：填入电脑端"手机访问地址"，保存后即为你的专属数据端。
   （手机与电脑需同一网络；若跨网络使用，请把电脑服务部署到云服务器后填公网地址。）

## 三、手机端导航说明
底部五个标签：**总览**（KPI+核心图表）、**地图**（全国物流热力）、**运单**（明细表，点行看详情）、**预警**（风险清单）、**AI**（健康度评分+智能建议）。切换瞬时完成，图表自动重绘适配。

## 四、自己重新构建 EXE（可选）
```bash
npm install
node scripts/build-exe.js <windows-node目录>   # 需 node-v20.x-win-x64 解压目录作为载体
```
