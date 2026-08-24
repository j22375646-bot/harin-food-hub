const fs = require('node:fs');
const path = require('node:path');

const {
  auditCssFiles,
  compareAgainstBaseline,
  formatMarkdownReport,
} = require('../lib/ui/design-rule-audit');

function readOption(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith('--')) {
    throw new Error(`${name} 다음에 경로를 입력해주세요.`);
  }
  return args[index + 1];
}

function resolveFromRoot(rootDir, value) {
  return path.isAbsolute(value) ? value : path.join(rootDir, value);
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function main(args = process.argv.slice(2)) {
  const rootDir = path.resolve(readOption(args, '--root', process.cwd()));
  const baselineFile = resolveFromRoot(
    rootDir,
    readOption(args, '--baseline', 'config/ui-design-debt-baseline.json'),
  );
  const reportFile = resolveFromRoot(
    rootDir,
    readOption(args, '--report', 'docs/ui/phase26-0-design-debt.md'),
  );
  const writeBaseline = args.includes('--write-baseline');
  const writeReport = writeBaseline || args.includes('--write-report');
  const result = auditCssFiles(rootDir, 'app');

  if (writeReport) {
    fs.mkdirSync(path.dirname(reportFile), { recursive: true });
    fs.writeFileSync(reportFile, formatMarkdownReport({
      summary: result.summary,
      findings: result.findings,
    }));
  }

  if (writeBaseline) {
    writeJson(baselineFile, result.summary);
    console.log(`[ui:guard] 기준 저장: ${path.relative(rootDir, baselineFile)}`);
    console.log(`[ui:guard] CSS ${result.files.length}개, 탐지 ${result.findings.length}건`);
    return 0;
  }

  if (!fs.existsSync(baselineFile)) {
    console.error(`[ui:guard] 기준 파일이 없습니다: ${path.relative(rootDir, baselineFile)}`);
    console.error('[ui:guard] 검토 후 --write-baseline 옵션으로 최초 기준을 만드세요.');
    return 2;
  }

  const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
  const regressions = compareAgainstBaseline(result.summary, baseline);
  if (regressions.length > 0) {
    console.error(`[ui:guard] 새 디자인 금지 패턴 ${regressions.reduce((sum, item) => sum + item.added, 0)}건을 발견했습니다.`);
    for (const item of regressions) {
      console.error(`- ${item.file}: ${item.rule} ${item.baseline} -> ${item.current} (+${item.added})`);
    }
    console.error(`[ui:guard] 기준 보고서: ${path.relative(rootDir, reportFile)}`);
    return 1;
  }

  console.log(`[ui:guard] 통과: 새 디자인 금지 패턴 없음 (현재 부채 ${result.findings.length}건)`);
  console.log(`[ui:guard] 기준 보고서: ${path.relative(rootDir, reportFile)}`);
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`[ui:guard] 실행 실패: ${error.message}`);
    process.exitCode = 2;
  }
}

module.exports = { main };
