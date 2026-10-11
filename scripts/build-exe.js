#!/usr/bin/env node
/**
 * 星链智运 · 构建 Windows 单文件 EXE（Node.js SEA 方案）
 * 方案：资源 base64 内嵌进 esbuild 单文件 bundle → SEA blob → postject 注入 node.exe
 * 产物：dist/星链智运-决策大屏-v3.0.exe（免安装绿色软件，双击即运行）
 * 用法：node scripts/build-exe.js [node-win-x64 解压目录]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BUILD = path.join(ROOT, 'build');
const DIST = path.join(ROOT, 'dist');
const NODE_WIN_DIR = process.argv[2] || '/mnt/work/node-win/node-v20.20.2-win-x64';
const NODE_EXE = path.join(NODE_WIN_DIR, 'node.exe');
const log = (s) => console.log('[build-exe] ' + s);

/* ---------- 1. 收集资源（public/ + data/）并生成 base64 内嵌表 ---------- */
log('收集内嵌资源（public/ + data/）…');
const files = [];
function walk(dir, base) {
  fs.readdirSync(dir).forEach(name => {
    const full = path.join(dir, name);
    const rel = base + '/' + name;
    if (fs.statSync(full).isDirectory()) walk(full, rel);
    else files.push(rel);
  });
}
walk(path.join(ROOT, 'public'), 'public');
walk(path.join(ROOT, 'data'), 'data');
log('资源文件 ' + files.length + ' 个');

const lines = files.map(rel =>
  '  ' + JSON.stringify(rel) + ': ' + JSON.stringify(fs.readFileSync(path.join(ROOT, rel)).toString('base64'))
);
fs.writeFileSync(
  path.join(ROOT, 'server', 'sea-assets.cjs'),
  "'use strict';\n/* 构建产物（勿手改）：内嵌资源 base64 表，由 scripts/build-exe.js 生成 */\nmodule.exports = {\n" + lines.join(',\n') + '\n};\n'
);
log('server/sea-assets.cjs 已生成');

/* ---------- 2. esbuild 打包服务端（含依赖 + 内嵌资源） ---------- */
log('esbuild 打包 server → build/sea-bundle.cjs …');
fs.mkdirSync(BUILD, { recursive: true });
execSync('npx esbuild server/index.js --bundle --platform=node --format=cjs --target=node20 --outfile=build/sea-bundle.cjs --log-level=warning', { cwd: ROOT, stdio: 'inherit' });

/* ---------- 3. SEA 配置与 blob ---------- */
const seaCfg = {
  main: 'build/sea-bundle.cjs',
  output: 'build/sea-prep.blob',
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false
};
fs.writeFileSync(path.join(ROOT, 'sea-config.json'), JSON.stringify(seaCfg, null, 2));
log('生成 SEA blob …');
execSync('node --experimental-sea-config sea-config.json', { cwd: ROOT, stdio: 'inherit' });

/* ---------- 4. 拷贝 Windows node.exe ---------- */
if (!fs.existsSync(NODE_EXE)) {
  console.error('[build-exe] 找不到 Windows node.exe：' + NODE_EXE);
  console.error('请传入 node-win-x64 解压目录作为参数');
  process.exit(1);
}
log('拷贝 node.exe …');
fs.mkdirSync(DIST, { recursive: true });
const OUT_EXE = path.join(DIST, '星链智运-决策大屏-v3.0.exe');
fs.copyFileSync(NODE_EXE, OUT_EXE);

/* ---------- 5. postject 注入 SEA blob ---------- */
log('postject 注入 SEA blob …');
execSync('npx postject "' + OUT_EXE + '" NODE_SEA_BLOB build/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --overwrite', { cwd: ROOT, stdio: 'inherit' });

/* ---------- 6. 校验：blob 哨兵必须存在于成品中 ---------- */
const buf = fs.readFileSync(OUT_EXE);
if (buf.indexOf('NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2') < 0) {
  console.error('[build-exe] 校验失败：成品中未找到 SEA 哨兵，注入可能未生效');
  process.exit(1);
}
const st = fs.statSync(OUT_EXE);
log('✅ EXE 构建完成：' + OUT_EXE);
log('   大小：' + (st.size / 1048576).toFixed(1) + ' MB');
log('   说明：双击即可运行（内嵌演示数据）；在 exe 同级放置 .env 与 data/ 可覆盖配置与数据');
