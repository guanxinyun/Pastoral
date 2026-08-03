# Task Plan: 主模型生命周期、归寝流水线与变量预设

**Created:** 2026-08-01 01:30
**Status:** completed
**Goal:** 当前优先修复桌面序章无法滚动至开始按钮、手机真正全屏后游戏区坍缩为短条两个布局回归；既有迁移资料与实现记录继续保留。

## Architecture

主剧情继续使用酒馆原生 `/send` 与 `/trigger await=true`，通过消息事件和楼层轮询组合确认新 AI 回复。变量请求统一经过预设策略解析器：默认使用自动维护的 Pastoral 空白预设，或按玩家设置跟随/固定酒馆预设。归寝将内存结算和 MVU 写回拆开，首次写回使用有限等待且不阻断变量 API，最终再锁定并写回确定性事实。

## Task Breakdown

### Task 1: 持久化变量预设设置
- **Description:** 先扩充设置测试，再添加普通/归寝独立的 mode、presetName 与八项上下文开关，保持未知字段兼容。
- **Files to touch:** `test/settings.js`, `js/settings.js`
- **Tests:** 默认 none；非法模式归一化；两阶段独立保存；上下文布尔化；旧字段保留。
- **Dependencies:** 无
- **Acceptance:** `node test/settings.js` 通过。
- **Status:** [X] done

### Task 2: 构建空白预设与请求策略
- **Description:** 先写失败测试，再实现空白预设生成、none/current/fixed 解析、固定预设缺失回退，以及变量/连接测试统一使用 generate + preset_name。
- **Files to touch:** `test/api.js`, `js/api.js`
- **Tests:** 三种模式；占位符开关；人工提示词/扩展清除；不切换 in_use；连接测试复用 normal 策略；旧环境 none 回退 generateRaw。
- **Dependencies:** Task 1
- **Acceptance:** API 单元测试确认请求参数和预设内容正确。
- **Status:** [X] done

### Task 3: 修复主模型组合结束检测与状态收尾
- **Description:** 先增加事件缺失和普通单 API 状态测试，再组合 MESSAGE_RECEIVED、GENERATION_ENDED 与楼层轮询，并确保所有完成/失败路径停止加载。
- **Files to touch:** `test/api.js`, `js/chat.js`
- **Tests:** awaited trigger；无结束事件有新楼层；拒绝旧/用户楼层；普通单 API 显示完成；多 API 失败显示明确状态。
- **Dependencies:** Task 2
- **Acceptance:** 主回复结束后不再停留“等待主模型”，且只处理本次新 AI 楼层。
- **Status:** [X] done

### Task 4: 使归寝写回不阻断后续 API
- **Description:** 先写悬挂 Promise 流程测试，再将内存结算、首次限时写回、归寝 API、最终事实锁定与最终写回拆分。
- **Files to touch:** `test/api.js`, `js/mvu.js`, `js/chat.js`
- **Tests:** 首次写回悬挂后仍调用 endday API；首次超时仅警告；最终失败不报成功；结算 ID 防重复。
- **Dependencies:** Task 3
- **Acceptance:** 归寝不会卡在确定性结算且会发起对应 API；最终落盘结果可核验。
- **Status:** [X] done

### Task 5: 增加变量预设设置界面
- **Description:** 在设置对话框增加第三页，渲染两类请求的模式、固定预设下拉和 none 模式上下文开关，并保存/恢复状态。
- **Files to touch:** `js/app.js`, `css/components.css`, `test/smoke.js`
- **Tests:** UI 结构与标签；三种模式；两阶段控件；上下文开关；持久化调用；内部预设不出现在固定列表。
- **Dependencies:** Tasks 1-2
- **Acceptance:** 键盘和触控可操作，模式切换显隐正确，重新打开恢复设置。
- **Status:** [X] done

### Task 6: 全量构建与回归验证
- **Description:** 重建自包含页面，运行完整测试、静态检查和差异检查，修复回归后仅提交本任务文件并推送。
- **Files to touch:** `index.html`, `progress.md`, `task_plan.md` 及必要回归文件
- **Tests:** `npm test`; `node --check` 修改脚本；`git diff --check`；必要的实际运行检查。
- **Dependencies:** Tasks 1-5
- **Acceptance:** 全套验证通过；不纳入用户已有未提交文档/拆分文件；提交推送到 `origin/main`。
- **Status:** [X] done

### Task 7: 建立技术证据地图
- **Description:** 从用户指定指导文件、源码、测试、类型切片与既有设计文档中定位五条核心实现链路及其准确入口。
- **Files to touch:** `findings.md`, `progress.md`
- **Dependencies:** 无
- **Acceptance:** 每个主题均有源码文件、关键符号、调用关系和测试证据。
- **Status:** [X] done

