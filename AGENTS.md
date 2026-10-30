# 小程序协作规则

## 工程与代码规范

- 本工程为 uni-app Vue3 TypeScript 微信小程序；中文交流，关键逻辑写中文注释。
- 非测试代码（含构建脚本与配置）不得出现里程碑、任务或需求编号；追踪仅写测试和 docs 工程。注释说明功能、业务规则与技术原因，日志说明使用中文；接口字段、技术标识和协议值保留原名。
- 页面放 src/pages，新页面注册 src/pages.json；复用组件放 src/components。API 放 src/api，经 src/utils/request.ts 请求，业务成功码为 0。
- Pinia 管理共享状态，页面不重复实现令牌持久化；使用 uni-app 组件与生命周期，避免浏览器专用 DOM API。SCSS 全局变量放 src/uni.scss，Tailwind 入口保持纯 CSS。
- 不写入密钥、真实密码或真实用户数据；新增环境变量同步 .env.example 和 README。@dcloudio/* 编译相关包版本一致，不单独升级 Vite/Vue 破坏官方组合。
- 不自动创建远程仓库。保留现有格式和 lint 规则，不关闭规则、忽略源码或删除测试绕过检查。

## 验证

每轮修改后运行 `npm run check`（ESLint、Prettier、TypeScript 与单元测试）；格式失败时运行 `npm run format` 后重新完整 check。页面、样式、依赖或构建配置改变还须运行 `npm run build:mp-weixin`。检查失败修复后复跑；环境受限明确报告命令和原因，未运行不声称通过。另在 docs 工程运行文档检查与固定指纹检查。

## 跨仓库文档与分支规则

- 统一遵循 [docs 文档规范](../docs/governance/README.md)；本端入口为 [现状](../docs/development/miniprogram/README.md)、[缺陷](../docs/development/miniprogram/defects.md)、[后续计划](../docs/development/miniprogram/plan.md)。
- 按用户2026-10-30最新要求，docs本端目录仅保留上述三份滚动文档，按模块维护；不再新增milestones、validation、阶段补证、截图或原始日志。源码仓库只保留运行/开发必要说明。
- 现状写源码完整SHA、当前能力和实际验证边界；缺陷区分已复现问题、依赖缺口和待验收项；计划写优先级、依赖和完成标准，不虚构负责人或日期。完成任务同步更新这三份文档，不将已解决问题继续列为开放缺陷。
- 本次明确退役的历史材料按docs清单保存在Git快照；既有需求、审批、有效契约及未退役固定输入不改写。AI不签发G1/G2/G3，业务范围和契约语义变化另走适用授权。
- 修改前核对本仓库及docs分支、完整HEAD和工作区，保护已有改动。源码与docs仅保留develop/main；小程序源码及对应文档在各自develop维护，经授权合入main并推送。并行任务协调写入，必要时使用detached工作树并在汇总后清理。
- 已授权提交时先提交源码仓库，再补docs精确版本；提交、合并、推送和部署按当次授权执行，不重复索取已有授权。共享模块映射与跨端计划由docs协调维护。
- 中文文档保留必要代码标识；报告真实/合成/未执行边界。纯文档整理只执行文档工具检查、链接/固定输入和差异检查；业务代码变化继续遵循本仓库完整质量门槛，不将历史测试冒充本轮重测。
