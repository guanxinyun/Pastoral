# Pastoral 移动单页、MVU 保持与员工详情交互设计

**日期：** 2026-08-01  
**状态：** 已获用户口头批准，等待书面规格复核  
**范围：** 深度注入默认值、生成期间 MVU 状态保持、手机全屏单页切换、全设备员工详情展开

## 1. 目标

本轮解决四个相互关联的体验问题：

1. 将变量请求的“屏蔽世界书按深度注入条目与作者注释”改为默认不勾选。
2. 主模型生成期间，新楼尚未写入 MVU 时继续显示上一条有效消息的状态，不闪回样例默认值。
3. 手机沉浸/全屏模式一次只显示一页，通过“经营页 / 剧情页”切换，默认进入经营页。
4. 所有设备上的员工卡均改为摘要 + 点击展开详情，并在 MVU 重绘后保留展开状态。

桌面普通与桌面全屏仍保持现有双页结构；主剧情、第二 API、固定预设短事务和伪同层真实消息坐标不改变。

## 2. 非目标

- 不改主剧情的 `/send + /trigger await=true` 流程。
- 不改第二 API 的 URL、重试、提示词或固定预设 1 秒 + 2 秒捕获时序。
- 不重做全部经营面板。
- 不增加左右滑动手势，避免和对话滚动、地图与横向标签冲突。
- 不把剧情页并入现有总览/库存/员工等经营标签。
- 不改变 MVU Schema 或 initvar 数据结构。

## 3. 总体架构

四项能力保持在原有模块边界内：

| 能力 | 主要模块 | 责任 |
|---|---|---|
| 深度注入默认值 | `js/settings.js`、`js/api.js`、`js/app.js` | 默认、规范化、请求 overrides、设置 UI |
| 有效 MVU 回退 | `js/mvu.js` | 按真实楼层寻找最近有效完整 MvuData |
| 移动单页 | `src/template.html`、`css/layout.css`、`js/app.js`、`js/host.js` | 页签、可见页状态、进入/退出全屏同步 |
| 员工展开 | `js/render.js`、`css/components.css` | 摘要按钮、详情区域、展开状态集合 |

应用仍由 `build.js` 将模块化源码构建为 `index.html` 与 `public/index.html`。

## 4. 深度注入默认不屏蔽

### 4.1 新默认

普通变量更新和归寝变量更新均使用：

```javascript
blockDepthEntries: false
```

设置页复选框默认不勾选。玩家主动勾选后保存为 `true`，后续加载保持勾选。

### 4.2 一次性旧设置迁移

设置根对象新增内部版本标记：

```javascript
variablePresetSettingsVersion: 2
```

读取旧缓存时，如果版本缺失或小于 2：

1. 将普通和归寝阶段的 `blockDepthEntries` 都设为 `false`；旧版本无法区分自动保存的默认 `true` 与玩家主动勾选的 `true`，因此统一采用本次用户确认的新默认。
2. 写入版本 2，并立即持久化迁移后的完整设置，同时继续保留宿主或其他脚本的未知字段。
3. 版本达到 2 后不再重复迁移；此后玩家主动保存的 `true` 会保持。

迁移写入失败时仍返回内存中的新默认配置并记录警告，不能阻止设置页和应用启动。

### 4.3 严格布尔规范化

不能继续用 `value !== false`，因为它会把缺失值和非布尔字符串都变成 `true`。新规则：

```javascript
preset.blockDepthEntries = preset.blockDepthEntries === true;
```

结果：

- `true` → 屏蔽。
- `false` → 放行。
- 缺失、字符串、数字或损坏值 → 默认放行。

现有存储中明确保存的 `true` 仍被视为玩家选择并保留；不强制改写已经明确勾选的用户设置。

### 4.4 请求覆盖拆分

`buildOverrides()` 把“普通聊天历史为空”和“屏蔽深度注入”分开处理。

仅当 `blockDepthEntries === true` 时添加：

```javascript
overrides.chat_history = {
  with_depth_entries: false,
  author_note: '',
};
```

none 模式且未勾选普通聊天历史时，仍可清空普通历史：

```javascript
overrides.chat_history = {
  ...existingChatHistoryOverride,
  prompts: [],
};
```

但 `blockDepthEntries === false` 时不得为了清空 `prompts` 顺带加入 `with_depth_entries:false` 或 `author_note:''`。

### 4.5 UI 文案

设置页说明改为中性事实：

- 默认不屏蔽，由酒馆按当前预设处理深度条目和作者注释。
- 勾选后才强制关闭。
- 普通聊天历史与深度注入是两个不同开关。

有效请求摘要不再把放行标成警告；显示“沿用酒馆深度注入与作者注释”。

## 5. 生成期间保持最近有效 MVU

### 5.1 有效状态定义

有效消息 MVU 满足：

