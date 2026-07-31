/* ============================================================
   货币工具 · 所有金额以整数铜币存储
   1 金 = 100 银 = 10000 铜
   ============================================================ */
const Money = {
  formatCopper(value) {
    const numeric = Number(value);
    const copper = Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
    const sign = copper < 0 ? '−' : '';
    let rest = Math.abs(copper);
    const gold = Math.floor(rest / 10000);
    rest %= 10000;
    const silver = Math.floor(rest / 100);
    const coins = rest % 100;
    const parts = [];
    if (gold) parts.push(gold + '金');
    if (silver) parts.push(silver + '银');
    if (coins || !parts.length) parts.push(coins + '铜');
    return sign + parts.join('');
  }
};
window.Money = Money;
