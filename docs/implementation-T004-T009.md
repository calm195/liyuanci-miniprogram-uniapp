# T004 / T009 小程序实施记录与 T013 接入清单

日期：2026-10-17。关联 REQ-001、002、014、018、020；T013 同时关联 REQ-015。
依据：G1/G2/G3 批准快照，需求基线 v0.2，详细设计 v0.2，共享契约 0.1.0（只读目录 ~/code/liyuanci/docs/contracts）。

## 本批交付范围

- T004：从 ~/code/uniapp-template 导入源码、必要配置和原始 package-lock.json；未导入 Git、node_modules、本地环境、编辑器配置和产物。保留本仓库 Git 历史及原 .gitignore 内容，追加锁文件例外与敏感配置/产物忽略规则。
- T009：微信 code → POST /api/v1/auth/wechat-sessions（code/client_request_id），GET /me，GET /me/verification-request，DELETE /auth/session（Idempotency-Key），处理 204 空响应与 code=0 响应，保留 error_code/request_id。不重试旧微信 code；用户重试重新取 code。
- 会话仅存内存，不缓存本人资料；启动未登录，前台恢复刷新资格。401 清理内存并提示重新登录；迟到的旧会话响应不能恢复已退出身份。校验中或失败时资格不可用。注销会话失败仍清本地，不宣称服务端已撤销。
- 未认证/待审核/驳回/已认证分别展示；驳回读取原因和修改建议。发布/申请/聊天页面未实施，入口全部禁用。未来需以实时资格及服务端 allowed_actions 控制展示，服务端仍须逐请求鉴权。
- 显式开发 Mock 只有合成页面投影，不请求微信、不产生 token、不发网络。生产构建关闭 Mock。真实适配代码存在不等于真实微信登录已验收。

## T013 接入清单（本批只输出清单）

前置：T009、T011、T012 验收；T008 实际 API、D01 微信 AppID/合法域名、D02 测试私有桶/密钥/图片安全可用。真实学生资料不得用于仓库夹具或日志。

1. 使用 uni.chooseImage 与 uni.uploadFile；仅学生卡图片例外，上传 POST /me/student-card-assets，multipart 字段 file，携带当前会话及 Idempotency-Key。图片格式、体积、像素为待后端冻结的部署参数，不能把 JPEG/PNG/5MiB 候选当已批准限制。
2. 上传响应 202 的 asset_id/scan_status=pending 只代表受理。安全扫描、加密存储与人工资格审核分开；失败不直通，不返回公开图片 URL，不将本地图片或身份字段持久化。
3. POST /me/verification-requests：student_number/name/asset_id/expected_version + Idempotency-Key。仅本人且扫描通过的卡允许申请；409 ASSET_NOT_READY 保持等待，不显示通过。
4. GET /me/verification-request 展示 pending/approved/rejected、reason/revision_suggestion；GET /me 的 verification=verified 才表示学生认证资格。待审不承诺时限，驳回允许按服务端动作重提。
5. 测试矩阵：重复学号、非在读首次申请、已通过毕业维持、注销后重认、他人资产、待扫描/扫描失败/依赖不可用、版本冲突、重复提交、驳回重提、过期会话、敏感资料不回显及不落日志；配合 T012 核对审核访问审计和越权。
6. 页面注册 pages.json；显示期间刷新，离开暂停；不增加 OCR 或业务图片能力。T011/T012 未联合验收前保持“待接入”，不得宣称认证闭环完成。

## 记录给后端协调方的契约问题

不自行更改契约或猜测接口：

- 上传 202 后缺少独立资产扫描状态查询入口，如何获知可提交？请明确用原申请重试 ASSET_NOT_READY 或提供版本化状态能力；小程序本批未实现轮询猜测。
- 首次认证与驳回重提 expected_version 应取 Me.version 还是 Verification.version？请协调冻结目标版本定义。
- Me.allowed_actions 为开放字符串，缺少发布/申请/聊天与认证提交动作名的枚举或索引；后续任务需固定名称，本批不猜测。
- 会话有效期/续期、上传部署参数待交付；本批采用仅内存会话，无自动续期。

## 验证与状态

实际结果：`npm ci --ignore-scripts --offline` 成功安装 871 个包；`npm run check`（ESLint、Prettier、TypeScript、5 项单元测试）通过；`npm run build:mp-weixin` 通过，产物 dist/build/mp-weixin；`git diff --check` 通过。首次格式失败已 format 修复重跑，首次构建 Sass 变量失败已修复重跑。Node 提示模板缺少 type=module；构建提示未配置 AppID，均未阻止通过。未执行微信开发者工具、实机或真实 API 联调。T004 仅小程序工程可核验；T009 为契约适配/合成展示实现，真实 API 与微信联调未验收。T003 外部依赖交付未核实，不能签整体 T004/T009 完成。未启动 T013 及后续业务实现。

构建修正：T004 / REQ-020，模板 styles/index.scss 显式 @use uni.scss，修复 Sass 模块变量不可见；不升级依赖。

## 文件范围

- 工程：.gitignore、.editorconfig、.env.example、.github/workflows/ci.yml、.prettierignore、.prettierrc.json、AGENTS.md、README.md、eslint.config.mjs、index.html、package.json、package-lock.json、tsconfig.json、vite.config.mts。
- 小程序：src/App.vue、main.ts、manifest.json、pages.json、uni.scss；src/api/auth.ts、config/index.ts、stores/user.ts、types/api.ts、types/env.d.ts；src/pages/index/index.vue、pages/login/index.vue；src/utils/request.ts、session.ts、access.ts、storage.ts、validate.ts；src/styles/index.scss、tailwind.css；模板复用组件 src/components/FeatureCard.vue。
- 验证：tests/access.test.ts、request.test.ts、utils.test.ts；交付记录为本文件。
- package-lock.json SHA-256 与源模板一致：a5d329f6f5b64ab88b43618af41fac43097bcd3ea3ae90f0a768b9670ecb3388。未修改 package.json 及依赖版本。
