'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { launchDesktop } = require('./launch.cjs');
const root = path.resolve(__dirname, '..');
const packaged = process.argv.includes('--packaged');
const override = process.argv.indexOf('--executable');
const executablePath = override >= 0 ? process.argv[override + 1] : packaged ? path.join(root, 'dist/win-unpacked/MoaonPreview.exe') : require('electron');

async function main() {
  const app = await launchDesktop({ root, executablePath, packaged, override });
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    // Missing keyboard navigation must leave us on Today and fail this assertion.
    await page.keyboard.press('Alt+2');
    assert.equal(await page.locator('[data-page="orders"]').isVisible(), true, 'Alt+2 opens orders');
    const collapse = page.getByRole('button', { name: '메뉴 접기', exact: true });
    const width = (await page.locator('.sidebar').boundingBox()).width;
    await collapse.click();
    assert.equal(await page.getByRole('button', { name: '메뉴 펼치기', exact: true }).getAttribute('aria-expanded'), 'false');
    assert.ok((await page.locator('.sidebar').boundingBox()).width < width - 80, 'collapsing returns space to work area');
    await page.getByRole('button', { name: '주문·배송', exact: true }).click();
    assert.equal(await page.locator('.order-row').count(), 3);
    await page.getByRole('button', { name: '메뉴 펼치기', exact: true }).click();
    await page.getByRole('button', { name: '주문 검색', exact: true }).click();
    assert.equal(await page.locator('#order-search').evaluate(el => el === document.activeElement), true);
    await page.locator('.order-row').first().click();
    await page.getByRole('button', { name: '다음 주문 상세', exact: true }).click();
    assert.ok((await page.locator('#order-detail').innerText()).includes('MOAON-S002'));
    await page.getByRole('button', { name: '이전 주문 상세', exact: true }).click();
    assert.ok((await page.locator('#order-detail').innerText()).includes('MOAON-S001'));
    assert.equal(await page.getByRole('button', { name: '이전 주문 상세', exact: true }).isDisabled(), true);
    await page.locator('#order-search').fill('MOAON-S001');
    assert.equal(await page.getByRole('button', { name: '다음 주문 상세', exact: true }).isDisabled(), true, 'filtering updates open detail navigation without reselecting');
    assert.equal(await page.locator('#order-search').evaluate(el => el === document.activeElement), true, 'updating detail must not steal search focus');
    await page.locator('#order-search').fill('');
    assert.equal(await page.getByRole('button', { name: '다음 주문 상세', exact: true }).isDisabled(), false);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.order-row').first().evaluate(el => el === document.activeElement), true);
    fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    for (const [width, height] of [[1040, 720], [1440, 900], [1920, 1080]]) {
      await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(...size), [width, height]);
      for (const theme of ['light', 'dark']) {
        if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: '화면 테마 전환', exact: true }).click();
        await page.locator('.order-row').first().click();
        const layout = await page.evaluate(() => {
          const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x:r.x, y:r.y, right:r.right, bottom:r.bottom }; };
          return { width:innerWidth, height:innerHeight, scroll:document.documentElement.scrollWidth, list:rect('.orders-workspace'), detail:rect('#order-detail'), footer:rect('.statusbar') };
        });
        assert.ok(layout.scroll <= layout.width, 'no horizontal page overflow');
        assert.ok(layout.detail.right <= layout.width && layout.detail.x >= layout.list.right, 'detail does not overlap list or clip');
        assert.ok(layout.detail.bottom <= layout.footer.y + 1 && layout.list.bottom <= layout.footer.y + 1, 'work panels fit above fixed status bar');
        await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))));
        await page.screenshot({ path:path.join(root, 'artifacts', `workspace-${width}-${theme}.png`) });
      }
    }
    await page.keyboard.press('Alt+3');
    assert.equal(await page.locator('[data-page="settings"]').isVisible(), true);
    await page.keyboard.press('Alt+1');
    assert.equal(await page.locator('[data-page="today"]').isVisible(), true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.ok(await page.locator('.nav-button').first().evaluate(el => parseFloat(getComputedStyle(el).transitionDuration) < 0.01));
    console.log(JSON.stringify({status:'PASS', runtime:override >= 0 ? 'installed executable' : packaged ? 'packaged' : 'source', themes:2, sizes:3, data:'synthetic sample only'}));
  } finally { await app.close(); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
