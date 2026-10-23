# 鲤源池微信小程序

## 1. 项目介绍

鲤源池微信小程序基于 uni-app、Vue3 和 TypeScript 开发，使用 Pinia 管理共享状态，面向微信小程序运行环境。

目前提供工程基础、微信登录与会话适配，以及学生认证页面与合成流程（扫描、待审、驳回重提、通过）。同时提供心愿广场、我的心愿、独立详情页及合成草稿/审核/上架流程。详情页提供撤下、普通回退、确认实现与异常退出；支持应愿申请、我的应愿、撤销申请、许愿人确定应愿人与公开主页，并提供聊天会话、消息审核状态及站内通知。支持提交、修改与撤回还愿故事、浏览还愿墙，以及微信好友分享和引用回流。支持昵称修改、身份标签隐藏及黑名单管理。真实认证提交与心愿写入入口已开放，操作仍须满足服务端动作授权与当前资格；真实微信登录、认证与发布闭环仍需联调验收。开发过程、阶段记录、接口核对与验证证据统一见 [小程序文档索引](../docs/development/miniprogram/README.md)。

## 2. 项目选项与目录结构

技术选型为 uni-app + Vue3 + TypeScript、Pinia、SCSS 与 Tailwind CSS；使用 ESLint、Prettier、vue-tsc 和 Node 单元测试检查代码。

| 配置项              | 说明                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------- |
| Node.js             | 22.13.0 及以上                                                                           |
| `VITE_API_BASE_URL` | API 地址包含 `/api/v1`；生产仅 HTTPS，开发另允许本机或私网 HTTP                          |
| `VITE_USE_MOCK`     | 默认 `false`；设为 `true` 且在开发模式时展示合成 Mock，生产构建强制关闭                  |
| 微信 AppID          | `src/manifest.json` 的 `mp-weixin.appid` 已配置为 `wxbc34f14cf9bbdc8d`，不填写 AppSecret |

```text
.
├── src/
│   ├── api/            # API 适配
│   ├── components/     # 复用组件
│   ├── config/         # 环境配置
│   ├── pages/          # 小程序页面
│   ├── stores/         # Pinia 共享状态
│   ├── styles/         # 全局样式与 Tailwind 入口
│   ├── types/          # TypeScript 类型
│   ├── utils/          # 请求、会话与校验工具
│   ├── App.vue         # 应用入口与生命周期
│   ├── main.ts         # 应用初始化
│   ├── manifest.json   # 应用与平台配置
│   ├── pages.json      # 页面注册
│   └── uni.scss        # 全局 SCSS 变量
├── tests/              # 单元测试
├── .env.example        # 公开环境变量示例
├── AGENTS.md           # 项目协作约定
└── package.json        # 依赖与开发命令
```

## 3. 项目启动方式

安装依赖并创建本地环境配置：

```bash
npm ci
cp .env.example .env.local
```

在 `.env.local` 中填写 `VITE_API_BASE_URL`，并配置微信 AppID。真实联调还需要可用的后端、微信主体与合法域名。仅查看合成页面时可设置 `VITE_USE_MOCK=true`，该模式不调用微信、不产生令牌、不发送 API 请求。

启动微信小程序开发构建：

```bash
npm run dev:mp-weixin
```

使用微信开发者工具导入 `dist/dev/mp-weixin`。

本地后端例如监听 `8080` 端口，可在 `.env.local` 中设置：

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8080/api/v1
VITE_USE_MOCK=false
```

开发环境允许 HTTP 的主机范围为 `localhost`、`127.0.0.0/8`、`[::1]`、`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`；公网 HTTP 会在发请求前被拒绝。生产构建仍只允许 HTTPS，此规则由构建模式决定，不受 Mock 开关控制。修改环境配置后需重启开发构建。

微信开发者工具本地 HTTP 联调需在“详情 → 本地设置”勾选“不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书”。真机的回环地址指手机自身，应改填电脑的局域网 IP，并确保同网、后端监听局域网接口且防火墙放行端口；真机还需按微信调试能力配置，正式环境使用 HTTPS 合法域名。

人工验证：开发模式填写本机或私网 HTTP，点击登录确认请求抵达测试后端；改为公网 HTTP 应提示配置错误且无网络请求。使用同一本地 HTTP 配置运行 `npm run build:mp-weixin` 并导入生产产物，点击登录应提示必须配置 HTTPS；生产真实联调需改回可用的 HTTPS 地址。

执行完整检查和生产构建：

```bash
npm run check
npm run build:mp-weixin
```

生产产物位于 `dist/build/mp-weixin`。`npm run dev` 等同于微信小程序开发命令；`npm run build` 会先检查再构建。构建通过不代表开发者工具、实机或真实 API 联调通过。

## 4. 开发规范与须知

- 非测试代码（含构建脚本与配置）不得出现里程碑、任务或需求编号（如 T00x、REQ-xxx）；注释仅用中文说明功能、业务规则与必要的技术原因，日志说明文字使用中文。接口字段、技术标识及协议值保留原名；编号追溯放在测试或阶段里程碑文档中。

- 使用中文交流，关键逻辑写中文注释；完整协作要求见 [AGENTS.md](AGENTS.md)。
- 页面放在 `src/pages`，新增页面注册到 `src/pages.json`；复用组件放在 `src/components`。使用 uni-app 组件和生命周期，避免浏览器专用 DOM API。
- API 放在 `src/api`，统一使用 `src/utils/request.ts`，业务成功码为 `0`。Pinia 管理共享状态，页面不重复实现令牌持久化。当前令牌仅存内存，重启需重新登录，前台恢复刷新本人状态，401 清理会话。
- 微信登录与学生认证分别判断；业务入口还需服务端实时资格、`allowed_actions` 和业务状态授权。认证提交与心愿写入已开放，具体按钮以当前服务端动作授权为准。
- SCSS 全局变量放在 `src/uni.scss`，模块按需显式导入；Tailwind 入口保持纯 CSS。
- 每轮文件修改后运行 `npm run check`；格式检查失败时运行 `npm run format`，再重跑完整检查。修改页面、样式、依赖或构建配置后还须运行 `npm run build:mp-weixin`。不得关闭规则、忽略源码或删除测试绕过检查。
- 保持 `@dcloudio/*` 编译相关包版本一致，不单独升级 Vite/Vue 破坏官方依赖组合。
- 禁止写入密钥、真实密码或真实用户数据；AppSecret 仅由服务端持有。新增环境变量同步 `.env.example` 与本说明。
- 后续开发使用 `develop`，对应 docs 文档使用 `mini-deveop`；仅在用户授权范围内提交，不自动 push、发布、部署或创建远程仓库。
- README 仅维护项目介绍、选项与目录、启动方式、开发规范与须知；本工程不保留阶段文档，过程产物写入 docs 工程。
- 任何工程变动前核对本工程 `develop` 与 docs `mini-deveop` 的分支、完整 HEAD 和工作区；固定阶段产物不再修改，交付、勘误或补证据另建文件并引用完整源码提交。契约疑问写 docs 对应端新记录，由后端协调；需求、审批及固定设计只读。遵循 [文档管理规范](../docs/governance/README.md)。
