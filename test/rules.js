/* rules.js · 世界书变量规则与输出格式结构测试 */
const fs = require('fs');
const path = require('path');

let failed = 0;
function ok(cond, label) { console.log((cond ? '  ✓ ' : '  ✗ ') + label); if (!cond) failed++; }
function count(text, pattern) { return (text.match(pattern) || []).length; }

const guide = fs.readFileSync(path.join(__dirname, '..', '变量更新指导.txt'), 'utf8');
const format = fs.readFileSync(path.join(__dirname, '..', '变量更新输出格式.txt'), 'utf8');

console.log('\n[Variable rules]');
ok(count(guide, /^## 一、日常更新（每次对话自动调用）$/gm) === 1, '日常更新规则仅有一套');
ok(count(guide, /^## 二、归寝日结（点击归寝额外触发）$/gm) === 1, '归寝更新规则仅有一套');
ok(/1金币\s*=\s*100银币\s*=\s*10000铜币/.test(guide) && /基础单位.*铜币/.test(guide), '指导明确铜币基础单位与换算');
['员工日薪', '建筑维护费', '作物剩余天数', '农田每日标记', '设施引力', '总引力', '已结算后的资金'].forEach((term) => ok(guide.includes(term), `指导包含脚本确定事实：${term}`));
ok(/日常更新[\s\S]*不得[\s\S]*推进.*天数/.test(guide), '日常规则禁止处理跨日事项');
ok(/归寝日结[\s\S]*不得重复[\s\S]*脚本/.test(guide), '归寝规则禁止重复脚本结算');
ok(/心之宝石与成长/.test(guide) && /任务种子系统/.test(guide), '保留心之宝石与任务种子参考');

console.log('\n[Variable output format]');
ok(/<UpdateVariable>[\s\S]*<Analysis>[\s\S]*<JSONPatch>[\s\S]*<\/UpdateVariable>/.test(format), '保留完整 Analysis + JSONPatch 骨架');
['replace', 'delta', 'insert', 'remove', 'move'].forEach((op) => ok(format.includes(op), `定义 ${op} 操作`));
ok(/"op": "move", "from": .*"to":/.test(format), '保留 MVU move 操作的 from/to 字段');
ok(/JSON Pointer/.test(format) && /~0/.test(format) && /~1/.test(format), '说明 JSON Pointer 转义');
ok(/同一路径/.test(format) && /目标值.*增量|增量.*目标值/.test(format), '包含去重和 delta 防误用护栏');
ok(/1金币\s*=\s*100银币\s*=\s*10000铜币/.test(format), '输出格式明确铜币换算');
['金额换算', '数值增减', '对象新增', '数组追加', '删除', '无变化'].forEach((example) => ok(format.includes(example), `包含${example}示例`));
ok(/错误示例|反例/.test(format) && /非法 JSON/.test(format), '包含常见错误反例');
ok(/_.*只读/.test(format), '保留只读字段限制');

console.log('\n[Builtin guides in HTML]');
{
  const { JSDOM } = require('jsdom');
  require(path.join(__dirname, '..', 'tools', 'gen-rules.js')).build();
  const dom = new JSDOM('<!doctype html>', { runScripts: 'dangerously', url: 'http://localhost/' });
  dom.window.eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'rules.js'), 'utf8'));
  const R = dom.window.Rules;
  const normal = R.defaultGuide('normal');
  const endday = R.defaultGuide('endday');
  const norm = (text) => text.replace(/\r\n/g, '\n').trim();

  ok(!!normal && !!endday && normal !== endday, '内置日常与归寝指导各自独立存在');
  ok(normal.includes('## 一、日常更新（每次对话自动调用）') && !normal.includes('## 二、归寝日结'), '日常指导只含日常规则');
  ok(endday.includes('## 二、归寝日结（点击归寝额外触发）') && !endday.includes('## 一、日常更新'), '归寝指导只含归寝规则');
  ok(normal.includes('## 全局原则') && endday.includes('## 全局原则'), '两份指导都保留全局原则');
  ok(normal.includes('# 系统参考') && endday.includes('# 系统参考'), '两份指导都保留系统参考');
  ok(/1金币\s*=\s*100银币\s*=\s*10000铜币/.test(normal) && /1金币\s*=\s*100银币\s*=\s*10000铜币/.test(endday), '两份指导都明确铜币换算');
  ok(norm(R.outputFormat()) === norm(format), '内置输出格式与源文件逐字一致');

  // 拼接后必须能完整还原源指导，防止生成脚本漏段
  const guideNorm = norm(guide);
  const sections = [normal, endday].join('\n');
  ['## 全局原则', '### 日常阶段禁止事项', '### 脚本已确定事实：AI不得重复或覆盖', '### 归寝阶段禁止事项', '## 心之宝石与成长', '## 任务种子系统']
    .forEach((mark) => ok(sections.includes(mark), `生成的指导保留段落：${mark}`));
  const bodyLines = guideNorm.split('\n').filter((line) => line.trim());
  const missing = bodyLines.filter((line) => !normal.includes(line) && !endday.includes(line));
  ok(missing.length === 0, '源指导每一行都出现在两份内置指导之一中' + (missing.length ? `（缺 ${missing.length} 行，例：${missing[0].slice(0, 30)}）` : ''));
}

console.log(failed ? `\n✗ ${failed} 项失败` : '\n✓ 全部通过');
process.exit(failed ? 1 : 0);
