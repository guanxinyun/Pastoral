# 暮归旅店 · 酒馆前端重构计划

## 目标
把当前"独立全屏 HUD"重构为：**借鉴.html 风格的双页翻书布局**（左页功能面板切换、右页正文叙事）+ **iframe 适配** + **酒馆助手/MVU 数据驱动** + **模块化打包（css/js → 内联 index.html）+ 5501 热更新服务器**。

## 关键决策（已定）
- 布局：双页书。**左页=功能面板**（标签切换：总览/库存/建筑/地图/员工/访客/任务/农牧），**右页=正文**（HUD + 当前楼层叙事 + 选项 + 行动栏）。窄屏堆叠。
- 翻页效果：借鉴.html 的 **inkBleed 墨水渗透**（blur+scale 淡入），非 3D rotateY。
- 图标：**内联手绘 SVG**（沿用已有 64 图标库，零 CDN，与借鉴.html 一致）。
- 状态来源：**MVU `stat_data`**（8 大域）；API 不可用时回退样例数据（独立预览可用）。
- 玩家行动：**不本地改状态**，统一 `/setinput` 把意图发给 AI，由 AI+MVU 更新，前端轮询刷新。

## 文件结构（模块化源码 → 打包）
```
Pastoral/
├─ css/            源样式（tokens/base/layout/components/animations）改造去 vh/absolute
├─ js/             源逻辑，拆分：
│   ├─ icons.js     手绘 SVG 图标库（保留）
│   ├─ data.js      样例 stat_data（回退用，按本项目 MVU 结构）
│   ├─ extract.js   正文/选项提取（formatAsTavernRegexedString + DOM 手术 + 选项正则）
│   ├─ mvu.js       waitGlobalInitialized('Mvu') + getMvuData + 1s 轮询 + 状态合并
│   ├─ render.js    stat_data → 各面板/HUD/雷达 渲染（数据驱动）
│   └─ app.js       初始化、标签切换、事件、/setinput、inkBleed
├─ src/template.html  HTML 骨架（双页书 + 空 panel 容器 + <!--STYLE-->/<!--SCRIPT--> 占位）
├─ build.js        读取 template+css+js → 内联生成自包含 index.html
├─ dev.js          监听 css/js/src 变化自动重建 + 5501 端口 CORS(*) 静态服务器
└─ index.html      【打包输出，自包含，勿手改】
```

## iframe 适配（强制）
- 去 `vh`/`min-height`/`overflow:auto`/主体 `position:absolute`；用 % + px + flex，宽度自适应无横向滚动。
- 卡片用透明或羊皮纸底；书容器 `width:100%; max-width:1200px` 居中。
- 去除原抽屉/模态/吐司的 absolute 覆层；确认改内联行内提示。

## 数据映射（stat_data 8 域 → UI）
- HUD：`世界.时间`(年/季/天/星期/天气/当前时间)、`旅店.资金`(单数字)、`旅店.声望`、`大掌柜.精力`、`大掌柜.压力`。
- 总览：六维雷达读 `访客生态.设施引力`；引力公式读 `访客生态.{声望/设施/服务/环境引力}`+`总引力值`；当日预报读 `当日预报`。
- 库存：`旅店.库存`(record name→{数量,品质,分类,描述})，按 `分类` 筛选（修复分类 tab）；`旅店.配方`(name→{材料,售价,难度,需要设施,描述})。
- 建筑：`建筑.已建成` / `建筑.蓝图`（修复已建成/蓝图子 tab）；蓝图 `建造成本.物资` 为文本。
- 地图：`世界.地块`(record "x,y"→{类型,描述,资源,本季采集次数})，-7~7 网格 + 迷雾。
- 员工：`旅店.员工`(name→{属性五维,状态,职业信息.阶级T1-T5/日薪,心之宝石,技能})。
- 访客：`旅店.当前访客`(name→{类型,满意度,消费能力,需求偏好,抗性标签})。
- 任务：`叙事引擎.{委托任务,羁绊故事,任务种子}`。
- 农牧：`农牧.{农田网格,堆肥箱,畜牧}`。
- 集合统一 `Object.entries()` 遍历；品质枚举 粗糙/普通/优良/精品/传说。

## 正文提取（按指导文件）
- `getCurrentMessageId()` → `getChatMessages(id)[0].message` 取 rawText。
- 选项：正则前用 5 种标签（option/options/choice/choices/select）提取 `extractOptions`。
- 正文：`formatAsTavernRegexedString(rawText,'ai_output','display',{depth:0})` → DOM 手术剥结构壳、留内联美化（`extractCleanContent`）→ innerHTML 注入右页。
- 选项渲染为按钮，点击 `triggerSlash('/setinput "..."')` 回填输入框。

## 交互（/setinput，不判材料）
- 烹饪：展示 `旅店.配方`，**只显示材料文本，不判断够不够、不禁用**；点击 → `/setinput 烹制：{配方名}`。
- 建造：蓝图点击 → `/setinput 建造：{蓝图名}`。
- 探索：邻接迷雾格 → `/setinput 探索：({x},{y})`。
- 浇水/归寝/小憩/招募 → 对应 /setinput。
- 叙事选项按钮 → /setinput 选项文本。
- 1s 轮询：rawText 与 stat_data 均未变则跳过；变化则重渲染（保留翻页/数值翻页/雷达弹性/流光微动效）。

## 修复点
- 建筑「已建成/蓝图」子 tab、库存「全部/食材/自然/特产/魔法/成品」分类 tab：数据驱动 + 正确绑定，彻底修复不切换问题。
- 烹饪去除材料充足/不足判断与禁用按钮。

## 交付
1. 重构 css/js/src；build.js 生成 index.html；dev.js 启动 5501（后台运行）。
2. 末尾输出酒馆加载代码：
```
<body>
<script>
$('body').load('http://localhost:5501/index.html')
</script>
</body>
```
3. 提交推送 origin/main。

## 风险/备注
- 酒馆 API 仅在 iframe 内可用；独立预览用样例数据回退，保证 `index.html` 直接打开也好看。
- `/setinput` 文本格式为自然中文意图（如"烹制：清露松茸汤"），AI/角色卡侧需配合识别；如需固定格式可后调。
