/* ============================================================
   暮归旅店 · 手绘线稿图标库
   约束：viewBox 24×24；stroke=currentColor（经 .icon-fill 继承）；
   线宽略有出入以模拟手绘感；天气图标内置动画类。
   悬停时父级 :hover .icon-fill 触发墨水填充。
   ============================================================ */

const ICONS = {
  /* ---------- 导航 ---------- */
  house:    '<path d="M3.5 11.5 12 4.2l8.5 7.3"/><path d="M5.5 10.3V19h13v-8.7"/><path d="M9.5 19v-5h5v5"/><path d="M9.5 14.2h5"/>',
  bag:      '<path d="M6.2 8h11.6l-1 12.2H7.2L6.2 8z"/><path d="M9 8a3 3 0 0 1 6 0"/><path d="M9.2 12h5.6"/>',
  hammer:   '<path d="M14.5 3.6 20.4 9.5l-2.6 2.6-5.9-5.9z"/><path d="M12.7 5.4 4.4 13.7l3.2 3.2 8.3-8.3z"/><path d="M5.6 12.5 8.8 15.7"/>',
  compass:  '<circle cx="12" cy="12" r="8.6"/><path d="M12 5.5l1.9 6.5L12 18.5 10.1 12z"/><path d="M5.5 12l6.5 1.9L18.5 12 12 10.1z"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/>',
  person:   '<circle cx="12" cy="8" r="3.4"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/><path d="M5.5 20h13"/>',
  key:      '<circle cx="8" cy="8" r="4.2"/><path d="M11 11l8.5 8.5"/><path d="M15.5 15.5l2.2-2.2M18.5 18.5l2.2-2.2"/>',
  scroll:   '<path d="M7 4.5h9.5A1.5 1.5 0 0 1 18 6v11.5A1.5 1.5 0 0 0 19.5 19H8A1.5 1.5 0 0 1 6.5 17.5V4.5z"/><path d="M6.5 4.5A1.5 1.5 0 0 0 5 6v2h1.5"/><path d="M9.5 9h5M9.5 12.5h5"/>',
  wheat:    '<path d="M12 21V7"/><path d="M12 9.2 9 7.4 12 6.3l3 1.1z"/><path d="M12 13 9 11.2l3-1.1 3 1.1z"/><path d="M12 16.8 9 15l3-1.1 3 1.1z"/>',
  settings: '<circle cx="12" cy="12" r="3.1"/><path d="M12 2.6l1.1 2.2 2.4-.5-.5 2.4 2.2 1.1-2.2 1.1.5 2.4-2.4-.5L12 21.4l-1.1-2.2-2.4.5.5-2.4L6.8 16l2.2-1.1-.5-2.4 2.4.5z"/>',
  close:    '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  search:   '<circle cx="11" cy="11" r="6"/><path d="M15.6 15.6 20 20"/>',
  plus:     '<path d="M12 5v14M5 12h14"/>',
  check:    '<path d="M5 12.5l4.5 4.5L19 6.5"/>',
  lock:     '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  chevronR: '<path d="M9.5 5l7 7-7 7"/>',
  chevronD: '<path d="M5 9.5l7 7 7-7"/>',

  /* ---------- 状态 / 资源 ---------- */
  coin:     '<circle cx="12" cy="12" r="8"/><path d="M12 7.6l1.3 2.7 3 .4-2.2 2.1.5 3L12 18.4 9.4 19.9l.5-3-2.2-2.1 3-.4z"/>',
  star:     '<path d="M12 3.2l2.5 5.4 5.9.7-4.3 4 1.2 5.8L12 16.6 6.7 19.1l1.2-5.8-4.3-4 5.9-.7z"/>',
  bed:      '<path d="M3 18v-6.5h13.5a3 3 0 0 1 3 3V18"/><path d="M3 12.5V8M3 18v2.2M19.5 18v2.2"/><path d="M6 12.5V10h5.5v2.5"/>',
  energy:   '<path d="M12.5 3c2.2 3 5 5.2 5 9a5.5 5.5 0 0 1-11 0c0-2.2 1.1-3.6 2.2-4.6.6 1.2 1.7 1.7 2.5 1.1.9-.7.3-3.4 1.3-5.5z"/>',
  stress:   '<path d="M7.5 6.5c4-2.4 8.5.4 7.6 4.6-.7 3.2-4.2 3.4-5.3 1.2-1-2 .9-4.2 3.1-3.3 2.1.9 2.1 3.4-.1 4"/>',
  door:     '<path d="M6 21V4.2A1.2 1.2 0 0 1 7.2 3h8.6A1.2 1.2 0 0 1 17 4.2V21"/><path d="M3.5 21h17"/><circle cx="13.5" cy="12" r="1" fill="currentColor"/>',
  pot:      '<path d="M3.5 10h17l-1 1.2v1.8a5 5 0 0 1-5 5H9.5a5 5 0 0 1-5-5v-1.8z"/><path d="M2 10h20"/><path d="M9 5.6c-.6-1 .4-2 0-3.3M13.5 5.6c-.6-1 .4-2 0-3.3"/>',
  water:    '<path d="M12 3c3 4.2 5 6.6 5 9.2a5 5 0 0 1-10 0C7 9.6 9 7.2 12 3z"/>',
  fertilize:'<path d="M4 20c1.8-4 5.6-4 8 0 2.4-4 6.2-4 8 0"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="7.2" r="1"/><circle cx="12" cy="5" r="1"/>',
  warning:  '<path d="M12 3.2 21.5 20H2.5z"/><path d="M12 9.2v4.6M12 17.2h.01"/>',
  info:     '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.2M12 7.6h.01"/>',
  sparkle:  '<path d="M12 2.8c.6 4.4 1.7 5.6 6 6.2-4.3.6-5.4 1.8-6 6.2-.6-4.4-1.7-5.6-6-6.2 4.3-.6 5.4-1.8 6-6.2z"/><path d="M18.5 14.2c.2 1.6.7 2 2.2 2.2-1.5.2-2 .6-2.2 2.2-.2-1.6-.7-2-2.2-2.2 1.5-.2 2-.6 2.2-2.2z"/>',

  /* ---------- 天气（内置动画类） ---------- */
  sun:      '<g class="wx-sun-rays"><path d="M12 2v2.6M12 19.4V22M2 12h2.6M19.4 12H22M4.7 4.7l1.8 1.8M17.5 17.5l1.8 1.8M19.3 4.7l-1.8 1.8M6.5 17.5l-1.8 1.8"/></g><circle class="wx-sun-core" cx="12" cy="12" r="4.1" fill="currentColor" fill-opacity="0.14"/>',
  moon:     '<path class="wx-moon" d="M20.5 13.6A8.5 8.5 0 1 1 10.4 3.5a6.6 6.6 0 0 0 10.1 10.1z" fill="currentColor" fill-opacity="0.12"/>',
  cloud:    '<path class="wx-cloud" d="M7 15.5a4 4 0 0 1 .6-8A5 5 0 0 1 17 8.2a3.6 3.6 0 0 1 .5 7.3H7z" fill="currentColor" fill-opacity="0.1"/>',
  rain:     '<path class="wx-cloud" d="M7 14a4 4 0 0 1 .6-7.9A5 5 0 0 1 17 6.7a3.6 3.6 0 0 1 .5 7.3H7z" fill="currentColor" fill-opacity="0.1"/><path class="wx-rain-drop" d="M8.5 17l-1 3"/><path class="wx-rain-drop" d="M12.5 17l-1 3"/><path class="wx-rain-drop" d="M16.5 17l-1 3"/>',
  snow:     '<path class="wx-cloud" d="M7 14a4 4 0 0 1 .6-7.9A5 5 0 0 1 17 6.7a3.6 3.6 0 0 1 .5 7.3H7z" fill="currentColor" fill-opacity="0.1"/><path class="wx-snow" d="M9 17.5v3M8 19h2"/><path class="wx-snow" d="M12.5 17.5v3M11.5 19h2"/><path class="wx-snow" d="M16 17.5v3M15 19h2"/>',

  /* ---------- 时段 ---------- */
  sunrise:  '<path d="M3 17.5h18"/><path d="M6 14.5a6 6 0 0 1 12 0"/><path d="M12 4v4"/><path d="M9.5 6.5 12 4l2.5 2.5"/>',
  highnoon: '<circle cx="12" cy="9" r="3.1"/><path d="M12 2.5v2M12 13.5v2M5 9H2.8M21.2 9H19M6.4 3.4 5 4.8M17.6 3.4 19 4.8"/><path d="M3 19h18"/>',
  afternoon:'<path d="M3 18h18"/><circle cx="15" cy="12" r="2.8"/><path d="M15 6v1.6M20 12h1.6M18.3 8.7l1.1-1.1"/>',
  sunset:   '<path d="M3 17.5h18"/><path d="M8 17.5a4 4 0 0 1 8 0"/><path d="M12 11.5v4M12 11.5 9.6 9.1M12 11.5l2.4-2.4"/>',

  /* ---------- 食材 / 自然 / 魔法 ---------- */
  grain:    '<path d="M12 21V4.5"/><path d="M9 7.5l3 1 3-1M9 11.5l3 1 3-1M9 15.5l3 1 3-1"/>',
  egg:      '<path d="M12 3.2c4 0 6 6 6 9.8a6 6 0 0 1-12 0C6 9.2 8 3.2 12 3.2z"/>',
  mushroom: '<path d="M4 11a8 8 0 0 1 16 0H4z"/><path d="M9 11v6.5a3 3 0 0 0 6 0V11"/><circle cx="10" cy="8" r="1" fill="currentColor"/><circle cx="14" cy="9" r="1" fill="currentColor"/>',
  herb:     '<path d="M12 21V8.5"/><path d="M12 8.5c0-3-3-4-5.2-3 0 3 2.2 4 5.2 3zM12 8.5c0-3 3-4 5.2-3 0 3-2.2 4-5.2 3z"/>',
  fish:     '<path d="M3 12c3-5 9-5 13 0-4 5-10 5-13 0z"/><path d="M16 12l4.2-3v6z"/><circle cx="7.5" cy="11" r="1" fill="currentColor"/>',
  honey:    '<path d="M12 3 4.2 7.5v9L12 21l7.8-4.5v-9z"/><path d="M12 3v6M4.2 7.5 12 12l7.8-4.5M4.2 16.5 12 12l7.8 4.5"/>',
  wood:     '<rect x="3" y="9" width="18" height="6" rx="3"/><circle cx="6.2" cy="12" r="1.3"/><path d="M6.2 10.8v2.4M5 12h2.4M17.8 10.8c.6.6.6 3 0 3.6"/>',
  stone:    '<path d="M5 18.5 7 8l5-2.8L17 8l2 10.5z"/><path d="M9 14.5h6M8.5 11l3 .5 4-.5"/>',
  flower:   '<circle cx="12" cy="8.5" r="2"/><path d="M12 8.5c0-3-1-5 0-6.2 1 1.2 0 3.2 0 6.2M12 8.5c3 0 5-1 6.2 0-1.2 1-3.2 0-6.2 0M12 8.5c0 3 1 5 0 6.2-1-1.2 0-3.2 0-6.2M12 8.5c-3 0-5 1-6.2 0 1.2-1 3.2 0 6.2 0"/><path d="M12 10.5V21"/>',
  gem:      '<path d="M7 4h10l3 5-8 11.5L4 9z"/><path d="M4 9h16M9.5 4 12 9l2.5-5M12 9v11.5"/>',

  /* ---------- 建筑 ---------- */
  kitchen:  '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.4"/><circle cx="15" cy="10" r="1.4"/><path d="M7 16.5h10"/>',
  oven:     '<path d="M4 20V9l8-5 8 5v11z"/><path d="M8 20v-6h8v6"/><path d="M10.5 14h3"/>',
  brewery:  '<path d="M6 6h12v12H6z"/><path d="M6 9.5h12M6 14.5h12"/><path d="M7.8 6c-1 2.2-1 9.8 0 12M16.2 6c1 2.2 1 9.8 0 12"/>',
  garden:   '<path d="M3 18.5h18"/><path d="M3 18.5c0-3.2 3.2-5.5 9-5.5s9 2.3 9 5.5"/><path d="M12 13V7.5"/><path d="M12 9.5c-2 0-3-1.2-3-3.2 2 0 3 1.2 3 3.2zM12 9.5c2 0 3-1.2 3-3.2-2 0-3 1.2-3 3.2z"/>',
  library:  '<path d="M4 4h4v16H4z"/><path d="M9.5 4h4v16h-4z"/><path d="M14.5 5 18.5 6l-3 14-4-1z"/>',
  well:     '<path d="M5 10.5h14V20H5z"/><path d="M5 10.5 8 5.5h8l3 5"/><path d="M12 5.5V2.5M9 2.5h6"/><path d="M9 14.5h6"/>',

  /* ---------- 访客 ---------- */
  mage:     '<circle cx="12" cy="8.5" r="3"/><path d="M12 11.5 7.5 20h9z"/><path d="M9 5.5 12 2.5l3 3"/>',
  noble:    '<circle cx="12" cy="9" r="3"/><path d="M7 20c1-5 3-7 5-7s4 2 5 7"/><path d="M8 6 9 3l3 2 3-2 1 3"/>',
  merchant: '<circle cx="12" cy="8" r="3"/><path d="M6 20l2-7h8l2 7"/><path d="M8 13l1-3h6l1 3"/><path d="M9 5.5c1.5-1 4.5-1 6 0"/>',

  /* ---------- 地块 ---------- */
  tree:     '<path d="M12 3 5.5 13h4l-3 7h11l-3-7h4z"/>',
  lake:     '<path d="M3 11.5c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2"/><path d="M3 15.5c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2"/>',
  mountain: '<path d="M3 19 9 7l3.5 6 2.5-3.5L21 19z"/><circle cx="9" cy="7" r="1" fill="currentColor"/>',
  cave:     '<path d="M4 20V12a8 8 0 0 1 16 0v8"/><path d="M9 20v-3.5a3 3 0 0 1 6 0V20"/>',
  berry:    '<path d="M5 20c0-5 3-9 7-9s7 4 7 9"/><circle cx="9" cy="13" r="1.2" fill="currentColor"/><circle cx="14" cy="11" r="1.2" fill="currentColor"/><circle cx="12" cy="15" r="1.2" fill="currentColor"/>',
  ruin:     '<path d="M5 20V8l3-3 3 2 3-2 3 3v12"/><path d="M9 20v-5h2v5M13 20v-5h2v5"/>',

  /* ---------- 作物 ---------- */
  carrot:   '<path d="M12 21 9 8h6z"/><path d="M12 8c-1-2 0-4 2-5-1 2 0 3 1 4M12 8c1-2 3-2 4-1-2 0-2 2-2 3"/>',
  cabbage:  '<circle cx="12" cy="13" r="5.5"/><path d="M12 7.5c-2 0-3 2-3 4M12 7.5c2 0 3 2 3 4M8 11.5c-2 1-2 3-1 4M16 11.5c2 1 2 3 1 4"/>',

  /* ---------- 伪同层 / 视口 ---------- */
  expand:   '<path d="M9.5 4.5H4.5V9.5"/><path d="M14.5 4.5h5V9.5"/><path d="M4.5 14.5v5h5"/><path d="M19.5 14.5v5h-5"/>',
  compress: '<path d="M4.5 9.5h5v-5"/><path d="M19.5 9.5h-5v-5"/><path d="M4.5 14.5h5v5"/><path d="M19.5 14.5h-5v5"/>',
  send:     '<path d="M4 12 20.5 4.5 13 21l-2.3-6.7z"/><path d="M10.7 14.3 20.5 4.5"/>',
  pencil:   '<path d="M4.5 19.5h4l10-10-4-4-10 10z"/><path d="M14.5 5.5l4 4"/><path d="M4.5 19.5 6 15.5"/>',
  copy:     '<rect x="9" y="9" width="10.5" height="10.5" rx="1.8"/><path d="M15 6.2A1.7 1.7 0 0 0 13.3 4.5H6.2A1.7 1.7 0 0 0 4.5 6.2v7.1A1.7 1.7 0 0 0 6.2 15"/>',
  trash:    '<path d="M5 7h14"/><path d="M6.5 7 7.5 20h9L17.5 7"/><path d="M10 7V4.8h4V7"/><path d="M10.5 10.5v6M13.5 10.5v6"/>',

  /* ---------- 可选地图预设 ---------- */
  grassland:'<path d="M3 19h18"/><path d="M6 19c0-4 1-7 3-10M9 19c0-3-1-5-3-7M13 19c0-5 1-9 3-13M16 19c0-3 1-5 3-7"/>',
  hill:     '<path d="M2.5 19c3-7 7-8 10-2 2-4 5-5 9-1"/><path d="M4 19h16"/>',
  river:    '<path d="M8 3c7 4-3 7 5 10s1 6 3 8"/><path d="M13 3c6 4-4 7 4 10s0 6 2 8"/>',
  coast:    '<path d="M3 5c5 2 3 6 8 7s3 5 10 7"/><path d="M3 17c2 0 2 2 4 2s2-2 4-2"/>',
  swamp:    '<path d="M3 18h18M5 14h5M14 12h5"/><path d="M8 14V8m0 0-2-3m2 3 2-3M17 12V6"/>',
  mine:     '<path d="M4 20V12a8 8 0 0 1 16 0v8"/><path d="M8 20 18 8M6 7l4 4M14 4l4 4"/>',
  village:  '<path d="M3 12 8 7l5 5v8H3zM12 10l4-4 5 5v9h-8"/><path d="M6 20v-4h3v4M16 20v-5h3v5"/>',
  road:     '<path d="M9 2c5 5-2 8 4 12 3 2 2 5 2 8M14 2c4 5-3 8 3 12 3 2 2 5 2 8"/>',
  bridge:   '<path d="M3 17h18M5 17v-6h14v6M7 11c1-5 9-5 10 0"/><path d="M3 20c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1"/>',
  camp:     '<path d="M4 20 12 5l8 15zM12 5v15M8 20l4-7 4 7"/>',
  temple:   '<path d="M3 8h18L12 3zM5 9v10M9 9v10M15 9v10M19 9v10M3 20h18"/>',
  meadow:   '<path d="M3 20h18M7 20v-8m0 2c-4-1-4-4-2-5 2 1 3 3 2 5zm0 2c4-1 4-4 2-5-2 1-3 3-2 5zM16 20v-6"/>',
  orchard:  '<path d="M12 20v-8M8 20h8"/><circle cx="12" cy="8" r="5"/><circle cx="9" cy="7" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/>',
  desert:   '<path d="M2 18c4-4 8-4 12 0 2-3 5-3 8 0"/><path d="M16 14V5m0 4h3V7m-3 5h-3V9"/>',
  snowland: '<path d="M3 18 9 8l3 5 3-4 6 9z"/><path d="m7 6 4-3 3 3 3-2"/>',

  /* ---------- 可选作物预设 ---------- */
  corn:     '<path d="M12 21V5M8 8c4 0 4 4 4 7-4 0-4-4-4-7zm8 0c-4 0-4 4-4 7 4 0 4-4 4-7z"/><path d="M10 5h4v9h-4z"/>',
  rice:     '<path d="M10 21V5m4 16V7"/><path d="m10 7-3-2m3 5-4-1m8 0 3-2m-3 5 4-1"/>',
  potato:   '<path d="M7 8c4-4 11-1 11 5 0 5-5 8-10 6-5-2-5-8-1-11z"/><circle cx="10" cy="11" r=".7" fill="currentColor"/><circle cx="14" cy="16" r=".7" fill="currentColor"/>',
  turnip:   '<path d="M7 11c0 6 2 9 5 10 3-1 5-4 5-10z"/><path d="M12 11c-1-4 0-7 2-9m-2 9c1-4 4-5 6-4m-6 4c-1-3-4-4-6-3"/>',
  beans:    '<path d="M7 4c9 1 12 9 8 16"/><path d="M8 7c3-1 4 2 2 4-3 2-5-2-2-4zm5 5c3-1 4 2 2 4-3 2-5-2-2-4z"/>',
  fruit:    '<circle cx="12" cy="13" r="6"/><path d="M12 7c0-3 2-5 5-5-1 3-2 5-5 5zM11 7 9 4"/>',
  seedbag:  '<path d="M7 7h10l2 4v8H5v-8z"/><path d="M9 7 8 3h8l-1 4M9 12c2-2 4-2 6 0"/>',
  sprout:   '<path d="M12 21V10"/><path d="M12 12C7 12 5 9 6 6c4 0 6 2 6 6zm0-2c5 0 7-3 6-6-4 0-6 2-6 6z"/>',
  ripe:     '<path d="M12 21V5M7 8l5 3 5-3M7 13l5 3 5-3"/><circle cx="7" cy="8" r="1" fill="currentColor"/><circle cx="17" cy="13" r="1" fill="currentColor"/>',
  withered: '<path d="M12 21V7M12 12C8 8 6 9 5 11c2 3 5 3 7 1zm0 3c4-4 6-3 7-1-2 3-5 3-7 1z"/><path d="M8 4l8 16"/>',
  magicplant:'<path d="M12 21V9M12 12C7 11 6 8 7 5c4 0 5 3 5 7zm0-3c5 0 6-3 5-6-4 0-5 2-5 6z"/><path d="M19 10v4m-2-2h4M5 15v3m-1.5-1.5h3"/>',

  /* ---------- 可选农牧预设 ---------- */
  magicfarm:'<path d="M3 19h18M4 15l4-4 4 4 4-4 4 4"/><path d="M12 3c.5 3 1.5 4 4.5 4.5-3 .5-4 1.5-4.5 4.5-.5-3-1.5-4-4.5-4.5 3-.5 4-1.5 4.5-4.5z"/>',
  chicken:  '<path d="M7 14c0-4 3-7 7-6 4 1 5 6 2 9-3 3-9 1-9-3z"/><circle cx="14" cy="11" r=".8" fill="currentColor"/><path d="m17 12 4 1-4 2M9 17l-1 4m5-3v3"/>',
  duck:     '<path d="M5 15c2-5 7-5 10-2 2 2 1 5-2 6-4 1-8-1-8-4z"/><circle cx="15" cy="9" r="3"/><path d="m18 9 4 1-4 1M9 19l-1 2m4-2v2"/>',
  cow:      '<path d="M5 8h14v10H5zM8 8 5 4m11 4 3-4"/><circle cx="9" cy="12" r="1" fill="currentColor"/><path d="M8 18v3m8-3v3M10 16h4"/>',
  sheep:    '<path d="M6 9a3 3 0 0 1 5-3 3 3 0 0 1 5 1 3 3 0 0 1 2 5 4 4 0 0 1-3 6H8a4 4 0 0 1-2-9z"/><path d="M9 18v3m6-3v3"/>',
  pig:      '<path d="M4 12c0-5 4-8 9-7 5 1 8 5 7 10-1 4-5 5-10 4-4 0-6-3-6-7z"/><circle cx="15" cy="10" r="1" fill="currentColor"/><path d="M17 13h4M7 18v3m8-2v2"/>',
  beehive:  '<path d="M7 20h10l3-4-2-9-6-4-6 4-2 9z"/><path d="M6 9h12M5 13h14M5 17h14"/><circle cx="12" cy="16" r="1.5"/>',
  pasture:  '<path d="M3 19h18M5 19v-7m14 7v-7M5 14h14M8 12v7m8-7v7"/><path d="M7 8c3-4 7-4 10 0"/>',
  barn:     '<path d="M3 10 12 3l9 7v11H3z"/><path d="M8 21v-8h8v8M8 13h8M12 13v8"/>',
  trough:   '<path d="M3 10h18l-2 8H5zM7 18v3m10-3v3"/><path d="M6 13h12"/>',
  compost:  '<path d="M5 7h14l-1 14H6zM4 7l2-4h12l2 4"/><path d="M9 15c0-3 2-5 5-5 0 3-2 5-5 5z"/>',
  produce:  '<path d="M4 8h16v12H4zM7 8V5h10v3"/><path d="M8 13h8M8 16h5"/><path d="M18 2v4m-2-2h4"/>'
};

