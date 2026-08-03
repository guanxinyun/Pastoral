# Progress Log: 主模型生命周期、归寝流水线与变量预设

**Last Updated:** 2026-08-02（布局回归已验证并发布）

## Current Status
**Active Task:** 无 — 布局回归续修已完成
**Completed:** 4 of 4 current regression tasks

## Session Log

### 2026-08-01 01:30 — Planning Started
- 已批准设计：`docs/specs/2026-08-01-model-lifecycle-and-preset-design.md`。
- 根因一：普通单 API 成功路径没有写入终态，状态条停在“等待主模型”。
- 根因二：归寝在变量 API 前直接等待 `MVU.replaceMvuData()`；真实写回若悬挂则后续请求永远不发出。
- 根因三：变量请求固定使用 `generateRaw + ordered_prompts: ['user_input']`，没有 none/current/fixed 的完整酒馆预设语义；用户实测连接测试仍带预设行为。
- 用户确认主剧情不受新增预设设置影响；普通与归寝变量请求分别保存，默认均为 none。
- 用户选择空白内部预设方案；无预设模式仍按开关携带角色卡、世界书、聊天历史等占位上下文。

### 2026-08-01 01:30 — Task 1 Started
- 先通过 `test/settings.js` 固化默认结构、两阶段独立保存、损坏值归一化和未知字段兼容。
- 然后最小扩展 `js/settings.js`，不改现有 API 与提示词设置语义。

### 2026-08-01 01:45 — Task 1 Completed
- `test/settings.js` 先因 `variablePresets` 缺失触发 TypeError，确认 RED 有效。
- `js/settings.js` 新增普通/归寝独立预设默认结构、八项上下文默认值和严格归一化。
- 玩家执行 `node test/settings.js`，23 项全部通过。
- 保存仍深度合并并保留未知旧字段。

### 2026-08-01 01:45 — Task 2 Started
- 将先测试内部空白预设内容、三态 `preset_name`、固定预设缺失回退和连接测试复用策略。
- 生产实现将集中在 `js/api.js`，避免 UI 先行耦合。

### 2026-08-01 03:39 — Tasks 2–6 Completed
- `js/api.js` 已统一 normal/endday/连接测试的 none/current/fixed 策略；内部空白预设仅保留勾选占位符，清除人工提示词、未使用提示词、正则和酒馆助手脚本。
- 修正 `createOrReplacePreset()` 的 `render: 'debounced'` 参数，并覆盖只有 `generateRaw()` 的旧环境 none 回退。
- `js/chat.js` 组合 `MESSAGE_RECEIVED` 候选与最新楼层轮询，只接受本次请求后的非 user 楼层；成功、超时和发送失败均写入非加载终态。
- 日结拆分为内存结算、3 秒首次写回、归寝变量 API、最终事实锁定；迟到写回完成后会再锁定一次，最终写回失败显示“归寝部分完成”。
- 设置页新增普通/归寝独立三态预设、固定预设列表和八项上下文开关；已删除的固定预设保留原值并明确提示修正。
- `npm test` 全量通过；修改脚本 `node --check` 通过；`git diff --check` 通过；`index.html` 已重建并与 `public/index.html` 一致。
- 提交范围只含本任务的 12 个已跟踪文件；未暂存用户已有的删除项、MVU 文档和拆分参考文件。

### 2026-08-01 05:30 — 变量请求组装重构（新一轮）
- 玩家实测：固定预设下仍带酒馆正文预设、且前端更新提示词没有进入请求。
- 根因确证：预设的占位符提示词 id 枚举里**没有 `user_input`**（`_types_split/09-preset.txt` 全文出现 0 次），`Overrides` 也无对应字段，因此 `generate({ preset_name, user_input })` 无法保证任务消息进入最终请求；三处调用点还硬编码 `max_chat_history: 0`，把唯一可承载它的聊天区截断为零。
- 否决"假世界书注入"：条目仍需经预设占位符或深度注入，送达问题原样存在；`enabled: false` 永不激活；世界书是共享状态会污染主剧情。
- 否决"临时克隆预设"：会改动全局酒馆状态，且本仓库 `LEGACY_PRESET_NAME` 就是该模式留下的历史债。
- 按玩家要求两种策略都做：`compile`（默认，读预设编译成 `generateRaw` 消息列表，任务消息强制末位）与 `inject`（保真 `generate` + `injects` depth 0）。
- 上下文勾选优先于预设：取消勾选的占位符即使预设启用也被过滤，已实测确认。
- 设计文档：`docs/specs/2026-08-01-variable-request-assembly-design.md`。
- 实测（固定预设无 `chatHistory` 条目）：compile 编译出 4 条消息、任务消息 11677 字在末位；禁用条目与 `prompts_unused` 均未进入；inject 的 `max_chat_history` 由 0 改为 1 且 `should_scan: false`。
- 未验证：`generateRaw` 的 `RolePrompt.content` 是否仍执行宏替换（本地实测 `{{char}}` 原样透传，真实替换由酒馆运行时决定）；角色卡历史后指令在 `generateRaw` 路径下的行为。
- `npm test` 373 项全通过；`node --check`、`git diff --check`、`index.html` 与 `public/index.html` 一致。

