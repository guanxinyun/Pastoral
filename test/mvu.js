/* mvu.js · 最近有效楼层快照测试 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let failed = 0;
function ok(cond, label) { console.log((cond ? '  ✓ ' : '  ✗ ') + label); if (!cond) failed++; }

function load(floors, latest = 5, sample = { sample: true }) {
  const dom = new JSDOM('<!doctype html>', { runScripts: 'dangerously', url: 'http://localhost/' });
  const win = dom.window;
  const reads = [], writes = [];
  win.SAMPLE_STATE = sample;
  win.getLastMessageId = () => latest;
  win.eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'mvu.js'), 'utf8'));
  win.MVU.ready = true;
  win.MVU.api = {
    getMvuData: ({ message_id }) => {
      reads.push(message_id);
      const value = floors[message_id];
      if (value instanceof Error) throw value;
      return value;
    },
    replaceMvuData: async (data, options) => { writes.push({ data, options }); }
  };
  return { win, reads, writes };
}

(async () => {
  console.log('\n[MVU fallback]');

  {
    const { win, reads } = load({
      4: { stat_data: { 旅店: { 资金: 400 } }, marker: 'old' },
      5: { stat_data: null, marker: 'new-empty' }
    });
    const snapshot = win.MVU.getDataSnapshot();
    ok(snapshot.marker === 'old' && snapshot.stat_data.旅店.资金 === 400,
      '冷启动从最新空楼回溯到上一有效楼');
    ok(reads.join(',') === '5,4', '回溯命中后立即停止');
    if (snapshot && snapshot.stat_data && snapshot.stat_data.旅店) snapshot.stat_data.旅店.资金 = 1;
    const second = win.MVU.getDataSnapshot();
    ok(second && second.stat_data && second.stat_data.旅店 && second.stat_data.旅店.资金 === 400, '返回值是独立克隆');
  }

  {
    const { win } = load({ 5: { stat_data: { 旅店: { 资金: 500 } }, marker: 'latest' } });
    const snapshot = win.MVU.getDataSnapshot();
    ok(snapshot.marker === 'latest' && win.MVU.lastValidMessageId === 5, '最新有效楼直接缓存');
  }

  {
    const { win, reads } = load({ 5: { stat_data: {} }, 4: { stat_data: { value: 4 } } });
    win.MVU.rememberValid({ stat_data: { value: 3 }, marker: 'cached' }, 3);
    reads.length = 0;
    const snapshot = win.MVU.getDataSnapshot();
    ok(snapshot.marker === 'cached' && reads.join(',') === '5', '已有缓存时最新空楼不重复向前扫描');
  }

  {
    const { win, reads } = load({ 5: { stat_data: null }, 4: new Error('broken'), 3: { stat_data: { value: 3 }, marker: 'three' } });
    ok(win.MVU.getDataSnapshot().marker === 'three' && reads.join(',') === '5,4,3', '单楼读取失败后继续回溯');
  }

  {
    const { win } = load({ 5: { stat_data: null }, 4: { stat_data: {} } }, 5, { fallback: 9 });
    ok(win.MVU.getDataSnapshot().stat_data.fallback === 9, '全部实时楼层无效时才使用样例状态');
  }

  {
    const { win, writes } = load({ 5: { stat_data: { value: 5 } } });
    win.MVU.getDataSnapshot();
    const next = { stat_data: { value: 6 }, marker: 'written' };
    await win.MVU.writeData(next, 6);
    ok(writes.length === 1 && writes[0].options.message_id === 6, '写回仍使用明确目标楼层');
    ok(win.MVU.lastValidMessageId === 6 && win.MVU.lastValidSnapshot.marker === 'written', '成功写回后更新有效缓存');
  }

  console.log(failed ? `\n✗ ${failed} 项失败` : '\n✓ 全部通过');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
