/* intro.js · 标题入口、楼层判定与强制序章测试 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const sourcePath = path.join(root, 'js', 'intro.js');
const template = fs.readFileSync(path.join(root, 'src', 'template.html'), 'utf8');
let failed = 0;
function ok(cond, label) { console.log((cond ? '  ✓ ' : '  ✗ ') + label); if (!cond) failed++; }

function load(options = {}) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <section id="titleScreen"><button id="titleStart" type="button">开始游戏</button><p id="titleStatus"></p></section>
    <section id="prologue" hidden></section>
    <main id="book" inert aria-hidden="true"></main>
  </body></html>`, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
  const { window: win } = dom;
  win.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  win.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  win.getLastMessageId = options.lastId;
  let writeCalls = 0, slashCalls = 0, mvuWriteCalls = 0;
  win.setChatMessages = () => { writeCalls++; throw new Error('序章不应写聊天'); };
  win.deleteChatMessages = () => { writeCalls++; throw new Error('序章不应删聊天'); };
  win.triggerSlash = () => { slashCalls++; throw new Error('序章不应触发生成'); };
  win.Mvu = { replaceMvuData: () => { mvuWriteCalls++; throw new Error('序章不应写 MVU'); } };
  if (fs.existsSync(sourcePath)) win.eval(fs.readFileSync(sourcePath, 'utf8'));
  return { win, doc: win.document, calls: () => ({ writeCalls, slashCalls, mvuWriteCalls }) };
}

(async () => {
  console.log('\n[1] 标题模板契约');
  ok(/id="titleScreen"/.test(template), '模板包含标题层');
  ok(/id="gameTitle"[^>]*>我们的家族/.test(template), '模板包含准确游戏名');
  ok(/作者\s*·\s*观心/.test(template), '模板包含作者观心');
  ok(/卡免费发布\s*·\s*类脑\s*\/\s*旅程/.test(template), '模板包含发布说明');
  ok(template.includes('https://discord.com/channels/1380075940285124724/1480878747291881654'), '模板包含准确作者卡楼');
  ok(/target="_blank"/.test(template) && /rel="noopener noreferrer"/.test(template), '作者卡楼安全新开');
  ok(/<main class="book" id="book" inert aria-hidden="true">/.test(template), '正式界面初始不可交互');

  console.log('\n[2] 内置原文与楼层决策');
  const base = load({ lastId: () => 0 });
  ok(!!base.win.Intro, 'Intro 模块存在');
  if (base.win.Intro) {
    const { Intro } = base.win;
    ok(Intro.OPENING_TEXT.startsWith('【第一年，春季第1天，周一，晴天。7:00】'), '开局以准确时间开头');
    ok(Intro.OPENING_TEXT.includes('——你的远房叔公，霍根·星摇'), '开局包含准确署名');
    ok(Intro.OPENING_TEXT.trimEnd().endsWith('（报酬：声望+3）'), '开局以准确任务报酬结尾');
    ok(Intro.OPENING_TEXT.length > 3500, '开局为完整长文本而非摘要');
    let decision = await Intro.detectEntry();
    ok(decision.mode === 'prologue' && decision.reason === 'floor-zero' && decision.floor === 0, '第 0 层强制序章');

    base.win.getLastMessageId = () => 9;
    decision = await Intro.detectEntry();
    ok(decision.mode === 'resume' && decision.reason === 'saved-chat' && decision.floor === 9, '已有存档跳过重复序章');

    delete base.win.getLastMessageId;
    decision = await Intro.detectEntry();
    ok(decision.mode === 'prologue' && decision.reason === 'standalone' && decision.floor === null, '独立预览使用内置序章');

    base.win.getLastMessageId = () => { throw new Error('host unavailable'); };
    decision = await Intro.detectEntry();
    ok(decision.mode === 'prologue' && decision.reason === 'api-error', '楼层接口异常安全降级');
  }

  console.log('\n[3] 序章语义与无副作用');
  const scene = load({ lastId: () => 0 });
  if (scene.win.Intro) {
    scene.win.Intro.init();
    await scene.win.Intro.start();
    const { doc } = scene;
    ok(!!doc.querySelector('[data-prologue-chapter="time"] time') && doc.querySelector('[data-prologue-chapter="time"] time').textContent.includes('7:00'), '时间铭牌使用语义 time');
    ok(!!doc.querySelector('[data-prologue-chapter="letter"] blockquote'), '叔公来信使用独立信纸引用');
    ok(!!doc.querySelector('[data-prologue-route] [data-stop="白帆城"]'), '路线包含白帆城');
    ok(!!doc.querySelector('[data-prologue-route] [data-stop="格林镇"]'), '路线包含格林镇');
    ok(!!doc.querySelector('[data-prologue-route] [data-stop="翠玉摇篮"]'), '路线包含翠玉摇篮');
    ok(!!doc.querySelector('[data-prologue-speaker="艾莉"]'), '艾莉对白具有语义强调');
    ok(!!doc.querySelector('[data-prologue-chapter="quest"] .prologue-quest__reward')
      && doc.querySelector('.prologue-quest__reward').textContent.includes('声望+3'), '任务报酬完整保留');
    ok(doc.getElementById('prologue').textContent.includes('地下室有一扇上了锁的铁门'), '来信中段完整存在');
    ok(doc.getElementById('prologue').textContent.includes('又或者，你有自己的想法。'), '结尾自由行动提示存在');
    const calls = scene.calls();
    ok(calls.writeCalls === 0 && calls.slashCalls === 0 && calls.mvuWriteCalls === 0, '序章不写聊天、不触发生成、不写 MVU');
    ok(!doc.getElementById('book').hasAttribute('inert') && doc.getElementById('book').getAttribute('aria-hidden') !== 'true', '序章后正式界面可用');
  }

  console.log('\n[4] 零层围栏不能覆盖强制文本');
  const fenced = load({ lastId: () => 0 });
  fenced.win.getChatMessages = () => [{ message_id: 0, message: '```\n```' }];
  if (fenced.win.Intro) {
    fenced.win.Intro.init();
    await fenced.win.Intro.start();
    const copy = fenced.doc.getElementById('prologue').textContent;
    ok(copy.includes('霍根·星摇') && copy.includes('声望+3'), '零层只剩围栏时仍显示完整内置序章');
  }

  console.log(failed ? `\n✗ ${failed} 项失败` : '\n✓ 全部通过');
  process.exit(failed ? 1 : 0);
})();
