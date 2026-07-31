# Task Plan: 主模型生命周期、归寝流水线与变量预设

**Created:** 2026-08-01 01:30
**Status:** completed
**Goal:** 修复主回复完成状态与归寝写回阻塞，并为普通/归寝变量更新增加可持久化的三态酒馆预设控制。

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
