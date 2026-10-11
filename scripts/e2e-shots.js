const puppeteer = require('/usr/lib/node_modules/puppeteer');

(async () => {
  const errors = [];
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--font-render-hinting=none']
  });

  async function shoot(label, vp) {
    const page = await browser.newPage();
    page.on('console', m => { if (m.type() === 'error') errors.push(`[${label} console] ${m.text()}`); });
    page.on('pageerror', e => errors.push(`[${label} pageerror] ${e.message}`));
    page.on('requestfailed', r => errors.push(`[${label} reqfail] ${r.url()} ${r.failure() && r.failure().errorText}`));
    await page.setViewport(vp);
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0', timeout: 45000 });
    await page.waitForFunction(() => {
      const k = document.getElementById('kOrders');
      return k && k.textContent.trim() !== '--';
    }, { timeout: 20000 }).catch(() => errors.push(`[${label}] KPI 未渲染`));
    await new Promise(r => setTimeout(r, 3500)); // 等图表动画/地图
    const stats = await page.evaluate(() => {
      const charts = Array.from(document.querySelectorAll('.chart')).map(c => ({
        id: c.id, canvas: c.querySelectorAll('canvas').length
      }));
      return {
        kOrders: document.getElementById('kOrders').textContent,
        kOtd: document.getElementById('kOtd').textContent,
        kCost: document.getElementById('kCost').textContent,
        aiScore: document.getElementById('aiScore').textContent,
        aiTag: document.getElementById('aiTag').textContent,
        alertCount: document.getElementById('alertCount').textContent,
        tblInfo: document.getElementById('tblInfo').textContent,
        tableRows: document.querySelectorAll('#orderBody tr').length,
        dayOpts: document.getElementById('daySel').options.length,
        charts,
        bodyH: document.body.scrollHeight,
        scrollW: document.documentElement.scrollWidth,
        viewW: window.innerWidth,
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 2
      };
    });
    const file = `/mnt/work/shot-${label}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(`=== ${label} (${vp.width}x${vp.height}${vp.isMobile ? ' mobile' : ''}) ===`);
    console.log(JSON.stringify(stats, null, 1));
    await page.close();
    return stats;
  }

  const desk = await shoot('desktop', { width: 1920, height: 1080, deviceScaleFactor: 1 });
  const mob = await shoot('mobile', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  await browser.close();
  console.log('=== ERRORS (' + errors.length + ') ===');
  errors.slice(0, 20).forEach(e => console.log(e));
  console.log(errors.length === 0 && !desk.overflowX && !mob.overflowX ? 'E2E_PASS' : 'E2E_CHECK_NEEDED');
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