### 2026-08-01 08:10 — 跨 Termux / Windows 的预设短事务与归寝阶段隔离
- 用户确认 Termux 与 Windows 使用同一酒馆、TavernHelper 版本和最新构建，但表现相反：Termux 固定预设请求仍走当前预设且更新任务缺失；Windows 同一任务出现两遍。
- 根因：旧 `inject` 路径同时保留 `user_input` 并复制到 `injects[0].content`。Windows 同时消费两条通道；Termux 未可靠消费 `injects`，而只传 `preset_name` 又没有像真实切换当前预设一样生效。
- 用户补充关键历史行为：手机端已有脚本通过“切换预设→发起生成→立刻切回”实现过相同目的。最终方案据此改为固定预设短事务，而不是长期锁或统一 generateRaw。
- 固定预设请求严格执行：保存 `getLoadedPresetName()` 与深拷贝 `getPreset('in_use')` → `loadPreset(阶段预设)` → 调用 `generate({ user_input })` 取得 Promise → 立刻 `loadPreset(原名称)` → `replacePreset('in_use', 原现场, {render:'none'})` → 锁外等待网络 Promise。
- 短锁仅串行本地切换窗口，不等待 API：自动测试中首个网络 Promise 未解决时，第二个固定预设事务已成功发起并恢复。
- 三种模式固定为：none = `generateRaw + user_input`；current = 当前预设 `generate + user_input`；fixed = 短切目标预设后 `generate + user_input`。生产代码不再设置 `injects` 或 `preset_name`，任务只发送一次。
- 普通/归寝各自冻结阶段快照。多 API 归寝顺序为日常 A → 确定性结算 → 归寝 B；单 API 复用主剧情楼层的日常 MVU，不额外静默调用日常阶段。
- 多 API 日常阶段失败时仍继续确定性与归寝阶段，但归寝提示收到“日常变量阶段失败；不得猜测、补算或重复执行日常即时变化”，最终账簿标为部分完成。
- UI 删除跨宿主不稳定的 compile/inject 选择，改为说明固定预设会短暂切换并立即恢复，任务只通过 user_input 发送一次。旧 assembly 缓存字段自动迁移删除。
- 新增安全诊断 `[Pastoral][VariableRequest]`：阶段、模式、目标预设、传输、任务指纹、切换/恢复状态及运行时版本；不记录 Key、完整提示词或 MVU 快照。
- `npm test` 全套通过；修改脚本 `node --check` 通过；`index.html` 与 `public/index.html` 一致；`git diff --check` 仅有 CRLF 提示，无空白错误。
- 仍需玩家在真实 Termux/Windows 上确认：`generate()` 在调用后立即切回预设时，两端都会按发起瞬间的目标预设完成请求。自动测试已按该 API 契约验证，但本地 JSDOM 无真实酒馆运行时。

### 2026-08-01 08:55 — 固定预设提示词捕获延迟
- 玩家实测：API 请求已经到达，但立即恢复预设可能发生在酒馆异步收集预设/用户输入之前，导致请求内容为空或使用恢复后的预设。
- 在固定预设短事务中增加两段最小延迟：`loadPreset(target)` 后等待 200ms 再调用 `generate()`；调用后继续保持目标预设 500ms，再恢复原预设及 `in_use` 现场。
- 网络响应仍在恢复后、事务锁外等待；延迟只占固定预设的本地启动窗口，总计约 700ms，不等待实际 API 完成。
- TDD 覆盖：100ms 时尚未调用 generate；约 280ms 时已发起且目标预设仍激活；约 760ms 时已恢复；首个网络 Promise 未完成时第二个事务仍可启动。

