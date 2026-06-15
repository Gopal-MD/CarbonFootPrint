import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`));
  page.on('pageerror', error => console.log(`[Browser Error]: ${error.message}`));
  
  console.log('Loading page...');
  await page.goto('https://carbonfootprint-984604014815.asia-south1.run.app/');
  
  console.log('Page loaded, waiting 2 seconds...');
  await page.waitForTimeout(2000);
  
  await browser.close();
})();
