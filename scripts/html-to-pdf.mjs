import { chromium } from '/Users/t_xiao/.claude/skills/gstack/node_modules/playwright-core/index.mjs';
import { existsSync } from 'fs';
import { resolve } from 'path';

const htmlPath = resolve(process.argv[2] || 'PLAN_JP.html');
const pdfPath = resolve(process.argv[3] || 'PLAN_JP.pdf');

if (!existsSync(htmlPath)) {
  console.error(`File not found: ${htmlPath}`);
  process.exit(1);
}

// Find Chromium from gstack's browse
const browsersJson = '/Users/t_xiao/.claude/skills/gstack/node_modules/playwright-core/browsers.json';
const chromiumPath = '/Users/t_xiao/Library/Caches/ms-playwright';

let execPath;
const fs = await import('fs');
const dirs = fs.readdirSync(chromiumPath).filter(d => d.startsWith('chromium'));
if (dirs.length > 0) {
  const chromiumDir = resolve(chromiumPath, dirs.sort().pop());
  const candidates = [
    resolve(chromiumDir, 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'),
    resolve(chromiumDir, 'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium'),
  ];
  execPath = candidates.find(p => existsSync(p));
}

if (!execPath) {
  console.error('Chromium not found. Trying system Chrome...');
  execPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
}

console.log(`Using browser: ${execPath}`);

const browser = await chromium.launch({
  executablePath: execPath,
  headless: true,
});

const page = await browser.newPage();
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });

await page.pdf({
  path: pdfPath,
  format: 'A4',
  margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' },
  printBackground: true,
});

console.log(`PDF saved: ${pdfPath}`);
await browser.close();
