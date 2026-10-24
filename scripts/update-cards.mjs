/**
 * 抓取组织统计卡片，把标签换成中文，写进 profile/cards/。
 *
 * 数据源：github-profile-summary-cards（同一套卡片、同一个深色主题）。
 * 为什么要本地存一份：那个托管接口不认中文（标签写死在卡片代码里），
 * 抓回来把文字节点替换掉，外观一模一样，读起来是中文。
 *
 * 跑法：node scripts/update-cards.mjs（bun 也行）
 * 定时：.github/workflows/cards.yml，每天一次。
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const USER = 'NekoBoxHQ';
const BASE = 'https://github-profile-summary-cards.vercel.app/api/cards';
const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'profile', 'cards');

// 组织卡片没有 productive-time（那是按人统计的），所以四张。
const CARDS = ['profile-details', 'repos-per-language', 'most-commit-language', 'stats'];

// 顺序有讲究：先整句、再单词。
const REPLACEMENTS = [
  [`${USER} (${USER})`, USER],
  [/(\d+) Public Repos/g, '$1 个公开仓库'],
  [/Created on GitHub (\d+) days? ago/g, '创建于 $1 天前'],
  [/Created on GitHub (\d+)\/(\d+)/g, '创建于 $2/$1'],
  [/Created on GitHub (.+)/g, '创建于 $1'],
  [/repos created over time/g, '仓库创建趋势'],
  [/Top Languages by Repo/g, '语言分布 · 按仓库'],
  [/Top Languages by Commit/g, '语言分布 · 按提交'],
  [/>Stats</g, '>数据总览<'],
  [/Total Stars:/g, '总星标'],
  [/Total Repos:/g, '公开仓库'],
  [/Total Forks:/g, 'Fork 总数'],
  [/Open Issues:/g, '未解决议题'],
  [/No data/g, '暂无数据']
];

// 中文字形：卡片原来只写了西文字体，补上中文栈（浏览器本来也会回退，这里写明更稳）。
const FONT_FIXES = [
  [
    `'Segoe UI', Ubuntu, "Helvetica Neue", Sans-Serif`,
    `'Segoe UI', 'Microsoft YaHei', 'PingFang SC', 'Noto Sans CJK SC', Ubuntu, "Helvetica Neue", Sans-Serif`
  ],
  [
    `'Segoe UI', Ubuntu, Sans-Serif`,
    `'Segoe UI', 'Microsoft YaHei', 'PingFang SC', 'Noto Sans CJK SC', Ubuntu, Sans-Serif`
  ]
];

async function grab(name) {
  const url = `${BASE}/${name}?username=${USER}&theme=github_dark&animation=load&border_color=0d1116`;
  const res = await fetch(url, { headers: { 'user-agent': 'NekoBoxHQ-profile-cards' } });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  let svg = await res.text();
  if (!svg.startsWith('<svg') && !svg.includes('<svg')) throw new Error(`${name}: 不是 SVG`);

  for (const [from, to] of REPLACEMENTS) svg = svg.replace(from, to);
  for (const [from, to] of FONT_FIXES) svg = svg.split(from).join(to);

  // 接口哪天改了措辞，这里会提前发现（不至于悄悄退回英文）。
  const leftover = svg.match(/>[^<>]*(Total |Public Repos|Top Languages|Created on GitHub|repos created over time)[^<>]*</);
  if (leftover) console.warn(`⚠️ ${name}: 还有没翻到的英文 → ${leftover[0]}`);
  return svg;
}

/**
 * 提交时段（UTC+8）—— 组织卡片没有这一张（托管接口只按人统计），
 * 自己数一遍公开仓库的提交时间画出来，样式跟其它四张对齐。
 */
const REPOS = ['NatPunch', 'NekoBoxPro', 'canoe'];

async function commitsByHour() {
  const counts = new Array(24).fill(0);
  const headers = { 'user-agent': 'NekoBoxHQ-profile-cards' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  for (const repo of REPOS) {
    for (let page = 1; page <= 5; page++) {
      const res = await fetch(
        `https://api.github.com/repos/${USER}/${repo}/commits?per_page=100&page=${page}`,
        { headers }
      );
      if (!res.ok) throw new Error(`${repo}: HTTP ${res.status}`);
      const list = await res.json();
      if (!Array.isArray(list) || list.length === 0) break;
      for (const c of list) {
        const t = new Date(c.commit.author.date);
        counts[(t.getUTCHours() + 8) % 24]++;
      }
      if (list.length < 100) break;
    }
  }
  return counts;
}

function productiveTimeSvg(counts) {
  const left = 35;
  const top = 60;
  const w = 280;
  const h = 100;
  const max = Math.max(5, Math.ceil(Math.max(...counts) / 5) * 5);
  const step = Math.ceil(max / 5);
  const slot = w / 24;
  const barW = slot * 0.9;

  let ticks = '';
  for (let v = 0; v <= max; v += step) {
    const y = top + h - (v / max) * h;
    ticks += `<text x="${left - 9}" y="${y.toFixed(2)}" dy="0.32em" text-anchor="end" fill="#77909c" font-size="10">${v}</text>`;
  }

  let bars = '';
  for (let i = 0; i < 24; i++) {
    const bh = (counts[i] / max) * h;
    bars += `<rect class="bar" style="--gpsc-i: ${i};" fill="#40c463" x="${(left + i * slot + (slot - barW) / 2).toFixed(2)}" y="${(top + h - bh).toFixed(2)}" width="${barW.toFixed(2)}" height="${bh.toFixed(2)}"/>`;
  }

  const hourLabels = [0, 6, 12, 18, 23]
    .map((i) => `<text x="${(left + i * slot + slot / 2).toFixed(2)}" y="${top + h + 18}" text-anchor="middle" fill="#77909c" font-size="10">${i}</text>`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="200" viewBox="0 0 340 200">
<style>
@keyframes gpsc-fade{from{opacity:0}to{opacity:1}}
@keyframes gpsc-grow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
.gpsc-item{animation:gpsc-fade 1.2s ease both calc(var(--gpsc-i,0) * 0.18s)}
rect.bar{animation:gpsc-grow 1.5s cubic-bezier(.2,.7,.3,1) both 0.35s;transform-box:fill-box;transform-origin:center bottom}
@media (prefers-reduced-motion:reduce){.gpsc-item,rect.bar{animation:none!important}}
*{font-family:'Segoe UI','Microsoft YaHei','PingFang SC','Noto Sans CJK SC',Ubuntu,"Helvetica Neue",Sans-Serif}
</style>
<g>
<rect x="1" y="1" rx="5" ry="5" height="99%" width="99.41%" stroke="#0d1116" stroke-width="1" fill="#0d1117"/>
<text x="30" y="40" class="gpsc-item" style="--gpsc-i: 0; font-size: 22px; fill: #0366d6;">提交时段（UTC+8）</text>
<line x1="${left}" y1="${top + h + 0.5}" x2="${left + w}" y2="${top + h + 0.5}" stroke="#77909c"/>
${ticks}
${bars}
${hourLabels}
</g>
</svg>
`;
}

await mkdir(OUT_DIR, { recursive: true });
for (const name of CARDS) {
  const svg = await grab(name);
  await writeFile(resolve(OUT_DIR, `${name}.svg`), svg, 'utf8');
  console.log(`✔ ${name}.svg`);
}

const hours = await commitsByHour();
await writeFile(resolve(OUT_DIR, 'productive-time.svg'), productiveTimeSvg(hours), 'utf8');
console.log(`✔ productive-time.svg（${hours.reduce((a, b) => a + b, 0)} 次提交）`);
