/**
 * 星链智运 · 数据服务层
 * 启动时将 CSV 载入内存（约 1 万行，<2MB），提供过滤、聚合、分页查询。
 * 生产环境可将本模块替换为真实数据库（PostgreSQL/MySQL/SQLite）实现，
 * 只要保持导出函数签名一致即可，路由层无需改动。
 */
'use strict';
const fs = require('fs');
const path = require('path');

/* ---------------- CSV 载入 ---------------- */
function parseCSV(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  const head = lines[0].split(',').map(h => h.trim().replace(/^﻿/, ''));
  return lines.slice(1).map(line => {
    const c = line.split(',');
    const o = {};
    head.forEach((h, i) => { o[h] = (c[i] || '').trim(); });
    return o;
  });
}

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');

const shipments = parseCSV(path.join(DATA_DIR, 'shipments.csv')).map(r => ({
  id: r['运单号'],
  date: r['发货日期'],                 // YYYY-MM-DD
  fromProv: r['发货省份'],
  toProv: r['目的省份'],
  mode: r['运输方式'],
  cargo: r['货类'],
  weight: +r['重量kg'] || 0,
  cost: +r['运费成本'] || 0,
  hours: +r['时效小时'] || 0,
  onTime: r['是否准时'] === '是',
  carbon: +r['碳排放kg'] || 0,
  status: r['运单状态']
}));

const provDim = parseCSV(path.join(DATA_DIR, 'provinces.csv')).map(r => ({
  name: r['省份'], region: r['区域'], hub: r['核心枢纽'],
  lng: +r['经度'], lat: +r['纬度'], weight: +r['单量权重'] || 50
}));

const PROV_REGION = {};
provDim.forEach(p => { PROV_REGION[p.name] = p.region; });

// 数据覆盖的日期范围
const dates = shipments.map(r => r.date).sort();
const MIN_DATE = dates[0];
const MAX_DATE = dates[dates.length - 1];

/* ---------------- 静态域 ---------------- */
const MODES = ['公路', '铁路', '航空', '水运'];
const MODE_COLOR = { '公路': '#35d5ff', '铁路': '#7c8cff', '航空': '#ffb648', '水运': '#2ee6a8' };
const HUBS = [
  { name: '北京枢纽', coord: [116.40, 39.90] }, { name: '上海枢纽', coord: [121.47, 31.23] },
  { name: '广州枢纽', coord: [113.26, 23.13] }, { name: '深圳枢纽', coord: [114.06, 22.54] },
  { name: '武汉枢纽', coord: [114.30, 30.59] }, { name: '郑州枢纽', coord: [113.62, 34.75] },
  { name: '西安枢纽', coord: [108.94, 34.34] }, { name: '成都枢纽', coord: [104.07, 30.57] },
  { name: '重庆枢纽', coord: [106.55, 29.56] }, { name: '杭州枢纽', coord: [120.15, 30.29] },
  { name: '沈阳枢纽', coord: [123.43, 41.80] }, { name: '昆明枢纽', coord: [102.83, 24.88] },
  { name: '乌鲁木齐枢纽', coord: [87.62, 43.83] }, { name: '兰州枢纽', coord: [103.83, 36.06] },
  { name: '长沙枢纽', coord: [112.94, 28.23] }
];
const HUB_PROV = { '北京枢纽': '北京', '上海枢纽': '上海', '广州枢纽': '广东', '深圳枢纽': '广东', '武汉枢纽': '湖北', '郑州枢纽': '河南', '西安枢纽': '陕西', '成都枢纽': '四川', '重庆枢纽': '重庆', '杭州枢纽': '浙江', '沈阳枢纽': '辽宁', '昆明枢纽': '云南', '乌鲁木齐枢纽': '新疆', '兰州枢纽': '甘肃', '长沙枢纽': '湖南' };
const ROUTES = [
  ['广州枢纽', '武汉枢纽', '公路'], ['武汉枢纽', '北京枢纽', '公路'], ['上海枢纽', '武汉枢纽', '公路'],
  ['杭州枢纽', '郑州枢纽', '公路'], ['成都枢纽', '重庆枢纽', '公路'], ['西安枢纽', '兰州枢纽', '公路'],
  ['北京枢纽', '沈阳枢纽', '公路'], ['长沙枢纽', '广州枢纽', '公路'],
  ['郑州枢纽', '西安枢纽', '铁路'], ['武汉枢纽', '重庆枢纽', '铁路'], ['兰州枢纽', '乌鲁木齐枢纽', '铁路'],
  ['成都枢纽', '昆明枢纽', '铁路'], ['广州枢纽', '长沙枢纽', '铁路'],
  ['上海枢纽', '广州枢纽', '航空'], ['深圳枢纽', '北京枢纽', '航空'], ['成都枢纽', '上海枢纽', '航空'],
  ['昆明枢纽', '深圳枢纽', '航空'],
  ['上海枢纽', '重庆枢纽', '水运'], ['广州枢纽', '上海枢纽', '水运']
];
const DAY_DAYS = { d1: 1, d3: 3, d7: 7, d30: 30 };
const DAY_OPTS = [
  { key: 'd1', label: '近24小时' }, { key: 'd3', label: '近3天' },
  { key: 'd7', label: '近7天' }, { key: 'd30', label: '近30天' }
];
const GOAL_OTD = 92.0;
// 无仓储实测数据时的仿真基准（README 已注明）
const WARE_BASE = 76.4;

