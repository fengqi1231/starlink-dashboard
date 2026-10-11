/**
 * 星链智运 · REST API 路由
 */
'use strict';
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const ds = require('../services/dataService');
const ai = require('../services/aiService');

const router = express.Router();

/* ---------------- 配置 ---------------- */
const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true';
const JWT_SECRET = process.env.JWT_SECRET || 'starlink-dev-secret-change-me';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
// 支持明文（开发）或 bcrypt 哈希（生产）
const ADMIN_PASS_HASH = process.env.ADMIN_PASS_HASH || '';

function verifyPassword(plain) {
  if (ADMIN_PASS_HASH) return bcrypt.compareSync(plain, ADMIN_PASS_HASH);
  return plain === (process.env.ADMIN_PASS || 'admin123');
}

/* ---------------- 鉴权中间件（默认关闭，.env 开启） ---------------- */
function authGuard(req, res, next) {
  if (!AUTH_ENABLED) return next();
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'UNAUTHORIZED', message: '需要登录' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: '登录已过期' });
  }
}

/* ---------------- 简单限流（AI 接口） ---------------- */
const buckets = new Map();
function rateLimit(maxPerMin) {
  return (req, res, next) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || now - b.start > 60000) { b = { start: now, n: 0 }; buckets.set(key, b); }
    if (++b.n > maxPerMin) return res.status(429).json({ error: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' });
    next();
  };
}

/* ---------------- 健康检查（无需鉴权） ---------------- */
router.get('/health', (req, res) => {
  const port = req.socket.localPort;
  const ifaces = require('os').networkInterfaces();
  const lan = [];
  Object.keys(ifaces).forEach(k => (ifaces[k] || []).forEach(a => {
    if (a.family === 'IPv4' && !a.internal) lan.push('http://' + a.address + ':' + port);
  }));
  res.json({
    ok: true,
    lan,
    app: '星链智运 · 智慧物流 AI 决策大屏',
    version: require('../../package.json').version,
    rows: ds.shipments.length,
    range: { min: ds.MIN_DATE, max: ds.MAX_DATE },
    auth: AUTH_ENABLED,
    llm: ai.llmConfigured(),
    uptime: Math.round(process.uptime())
  });
});

/* ---------------- 登录 ---------------- */
router.post('/auth/login', rateLimit(10), (req, res) => {
  if (!AUTH_ENABLED) return res.json({ token: null, user: 'guest', message: '鉴权未启用' });
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && verifyPassword(String(password || ''))) {
    const token = jwt.sign({ sub: username, role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
    return res.json({ token, user: username });
  }
  res.status(401).json({ error: 'BAD_CREDENTIALS', message: '用户名或密码错误' });
});

/* ---------------- 元数据 ---------------- */
router.get('/meta', authGuard, (req, res) => res.json(ds.meta()));

/* ---------------- 大屏总览（一次取齐全部组件数据） ---------------- */
router.get('/overview', authGuard, (req, res) => {
  const f = ds.normFilter(req.query || {});
  const core = ds.computeCore(f);
  res.json({
    filter: f,
    core,
    trend: ds.computeTrend(f, core),
    map: ds.computeMap(f),
    modality: ds.computeModality(f),
    cargos: ds.computeCargos(f),
    radar: ds.computeRadar(f, core),
    alerts: ds.computeAlerts(f, core),
    ai: { score: ai.healthScore(core, f), findings: ai.buildFindings(core, f), engine: ai.llmConfigured() ? 'llm' : 'local' }
  });
});

/* ---------------- 运单分页 ---------------- */
router.get('/shipments', authGuard, (req, res) => {
  const f = ds.normFilter(req.query || {});
  res.json(ds.queryShipments(f, req.query.page, req.query.size));
});

/* ---------------- AI 决策建议（规则引擎 + 可选大模型代理） ---------------- */
router.post('/ai/advice', authGuard, rateLimit(30), async (req, res) => {
  const f = ds.normFilter((req.body && req.body.filter) || {});
  const cfg = req.body && req.body.llm;
  const out = await ai.advice(f, cfg);
  res.json(out);
});

module.exports = router;
