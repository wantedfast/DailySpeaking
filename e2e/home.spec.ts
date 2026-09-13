import { test, expect } from '@playwright/test';

test('brand returns to home, persists that choice and preserves history',async({page})=>{
  await page.goto('/');
  await page.evaluate(()=>{
    localStorage.setItem('daily-speaking-v1',JSON.stringify({
      session:{id:'active',category:'hr',topic:{word:'绩效评估',intro:'测试'},research:{sections:[{title:'核心定义',body:'研究材料'}],questions:[]},speech:null,minutes:3,stage:'research',timer:{remaining:600000,deadline:Date.now()+600000,started:true}},
      records:[{id:'previous',word:'员工激励',category:'hr',minutes:3,date:'2026-09-13T00:00:00Z'}],words:['绩效评估']
    }));
  });
  await page.reload();
  await expect(page.getByRole('timer')).toBeVisible();
  await page.getByRole('link',{name:'每日开讲首页'}).click();
  await expect(page.getByRole('button',{name:'抽取今日关键词'})).toBeVisible();
  await expect(page.getByRole('timer')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button',{name:'抽取今日关键词'})).toBeVisible();
  await page.getByRole('button',{name:/练习足迹/}).click();
  await expect(page.locator('.history-list')).toContainText('员工激励');
});

test('brand cancels pending generation without navigating back on late completion',async({page})=>{
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/topic',async route=>{await gate;await route.fulfill({json:{word:'旧结果',intro:'应被忽略'}}).catch(()=>{});});
  await page.goto('/');
  await page.getByRole('button',{name:'抽取今日关键词'}).click();
  await expect(page.locator('.request-status')).toBeVisible();
  await page.getByRole('link',{name:'每日开讲首页'}).click();
  release();
  await expect(page.getByRole('button',{name:'抽取今日关键词'})).toBeEnabled();
  await expect(page.locator('.request-status')).toHaveCount(0);
  await page.waitForTimeout(300);
  await expect(page.getByRole('button',{name:'准备研究材料'})).toHaveCount(0);
  await expect(page.locator('.error-message')).toHaveCount(0);
});
