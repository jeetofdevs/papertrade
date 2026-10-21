import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const dir = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [n, w, h] of [['mystery-banner', 1500, 500], ['tease-1', 1200, 675], ['tease-2', 1200, 675], ['tease-3', 1200, 675]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await p.goto(`file://${dir}/${n}.html`);
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${dir}/x-${n}@2x.png` });
}
await b.close();