/* 确定性伪随机（同一筛选条件结果可复现） */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedOf(f) {
  let s = ({ d1: 11, d3: 23, d7: 42, d30: 77 })[f.day] || 42;
  if (f.prov) s += (provDim.find(p => p.name === f.prov) || { weight: 50 }).weight * 13;
  if (f.mode) s += f.mode.charCodeAt(0) * 7;
  if (f.cargo) s += f.cargo.length * 31;
  return s;
}

/* ---------------- 过滤 ---------------- */
function normFilter(q) {
  return {
    day: DAY_DAYS[q.day] ? q.day : 'd7',
    prov: q.prov || null,
    mode: MODES.includes(q.mode) ? q.mode : null,
    cargo: q.cargo || null
  };
}
function cutoffDate(day) {
  const d = new Date(MAX_DATE + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - (DAY_DAYS[day] - 1));
  return d.toISOString().slice(0, 10);
}
function filterRows(f) {
  const cut = cutoffDate(f.day);
  return shipments.filter(r =>
    r.date >= cut &&
    (!f.prov || r.fromProv === f.prov || r.toProv === f.prov) &&
    (!f.mode || r.mode === f.mode) &&
    (!f.cargo || r.cargo === f.cargo)
  );
}
// 上一周期（同长度，用于环比）
function prevRows(f) {
  const days = DAY_DAYS[f.day];
  const end = cutoffDate(f.day);
  const d = new Date(end + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - days);
  const start = d.toISOString().slice(0, 10);
  return shipments.filter(r =>
    r.date >= start && r.date < end &&
    (!f.prov || r.fromProv === f.prov || r.toProv === f.prov) &&
    (!f.mode || r.mode === f.mode) &&
    (!f.cargo || r.cargo === f.cargo)
  );
}

/* ---------------- 聚合 ---------------- */
function agg(rows) {
  const n = rows.length || 1;
  const onTime = rows.filter(r => r.onTime).length;
  return {
    orders: rows.length,
    onTime,
    otd: rows.length ? +(onTime / rows.length * 100).toFixed(1) : 0,
    costPer: rows.length ? +(rows.reduce((s, r) => s + r.cost, 0) / n).toFixed(1) : 0,
    avgHours: rows.length ? +(rows.reduce((s, r) => s + r.hours, 0) / n).toFixed(1) : 0,
    carbon: Math.round(rows.reduce((s, r) => s + r.carbon, 0)),
    inTransit: rows.filter(r => r.status !== '已签收').length,
    abnormal: rows.filter(r => r.status === '异常滞留').length
  };
}

function computeCore(f) {
  const cur = agg(filterRows(f));
  const prev = agg(prevRows(f));
  const rng = mulberry32(seedOf(f));
  const provW = f.prov ? ((provDim.find(p => p.name === f.prov) || {}).weight || 50) : null;
  const ware = Math.min(96, Math.max(42, (provW ? provW * 0.82 : WARE_BASE) + (rng() - 0.5) * 6 + (f.mode === '航空' ? 8 : 0)));
  return {
    orders: cur.orders,
    inTransit: cur.inTransit,
    otd: cur.otd,
    delivered: cur.onTime,
    costPer: cur.costPer,
    totalCost: Math.round(cur.orders * cur.costPer),
    ware: +ware.toFixed(1),
    avgHours: cur.avgHours,
    carbon: cur.carbon,
    abnormal: cur.abnormal,
    goalOtd: GOAL_OTD,
    deltaOrders: prev.orders ? +((cur.orders - prev.orders) / prev.orders * 100).toFixed(1) : 0,
    deltaOtd: prev.otd ? +(cur.otd - prev.otd).toFixed(1) : 0,
    deltaCost: prev.costPer ? +((cur.costPer - prev.costPer) / prev.costPer * 100).toFixed(1) : 0,
    deltaWare: +((rng() - 0.5) * 4).toFixed(1)
  };
}

