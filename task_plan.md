# Task Plan: 暮归旅店数据与双 API 引擎

**Created:** 2026-07-31
**Status:** completed
**Goal:** 修复宿主共存/页面级全屏并实现 latest MVU、双 API、日结、头像和农田地块网格。

## Architecture
保持原生 JS 模块化与内联构建，新增 Settings、Assets、ApiEngine 模块，由 Chat 统一协调主生成和变量后处理。所有 MVU 面板和后处理基线都锚定最新楼层。

## Task Breakdown

### Task 1: 修复宿主共存与页面全屏
- **Files:** js/host.js, js/app.js, css/layout.css, test/iframe.js, test/layout.js
- **Tests:** 酒馆楼层/发送区不被隐藏；iframe 自身全屏
- **Status:** [X] done

### Task 2: 固定最新楼层 MVU 快照
- **Files:** js/mvu.js, test/smoke.js
- **Tests:** getMvuData 收到 lastMessageId
- **Status:** [X] done

### Task 3: 增加多 API 设置
- **Files:** js/settings.js, js/app.js, css/components.css, build.js
- **Tests:** 默认、兼容合并、持久化
- **Status:** [X] done

### Task 4: 实现双轨 API 流水线
- **Files:** js/api.js, js/chat.js, js/extract.js, js/mvu.js, test/api.js
- **Tests:** 标签替换、重试、降级、MVU 回写、去重
- **Status:** [X] done

### Task 5: 实现归寝每日结算
- **Files:** js/app.js, js/chat.js, js/api.js, css/components.css
- **Tests:** single/multi 调用次数和总结
- **Status:** [X] done

### Task 6: 增加员工 IndexedDB 头像
- **Files:** js/assets.js, js/render.js, css/components.css
- **Tests:** 无 IDB 降级、DOM 上传入口
- **Status:** [X] done

### Task 7: 改造农田地块网格
- **Files:** js/data.js, js/render.js, css/components.css, 本项目mvu文件.txt
- **Tests:** 3×3、缺失格、越界兼容
- **Status:** [X] done

### Task 8: 完成回归打包与推送
- **Files:** index.html and tests/build metadata
- **Tests:** npm test, CORS curl, watch rebuild
- **Status:** [X] done
