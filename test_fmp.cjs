const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Navigate to the app
  await page.goto('http://localhost:5178');
  await page.waitForLoadState('networkidle');
  
  // Fill in the questionnaire - click option 4 for all 5 questions (max risk)
  for (let i = 0; i < 4; i++) {
    const btns = await page.locator('.option-btn').all();
    if (btns[i+1]) await btns[i+1].click();
    await page.waitForTimeout(100);
  }
  
  // Click the proceed button
  await page.click('button:has-text("进入市场分析")');
  await page.waitForTimeout(500);
  
  // Click optimization button  
  await page.click('button:has-text("开始组合优化")');
  await page.waitForTimeout(2500);
  
  // Capture console logs
  page.on('console', msg => console.log('CONSOLE:', msg.text()));
  
  // Check the content
  const content = await page.content();
  
  if (content.includes('3.2%') && content.includes('2.4%')) {
    console.log('✅ SUCCESS: 宏观数据显示正常');
    console.log('CPI=3.2%, GDP=2.4%, Fed=4.50%');
  } else if (content.includes('--%')) {
    console.log('❌ FAILED: 宏观数据未显示 (--%)');
  } else {
    console.log('状态: 需要人工检查页面');
  }
  
  await browser.close();
  process.exit(0);
})();