### 2026-08-01 09:20 — 固定预设延迟放宽到 1–2 秒
- 按玩家实测反馈，将切换后的稳定等待由 200ms 调整为 1 秒，将 `generate()` 后的提示词捕获窗口由 500ms 调整为 2 秒，总启动窗口约 3 秒。
- RED 验证确认旧实现会在 600ms 内过早调用 `generate()`；GREEN 后固定预设在目标预设保持期间发起任务，并在约 3 秒后恢复原预设及 `in_use` 现场。
- 网络 Promise 继续在恢复后、短事务锁外等待；只延长本地提示词捕获阶段，不等待网络响应完成。

### 2026-08-01 — 技术迁移文档研究（本轮）
- 已按要求启用中文文件规划工作流并创建缺失的 `findings.md`。
- 已读取用户指定正文指导文件、当前核心源码、测试、TavernHelper/MVU 类型切片及项目 MVU schema/initvar 参考。
- 证据地图已覆盖正文模式 A、完整 MvuData 快照与 JSON Patch 桥接、第二 API custom_api 路由、固定预设 1s+2s 短事务、0 楼伪同层宿主与同源降级。
- 已提炼最小宿主接口、数据契约、请求时序、跨平台经验延时和迁移风险。
- 用户要求所有交付物放入独立文件夹且不覆盖源码；指南已移至 `迁移参考资料/README.md`。
- 用户实测修正迁移默认：深度世界书/作者注释屏蔽默认不勾选（`blockDepthEntries: false`）；文档明确区分当前源码事实与迁移建议。

### 2026-08-01 — 独立迁移资料包完成与验证
- 已在 `迁移参考资料/` 中形成四份中文文档：完整指南、接口与时序速查、迁移清单、参考索引。
- 文档明确区分当前源码事实与迁移推荐：现有 Pastoral 默认屏蔽深度注入；新项目推荐默认不勾选屏蔽，即 `blockDepthEntries: false`。
- 自动检查确认四个文档均存在且非空，正文提取、MVU、第二 API、固定预设、伪零层、深度注入推荐与源码差异说明七项主题全部命中，引用路径均存在，错误数为 0。
- `git diff --quiet -- js css src test build.js public/index.html` 通过，确认本轮未改功能源码、测试或构建源；仓库原有 `index.html` 删除状态仍在，但不是本轮造成或恢复的变更。
- `git diff --check` 对资料包及规划文件通过，仅报告既有 LF/CRLF 转换提示，无空白错误。

### 2026-08-01 — 新一轮交互与状态设计
- 用户批准：深度注入屏蔽改为默认不勾选；生成中新楼 MVU 为空时沿用最近有效状态；手机沉浸一次只显示经营页或剧情页且默认经营页；所有设备员工卡均可点击展开详情。
- 书面规格已完成并通过占位、章节编号、关键要求和空白检查：`docs/superpowers/specs/2026-08-01-mobile-state-and-staff-interaction-design.md`。
- 规格进一步明确旧缓存使用版本 2 一次性迁移、普通聊天历史与深度注入 overrides 拆分、MVU 冷启动向前回溯、移动页签 ARIA/安全区，以及员工展开状态跨重绘保持。

### 2026-08-01 — 实施计划完成
- 已根据批准规格生成 TDD 实施计划：`docs/superpowers/plans/2026-08-01-mobile-state-and-staff-interaction.md`。
- 计划拆为五个可独立验收任务：设置/overrides、MVU 回退、手机沉浸单页、全设备员工展开、受保护的构建与交付。
- 计划已检查无占位语句，包含五个任务、明确接口、RED/GREEN 命令、逐任务提交推送和 `index.html` 预先删除状态保护。

### 2026-08-01 — 交互与状态实现（Tasks 1–4）
- 深度注入屏蔽改为默认 `false`，设置版本 2 一次性迁移旧缓存；普通聊天历史 `prompts: []` 与深度条目/作者注释覆盖已拆分。RED/GREEN 覆盖设置、API 和设置 UI。
- MVU 新增完整有效快照缓存和冷启动向前回溯；最新楼 `stat_data` 为空时保持上一楼，写回仍使用明确目标楼并在成功后更新缓存。新增 `test/mvu.js`。
- 手机沉浸模式新增“经营页 / 剧情页 / 退出”切换，默认经营页，使用 `100dvh` 与安全区；桌面沉浸仍双页。布局和 iframe 交互测试通过。
- 所有设备员工卡改为摘要按钮与可展开详情，支持独立多开、ARIA、跨 MVU 重绘保持、统一铜币日薪和头像管理。新增 `test/staff.js`。
- 已逐任务提交并推送：`604e89d`、`b6e9251`、`ed74137`、`aa4d4cb`。

