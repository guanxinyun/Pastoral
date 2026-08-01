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
  win.Host = { inTavern: !!options.inTavern };
  let writeCalls = 0, deleteCalls = 0, slashCalls = 0, mvuWriteCalls = 0;
  let releaseWrite = null;
  const writes = [];
  win.setChatMessages = async (messages, config) => {
    writeCalls++;
    writes.push({ messages, config });
    if (options.writeError) throw new Error(options.writeError);
    if (options.deferWrite) await new Promise((resolve) => { releaseWrite = resolve; });
  };
  win.deleteChatMessages = () => { deleteCalls++; throw new Error('序章不应删聊天'); };
  win.triggerSlash = () => { slashCalls++; throw new Error('序章不应触发生成'); };
  win.Mvu = { replaceMvuData: () => { mvuWriteCalls++; throw new Error('序章不应写 MVU'); } };
  if (fs.existsSync(sourcePath)) win.eval(fs.readFileSync(sourcePath, 'utf8'));
  return {
    win,
    doc: win.document,
    releaseWrite: () => { if (releaseWrite) releaseWrite(); },
    calls: () => ({ writeCalls, deleteCalls, slashCalls, mvuWriteCalls, writes })
  };
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
    ok(typeof Intro.OPENING_MESSAGE === 'string' && Intro.OPENING_MESSAGE.startsWith('# 一封来自远方的信'),
      '首楼持久化文本使用 Markdown 标题排版');
    const openingParagraphs = Intro.OPENING_TEXT.split(/\n+/).map((part) => part.trim()).filter(Boolean);
    let cursor = -1;
    ok(typeof Intro.OPENING_MESSAGE === 'string' && openingParagraphs.every((part) => {
      cursor = Intro.OPENING_MESSAGE.indexOf(part, cursor + 1); return cursor >= 0;
    }), '首楼排版完整保留每段开局原文及顺序');
    ok(typeof Intro.OPENING_MESSAGE === 'string' && /\n---\n/.test(Intro.OPENING_MESSAGE) && /```\s*```\s*$/.test(Intro.OPENING_MESSAGE),
      '首楼排版包含章节分隔并在末尾保留空围栏触发标记');
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
    ok(calls.writeCalls === 0 && calls.deleteCalls === 0 && calls.slashCalls === 0 && calls.mvuWriteCalls === 0,
      '独立预览序章不写聊天、不触发生成、不写 MVU');
    ok(!doc.getElementById('book').hasAttribute('inert') && doc.getElementById('book').getAttribute('aria-hidden') !== 'true', '独立预览中序章后正式界面可用');
  }

  console.log('\n[4] 酒馆第 0 楼覆盖与序章互斥');
  const tavern = load({ lastId: () => 0, inTavern: true, deferWrite: true });
  if (tavern.win.Intro) {
    tavern.win.Intro.init();
    const starting = tavern.win.Intro.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const pending = tavern.calls();
    const write = pending.writes[0];
    ok(pending.writeCalls === 1 && write && write.messages[0].message_id === 0,
      '酒馆新开局先写回第 0 楼');
    ok(!!write && write.messages[0].message === tavern.win.Intro.OPENING_MESSAGE,
      '第 0 楼正文被完整排版开局覆盖');
    ok(!!write && write.config.refresh === 'none', '覆盖第 0 楼不触发宿主整页重载');
    ok(tavern.doc.getElementById('prologue').hidden, '写回完成前不伪装序章已就绪');
    tavern.releaseWrite();
    await starting;
    const enter = tavern.doc.querySelector('[data-prologue-enter]');
    ok(tavern.doc.body.classList.contains('is-prologue'), '写回后进入独立序章视图');
    ok(tavern.doc.getElementById('book').hasAttribute('inert') && tavern.doc.getElementById('book').getAttribute('aria-hidden') === 'true', '酒馆阅读序章时正式界面保持锁定');
    ok(!!enter && enter.tagName === 'BUTTON', '酒馆序章提供进入旅店按钮');
    enter && enter.dispatchEvent(new tavern.win.MouseEvent('click', { bubbles: true }));
    ok(tavern.doc.body.classList.contains('is-game') && !tavern.doc.body.classList.contains('is-prologue'), '点击后切换到正式游戏视图');
    ok(tavern.doc.getElementById('prologue').hidden && !tavern.doc.getElementById('book').hasAttribute('inert'), '进入游戏后隐藏序章并解锁双页书');
  }

  console.log('\n[5] 第 0 楼覆盖失败可重试');
  const failedWrite = load({ lastId: () => 0, inTavern: true, writeError: 'write denied' });
  if (failedWrite.win.Intro) {
    failedWrite.win.Intro.init();
    let rejected = false;
    try { await failedWrite.win.Intro.start(); } catch (error) { rejected = /write denied/.test(String(error && error.message)); }
    const button = failedWrite.doc.getElementById('titleStart');
    ok(rejected, '第 0 楼写回失败向调用方报告错误');
    ok(button.disabled === false && button.getAttribute('aria-busy') === 'false', '写回失败后开始按钮恢复可点击');
    ok(failedWrite.doc.getElementById('titleStatus').textContent === '暂时无法展卷，请再试一次。', '写回失败显示可重试状态');
    ok(failedWrite.doc.getElementById('prologue').hidden, '写回失败不显示未持久化的序章');
  }

  console.log('\n[6] 零层围栏不能覆盖强制文本');
  const fenced = load({ lastId: () => 0, inTavern: true });
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
