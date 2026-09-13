import { test, expect } from '@playwright/test';

test('all categories generate a topic, study material and selected speech length', async ({ page }) => {
  for(const [index,category] of ['会计','人工智能','计算机','自然','人力资源'].entries()) {
    await page.goto('/');
    await page.evaluate(()=>localStorage.clear());
    await page.reload();
    await page.getByRole('button',{name:new RegExp(category)}).click();
    await page.getByRole('button',{name:'抽取今日关键词'}).click();
    await expect(page.getByRole('button',{name:'准备研究材料'})).toBeVisible();
    await page.getByRole('button',{name:'准备研究材料'}).click();
    await expect(page.getByRole('timer')).toHaveText('10:00');
    await page.waitForTimeout(1100);
    await expect(page.getByRole('timer')).toHaveText('10:00');
    await page.getByRole('button',{name:'开始研究',exact:true}).click();
    await expect(page.getByRole('button',{name:'暂停',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'暂停',exact:true}).click();
    const time = await page.getByRole('timer').textContent();
    await page.reload();
    await expect(page.getByRole('timer')).toHaveText(time!);
    await expect(page.getByRole('button',{name:'继续',exact:true})).toBeVisible();
    const minutes = 3+index%3;
    await page.getByRole('button',{name:`${minutes} 分钟`,exact:true}).click();
    await page.getByRole('button',{name:'我理解了，准备开讲'}).click();
    await expect(page.getByRole('timer')).toHaveText(`0${minutes}:00`);
    await page.getByRole('button',{name:'提纲',exact:true}).click();
    await expect(page.locator('.outline')).toBeVisible();
    await page.getByRole('button',{name:'隐藏',exact:true}).click();
    await expect(page.getByText('现在，是你的声音。')).toBeVisible();
    await page.getByRole('button',{name:'全文',exact:true}).click();
    await expect(page.locator('.script-paragraph').first()).toBeVisible();
    await page.getByRole('button',{name:'开始讲解',exact:true}).click();
    await page.evaluate(()=>{ const k='daily-speaking-v1'; const s=JSON.parse(localStorage.getItem(k)!);s.session.timer.deadline=Date.now()-1000;localStorage.setItem(k,JSON.stringify(s)); });
    await page.reload();
    await expect(page.getByText('又多了一点，')).toBeVisible();
    await page.getByRole('button',{name:/练习足迹/}).first().click();
    await expect(page.locator('.history-list li')).toHaveCount(1);
    await page.getByRole('button',{name:'关闭练习足迹'}).click();
    await page.reload();
    await page.getByRole('button',{name:/练习足迹/}).first().click();
    await expect(page.locator('.history-list li')).toHaveCount(1);
  }
});

test('failed generation retains topic and allows retry; research expiration does not navigate',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'抽取今日关键词'}).click();
  await page.route('**/api/research',route=>route.fulfill({status:504,contentType:'application/json',body:JSON.stringify({error:'生成超时，请重试。'})}));
  await page.getByRole('button',{name:'准备研究材料'}).click();
  await expect(page.locator('.error-message[role="alert"]')).toContainText('生成超时');
  await expect(page.getByRole('button',{name:'准备研究材料'})).toBeEnabled();
  await page.unroute('**/api/research');
  await page.getByRole('button',{name:'准备研究材料'}).click();
  await page.getByRole('button',{name:'开始研究',exact:true}).click();
  await page.evaluate(()=>{const k='daily-speaking-v1';const s=JSON.parse(localStorage.getItem(k)!);s.session.timer.deadline=Date.now()-1;localStorage.setItem(k,JSON.stringify(s));});
  await page.reload();
  await expect(page.getByRole('timer')).toHaveText('00:00');
  await expect(page.getByRole('button',{name:'生成讲解稿'})).toBeVisible();
  await expect(page.getByText('十分钟研究笔记')).toBeVisible();
});

test('mobile layout and desktop screenshot',async({page})=>{
  await page.setViewportSize({width:1440,height:1050});await page.goto('/');
  await expect(page.getByRole('button',{name:'抽取今日关键词'})).toBeVisible();
  await page.screenshot({path:'preview-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'preview-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'抽取今日关键词'}).click();
  await page.getByRole('button',{name:'准备研究材料'}).click();
  await expect(page.getByRole('timer')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
