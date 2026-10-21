import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const dir = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [n, w, h] of [['pfp', 400, 400], ['banner', 1500, 500]]) {
  for (const scale of [1, 2]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
    await p.goto(`file://${dir}/${n}.html`);
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${dir}/x-${n}${scale === 2 ? '@2x' : ''}.png` });
  }
}
await b.close();
