# Progress Log: 暮归旅店数据与双 API 引擎

**Last Updated:** 2026-07-31

## Current Status
**Active Task:** None
**Completed:** 8 of 8 tasks

## Session Log

### 2026-07-31 — Tasks 1–2 Completed
- 移除非全屏宿主接管：其他楼层、首层边框与酒馆原生发送区均保留。
- 原生全屏目标改为当前 iframe，fixed 定位作为权限失败降级。
- MVU 提供完整最新楼层快照，始终使用 getLastMessageId。

### 2026-07-31 — Tasks 3–5 Completed
- 增加 mrfz_settings 兼容存储和多 API 设置 UI。
- 增加世界书规则读取、第二 API 超时重试、UpdateVariable 替换及 MVU 回写。
- Chat 使用统一发送入口并在后处理期间冻结输入。
- 归寝时 single 额外调用当前 API；multi 复用唯一一次第二 API，并显示可访问日结弹窗。

### 2026-07-31 — Tasks 6–7 Completed
- IndexedDB Assets 表持久保存员工 Blob 头像，支持上传、移除和无数据库降级。
- 农田按农田大小生成 0 起点田格，越界旧坐标保留。
- 根据用户纠正，农田 UI 使用“田格/旅店农田”语义，不称宏观“地块”。

### 2026-07-31 — Task 8 Completed
- 新增测试均已纳入 `npm test`，完整回归全部通过。
- 所有 JS 模块通过 `node --check`。
- Watch 已确认持续重打包；5501 服务返回 200 和 `Access-Control-Allow-Origin: *`。
- 本地 `index.html` 与 5501 实际响应 SHA-256 完全一致。
- 仅暂存本任务文件；保留用户原有删除、拆分参考文件及 MVU 文件中其他未暂存改动。

## Decisions Made
- 2026-07-31 多 API 归寝复用唯一一次第二 API 调用。
- 2026-07-31 农田坐标从 (0,0) 开始，越界旧数据保留。
- 2026-07-31 农田是旅店私有田格，不使用宏观地图“地块”文案。
- 2026-07-31 未定义上下文与世界书规则仅保留扩展点，不猜测。

## Open Questions
- [ ] 等待后续提供第二 API 的额外上下文信息。
- [ ] 等待后续确定“目前待定”世界书条目的最终名称及日结细则。
