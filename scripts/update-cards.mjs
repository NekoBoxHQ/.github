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

await mkdir(OUT_DIR, { recursive: true });
for (const name of CARDS) {
  const svg = await grab(name);
  await writeFile(resolve(OUT_DIR, `${name}.svg`), svg, 'utf8');
  console.log(`✔ ${name}.svg`);
}