/* 趋势：d7/d30 用真实日聚合；d1/d3 为日内分布仿真（基于真实总量） */
function computeTrend(f, core) {
  const rows = filterRows(f);
  const byDate = {};
  rows.forEach(r => {
    byDate[r.date] = byDate[r.date] || { n: 0, ok: 0 };
    byDate[r.date].n++; if (r.onTime) byDate[r.date].ok++;
  });
  const days = Object.keys(byDate).sort();
  const labels = [], vol = [], otd = [];
  if (f.day === 'd7' || f.day === 'd30') {
    days.forEach(d => {
      labels.push(d.slice(5));
      vol.push(byDate[d].n);
      otd.push(+(byDate[d].ok / byDate[d].n * 100).toFixed(1));
    });
  } else {
    const n = f.day === 'd1' ? 24 : 12;
    const rng = mulberry32(seedOf(f) * 7 + 5);
    const baseVol = core.orders / n;
    for (let i = 0; i < n; i++) {
      labels.push(f.day === 'd1' ? i + ':00' : 'D-' + (2 - Math.floor(i / 4)) + ' ' + (i % 4 * 6) + 'h');
      const wave = 1 + 0.28 * Math.sin(i / n * Math.PI * 2 - 0.8) + (rng() - 0.5) * 0.14;
      vol.push(Math.round(baseVol * wave));
      otd.push(+(Math.min(97, Math.max(78, core.otd + (rng() - 0.5) * 4 - (wave - 1) * 6))).toFixed(1));
    }
  }
  return { labels, vol, otd };
}

/* 地图：按发货省真实聚合，单量归一化为 0-100 指数 */
function computeMap(f) {
  const rows = filterRows(f);
  const byProv = {};
  rows.forEach(r => {
    byProv[r.fromProv] = byProv[r.fromProv] || { n: 0, ok: 0 };
    byProv[r.fromProv].n++; if (r.onTime) byProv[r.fromProv].ok++;
  });
  const maxN = Math.max(1, ...Object.values(byProv).map(v => v.n));
  const provinces = provDim.map(p => {
    const v = byProv[p.name];
    return {
      name: p.name,
      vol: v ? Math.round(v.n / maxN * 100) : 0,
      otd: v ? +(v.ok / v.n * 100).toFixed(1) : 0
    };
  });
  return { provinces, hubs: HUBS, hubProv: HUB_PROV, routes: ROUTES };
}

/* 多式联运走廊：四大区域真实单量 */
const LANES = [
  { region: '华东', lane: ['华东分拨', '公路干线', '区域配送'], mode: '公路' },
  { region: '华南', lane: ['华南分拨', '航空干线', '机场自提'], mode: '航空' },
  { region: '西南', lane: ['西南分拨', '铁路班列', '枢纽中转'], mode: '铁路' },
  { region: '华中', lane: ['华中分拨', '水运班轮', '港口集散'], mode: '水运' }
];
function computeModality(f) {
  const rows = filterRows(f);
  return LANES.map(L => {
    const regionRows = rows.filter(r => PROV_REGION[r.fromProv] === L.region);
    const v1 = regionRows.length;
    const v2 = regionRows.filter(r => r.mode === L.mode).length;
    return { lane: L.lane, v1, v2: Math.min(v1, v2) };
  });
}

/* 货类 × 方式结构（真实聚合） */
function computeCargos(f) {
  const rows = filterRows(f);
  const total = rows.length || 1;
  const byCargo = {};
  rows.forEach(r => {
    byCargo[r.cargo] = byCargo[r.cargo] || { n: 0, mix: { '公路': 0, '铁路': 0, '航空': 0, '水运': 0 } };
    byCargo[r.cargo].n++;
    byCargo[r.cargo].mix[r.mode] = (byCargo[r.cargo].mix[r.mode] || 0) + 1;
  });
  return Object.keys(byCargo).sort((a, b) => byCargo[b].n - byCargo[a].n).map(name => {
    const c = byCargo[name];
    return {
      name,
      share: +(c.n / total * 100).toFixed(1),
      mix: MODES.map(m => +(c.mix[m] / c.n * 100).toFixed(1))
    };
  });
}

/* 雷达：时效/成本/履约/绿色/网络/稳定 */
function computeRadar(f, core) {
  const carbonPer = core.carbon / Math.max(1, core.orders);
  const provW = f.prov ? ((provDim.find(p => p.name === f.prov) || {}).weight || 50) : 60;
  const cur = [
    Math.min(100, core.otd + 2),
    Math.min(100, Math.max(5, 100 - Math.max(0, core.costPer - 800) / 25)),
    Math.min(100, Math.max(5, 120 - core.avgHours * 1.6)),
    Math.min(100, Math.max(5, 100 - Math.max(0, carbonPer - 220) * 0.5)),
    Math.min(100, 70 + provW * 0.2),
    Math.min(100, Math.max(5, 88 + core.deltaOtd))
  ].map(v => +v.toFixed(1));
  return { cur, base: [GOAL_OTD, 76, 74, 70, 80, 85] };
}

