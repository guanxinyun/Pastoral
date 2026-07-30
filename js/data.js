/* ============================================================
   暮归旅店 · 示例游戏数据（前端原型用，无后端）
   ============================================================ */

const GAME = {
  funds: 342,          // 单位：银（100 银 = 1 金）
  energy: 78,
  stress: 34,
  prestige: 42,        // 0~100
  typewriter: true,    // 打字机叙事开关
};

/* 六维引力：美食 / 知识 / 舒适 / 冒险 / 文化 / 自然 */
const DIMS = [
  { key: 'food',     name: '美食', val: 72, color: 'var(--dim-food)',
    sources: [['主灶房 Lv.2', 38], ['后院菜畦', 14], ['清露松茸汤', 12], ['野山蜜', 8]] },
  { key: 'lore',     name: '知识', val: 45, color: 'var(--dim-lore)',
    sources: [['老井符文', 22], ['褪袍旅人', 13], ['藏书残页', 10]] },
  { key: 'comfort',  name: '舒适', val: 58, color: 'var(--dim-comfort)',
    sources: [['后院菜畦', 24], ['铃兰装饰', 16], ['主灶房', 12], ['净井水', 6]] },
  { key: 'adventure',name: '冒险', val: 30, color: 'var(--dim-adventure)',
    sources: [['林缘隙地', 18], ['苔松茸采集', 12]] },
  { key: 'culture',  name: '文化', val: 50, color: 'var(--dim-culture)',
    sources: [['老井低语', 26], ['春祭邀约', 14], ['游方术士', 10]] },
  { key: 'nature',   name: '自然', val: 64, color: 'var(--dim-nature)',
    sources: [['后院菜畦', 34], ['林间鸡舍', 16], ['晨露麦粉', 14]] },
];

/* 引力公式四项 */
const GRAVITY = [
  { key: 'fame',    label: '声望引力', val: 12 },
  { key: 'facility',label: '设施引力', val: 18 },
  { key: 'service', label: '服务引力', val: 9 },
  { key: 'env',     label: '环境引力', val: 7 },
];

/* 员工五维：技艺 / 悟性 / 体力 / 亲和 / 专注 */
const STAFF_AXES = ['技艺', '悟性', '体力', '亲和', '专注'];
const STAFF = [
  { id: 1, name: '苏半夏', vals: [14, 9, 12, 11, 13] },
  { id: 2, name: '阿苔',   vals: [6, 4, 10, 7, 5] },
];

/* 时段定义 */
const TIMES = {
  dawn:      { label: '清晨', icon: 'sunrise',   theme: 'day',   desc: '晨光初照，露重风清。采集与种植的良时，访客尚少。' },
  forenoon:  { label: '上午', icon: 'highnoon',  theme: 'day',   desc: '日头渐高，大堂渐有人声。适合烹饪与待客。' },
  afternoon: { label: '下午', icon: 'afternoon', theme: 'day',   desc: '斜阳温软，探索与建造的好时候。' },
  dusk:      { label: '傍晚', icon: 'sunset',    theme: 'night', desc: '夕照染金，旅人纷纷投宿。夜间营业收益提升。' },
  night:     { label: '夜晚', icon: 'moon',      theme: 'night', desc: '烛火摇曳，魔法之物悄然苏醒。压力更易累积。' },
};

/* 天气 */
const WEATHERS = {
  sunny:  { icon: 'sun',   name: '晴朗', sub: '日光充足 · 作物生长 +15%' },
  cloudy: { icon: 'cloud', name: '多云', sub: '光线柔和 · 采集舒适' },
  rainy:  { icon: 'rain',  name: '小雨', sub: '井水充盈 · 自动浇灌种植区' },
  snowy:  { icon: 'snow',  name: '飞雪', sub: '万物休眠 · 魔法材料更易凝结' },
};

