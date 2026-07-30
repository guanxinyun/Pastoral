/* ============================================================
   MVU 读取与轮询
   - waitGlobalInitialized('Mvu') 后用 Mvu.getMvuData 取 stat_data
   - 伪同层：UI 固定在 0 楼，但属性变量永远读【最新一楼】
   - API 不可用（独立预览）回退 SAMPLE_STATE
   ============================================================ */
const MVU = {
  ready: false,

  async init() {
    if (typeof waitGlobalInitialized === 'function') {
      try {
        await waitGlobalInitialized('Mvu');
        this.ready = (typeof Mvu !== 'undefined');
      } catch (e) {
        this.ready = false;
      }
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

  /** 取 lastMessageId 对应的完整 MvuData 独立快照。 */
  getDataSnapshot() {
    try {
      if (this.ready && typeof Mvu !== 'undefined') {
        const data = Mvu.getMvuData({ type: 'message', message_id: this.latestMessageId() });
        if (data) return this.clone(data);
      }
    } catch (e) { /* fall through */ }
    return { stat_data: this.clone(window.SAMPLE_STATE) };
  },

  /** 取【最新一楼】stat_data；不可用则回退样例 */
  getState() {
    const data = this.getDataSnapshot();
    return data && data.stat_data ? data.stat_data : window.SAMPLE_STATE;
  },

  isLive() {
    return this.ready && typeof Mvu !== 'undefined' && typeof getLastMessageId === 'function';
  }
};
window.MVU = MVU;
