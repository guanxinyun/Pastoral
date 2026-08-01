/* ============================================================
   山谷暮光标题与强制序章
   - 点击开始后检测最新楼层：0 楼/独立预览显示内置完整序章
   - 已有楼层直接恢复正式界面
   - 酒馆第 0 楼在展示前强制写入内置完整开局；独立预览不写聊天或 MVU
   ============================================================ */
const Intro = (function () {
  'use strict';

  const OPENING_TEXT = `【第一年，春季第1天，周一，晴天。7:00】
信是三天前到的。
准确地说，是一只浑身湿漉漉的灰色信鸽在你合租公寓的窗台上撞了三下玻璃，然后歪着脑袋看你，嘴里叼着一个蜡封的羊皮纸卷。你住在六楼。最近的鸽舍在城市另一头。你至今搞不懂它是怎么找到你的。
蜡封上压着一枚你从没见过的纹章：一棵弯曲的老槐树下，一盏亮着的灯。
信的内容如下：
“吾之后辈，见字如晤。
你大概不认识我。你爹大概也不怎么提起我。这很正常。我在家族里的名声一直不太好，主要是因为我年轻时把祖宅的东厢给炸了。那不是我的错，是那批符文墨水的配方有问题。
废话不多说。我叫霍根·星摇，是你远房叔公。我这辈子干过很多事（开过酒馆、跑过商队、给矮人当过翻译、在灰烬之地边缘捡过垃圾，别问）。最后我在一个叫'翠玉摇篮'的山谷里买下了一座旧法师庄园的地皮，把它改成了一家旅店。
旅店的名字我想了很久，最后决定叫'星梦摇篮'。
我知道，这名字听起来有点蠢。但我喜欢。
问题是，我老了。腿不行了，眼睛也花了，上个月还把盐和符文研磨粉搞混了。那顿饭的后果我不想描述，总之客人的头发变成了蓝色，持续了三天。
我决定出去走走。可能去南边看看海，可能去低语之森找精灵喝茶（如果他们肯搭理我的话），也可能就在路上的某家酒馆坐下来，再也不起身了。老人的旅行嘛，谁知道呢。
旅店我留给你了。
别激动。这不是什么了不起的遗产。旅店现在的状况，怎么说呢，'需要一点爱'。屋顶有两处漏水，厨房的符文灶台有一半的炉口不工作了，客房的床单上个月才换过（这在我的标准里已经算勤快了），院子里的杂草长得比我还高。
我给你留了五万铜币。不多，但够你撑过头一个月。粮仓里还有一些谷物和调料，虽然那袋胡椒可能过期了。
哦，对了。还有一个叫艾莉的丫头。她是附近镇上的姑娘，半年前来旅店帮工。烧菜的手艺不错，人也踏实，就是有点怕生。我走之前跟她说了，如果新掌柜是个靠谱的人，她愿意留下来。如果不靠谱，她原话是'我就回家种地去'。
所以，别不靠谱。
另外有一件事我需要提醒你。旅店的地下室有一扇上了锁的铁门，门上刻着一些我看不懂的符文。那扇门在我买下这块地的时候就在那里了，原来的庄园主留下的。我试过打开，没成功。我也试过请符文师来看，他看了一眼就说'这个等级的符文封印我碰不了，你需要找更厉害的人'，然后收了我五百铜币的出诊费走了。
那扇门偶尔会发出很轻很轻的嗡嗡声。不是恐怖的那种。更像是……有什么东西在门后面安静地呼吸。
我建议你暂时别管它。
好了，废话说完了。旅店是你的了。把它经营好，或者把它卖掉，或者也把东厢炸了，随你。
不过如果你真的决定留下来，记住一件事：
这个山谷很美。春天的时候，从旅店二楼的窗户往外看，能看到整个谷地被嫩绿色填满，溪水在阳光下闪成一条银线。夏天的夜晚，湖边的萤火虫多到像是有人在水面上撒了一把星星。秋天的丰收节，镇上的人会在广场上点起篝火，烤全羊的香气能飘出三里地。冬天下雪的时候，整个世界安静得只剩下壁炉里木柴噼啪的声音。
这些东西，值得你为它们做点什么。
——你的远房叔公，霍根·星摇
附言：旅店后面那棵老槐树下埋着一坛我三十年前酿的梅子酒。别挖。那是我留给自己的。如果哪天我回来了，我们一起喝。”

从白帆城出发，先是坐了两天的长途马车摇到了边城格林镇，然后在格林镇的驿站花了三十铜币租了一匹看起来比你还不想动的老驴，沿着一条勉强算是路的土道颠了大半天，终于在日落之前到达了信中所说的“翠玉摇篮”山谷。
叔公没有骗你。这个山谷确实很美。
你骑着老驴从山坡上往下看的时候，整个谷地被夕阳染成了一层蜜金色。远处有一面湖，湖水安静得像一面铜镜。山谷的东边是一片延绵的森林，树冠在风中起伏，像绿色的海浪。北边的远处可以隐约看到山脉的轮廓，在暮色中呈现出深蓝色的剪影。
旅店就在山谷的中央偏西。一栋两层的石木结构建筑，看得出年代久远，但底子是好的：墙壁用的是真正的山石砌成，很厚实。屋顶的确有两处明显的补丁痕迹，叔公说的漏水大概就是那两个位置。院子里的杂草确实高得离谱。门前有一棵巨大的老槐树，树冠如伞盖，底下放着一张褪了色的木椅和一张缺了一条腿的小桌子，显然是叔公平时坐在这里喝茶看风景的装备。
你推开那扇有点发涩的大门时，一股混合着灰尘、旧木头和隐约的草药气味的空气扑面而来。
大厅不大，但挑高不错。正对门的是一个木制吧台，台面上还摆着叔公没来得及收走的几个酒杯（已经落了一层灰）。吧台后面的墙上挂着一面生了绿锈的铜镜和几副歪歪扭扭的画框。左手边是通往厨房的矮门，右手边是一条通往客房的走廊。楼梯在大厅角落，通向二楼的掌柜卧室和另外两间客房。
你在大厅里站了一会儿，然后听到厨房方向传来轻微的响动。
一个脑袋从矮门后面探了出来。
那是一个大约十八九岁的姑娘，栗色短发，围着一条洗得有些发白的浅蓝色围裙。她看到你的瞬间明显愣了一下，然后飞速缩回去，过了两秒又探出来，这次多露出了半个身子。
“你、你是……叔公信里说的那个……”
她的声音不大，说话时目光在你脸上和地板之间快速切换，好像不确定该看哪里。
“我叫艾莉。艾莉·冬青。”
她从厨房门后完全走了出来，双手不太自然地在围裙上擦了擦，然后朝你弯了弯腰。不是那种正式的鞠躬，更像是不知道该做什么动作的时候身体自动执行的一个默认选项。
“叔公走之前说你会来。他说……嗯……他说让我'把新掌柜照顾好，如果觉得不靠谱就跑'。原话。”
她说完偷偷看了你一眼，好像在进行第一轮的“靠谱评估”。
“厨房的话，灶台有三个炉口是好的，另外两个的火元素核心好像松了，我不敢乱碰。冰柜的保鲜符文上个月刚充过能，还能用半年。水管是正常的，地下的水元素回路叔公两年前请人检修过。”
她扳着指头一一数着旅店的现状，每说一条就皱一下眉头，好像在心里给这些问题排优先级。
“客房的话，一楼有三间，二楼有两间，但二楼的一间被叔公堆满了杂物，暂时不能住人。床单我前天都换过了。浴室的水管有一根在滴水，我拿抹布缠了一下，暂时不漏了，但最好还是找人修。”
“仓库里有一些谷物、基础调味料和叔公留下的建材。我盘了一下，大概够我们撑二十来天。如果省着用的话。”
“院子……那个草……我一个人实在拔不完……”
她的声音越说越小，最后变成了几乎听不见的嘟囔。
“总之……欢迎来到星梦摇篮。虽然现在它看起来更像是'星梦残骸'……”
她说完这句话之后自己也被自己的吐槽噎了一下，耳朵尖微微泛红。
那是昨晚的事了。
你在二楼掌柜卧室的旧床上睡了这辈子最沉的一觉。可能是因为太累了，也可能是因为山谷夜晚的安静有一种催眠般的力量。窗外只有虫鸣和远处溪水的声响，偶尔夹杂着老槐树叶子被夜风翻动的沙沙声。
现在是清晨七点。
你被一缕阳光叫醒。
阳光是从东边的窗户照进来的，穿过尚未换洗的旧窗帘（叔公的品味相当独特：窗帘上绣着不知名的紫色花朵和一只看起来非常不高兴的猫头鹰），在木地板上划出一道金色的斜线。
空气里有一股若有若无的烤面饼的香味。
你赤脚踩在木地板上，凉意从脚底蔓延上来。走到窗前推开窗，春天的晨风裹着青草和泥土的气息灌了进来。
眼前的景色让你愣了一瞬。
整个翠玉摇篮山谷在晨光中铺展开来。嫩绿色的草地从旅店院墙外一直延伸到远处的森林边缘，中间隔着一条反射着银白光芒的溪流。北边的山脉在晨雾中只露出最高的几个峰尖，像是用淡墨在天际线上随手画的几笔。东南方向，那面昨日夕阳下如铜镜般的湖泊，现在笼着一层薄薄的雾气，像一碗正在散热的温水。
院子里那棵老槐树在晨光中显得格外高大。它的树冠遮住了半个院子，风一吹，新生的嫩叶就窸窣作响。树干上不知道什么时候被人（大概是叔公）刻了一行歪歪扭扭的小字。离得太远，看不清写的什么。
你注意到院子角落里有一小片已经被清理过的空地，杂草被拔掉了，露出下面深色的泥土。看痕迹是最近才弄的。旁边堆着一小捆拔下来的杂草。
那大概是艾莉的手笔。她一个人拔不完整个院子，但至少从角落开始了。
楼下传来轻微的声响，是碗碟碰撞的声音，然后是灶台的火元素核心被启动时那种低沉的“嗡”的一声。
新的一天开始了。
你站在窗前又看了一会儿山谷。晨风掠过你的脸，带着这个春天第一缕温度。
旅店很破。账上没什么钱。厨房一半的灶台不能用。院子像荒地。地下室有一扇嗡嗡响的锁着的门。你手下只有一个说话声音比蚊子大不了多少的十八岁姑娘。
但这个山谷真的很美。
叔公说得对。有些东西值得为它做点什么。
好了，大掌柜。
你打算从哪里开始？
楼下的艾莉似乎烤好了面饼。厨房飘来的香气正沿着楼梯往上爬。
你可以选择先下楼吃顿早饭，和她聊聊旅店的具体情况；也可以先在旅店里转一圈，亲眼看看每个角落的状况；或者干脆推开院门出去，在旅店周围走走，看看这片你从现在起要与之为邻的土地。
又或者，你有自己的想法。
 * 委托任务：
   「初来乍到」：旅店积了不少灰尘，是时候彻底打扫一下了。一个干净的环境是良好开端的第一步。（报酬：声望+3）`;

  const MARK = {
    pigeon: '信是三天前到的。',
    letterIntro: '信的内容如下：',
    letterStart: '“吾之后辈，见字如晤。',
    letterEnd: '附言：旅店后面那棵老槐树下埋着一坛我三十年前酿的梅子酒。别挖。那是我留给自己的。如果哪天我回来了，我们一起喝。”',
    journey: '从白帆城出发，先是坐了两天的长途马车摇到了边城格林镇',
    ellie: '一个脑袋从矮门后面探了出来。',
    morning: '那是昨晚的事了。',
    quest: ' * 委托任务：'
  };

  function formatOpeningMessage() {
    const lines = splitParagraphs(OPENING_TEXT);
    const output = ['# 一封来自远方的信', '', '> **星梦摇篮 · 家族遗产书**', '', '---', ''];
    let quoting = false;
    lines.forEach((line) => {
      if (line === MARK.pigeon) output.push('## 信鸽带来的遗产', '');
      if (line === MARK.letterIntro) output.push('### 霍根·星摇的来信', '');
      if (line === MARK.letterStart) quoting = true;
      if (line.startsWith(MARK.journey)) output.push('', '---', '', '## 前往翠玉摇篮', '');
      if (line === MARK.ellie) output.push('', '## 与艾莉初见', '');
      if (line === MARK.morning) output.push('', '---', '', '## 新的一天开始了', '');
      if (line.startsWith('* 委托任务：')) output.push('', '---', '', '## 委托任务', '');
      output.push(quoting ? '> ' + line : line, '');
      if (line === MARK.letterEnd) quoting = false;
    });
    output.push('```', '```');
    return output.join('\n').trim();
  }

  const OPENING_MESSAGE = formatOpeningMessage();

  let initialized = false;
  let starting = false;
  let ready = false;

  function splitParagraphs(text) {
    return String(text || '').split(/\n+/).map((value) => value.trim()).filter(Boolean);
  }

  function positions() {
    const entries = Object.entries(MARK).map(([key, value]) => [key, OPENING_TEXT.indexOf(value)]);
    if (entries.some(([, index]) => index < 0)) throw new Error('内置序章缺少章节标记');
    for (let i = 1; i < entries.length; i++) {
      if (entries[i][1] <= entries[i - 1][1]) throw new Error('内置序章章节顺序错误');
    }
    return Object.fromEntries(entries);
  }

  function slice(start, end) {
    const from = OPENING_TEXT.indexOf(start);
    const to = end ? OPENING_TEXT.indexOf(end) : OPENING_TEXT.length;
    return splitParagraphs(OPENING_TEXT.slice(from, to));
  }

  function chapters() {
    positions();
    return [
      { id: 'time', title: '第一年 · 春季第1天', paragraphs: [OPENING_TEXT.split('\n')[0]] },
      { id: 'pigeon', title: '一封迟到三天的信', paragraphs: slice(MARK.pigeon, MARK.letterStart) },
      { id: 'letter', title: '霍根·星摇的来信', paragraphs: slice(MARK.letterStart, MARK.journey) },
      { id: 'journey', title: '前往翠玉摇篮', paragraphs: slice(MARK.journey, MARK.ellie) },
      { id: 'ellie', title: '星梦摇篮的第一位帮工', paragraphs: slice(MARK.ellie, MARK.morning) },
      { id: 'morning', title: '新的一天开始了', paragraphs: slice(MARK.morning, MARK.quest) },
      { id: 'quest', title: '初来乍到', paragraphs: slice(MARK.quest) }
    ];
  }

  async function detectEntry() {
    if (typeof getLastMessageId !== 'function') return { mode: 'prologue', reason: 'standalone', floor: null };
    try {
      const floor = Number(await getLastMessageId());
      if (!Number.isFinite(floor) || floor < 0) throw new Error('最新楼层无效');
      return floor === 0
        ? { mode: 'prologue', reason: 'floor-zero', floor }
        : { mode: 'resume', reason: 'saved-chat', floor };
    } catch (error) {
      return { mode: 'prologue', reason: 'api-error', floor: null };
    }
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function paragraph(text, className) {
    const p = element('p', className || '', text);
    return p;
  }

  function removeTitle(focusTarget) {
    const title = document.getElementById('titleScreen');
    if (title) {
      title.classList.add('is-leaving');
      title.setAttribute('aria-hidden', 'true');
      setTimeout(() => { if (title.isConnected) title.remove(); }, 420);
    }
    if (focusTarget) {
      focusTarget.setAttribute('tabindex', '-1');
      try { focusTarget.focus({ preventScroll: true }); } catch (error) { focusTarget.focus(); }
      focusTarget.addEventListener('blur', () => focusTarget.removeAttribute('tabindex'), { once: true });
    }
  }

  function unlockBook() {
    const book = document.getElementById('book');
    if (!book) return null;
    book.removeAttribute('inert');
    book.removeAttribute('aria-hidden');
    book.classList.add('is-revealed');
    return book;
  }

  function enterGame() {
    const prologue = document.getElementById('prologue');
    if (prologue) prologue.hidden = true;
    document.body.classList.remove('is-title', 'is-prologue');
    document.body.classList.add('is-game');
    const book = unlockBook();
    if (book) {
      book.setAttribute('tabindex', '-1');
      try { book.focus({ preventScroll: true }); } catch (error) { book.focus(); }
      book.addEventListener('blur', () => book.removeAttribute('tabindex'), { once: true });
    }
    return book;
  }

  function revealExperience() {
    document.body.classList.remove('is-title', 'is-prologue');
    document.body.classList.add('is-game');
    const book = unlockBook();
    removeTitle(book);
    window.dispatchEvent(new CustomEvent('pastoral:intro-ready', { detail: { mode: 'resume' } }));
  }

  function appendParagraphs(container, values, classFor) {
    values.forEach((value) => container.appendChild(paragraph(value, typeof classFor === 'function' ? classFor(value) : classFor)));
  }

  async function persistFloorZeroOpening(decision) {
    if (!decision || decision.reason !== 'floor-zero' || !(window.Host && Host.inTavern)) return false;
    if (typeof setChatMessages !== 'function') throw new Error('当前环境无法覆盖第 0 楼开局文本');
    await setChatMessages([{ message_id: 0, message: OPENING_MESSAGE }], { refresh: 'none' });
    return true;
  }

  function renderPrologue(decision) {
    const root = document.getElementById('prologue');
    if (!root) throw new Error('缺少序章挂载点');
    const model = Object.fromEntries(chapters().map((chapter) => [chapter.id, chapter]));
    root.replaceChildren();
    root.hidden = false;

    const hero = element('header', 'prologue__hero');
    hero.dataset.prologueChapter = 'time';
    const eyebrow = element('p', 'prologue__eyebrow', '星梦摇篮 · 序章');
    const heading = element('h2', 'prologue__title', '一封来自远方的信');
    heading.id = 'prologueTitle';
    const time = element('time', 'prologue-time', model.time.paragraphs[0].replace(/^【|】$/g, ''));
    time.dateTime = 'Y1-SPRING-01T07:00';
    hero.append(eyebrow, heading, time);
    root.appendChild(hero);

    const measure = element('div', 'prologue__measure');
    const pigeon = element('article', 'prologue-chapter prologue-pigeon');
    pigeon.dataset.prologueChapter = 'pigeon';
    pigeon.appendChild(element('h3', 'prologue-chapter__title', model.pigeon.title));
    appendParagraphs(pigeon, model.pigeon.paragraphs);
    measure.appendChild(pigeon);

    const letter = element('article', 'prologue-chapter prologue-letter');
    letter.dataset.prologueChapter = 'letter';
    letter.appendChild(element('span', 'prologue-letter__crest', '槐'));
    letter.appendChild(element('h3', 'prologue-chapter__title', model.letter.title));
    const quote = element('blockquote', 'prologue-letter__paper');
    model.letter.paragraphs.forEach((value) => {
      if (value.startsWith('——你的远房叔公')) quote.appendChild(element('footer', 'prologue-letter__signature', value));
      else if (value.startsWith('附言：')) quote.appendChild(paragraph(value, 'prologue-letter__postscript'));
      else quote.appendChild(paragraph(value));
    });
    letter.appendChild(quote);
    measure.appendChild(letter);

    const journey = element('article', 'prologue-chapter prologue-journey');
    journey.dataset.prologueChapter = 'journey';
    journey.appendChild(element('h3', 'prologue-chapter__title', model.journey.title));
    const route = element('ol', 'prologue-route');
    route.dataset.prologueRoute = '';
    ['白帆城', '格林镇', '翠玉摇篮'].forEach((stop) => {
      const item = element('li', 'prologue-route__stop', stop);
      item.dataset.stop = stop;
      route.appendChild(item);
    });
    journey.appendChild(route);
    appendParagraphs(journey, model.journey.paragraphs);
    measure.appendChild(journey);

    const ellie = element('article', 'prologue-chapter prologue-ellie');
    ellie.dataset.prologueChapter = 'ellie';
    ellie.appendChild(element('h3', 'prologue-chapter__title', model.ellie.title));
    appendParagraphs(ellie, model.ellie.paragraphs, (value) => {
      if (/^“/.test(value) && /”$/.test(value)) return 'prologue-dialogue';
      return '';
    });
    Array.from(ellie.querySelectorAll('.prologue-dialogue')).forEach((node) => { node.dataset.prologueSpeaker = '艾莉'; });
    measure.appendChild(ellie);

    const morning = element('article', 'prologue-chapter prologue-morning');
    morning.dataset.prologueChapter = 'morning';
    morning.appendChild(element('h3', 'prologue-chapter__title', model.morning.title));
    appendParagraphs(morning, model.morning.paragraphs);
    measure.appendChild(morning);

    const quest = element('aside', 'prologue-quest');
    quest.dataset.prologueChapter = 'quest';
    quest.appendChild(element('p', 'prologue-quest__kicker', '委托任务'));
    quest.appendChild(element('h3', 'prologue-quest__title', '初来乍到'));
    const questText = model.quest.paragraphs.join(' ').replace(/^\*?\s*委托任务：\s*/, '').replace(/^「初来乍到」：/, '');
    const rewardMatch = questText.match(/（报酬：([^）]+)）$/);
    quest.appendChild(paragraph(questText.replace(/（报酬：[^）]+）$/, ''), 'prologue-quest__description'));
    quest.appendChild(element('p', 'prologue-quest__reward', rewardMatch ? rewardMatch[1] : '声望+3'));
    measure.appendChild(quest);
    if (window.Host && Host.inTavern) {
      const enter = element('button', 'prologue-enter', '进入旅店');
      enter.type = 'button';
      enter.dataset.prologueEnter = '';
      enter.addEventListener('click', enterGame);
      measure.appendChild(enter);
      document.body.classList.remove('is-title', 'is-game');
      document.body.classList.add('is-prologue');
    }
    root.appendChild(measure);

    if (!(window.Host && Host.inTavern)) unlockBook();
    removeTitle(heading);
    const detail = { mode: 'prologue', reason: decision && decision.reason || 'floor-zero', floor: decision && decision.floor != null ? decision.floor : null };
    window.dispatchEvent(new CustomEvent('pastoral:intro-ready', { detail }));
    ready = true;
    return root;
  }

  async function start() {
    if (starting || ready) return ready ? (document.getElementById('prologue') && !document.getElementById('prologue').hidden ? 'prologue' : 'resume') : null;
    starting = true;
    const button = document.getElementById('titleStart');
    const status = document.getElementById('titleStatus');
    if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
    if (status) status.textContent = '正在循着灯火辨认归途……';
    try {
      const decision = await detectEntry();
      window.dispatchEvent(new CustomEvent('pastoral:intro-start', { detail: decision }));
      if (decision.mode === 'prologue') {
        await persistFloorZeroOpening(decision);
        renderPrologue(decision);
      }
      else { revealExperience(); ready = true; }
      return decision.mode;
    } catch (error) {
      if (status) status.textContent = '暂时无法展卷，请再试一次。';
      if (button) { button.disabled = false; button.setAttribute('aria-busy', 'false'); }
      throw error;
    } finally {
      starting = false;
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;
    document.body.classList.add('is-title');
    const button = document.getElementById('titleStart');
    if (!button) return;
    button.setAttribute('aria-busy', 'false');
    button.addEventListener('click', start);
  }

  return { OPENING_TEXT, OPENING_MESSAGE, chapters, detectEntry, init, start, persistFloorZeroOpening, renderPrologue, revealExperience, enterGame };
})();
window.Intro = Intro;
