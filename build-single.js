/* Build a single-file version of 倒带三消 and an itch.io-ready zip. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const dir = __dirname;
const read = (name) => fs.readFileSync(path.join(dir, name), 'utf8');

let html = read('index.html');
const css = read('style.css');
const js = read('game.js');

if (/<\/script/i.test(js)) {
  throw new Error('game.js contains </script>, cannot inline safely');
}

html = html.replace(
  /<link\s+rel="stylesheet"\s+href="style\.css"\s*\/?>/i,
  `<style>\n${css}\n</style>`
);
html = html.replace(
  /<script\s+src="game\.js"\s*><\/script>/i,
  `<script>\n${js}\n</script>`
);

if (html.includes('href="style.css"') || html.includes('src="game.js"')) {
  throw new Error('inlining failed: external asset reference still present');
}

const outDir = path.join(dir, 'dist');
fs.mkdirSync(outDir, { recursive: true });

const indexOut = path.join(outDir, 'index.html');
const namedOut = path.join(outDir, '倒带三消-单文件版.html');
fs.writeFileSync(indexOut, html, 'utf8');
fs.writeFileSync(namedOut, html, 'utf8');

const zipOut = path.join(outDir, 'rewind-match3-itch.zip');
try {
  execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Compress-Archive -LiteralPath '${indexOut.replace(/'/g, "''")}' -DestinationPath '${zipOut.replace(/'/g, "''")}' -Force`,
    ],
    { stdio: 'ignore' }
  );
  console.log('OK  dist/rewind-match3-itch.zip');
} catch (err) {
  console.warn('Skip itch zip (PowerShell unavailable):', err.message);
}

console.log('OK  dist/index.html');
console.log('OK  dist/倒带三消-单文件版.html');
console.log(`Size: ${(Buffer.byteLength(html, 'utf8') / 1024).toFixed(1)} KB`);
