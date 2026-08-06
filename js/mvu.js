/* ============================================================
   MVU 读取与轮询
   - waitGlobalInitialized('Mvu') 后用 Mvu.getMvuData 取 stat_data
   - 伪同层：UI 固定在 0 楼，但属性变量永远读【最新一楼】
   - API 不可用（独立预览）回退 SAMPLE_STATE
   ============================================================ */
const MVU = {
  ready: false,
  DIMENSIONS: ['美食', '知识', '舒适', '冒险', '文化', '自然'],

  number(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  },

  calculateFacilityGravity(state) {
    const root = state && typeof state === 'object' ? state : {};
    const built = root.建筑 && root.建筑.已建成 && typeof root.建筑.已建成 === 'object'
      ? root.建筑.已建成 : {};
    const dimensions = Object.fromEntries(this.DIMENSIONS.map((key) => [key, 0]));
    Object.values(built).forEach((building) => {
      const influence = building && building.影响力 && typeof building.影响力 === 'object' ? building.影响力 : {};
      this.DIMENSIONS.forEach((key) => { dimensions[key] += this.number(influence[key], 0); });
    });
    this.DIMENSIONS.forEach((key) => { dimensions[key] = Math.round(dimensions[key] * 1000) / 1000; });
    const ecology = root.访客生态 && typeof root.访客生态 === 'object' ? root.访客生态 : {};
    const facility = this.DIMENSIONS.reduce((sum, key) => sum + dimensions[key], 0);
    const total = this.number(ecology.声望引力, 0) + facility
      + this.number(ecology.服务引力, 0) + this.number(ecology.环境引力, 0);
    return { dimensions, facility, total: Math.round(total * 1000) / 1000 };
  },

  applyFacilityGravity(data) {
    const next = this.clone(data) || { stat_data: {} };
    const state = next.stat_data || (next.stat_data = {});
    const ecology = state.访客生态 && typeof state.访客生态 === 'object'
      ? state.访客生态 : (state.访客生态 = {});
    const calculated = this.calculateFacilityGravity(state);
    ecology.设施引力 = calculated.dimensions;
    ecology.总引力值 = calculated.total;
    return { data: next, calculated };
  },

  settleDay(data, settlementId) {
    const prepared = this.applyFacilityGravity(data);
    const next = prepared.data;
    const state = next.stat_data || (next.stat_data = {});
    const marker = String(settlementId || '');
    const meta = next.pastoral || (next.pastoral = {});
    if (marker && meta.lastSettlementId === marker) {
      return { data: next, calculated: prepared.calculated, skipped: true, report: meta.lastSettlementReport || {} };
    }

    const inn = state.旅店 && typeof state.旅店 === 'object' ? state.旅店 : (state.旅店 = {});
    const employees = inn.员工 && typeof inn.员工 === 'object' ? inn.员工 : {};
    const built = state.建筑 && state.建筑.已建成 && typeof state.建筑.已建成 === 'object' ? state.建筑.已建成 : {};
    const beforeFunds = this.number(inn.资金, 0);
    const salary = Object.values(employees).reduce((sum, employee) => sum + this.number(employee && employee.职业信息 && employee.职业信息.日薪, 0), 0);
    const maintenance = Object.values(built).reduce((sum, building) => sum + this.number(building && building.维护费用, 0), 0);
    inn.资金 = beforeFunds - salary - maintenance;

    const farm = state.农牧 && typeof state.农牧 === 'object' ? state.农牧 : {};
    const advance = (grid, magic) => {
      Object.values(grid && typeof grid === 'object' ? grid : {}).forEach((plot) => {
        if (!plot || typeof plot !== 'object') return;
        if (plot.状态 === '种植中') plot.剩余天数 = Math.max(0, this.number(plot.剩余天数, 0) - 1);
        plot.今日已浇水 = false;
        if (magic) { plot.今日已魔力灌溉 = false; plot.今日已养护 = false; }
      });
    };
    advance(farm.农田网格, false);
    advance(farm.魔法农田网格, true);

    const forecast = state.当日预报 && typeof state.当日预报 === 'object' ? state.当日预报 : (state.当日预报 = {});
    const report = {
      settlementId: marker,
      initialFunds: this.number(forecast.日初资金, beforeFunds),
      beforeFunds,
      salary,
      maintenance,
      afterFunds: inn.资金,
      facilityGravity: prepared.calculated.dimensions,
      totalGravity: prepared.calculated.total
    };
    forecast.日初资金 = inn.资金;
    if (marker) meta.lastSettlementId = marker;
    meta.lastSettlementReport = report;
    return { data: next, calculated: prepared.calculated, skipped: false, report };
  },

  api: null,
  initError: null,
  lastValidSnapshot: null,
  lastValidMessageId: null,

  async init() {
    if (typeof waitGlobalInitialized !== 'function') return;
    try {
      const api = await waitGlobalInitialized('Mvu');
      this.api = (typeof Mvu !== 'undefined' && Mvu) || api || null;
      this.ready = !!(this.api && typeof this.api.getMvuData === 'function' && typeof this.api.replaceMvuData === 'function');
      if (!this.ready) throw new Error('Mvu 未暴露完整读写接口');
    } catch (e) {
      this.ready = false;
      this.initError = e;
    }
  },

  latestMessageId() {
    try {
      return (typeof getLastMessageId === 'function') ? getLastMessageId() : 'latest';
    } catch (e) {
      return 'latest';
    }
  },

  clone(value) {
    if (value == null) return value;
    try { if (typeof structuredClone === 'function') return structuredClone(value); } catch (e) { /* JSON fallback */ }
    return JSON.parse(JSON.stringify(value));
  },

  isValidData(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && !!data.stat_data && typeof data.stat_data === 'object'
      && !Array.isArray(data.stat_data) && Object.keys(data.stat_data).length > 0;
  },

  rememberValid(data, messageId) {
    if (!this.isValidData(data)) return null;
    this.lastValidSnapshot = this.clone(data);
    this.lastValidMessageId = messageId;
    return this.clone(this.lastValidSnapshot);
  },

  /** 取最新有效的完整 MvuData 独立快照；最新楼未初始化时保持上一楼状态。 */
  getDataSnapshot() {
    if (this.ready && this.api) {
      const rawLatest = this.latestMessageId();
      const latest = Number(rawLatest);
      const target = Number.isInteger(latest) && latest >= 0 ? latest : rawLatest;
      try {
        const data = this.api.getMvuData({ type: 'message', message_id: target });
        const remembered = this.rememberValid(data, target);
        if (remembered) return remembered;
      } catch (e) { /* try cache or earlier floors */ }

      if (this.lastValidSnapshot) return this.clone(this.lastValidSnapshot);

      if (Number.isInteger(latest) && latest >= 0) {
        for (let id = latest - 1; id >= 0; id--) {
          try {
            const candidate = this.api.getMvuData({ type: 'message', message_id: id });
            const remembered = this.rememberValid(candidate, id);
            if (remembered) return remembered;
          } catch (e) { /* continue to earlier floor */ }
        }
      }
    }
    return { stat_data: this.clone(window.SAMPLE_STATE) };
  },

  enforceSettlementFacts(data, settledData) {
    const next = this.clone(data) || { stat_data: {} };
    const settled = settledData && settledData.stat_data || {};
    const state = next.stat_data || (next.stat_data = {});
    const settledInn = settled.旅店 || {};
    const inn = state.旅店 && typeof state.旅店 === 'object' ? state.旅店 : (state.旅店 = {});
    if (settledInn.资金 !== undefined) inn.资金 = this.number(settledInn.资金, 0);

    const farm = state.农牧 && typeof state.农牧 === 'object' ? state.农牧 : (state.农牧 = {});
    const settledFarm = settled.农牧 || {};
    const copyGridFacts = (key, magic) => {
      const target = farm[key] && typeof farm[key] === 'object' ? farm[key] : (farm[key] = {});
      const source = settledFarm[key] && typeof settledFarm[key] === 'object' ? settledFarm[key] : {};
      Object.entries(source).forEach(([plotKey, sourcePlot]) => {
        const targetPlot = target[plotKey] && typeof target[plotKey] === 'object' ? target[plotKey] : (target[plotKey] = {});
        targetPlot.剩余天数 = this.number(sourcePlot.剩余天数, 0);
        targetPlot.今日已浇水 = false;
        if (magic) { targetPlot.今日已魔力灌溉 = false; targetPlot.今日已养护 = false; }
      });
    };
    copyGridFacts('农田网格', false);
    copyGridFacts('魔法农田网格', true);

    const forecast = state.当日预报 && typeof state.当日预报 === 'object' ? state.当日预报 : (state.当日预报 = {});
    if (settled.当日预报 && settled.当日预报.日初资金 !== undefined) forecast.日初资金 = this.number(settled.当日预报.日初资金, inn.资金);
    return this.applyFacilityGravity(next).data;
  },

  async enforceAndWrite(settledData, messageId) {
    const enforced = this.enforceSettlementFacts(this.getDataSnapshot(), settledData);
    await this.writeData(enforced, messageId);
    return enforced;
  },

  async writeData(data, messageId) {
    if (!this.ready || !this.api || typeof this.api.replaceMvuData !== 'function') {
      if (typeof getLastMessageId !== 'function') return false;
      throw new Error('MVU 写回接口未就绪' + (this.initError ? '：' + (this.initError.message || this.initError) : ''));
    }
    let target = messageId == null ? this.latestMessageId() : messageId;
    // 验证目标楼层仍然存在；第二 API 耗时期间聊天可能已变化
    if (typeof getChatMessages === 'function' && Number.isFinite(Number(target))) {
      try {
        const found = getChatMessages(Number(target));
        if (!Array.isArray(found) || found.length === 0) {
          const fallback = this.latestMessageId();
          console.warn('[Pastoral][MVU]', '楼层回退', { original: target, fallback });
          target = fallback;
        }
      } catch (e) {
        const fallback = this.latestMessageId();
        console.warn('[Pastoral][MVU]', '楼层验证异常，回退', { original: target, fallback, error: e && e.message || e });
        target = fallback;
      }
    }
    await this.api.replaceMvuData(data, { type: 'message', message_id: target });
    this.rememberValid(data, target);
    return true;
  },

  async writeWithTimeout(data, messageId, timeout = 3000) {
    let timer;
    const pending = this.writeData(data, messageId);
    try {
      const written = await Promise.race([
        pending,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('MVU 写回超时（' + timeout + 'ms）')), timeout); })
      ]);
      return { ok: !!written, timedOut: false };
    } catch (error) {
      const timedOut = /超时/.test(String(error && error.message || error));
      return { ok: false, timedOut, error, pending: timedOut ? pending : null };
    } finally {
      clearTimeout(timer);
    }
  },

  settleForWrite(messageId, settlementId) {
    return this.settleDay(this.getDataSnapshot(), settlementId || ('endday-message-' + messageId));
  },

  async syncFacilityGravity(messageId) {
    const applied = this.applyFacilityGravity(this.getDataSnapshot());
    await this.writeData(applied.data, messageId);
    return applied;
  },

  async settleAndWrite(messageId, settlementId) {
    const settled = this.settleDay(this.getDataSnapshot(), settlementId);
    if (!settled.skipped) {
      const written = await this.writeData(settled.data, messageId);
      if (!written && typeof getLastMessageId === 'function') throw new Error('确定性日结未能写回 MVU');
    }
    return settled;
  },

  /** 取【最新一楼】stat_data；不可用则回退样例 */
  getState() {
    const data = this.getDataSnapshot();
    return data && data.stat_data ? data.stat_data : window.SAMPLE_STATE;
  },

  isLive() {
    return this.ready && this.api && typeof getLastMessageId === 'function';
  }
};
window.MVU = MVU;
