# 暮归旅店 · 酒馆前端重构计划

## 目标
把当前"独立全屏 HUD"重构为：**借鉴.html 风格的双页翻书布局**（左页功能面板切换、右页正文叙事）+ **iframe 适配** + **酒馆助手/MVU 数据驱动** + **模块化打包（css/js → 内联 index.html）+ 5501 热更新服务器**。

## 伪同层运行机制（v0.2）

**唯一宿主判定**
- 加载时 `getCurrentMessageId()`；仅 0 楼渲染与轮询。
- 1 楼及之后的卡片 `document.body.innerHTML = ''` 自我销毁并隐藏，释放性能。
- 无酒馆 API（浏览器直开）视为宿主，走样例数据，独立预览仍完整可看。

**全局样式绝对接管**（`js/host.js` 跨域注入父文档）
- `#chat > .mes:not([mesid="0"]) { display: none !important; }` —— 酒馆界面永远只显示 0 楼。
- 0 楼气泡去壳：隐藏头像/名字/操作条/swipe 箭头，去背景与内边距，只留前端卡。
- `#send_form, #form_sheld { display: none !important; }` —— 原生输入区隐藏，由卡内 composer 接管。

**数据与视口剥离**
- UI 固定在 0 楼，0 楼内轮询器用 `getChatMessages('0-' + getLastMessageId())` 抓取**全部**楼层，在右页渲染为气泡流。
- 属性变量永远读最新一楼：`Mvu.getMvuData({ type:'message', message_id: getLastMessageId() })`。

**高频轮询 + Hash 去重**
- 对话流 400ms 轮询；Hash = `消息数_最后一楼字符数_生成状态`，未变则完全跳过 DOM 重绘。
- 面板/HUD 仍 1s 轮询，按 `stat_data` 签名逐面板比对。
- 生成中显示打字指示（监听 `iframe_events.GENERATION_STARTED/ENDED`）。

**编辑与删除兼容**
- 右键任意气泡 → 复制原文 / 编辑本楼 / 删除本楼，直接操作对应 `message_id`。
- 编辑：原地 textarea → `setChatMessages([{message_id, message}], {refresh:'none'})`。
- 删除：两步确认后 `deleteChatMessages([message_id])`（不可逆，故需确认）。
- 0 楼是界面宿主，仅允许复制，禁止编辑/删除（否则自毁界面）。

**输入接管**
- 卡内 composer：Enter 发送 / Shift+Enter 换行；`/send` 入档 + `/trigger` 触发生成。
- 叙事选项、烹饪、建造、探索、农事等按钮统一填入 composer（`intend()`），玩家确认后再发送。

**双页等分 + 全屏**
- 双页严格等宽等高：`.book{align-items:stretch}` + ≥900px 时 `.page{flex:1 1 0;width:50%}`（该规则须写在基础规则之后，否则被同优先级覆盖）。
- 左页页脚全屏按钮：进入时 iframe 钉满视口（父文档注入 `position:fixed;inset:0;100vw/100vh`）+ 尝试原生 Fullscreen API + 锁父页滚动；退出反向。外部 Esc 退出全屏时按钮状态自动同步。
- 全屏下对话流与左页面板各自内部滚动，滚动条按主题定制。

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
├─ js/             源逻辑，拆分（打包顺序即下列顺序）：
│   ├─ host.js      【最先执行】唯一宿主判定 + 跨域样式接管 + 全屏沉浸
│   ├─ icons.js     手绘 SVG 图标库（保留）
│   ├─ data.js      样例 stat_data（回退用，按本项目 MVU 结构）
│   ├─ extract.js   正文/选项提取（formatAsTavernRegexedString + DOM 手术 + 选项正则）
│   ├─ mvu.js       waitGlobalInitialized('Mvu') + getMvuData（读最新一楼）
│   ├─ chat.js      全局对话接管：400ms 轮询 + Hash 去重 + 气泡右键菜单 + composer
│   ├─ render.js    stat_data → 各面板/HUD/雷达 渲染（数据驱动）
│   └─ app.js       初始化、标签切换、事件、全屏、inkBleed
├─ src/template.html  HTML 骨架（双页书 + 空 panel 容器 + <!--STYLE-->/<!--SCRIPT--> 占位）
├─ build.js        读取 template+css+js → 内联生成自包含 index.html
├─ dev.js          监听 css/js/src 变化自动重建 + 5501 端口 CORS(*) 静态服务器
├─ test/           jsdom 烟雾测试（npm test）
│   ├─ smoke.js     0 楼宿主 / 非 0 楼自毁 / 独立预览 / 编辑删除 / Hash 去重
│   ├─ iframe.js    父子文档：跨域样式接管实际生效 + 全屏进出
│   └─ layout.js    双页等分的层叠顺序断言（防基础规则覆盖等宽回归）
└─ index.html      【打包输出，自包含，勿手改】
```

验证：`npm test`（先打包，再跑三套 jsdom 测试）。

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
- 选项渲染为按钮，点击填入卡内 composer（`intend()`）。
- 伪同层下每一楼都走同一套提取管线渲染成气泡；0 楼原文即界面源码（超 60000 字符）时折叠占位，不塞满屏。

## 交互（填入 composer，不判材料）
原生输入框已被接管隐藏，故所有意图统一经 `intend()` 填进**卡内 composer**，玩家可改后按 Enter 发送（`/send` + `/trigger`）：
- 烹饪：展示 `旅店.配方`，**只显示材料文本，不判断够不够、不禁用**；点击 → `烹制：{配方名}`。
- 建造：蓝图点击 → `建造：{蓝图名}`。
- 探索：邻接迷雾格 → `探索：({x},{y})`。
- 浇水/收获/开垦/播种/归寝/小憩 → 对应中文意图文本。
- 叙事选项按钮 → 选项文本。
- 轮询：对话流 400ms（Hash 去重），面板/HUD 1s（stat_data 签名去重）；均未变则跳过重绘，保留翻页/数值翻页/雷达弹性/流光微动效。

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
- 意图文本为自然中文（如"烹制：清露松茸汤"），AI/角色卡侧需配合识别；如需固定格式可后调。
- 跨域样式接管依赖父文档同源可访问。若酒馆把卡片放进 `sandbox` 或跨源 iframe，`window.parent.document` 会抛异常；此时接管与全屏钉满自动降级（`parentDoc()` 返回 null），卡片本身仍正常工作，但原生输入框与其他楼层不会被隐藏。
- `render.js` 曾用同名 `triggerSlash` 覆盖酒馆原生全局，已改名 `runSlash` 并优先调用原生 API；勿再定义同名全局。
- 删除楼层不可逆，故右键菜单采用两步确认；0 楼受保护不可删。
