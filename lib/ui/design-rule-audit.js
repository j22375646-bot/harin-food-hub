const fs = require('node:fs');
const path = require('node:path');

const BANNED_FONTS = [
  'Inter',
  'Geist',
  'Space Grotesk',
  'Instrument Serif',
];

const CARD_SELECTOR = /(?:card|panel|tile|box|workspace|shell)/i;
const DECORATIVE_LABEL_SELECTOR = /(?:eyebrow|sectionTag|kicker)/i;
const BASE_SURFACE_SELECTOR = /(?:^|[\s,.#:_-])(?:html|body|root|appShell|hubShell|pageShell)(?:$|[\s,.#:_>-])/i;
const CREAM_COLOR = /(?:\bbeige\b|\boldlace\b|\blinen\b|\bfloralwhite\b|\bcornsilk\b|#(?:fffaf0|fdf8ef|faf7f2|f9f4ea|f8f5ef|f7f0e6|f6f1e9|f5efe6|f4efe6)\b)/i;
const DARK_SURFACE = /background(?:-color)?\s*:[^;}]*(?:#(?:000(?:000)?|07111f|08111f|0b1220|0f172a|111827|101827|121826)\b|\b(?:black|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))\b)/i;
const CYAN_NEON = /(?:\bcyan\b|\baqua\b|#(?:00ffff|22d3ee|06b6d4|67e8f9|0ea5e9)\b|rgb\(\s*(?:0\s*,\s*255\s*,\s*255|34\s*,\s*211\s*,\s*238|6\s*,\s*182\s*,\s*212)\s*\))/i;

const RULE_LABELS = {
  'decorative-gradient': '장식용 그라데이션',
  'radial-glow': '방사형 글로우·헤이즈',
  'gradient-text': '그라데이션 글자',
  'banned-font': '금지 폰트',
  'glass-blur': '글래스·블러 효과',
  'oversized-card-radius': '작은 카드의 과한 라운드',
  'border-and-shadow': '테두리와 큰 그림자 중복',
  'thick-side-accent': '굵은 한쪽 컬러 보더',
  'decorative-eyebrow': '장식용 영문 아이브로우',
  'dark-cyan-neon': '어두운 배경과 시안 네온',
  'cream-base': '크림·베이지 기본 배경',
};

function lineAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

function makeFinding(file, rule, source, index, selector, sample) {
  return {
    file,
    rule,
    line: lineAt(source, index),
    selector: selector.trim().replace(/\s+/g, ' '),
    sample: sample.trim().replace(/\s+/g, ' ').slice(0, 180),
  };
}

function findMatches(pattern, text) {
  const matches = [];
  const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push(match);
    if (match[0].length === 0) regex.lastIndex += 1;
  }
  return matches;
}

function auditCssText(source, file = '<inline>') {
  const findings = [];
  const blockPattern = /([^{}]+)\{([^{}]*)\}/g;
  let block;

  while ((block = blockPattern.exec(source)) !== null) {
    const selector = block[1];
    const declarations = block[2];
    const declarationOffset = block.index + block[0].indexOf(declarations);

    for (const match of findMatches(/(?:linear|radial|conic)-gradient\s*\([^;}]*/gi, declarations)) {
      findings.push(makeFinding(file, 'decorative-gradient', source, declarationOffset + match.index, selector, match[0]));
      if (/^radial-gradient/i.test(match[0])) {
        findings.push(makeFinding(file, 'radial-glow', source, declarationOffset + match.index, selector, match[0]));
      }
    }

    for (const match of findMatches(/(?:-webkit-)?background-clip\s*:\s*text/gi, declarations)) {
      findings.push(makeFinding(file, 'gradient-text', source, declarationOffset + match.index, selector, match[0]));
    }

    for (const font of BANNED_FONTS) {
      const escaped = font.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`(?:font-family|font)\\s*:[^;}]*(?:^|[\\s,"'])${escaped}(?=$|[\\s,"';])`, 'gi');
      for (const match of findMatches(pattern, declarations)) {
        findings.push(makeFinding(file, 'banned-font', source, declarationOffset + match.index, selector, match[0]));
      }
    }

    for (const match of findMatches(/(?:-webkit-)?backdrop-filter\s*:[^;}]*(?:blur|saturate)\s*\(/gi, declarations)) {
      findings.push(makeFinding(file, 'glass-blur', source, declarationOffset + match.index, selector, match[0]));
    }

    if (CARD_SELECTOR.test(selector)) {
      for (const match of findMatches(/border-radius\s*:\s*(\d+(?:\.\d+)?)px/gi, declarations)) {
        const radius = Number(match[1]);
        if (radius >= 24 && radius < 999) {
          findings.push(makeFinding(file, 'oversized-card-radius', source, declarationOffset + match.index, selector, match[0]));
        }
      }
    }

    const borderMatch = /(?:^|;)\s*border(?:-(?:top|right|bottom|left))?\s*:(?!\s*(?:0|none)(?:\s|;|$))[^;}]+/i.exec(declarations);
    const shadowMatch = /box-shadow\s*:(?!\s*none(?:\s|;|$))[^;}]+/i.exec(declarations);
    if (borderMatch && shadowMatch) {
      findings.push(makeFinding(
        file,
        'border-and-shadow',
        source,
        declarationOffset + Math.min(borderMatch.index, shadowMatch.index),
        selector,
        `${borderMatch[0]}; ${shadowMatch[0]}`,
      ));
    }

    const sideBorder = /border-left\s*:\s*(\d+(?:\.\d+)?)px[^;}]+/i.exec(declarations);
    const insetSide = /box-shadow\s*:[^;}]*inset\s+(\d+(?:\.\d+)?)px\s+0(?:px)?\b/i.exec(declarations);
    if ((sideBorder && Number(sideBorder[1]) >= 4) || (insetSide && Number(insetSide[1]) >= 4)) {
      const match = sideBorder && Number(sideBorder[1]) >= 4 ? sideBorder : insetSide;
      findings.push(makeFinding(file, 'thick-side-accent', source, declarationOffset + match.index, selector, match[0]));
    }

    if (DECORATIVE_LABEL_SELECTOR.test(selector)) {
      const uppercase = /text-transform\s*:\s*uppercase/i.exec(declarations);
      const tracking = /letter-spacing\s*:\s*(\d*\.?\d+)em/i.exec(declarations);
      if (uppercase || (tracking && Number(tracking[1]) >= 0.08)) {
        const match = uppercase || tracking;
        findings.push(makeFinding(file, 'decorative-eyebrow', source, declarationOffset + match.index, selector, match[0]));
      }
    }

    if (DARK_SURFACE.test(declarations) && CYAN_NEON.test(declarations)) {
      const match = DARK_SURFACE.exec(declarations);
      findings.push(makeFinding(file, 'dark-cyan-neon', source, declarationOffset + match.index, selector, match[0]));
    }

    if (BASE_SURFACE_SELECTOR.test(selector)) {
      const cream = /background(?:-color)?\s*:[^;}]+/i.exec(declarations);
      if (cream && CREAM_COLOR.test(cream[0])) {
        findings.push(makeFinding(file, 'cream-base', source, declarationOffset + cream.index, selector, cream[0]));
      }
    }
  }

  return findings;
}

