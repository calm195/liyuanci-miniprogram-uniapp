# 阶段一：T004 / T009 工程基础与微信会话

日期：2026-10-17。关联 REQ-001、002、014、018、020；T013 同时关联 REQ-015。
依据：G1/G2/G3 批准快照，需求基线 v0.2，详细设计 v0.2，共享契约 0.1.0（只读目录 ~/code/liyuanci/docs/contracts）。

## 本批交付范围

- T004：从 ~/code/uniapp-template 导入源码、必要配置和原始 package-lock.json；未导入 Git、node_modules、本地环境、编辑器配置和产物。保留本仓库 Git 历史及原 .gitignore 内容，追加锁文件例外与敏感配置/产物忽略规则。
- T009：微信 code → POST /api/v1/auth/wechat-sessions（code/client_request_id），GET /me，GET /me/verification-request，DELETE /auth/session（Idempotency-Key），处理 204 空响应与 code=0 响应，保留 error_code/request_id。不重试旧微信 code；用户重试重新取 code。
- 会话仅存内存，不缓存本人资料；启动未登录，前台恢复刷新资格。401 清理内存并提示重新登录；迟到的旧会话响应不能恢复已退出身份。校验中或失败时资格不可用。注销会话失败仍清本地，不宣称服务端已撤销。
- 未认证/待审核/驳回/已认证分别展示；驳回读取原因和修改建议。发布/申请/聊天页面未实施，入口全部禁用。未来需以实时资格及服务端 allowed_actions 控制展示，服务端仍须逐请求鉴权。
- 显式开发 Mock 只有合成页面投影，不请求微信、不产生 token、不发网络。生产构建关闭 Mock。真实适配代码存在不等于真实微信登录已验收。

## 验证与状态

实际结果：`npm ci --ignore-scripts --offline` 成功安装 871 个包；`npm run check`（ESLint、Prettier、TypeScript、5 项单元测试）通过；`npm run build:mp-weixin` 通过，产物 dist/build/mp-weixin；`git diff --check` 通过。首次格式失败已 format 修复重跑，首次构建 Sass 变量失败已修复重跑。Node 提示模板缺少 type=module；构建提示未配置 AppID，均未阻止通过。未执行微信开发者工具、实机或真实 API 联调。T004 仅小程序工程可核验；T009 为契约适配/合成展示实现，真实 API 与微信联调未验收。T003 外部依赖交付未核实，不能签整体 T004/T009 完成。未启动 T013 及后续业务实现。

构建修正：T004 / REQ-020，模板 styles/index.scss 显式 @use uni.scss，修复 Sass 模块变量不可见；不升级依赖。

## 文件范围

- 工程：.gitignore、.editorconfig、.env.example、.github/workflows/ci.yml、.prettierignore、.prettierrc.json、AGENTS.md、README.md、eslint.config.mjs、index.html、package.json、package-lock.json、tsconfig.json、vite.config.mts。
- 小程序：src/App.vue、main.ts、manifest.json、pages.json、uni.scss；src/api/auth.ts、config/index.ts、stores/user.ts、types/api.ts、types/env.d.ts；src/pages/index/index.vue、pages/login/index.vue；src/utils/request.ts、session.ts、access.ts、storage.ts、validate.ts；src/styles/index.scss、tailwind.css；模板复用组件 src/components/FeatureCard.vue。
- 验证：tests/access.test.ts、request.test.ts、utils.test.ts；交付记录为本文件。
- package-lock.json SHA-256 与源模板一致：a5d329f6f5b64ab88b43618af41fac43097bcd3ea3ae90f0a768b9670ecb3388。未修改 package.json 及依赖版本。

## 实现设计补充

### T004 小程序工程基础（REQ-001、020）

从 uniapp-template 导入 Vue3、TypeScript、Pinia、uni-app 页面、主题样式及检查流水线。保留本仓库 Git 历史和原 .gitignore 内容，追加本地环境/构建结果忽略规则及 package-lock.json 例外。模板 package.json、锁文件和 @dcloudio 编译依赖组合保持原样。

全局 SCSS 模块显式导入 uni.scss 变量，解决 Sass 的模块作用域问题。页面使用 uni-app 组件，首页和登录页注册在 pages.json；不依赖浏览器 DOM。

### T009 微信登录与会话（REQ-002、014、018）

客户端通过 uni.login 获取临时 code，向共享契约 0.1.0 的 POST /api/v1/auth/wechat-sessions 发送 code/client_request_id。AppSecret 仅允许服务端持有；没有手机号密码登录或演示令牌。

Pinia 维护本人投影与认证状态，会话令牌仅留内存，重启需重新登录，避免在本地持久保存本人资料。进入前台刷新 GET /me；审核中和驳回状态再读取 GET /me/verification-request，展示原因和修改建议。微信登录与学生认证分开，已认证仍需服务端当前 allowed_actions 及业务状态授权；本批发布、申请和聊天入口全部禁用。

请求层统一拼接 HTTPS API 地址、携带 Bearer、处理 code=0 和 204 空响应，错误保留 error_code/request_id，提示不回显敏感正文。401 清理会话并显示重新登录入口；会话代次与异步结果检查防止旧响应恢复已退出身份。退出调用 DELETE /auth/session 并带 Idempotency-Key，即使撤销请求失败也清除本地状态，但不宣称服务端撤销成功。

显式开发 Mock 仅展示合成认证状态，无微信调用、令牌或网络请求；生产构建强制关闭。真实 API 适配已编写，真实微信登录及学生认证闭环尚未验收。

后续接入见[阶段二：T013 学生认证接入](02-T013-verification.md)。

## 注释与日志规范整理（2026-10-20）

关联既有 T004 / T009、REQ-002、018、020；共享契约仍为 0.1.0，本次仅整理规范与注释，不改变真实适配或合成展示状态，不新增接口接入。已清理接口类型、请求、权限、会话及忽略配置中的任务和需求编号，改为中文功能与业务说明；存量非测试代码未发现日志输出调用。README 与 AGENTS.md 同步规定非测试代码不携带里程碑编号、注释及日志说明使用中文；任务追溯保留在测试及阶段文档中。真实微信、后端与学生认证接入条件沿用本阶段及下一阶段记录。

验证结果：`npm run check` 通过（ESLint、Prettier、TypeScript 与 5 项单元测试）；非测试代码及配置的任务、需求编号扫描无残留。本次仅修改注释和文档，未改变页面、样式、依赖或构建配置行为，未执行小程序构建。
