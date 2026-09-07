'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { createRequire } = require('node:module');
// Reuse Next's installed image dependency, including isolated pnpm installs.
const sharp = createRequire(require.resolve('next/package.json'))('sharp');

async function main() {
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, 'public', 'icons');
  await fs.mkdir(output, { recursive: true });
  for (const [size, name] of [[192, 'hub-icon-192'], [512, 'hub-icon-512'], [180, 'hub-apple-touch-180']]) {
    await sharp(path.join(root, 'app', 'icon.svg'), { density: 768 })
      .resize(size, size).png({ compressionLevel: 9, adaptiveFiltering: false })
      .toFile(path.join(output, `${name}.png`));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
