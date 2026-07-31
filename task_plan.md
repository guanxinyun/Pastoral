# Task Plan: 农牧、设置与酒馆运行机制升级

**Created:** 2026-07-31 17:00
**Status:** completed
**Goal:** 修复酒馆宿主与交互问题，加入可配置提示词、确定性设施引力和日结，并完整支持新版可扩展农牧结构。

## Architecture

保持原生 JavaScript 模块与内联构建。将确定性变量规则集中到 MVU 层：设施六维引力由所有已建成建筑对应子引力分别求和并写回；归寝在主剧情后只执行一次前端确定性结算，再把已结算事实交给 AI 完成非确定性预报。设置、聊天和渲染层只负责交互、编排与展示。

## Task Breakdown

### Task 1: 为设置与提示词建立兼容存储
- **Description:** 先写失败测试，再增加普通/归寝提示词空值持久化、默认回退读取和旧字段兼容。
- **Files to touch:** `js/settings.js`, `test/settings.js`
- **Tests:** 空值不落默认文案；自定义值可恢复；旧字段不丢失。
- **Dependencies:** 无
- **Acceptance:** `node test/settings.js` 通过。
- **Status:** [X] done

### Task 2: 实现设施引力与确定性日结引擎
- **Description:** 先写失败测试；按建筑六维对应子引力之和更新设施引力和总引力；归寝只扣一次薪资/维护费并推进普通与魔法作物剩余天数。
- **Files to touch:** `js/mvu.js`, `test/api.js`, `test/smoke.js`
- **Tests:** 六维求和不除以 6；MVU 写回；日结防重复；资金与植物日期准确。
- **Dependencies:** Task 1
- **Acceptance:** 新确定性计算测试通过。
- **Status:** [X] done

### Task 3: 扩展 API 提示构建与标签兼容
- **Description:** 普通/归寝提示词按空值回退；提交脚本设施引力和日结事实；副 API 裸命令包装，目标正文无标签时追加。
- **Files to touch:** `js/extract.js`, `js/api.js`, `test/api.js`
- **Tests:** 自定义/默认提示词；计算事实进入请求；标签替换/追加/包装；无命令重试。
- **Dependencies:** Task 1, Task 2
- **Acceptance:** `node test/api.js` 通过。
- **Status:** [X] done

### Task 4: 修复输入叠加和归寝确认流程
- **Description:** compose 改为换行追加；失败恢复；归寝先确认并显示阶段，成功展示对账结果。
- **Files to touch:** `js/chat.js`, `js/app.js`, `css/components.css`, `test/smoke.js`
- **Tests:** 追加而非覆盖；取消不发送；确认只发送一次；失败恢复；结果字段可见。
- **Dependencies:** Task 2, Task 3
- **Acceptance:** 交互测试通过。
- **Status:** [X] done

### Task 5: 重做可交互设置页面
- **Description:** 页面式对话框，接口/提示词页签，焦点管理、保存反馈与恢复默认。
- **Files to touch:** `js/app.js`, `css/components.css`, `test/smoke.js`
- **Tests:** 设置可点击输入；页签切换；提示词保存；空值状态；键盘关闭。
- **Dependencies:** Task 1
- **Acceptance:** 设置 DOM 与交互测试通过。
- **Status:** [X] done

### Task 6: 接管父页面其余聊天楼层
- **Description:** 第 0 层注入隐藏规则并监听 DOM 重建；保留原生输入区；卸载清理。
- **Files to touch:** `js/host.js`, `test/iframe.js`
- **Tests:** 第 1 层后隐藏；第 0 层/发送区保留；卡内全局对话仍在；全屏不回归。
- **Dependencies:** 无
- **Acceptance:** `node test/iframe.js` 通过。
- **Status:** [X] done

### Task 7: 实现新版可扩展农牧 UI
- **Description:** 普通农田、魔法农田、种子图鉴、畜牧与堆肥四子页，动态尺寸与完整字段展示。
- **Files to touch:** `js/render.js`, `js/data.js`, `css/components.css`, `test/farm.js`, `本项目mvu文件.txt`
- **Tests:** 动态普通/魔法网格；锁定态；种子筛选和字段；畜牧/堆肥；动作追加。
- **Dependencies:** Task 4
- **Acceptance:** `node test/farm.js` 通过且触控尺寸/滚动适配。
- **Status:** [X] done

### Task 8: 展示脚本引力与日初资金
- **Description:** 总览统一展示脚本设施引力、总引力来源、日初资金和经营变化。
- **Files to touch:** `js/render.js`, `js/data.js`, `test/smoke.js`
- **Tests:** 六维不再错误全零；日初/当前资金及变化显示；缺失值不冒充 0。
- **Dependencies:** Task 2
- **Acceptance:** 总览测试通过。
- **Status:** [X] done

### Task 9: 完整回归、浏览器与开发服务验证
- **Description:** 自动构建内联 HTML；运行全套测试；启动/复用 5501 Watch+CORS；浏览器实际交互验证；审查代码。
- **Files to touch:** `package.json`（仅必要时）, `index.html`, tests
- **Tests:** `npm test`; CORS GET/OPTIONS；Watch；浏览器打开与关键交互。
- **Dependencies:** Tasks 1-8
- **Acceptance:** 全部测试通过，服务响应 200/CORS `*`，无运行时错误。
- **Status:** [X] done

### Task 10: 提交并同步远端
- **Description:** 仅暂存本任务文件，避免用户现有无关改动；提交并推送到 `origin/main`。
- **Files to touch:** Git metadata
- **Tests:** `git diff --check`, `git status`, 远端确认。
- **Dependencies:** Task 9
- **Acceptance:** 本地提交完成；网络可用时推送成功，否则明确报告。
- **Status:** [X] done
