/* 星链智运 · 智慧物流 AI 决策大屏 — 前端应用逻辑（全栈版：数据源为后端 REST API） */
(function () {
  'use strict';

  /* ---------------- 基础工具 ---------------- */
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function fmt(n) { return Number(n || 0).toLocaleString('zh-CN'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function icon(name, cls) {
    return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ((window.ICONS && window.ICONS[name]) || '') + '</svg>';
  }
  $$('[data-ic]').forEach(function (n) { n.innerHTML = icon(n.getAttribute('data-ic')); });

  var C = { accent: '#35d5ff', violet: '#7c8cff', green: '#2ee6a8', amber: '#ffb648', red: '#ff5d73', ink: '#e8f2ff', ink2: '#a9bed8', ink3: '#7c93b3' };
  var AXIS = { axisLine: { lineStyle: { color: 'rgba(120,160,210,.25)' } }, axisLabel: { color: C.ink3, fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(80,140,200,.1)' } } };
  function baseTooltip(extra) {
    return Object.assign({
      backgroundColor: 'rgba(8,19,38,.94)', borderColor: 'rgba(53,213,255,.35)',
      textStyle: { color: C.ink, fontSize: 12 }, confine: true
    }, extra || {});
  }

  /* ---------------- 全局状态 ---------------- */
  var state = { dayKey: 'd7', prov: null, mode: null, cargo: null, page: 1 };
  var META = null;   // /api/meta 静态域
  var D = null;      // 最近一次 /api/overview 数据
  var charts = {};
  var AUTH = { token: sessionStorage.getItem('sl_token') || null };

  /* ---------------- API 客户端 ---------------- */
  /* 公网默认服务地址（Railway 部署），APP 开箱即连，无需手动配置局域网 */
  var PUBLIC_API = 'https://starlink-dashboard-production.up.railway.app';
  function serverBase() {
    var s = (localStorage.getItem('sl_server') || '').replace(/\/$/, '');
    if (s) return s;
    return (typeof IS_APP !== 'undefined' && IS_APP) ? PUBLIC_API : '';
  }
  /* APP 环境判定：Capacitor 原生壳 或 file:// 协议（需手动配置电脑端服务地址） */
  var IS_APP = (typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) || location.protocol === 'file:';
  function showLogin() { $('#loginOverlay').classList.add('on'); }
  async function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (AUTH.token) opts.headers.Authorization = 'Bearer ' + AUTH.token;
    // APP 壳未配置服务地址时直接快速失败，避免请求壳内地址被永久挂起
    if (IS_APP && !serverBase()) throw new Error('NO_SERVER');
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 8000);
    opts.signal = ctrl.signal;
    var r;
    try { r = await fetch(serverBase() + path, opts); }
    catch (fe) {
      clearTimeout(timer);
      throw new Error(fe.name === 'AbortError' ? '请求超时（8 秒无响应）' : ('网络错误：' + fe.message));
    }
    clearTimeout(timer);
    if (r.status === 401) { showLogin(); throw new Error('UNAUTHORIZED'); }
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(j.message || ('HTTP ' + r.status));
    return j;
  }
  function query() {
    var p = new URLSearchParams({ day: state.dayKey });
    if (state.prov) p.set('prov', state.prov);
    if (state.mode) p.set('mode', state.mode);
    if (state.cargo) p.set('cargo', state.cargo);
    return p;
  }
  function filterObj() {
    return { day: state.dayKey, prov: state.prov, mode: state.mode, cargo: state.cargo };
  }
  function setNet(s) {
    var n = $('#net');
    n.className = 'net' + (s === 'ok' ? '' : s === 'bad' ? ' bad' : ' loading');
    n.innerHTML = icon('activity') + '<em>' + (s === 'ok' ? '数据链路正常' : s === 'bad' ? '服务连接异常' : '数据加载中…') + '</em>';
  }

  /* ---------------- 数据加载 ---------------- */
  async function loadAll(from) {
    setNet('loading');
    try { D = await api('/api/overview?' + query().toString()); }
    catch (e) { if (e.message !== 'UNAUTHORIZED') { setNet('bad'); toast('数据加载失败：' + e.message); } return; }
    setNet('ok');
    renderKpis(D.core); renderTrend(D.trend); renderSunburst(D.cargos);
    renderModality(D.modality); renderMap(D.map); renderProvBar(D.map);
    renderGauges(D.core); renderRadar(D.radar); renderAlerts(D.alerts);
    renderAI(D.ai); renderTicker(D);
    refreshAiTag();
    loadTable();
    if (from && from !== 'init') {
      var txt = (state.prov || '全国') + (state.mode ? ' · ' + state.mode : '') + (state.cargo ? ' · ' + state.cargo : '');
      toast('视图已穿透：' + txt + '（全部组件已联动）');
    }
  }
  async function loadTable() {
    try {
      var q = query(); q.set('page', state.page); q.set('size', 16);
      var j = await api('/api/shipments?' + q.toString());
      renderTable(j);
    } catch (e) { /* 登录态问题由 api 统一处理 */ }
  }

  /* ---------------- KPI ---------------- */
  function delta(v, unit, invert) {
    if (v == null || isNaN(v)) return '';
    var up = v > 0;
    var good = invert ? !up : up;
    return '<span class="' + (Math.abs(v) < 0.05 ? '' : good ? 'up' : 'down') + '">' +
      (up ? '▲' : Math.abs(v) < 0.05 ? '—' : '▼') + ' ' + Math.abs(v).toFixed(1) + (unit || '') + ' 环比</span>';
  }
  function renderKpis(c) {
    $('#kOrders').textContent = fmt(c.orders);
    $('#kTransit').textContent = fmt(c.inTransit);
    $('#kOtd').textContent = c.otd.toFixed(1) + '%';
    $('#kDelivered').textContent = fmt(c.delivered);
    $('#kCost').textContent = '¥' + fmt(c.costPer);
    $('#kWare').textContent = c.ware.toFixed(1) + '%';
    $('#kHours').textContent = c.avgHours.toFixed(1) + 'h';
    $('#kCarbon').textContent = fmt(c.carbon) + 'kg';
    $('#sOrders').innerHTML = delta(c.deltaOrders, '%');
    $('#sTransit').innerHTML = '异常滞留 <span class="' + (c.abnormal > c.orders * 0.04 ? 'down' : '') + '">' + fmt(c.abnormal) + '</span> 票';
    $('#sOtd').innerHTML = delta(c.deltaOtd, 'pct') + ' 目标 ' + c.goalOtd + '%';
    $('#sDelivered').textContent = '本期准时签收运单';
    $('#sCost').innerHTML = delta(c.deltaCost, '%', true);
    $('#sWare').innerHTML = delta(c.deltaWare, 'pct') + (c.ware > 88 ? ' <span class="down">偏高</span>' : '');
    $('#sHours').textContent = '端到端平均时效';
    $('#sCarbon').textContent = '单均 ' + (c.carbon / Math.max(1, c.orders)).toFixed(1) + 'kg';
    $('#trendRange').textContent = (META.dayOpts.find(function (d) { return d.key === state.dayKey; }) || {}).label || '';
    $('#dataRange').textContent = '｜数据 ' + META.range.min + ' ~ ' + META.range.max;
  }

  /* ---------------- 趋势图 ---------------- */
  function renderTrend(t) {
    charts.trendChart.setOption({
      grid: { left: 46, right: 44, top: 30, bottom: 26 },
      legend: { data: ['单量', '准时交付率'], textStyle: { color: C.ink3, fontSize: 11 }, top: 0, right: 4, itemWidth: 14 },
      tooltip: baseTooltip({ trigger: 'axis' }),
      xAxis: Object.assign({ type: 'category', data: t.labels, boundaryGap: false }, AXIS),
      yAxis: [
        Object.assign({ type: 'value', name: '单量', nameTextStyle: { color: C.ink3, fontSize: 10 } }, AXIS),
        Object.assign({ type: 'value', name: '准时率%', min: 70, max: 100, nameTextStyle: { color: C.ink3, fontSize: 10 }, splitLine: { show: false } }, AXIS)
      ],
      series: [
        {
          name: '单量', type: 'line', smooth: true, symbol: 'none', data: t.vol,
          lineStyle: { width: 2, color: C.accent, shadowColor: 'rgba(53,213,255,.5)', shadowBlur: 10 },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(53,213,255,.28)' }, { offset: 1, color: 'rgba(53,213,255,.01)' }] } }
        },
        { name: '准时交付率', type: 'line', yAxisIndex: 1, smooth: true, symbol: 'none', data: t.otd, lineStyle: { width: 2, type: [6, 4], color: C.green } }
      ]
    }, true);
  }

  /* ---------------- 旭日图（货类×方式） ---------------- */
  function renderSunburst(cargos) {
    var data = cargos.map(function (c) {
      return {
        name: c.name, value: c.share,
        itemStyle: { color: 'rgba(53,213,255,' + (0.14 + c.share / 100) + ')', borderColor: 'rgba(53,213,255,.5)', borderWidth: 1 },
        children: META.modes.map(function (m, i) {
          return { name: m, value: +(c.share * c.mix[i] / 100).toFixed(1), itemStyle: { color: META.modeColor[m], opacity: 0.85 } };
        })
      };
    });
    charts.sunChart.setOption({
      tooltip: baseTooltip({ formatter: function (p) { return p.name + ' · ' + p.value + '%'; } }),
      series: [{
        type: 'sunburst', radius: [0, '92%'], data: data,
        label: { color: '#d7e6f7', fontSize: 10.5, minAngle: 8 },
        itemStyle: { borderColor: '#07101f', borderWidth: 1 },
        levels: [{}, { r0: '26%', r: '58%', label: { rotate: 'radial' } }, { r0: '58%', r: '92%', label: { rotate: 'tangential', color: '#0b1626', fontWeight: 600 } }],
        emphasis: { focus: 'ancestor' }
      }]
    }, true);
    charts.sunChart.off('click');
    charts.sunChart.on('click', function (p) {
      if (!p.data || !p.data.name) return;
      if (p.data.children) {
        state.cargo = (state.cargo === p.data.name) ? null : p.data.name;
      } else if (META.modes.indexOf(p.data.name) >= 0) {
        state.mode = (state.mode === p.data.name) ? null : p.data.name;
        var path = p.treePathInfo || [];
        if (path.length >= 2) state.cargo = path[path.length - 2].name;
      }
      state.page = 1;
      loadAll('sunburst');
    });
  }

  /* ---------------- 多式联运走廊（桑基） ---------------- */
  function renderModality(modality) {
    var nodes = {}, links = [];
    function node(n, depth) { if (!nodes[n]) nodes[n] = { name: n, depth: depth }; }
    modality.forEach(function (L) {
      node(L.lane[0], 0); node(L.lane[1], 1); node(L.lane[2], 2);
      links.push({ source: L.lane[0], target: L.lane[1], value: Math.max(1, L.v1) });
      links.push({ source: L.lane[1], target: L.lane[2], value: Math.max(1, L.v2) });
    });
    charts.modChart.setOption({
      tooltip: baseTooltip({ trigger: 'item', formatter: function (p) { return p.dataType === 'edge' ? p.data.source + ' → ' + p.data.target + '：' + fmt(p.data.value) + ' 单' : p.name; } }),
      series: [{
        type: 'sankey', left: 8, right: 66, top: 8, bottom: 8,
        nodeWidth: 10, nodeGap: 12,
        data: Object.keys(nodes).map(function (k) {
          var col = [C.accent, C.violet, C.green][nodes[k].depth];
          return { name: k, itemStyle: { color: col, borderColor: 'rgba(255,255,255,.15)', borderWidth: 1 } };
        }),
        links: links,
        lineStyle: { color: 'gradient', opacity: 0.32, curveness: 0.5 },
        label: { color: C.ink2, fontSize: 10.5 },
        emphasis: { focus: 'adjacency' }
      }]
    }, true);
    charts.modChart.off('click');
    charts.modChart.on('click', function (p) {
      if (p.dataType !== 'node') return;
      var map = { '公路干线': '公路', '航空干线': '航空', '铁路班列': '铁路', '水运班轮': '水运' };
      if (map[p.name]) {
        state.mode = (state.mode === map[p.name]) ? null : map[p.name];
        state.page = 1;
        loadAll('modality');
      } else {
        toast('「' + p.name + '」为网络节点，点击中间走廊可按运输方式穿透');
      }
    });
  }

  /* ---------------- 地图 ---------------- */
  function provColor(vol, dim) {
    var stops = [[11, 28, 51], [18, 60, 99], [22, 104, 164], [31, 168, 216], [53, 213, 255]];
    var t = Math.max(0, Math.min(1, vol / 100)) * (stops.length - 1);
    var i = Math.min(stops.length - 2, Math.floor(t));
    var f = t - i, a = stops[i], b = stops[i + 1];
    var c = a.map(function (v, k) { return Math.round(v + (b[k] - v) * f); });
    return dim ? 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',.18)' : 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  }
  function renderMap(mapData) {
    var routes = mapData.routes.map(function (r) {
      var f = mapData.hubs.find(function (h) { return h.name === r[0]; });
      var t = mapData.hubs.find(function (h) { return h.name === r[1]; });
      var dim = state.prov && mapData.hubProv[r[0]] !== state.prov && mapData.hubProv[r[1]] !== state.prov;
      var dimM = state.mode && r[2] !== state.mode;
      return { coords: [f.coord, t.coord], lineStyle: { color: META.modeColor[r[2]], opacity: (dim || dimM) ? 0.07 : 0.75, width: r[2] === '航空' ? 1.6 : 1.2, type: r[2] === '铁路' ? 'dashed' : 'solid', curveness: 0.2 } };
    });
    var hubs = mapData.hubs.map(function (h) {
      var dim = state.prov && mapData.hubProv[h.name] !== state.prov;
      return { name: h.name, value: h.coord.concat(dim ? 4 : 10), itemStyle: { opacity: dim ? 0.25 : 1 } };
    });
    var PROV_MAP = {};
    mapData.provinces.forEach(function (p) { PROV_MAP[p.name] = p; });
    var regions = mapData.provinces.map(function (p) {
      var sel = state.prov === p.name;
      var dim = state.prov && !sel;
      return {
        name: p.name,
        itemStyle: { areaColor: sel ? 'rgba(53,213,255,.82)' : provColor(p.vol, dim), borderColor: sel ? '#bdf0ff' : 'rgba(64,140,200,.55)', borderWidth: sel ? 1.4 : 0.8 },
        label: { show: sel, color: '#06202f', fontWeight: 700, fontSize: 11 }
      };
    });
    charts.mapChart.setOption({
      geo: {
        map: 'china', roam: true, zoom: 1.06, scaleLimit: { min: 0.8, max: 6 },
        regions: regions, label: { show: false },
        itemStyle: { areaColor: '#0e2138', borderColor: 'rgba(64,140,200,.55)', borderWidth: 0.8, shadowColor: 'rgba(0,60,120,.6)', shadowBlur: 12 },
        emphasis: { label: { show: true, color: '#eaf6ff', fontSize: 11 }, itemStyle: { areaColor: 'rgba(53,213,255,.28)' } }
      },
      tooltip: baseTooltip({
        formatter: function (p) {
          if (p.seriesType === 'effectScatter') return '<b>' + p.name + '</b><br/>枢纽节点 · 点击查看所属省份';
          var pv = PROV_MAP[p.name];
          if (!pv) return p.name + '<br/>本期无单量';
          return '<b>' + p.name + '</b><br/>运力指数 ' + pv.vol + ' · 准时率 ' + pv.otd + '%<br/><span style="color:#35d5ff">点击穿透到省级视图</span>';
        }
      }),
      series: [
        { name: '省份', type: 'map', map: 'china', geoIndex: 0, data: mapData.provinces.map(function (p) { return { name: p.name, value: p.vol }; }) },
        {
          name: '干线', type: 'lines', coordinateSystem: 'geo', zlevel: 2,
          effect: { show: true, period: 5, trailLength: 0.35, symbol: 'arrow', symbolSize: 4, color: '#bdf0ff' },
          data: routes
        },
        {
          name: '枢纽', type: 'effectScatter', coordinateSystem: 'geo', zlevel: 3,
          rippleEffect: { brushType: 'stroke', scale: 3 },
          symbolSize: function (v) { return v[2]; },
          itemStyle: { color: C.accent, shadowColor: 'rgba(53,213,255,.8)', shadowBlur: 8 },
          label: { show: false }, data: hubs
        }
      ]
    }, true);
    charts.mapChart.off('click');
    charts.mapChart.on('click', function (p) {
      if (p.seriesType === 'effectScatter') {
        var pv = mapData.hubProv[p.name];
        if (pv) { state.prov = pv; state.page = 1; loadAll('map'); }
        return;
      }
      if (PROV_MAP[p.name]) {
        state.prov = (state.prov === p.name) ? null : p.name;
        state.page = 1;
        loadAll('map');
      }
    });
    $('#mapHint').textContent = state.prov ? '当前：' + state.prov : '点击省份穿透';
  }

  /* ---------------- 省份排行 ---------------- */
  function renderProvBar(mapData) {
    var top = mapData.provinces.slice().sort(function (a, b) { return b.vol - a.vol; }).slice(0, 8).reverse();
    charts.provChart.setOption({
      grid: { left: 46, right: 30, top: 6, bottom: 6 },
      tooltip: baseTooltip({ formatter: function (p) { return p.name + ' · 运力指数 ' + p.value; } }),
      xAxis: Object.assign({ type: 'value', show: false }, AXIS),
      yAxis: Object.assign({ type: 'category', data: top.map(function (p) { return p.name; }) }, AXIS),
      series: [{
        type: 'bar', data: top.map(function (p) {
          return { value: p.vol, itemStyle: { color: state.prov === p.name ? C.amber : { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: 'rgba(53,213,255,.25)' }, { offset: 1, color: C.accent }] }, borderRadius: [0, 4, 4, 0] } };
        }),
        barWidth: 10,
        label: { show: true, position: 'right', color: C.ink3, fontSize: 10 }
      }]
    }, true);
    charts.provChart.off('click');
    charts.provChart.on('click', function (p) {
      state.prov = (state.prov === p.name) ? null : p.name;
      state.page = 1;
      loadAll('provbar');
    });
  }

  /* ---------------- 仪表盘 ---------------- */
  function renderGauges(core) {
    function gauge(name, val, max, center, color, unit) {
      var pct = Math.min(100, Math.max(0, val / max * 100));
      return {
        type: 'gauge', center: center, radius: '78%', startAngle: 210, endAngle: -30, min: 0, max: max,
        progress: { show: true, width: 8, itemStyle: { color: color } },
        axisLine: { lineStyle: { width: 8, color: [[1, 'rgba(80,140,200,.15)']] } },
        axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, pointer: { show: false },
        anchor: { show: false },
        title: { show: true, offsetCenter: [0, '38%'], color: C.ink3, fontSize: 10.5 },
        detail: { valueAnimation: true, offsetCenter: [0, '-2%'], formatter: function () { return val + (unit || ''); }, color: C.ink, fontSize: 17, fontWeight: 700 },
        data: [{ value: val, name: name }]
      };
    }
    var load = Math.min(99, 62 + ((META.provinces.find(function (p) { return p.name === state.prov; }) || { weight: 60 }).weight - 60) * 0.3 + (state.mode === '航空' ? 14 : 0) + (core.abnormal / Math.max(1, core.orders)) * 60);
    charts.gaugeChart.setOption({
      series: [
        gauge('准时率达成', +core.otd.toFixed(1), 100, ['17%', '56%'], core.otd >= core.goalOtd ? C.green : C.amber, '%'),
        gauge('网络负载', +load.toFixed(0), 100, ['50%', '56%'], load > 88 ? C.red : C.accent, '%'),
        gauge('仓储利用率', +core.ware.toFixed(1), 100, ['83%', '56%'], core.ware > 88 ? C.amber : C.violet, '%')
      ]
    }, true);
  }

  /* ---------------- 雷达 ---------------- */
  function renderRadar(radar) {
    charts.radarChart.setOption({
      tooltip: baseTooltip({}),
      legend: { data: ['当前视图', '全网基线'], textStyle: { color: C.ink3, fontSize: 10.5 }, top: 0, right: 4, itemWidth: 12 },
      radar: {
        indicator: [{ name: '时效', max: 100 }, { name: '成本', max: 100 }, { name: '履约', max: 100 }, { name: '绿色', max: 100 }, { name: '网络', max: 100 }, { name: '稳定', max: 100 }],
        radius: '66%', center: ['50%', '56%'],
        axisName: { color: C.ink3, fontSize: 10.5 },
        splitArea: { areaStyle: { color: ['rgba(53,213,255,.02)', 'rgba(53,213,255,.05)'] } },
        splitLine: { lineStyle: { color: 'rgba(80,140,200,.18)' } },
        axisLine: { lineStyle: { color: 'rgba(80,140,200,.18)' } }
      },
      series: [{
        type: 'radar',
        data: [
          { value: radar.cur, name: '当前视图', areaStyle: { color: 'rgba(53,213,255,.25)' }, lineStyle: { color: C.accent, width: 2 }, itemStyle: { color: C.accent } },
          { value: radar.base, name: '全网基线', areaStyle: { color: 'rgba(124,140,255,.12)' }, lineStyle: { color: C.violet, width: 1.5, type: 'dashed' }, itemStyle: { color: C.violet } }
        ]
      }]
    }, true);
  }

  /* ---------------- 预警 ---------------- */
  function renderAlerts(alerts) {
    $('#alertCount').textContent = alerts.length + ' 条';
    var list = $('#alertList');
    list.innerHTML = '';
    alerts.forEach(function (a) {
      var li = el('li', a.s, '<span class="dot"></span><div><div class="a-t">' + esc(a.t) + '</div><div class="a-g">' + esc(a.g) + ' · ' + esc(a.w) + '</div></div>');
      li.addEventListener('click', function () {
        openDrawer('预警处置建议', '<h4>' + esc(a.t) + '</h4><p><b>影响区域：</b>' + esc(a.g) + '　<b>关联方式：</b>' + esc(a.w) + '　<b>级别：</b>' + ({ high: '高', mid: '中', low: '低' })[a.s] + '</p><h4>处置建议</h4><p>' + esc(a.c) + '</p>');
      });
      list.appendChild(li);
    });
  }

  /* ---------------- AI 面板 ---------------- */
  function scoreDesc(s) { return s >= 90 ? '运行优秀，保持策略' : s >= 78 ? '运行良好，关注预警' : s >= 65 ? '存在瓶颈，建议干预' : '多处告警，需立即处置'; }
  function renderAI(ai) {
    $('#aiScore').textContent = ai.score;
    $('#aiScoreTxt').textContent = scoreDesc(ai.score);
    $('#aiScoreTxt').style.color = ai.score >= 78 ? C.green : ai.score >= 65 ? C.amber : C.red;
    var ul = $('#aiFindings');
    ul.innerHTML = '';
    ai.findings.forEach(function (f) {
      var li = el('li', f.s, icon(f.ic) + '<span><b style="color:' + C.ink + '">' + esc(f.t) + '</b><br/>' + esc(f.a) + '</span>');
      li.addEventListener('click', function () {
        openDrawer('AI 洞察详情', '<h4>' + esc(f.t) + '</h4><p>' + esc(f.p) + '</p><h4>建议动作</h4><p>' + esc(f.a) + '</p>');
      });
      ul.appendChild(li);
    });
  }
  function llmCfg() {
    return {
      base: localStorage.getItem('sl_ai_base') || '',
      key: localStorage.getItem('sl_ai_key') || '',
      model: localStorage.getItem('sl_ai_model') || ''
    };
  }
  function refreshAiTag() {
    var c = llmCfg();
    var local = !!(c.base && c.key && c.model);
    var server = D && D.ai && D.ai.engine === 'llm';
    var tag = $('#aiTag');
    if (local) { tag.textContent = '大模型 · 本机配置'; tag.classList.add('llm'); }
    else if (server) { tag.textContent = '大模型 · 服务端'; tag.classList.add('llm'); }
    else { tag.textContent = '本地规则引擎'; tag.classList.remove('llm'); }
  }
  async function aiPlan() {
    var c = llmCfg();
    var useLocal = !!(c.base && c.key && c.model);
    toast(useLocal ? '正在请求大模型生成决策建议…' : '本地规则引擎推理中…');
    try {
      var j = await api('/api/ai/advice', {
        method: 'POST',
        body: JSON.stringify({ filter: filterObj(), llm: useLocal ? c : undefined })
      });
      renderAI(j);
      if (j.llmText) {
        openDrawer('大模型决策建议', '<div class="ai-plan"><b>模型：</b>' + esc((useLocal ? c.model : '') || 'server-llm') + '</div><div class="ai-plan">' + esc(j.llmText).replace(/\n/g, '<br/>') + '</div>');
        toast('大模型建议已生成');
      } else if (j.llmError) {
        toast(j.llmError);
      } else {
        toast('本地规则引擎已生成 ' + j.findings.length + ' 条洞察（健康度 ' + j.score + '）');
      }
    } catch (e) {
      if (e.message !== 'UNAUTHORIZED') toast('AI 推理失败：' + e.message);
    }
  }

  /* ---------------- 运单表格 ---------------- */
  function renderTable(j) {
    var tb = $('#orderBody');
    tb.innerHTML = '';
    j.rows.forEach(function (r) {
      var tr = el('tr');
      tr.innerHTML = '<td>' + esc(r.id) + '</td><td>' + esc(r.route) + '</td><td>' + esc(r.mode) + '</td>' +
        '<td class="hide-sm">' + esc(r.prov) + '</td><td class="hide-sm">' + esc(r.cargo) + '</td>' +
        '<td><span class="st ' + esc(r.status) + '">' + esc(r.status) + '</span></td>' +
        '<td class="hide-sm">' + r.eta + '</td><td class="hide-md">' + fmt(r.cost) + '</td><td class="hide-md">' + r.carbon + '</td><td>' + esc(r.t) + '</td>';
      tr.addEventListener('click', function () {
        openDrawer('运单 ' + esc(r.id),
          '<h4>线路信息</h4><p>' + esc(r.route) + '　' + esc(r.mode) + '　' + esc(r.cargo) + '</p>' +
          '<h4>时效与成本</h4><table><thead><tr><th>指标</th><th>数值</th></tr></thead><tbody>' +
          '<tr><td>当前状态</td><td>' + esc(r.status) + '</td></tr>' +
          '<tr><td>端到端时效</td><td>' + r.eta + ' 小时</td></tr>' +
          '<tr><td>运费成本</td><td>¥' + fmt(r.cost) + '</td></tr>' +
          '<tr><td>碳排放</td><td>' + r.carbon + ' kg</td></tr>' +
          '<tr><td>发货日期</td><td>' + esc(r.t) + '</td></tr></tbody></table>' +
          (r.status === '异常滞留' ? '<h4>AI 提示</h4><p>该运单已触发滞留告警，建议优先联系承运商确认节点状态，必要时启用备用路由。</p>' : ''));
      });
      tb.appendChild(tr);
    });
    $('#tblInfo').textContent = '周期单量 ' + fmt(j.total) + ' · 共 ' + fmt(j.pages) + ' 页';
    $('#pgInfo').textContent = '第 ' + j.page + ' / ' + Math.max(1, j.pages) + ' 页';
    var chip = $('#provChip');
    if (state.prov) { chip.style.display = ''; $('#provChipName').textContent = state.prov; }
    else chip.style.display = 'none';
  }

  /* ---------------- 滚动播报 ---------------- */
  function renderTicker(d) {
    var lines = d.alerts.map(function (a) { return a.t; });
    lines.push('全网准时率 ' + d.core.otd + '% · 目标 ' + d.core.goalOtd + '%');
    lines.push('在途运单 ' + fmt(d.core.inTransit) + ' 票 · 平均时效 ' + d.core.avgHours + 'h');
    lines.push('AI 引擎持续监测本期 ' + fmt(d.core.orders) + ' 票运单');
    var html = lines.map(function (t, i) { return '<span><b>[' + ('0' + (i + 1)).slice(-2) + ']</b> ' + esc(t) + '</span>'; }).join('');
    $('#tickerTrack').innerHTML = html + html;
  }

  /* ---------------- 抽屉 / 弹窗 / 提示 ---------------- */
  function openDrawer(title, html) {
    $('#drawerTitle').textContent = title;
    $('#drawerBody').innerHTML = html;
    $('#drawer').classList.add('on');
    $('#mask').classList.add('on');
  }
  function closeDrawer() { $('#drawer').classList.remove('on'); $('#mask').classList.remove('on'); }
  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  /* ---------------- 时钟 ---------------- */
  function tickClock() {
    var d = new Date();
    var wd = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    $('#clock').textContent = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2) + ' ' +
      ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2) + ' 周' + wd;
  }

  /* ---------------- 图表实例 ---------------- */
  function mk(id) {
    var n = $('#' + id);
    charts[id] = echarts.init(n, null, { renderer: 'canvas' });
    return charts[id];
  }

  /* ---------------- 手机标签导航 ---------------- */
  function switchTab(key) {
    document.body.dataset.mtab = key;
    $$('#tabbar .tab').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === key); });
    window.scrollTo(0, 0);
    setTimeout(function () {
      Object.keys(charts).forEach(function (k) { try { charts[k].resize(); } catch (e) {} });
    }, 60);
  }

  /* ---------------- 多端互联与连接设置 ---------------- */
  async function openConnect() {
    var cur = serverBase();
    var html = '<h4>多端数据互通</h4>' +
      '<p>本系统为「一个服务端、多端共享」架构：电脑运行服务后，手机与电脑连同一 Wi-Fi，用手机浏览器或手机 APP 打开下方地址，即可看到与电脑完全一致的实时数据，无需额外同步。</p>' +
      '<div id="lanBox"></div>' +
      '<h4>服务器地址设置（APP / 跨网络时使用）</h4>' +
      '<input id="srvInput" class="drawer-input" placeholder="例如 http://192.168.1.8:3000 ，留空=当前地址" value="' + esc(cur) + '">' +
      '<div style="display:flex;gap:8px;margin-top:10px"><button class="btn mini" id="srvTest">测试连接</button>' +
      '<button class="btn primary mini" id="srvSave">保存并刷新</button></div>' +
      '<p class="dim" style="font-size:11px;margin-top:10px">提示：手机 APP 首次打开时，在「互联 → 服务器地址」填入电脑的局域网地址即可共享数据。</p>';
    openDrawer('多端互联与连接设置', html);
    $('#srvTest').addEventListener('click', async function () {
      var v = $('#srvInput').value.trim().replace(/\/$/, '');
      if (!v) { toast('已留空：将使用当前访问地址'); return; }
      try {
        var ctrl = new AbortController();
        var tt = setTimeout(function () { ctrl.abort(); }, 5000);
        var r = await fetch(v + '/api/health', { signal: ctrl.signal });
        clearTimeout(tt);
        var j = await r.json();
        toast(j.ok ? '连接成功：服务正常（数据 ' + j.rows + ' 行）' : '连接异常');
      } catch (e) { toast(e.name === 'AbortError' ? '连接超时：请核对地址与网络' : '连接失败：请检查地址与网络'); }
    });
    $('#srvSave').addEventListener('click', function () {
      var v = $('#srvInput').value.trim().replace(/\/$/, '');
      if (v) localStorage.setItem('sl_server', v); else localStorage.removeItem('sl_server');
      toast('已保存，正在刷新数据…');
      closeDrawer();
      state.page = 1;
      loadAll('server-change');
    });
    // 已配置服务地址时异步获取局域网访问地址，不阻塞抽屉弹出
    if (cur) {
      api('/api/health').then(function (h) {
        var box = $('#lanBox');
        if (box && h.lan && h.lan.length) {
          box.innerHTML = '<h4>手机访问地址（同一 Wi-Fi）</h4><p>' +
            h.lan.map(function (u) { return '<b style="color:var(--accent)">' + esc(u) + '</b>'; }).join('<br/>') + '</p>';
        }
      }).catch(function () {});
    }
  }

  /* ---------------- 登录 ---------------- */
  async function doLogin() {
    var msg = $('#loginMsg');
    msg.textContent = '';
    try {
      var r = await fetch(serverBase() + '/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: $('#loginUser').value.trim(), password: $('#loginPass').value })
      });
      var j = await r.json().catch(function () { return {}; });
      if (r.ok && j.token) {
        AUTH.token = j.token;
        sessionStorage.setItem('sl_token', j.token);
        $('#loginOverlay').classList.remove('on');
        boot();
      } else {
        msg.textContent = j.message || '登录失败';
      }
    } catch (e) { msg.textContent = '无法连接服务'; }
  }

  /* ---------------- 初始化 ---------------- */
  function bindOnce() {
    $$('.panel').forEach(function (p) {
      ['tl', 'tr', 'bl', 'br'].forEach(function (pos) { p.appendChild(el('i', 'cnr ' + pos)); });
    });
    var sel = $('#daySel');
    sel.addEventListener('change', function () { state.dayKey = sel.value; state.page = 1; loadAll('period'); });

    mk('trendChart'); mk('sunChart'); mk('modChart'); mk('mapChart'); mk('provChart'); mk('gaugeChart'); mk('radarChart');

    $('#resetMap').addEventListener('click', function () { state.prov = null; state.page = 1; loadAll('map'); });
    $('#provChip').addEventListener('click', function () { state.prov = null; state.page = 1; loadAll('chip'); });
    $('#tblReload').addEventListener('click', function () { loadAll('reload'); });
    $('#pgPrev').addEventListener('click', function () { if (state.page > 1) { state.page--; loadTable(); } });
    $('#pgNext').addEventListener('click', function () { state.page++; loadTable(); });

    $('#aiToggle').addEventListener('click', aiPlan);
    $('#btnAiPlan').addEventListener('click', aiPlan);
    var cfg = llmCfg();
    $('#aiBase').value = cfg.base; $('#aiKey').value = cfg.key; $('#aiModel').value = cfg.model;
    $('#btnAiSettings').addEventListener('click', function () { $('#aiModal').classList.add('on'); $('#mask').classList.add('on'); });
    $('#aiCancel').addEventListener('click', function () { $('#aiModal').classList.remove('on'); $('#mask').classList.remove('on'); });
    $('#aiSave').addEventListener('click', function () {
      localStorage.setItem('sl_ai_base', $('#aiBase').value.trim());
      localStorage.setItem('sl_ai_key', $('#aiKey').value.trim());
      localStorage.setItem('sl_ai_model', $('#aiModel').value.trim());
      $('#aiModal').classList.remove('on'); $('#mask').classList.remove('on');
      refreshAiTag();
      var c = llmCfg();
      var ok = !!(c.base && c.key && c.model);
      toast(ok ? '大模型配置已保存并启用' : '已保存（字段不完整，仍使用本地引擎）');
      if (ok) aiPlan();
    });
    $('#drawerClose').addEventListener('click', closeDrawer);
    $('#mask').addEventListener('click', function () { closeDrawer(); $('#aiModal').classList.remove('on'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeDrawer(); $('#aiModal').classList.remove('on'); } });

    $('#loginBtn').addEventListener('click', doLogin);
    $('#loginPass').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });

    $$('#tabbar .tab').forEach(function (b) { b.addEventListener('click', function () { switchTab(b.dataset.tab); }); });
    var bc = $('#btnConnect'); if (bc) bc.addEventListener('click', openConnect);

    var rz = null;
    window.addEventListener('resize', function () {
      if (rz) clearTimeout(rz);
      rz = setTimeout(function () { Object.keys(charts).forEach(function (k) { charts[k].resize(); }); }, 120);
    });
    // 弹性布局下容器尺寸变化（不触发 window resize），用 ResizeObserver 让图表跟随
    if (typeof ResizeObserver !== 'undefined') {
      var chartRO = new ResizeObserver(function (es) {
        es.forEach(function (en) {
          var id = en.target.getAttribute('id');
          if (id && charts[id]) { try { charts[id].resize(); } catch (e) {} }
        });
      });
      Object.keys(charts).forEach(function (k) { var n = $('#' + k); if (n) chartRO.observe(n); });
    }
  }

  function fillDaySel() {
    var sel = $('#daySel');
    META.dayOpts.forEach(function (d) { sel.appendChild(new Option(d.label, d.key)); });
    sel.value = state.dayKey;
  }

  var booted = false;
  async function boot() {
    // 先绑定全部交互，保证任何网络状态下按钮（含互联、底部标签）都可点
    if (!booted) { bindOnce(); booted = true; }
    // APP 壳未配置服务地址：直接引导设置，不发会挂起的请求
    if (IS_APP && !serverBase()) {
      setNet('bad');
      toast('请点击右上角「互联」设置电脑端服务地址');
      setTimeout(openConnect, 500);
      return;
    }
    setNet('loading');
    try { META = await api('/api/meta'); }
    catch (e) {
      if (e.message === 'UNAUTHORIZED') return;
      setNet('bad');
      if (IS_APP) {
        toast('连接失败：请点「互联」检查服务地址');
        setTimeout(openConnect, 500);
      } else {
        toast('无法连接数据服务，请确认后端已启动');
      }
      return;
    }
    fillDaySel();
    tickClock(); setInterval(tickClock, 1000);
    await loadAll('init');
  }

  /* ---------------- PWA Service Worker（localhost/HTTPS 下启用离线缓存） ---------------- */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].indexOf(location.hostname) >= 0)) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