/* 已探索地块（世界坐标，旅店居 0,0） */
const TILES = {
  '0,0':   { type: 'inn',      icon: 'house',   name: '暮归旅店',     desc: '你的旅店。灶台尚温，招牌轻晃。', res: [] },
  '0,1':   { type: 'field',    icon: 'garden',  name: '后院菜畦',     desc: '旅店后方的菜地，泥土湿润。', res: [['晨露麦', '∞'], ['紫胡萝卜', '∞']] },
  '0,2':   { type: 'field',    icon: 'wheat',   name: '麦田边',       desc: '一片野生的麦丛，随风轻摆。', res: [['晨露麦', '12'], ['干柴火', '4']] },
  '1,0':   { type: 'forest',   icon: 'tree',    name: '苔松林缘',     desc: '松针覆地，空气里有菌子的气息。', res: [['苔松茸', '6'], ['干柴火', '8']] },
  '2,1':   { type: 'forest',   icon: 'tree',    name: '苔松林深处',   desc: '林冠渐密，偶有鸟鸣。', res: [['苔松茸', '4'], ['清露香草', '5']] },
  '3,-1':  { type: 'field',    icon: 'berry',   name: '林缘隙地',     desc: '春日第三天，山莓恰熟。', res: [['山莓', '9'], ['铃兰', '6']] },
  '1,-1':  { type: 'cave',     icon: 'cave',    name: '苔石小洞',     desc: '洞口沁凉，深处隐有微光。', res: [['青石板', '14'], ['净水符石', '1']] },
  '-1,0':  { type: 'lake',     icon: 'lake',    name: '银鳞溪',       desc: '溪水清浅，可见鱼影。', res: [['银鳞溪鱼', '8'], ['青石板', '6']] },
  '-2,1':  { type: 'forest',   icon: 'berry',   name: '野蜜林角',     desc: '蜂巢悬于老树，蜜香阵阵。', res: [['野山蜜', '3'], ['蜂蜡', '4']] },
  '0,-1':  { type: 'mountain', icon: 'mountain',name: '青峦脚',       desc: '山石嶙峋，可采石料。', res: [['青石板', '20'], ['矿石', '5']] },
};

/* 配方（用于快捷烹饪模态） */
const RECIPES = [
  { name: '清露松茸汤', stars: 2, price: 18, mats: [['苔松茸', 1, true], ['清露香草', 1, true], ['净水符石', 1, true]] },
  { name: '蜜烤溪鱼',   stars: 1, price: 12, mats: [['银鳞溪鱼', 1, true], ['野山蜜', 1, true], ['干柴火', 1, false]] },
  { name: '晨露麦饼',   stars: 1, price: 8,  mats: [['晨露麦粉', 2, true], ['林间鸡蛋', 1, true]] },
  { name: '香草煎蛋',   stars: 1, price: 6,  mats: [['林间鸡蛋', 2, true], ['清露香草', 1, true]] },
];

/* 招募渠道 */
const CHANNELS = [
  { key: 'board',   name: '布告栏', icon: 'scroll',  desc: '在村口张贴招贤榜，招来附近乡民。耗时短，品质平平。', cost: '免费 · 1 天', tag: 'pill' },
  { key: 'market',  name: '人才市集', icon: 'merchant', desc: '前往镇上的人才市集，可遇中等资质的匠人。', cost: '5 银 · 即时', tag: 'pill--amber' },
  { key: 'special', name: '奇缘引荐', icon: 'sparkle', desc: '由特殊访客引荐，或可遇奇才。需满足特定羁绊。', cost: '羁绊 · 限定', tag: 'pill--mint' },
];

window.GAME = GAME;
window.DIMS = DIMS;
window.GRAVITY = GRAVITY;
window.STAFF_AXES = STAFF_AXES;
window.STAFF = STAFF;
window.TIMES = TIMES;
window.WEATHERS = WEATHERS;
window.TILES = TILES;
window.RECIPES = RECIPES;
window.CHANNELS = CHANNELS;