### Task 8: 还原迁移契约与时序
- **Description:** 将实现细节提炼成宿主能力接口、数据契约、异步时序、异常恢复、版本兼容和安全边界。
- **Files to touch:** `findings.md`, `progress.md`
- **Dependencies:** Task 7
- **Acceptance:** 其他项目无需复制整个 Pastoral，即可按最小适配层复现能力。
- **Status:** [X] done

### Task 9: 编写独立迁移指南
- **Description:** 新建中文技术文档，按概念、源码定位、流程、伪代码、迁移步骤、测试清单和常见陷阱组织。
- **Files to touch:** 独立的 `迁移参考资料/` 文档包、`progress.md`
- **Dependencies:** Tasks 7-8
- **Acceptance:** 完整覆盖正文文件选择、MVU、第二 API、固定预设延时短事务、伪零层及综合迁移模板。
- **Status:** [X] done

### Task 10: 交叉验证与收尾
- **Description:** 对照当前源码和测试核验文档符号、常量与行为，检查 Markdown 引用、主题覆盖和变更边界；更新规划文件。
- **Files to touch:** `迁移参考资料/`、`findings.md`, `progress.md`, `task_plan.md`
- **Dependencies:** Task 9
- **Acceptance:** 文档与当前实现一致，验证结果有记录，功能源码、测试和构建源没有本轮差异。
- **Status:** [X] done

## 当前关键决策

- 以当前源码和测试为最终事实来源，历史进度与设计文档仅用于辅助定位。
- 输出为独立中文迁移指南，不把实现说明只留在规划文件中。
- 文档区分“Pastoral 当前策略”与“宿主稳定 API 契约”，明确易受酒馆版本影响的经验延时和内部字段。
- 初始迁移资料整理阶段不改功能实现；后续经用户另行批准，已进入独立的交互与状态实现任务。
- 迁移资料仍集中在独立的 `迁移参考资料/` 文件夹，并随生产行为同步更新。
- 当前源码与迁移推荐均将深度注入屏蔽默认设为未勾选（`blockDepthEntries: false`）。

## 遇到的错误

| 错误 | 尝试次数 | 解决方案 |
|------|---------|---------|
| `findings.md` 原先不存在 | 1 | 已在项目根目录按中文研究模板创建 |
| 一次无效替换（新旧文本完全相同） | 1 | 已停止重复调用，改为先搜索待修正文案再精准编辑 |

## 当前布局回归续修（2026-08-02）

### Task 11: 真实浏览器复现并锁定根因
- **Description:** 分别复现桌面序章无法滚动至“进入旅店”和手机真正全屏后游戏区坍缩，记录 iframe/父页面、body、书页的实际类名、尺寸和 overflow。
- **Files to touch:** `progress.md`（仅记录证据）
- **Tests:** Playwright 桌面与 390px 手机宿主场景。
- **Dependencies:** 无
- **Acceptance:** 两个问题都能稳定重现，并有从计算样式到错误规则/状态来源的完整证据。
- **Status:** [X] done

### Task 12: 添加两个失败回归测试
- **Description:** 在不先改生产实现的前提下，用最小断言固定桌面序章按钮可达与手机全屏舞台占满视口。
- **Files to touch:** `test/iframe.js`, `test/layout.js`（或最小新增浏览器测试）
- **Tests:** 新断言在旧实现上明确失败，且失败原因对应已证实根因。
- **Dependencies:** Task 11
- **Acceptance:** RED 阶段稳定、针对性明确。
- **Status:** [X] done

### Task 13: 修复布局根因
- **Description:** 只修改导致两项回归的 CSS/宿主状态同步，保持普通内嵌无全屏页签/退出、真全屏单页范围和桌面有界滚动契约。
- **Files to touch:** `css/layout.css`, `js/host.js`/`js/app.js`（按根因决定）
- **Tests:** Task 12 新测试转绿，既有 iframe/layout 测试继续通过。
- **Dependencies:** Task 12
- **Acceptance:** 桌面可滚至按钮，手机真全屏游戏舞台不再是短条。
- **Status:** [X] done

### Task 14: 实机验证、构建与发布
- **Description:** 桌面和手机尺寸实际交互检查，运行全量测试/语法/差异检查，重建两个 bundle，仅提交本续修相关文件并推送当前分支。
- **Files to touch:** `index.html`, `public/index.html`, `task_plan.md`, `progress.md` 及 Task 13 文件
- **Tests:** focused tests；`npm test`；`node --check`；`git diff --check`；Playwright 实测。
- **Dependencies:** Task 13
- **Acceptance:** 验证全部通过；不纳入现有无关删除、MVU 文档与切片文件；提交已推送。
- **Status:** [X] done
