/* ============================================================
   MVU 读取与轮询
   - waitGlobalInitialized('Mvu') 后用 Mvu.getMvuData 取 stat_data
   - 1s 轮询；rawText 与 stat_data 均未变则跳过
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

  /** 取当前楼层 stat_data；不可用则回退样例 */
  getState() {
    try {
      if (this.ready && typeof Mvu !== 'undefined' && typeof getCurrentMessageId === 'function') {
        const id = getCurrentMessageId();
        const data = Mvu.getMvuData({ type: 'message', message_id: id });
        if (data && data.stat_data) return data.stat_data;
      }
    } catch (e) { /* fall through */ }
    return window.SAMPLE_STATE;
  },

  isLive() {
    return this.ready && typeof Mvu !== 'undefined' && typeof getCurrentMessageId === 'function';
  }
};
window.MVU = MVU;
