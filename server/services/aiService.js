/**
 * 星链智运 · AI 决策服务
 * - 本地规则引擎：基于核心指标阈值生成洞察与健康度评分（离线可用）
 * - 大模型代理：服务端持有密钥（.env），浏览器永不接触；
 *   也支持前端弹窗传入的临时配置（用户自有 Key，仅存其浏览器 localStorage）
 */
'use strict';
const ds = require('./dataService');

/* ---------------- 健康度评分 ---------------- */
function healthScore(core, f) {
  let s = 100;
  s -= Math.max(0, (core.goalOtd - core.otd)) * 3.2;
  const load = loadEstimate(core, f);
  s -= Math.max(0, load - 82) * 0.9;
  s -= Math.max(0, core.costPer - 1300) * 0.03;   // 单均成本超 ¥1300 起扣（数据均值约 ¥1210）
  s -= Math.max(0, core.ware - 86) * 0.8;
  s -= Math.max(0, (core.carbon / Math.max(1, core.orders)) - 280) * 0.08; // 单均碳排超 280kg 起扣
  s -= Math.min(6, (core.abnormal / Math.max(1, core.orders)) * 120);
  return Math.round(Math.max(42, Math.min(99, s)));
}
function loadEstimate(core, f) {
  const provW = f.prov ? ((ds.provDim.find(p => p.name === f.prov) || {}).weight || 50) : 60;
  return Math.min(99, 62 + (provW - 60) * 0.3 + (f.mode === '航空' ? 14 : 0) + (core.abnormal / Math.max(1, core.orders)) * 60);
}

/* ---------------- 规则引擎洞察 ---------------- */
function buildFindings(core, f) {
  const out = [];
  const scope = f.prov || '全网';
  if (core.otd < core.goalOtd - 1.5) {
    out.push({ s: 'high', ic: 'timer', t: scope + '准时交付率低于目标 ' + (core.goalOtd - core.otd).toFixed(1) + 'pct', p: '当前 ' + core.otd.toFixed(1) + '%，目标 ' + core.goalOtd + '%。主要拖累来自干线拥堵与末端波峰错配。', a: '建议对 Top3 延误走廊启用动态路由，并将 8% 公路货量切换至铁路快运。' });
  }
  const load = loadEstimate(core, f);
  if (load > 85) {
    out.push({ s: 'high', ic: 'gauge', t: '运力负载 ' + load.toFixed(0) + '% 接近饱和', p: '高峰时段枢纽分拨产能趋紧，继续上行将推高滞留风险。', a: '建议提前 2 小时开启夜间作业班次，并锁定 48h 内增补运力合同。' });
  }
  const abnRate = core.abnormal / Math.max(1, core.orders) * 100;
  if (abnRate > 6) {
    out.push({ s: 'high', ic: 'triangle-alert', t: '异常滞留率 ' + abnRate.toFixed(1) + '% 偏高（' + core.abnormal + ' 票）', p: '滞留集中在少数走廊，存在时效连锁违约风险。', a: '建议对滞留运单逐票排查，优先转运时效敏感货类，并同步客服预案。' });
  }
  if (core.deltaCost > 2) {
    out.push({ s: 'mid', ic: 'container', t: '单均成本环比上涨 ' + core.deltaCost.toFixed(1) + '%', p: '当前 ¥' + core.costPer.toFixed(1) + '/单，航空占比与回程空驶是主因。', a: '建议合并低满载班次，回程货源匹配可降本约 6%。' });
  }
  if (core.ware > 88) {
    out.push({ s: 'mid', ic: 'warehouse', t: '仓储利用率 ' + core.ware.toFixed(1) + '% 偏高', p: '库内周转放缓，存在爆仓与拣货效率下降风险。', a: '建议启动邻近卫星仓分流 12% 库存，并加开夜间出库波次。' });
  }
  const carbonPer = core.carbon / Math.max(1, core.orders);
  if (carbonPer > 280) {
    out.push({ s: 'low', ic: 'ship', t: '单均碳排 ' + carbonPer.toFixed(1) + 'kg 高于绿色目标', p: '航空与高排放公路段占比上升。', a: '建议将时效宽松订单导流至铁路/水运，预计碳排下降 18%。' });
  }
  if (f.prov) {
    const pv = (ds.computeMap(f).provinces.find(p => p.name === f.prov) || {});
    if (pv.otd && pv.otd < 85) {
      out.push({ s: 'mid', ic: 'map-pin', t: f.prov + '区域准时率 ' + pv.otd + '% 低于全国均值', p: '网络密度与末端覆盖不足。', a: '建议增设 1 个前置仓并引入众包运力补充末端。' });
    }
  }
  if (!out.length) {
    out.push({ s: 'low', ic: 'circle-check', t: scope + '运行健康，指标均在目标区间', p: '时效、成本、负载、碳排四项核心指标全部达标。', a: '维持当前调度策略；AI 将持续扫描异常信号。' });
  }
  const rank = { high: 0, mid: 1, low: 2 };
  return out.sort((a, b) => rank[a.s] - rank[b.s]).slice(0, 4);
}

/* ---------------- 大模型代理 ---------------- */
function llmEnvCfg() {
  const base = (process.env.LLM_BASE || '').replace(/\/$/, '');
  return { base, key: process.env.LLM_KEY || '', model: process.env.LLM_MODEL || '' };
}
function llmConfigured() {
  const c = llmEnvCfg();
  return !!(c.base && c.key && c.model);
}

/**
 * 生成建议。优先使用 .env 服务端配置；否则使用请求体里用户自带的配置。
 * 返回 { engine, score, findings, llmText? }
 */
async function advice(f, clientCfg) {
  const core = ds.computeCore(f);
  const score = healthScore(core, f);
  const findings = buildFindings(core, f);
  const env = llmEnvCfg();
  const cfg = (env.base && env.key && env.model) ? env
    : (clientCfg && clientCfg.base && clientCfg.key && clientCfg.model)
      ? { base: String(clientCfg.base).replace(/\/$/, ''), key: String(clientCfg.key), model: String(clientCfg.model) }
      : null;

  const result = { engine: cfg ? 'llm' : 'local', score, findings, core };
  if (!cfg) return result;

  const body = {
    model: cfg.model,
    messages: [
      { role: 'system', content: '你是物流网络调度专家，用简体中文给出 3 条以内可执行建议，每条不超过 40 字。' },
      {
        role: 'user',
        content: '当前视图：' + (f.prov || '全国') + (f.mode ? '，方式：' + f.mode : '') + (f.cargo ? '，货类：' + f.cargo : '') +
          '。统计周期 ' + f.day + '。总单量 ' + core.orders + '，准时率 ' + core.otd.toFixed(1) + '%（目标 ' + core.goalOtd + '%），单均成本 ¥' +
          core.costPer.toFixed(1) + '，仓储利用率 ' + core.ware.toFixed(1) + '%，平均时效 ' + core.avgHours.toFixed(1) +
          'h，异常滞留 ' + core.abnormal + ' 票。请给出调度优化建议。'
      }
    ],
    temperature: 0.3
  };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const r = await fetch(cfg.base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    clearTimeout(timer);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const txt = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!txt) throw new Error('empty');
    result.llmText = txt;
  } catch (e) {
    result.engine = 'local';
    result.llmError = '大模型请求失败，已回退本地规则引擎（' + e.message + '）';
  }
  return result;
}

module.exports = { healthScore, buildFindings, advice, llmConfigured };
