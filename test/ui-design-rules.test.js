const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  auditCssText,
  compareAgainstBaseline,
  formatMarkdownReport,
  summarizeFindings,
} = require('../lib/ui/design-rule-audit');

test('26-0 detects the prohibited AI-style CSS patterns with actionable rule ids', () => {
  const css = `
    .hero { background: linear-gradient(135deg, #eeeaff, #ffffff); }
    .hero::before { background: radial-gradient(circle, #fff, transparent); }
    .title { background-clip: text; font-family: Inter, sans-serif; }
    .glass { backdrop-filter: blur(16px); }
    .summaryCard { border: 1px solid #ddd; border-radius: 28px; box-shadow: 0 20px 50px #0002; }
    .activeCard { border-left: 4px solid #526b8a; }
    .eyebrow { text-transform: uppercase; letter-spacing: .14em; }
    .neon { background: #07111f; color: #22d3ee; box-shadow: 0 0 18px #22d3ee; }
    .appShell { background: #f7f0e6; }
  `;

  const ids = new Set(auditCssText(css, 'app/example.css').map((item) => item.rule));

  assert.deepEqual(ids, new Set([
    'decorative-gradient',
    'radial-glow',
    'gradient-text',
    'banned-font',
    'glass-blur',
    'oversized-card-radius',
    'border-and-shadow',
    'thick-side-accent',
    'decorative-eyebrow',
    'dark-cyan-neon',
    'cream-base',
  ]));
});

test('26-0 keeps existing design debt visible but fails only when a file adds debt', () => {
  const baseline = {
    version: 1,
    files: {
      'app/legacy.css': {
        'decorative-gradient': 2,
        'glass-blur': 1,
      },
    },
  };
  const current = {
    version: 1,
    files: {
      'app/legacy.css': {
        'decorative-gradient': 1,
        'glass-blur': 2,
      },
      'app/new.module.css': {
        'radial-glow': 1,
      },
    },
  };

  assert.deepEqual(compareAgainstBaseline(current, baseline), [
    {
      file: 'app/legacy.css',
      rule: 'glass-blur',
      baseline: 1,
      current: 2,
      added: 1,
    },
    {
      file: 'app/new.module.css',
      rule: 'radial-glow',
      baseline: 0,
      current: 1,
      added: 1,
    },
  ]);
});

test('26-0 summarizes findings by file and rule without hiding zero-debt files', () => {
  const findings = [
    { file: 'app/a.css', rule: 'decorative-gradient', line: 2 },
    { file: 'app/a.css', rule: 'decorative-gradient', line: 4 },
    { file: 'app/b.css', rule: 'glass-blur', line: 1 },
  ];

  assert.deepEqual(summarizeFindings(findings, ['app/a.css', 'app/b.css', 'app/clean.css']), {
    version: 1,
    files: {
      'app/a.css': { 'decorative-gradient': 2 },
      'app/b.css': { 'glass-blur': 1 },
      'app/clean.css': {},
    },
  });
});

test('26-0 renders a readable debt report with totals, locations, and manual review scope', () => {
  const summary = {
    version: 1,
    files: {
      'app/a.css': { 'decorative-gradient': 2 },
      'app/b.css': { 'glass-blur': 1 },
      'app/clean.css': {},
    },
  };
  const findings = [
    { file: 'app/a.css', rule: 'decorative-gradient', line: 12, selector: '.hero', sample: 'linear-gradient(...)' },
    { file: 'app/a.css', rule: 'decorative-gradient', line: 18, selector: '.banner', sample: 'linear-gradient(...)' },
    { file: 'app/b.css', rule: 'glass-blur', line: 7, selector: '.glass', sample: 'backdrop-filter: blur(16px)' },
  ];

  const report = formatMarkdownReport({
    summary,
    findings,
    generatedAt: '2026-08-25T00:00:00.000Z',
  });

  assert.match(report, /총 자동 탐지 부채 \| 3건/);
  assert.match(report, /`decorative-gradient` \| 장식용 그라데이션 \| 2/);
  assert.match(report, /`app\/a\.css:12`/);
  assert.match(report, /수동 검수 범위/);
  assert.match(report, /중첩 카드/);
});

test('26-0 CLI writes a baseline and rejects only newly added prohibited CSS debt', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harin-ui-guard-'));
  const appDir = path.join(root, 'app');
  const baselinePath = path.join(root, 'design-baseline.json');
  const reportPath = path.join(root, 'design-report.md');
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, 'page.css'), '.hero { background: linear-gradient(#fff, #eee); }');

  const script = path.resolve(__dirname, '../scripts/check-ui-design-rules.js');
  const baseArgs = [
    script,
    '--root', root,
    '--baseline', baselinePath,
    '--report', reportPath,
  ];
  const baselineResult = spawnSync(process.execPath, [...baseArgs, '--write-baseline'], { encoding: 'utf8' });
  assert.equal(baselineResult.status, 0, baselineResult.stderr);
  assert.equal(fs.existsSync(baselinePath), true);
  assert.equal(fs.existsSync(reportPath), true);

  const unchangedResult = spawnSync(process.execPath, baseArgs, { encoding: 'utf8' });
  assert.equal(unchangedResult.status, 0, unchangedResult.stderr);

  fs.writeFileSync(
    path.join(appDir, 'page.css'),
    '.hero { background: linear-gradient(#fff, #eee); backdrop-filter: blur(8px); }',
  );
  const regressionResult = spawnSync(process.execPath, baseArgs, { encoding: 'utf8' });
  assert.equal(regressionResult.status, 1);
  assert.match(`${regressionResult.stdout}${regressionResult.stderr}`, /glass-blur/);
});
