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

  /** 取【最新一楼】stat_data；不可用则回退样例 */
  getState() {
    try {
      if (this.ready && typeof Mvu !== 'undefined') {
        // 数据与视口剥离：0 楼渲染，变量永远取最新一楼
        const id = (typeof getLastMessageId === 'function') ? getLastMessageId() : 'latest';
        const data = Mvu.getMvuData({ type: 'message', message_id: id });
        if (data && data.stat_data) return data.stat_data;
      }
    } catch (e) { /* fall through */ }
    return window.SAMPLE_STATE;
  },

  isLive() {
    return this.ready && typeof Mvu !== 'undefined' && typeof getLastMessageId === 'function';
  }
};
window.MVU = MVU;