const ICON_GROUPS = {
  地图: ['tree', 'lake', 'mountain', 'cave', 'ruin', 'grassland', 'hill', 'river', 'coast', 'swamp', 'mine', 'village', 'road', 'bridge', 'camp', 'temple', 'meadow', 'orchard', 'desert', 'snowland'],
  作物: ['grain', 'carrot', 'cabbage', 'mushroom', 'herb', 'flower', 'berry', 'corn', 'rice', 'potato', 'turnip', 'beans', 'fruit', 'seedbag', 'sprout', 'ripe', 'withered', 'magicplant'],
  农牧: ['garden', 'magicfarm', 'chicken', 'duck', 'cow', 'sheep', 'pig', 'beehive', 'pasture', 'barn', 'trough', 'compost', 'produce'],
  通用: ['house', 'bag', 'hammer', 'compass', 'person', 'key', 'scroll', 'wheat', 'settings', 'coin', 'bed', 'water', 'sparkle']
};
const ICON_LABELS = {
  tree:'森林', lake:'湖泊', mountain:'山峰', cave:'洞穴', ruin:'遗迹', grassland:'草原', hill:'丘陵', river:'河流', coast:'海岸', swamp:'沼泽', mine:'矿区', village:'村落', road:'道路', bridge:'桥梁', camp:'营地', temple:'神殿', meadow:'花田', orchard:'果林', desert:'荒漠', snowland:'雪地',
  grain:'谷物', carrot:'胡萝卜', cabbage:'叶菜', mushroom:'蘑菇', herb:'香草', flower:'花卉', berry:'浆果', corn:'玉米', rice:'稻麦', potato:'薯类', turnip:'根茎', beans:'豆类', fruit:'果实', seedbag:'种子袋', sprout:'幼苗', ripe:'成熟', withered:'枯萎', magicplant:'魔法植物',
  garden:'普通农田', magicfarm:'魔法农田', chicken:'鸡', duck:'鸭', cow:'牛', sheep:'羊', pig:'猪', beehive:'蜂箱', pasture:'牧场', barn:'畜棚', trough:'饲料槽', compost:'堆肥', produce:'待收取产出',
  house:'旅店', bag:'背包', hammer:'建造', compass:'探索', person:'人物', key:'钥匙', scroll:'卷轴', wheat:'农牧', settings:'设置', coin:'货币', bed:'休息', water:'浇水', sparkle:'魔法'
};

const Icon = {
  get(name) {
    const m = ICONS[name] || ICONS.sparkle;
    return `<svg viewBox="0 0 24 24" class="icon-fill" aria-hidden="true" focusable="false">${m}</svg>`;
  },
  /** 渲染 root 内所有 [data-i] 占位为 SVG */
  render(root = document) {
    root.querySelectorAll('[data-i]').forEach((el) => {
      el.innerHTML = Icon.get(el.dataset.i);
    });
  },
  /** 设置某个元素的图标 */
  set(el, name) {
    if (!el) return;
    el.dataset.i = name;
    el.innerHTML = Icon.get(name);
  },
  /** 返回选择器使用的系统预设目录 */
  catalog(group) {
    const groups = group && ICON_GROUPS[group] ? { [group]: ICON_GROUPS[group] } : ICON_GROUPS;
    return Object.entries(groups).flatMap(([groupName, names]) => names.map((name) => ({
      name,
      label: ICON_LABELS[name] || name,
      group: groupName,
      keywords: [ICON_LABELS[name] || name, name, groupName]
    })));
  }
};

window.Icon = Icon;