function summarizeFindings(findings, files = []) {
  const summary = { version: 1, files: {} };
  for (const file of [...files].sort()) summary.files[file] = {};
  for (const finding of findings) {
    summary.files[finding.file] ||= {};
    summary.files[finding.file][finding.rule] = (summary.files[finding.file][finding.rule] || 0) + 1;
  }
  return summary;
}

function compareAgainstBaseline(current, baseline) {
  const regressions = [];
  const files = new Set([
    ...Object.keys(baseline?.files || {}),
    ...Object.keys(current?.files || {}),
  ]);

  for (const file of [...files].sort()) {
    const oldRules = baseline?.files?.[file] || {};
    const newRules = current?.files?.[file] || {};
    const rules = new Set([...Object.keys(oldRules), ...Object.keys(newRules)]);
    for (const rule of [...rules].sort()) {
      const oldCount = Number(oldRules[rule] || 0);
      const newCount = Number(newRules[rule] || 0);
      if (newCount > oldCount) {
        regressions.push({
          file,
          rule,
          baseline: oldCount,
          current: newCount,
          added: newCount - oldCount,
        });
      }
    }
  }

  return regressions;
}

function formatMarkdownReport({ summary, findings, generatedAt = new Date().toISOString() }) {
  const totals = {};
  for (const rules of Object.values(summary?.files || {})) {
    for (const [rule, count] of Object.entries(rules)) {
      totals[rule] = (totals[rule] || 0) + Number(count || 0);
    }
  }
  const totalDebt = Object.values(totals).reduce((sum, count) => sum + count, 0);
  const affectedFiles = Object.values(summary?.files || {}).filter((rules) => Object.keys(rules).length > 0).length;
  const allFiles = Object.keys(summary?.files || {}).length;
  const sortedRules = Object.keys(RULE_LABELS)
    .map((rule) => [rule, totals[rule] || 0])
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const sortedFindings = [...(findings || [])].sort((left, right) => (
    left.file.localeCompare(right.file) || left.line - right.line || left.rule.localeCompare(right.rule)
  ));

  const lines = [
    '# 26-0 디자인 금지 규칙 자동 점검',
    '',
    `- 생성 시각: ${generatedAt}`,
    `- 검사한 CSS: ${allFiles}개`,
    `- 위반이 남은 CSS: ${affectedFiles}개`,
    `- 총 자동 탐지 부채 | ${totalDebt}건`,
    '',
    '## 규칙별 현황',
    '',
    '| 규칙 | 설명 | 현재 건수 |',
    '|---|---|---:|',
    ...sortedRules.map(([rule, count]) => `| \`${rule}\` | ${RULE_LABELS[rule] || rule} | ${count} |`),
    '',
    '## 발견 위치',
    '',
    '| 위치 | 규칙 | 선택자 |',
    '|---|---|---|',
    ...sortedFindings.map((finding) => (
      `| \`${finding.file}:${finding.line}\` | \`${finding.rule}\` | \`${finding.selector || '-'}\` |`
    )),
    ...(sortedFindings.length ? [] : ['| - | - | - |']),
    '',
    '## 작동 방식',
    '',
    '- 현재 부채는 기준 파일에 기록해 숨기지 않습니다.',
    '- 기존 건수가 줄어드는 것은 허용하지만, 새 파일이나 기존 파일에 금지 패턴이 늘어나면 검사가 실패합니다.',
    '- 탐지 결과는 디자인 개선 우선순위를 정하는 자료이며, 자동 수정은 하지 않습니다.',
    '',
    '## 수동 검수 범위',
    '',
    '- 카드 안의 카드처럼 DOM 구조를 확인해야 하는 중첩 카드',
    '- 제목 위 둥근 아이콘 타일과 불필요한 pill chip',
    '- 제목용·본문용 폰트 분리와 1.25배 이상 크기 단계',
    '- 본문 명암 대비 4.5:1 이상과 실제 모바일 가독성',
    '- 테두리와 그림자의 시각적 강도, 정보 밀도, 양옆 빈 공간 사용',
    '',
  ];

  return lines.join('\n');
}

function listCssFiles(rootDir, relativeDir = 'app') {
  const start = path.join(rootDir, relativeDir);
  if (!fs.existsSync(start)) return [];
  const files = [];
  const pending = [start];
  while (pending.length) {
    const directory = pending.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(absolute);
      else if (entry.isFile() && entry.name.endsWith('.css')) {
        files.push(path.relative(rootDir, absolute).replaceAll('\\', '/'));
      }
    }
  }
  return files.sort();
}

function auditCssFiles(rootDir, relativeDir = 'app') {
  const files = listCssFiles(rootDir, relativeDir);
  const findings = files.flatMap((file) => auditCssText(fs.readFileSync(path.join(rootDir, file), 'utf8'), file));
  return { files, findings, summary: summarizeFindings(findings, files) };
}

module.exports = {
  BANNED_FONTS,
  RULE_LABELS,
  auditCssFiles,
  auditCssText,
  compareAgainstBaseline,
  formatMarkdownReport,
  listCssFiles,
  summarizeFindings,
};
