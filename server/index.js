/**
 * 星链智运 · 服务入口（v3：支持 SEA 单文件 EXE / 端口顺延 / 多端互联提示）
 */
'use strict';

/* ── SEA 自解压引导：打包为单文件 exe 时，将内嵌资源释放到临时目录 ── */
(function seaBootstrap() {
  try {
    const sea = require('node:sea');
    if (!sea.isSea || !sea.isSea()) return;
    const os = require('os'), fs = require('fs'), path = require('path');
    let assets = null;
    try { assets = require('./sea-assets.cjs'); } catch (e) { assets = null; }
    if (!assets) { console.error('[sea] 内嵌资源缺失'); return; }
    const runDir = path.join(os.tmpdir(), 'starlink-runtime-v3.1');
    // 清理上一大版本的旧缓存目录，避免误用旧资源
    try { fs.rmSync(path.join(os.tmpdir(), 'starlink-runtime-v3'), { recursive: true, force: true }); } catch (e) {}
    Object.keys(assets).forEach(rel => {
      const dst = path.join(runDir, rel);
      if (fs.existsSync(dst)) return;
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, Buffer.from(assets[rel], 'base64'));
    });
    const exeDir = path.dirname(process.execPath);
    process.env.SEA_EXE_DIR = exeDir;
    process.env.PUBLIC_DIR = path.join(runDir, 'public');
    // 优先使用 exe 同级 data 目录（方便用户替换真实数据），否则用内嵌演示数据
    const extData = path.join(exeDir, 'data');
    if (!process.env.DATA_DIR) {
      process.env.DATA_DIR = fs.existsSync(path.join(extData, 'shipments.csv')) ? extData : path.join(runDir, 'data');
    }
  } catch (e) { /* 非 SEA 运行，忽略 */ }
})();

require('dotenv').config(process.env.SEA_EXE_DIR
  ? { path: require('path').join(process.env.SEA_EXE_DIR, '.env') } : {});

const path = require('path');
const os = require('os');
const express = require('express');
const compression = require('compression');

const app = express();
const PORT = +(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(__dirname, '..', 'public');

/* 安全响应头（无 helmet 依赖的轻量实现） */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
/* CORS：允许手机 APP（file:// / capacitor 本地域）与局域网页面跨域调用 API */
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(compression());
app.use(express.json({ limit: '256kb' }));

/* API */
app.use('/api', require('./routes/api'));

/* 404 for API */
app.use('/api', (req, res) => res.status(404).json({ error: 'NOT_FOUND' }));

/* API 错误兜底 */
app.use('/api', (err, req, res, next) => {
  console.error('[api-error]', err);
  res.status(500).json({ error: 'INTERNAL', message: '服务内部错误' });
});

/* 静态前端 */
app.use(express.static(PUBLIC_DIR, {
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0
}));

/* SPA 回退（Express 4/5 兼容：不用通配路由） */
app.use((req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

/* 局域网地址（用于多端互联提示） */
function lanUrls(port) {
  const out = [];
  const ifaces = os.networkInterfaces();
  Object.keys(ifaces).forEach(k => (ifaces[k] || []).forEach(a => {
    if (a.family === 'IPv4' && !a.internal) out.push('http://' + a.address + ':' + port);
  }));
  return out;
}

function banner(port) {
  console.log('==============================================');
  console.log('  星链智运 · 智慧物流 AI 决策大屏 v3.0');
  console.log('  电脑访问:  http://localhost:' + port);
  lanUrls(port).forEach(u => console.log('  手机访问:  ' + u + '  (同一 Wi-Fi)'));
  console.log('  登录鉴权:  ' + (process.env.AUTH_ENABLED === 'true' ? '已启用' : '未启用'));
  console.log('  大模型:    ' + (require('./services/aiService').llmConfigured() ? '已配置' : '本地规则引擎'));
  console.log('==============================================');
}

/* 端口占用自动顺延（3000→3005 以内） */
function listen(port, tries) {
  const srv = app.listen(port, HOST);
  srv.on('error', (e) => {
    if (e.code === 'EADDRINUSE' && tries < 5) {
      console.log('端口 ' + port + ' 被占用，自动尝试 ' + (port + 1) + ' …');
      listen(port + 1, tries + 1);
    } else {
      console.error('启动失败：' + e.message);
      process.exit(1);
    }
  });
  srv.on('listening', () => {
    const p = srv.address().port;
    banner(p);
    /* Windows 单文件版：启动后自动打开浏览器 */
    if (process.platform === 'win32' && process.env.SEA_EXE_DIR) {
      try { require('child_process').exec('start "" "http://localhost:' + p + '"'); } catch (e) { }
    }
  });
}

listen(PORT, 0);