```javascript
isPlainObject(data)
&& isPlainObject(data.stat_data)
&& Object.keys(data.stat_data).length > 0
```

`null`、数组、空对象或 `{stat_data:null}` 均视为未初始化。

### 5.2 缓存

`MVU` 保存：

```javascript
lastValidSnapshot: null
lastValidMessageId: null
```

缓存的是完整深拷贝 `MvuData`，不是只缓存 `stat_data`。

### 5.3 读取算法

`getDataSnapshot()`：

1. 获取 `latest = getLastMessageId()`。
2. 读取最新楼完整 MVU。
3. 若有效，更新缓存并返回独立深拷贝。
4. 若无效且内存缓存存在，返回缓存深拷贝。
5. 若无缓存，从 `latest - 1` 向 0 回溯消息楼层，找到第一份有效完整 MVU，更新缓存并返回。
6. 若全部无效或宿主 API 不可用，返回 `{stat_data: clone(SAMPLE_STATE)}`。

### 5.4 回溯边界

- 回溯只在最新楼无效且内存缓存为空时发生，不进入每秒长期扫描。
- 从最新楼逐层向前，命中后立即停止。
- 单楼读取异常继续尝试更早楼层；全局 API 不可用才使用样例。
- 若宿主支持负深度但语义可能跨版本不同，本实现仍使用明确正整数楼层 ID。

### 5.5 写入与业务边界

- 回退只影响读取和 UI 显示。
- 第二 API、日结和编辑仍写入流程捕获的目标 `messageId`。
- 不把旧快照写回新楼。
- `writeData()` 成功后，如果写入数据有效，可更新内存缓存及对应 message ID，使 UI 尽快看到最终状态。
- 每个公开读取结果都返回深拷贝，调用方不得修改缓存引用。

## 6. 手机全屏单页模式

### 6.1 激活条件

仅在以下条件同时满足时启用：

- `body.is-immersive`；
- CSS 媒体查询 `max-width: 899px`。

非全屏窄屏继续使用现有自然堆叠，避免在普通酒馆消息卡高度中强制占满视口。桌面沉浸仍双页等宽。

### 6.2 移动页签

模板新增一个仅在手机沉浸时显示的页签栏，位于书容器顶部：

```text
[经营页] [剧情页] [退出全屏]
```

语义：

- 容器 `role="tablist"`，前两个按钮 `role="tab"`。
- 按钮用 `aria-selected`、`aria-controls` 指向左右页。
- 退出按钮是普通 icon/text button，调用现有 `Host.setImmersive(false)`。
- 所有按钮至少 44×44px，并有 hover、active、focus-visible 状态。

### 6.3 页面状态

应用保存：

```javascript
mobilePage = 'ledger' | 'story'
```

规则：

- 每次从非沉浸进入沉浸时，重置为 `ledger`（经营页）。
- 退出全屏时移除页面类并恢复两页正常布局。
- 经营页：左页显示，右页隐藏。
- 剧情页：右页显示，左页隐藏。
- 切换仅改变 body/book 状态类、hidden/ARIA，不移除 DOM。

因此对话滚动、composer 草稿、当前经营标签和员工展开集合均保留。

### 6.4 跨功能导航

任何现有动作调用 `openTab(name)` 时：

- 先打开对应经营子标签；
- 若当前处于手机沉浸模式，再切到经营页。

例如剧情页点击“烹饪”后自动显示经营页并打开库存。普通桌面不受影响。

进入剧情页后，应在布局完成后保持对话滚动位置；首次进入若当前流接近底部，滚到最新消息。不得每次切换都无条件跳到底部。

### 6.5 CSS

手机沉浸不再：

```css
flex-wrap: wrap;
height: auto;
两页同时上下堆叠；
```

改为：

- `.book` 高度为 `100dvh`，同时提供 `100vh` 回退。
- 单页占满剩余高度，内部面板或对话流滚动。
- 非激活页 `display:none` 或 `hidden`。
- 使用 `env(safe-area-inset-*)` 给刘海、状态栏和底部手势区留边。
- 移动页签固定在书容器顶部但不脱离可访问顺序。

## 7. 所有设备员工卡可展开

### 7.1 状态

`Render` 对象保存：

```javascript
expandedStaff: new Set()
```

键为员工名。员工名不存在于最新状态后，从集合中清除。

### 7.2 摘要区

每张卡的顶部改为原生按钮：

- 姓名；
- 职业与阶级；
- 精力、士气、忠诚摘要；
- 展开/收起图标；
- `aria-expanded`；
- `aria-controls` 指向稳定详情 ID。

头像上传和移除不能嵌套在该按钮内。卡头布局把头像操作区与展开按钮分离；点击上传、移除不会冒泡触发展开。

### 7.3 详情区

默认收起；展开后显示：