/* 预警流：模板 + 数据驱动动态预警 */
const ALERT_TPL = [
  { t: 'G4 京港澳高速 武汉—长沙段拥堵预警', s: 'high', g: '湖北', w: '公路', c: '建议绕行 G0422 武深高速，预计可挽回时效 2.4h' },
  { t: '华东医药冷链 2 号库温控偏差 +0.8℃', s: 'high', g: '上海', w: '公路', c: '已通知现场切换备用制冷机组，持续监测' },
  { t: '深圳—北京航空干线 舱位利用率达 96%', s: 'mid', g: '广东', w: '航空', c: '建议明日增开 1 班包机或分流 18% 至铁路快运' },
  { t: '西安枢纽 分拨峰值产能接近上限', s: 'mid', g: '陕西', w: '铁路', c: '建议提前 2 小时启动作业班次，均衡波次' },
  { t: '长三角暴雨黄色预警 影响末端配送', s: 'mid', g: '浙江', w: '公路', c: '建议调整 12 条末端线路排班并通知客户' },
  { t: '乌鲁木齐方向铁路棚车供给偏紧', s: 'mid', g: '新疆', w: '铁路', c: '建议锁定未来 72h 车皮计划并启用公路补充' },
  { t: '华南区域 生鲜订单履约超时率上升', s: 'low', g: '广东', w: '公路', c: '建议核查 3 个前置仓拣货效率' },
  { t: '长江水道 宜昌段水位偏低 船期延误', s: 'low', g: '湖北', w: '水运', c: '建议重载船舶减载 8% 并调整靠泊计划' },
  { t: '成都枢纽 自动化分拣线 计划外停机 12 分钟', s: 'low', g: '四川', w: '公路', c: '已复位，建议夜间巡检确认伺服状态' }
];
function computeAlerts(f, core) {
  const rows = filterRows(f);
  const out = ALERT_TPL.filter(a => (!f.prov || a.g === f.prov) && (!f.mode || a.w === f.mode));
  // 数据驱动：滞留聚集省份
  const abnByProv = {};
  rows.filter(r => r.status === '异常滞留').forEach(r => { abnByProv[r.fromProv] = (abnByProv[r.fromProv] || 0) + 1; });
  const top = Object.entries(abnByProv).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= Math.max(8, core.orders * 0.004)) {
    out.unshift({ t: top[0] + '区域异常滞留运单达 ' + top[1] + ' 票，超阈值告警', s: 'high', g: top[0], w: f.mode || '公路', c: '建议对该区域启用应急转运预案，并逐票联系收发货方确认' });
  }
  if (core.otd < GOAL_OTD - 3) {
    out.unshift({ t: (f.prov || '全网') + '准时率 ' + core.otd + '% 低于预警线', s: 'high', g: f.prov || '全国', w: f.mode || '公路', c: '建议排查 Top 延误走廊并启用动态路由' });
  }
  if (!out.length) out.push({ t: (f.prov || '全网') + '运行平稳，暂无高风险预警', s: 'low', g: f.prov || '全国', w: f.mode || '公路', c: '保持现有调度策略，AI 持续监测中' });
  const rank = { high: 0, mid: 1, low: 2 };
  return out.sort((a, b) => rank[a.s] - rank[b.s]).slice(0, 7);
}

/* 运单分页查询 */
function queryShipments(f, page, size) {
  const rows = filterRows(f).slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const p = Math.max(1, +page || 1), s = Math.min(100, Math.max(5, +size || 16));
  const total = rows.length;
  const list = rows.slice((p - 1) * s, p * s).map(r => ({
    id: r.id,
    route: r.fromProv + ' → ' + r.toProv,
    mode: r.mode,
    prov: r.toProv,
    cargo: r.cargo,
    status: r.status,
    eta: r.hours,
    cost: Math.round(r.cost),
    carbon: +r.carbon.toFixed(1),
    t: r.date
  }));
  return { rows: list, total, page: p, size: s, pages: Math.ceil(total / s) };
}

module.exports = {
  shipments, provDim, PROV_REGION, MODES, MODE_COLOR, HUBS, HUB_PROV, ROUTES,
  DAY_OPTS, DAY_DAYS, GOAL_OTD, MIN_DATE, MAX_DATE,
  normFilter, filterRows, computeCore, computeTrend, computeMap,
  computeModality, computeCargos, computeRadar, computeAlerts, queryShipments,
  meta: () => ({
    provinces: provDim.map(p => ({ name: p.name, region: p.region, weight: p.weight })),
    hubs: HUBS, hubProv: HUB_PROV, routes: ROUTES, modes: MODES,
    modeColor: MODE_COLOR, dayOpts: DAY_OPTS, goalOtd: GOAL_OTD,
    range: { min: MIN_DATE, max: MAX_DATE, rows: shipments.length }
  })
};
