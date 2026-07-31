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

console.log(failed ? `\n✗ ${failed} 项失败` : '\n✓ 全部通过');
process.exit(failed ? 1 : 0);
