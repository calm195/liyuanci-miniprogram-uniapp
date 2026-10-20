# 阶段二：T013 学生认证接入（待启动）

关联 REQ-002、014、015、018；共享契约 0.1.0。以下为 2026-10-17 实施记录中的待接入事项，不代表已完成验收。真实学生认证闭环未验收，本阶段尚未实施，暂无本阶段验证结果。

前序实现与验证见[阶段一](01-T004-T009-foundation-session.md)。

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
