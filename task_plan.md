# Task Plan: 铜币货币制与双阶段变量更新

**Created:** 2026-07-31 19:20
**Status:** completed
**Goal:** 以铜币为金额基础单位，统一网页显示与 AI JSON Patch 协议，并确保普通回复执行日常更新、归寝额外执行跨日更新且不重复确定性结算。

## Architecture

新增独立货币工具模块，所有页面统一把整数铜币格式化为金/银/铜。变量规则维持两个阶段：主模型每次回复后执行日常更新；归寝时先保留/完成该日常更新，再由 `MVU.settleDay()` 执行确定性日结，最后额外调用归寝规则并由 `enforceSettlementFacts()` 锁回确定事实。AI 统一使用带 `Analysis` 与合法 `JSONPatch` 的 `UpdateVariable`，不再以 lodash 命令作为正式协议。

## Task Breakdown

### Task 1: 建立共享铜币格式化工具
- **Description:** 先写边界失败测试，再新增共享 Money 模块，将 HUD、预报、今日变化和归寝账簿统一改为铜币格式。
- **Files to touch:** `js/money.js`, `build.js`, `js/render.js`, `js/app.js`, `test/money.js`, `package.json`
- **Tests:** `0/99/100/9999/10000/50123/-10123`；`50000 → 5金`；账簿不再显示裸数。
- **Dependencies:** 无
- **Acceptance:** `node test/money.js` 与相关 smoke 测试通过。
- **Status:** [X] done

### Task 2: 补强确定性日结契约
- **Description:** 先增加逐项断言，确认并按需修复日薪、维护费、普通/魔法作物天数、所有每日标记、六维设施引力、总引力、结算资金、防重和 AI 回写锁定。
- **Files to touch:** `test/api.js`, `js/mvu.js`
- **Tests:** 设计规格中八项确定性契约分别有明确断言；含普通农田标记和总引力锁定。
- **Dependencies:** Task 1
- **Acceptance:** 每个脚本确定事实都有通过的自动化测试，且同一结算 ID 不重复应用。
- **Status:** [X] done

### Task 3: 修正日常→脚本→归寝编排
- **Description:** 先写失败流程测试；普通回复维持一次日常更新，归寝在多 API 模式先执行日常变量后处理，再确定性结算，再额外执行归寝后处理；单 API 模式复用主剧情已有日常更新后执行脚本和额外归寝更新。
- **Files to touch:** `js/chat.js`, `js/api.js`, `test/api.js`
- **Tests:** 普通多 API 一次后处理；归寝多 API 两次且 purpose 顺序为 normal/endday；确定性结算位于两者之间；单 API 只额外调用一次归寝；失败降级不覆盖最新快照。
- **Dependencies:** Task 2
- **Acceptance:** 流程顺序被自动化测试锁定，不再以归寝更新替代本轮日常更新。
- **Status:** [X] done

### Task 4: 统一并验证 JSON Patch 输出协议
- **Description:** 先写失败测试，再让提取器验证 `UpdateVariable` 中的 `JSONPatch` 为合法数组，拒绝裸 lodash 命令和非法 JSON；更新第二 API 提示、错误信息、世界书规则/格式条目读取及测试样例。
- **Files to touch:** `js/extract.js`, `js/api.js`, `test/api.js`
- **Tests:** 合法 patch 接受；空数组接受；非法 JSON、非数组、裸 lodash 拒绝；提示包含阶段、铜币和防重复约束；规则与输出格式均进入第二 API 上下文。
- **Dependencies:** Task 3
- **Acceptance:** 主/副 API 正式协议均为 MVU JSON Patch，解析器和提示不再宣称支持 lodash 命令。
- **Status:** [X] done

### Task 5: 整理日常与归寝更新指导
- **Description:** 将重复初稿合并为唯一日常规则与唯一归寝规则；保留心之宝石、成长、任务种子等有用参考，并明确货币、触发阶段与脚本禁止重复项。
- **Files to touch:** `变量更新指导.txt`
- **Tests:** 文档结构检查：各阶段标题仅一次；铜币换算存在；八项脚本事实存在；日常/归寝职责和禁区明确。
- **Dependencies:** Tasks 2-4
- **Acceptance:** 文件无重复整章、无互相冲突规则，细节足以约束 AI。
- **Status:** [X] done

### Task 6: 扩充变量更新输出格式护栏
- **Description:** 在现有内容基础上保留分析结构和操作定义，补全阶段判断、证据约束、路径/父级选择、delta 计算、去重、铜币换算、正确示例与反例。
- **Files to touch:** `变量更新输出格式.txt`
- **Tests:** 文档结构检查：Analysis/JSONPatch、五类操作、只读限制、六类示例、反例和无变化规则齐全。
- **Dependencies:** Task 4
- **Acceptance:** 文件不是精简骨架，AI 即使只依赖此格式条目也能避免常见乱更新。
- **Status:** [X] done

### Task 7: 全量构建、运行与审查
- **Description:** 重建内联页面，运行完整测试和静态检查，实际启动项目验证资金显示与归寝流程，审查变更后仅提交本任务文件并推送 `origin/main`。
- **Files to touch:** `index.html`（构建产物）及必要测试修正
- **Tests:** `npm test`, `node --check`, `git diff --check`，实际页面检查 `50000 → 5金` 和归寝账簿单位。
- **Dependencies:** Tasks 1-6
- **Acceptance:** 全套测试通过、运行验证成功、代码审查无阻断问题、提交推送完成；不纳入用户无关改动。
- **Status:** [X] done
