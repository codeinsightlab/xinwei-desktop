import sharp from 'sharp';
import { readFile,writeFile } from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const mascot=await readFile(new URL('public/assets/mascot/hero.svg',root));
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#141615"/><g font-family="PingFang SC, sans-serif" fill="#F5F3E9"><text x="80" y="95" font-size="29" font-weight="700">薪慰 Xinwei</text><text x="80" y="238" font-size="64" font-weight="700">上班已经够苦了，</text><text x="80" y="327" font-size="64" font-weight="700">看看钱涨，</text><text x="80" y="416" font-size="64" font-weight="700">多少有点<tspan fill="#D8FA57">安慰</tspan>。</text><text x="80" y="539" font-size="24" fill="#B1B7AD">不是考勤 · 想接梗就接</text></g><path d="M339 437q80-12 180 0" fill="none" stroke="#D8FA57" stroke-width="6" stroke-linecap="round"/><image x="715" y="220" width="410" height="308" href="data:image/svg+xml;base64,${mascot.toString('base64')}"/></svg>`;
await sharp(Buffer.from(svg)).png().toFile(new URL('public/og.png',root).pathname);
await writeFile(new URL('public/favicon.svg',root),await readFile(new URL('public/assets/mascot/welcome.svg',root)));
console.log('Created local 1200×630 social image and SVG favicon.');