- 五维小雷达和五维数值；
- 日薪（沿用项目统一货币格式，不能继续误标固定“银”）；
- 技能；
- 心之宝石；
- 描述；
- 头像管理操作。

精力、士气、忠诚在摘要区显示，不必在详情内重复完整三条；详情可以保留更精确数值但避免信息重复。

### 7.4 动画与无障碍

- 展开/收起采用 150–300ms CSS 过渡。
- `prefers-reduced-motion: reduce` 下关闭高度/透明动画。
- 键盘 Enter/Space 由原生 button 自动支持。
- focus ring 明显。
- 详情用 `hidden` 和 `aria-expanded` 同步，屏幕阅读器不会读取收起内容。

### 7.5 重绘保持

`renderStaff()` 每次根据 `expandedStaff.has(name)` 重建相同状态。点击时更新集合，然后仅同步该卡按钮的 `aria-expanded` 与详情 `hidden` 状态，不重新渲染整个员工面板；后续 MVU 驱动的面板重绘再从集合恢复展开状态。

## 8. 错误与降级

- MVU 回溯失败：继续尝试更早楼；全部失败才用样例，控制台只记录一次可诊断警告，避免每秒刷屏。
- 手机媒体查询 API 不存在：CSS 仍按视口控制单页可见性；JS 通过 `window.innerWidth < 900` 判断移动交互，并监听 `resize`，避免页签可见但脚本不可切换。
- 原生全屏请求被拒绝：Host 的 fixed iframe 沉浸降级仍会触发 `is-immersive`，手机单页仍可使用。
- 员工详情 ID 需对员工名做稳定、安全编码，不能直接把任意姓名拼进 CSS selector。
- 头像 IndexedDB 不可用：保持当前 toast 错误与姓名首字头像降级。

## 9. 测试设计

### 9.1 设置与请求

`test/settings.js`：

- 新配置两阶段 `blockDepthEntries === false`。
- 旧版本缓存无论原值缺失、false 或 true，首次加载都迁移为 false 并写入版本 2。
- 版本 2 配置中的缺失或非布尔值归一化为 false。
- 版本 2 中玩家显式保存的 true 保留。
- 单独修改一个阶段不影响另一个阶段；未知字段在迁移后保留。

`test/api.js`：

- false 时不设置 `with_depth_entries:false` 与 `author_note:''`。
- none + chatHistory false 仍清空 `prompts`，但不屏蔽深度条目。
- true 时三种模式均添加屏蔽覆盖。

`test/smoke.js`：

- 设置页默认不勾选。
- 文案正确。
- 勾选保存后重新打开仍勾选。

### 9.2 MVU

新增或扩展 MVU 单元测试：

- 最新楼有效：直接返回并缓存。
- 最新楼 `stat_data:null`：返回缓存的上一份有效状态。
- 最新楼空对象且无缓存：向前回溯并命中。
- 中间楼读取抛错：继续回溯。
- 全部无效：才使用 `SAMPLE_STATE`。
- 返回值是独立克隆。
- 写回有效数据后更新缓存，但目标楼仍是明确 message ID。

### 9.3 手机全屏

`test/layout.js`：

- 桌面沉浸双页规则仍存在。
- 手机沉浸规则只显示一个活动页，不再上下堆叠两页。
- 使用 `100dvh`、安全区和定制滚动。

`test/iframe.js` 或独立移动交互测试：

- 模拟 `matchMedia('(max-width: 899px)')` 为 true。
- 进入沉浸默认经营页。
- 点击剧情页切换可见页和 ARIA。
- 点击经营页恢复。
- 退出全屏还原普通两页。
- 桌面 matchMedia false 不显示移动页签且保持双页。

### 9.4 员工

`test/assets.js` 或新增 `test/staff.js`：

- 所有设备默认摘要、详情 hidden。
- 点击按钮展开并更新 `aria-expanded`。
- 再次点击收起。
- MVU 重绘后展开状态保留。
- 展开另一员工可独立存在，不强制手风琴单开。
- 头像上传/移除不切换详情。
- 日薪使用统一货币格式。

### 9.5 全量验证

- `npm test`
- 修改 JS 的 `node --check`
- `git diff --check`
- 构建后 `index.html` 与 `public/index.html` 一致
- 检查只暂存本任务相关文件，不纳入用户原有删除项、参考切片和无关文档

## 10. 验收标准

1. 新用户打开设置时，普通和归寝的深度注入屏蔽均未勾选。
2. 玩家主动勾选后，变量请求才关闭深度条目和作者注释。
3. 主模型生成中的新楼 MVU 为空时，HUD 和经营面板保持上一条有效楼状态。
4. 手机全屏每次默认经营页，一次只显示一页，可随时切换剧情页和退出。
5. 桌面全屏仍是双页。
6. 任意设备均可点击员工摘要展开/收起详情，刷新状态后展开选择保持。
7. 所有现有测试与新增测试通过，功能构建产物同步。
