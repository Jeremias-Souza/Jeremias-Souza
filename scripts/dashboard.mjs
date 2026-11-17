// Gera assets/dashboard-dark.svg e assets/dashboard-light.svg com os dados
// de contribuição do perfil. Sem dependências: roda com Node 20+.
// Uso: GITHUB_TOKEN=... node scripts/dashboard.mjs <usuario>
import { mkdirSync, writeFileSync } from "node:fs";

const USER = process.argv[2] || process.env.GITHUB_USER;
const TOKEN = process.env.GITHUB_TOKEN;
if (!USER || !TOKEN) {
  console.error("Informe o usuário e a variável GITHUB_TOKEN.");
  process.exit(1);
}

async function gql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const CAL = `query($login:String!,$from:DateTime!,$to:DateTime!){
  user(login:$login){ createdAt contributionsCollection(from:$from,to:$to){
    contributionCalendar{ totalContributions weeks{ contributionDays{ date contributionCount } } } } } }`;

const now = new Date();
const { user } = await gql(`query($login:String!){ user(login:$login){ createdAt } }`, { login: USER });
const firstYear = new Date(user.createdAt).getUTCFullYear();
const thisYear = now.getUTCFullYear();

const days = new Map(); // yyyy-mm-dd -> contagem
for (let y = firstYear; y <= thisYear; y++) {
  const to = y === thisYear ? now.toISOString() : `${y}-12-31T23:59:59Z`;
  const d = await gql(CAL, { login: USER, from: `${y}-01-01T00:00:00Z`, to });
  for (const w of d.user.contributionsCollection.contributionCalendar.weeks)
    for (const day of w.contributionDays)
      if (day.date.startsWith(String(y))) days.set(day.date, day.contributionCount);
}

const all = [...days.entries()].sort(([a], [b]) => a.localeCompare(b));
const total = all.reduce((s, [, c]) => s + c, 0);

const perYear = [];
for (let y = firstYear; y <= thisYear; y++)
  perYear.push({ label: String(y), value: all.filter(([d]) => d.startsWith(String(y))).reduce((s, [, c]) => s + c, 0) });

const cutoff = new Date(now); cutoff.setUTCDate(cutoff.getUTCDate() - 364);
const cutoffStr = cutoff.toISOString().slice(0, 10);
const lastYear = all.filter(([d]) => d >= cutoffStr);
const lastYearTotal = lastYear.reduce((s, [, c]) => s + c, 0);
const activeDays = lastYear.filter(([, c]) => c > 0).length;
const best = all.reduce((b, cur) => (cur[1] > b[1] ? cur : b), ["", 0]);

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const perMonth = [];
for (let i = 11; i >= 0; i--) {
  const m = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
  const key = m.toISOString().slice(0, 7);
  perMonth.push({ label: MESES[m.getUTCMonth()], value: all.filter(([d]) => d.startsWith(key)).reduce((s, [, c]) => s + c, 0) });
}

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const perWeekday = SEMANA.map((label) => ({ label, value: 0 }));
for (const [d, c] of lastYear) perWeekday[new Date(d + "T12:00:00Z").getUTCDay()].value += c;

const fmt = (n) => n.toLocaleString("pt-BR");
const fmtDate = (s) => s.split("-").reverse().join("/");

const THEMES = {
  dark: { bg: "#0d1117", card: "#161b22", border: "#30363d", text: "#e6edf3", muted: "#8b949e", accent: "#7aa2f7", accent2: "#bb9af7", grid: "#21262d" },
  light: { bg: "#ffffff", card: "#f6f8fa", border: "#d0d7de", text: "#1f2328", muted: "#57606a", accent: "#3563d8", accent2: "#8250df", grid: "#eaeef2" },
};

function bars(data, x, y, w, h, t, color) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const slot = w / data.length;
  const bw = Math.min(28, slot * 0.62);
  let out = `<line x1="${x}" y1="${y + h}" x2="${x + w}" y2="${y + h}" stroke="${t.grid}"/>`;
  data.forEach((d, i) => {
    const bh = Math.max(d.value ? 3 : 0, (d.value / max) * (h - 18));
    const bx = x + i * slot + (slot - bw) / 2;
    out += `<rect x="${bx.toFixed(1)}" y="${(y + h - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${color}"><title>${d.label}: ${fmt(d.value)}</title></rect>`;
    if (data.length <= 7) out += `<text x="${(bx + bw / 2).toFixed(1)}" y="${(y + h - bh - 5).toFixed(1)}" text-anchor="middle" font-size="10" fill="${t.muted}">${fmt(d.value)}</text>`;
    out += `<text x="${(bx + bw / 2).toFixed(1)}" y="${y + h + 15}" text-anchor="middle" font-size="10" fill="${t.muted}">${d.label}</text>`;
  });
  return out;
}

function render(t) {
  const W = 840, H = 430;
  const kpis = [
    ["Contribuições no total", fmt(total), `desde ${firstYear}`],
    [`Contribuições em ${thisYear}`, fmt(perYear.at(-1).value), `${fmt(lastYearTotal)} nos últimos 12 meses`],
    ["Dias ativos", `${fmt(activeDays)}`, `de 365 (${Math.round((activeDays / 365) * 100)}%)`],
    ["Dia mais produtivo", fmt(best[1]), best[0] ? `em ${fmtDate(best[0])}` : ""],
  ];
  const kw = (W - 48 - 36) / 4;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">`;
  s += `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="${t.bg}" stroke="${t.border}"/>`;
  s += `<text x="24" y="38" font-size="18" font-weight="600" fill="${t.text}">Painel de desenvolvimento</text>`;
  s += `<text x="${W - 24}" y="38" font-size="11" text-anchor="end" fill="${t.muted}">atualizado em ${fmtDate(now.toISOString().slice(0, 10))}</text>`;
  kpis.forEach(([label, value, sub], i) => {
    const x = 24 + i * (kw + 12);
    s += `<rect x="${x}" y="58" width="${kw}" height="92" rx="10" fill="${t.card}" stroke="${t.border}"/>`;
    s += `<text x="${x + 16}" y="82" font-size="11" fill="${t.muted}">${label}</text>`;
    s += `<text x="${x + 16}" y="116" font-size="28" font-weight="700" fill="${i === 0 ? t.accent : t.text}">${value}</text>`;
    s += `<text x="${x + 16}" y="137" font-size="10.5" fill="${t.muted}">${sub}</text>`;
  });
  const panels = [
    ["Contribuições por ano", perYear, t.accent, 228],
    ["Últimos 12 meses", perMonth, t.accent2, 336],
    ["Por dia da semana (12 meses)", perWeekday, t.accent, 192],
  ];
  let px = 24;
  for (const [title, data, color, pw] of panels) {
    s += `<rect x="${px}" y="166" width="${pw}" height="240" rx="10" fill="${t.card}" stroke="${t.border}"/>`;
    s += `<text x="${px + 16}" y="190" font-size="12" font-weight="600" fill="${t.text}">${title}</text>`;
    s += bars(data, px + 12, 206, pw - 24, 170, t, color);
    px += pw + 12;
  }
  return s + "</svg>";
}

mkdirSync("assets", { recursive: true });
writeFileSync("assets/dashboard-dark.svg", render(THEMES.dark));
writeFileSync("assets/dashboard-light.svg", render(THEMES.light));
console.log(`OK: ${fmt(total)} contribuições desde ${firstYear}`);
