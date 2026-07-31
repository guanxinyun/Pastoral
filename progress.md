# Progress Log: 酒馆真实调用链与归寝结算修复

**Last Updated:** 2026-07-31 20:55

## Current Status
**Active Task:** Task 39 — 全量验证提交推送
**Completed:** 6 of 7 tasks

## Session Log

### 2026-07-31 19:20 — Planning Started
- 已批准设计规格：`docs/specs/2026-07-31-currency-variable-update-design.md`。
- 当前错误：`js/render.js` 把资金当银币，使用 `/100` 显示金币；`js/app.js` 的归寝账簿显示裸数字。
- 当前 `js/mvu.js` 已实现日薪、维护费、作物推进、每日标记重置、设施/总引力、防重和事实锁定，但测试需按八项契约补强。
- 当前归寝流程在多 API 模式中只运行 `endday` 后处理，没有先运行本轮 `normal` 日常后处理，需修正编排。
- 当前 `js/extract.js` 仍接受裸 `_.set/_.add` 命令；将统一为合法 MVU JSON Patch。
- `变量更新指导.txt` 含两套重复且部分冲突的日常/归寝初稿；`变量更新输出格式.txt` 已有基础格式，必须保留并扩充而非过度精简。

### 2026-07-31 19:30 — Task 1 Started
- 先以独立 `test/money.js` 锁定铜币边界和共享模块接口。
- Money 模块将先于 render/app 打包，避免两个页面各自维护换算逻辑。

### 2026-07-31 19:40 — Task 1 Completed
- 新增 `js/money.js`，统一把整数铜币格式化为金/银/铜。
- `render.js` 与 `app.js` 已共用 Money，不再分别按银币或裸数字显示。
- `test/money.js` 全部边界通过；smoke 明确确认 `50000` 在 HUD/预报中显示为 `5金`。
- 构建产物已重建，相关 smoke 测试通过。

### 2026-07-31 19:40 — Task 2 Started
- 将现有聚合断言拆成八项契约断言，重点补普通农田标记、总引力和 AI 写回后的全部标记锁定。

### 2026-07-31 19:50 — Task 2 Completed
- 自动化测试逐项确认脚本具备日薪、维护、结算资金、普通/魔法作物推进、全部每日标记重置、六维设施引力、总引力和防重能力。
- AI 写回后，资金、普通/魔法农田事实、设施引力和总引力均由脚本重新锁定。
- 现有实现完整，无需修改 `js/mvu.js`；补强后的 `test/api.js` 全部通过。

### 2026-07-31 19:50 — Task 3 Started
- 为 `Chat.handleUnifiedRequest()` 增加归寝调用顺序测试，先让现有流程因缺少 normal 阶段而失败。

### 2026-07-31 20:00 — Task 3 Completed
- 多 API 归寝现先以 `normal` 处理本轮即时变化，再执行前端结算、`endday` 跨日更新和事实锁定。
- 单 API 继续依赖主剧情自带日常更新，仅额外静默执行一次归寝更新。
- 新测试锁定 `normal>settle>endday>enforce`，原流程按预期先失败，修复后通过。

### 2026-07-31 20:00 — Task 4 Started
- 先将提取器测试改为合法 JSON Patch、空数组、非法 JSON、非数组和裸 lodash 拒绝。
- 再调整世界书条目选择与提示内容。

### 2026-07-31 20:15 — Task 4 Completed
- 提取器只接受同时包含 Analysis 与合法 JSONPatch 数组的完整标签；空数组合法。
- 非数组、非法 JSON、缺 Analysis 和裸 lodash 命令均被拒绝。
- 第二 API 会读取正式更新规则/输出格式条目名，同时兼容旧临时名；提示明确阶段、铜币和脚本事实禁改。
- 主 API 静默归寝也使用同一验证路径；`test/api.js` 全部通过。

### 2026-07-31 20:15 — Tasks 5-6 Started
- 先新增文档结构失败测试，再重写指导文件并扩充格式文件。
- 指导文件保留细致系统参考，但删除第二套重复规则正文。

### 2026-07-31 20:35 — Tasks 5-6 Completed
- `变量更新指导.txt` 已合并为唯一日常/归寝规则，明确铜币制、阶段职责及七类脚本确定事实，并保留心之宝石与任务种子参考。
- `变量更新输出格式.txt` 保留并扩充完整骨架、五类操作、Analysis步骤、JSON Pointer、阶段/证据/delta/去重/脚本保护护栏。
- 补齐金额换算、数值增减、对象新增、数组追加、删除、无变化和归寝保护示例，以及九类反例。
- 新增 `test/rules.js`；初次运行17项按预期失败，文档完成后全部通过。

### 2026-07-31 20:35 — Task 7 Started
- 开始完整构建、测试、静态检查、运行验证和代码审查。

### 2026-07-31 20:55 — Task 7 Verified
- `npm test` 全套通过；所有修改 JavaScript 通过 `node --check`；`git diff --check` 无错误。
- Edge 实际渲染截图确认 HUD 与预报将 `50000` 显示为 `5金`，页面布局正常；smoke 还验证归寝账簿使用金银铜单位。
- 开发服务 `127.0.0.1:5501` 返回 200 和 CORS `*`。该端口是静态页面端口，不是第二 API 端口。
- 子代理审查因 Claude 账户 `403 insufficient balance` 未执行；改为本地差异审查，并补修 MVU move 的 `from/to` 格式及 JSON Patch 语义校验。
- JSON Patch 现拒绝未知操作、非对象项、非数字delta、无to的move、非法JSON Pointer和只读路径。
- 项目第二 API 配置仍为空默认值，独立预览没有酒馆 `generateRaw`，因此未向用户的第二 API 端口发送真实请求；仅通过桩测试验证调用参数与重试逻辑。

### 2026-08-01 — 真实酒馆调用链修复
- 重新读取 `_types_split/06-generate.txt`、`14-events.txt`、`15-ejs-mvu.txt` 与 `slash_command_split/03-q-z.txt`。
- 主生成改用 `/trigger await=true`，并监听 `tavern_events.GENERATION_ENDED(message_id)`；不再把 `iframe_events` 的静默生成事件当主回复完成。
- JSON Patch 在交给 Mvu 前转换为 `_.set/_.add/_.insert/_.delete/_.move`，消息仍保留原始 JSON Patch 供审计。
- 增加持久请求状态条、第二 API generation_id/目标主机/重试/耗时状态与设置页连接测试。
- 确定性归寝完成后立即弹账簿；额外 AI 失败仍保留结算结果并显示错误。
- MVU 初始化接受 `waitGlobalInitialized('Mvu')` 返回接口；真实酒馆写回失败不再静默成功。

## Decisions Made
- 2026-07-31 所有金额变量以整数铜币存储；`1金=100银=10000铜`；现有数值不迁移，`50000=5金`。
- 2026-07-31 普通回复执行日常更新；归寝执行“日常更新 → 前端确定性日结 → 额外归寝更新 → 确定事实锁定”。
- 2026-07-31 日常和归寝使用不同规则，但共用完整 MVU JSON Patch 输出格式。
- 2026-07-31 不保留 lodash 命令作为正式 AI 更新协议。
- 2026-07-31 输出格式文件保留详细分析、操作定义和格式骨架，并增加防误更新示例与反例。

## Open Questions
- 无。设计与协议选择均已由用户确认。