### 2026-08-01 — 全量构建与交付完成
- `npm test` 最终运行通过：12 个测试脚本均出现“全部通过”，失败标记为 0；构建生成 296366 字节自包含页面。
- 修改脚本的 `node --check` 全部通过；bundle 检查确认 `index.html` 与忽略目录 `public/index.html` 完全一致，并包含移动页签、员工展开、MVU 缓存和设置版本标记。
- `git diff --check` 通过，仅有 Windows LF/CRLF 提示；本地 HEAD 与 `origin/feat/data-backend-engine` 同为 `6b63557975c8bfea7a086266c5bd712143c26771`。
- 最终提交未纳入用户原有删除项、MVU 参考文档改动、规划记录、类型切片或 Playwright 临时目录。

### 2026-08-02 — 布局回归续修启动
- 用户确认上一轮修改后仍有两个真实设备问题：电脑端弹出序章信件无法向下滚动到“进入旅店”；手机进入真正全屏后正式游戏仍坍缩成短条。
- 已保留上一轮未提交的普通内嵌/全屏边界改动，不回退工作区其他删除项、MVU 文档、类型切片或临时目录。
- 当前先以真实浏览器记录计算样式与尺寸；在根因证实前不继续叠加 CSS 猜测。

### 2026-08-02 — 根因、RED/GREEN 与浏览器验证
- 桌面根因：动态手机模式依据子 iframe 的 `innerWidth < 900`，桌面酒馆的窄聊天栏也会误判。Chromium 复现中父视口 1280px、子 iframe 850px 时，序章 iframe 被撑到约 7292px，失去 624px 有界内部滚动。
- 手机根因：原生全屏已成功且 iframe/VisualViewport 均为 390×760、CSS 变量为 760px，但 `html/body.in-tavern--dynamic` 继续自然高度；更高优先级的 `body.in-tavern.is-game .book { height:100% }` 使 body/book 只有 116px、页面约 33px。
- RED：`test/iframe.js` 的父视口切换断言在旧实现失败 1 项；`test/layout.js` 的 immersive html/body/book 高度契约在旧实现失败 3 项。
- GREEN：Host 改为读取父酒馆视口并随父 window/VisualViewport resize 同步动态类；全屏状态同时写入 html；dynamic+immersive 的 html/body/book 使用足够高优先级锁定 `--mobile-viewport-height`。
- 普通手机内嵌与真正全屏已彻底分离：普通内嵌不显示经营页/剧情页/退出，双页自然纵排；真正全屏才启用单页页签和退出。
- 修复后 Chromium：桌面 iframe 为 624px，序章 `clientHeight=599 / scrollHeight=7450 / overflow-y=auto`，滚轮后 `scrollTop=700`；手机真全屏 iframe/html/body/book 均约 760px，经营页约 677px，退出按钮可见。
- 已保存手机全屏截图 `pastoral-mobile-fullscreen-fixed.png` 作为本地验证证据，不纳入提交。
- 最终 `npm test` 全量通过，14 个测试脚本均输出“全部通过”；修改脚本 `node --check`、bundle `cmp` 与 `git diff --check` 均通过。
- 仅提交 7 个功能/测试/构建文件，未纳入已有删除项、MVU 文档、规划文件、切片与 Playwright 临时证据。
- 提交 `07016cb fix: restore embedded and fullscreen layouts` 已推送到 `origin/main` 与 `origin/feat/data-backend-engine`。

## Decisions Made
- 2026-08-01 主剧情保持酒馆原生 `/send` 与 `/trigger await=true`，不由 Pastoral 选择预设。
- 2026-08-01 变量更新使用 `generate + preset_name`；`generateRaw` 仅作为 none 模式旧环境回退。
- 2026-08-01 内部预设名为 `【Pastoral 内部】空白变量更新`，不调用 `loadPreset()`，不改变玩家当前预设。
- 2026-08-01 首次 MVU 写回超时后继续归寝变量 API；最终写回失败不得报告完整成功。
- 2026-08-01 只提交本任务涉及文件，不触碰或暂存用户现有 MVU 文档和拆分参考改动。

## Open Questions
- 无。用户已授权技术细节采用推荐默认并直接实施。
