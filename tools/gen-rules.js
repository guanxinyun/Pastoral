/* ============================================================
   tools/gen-rules.js · 生成 js/rules.js
   把《变量更新指导》拆成日常 / 归寝两份自足指导，并与
   《变量更新输出格式》一起内联进前端，使变量请求不再依赖世界书。
   用法：node tools/gen-rules.js
   ============================================================ */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const GUIDE_FILE = '变量更新指导.txt';
const FORMAT_FILE = '变量更新输出格式.txt';
const MARK_NORMAL = '## 一、日常更新（每次对话自动调用）';
const MARK_ENDDAY = '## 二、归寝日结（点击归寝额外触发）';
const MARK_REFERENCE = '# 系统参考';

function read(name) {
  return fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n');
}

/** 按整行标记切成 [intro, normal, endday, reference] 四段。 */
function splitGuide(text) {
  const lines = text.split('\n');
  const at = (mark) => {
    const index = lines.indexOf(mark);
    if (index < 0) throw new Error(`《${GUIDE_FILE}》缺少段落标记：${mark}`);
    return index;
  };
  const normalAt = at(MARK_NORMAL);
  const enddayAt = at(MARK_ENDDAY);
  const referenceAt = at(MARK_REFERENCE);
  if (!(normalAt < enddayAt && enddayAt < referenceAt)) throw new Error('段落标记顺序异常');
  const cut = (from, to) => lines.slice(from, to).join('\n').trim();
  return {
    intro: cut(0, normalAt),
    normal: cut(normalAt, enddayAt),
    endday: cut(enddayAt, referenceAt),
    reference: cut(referenceAt, lines.length)
  };
}

/** 逐行 JSON.stringify 后拼接，避免反引号与 ${} 破坏字面量。 */
function literal(text, indent) {
  const pad = ' '.repeat(indent);
  const lines = text.split('\n').map((line) => pad + '  ' + JSON.stringify(line));
  return '[\n' + lines.join(',\n') + '\n' + pad + '].join(\'\\n\')';
}

function build() {
  const parts = splitGuide(read(GUIDE_FILE));
  const format = read(FORMAT_FILE).trim();
  const out = `/* ============================================================
   内置变量更新指导（由 tools/gen-rules.js 自动生成，请勿手改）
   来源：${GUIDE_FILE} / ${FORMAT_FILE}
   日常与归寝各自是一份自足指导，均已附带系统参考；
   输出格式单独提供，由 ApiEngine 在组装提示词时合并。
   ============================================================ */
const Rules = (function () {
  'use strict';

  const INTRO = ${literal(parts.intro, 2)};

  const NORMAL = ${literal(parts.normal, 2)};

  const ENDDAY = ${literal(parts.endday, 2)};

  const REFERENCE = ${literal(parts.reference, 2)};

  const OUTPUT_FORMAT = ${literal(format, 2)};

  const DEFAULT_GUIDE = {
    normal: [INTRO, NORMAL, REFERENCE].join('\\n\\n'),
    endday: [INTRO, ENDDAY, REFERENCE].join('\\n\\n')
  };

  function key(kind) { return kind === 'endday' ? 'endday' : 'normal'; }

  /** 内置默认指导：normal / endday 各一份完整文本。 */
  function defaultGuide(kind) { return DEFAULT_GUIDE[key(kind)]; }

  /** 内置输出格式；与指导合并后一起发给变量模型。 */
  function outputFormat() { return OUTPUT_FORMAT; }

  return { DEFAULT_GUIDE, OUTPUT_FORMAT, defaultGuide, outputFormat };
})();
window.Rules = Rules;
`;
  fs.mkdirSync(path.join(root, 'js'), { recursive: true });
  fs.writeFileSync(path.join(root, 'js', 'rules.js'), out);
  return out.length;
}

if (require.main === module) {
  console.log(`[gen-rules] js/rules.js 已生成 · ${build()} 字节`);
}

module.exports = { build, splitGuide, GUIDE_FILE, FORMAT_FILE, MARK_NORMAL, MARK_ENDDAY, MARK_REFERENCE };
