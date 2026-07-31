/* ============================================================
   正文 / 选项提取（按"酒馆正文提取与处理指导文件"）
   - 不硬编码 <maintext>；先 formatAsTavernRegexedString 跑正则，再 DOM 手术
   - 选项在正则前从原文提取（5 种标签）
   - API 不可用时回退 SAMPLE_RAWTEXT
   ============================================================ */
const Extract = {
  hasTavern() {
    return typeof getCurrentMessageId === 'function' && typeof getChatMessages === 'function';
  },

  /** 取当前楼层原始文本 */
  getRawText() {
    try {
      if (!this.hasTavern()) return window.SAMPLE_RAWTEXT || '';
      const id = getCurrentMessageId();
      const msgs = getChatMessages(id);
      return (msgs && msgs[0] && msgs[0].message) || '';
    } catch (e) {
      return window.SAMPLE_RAWTEXT || '';
    }
  },

  /** 选项提取：正则处理之前从原文取，兼容两种写法
   *  - 块式：<options>行1\n行2</options>（取最后一个块，按行拆）
   *  - 单式：<option>A</option><option>B</option>（每个标签即一项）
   *  优先块式；若无则用单式。 */
  extractOptions(rawText) {
    if (!rawText) return [];
    const blocks = [
      /<options>([\s\S]*?)<\/options>/gi,
      /<choices>([\s\S]*?)<\/choices>/gi,
      /<select>([\s\S]*?)<\/select>/gi,
    ];
    for (const p of blocks) {
      const m = [...rawText.matchAll(p)];
      if (m.length) {
        const last = m[m.length - 1][1];
        const opts = last.split('\n').map(s => s.trim()).filter(Boolean);
        if (opts.length) return opts;
      }
    }
    const singles = [
      /<option>([\s\S]*?)<\/option>/gi,
      /<choice>([\s\S]*?)<\/choice>/gi,
    ];
    for (const p of singles) {
      const m = [...rawText.matchAll(p)];
      if (m.length) return m.map(x => x[1].trim()).filter(Boolean);
    }
    return [];
  },

  /** 提取最后一个完整 UpdateVariable 标签。 */
  extractUpdateVariable(rawText) {
    const matches = [...String(rawText || '').matchAll(/<UpdateVariable\b[^>]*>[\s\S]*?<\/UpdateVariable>/gi)];
    return matches.length ? matches[matches.length - 1][0] : '';
  },

  stripUpdateVariable(rawText) {
    return String(rawText || '').replace(/\s*<UpdateVariable\b[^>]*>[\s\S]*?<\/UpdateVariable>\s*/gi, '\n').trim();
  },

  _validPointer(path) {
    if (typeof path !== 'string' || path[0] !== '/') return false;
    return path.split('/').slice(1).every((part) => !/~(?:[^01]|$)/.test(part));
  },

  _readonlyPointer(path) {
    return path.split('/').slice(1).some((part) => part.replace(/~1/g, '/').replace(/~0/g, '~').startsWith('_'));
  },

  _pointerParts(path) {
    if (!this._validPointer(path)) throw new Error('非法 JSON Pointer: ' + path);
    return path.split('/').slice(1).map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  },

  _pointerToMvuPath(path) {
    return this._pointerParts(path).map((part, index) => {
      if (/^\d+$/.test(part)) return `[${part}]`;
      if (!/[.\[\]'"\\]/.test(part)) return (index ? '.' : '') + part;
      return `[${JSON.stringify(part)}]`;
    }).join('');
  },

  patchToMvuCommands(rawText) {
    const tag = this.normalizeUpdateVariable(rawText) || String(rawText || '');
    const match = tag.match(/<JSONPatch\b[^>]*>([\s\S]*?)<\/JSONPatch>/i);
    if (!match) throw new Error('缺少合法 JSONPatch');
    const operations = JSON.parse(match[1].trim());
    return operations.map((item) => {
      if (item.op === 'move') return `_.move(${JSON.stringify(this._pointerToMvuPath(item.from))},${JSON.stringify(this._pointerToMvuPath(item.to))})`;
      const path = this._pointerToMvuPath(item.path);
      if (item.op === 'replace') return `_.set(${JSON.stringify(path)},${JSON.stringify(item.value)})`;
      if (item.op === 'delta') return `_.add(${JSON.stringify(path)},${JSON.stringify(item.value)})`;
      if (item.op === 'insert' || item.op === 'remove') {
        const parts = this._pointerParts(item.path);
        if (!parts.length) throw new Error('不能在变量根执行 ' + item.op);
        const key = parts.pop();
        const parentPointer = '/' + parts.map((part) => part.replace(/~/g, '~0').replace(/\//g, '~1')).join('/');
        const parent = parts.length ? this._pointerToMvuPath(parentPointer) : '';
        if (item.op === 'insert') {
          if (key === '-') return `_.insert(${JSON.stringify(parent)},${JSON.stringify(item.value)})`;
          return `_.insert(${JSON.stringify(parent)},${JSON.stringify(key)},${JSON.stringify(item.value)})`;
        }
        return `_.delete(${JSON.stringify(parent)},${JSON.stringify(key)})`;
      }
      throw new Error('不支持的更新操作: ' + item.op);
    }).join(';\n');
  },

  /** 仅接受包含 Analysis 与语义合法 JSON Patch 数组的完整更新标签。 */
  normalizeUpdateVariable(rawText) {
    const tagged = this.extractUpdateVariable(rawText);
    if (!tagged || !/<Analysis\b[^>]*>[\s\S]*?<\/Analysis>/i.test(tagged)) return '';
    const patch = tagged.match(/<JSONPatch\b[^>]*>([\s\S]*?)<\/JSONPatch>/i);
    if (!patch) return '';
    try {
      const operations = JSON.parse(patch[1].trim());
      const allowed = new Set(['replace', 'delta', 'insert', 'remove', 'move']);
      const valid = Array.isArray(operations) && operations.every((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item) || !allowed.has(item.op)) return false;
        if (item.op === 'move') {
          return this._validPointer(item.from) && this._validPointer(item.to)
            && !this._readonlyPointer(item.from) && !this._readonlyPointer(item.to);
        }
        if (!this._validPointer(item.path) || this._readonlyPointer(item.path)) return false;
        if (item.op === 'remove') return !Object.prototype.hasOwnProperty.call(item, 'value');
        if (!Object.prototype.hasOwnProperty.call(item, 'value')) return false;
        return item.op !== 'delta' || (typeof item.value === 'number' && Number.isFinite(item.value));
      });
      return valid ? tagged : '';
    } catch (e) {
      return '';
    }
  },

  /** 去掉 Markdown 代码围栏，小模型经常把标签或 JSON 包在 ``` 里。 */
  _stripFences(rawText) {
    return String(rawText || '').replace(/```[a-zA-Z]*\s*([\s\S]*?)```/g, '$1');
  },

  /** 从任意文本里找出第一段成对括号完整的 JSON 数组。 */
  _firstJsonArray(text) {
    const source = String(text || '');
    for (let start = source.indexOf('['); start !== -1; start = source.indexOf('[', start + 1)) {
      let depth = 0, inString = false, escaped = false;
      for (let i = start; i < source.length; i++) {
        const ch = source[i];
        if (inString) {
          if (escaped) escaped = false;
          else if (ch === '\\') escaped = true;
          else if (ch === '"') inString = false;
          continue;
        }
        if (ch === '"') { inString = true; continue; }
        if (ch === '[') depth++;
        else if (ch === ']') {
          depth--;
          if (depth === 0) return source.slice(start, i + 1);
        }
      }
    }
    return '';
  },

  /**
   * 尽量把模型输出救成合法 UpdateVariable 标签。
   * 只补格式，绝不猜测或编造操作内容；救不回来仍返回 ''。
   */
  salvageUpdateVariable(rawText) {
    const direct = this.normalizeUpdateVariable(rawText);
    if (direct) return direct;
    const text = this._stripFences(rawText);
    const unfenced = this.normalizeUpdateVariable(text);
    if (unfenced) return unfenced;
    // 有 JSONPatch 但缺 Analysis：补一个占位 Analysis，操作内容原样保留。
    const patchBlock = text.match(/<JSONPatch\b[^>]*>([\s\S]*?)<\/JSONPatch>/i);
    const analysis = text.match(/<Analysis\b[^>]*>([\s\S]*?)<\/Analysis>/i);
    const body = patchBlock ? patchBlock[1] : this._firstJsonArray(text);
    if (!String(body || '').trim()) return '';
    const note = analysis ? analysis[1].trim() : '模型未提供 Analysis，已由前端补全格式。';
    const rebuilt = '<UpdateVariable><Analysis>' + (note || '格式已由前端补全。') + '</Analysis><JSONPatch>'
      + String(body).trim() + '</JSONPatch></UpdateVariable>';
    return this.normalizeUpdateVariable(rebuilt);
  },

  /** 移除原标签后追加新标签，剧情/选项/总结等其他内容保持原顺序。 */
  replaceUpdateVariable(rawText, updateTag) {
    const body = this.stripUpdateVariable(rawText);
    const tag = String(updateTag || '').trim();
    return tag ? body + (body ? '\n\n' : '') + tag : body;
  },

  /** 正文清理：跑酒馆正则 -> DOM 手术剥结构壳 -> 保留内联美化 */
  extractCleanContent(rawText) {
    if (!rawText) return '';
    // 先剥离选项块，避免选项混入正文
    let text = rawText.replace(/<\/?(?:option|options|choice|choices|select)>/gi, '');

    // 让酒馆正则处理（切思维链、执行美化正则等）
    if (typeof formatAsTavernRegexedString === 'function') {
      try {
        text = formatAsTavernRegexedString(text, 'ai_output', 'display', { depth: 0 });
      } catch (e) { /* 失败则用原文 */ }
    }

    const temp = document.createElement('div');
    temp.innerHTML = text;

    // 删除绝对不要的元素
    temp.querySelectorAll('script, style, link').forEach(el => el.remove());

    // 解包结构性标签
    ['html', 'head', 'body', 'header', 'footer', 'nav'].forEach(tag => {
      temp.querySelectorAll(tag).forEach(el => el.replaceWith(...el.childNodes));
    });

    // 智能解包纯布局容器
    this._unwrapStructural(temp);

    return temp.innerHTML.trim();
  },

  _unwrapStructural(container) {
    const wrappers = Array.from(container.querySelectorAll('div, section, article, aside, main'));
    wrappers.sort((a, b) => this._depth(b) - this._depth(a));
    wrappers.forEach(el => {
      if (this._isPureWrapper(el)) el.replaceWith(...el.childNodes);
    });
  },

  _depth(el) { let d = 0, n = el; while (n.parentElement) { d++; n = n.parentElement; } return d; },

  _hasDirectText(el) {
    for (const c of el.childNodes) if (c.nodeType === 3 && c.textContent.trim()) return true;
    return false;
  },

  _isPureWrapper(el) {
    // 有直接文字 -> 不是纯包装
    if (this._hasDirectText(el)) return false;
    const style = (el.getAttribute('style') || '').toLowerCase();
    const contentKw = ['color', 'text-shadow', 'text-decoration', 'font-weight', 'font-style', 'font-size', 'font-family', 'background-color', 'background-image', 'background:', 'animation', 'filter', 'opacity', 'box-shadow', 'letter-spacing', 'transform'];
    for (const k of contentKw) if (style.includes(k)) return false;
    const cls = (el.className || '').toString();
    if (/glow|shine|sparkle|highlight|color|accent|effect|anim|italic|bold|gradient|shadow|pulse|flash|blink|dialogue|speech|quote|narrat/i.test(cls)) return false;
    const idCls = ((el.id || '') + ' ' + cls).toLowerCase();
    if (/wrapper|container|layout|outer|main[-_]?text|main[-_]?content|content[-_]?box|message[-_]?body|story[-_]?box|frame|shell|page/i.test(idCls)) return true;
    if (el.children.length === 1 && !this._hasDirectText(el)) return true;
    return false;
  }
};
window.Extract = Extract;
