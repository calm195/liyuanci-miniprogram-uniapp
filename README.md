# 鲤源池微信小程序

## 1. 项目介绍

鲤源池微信小程序基于 uni-app、Vue3 和 TypeScript 开发，使用 Pinia 管理共享状态，面向微信小程序运行环境。

目前提供工程基础、微信登录与会话适配，以及合成认证状态展示。真实微信登录、学生认证闭环和后续业务仍需联调验收。任务、REQ、契约版本、设计取舍、验证结果及接入条件按阶段保存在 [docs/milestones/](docs/milestones/)：

- [阶段一：T004 / T009 工程基础与微信会话](docs/milestones/01-T004-T009-foundation-session.md)
- [阶段二：T013 学生认证接入（待启动）](docs/milestones/02-T013-verification.md)

## 2. 项目选项与目录结构

技术选型为 uni-app + Vue3 + TypeScript、Pinia、SCSS 与 Tailwind CSS；使用 ESLint、Prettier、vue-tsc 和 Node 单元测试检查代码。

| 配置项              | 说明                                                                     |
| ------------------- | ------------------------------------------------------------------------ |
| Node.js             | 22.13.0 及以上                                                           |
| `VITE_API_BASE_URL` | API 地址包含 `/api/v1`；生产仅 HTTPS，开发另允许本机或私网 HTTP          |
| `VITE_USE_MOCK`     | 默认 `false`；设为 `true` 且在开发模式时展示合成 Mock，生产构建强制关闭  |
| 微信 AppID          | 在本地 `src/manifest.json` 的 `mp-weixin.appid` 中配置，不填写 AppSecret |

```text
.
├── docs/milestones/     # 按阶段存放的实施记录、验证结果与待接入事项
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
- 微信登录与学生认证分别判断；业务入口还需服务端实时资格、`allowed_actions` 和业务状态授权。当前业务按钮尚未开放。
- SCSS 全局变量放在 `src/uni.scss`，模块按需显式导入；Tailwind 入口保持纯 CSS。
- 每轮文件修改后运行 `npm run check`；格式检查失败时运行 `npm run format`，再重跑完整检查。修改页面、样式、依赖或构建配置后还须运行 `npm run build:mp-weixin`。不得关闭规则、忽略源码或删除测试绕过检查。
- 保持 `@dcloudio/*` 编译相关包版本一致，不单独升级 Vite/Vue 破坏官方依赖组合。
- 禁止写入密钥、真实密码或真实用户数据；AppSecret 仅由服务端持有。新增环境变量同步 `.env.example` 与本说明。
- 开发前新建功能分支；仅在用户授权范围内提交，不自动 push、发布、部署或创建远程仓库。
- README 仅维护项目介绍、项目选项与目录结构、项目启动方式、开发规范与须知。功能里程碑在 `docs/milestones/` 按阶段分文件记录，包含任务 ID、REQ、契约版本、真实/模拟状态、设计与关键取舍、验证结果和未完成的接入条件。
- 仅修改本仓库；需求、设计、批准材料及源模板只读。共享契约由后端会话协调维护，疑问记录在本仓库 `docs/`。
