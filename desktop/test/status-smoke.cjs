'use strict';

// Real isolated Electron/IPC/UI with synthetic read-only HTTP responses.
const assert = require('node:assert/strict');
const path = require('node:path');
const { launchDesktop } = require('./launch.cjs');

const root = path.resolve(__dirname, '..');
const packaged = process.argv.includes('--packaged');
const override = process.argv.indexOf('--executable');
const executablePath = override >= 0
  ? process.argv[override + 1]
  : packaged ? path.join(root, 'dist/win-unpacked/MoaonPreview.exe') : require('electron');
const snapshot = 'c'.repeat(64);

async function main() {
  const app = await launchDesktop({ root, executablePath, packaged, override });
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    assert.deepEqual(await page.evaluate(() => Object.keys(window.moaonHub || {})), [
      'connect', 'refresh', 'nextPage', 'previousPage',
      'viewActive', 'viewRegistered', 'viewInTransit', 'viewCompleted', 'disconnect',
    ]);

    await app.evaluate(({ session }) => {
      const ses = session.fromPartition('moaon-harin-readonly', { cache: false });
      globalThis.__moaonStatusRequests = [];
      globalThis.__moaonReleaseRegistered = null;
      globalThis.__moaonHoldRegistered = true;
      globalThis.__moaonFailFirstRead = true;
      globalThis.__moaonStatusOverride = null;
      ses.fetch = async (url, options) => {
        if (options.method !== 'GET') throw new Error('Unexpected method');
        const parsed = new URL(url);
        const scope = parsed.searchParams.get('stage');
        const offset = Number(parsed.searchParams.get('offset') || 0);
        if (!['ACTIVE', 'REGISTER', 'IN_TRANSIT', 'COMPLETED'].includes(scope)) throw new Error('Unexpected scope');
        globalThis.__moaonStatusRequests.push({ scope, offset, url });
        if (globalThis.__moaonFailFirstRead) {
          globalThis.__moaonFailFirstRead = false;
          return new Response('', { status: 500 });
        }
        if (globalThis.__moaonStatusOverride) return new Response('', { status: globalThis.__moaonStatusOverride });
        if (scope === 'REGISTER' && globalThis.__moaonHoldRegistered) {
          await new Promise((resolve) => { globalThis.__moaonReleaseRegistered = resolve; });
          globalThis.__moaonHoldRegistered = false;
        }
        const totals = { ACTIVE: 7, REGISTER: 21, IN_TRANSIT: 1, COMPLETED: 1 };
        const activeStages = ['PAID', 'PREPARING', 'READY_TO_SHIP', 'WAITING_FOR_CARRIER', 'SHIPPING', 'DELIVERED', 'CANCELLED'];
        const stages = { REGISTER: 'READY_TO_SHIP', IN_TRANSIT: 'MYSTERY_STATUS', COMPLETED: 'CANCELLED' };
        const total = totals[scope];
        const count = Math.max(0, Math.min(20, total - offset));
        const orders = Array.from({ length: count }, (_, index) => ({
          hubOrderId: `${scope}-${offset + index + 1}`,
          platform: 'CAFE24',
          productName: `${scope} 검증 상품 ${offset + index + 1}`,
          stage: scope === 'ACTIVE' ? activeStages[index] : stages[scope],
          quantity: 1,
          amount: null,
          orderedAt: null,
          receiver: { name: 'DO-NOT-EXPOSE' },
        }));
        return new Response(JSON.stringify({
          ok: true,
          orders,
          total,
          offset,
          nextOffset: offset + 20 < total ? offset + 20 : null,
          snapshot: 'c'.repeat(64),
          partial: false,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      };
    });

    const loginOpened = app.waitForEvent('window');
    await page.locator('[data-action="hub-connect"]:visible').first().click();
    await loginOpened;
    await app.evaluate(({ BrowserWindow }) => {
      const child = BrowserWindow.getAllWindows().find((win) => win.getParentWindow());
      child.webContents.emit('will-redirect', { preventDefault() {} }, 'https://harin-cafe24-sync.vercel.app/');
    });
    await page.getByRole('button', { name: '주문·배송', exact: true }).click();
    const activeScopeButton = page.locator('[data-action="hub-viewActive"]');
    await page.locator('[data-action="hub-refresh"]:visible').waitFor();
    assert.equal(await activeScopeButton.isVisible(), true);
    assert.equal(await activeScopeButton.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.order-row').count(), 0);
    await activeScopeButton.click();
    await page.getByText('ACTIVE 검증 상품 1', { exact: true }).waitFor();
    for (const label of ['결제완료', '준비중', '출고대기', '배송대기중', '배송중', '배송완료', '취소']) {
      assert.equal(await page.locator('#order-list').getByText(label, { exact: true }).count(), 1, label);
    }

    await page.locator('.order-row').first().click();
    await page.locator('#order-search').fill('PAID');
    await page.locator('[data-action="hub-viewRegistered"]:visible').click();
    assert.equal(await page.locator('[data-action="hub-viewRegistered"]:visible').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#order-search').inputValue(), '');
    assert.equal(await page.locator('.order-row').count(), 0);
    assert.equal(await page.getByRole('heading', { name: '주문 상세', exact: true }).count(), 0);
    await app.evaluate(() => globalThis.__moaonReleaseRegistered());
    await page.getByText('REGISTER 검증 상품 1', { exact: true }).waitFor();
    assert.equal(await page.getByText('출고대기', { exact: true }).count(), 20);

    await page.locator('[data-action="hub-nextPage"]:visible').click();
    await page.getByText('REGISTER 검증 상품 21', { exact: true }).waitFor();
    await page.locator('[data-action="hub-viewCompleted"]:visible').click();
    await page.getByText('COMPLETED 검증 상품 1', { exact: true }).waitFor();
    assert.match(await page.locator('#orders-range-label').textContent(), /수집된 완료·취소 주문/);
    assert.match(await page.locator('#orders-description').textContent(), /수집된 완료·취소/);
    assert.equal(await page.getByText('취소', { exact: true }).count(), 1);

    await page.locator('[data-action="hub-viewInTransit"]:visible').click();
    await page.getByText('IN_TRANSIT 검증 상품 1', { exact: true }).waitFor();
    assert.equal(await page.getByText('상태 확인 필요', { exact: true }).count(), 1);
    await page.locator('#order-search').fill('MYSTERY_STATUS');
    assert.equal(await page.locator('.order-row').count(), 1);

    await app.evaluate(() => { globalThis.__moaonStatusOverride = 401; });
    await page.locator('[data-action="hub-refresh"]:visible').click();
    await page.waitForFunction(() => document.querySelector('#global-connection-status')?.textContent === '하린식품 로그인이 필요합니다.');
    assert.equal(await activeScopeButton.isVisible(), false);

    const requests = await app.evaluate(() => globalThis.__moaonStatusRequests);
    assert.deepEqual(requests.map(({ scope, offset }) => [scope, offset]), [
      ['ACTIVE', 0], ['ACTIVE', 0], ['REGISTER', 0], ['REGISTER', 20], ['COMPLETED', 0], ['IN_TRANSIT', 0], ['IN_TRANSIT', 0],
    ]);

    await page.getByRole('button', { name: '오늘', exact: true }).click();
    await page.locator('[data-action="sample-mode"]:visible').click();
    await page.getByRole('region', { name: '현재 사업장' }).getByText('모아온 데모', { exact: true }).waitFor();
    await page.getByRole('button', { name: '주문·배송', exact: true }).click();
    assert.equal(await page.locator('[data-action^="hub-view"]:visible').count(), 0);
    assert.equal(await page.getByText('상품 준비 전', { exact: true }).count(), 1);
    assert.equal(await page.locator('.order-row').count(), 3);
    console.log(JSON.stringify({
      status: 'PASS',
      packaged,
      runtime: packaged ? 'packaged app.asar' : override >= 0 ? 'provided executable' : 'development source',
      scope: 'isolated Electron scope reads with synthetic HTTP; no production writes or credentials',
    }));
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});
