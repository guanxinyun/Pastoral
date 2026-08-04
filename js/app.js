/* ============================================================
   暮归旅店 · 双页书交互主控（伪同层宿主）
   翻页标签切换（inkBleed）/ 底栏动作 / 主题 / 全屏 / 设置
   Chat 以 400ms 高频轮询接管全局对话；stat_data 变化才重渲染面板
   所有玩家动作填入卡内 composer，由玩家确认后 /send + /trigger
   ============================================================ */
(function () {
  'use strict';

  // 唯一宿主判定：非 0 楼直接自我销毁，不再执行任何渲染与轮询
  if (!Host.init()) return;

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  let mobilePage = 'ledger';
  const mobileScrollPositions = { ledger: 0, story: 0 };
  let wasImmersive = false;
  let viewportFrame = 0;
  let composerFocused = false;
  let keyboardWasOpen = false;
  let mobileBaselineHeight = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
  let updateScrollBottom = () => {};

  function isMobileViewport() { return window.innerWidth < 900; }

  function syncMobileViewport() {
    viewportFrame = 0;
    const visual = window.visualViewport;
    const height = visual && Number(visual.height) > 0 ? Number(visual.height) : window.innerHeight;
    document.documentElement.style.setProperty('--mobile-viewport-height', Math.round(height) + 'px');
    const activeStory = Host.immersive && isMobileViewport() && mobilePage === 'story';
    if (!composerFocused) mobileBaselineHeight = Math.max(mobileBaselineHeight, window.innerHeight || 0, height);
    const layoutHeight = Math.max(mobileBaselineHeight, window.innerHeight || 0, document.documentElement.clientHeight || 0, height);
    const reduced = visual ? layoutHeight - height > Math.max(120, layoutHeight * 0.18) : composerFocused;
    const keyboardOpen = activeStory && composerFocused && reduced;
    document.body.classList.toggle('is-mobile-keyboard-open', keyboardOpen);
    if (keyboardOpen && !keyboardWasOpen) {
      const composer = document.getElementById('composer');
      if (composer && composer.scrollIntoView) composer.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    keyboardWasOpen = keyboardOpen;
  }

  function queueMobileViewportSync() {
    if (viewportFrame) return;
    viewportFrame = requestAnimationFrame(syncMobileViewport);
  }

  function setMobilePage(name) {
    const nextPage = name === 'story' ? 'story' : 'ledger';
    const left = document.getElementById('pageLeft');
    const right = document.getElementById('pageRight');
    const pages = { ledger: left, story: right };
    const current = pages[mobilePage];
    if (current) mobileScrollPositions[mobilePage] = current.scrollTop;
    mobilePage = nextPage;
    document.body.classList.toggle('mobile-page--ledger', mobilePage === 'ledger');
    document.body.classList.toggle('mobile-page--story', mobilePage === 'story');
    if (left) left.hidden = mobilePage === 'story';
    if (right) right.hidden = mobilePage === 'ledger';
    $$('[data-mobile-page]').forEach((button) => {
      const on = button.dataset.mobilePage === mobilePage;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    requestAnimationFrame(() => {
      const target = pages[mobilePage];
      if (target) target.scrollTop = mobileScrollPositions[mobilePage];
      updateScrollBottom();
    });
    queueMobileViewportSync();
  }

  function syncMobileImmersiveState(resetOnEnter) {
    const active = Host.immersive && isMobileViewport();
    const switcher = $('[data-mobile-page-switcher]');
    const exit = $('[data-mobile-exit]');
    if (switcher) switcher.hidden = !active;
    if (exit) exit.hidden = !active;
    if (active) setMobilePage(resetOnEnter ? 'ledger' : mobilePage);
    else {
      document.body.classList.remove('mobile-page--ledger', 'mobile-page--story', 'is-mobile-keyboard-open');
      const left = document.getElementById('pageLeft');
      const right = document.getElementById('pageRight');
      if (left) left.hidden = false;
      if (right) right.hidden = false;
      keyboardWasOpen = false;
    }
    queueMobileViewportSync();
    wasImmersive = Host.immersive;
  }

  /* ---------- 当前标签 ---------- */
  function currentTab() {
    const t = $('.tab.is-active');
    return t ? t.dataset.tab : 'overview';
  }

  /* ---------- 翻页：切换左页功能面板 ---------- */
  function openTab(name) {
    const panel = $(`.panel[data-panel="${name}"]`);
    if (!panel) return;
    $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === name));
    $$('.panel').forEach((p) => p.classList.toggle('is-active', p.dataset.panel === name));
    // 面板由 display:none 转 block 时自动重放 inkBleed 翻页动效；立即渲染该面板
    Render.panel(name, Render.state, true);
    if (Host.immersive && isMobileViewport()) setMobilePage('ledger');
  }

  /* ---------- 主题 ---------- */
  function setTheme(th) {
    document.documentElement.setAttribute('data-theme', th);
    const tg = $('#themeToggle');
    if (tg) Icon.set(tg, th === 'night' ? 'sun' : 'moon');
  }
  function toggleTheme() {
    setTheme(document.documentElement.getAttribute('data-theme') === 'night' ? 'day' : 'night');
  }

  /* ---------- 设置浮卡（轻量，非全屏覆层） ---------- */
  function activateSettingsPage(root, name) {
    const pageName = ['api', 'prompts', 'presets'].includes(name) ? name : 'api';
    $$('.settings-tab', root).forEach((item) => {
      const on = item.dataset.settingsTab === pageName;
      item.classList.toggle('is-active', on);
      item.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $$('.settings-page', root).forEach((page) => {
      const on = page.dataset.settingsPage === pageName;
      page.classList.toggle('is-active', on);
      page.hidden = !on;
    });
  }

  function focusSettingsField(root, name) {
    if (!name) return;
    requestAnimationFrame(() => {
      const field = root.querySelector('[name="' + name + '"]');
      if (field && field.focus) field.focus();
    });
  }

  function openSettings(options) {
    const requested = options && typeof options === 'object' ? options : {};
    const existing = document.getElementById('settingsPop');
    if (existing) {
      const backdrop = document.getElementById('settingsBackdrop');
      if (!requested.page) { if (backdrop) backdrop.remove(); return; }
      activateSettingsPage(existing, requested.page);
      focusSettingsField(existing, requested.focus);
      return;
    }
    const cfg = Settings.load();
    const backdrop = h('div', { class: 'modal-backdrop settings-backdrop', id: 'settingsBackdrop' });
    const pop = h('section', { class: 'settings-pop', id: 'settingsPop', role: 'dialog', 'aria-modal': 'true', 'aria-label': '设置' });
    const close = () => backdrop.remove();

    pop.appendChild(h('div', { class: 'settings-pop__head' }, [
      h('span', { class: 'ic', html: Icon.get('settings') }),
      h('span', { class: 'settings-pop__title' }, '掌柜手记'),
      h('button', { class: 'settings-pop__close', type: 'button', 'aria-label': '关闭', onclick: close },
        h('span', { class: 'ic', html: Icon.get('close') }))
    ]));

    const tabs = h('div', { class: 'settings-tabs', role: 'tablist', 'aria-label': '设置页面' }, [
      h('button', { class: 'settings-tab is-active', type: 'button', role: 'tab', 'aria-selected': 'true', 'data-settings-tab': 'api' }, '接口设置'),
      h('button', { class: 'settings-tab', type: 'button', role: 'tab', 'aria-selected': 'false', 'data-settings-tab': 'prompts' }, '更新提示词'),
      h('button', { class: 'settings-tab', type: 'button', role: 'tab', 'aria-selected': 'false', 'data-settings-tab': 'presets' }, '变量请求预设')
    ]);
    pop.appendChild(tabs);
    const apiPage = h('div', { class: 'settings-page is-active', 'data-settings-page': 'api' });
    const promptPage = h('div', { class: 'settings-page', 'data-settings-page': 'prompts', hidden: '' });
    const presetPage = h('div', { class: 'settings-page', 'data-settings-page': 'presets', hidden: '' });

    const themeBtn = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' },
      document.documentElement.getAttribute('data-theme') === 'night' ? '当前：夜 · 切昼' : '当前：昼 · 切夜');
    themeBtn.addEventListener('click', () => {
      toggleTheme();
      themeBtn.textContent = document.documentElement.getAttribute('data-theme') === 'night' ? '当前：夜 · 切昼' : '当前：昼 · 切夜';
    });
    apiPage.appendChild(h('div', { class: 'set-row' }, [
      h('div', {}, [h('div', { class: 'set-row__title' }, '昼夜主题'), h('div', { class: 'faint set-help' }, '羊皮纸昼景 / 靛蓝烛夜')]),
      themeBtn
    ]));

    const form = h('form', { class: 'settings-form', id: 'apiSettingsForm' });
    const apiBox = h('fieldset', { class: 'set-api', id: 'secondApiFields' });
    apiBox.appendChild(h('legend', {}, '第二 API'));
    const field = (label, name, value, type, min) => h('label', { class: 'set-field' }, [
      h('span', { class: 'set-field__label' }, label),
      h('input', { class: 'set-input', name, value, type: type || 'text', min: min == null ? null : min, autocomplete: name === 'secondApiKey' ? 'off' : null })
    ]);
    apiBox.appendChild(field('URL', 'secondApiUrl', cfg.secondApi.url, 'url'));
    apiBox.appendChild(h('p', { class: 'faint set-help' }, '填到 /v1 为止，例如 http://127.0.0.1:7861/v1，不要写 /chat/completions。'));
    apiBox.appendChild(field('API Key', 'secondApiKey', cfg.secondApi.key, 'password'));
    apiBox.appendChild(field('模型名', 'secondApiModel', cfg.secondApi.model));
    const modelList = h('datalist', { id: 'secondApiModelList' });
    apiBox.appendChild(modelList);
    apiBox.querySelector('[name="secondApiModel"]').setAttribute('list', 'secondApiModelList');
    const fetchModels = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'data-fetch-models': '' }, '获取模型列表');
    fetchModels.addEventListener('click', async () => {
      fetchModels.disabled = true; fetchModels.textContent = '正在获取…';
      try {
        const names = await ApiEngine.fetchModelList({
          url: form.elements.secondApiUrl.value, key: form.elements.secondApiKey.value
        });
        modelList.innerHTML = '';
        names.forEach((name) => modelList.appendChild(h('option', { value: name })));
        if (!names.length) toast('warn', '未获取到模型', '目标服务返回了空列表，模型名需要手动填写。');
        else toast('success', '已获取 ' + names.length + ' 个模型', '在模型名输入框展开即可选择。');
      } catch (e) { toast('error', '获取模型列表失败', e && e.message || String(e)); }
      finally { fetchModels.disabled = false; fetchModels.textContent = '获取模型列表'; }
    });
    apiBox.appendChild(h('div', { class: 'settings-actions' }, fetchModels));
    apiBox.appendChild(field('超时时间（ms）', 'secondApiTimeout', cfg.secondApi.timeout, 'number', 1000));
    apiBox.appendChild(field('最大重试次数', 'secondApiRetries', cfg.secondApi.maxRetries, 'number', 0));
    apiBox.appendChild(h('p', { class: 'faint set-help' }, '格式不合规时程序会自动追加一次纠正请求，不占用这里的重试次数。'));
    const apiCheck = h('p', { class: 'faint set-help preset-effective', 'data-api-check': '' });
    apiBox.appendChild(apiCheck);
    const syncCheck = () => {
      const issues = ApiEngine.inspectApi({
        url: form.elements.secondApiUrl.value, key: form.elements.secondApiKey.value, model: form.elements.secondApiModel.value
      });
      apiCheck.textContent = issues.length ? '⚠ ' + issues.join('；') : '✓ 配置项已填全，可测试连接。';
    };
    ['secondApiUrl', 'secondApiKey', 'secondApiModel'].forEach((name) => {
      apiBox.querySelector('[name="' + name + '"]').addEventListener('input', syncCheck);
    });
    form.appendChild(apiBox);

    syncCheck();
    const save = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, '保存 API 设置');
    form.appendChild(save);
    const testApi = h('button', { class: 'btn btn--ghost btn--block', id: 'testSecondApi', type: 'button' }, '测试第二 API 连接');
    testApi.addEventListener('click', async () => {
      testApi.disabled = true; testApi.textContent = '正在发送测试请求…';
      try {
        const result = await ApiEngine.testSecondApi({
          url: form.elements.secondApiUrl.value.trim(), key: form.elements.secondApiKey.value.trim(),
          model: form.elements.secondApiModel.value.trim(), timeout: Number(form.elements.secondApiTimeout.value)
        });
        toast('success', '第二 API 可用', `${result.target} · ${result.elapsedMs}ms`);
      } catch (e) { toast('error', '第二 API 测试失败', e && e.message || String(e)); }
      finally { testApi.disabled = false; testApi.textContent = '测试第二 API 连接'; }
    });
    form.appendChild(testApi);
    const retry = h('button', { class: 'btn btn--ghost btn--block', id: 'retrySecondApi', type: 'button' }, '重新调用上次失败的第二 API');
    retry.disabled = !(window.ApiEngine && ApiEngine.lastFailure);
    retry.addEventListener('click', async () => {
      retry.disabled = true; retry.textContent = '正在重试…';
      try {
        const result = await ApiEngine.retryLastFailure();
        if (result && result.ok) { toast('success', '第二 API 重试成功', '变量已重新计算并写回最新楼层。'); close(); }
        else toast('error', '重试失败', '主模型变量保持不变。');
      } catch (e) { toast('error', '无法重试', e && e.message || String(e)); }
      finally { retry.textContent = '重新调用上次失败的第二 API'; retry.disabled = !(window.ApiEngine && ApiEngine.lastFailure); }
    });
    form.appendChild(retry);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const cleanUrl = ApiEngine.normalizeUrl(form.elements.secondApiUrl.value);
      form.elements.secondApiUrl.value = cleanUrl;
      const next = Settings.save({ secondApi: {
        url: cleanUrl,
        key: form.elements.secondApiKey.value,
        model: form.elements.secondApiModel.value,
        timeout: form.elements.secondApiTimeout.value,
        maxRetries: form.elements.secondApiRetries.value
      } });
      syncCheck();
      const issues = ApiEngine.inspectApi(next.secondApi);
      if (issues.length) toast('warn', '设置已保存，但配置不可用', issues.join('；'));
      else toast('success', '设置已保存', '第二 API 已配置，将用于所有变量更新。');
    });
    apiPage.appendChild(form);

    apiPage.appendChild(h('div', { class: 'notice notice--info set-notice' }, [
      h('span', { class: 'ic notice__icon', html: Icon.get('info') }),
      h('div', {}, '状态始终读取最新楼层 MVU 快照；第二 API 只负责变量计算，失败时自动保留主模型结果。')
    ]));

    const promptForm = h('form', { class: 'settings-form prompt-settings-form', id: 'promptSettingsForm' });
    const builtinGuide = (kind) => (window.Settings && typeof Settings.builtinGuide === 'function' ? Settings.builtinGuide(kind) : '');
    const promptField = (label, name, value, help) => h('label', { class: 'set-field' }, [
      h('span', { class: 'set-field__label' }, label),
      h('span', { class: 'faint set-help' }, help),
      h('textarea', { class: 'set-input set-textarea', name, rows: '14', spellcheck: 'false', placeholder: '留空则使用程序内置默认指导' }, value)
    ]);
    promptForm.appendChild(h('div', { class: 'notice notice--info set-notice' }, [
      h('div', {}, '这两份指导就是变量请求实际发送的规则，全部保存在前端本地，程序自带默认值。'),
      h('div', {}, '不读取世界书：绑定世界书里无需存在“变量更新规则”或“变量输出格式”条目。输出格式由程序自动合并附加。')
    ]));
    promptForm.appendChild(promptField('日常变量更新指导', 'normalPrompt', cfg.prompts.normal || builtinGuide('normal'), '每次主模型回复后的常规更新使用。'));
    promptForm.appendChild(promptField('归寝日结指导', 'enddayPrompt', cfg.prompts.endday || builtinGuide('endday'), '点击归寝时的跨日结算使用；脚本已完成的扣费、作物成长和设施引力不会重复执行。'));
    const promptActions = h('div', { class: 'settings-actions' }, [
      h('button', { class: 'btn btn--ghost', type: 'button', 'data-preview-prompt': 'normal' }, '预览日常请求'),
      h('button', { class: 'btn btn--ghost', type: 'button', 'data-preview-prompt': 'endday' }, '预览归寝请求'),
      h('button', { class: 'btn btn--ghost', type: 'button', 'data-reset-prompts': '' }, '恢复内置默认'),
      h('button', { class: 'btn btn--primary', type: 'submit' }, '保存指导')
    ]);
    promptForm.appendChild(promptActions);
    const preview = h('pre', { class: 'prompt-preview', 'data-prompt-preview': '', hidden: '' });
    promptForm.appendChild(preview);
    $$('[data-preview-prompt]', promptForm).forEach((btn) => btn.addEventListener('click', () => {
      const kind = btn.dataset.previewPrompt;
      // 用输入框里的当前文本预览，未保存也能看到实际效果。
      const draft = {
        prompts: {
          normal: promptForm.elements.normalPrompt.value,
          endday: promptForm.elements.enddayPrompt.value
        }
      };
      try {
        const text = ApiEngine.buildPrompt({
          purpose: kind,
          config: draft,
          baseline: window.MVU && MVU.getDataSnapshot ? MVU.getDataSnapshot() : { stat_data: {} },
          calculated: kind === 'endday' ? { salary: 0, maintenance: 0, 说明: '预览占位，实际由脚本结算填入' } : null
        });
        preview.textContent = text;
        preview.hidden = false;
        preview.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } catch (e) { toast('error', '无法生成预览', e && e.message || String(e)); }
    }));
    promptForm.addEventListener('submit', (e) => {
      e.preventDefault();
      // 与内置默认完全相同时存空串，后续升级默认指导仍能自动生效。
      const store = (value, kind) => (String(value || '').trim() === String(builtinGuide(kind) || '').trim() ? '' : value);
      Settings.save({ prompts: {
        normal: store(promptForm.elements.normalPrompt.value, 'normal'),
        endday: store(promptForm.elements.enddayPrompt.value, 'endday')
      } });
      toast('success', '指导已保存', '下次变量请求即按这两份文本发送。');
    });
    promptForm.querySelector('[data-reset-prompts]').addEventListener('click', () => {
      promptForm.elements.normalPrompt.value = builtinGuide('normal');
      promptForm.elements.enddayPrompt.value = builtinGuide('endday');
      Settings.save({ prompts: { normal: '', endday: '' } });
      toast('info', '已恢复内置默认', '两份指导已还原为程序自带版本。');
    });
    promptPage.appendChild(promptForm);

    const presetForm = h('form', { class: 'settings-form preset-settings-form', id: 'presetSettingsForm' });
    const presetNames = window.ApiEngine && typeof ApiEngine.availablePresetNames === 'function' ? ApiEngine.availablePresetNames() : [];
    const presetCard = (kind, title) => {
      const setting = cfg.variablePresets[kind];
      const card = h('fieldset', { class: 'set-api preset-card', 'data-preset-card': kind });
      card.appendChild(h('legend', {}, title));
      const mode = h('select', { class: 'set-input', name: kind + 'PresetMode', 'aria-label': title + '预设模式' }, [
        h('option', { value: 'current' }, '沿用酒馆当前预设'),
        h('option', { value: 'fixed' }, '指定自定义预设')
      ]);
      card.appendChild(h('p', { class: 'faint set-help' }, '“预设”指酒馆 Chat Completion 预设。可沿用当前预设，或为变量阶段指定独立预设。'));
      mode.value = setting.mode;
      card.appendChild(h('label', { class: 'set-field' }, [h('span', { class: 'set-field__label' }, '预设模式'), mode]));

      const missingPreset = setting.presetName && !presetNames.includes(setting.presetName)
        ? [h('option', { value: setting.presetName }, setting.presetName + '（已不存在，请重新选择）')]
        : [];
      const fixed = h('label', { class: 'set-field', 'data-preset-fixed': kind }, [
        h('span', { class: 'set-field__label' }, '固定预设'),
        h('select', { class: 'set-input', name: kind + 'PresetName', 'aria-label': title + '固定预设' }, missingPreset.concat(presetNames.length
          ? presetNames.map((name) => h('option', { value: name }, name))
          : [h('option', { value: '' }, '未找到可用酒馆预设')]))
      ]);
      fixed.querySelector('select').value = missingPreset.length ? setting.presetName : (presetNames.includes(setting.presetName) ? setting.presetName : (presetNames[0] || ''));
      fixed.querySelector('select').disabled = !presetNames.length && !missingPreset.length;
      card.appendChild(fixed);

      // 两种预设模式共用；默认沿用酒馆注入，玩家可按阶段主动屏蔽。
      const blockDepth = h('input', { type: 'checkbox', name: kind + 'BlockDepth', value: '1' });
      blockDepth.checked = setting.blockDepthEntries === true;
      card.appendChild(h('label', { class: 'preset-check preset-check--wide' }, [
        blockDepth,
        h('div', {}, [
          h('span', {}, '屏蔽世界书按深度注入条目与作者注释'),
          h('span', { class: 'faint set-help' }, '默认沿用酒馆对深度世界书条目与作者注释的处理；勾选后才强制关闭。')
        ])
      ]));
      const temperature = h('input', {
        class: 'set-input', name: kind + 'Temperature', type: 'number',
        min: '0', max: '2', step: '0.1', value: String(setting.temperature == null ? 0 : setting.temperature)
      });
      card.appendChild(h('label', { class: 'set-field' }, [
        h('span', { class: 'set-field__label' }, '采样温度'),
        h('span', { class: 'faint set-help' }, '变量计算建议 0，稳定复现。仅在第二 API 生效；跟随主 API 时由主 API 决定。'),
        temperature
      ]));

      const effective = h('p', { class: 'faint set-help preset-effective', 'data-preset-effective': kind });
      card.appendChild(effective);

      const sync = () => {
        fixed.hidden = mode.value !== 'fixed';
        const parts = mode.value === 'current'
          ? ['使用酒馆当前预设', '任务只发送一次（通过 user_input）']
          : ['切换到指定预设，等待约 1 秒后发起请求，再保留约 2 秒提示词捕获窗口后切回；不等待 API 回复完成', '任务只发送一次（通过 user_input）'];
        parts.push(blockDepth.checked ? '已屏蔽深度注入与作者注释' : '沿用酒馆深度注入与作者注释');
        effective.textContent = '实际发送：' + parts.join('；') + '。';
      };
      mode.addEventListener('change', sync);
      blockDepth.addEventListener('change', sync);
      sync();
      return card;
    };
    presetForm.appendChild(presetCard('normal', '普通变量更新'));
    presetForm.appendChild(presetCard('endday', '归寝变量更新'));
    presetForm.appendChild(h('div', { class: 'notice notice--info set-notice' }, [
      h('div', {}, '主剧情仍使用酒馆正常发送和当前预设；这里仅控制主剧情后的变量请求。'),
      h('div', {}, '变量更新规则与输出格式全部来自本程序（“更新提示词”页），世界书里不需要、也不会被读取任何变量更新条目。')
    ]));
    presetForm.appendChild(h('div', { class: 'settings-actions' }, h('button', { class: 'btn btn--primary', type: 'submit' }, '保存变量预设')));
    presetForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const stage = (kind) => ({
        mode: presetForm.elements[kind + 'PresetMode'].value,
        presetName: presetForm.elements[kind + 'PresetName'].value,
        blockDepthEntries: !!presetForm.elements[kind + 'BlockDepth'].checked,
        temperature: presetForm.elements[kind + 'Temperature'].value
      });
      Settings.save({ variablePresets: { normal: stage('normal'), endday: stage('endday') } });
      toast('success', '变量预设已保存', '普通更新与归寝更新将分别使用所选策略。');
    });
    presetPage.appendChild(presetForm);

    pop.appendChild(apiPage); pop.appendChild(promptPage); pop.appendChild(presetPage);
    $$('.settings-tab', pop).forEach((tab) => tab.addEventListener('click', () => activateSettingsPage(pop, tab.dataset.settingsTab)));

    backdrop.appendChild(pop); document.body.appendChild(backdrop);
    if (requested.page) activateSettingsPage(pop, requested.page);
    Icon.render(pop);
    focusSettingsField(pop, requested.focus);
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
  }

  function h(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v === null || v === undefined) return;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null || c === false) return;
      e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(c) : c);
    });
    return e;
  }

  /* ---------- 全屏（沉浸视口） ---------- */
  function syncFullscreenBtn() {
    const b = $('#fullscreenToggle');
    if (!b) return;
    const on = Host.immersive;
    Icon.set(b.querySelector('.ic'), on ? 'compress' : 'expand');
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.setAttribute('aria-label', on ? '退出全屏' : '进入全屏');
    b.dataset.tip = on ? '退出全屏' : '进入全屏';
  }
  function toggleFullscreen() {
    Host.toggleImmersive();
    syncFullscreenBtn();
  }

  /* ---------- 底栏动作：填入 composer，由玩家确认发送 ---------- */
  function dockAction(act) {
    switch (act) {
      case 'cook': openTab('inventory'); toast('info', '灶事', '择一道食谱烹制。'); break;
      case 'water': Chat.compose('浇灌所有农田'); break;
      case 'rest': Chat.compose('小憩片刻，恢复精力'); break;
      case 'endday': confirmEndday(); break;
    }
  }

  /* ---------- 归寝确认 ---------- */
  function confirmEndday() {
    if (document.getElementById('enddayConfirm') || Chat.busy) return;
    const previous = document.activeElement;
    const ta = $('#composerInput');
    const existing = ta ? String(ta.value || '').trimEnd() : '';
    const action = '归寝入眠，结束今天';
    const finalText = existing ? existing + '\n' + action : action;
    const backdrop = h('div', { class: 'modal-backdrop', id: 'enddayConfirm' });
    const dialog = h('section', { class: 'daily-modal endday-confirm', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'enddayConfirmTitle' });
    const close = () => { backdrop.remove(); if (previous && previous.focus) previous.focus(); };
    dialog.appendChild(h('header', { class: 'daily-modal__head' }, [
      h('span', { class: 'ic', html: Icon.get('moon') }),
      h('h2', { id: 'enddayConfirmTitle' }, '归寝入眠')
    ]));
    dialog.appendChild(h('div', { class: 'daily-modal__body' }, [
      h('p', {}, '结束今天后将结算员工薪资、建筑维护费、植物成长与次日预报。'),
      h('div', { class: 'endday-preview' }, finalText)
    ]));
    const cancel = h('button', { class: 'btn btn--ghost', type: 'button', 'data-endday-cancel': '', onclick: close }, '取消');
    const confirm = h('button', { class: 'btn btn--primary', type: 'button', 'data-endday-confirm': '' }, '结束今天并发送');
    confirm.addEventListener('click', async () => {
      confirm.disabled = true; cancel.disabled = true; confirm.textContent = '正在发送归寝行动…';
      const ok = await Chat.handleUnifiedRequest(finalText, { kind: 'endday' });
      if (ok) close();
      else { confirm.disabled = false; cancel.disabled = false; confirm.textContent = '重新发送'; }
    });
    dialog.appendChild(h('div', { class: 'daily-modal__foot' }, [cancel, confirm]));
    backdrop.appendChild(dialog); document.body.appendChild(backdrop); Icon.render(dialog); confirm.focus();
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
    backdrop.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  }

  function formatLedgerNumber(value) {
    return Money.formatCopper(value);
  }

  /* ---------- 每日总结模态框 ---------- */
  function showDailySummary(detail) {
    const old = document.getElementById('dailySummary');
    if (old && detail && detail.pending) {
      const copy = old.querySelector('.daily-summary-copy');
      if (copy) copy.textContent = String(detail.summary || '确定性结算已完成，正在等待跨日变量更新…');
      return;
    }
    if (old) old.remove();
    const previous = document.activeElement;
    const backdrop = h('div', { class: 'modal-backdrop', id: 'dailySummary' });
    const dialog = h('section', { class: 'daily-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dailySummaryTitle' });
    const close = () => { backdrop.remove(); if (previous && previous.focus) previous.focus(); };
    dialog.appendChild(h('header', { class: 'daily-modal__head' }, [
      h('span', { class: 'ic', html: Icon.get('moon') }),
      h('h2', { id: 'dailySummaryTitle' }, '今日账簿'),
      h('button', { class: 'settings-pop__close', type: 'button', 'aria-label': '关闭每日总结', onclick: close }, h('span', { class: 'ic', html: Icon.get('close') }))
    ]));
    const value = (n) => Number.isFinite(Number(n)) ? formatLedgerNumber(Number(n)) : '暂无数据';
    const report = detail || {};
    const rows = report.beforeFunds == null ? [] : [
      ['原日初资金', value(report.initialFunds)],
      ['归寝前资金', value(report.beforeFunds)],
      ['员工薪资', '−' + value(report.salary)],
      ['建筑维护', '−' + value(report.maintenance)],
      ['日结后资金', value(report.afterFunds)]
    ];
    dialog.appendChild(h('div', { class: 'daily-modal__body' }, [
      rows.length ? h('dl', { class: 'daily-ledger' }, rows.flatMap(([label, amount]) => [h('dt', {}, label), h('dd', {}, amount)])) : null,
      h('div', { class: 'daily-summary-copy' }, String(report.summary || '').trim() || (report.updateOk === false ? '确定性结算已完成；额外变量更新失败。' : '日结完成，变量已更新。')),
      report.updateError ? h('div', { class: 'notice notice--warn' }, '额外更新错误：' + report.updateError) : null
    ]));
    // 结算来源必须与实际发生的事情一致，失败时不能冒充成功来源。
    const attribution = (() => {
      const r = report;
      if (r.pending) return '脚本确定性结算已完成，等待变量更新…';
      if (r.updateOk === false) {
        if (r.source === 'second') return '第二 API 更新失败 · 仅保留脚本确定性结算';
        if (r.source === 'main') return '当前主 API 更新失败 · 仅保留脚本确定性结算';
        return '变量更新未完成 · 仅保留脚本确定性结算';
      }
      if (r.source === 'second') return '脚本确定性结算 + 第二 API 变量更新';
      if (r.source === 'main') return '脚本确定性结算 + 当前主 API 变量更新';
      if (r.source === 'script') return '仅脚本确定性结算';
      return '结算来源未知';
    })();
    dialog.appendChild(h('div', { class: 'daily-modal__foot' }, [h('span', { class: 'faint' }, attribution), h('button', { class: 'btn btn--primary', type: 'button', onclick: close }, '合上账簿')]));
    backdrop.appendChild(dialog); document.body.appendChild(backdrop); Icon.render(dialog);
    const focusables = () => Array.from(dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
    const first = focusables()[0]; if (first) first.focus();
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
    backdrop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { close(); return; }
      if (e.key !== 'Tab') return;
      const nodes = focusables(); if (!nodes.length) return;
      const a = nodes[0], z = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    });
  }

  /* ---------- 状态轮询（面板/HUD；对话流由 Chat 自行轮询） ---------- */
  let lastSig = null, lastRaw = null, started = false;

  function refresh(force) {
    const state = MVU.getState();
    const sig = JSON.stringify(state);
    const raw = Chat.latestRaw();

    Render.state = state;
    Render.raw = raw;

    if (force || sig !== lastSig) {
      Render.hud(state);
      Render.panel(currentTab(), state, false);
    }
    if (force || raw !== lastRaw) {
      Render.choices(raw);
    }
    lastSig = sig;
    lastRaw = raw;
  }

  /* ---------- 剧情页：一键到底 ---------- */
  function setupScrollBottom() {
    const btn = document.getElementById('scrollBottomBtn');
    const stream = document.getElementById('stream');
    const page = document.getElementById('pageRight');
    const book = document.querySelector('.book');
    if (!btn || !stream || !page) return;

    /* 判断当前实际的滚动容器（按模式优先级）：
       1. dynamic iframe 非沉浸 → .book 整体滚动（子元素全部 overflow:visible）
       2. 手机沉浸式剧情页 → #pageRight 整页滚动
       3. 桌面沉浸式 → #stream 内部滚动
       用 computed overflow 判断谁才是真正的滚动容器，避免误判 */
    const hasOverflowScroll = (el) => {
      if (!el) return false;
      const s = getComputedStyle(el);
      return /(auto|scroll)/.test(s.overflowY);
    };

    const isScrollable = (el) => el && el.scrollHeight - el.clientHeight > 1;

    const getScrollTarget = () => {
      // dynamic iframe 非沉浸：.book 是唯一有 overflow-y:auto 的容器
      if (book && hasOverflowScroll(book) && isScrollable(book)) return book;
      // 桌面沉浸 / 酒馆固定高度：#stream 有 overflow-y:auto
      if (hasOverflowScroll(stream) && isScrollable(stream)) return stream;
      // 手机沉浸剧情页：#pageRight 滚动
      if (hasOverflowScroll(page) && isScrollable(page)) return page;
      // fallback：谁能滚就用谁
      if (isScrollable(book)) return book;
      if (isScrollable(stream)) return stream;
      if (isScrollable(page)) return page;
      return stream;
    };

    const nearBottom = (el) => !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;

    const sync = () => {
      const target = getScrollTarget();
      btn.classList.toggle('is-visible', !nearBottom(target));
    };

    const toBottom = () => {
      const target = getScrollTarget();
      if (target && target.scrollHeight - target.clientHeight > 1) {
        target.scrollTo({ top: target.scrollHeight, behavior: 'smooth' });
      }
      btn.classList.remove('is-visible');
    };

    stream.addEventListener('scroll', sync, { passive: true });
    page.addEventListener('scroll', sync, { passive: true });
    if (book) book.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('pastoral:chat', () => requestAnimationFrame(sync));
    btn.addEventListener('click', toBottom);
    updateScrollBottom = sync;
    requestAnimationFrame(sync);
  }

  /* ---------- 初始化 ---------- */
  async function init() {
    Icon.render(document);
    if (window.Intro) Intro.init();
    if (window.IconPicker) await IconPicker.init();

    // 等待 MVU 就绪
    await MVU.init();

    // 全局消息接管：400ms 高频轮询 + 气泡右键菜单 + composer
    Chat.init();

    // 首屏渲染
    Render.state = MVU.getState();
    Render.raw = Chat.latestRaw();
    Render.hud(Render.state);
    Render.panel(currentTab(), Render.state, true);
    Render.choices(Render.raw);
    lastRaw = Render.raw;
    lastSig = JSON.stringify(Render.state);

    // 对话流有变化时立刻重算选项，不等下一次状态轮询
    window.addEventListener('pastoral:chat', () => refresh(false));
    window.addEventListener('pastoral:daily-summary', (e) => showDailySummary(e.detail || {}));
    window.addEventListener('pastoral:api-status', (e) => {
      const detail = e.detail || {};
      const status = document.getElementById('requestStatus');
      if (!status) return;
      status.hidden = false;
      status.classList.toggle('is-loading', !!detail.loading);
      status.classList.toggle('is-error', /失败/.test(detail.stage || ''));
      const title = status.querySelector('[data-request-status-title]');
      const message = status.querySelector('[data-request-status-message]');
      if (title) title.textContent = detail.stage || '请求状态';
      if (message) message.textContent = detail.message || '';
    });

    // 翻页标签
    $$('.tab').forEach((t) => t.addEventListener('click', () => openTab(t.dataset.tab)));

    // 主题 / 全屏 / 设置
    const themeBtn = $('#themeToggle'); if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
    const fsBtn = $('#fullscreenToggle'); if (fsBtn) fsBtn.addEventListener('click', toggleFullscreen);
    syncFullscreenBtn();
    syncMobileImmersiveState(false);
    $$('[data-mobile-page]').forEach((button) => button.addEventListener('click', () => setMobilePage(button.dataset.mobilePage)));
    const mobileExit = $('[data-mobile-exit]');
    if (mobileExit) mobileExit.addEventListener('click', () => Host.setImmersive(false));
    window.addEventListener('resize', () => { syncMobileImmersiveState(false); queueMobileViewportSync(); });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', queueMobileViewportSync);
      window.visualViewport.addEventListener('scroll', queueMobileViewportSync);
    }
    const composerInput = $('#composerInput');
    if (composerInput) {
      composerInput.addEventListener('focus', () => { composerFocused = true; queueMobileViewportSync(); });
      composerInput.addEventListener('blur', () => { composerFocused = false; setTimeout(queueMobileViewportSync, 80); });
    }
    queueMobileViewportSync();
    setupScrollBottom();
    const setBtn = $('#settingsBtn'); if (setBtn) setBtn.addEventListener('click', () => openSettings());
    window.addEventListener('pastoral:open-settings', (event) => openSettings(event.detail || { page: 'api' }));

    // 底栏
    $$('.dock__btn').forEach((b) => b.addEventListener('click', () => dockAction(b.dataset.act)));

    // Esc 关设置
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { const p = document.getElementById('settingsBackdrop'); if (p) p.remove(); }
    });

    // 外部退出全屏（Esc / 系统手势）时同步按钮
    window.addEventListener('pastoral:immersive', () => {
      const entering = Host.immersive && !wasImmersive;
      syncFullscreenBtn();
      syncMobileImmersiveState(entering);
      requestAnimationFrame(updateScrollBottom);
    });

    // 1s 状态轮询（对话流由 Chat 以 400ms 独立轮询）
    if (!started) { started = true; setInterval(refresh, 1000); }

    // 欢迎语
    setTimeout(() => toast('magic', '暮归旅店 · 开张志', '愿这盏烛火，照亮你重建家业的路。'), 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
