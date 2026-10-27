import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const phase = process.argv[2] || 'after';
const dir = `docs/ux-review/${phase}`;
await mkdir(dir, { recursive: true });
const browser = await chromium.launch();
for (const width of [320, 375, 390, 430, 768]) {
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  await page.goto('http://127.0.0.1:4173/wrx-ble-controller/');
  await page.screenshot({ path: `${dir}/main-${width}-top.png` });
  await page.screenshot({ path: `${dir}/main-${width}-full.png`, fullPage: true });
  if (phase === 'after') {
    for (const [name, hash] of [['main', 'home'], ['development', 'development'], ['calibration', 'calibration']]) {
      if (hash !== 'home') await page.goto(`http://127.0.0.1:4173/wrx-ble-controller/#${hash}`);
      for (const [position, fraction] of [['top', 0], ['middle', .5], ['bottom', 1]]) {
        await page.evaluate(fraction => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * fraction), fraction);
        await page.screenshot({ path: `${dir}/${name}-${width}-${position}.png` });
      }
    }
  }
  await page.close();
}
await browser.close();
console.log(`Saved ${phase} screenshots to ${dir}`);
