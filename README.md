# 鲤源池微信小程序

T004、T009 / REQ-002、018、020。uni-app Vue3 + TypeScript；共享契约 0.1.0。

使用 Node 22.13+，执行 `npm ci`、`npm run check`、`npm run build:mp-weixin`。
开发执行 `npm run dev:mp-weixin`，微信开发者工具导入 dist/dev/mp-weixin。
模板 package.json 与 package-lock.json 原样保留，@dcloudio 编译组合不单独升级。

复制 .env.example 为 .env.local，填写公开的 HTTPS API 地址（包含 /api/v1）；微信 AppID 在本地 manifest 配置，不填写 AppSecret。合法域名和真实微信主体需另行就绪。
默认真实适配模式，不配置地址会明确报错；登录通过 uni.login 获取 code，仅发送到后端交换会话。令牌仅在内存，重启需重新登录；前后台切换刷新 /me，401 清空会话。

本地合成展示需 `VITE_USE_MOCK=true` 并运行开发模式。首页持续标记合成 Mock，无真实身份、令牌或网络请求。生产构建强制关闭 Mock。所有业务按钮尚未开放，已认证不代表其他状态与权限自动放行。

交付与 T013 接入条件见 docs/implementation-T004-T009.md。构建通过不代表开发者工具或实机联调通过。仅微信小程序范围；Git 提交按用户授权执行，不自动推送或部署。

## 已实现功能与设计

### T004 小程序工程基础（REQ-001、020）

从 uniapp-template 导入 Vue3、TypeScript、Pinia、uni-app 页面、主题样式及检查流水线。保留本仓库 Git 历史和原 .gitignore 内容，追加本地环境/构建结果忽略规则及 package-lock.json 例外。模板 package.json、锁文件和 @dcloudio 编译依赖组合保持原样。

全局 SCSS 模块显式导入 uni.scss 变量，解决 Sass 的模块作用域问题。页面使用 uni-app 组件，首页和登录页注册在 pages.json；不依赖浏览器 DOM。

### T009 微信登录与会话（REQ-002、014、018）

客户端通过 uni.login 获取临时 code，向共享契约 0.1.0 的 POST /api/v1/auth/wechat-sessions 发送 code/client_request_id。AppSecret 仅允许服务端持有；没有手机号密码登录或演示令牌。

Pinia 维护本人投影与认证状态，会话令牌仅留内存，重启需重新登录，避免在本地持久保存本人资料。进入前台刷新 GET /me；审核中和驳回状态再读取 GET /me/verification-request，展示原因和修改建议。微信登录与学生认证分开，已认证仍需服务端当前 allowed_actions 及业务状态授权；本批发布、申请和聊天入口全部禁用。

请求层统一拼接 HTTPS API 地址、携带 Bearer、处理 code=0 和 204 空响应，错误保留 error_code/request_id，提示不回显敏感正文。401 清理会话并显示重新登录入口；会话代次与异步结果检查防止旧响应恢复已退出身份。退出调用 DELETE /auth/session 并带 Idempotency-Key，即使撤销请求失败也清除本地状态，但不宣称服务端撤销成功。

显式开发 Mock 仅展示合成认证状态，无微信调用、令牌或网络请求；生产构建强制关闭。真实 API 适配已编写，真实微信登录及学生认证闭环尚未验收。

### 检查结果与后续接入

已运行 npm run check：ESLint、Prettier、TypeScript 和 5 项单元测试通过；npm run build:mp-weixin 通过。首次格式与 Sass 问题修复后已完整重跑。保留模板导致 Node 提示未设置 type=module，构建提示未配置 AppID；均不影响上述命令通过。

尚未执行微信开发者工具、实机或真实 API 联调。T013 等待 T008/T011 API、T012 验收、D01/D02 外部资源，并由后端明确学生卡扫描状态查询、认证 expected_version 来源和 allowed_actions 动作名称。详见 [T013 接入清单与契约疑问](docs/implementation-T004-T009.md)。
