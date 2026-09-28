import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const sourcePath = path.join(root, "docs", "project-backlog.md");
const outputDir = path.join(root, "public-backlog-dist");
const source = await readFile(sourcePath, "utf8");

const statusOrder = ["🟠 In progress", "⚪ Planned", "○ Future", "🟢 Done", "🔴 Blocked"];
const allowedStatuses = new Set(statusOrder);
const statusMeta = {
  "🟢 Done": { key: "done", label: "Done", summary: "Implemented and verified." },
  "🟠 In progress": { key: "progress", label: "In progress", summary: "Implementation or acceptance is underway." },
  "🔴 Blocked": { key: "blocked", label: "Blocked", summary: "Waiting for an external decision, access, or service change." },
  "⚪ Planned": { key: "planned", label: "Planned", summary: "Agreed work, not yet started." },
  "○ Future": { key: "future", label: "Future", summary: "Retained for a later iteration." },
};

function splitRow(line) {
  return line
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function plainText(value) {
  return value
    .replaceAll(/`([^`]+)`/g, "$1")
    .replaceAll(/\*\*([^*]+)\*\*/g, "$1")
    .replaceAll(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

function dependencyIds(value, currentId) {
  return [...new Set(value.match(/BW-\d+/g) ?? [])]
    .filter((id) => id !== currentId)
    .sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
}

function inferDependencies(cells, headers, id) {
  const dependencyIndex = headers.findIndex((header) => /depends on/i.test(header));
  if (dependencyIndex >= 0 && cells.length === headers.length && cells[dependencyIndex]) {
    return dependencyIds(cells[dependencyIndex], id);
  }

  const detail = cells.slice(4).join(" ");
  const explicit = detail.match(/depends on\s+([^.;]+)/i);
  if (explicit) return dependencyIds(explicit[1], id);

  const leading = detail.match(/^(BW-\d+(?:\s*(?:,|\/|and)\s*BW-\d+)*)/i);
  return leading ? dependencyIds(leading[1], id) : [];
}

const reviewed = source.match(/^Last reviewed:\s*(.+)$/m)?.[1];
if (!reviewed) throw new Error("Backlog is missing its Last reviewed date.");

const lines = source.split(/\r?\n/);
const stages = [];
const items = [];
let headers = [];

for (const line of lines) {
  if (/^\| ID \|/.test(line)) {
    headers = splitRow(line);
    continue;
  }

  if (/^\| \d+\./.test(line)) {
    const [name, status] = splitRow(line);
    if (!allowedStatuses.has(status)) throw new Error(`Unknown stage status: ${status}`);
    const match = name.match(/^(\d+)\.\s*(.+)$/);
    if (!match) throw new Error(`Invalid stage row: ${line}`);
    stages.push({ number: Number(match[1]), name: plainText(match[2]), status });
    continue;
  }

  if (!/^\| BW-\d+ /.test(line)) continue;
  const cells = splitRow(line);
  const [id, stage, rawTitle, status] = cells;
  if (!allowedStatuses.has(status)) throw new Error(`Unknown status for ${id}: ${status}`);
  items.push({
    id,
    number: Number(id.slice(3)),
    stage: plainText(stage),
    title: plainText(rawTitle),
    status,
    dependencies: inferDependencies(cells, headers, id),
  });
}

const duplicateIds = items.filter((item, index) => items.findIndex((other) => other.id === item.id) !== index);
if (duplicateIds.length) throw new Error(`Duplicate backlog IDs: ${duplicateIds.map((item) => item.id).join(", ")}`);
if (stages.length !== 11 || stages.some((stage, index) => stage.number !== index)) {
  throw new Error("Expected the authoritative stages 0 through 10 exactly once.");
}
if (items.length < 1) throw new Error("No backlog items found.");

items.sort((a, b) => a.number - b.number);
const counts = Object.fromEntries(statusOrder.map((status) => [status, items.filter((item) => item.status === status).length]));

const stageCards = stages
  .map((stage) => {
    const meta = statusMeta[stage.status];
    const count = items.filter((item) => item.stage.split(",").map((part) => part.trim()).includes(String(stage.number))).length;
    return `<article class="stage-card status-${meta.key}">
      <div class="stage-number">${stage.number}</div>
      <div><p class="stage-status">${escapeHtml(stage.status)}</p><h3>${escapeHtml(stage.name)}</h3><p>${count} linked item${count === 1 ? "" : "s"}</p></div>
    </article>`;
  })
  .join("\n");

const itemRows = items
  .map((item) => {
    const meta = statusMeta[item.status];
    const dependencies = item.dependencies.length
      ? item.dependencies.map((id) => `<a class="dependency" href="#${id.toLowerCase()}">${id}</a>`).join("")
      : '<span class="muted">None recorded</span>';
    return `<article class="backlog-row status-${meta.key}" id="${item.id.toLowerCase()}" data-status="${meta.key}" data-stage="${escapeHtml(item.stage)}" data-search="${escapeHtml(`${item.id} ${item.title} ${item.stage} ${item.dependencies.join(" ")}`.toLowerCase())}">
      <div class="item-id"><a href="#${item.id.toLowerCase()}">${item.id}</a><span>Stage ${escapeHtml(item.stage)}</span></div>
      <div class="item-main"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(meta.summary)}</p><div class="dependencies"><strong>Dependencies</strong>${dependencies}</div></div>
      <div><span class="status-pill">${escapeHtml(item.status)}</span></div>
    </article>`;
  })
  .join("\n");

const countCards = statusOrder
  .map((status) => {
    const meta = statusMeta[status];
    return `<button class="count-card status-${meta.key}" type="button" data-filter="${meta.key}" aria-pressed="false">
      <span>${escapeHtml(status)}</span><strong>${counts[status]}</strong><small>${escapeHtml(meta.label)}</small>
    </button>`;
  })
  .join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="The live, colour-coded BitcoinWalk product backlog.">
  <meta name="theme-color" content="#0b0d10">
  <title>BitcoinWalk backlog</title>
  <style>
    :root { color-scheme: dark; --bg:#0b0d10; --panel:#14171c; --panel2:#1a1e24; --line:#2a3038; --text:#f7f8fa; --muted:#9ba4b0; --orange:#f7931a; --green:#4ade80; --red:#fb7185; --white:#f8fafc; --future:#717985; }
    * { box-sizing:border-box; }
    html { scroll-behavior:smooth; }
    body { margin:0; background:radial-gradient(circle at 90% 0,#262019 0,transparent 26rem),var(--bg); color:var(--text); font:16px/1.5 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    a { color:inherit; }
    button,input,select { font:inherit; }
    .wrap { width:min(1180px,calc(100% - 32px)); margin:auto; }
    header { padding:64px 0 34px; border-bottom:1px solid var(--line); }
    .brand { display:flex; gap:13px; align-items:center; color:var(--orange); font-weight:800; letter-spacing:.05em; text-transform:uppercase; }
    .coin { display:grid; place-items:center; width:34px; height:34px; border-radius:50%; background:var(--orange); color:#111; font-size:22px; }
    h1 { max-width:800px; margin:30px 0 14px; font-size:clamp(2.7rem,7vw,5.5rem); line-height:.94; letter-spacing:-.055em; }
    .lede { max-width:680px; margin:0; color:#c4cad2; font-size:1.16rem; }
    .updated { display:inline-flex; margin-top:24px; padding:8px 12px; border:1px solid var(--line); border-radius:999px; color:var(--muted); font-size:.88rem; }
    main { padding:42px 0 72px; }
    .counts { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; }
    .count-card { min-width:0; padding:18px; text-align:left; color:var(--text); border:1px solid var(--line); border-top:3px solid var(--accent); border-radius:14px; background:linear-gradient(145deg,var(--panel2),var(--panel)); cursor:pointer; }
    .count-card[aria-pressed="true"] { outline:2px solid var(--accent); outline-offset:2px; }
    .count-card span { display:block; font-size:.78rem; }
    .count-card strong { display:block; margin:3px 0 -2px; font-size:2rem; }
    .count-card small { color:var(--muted); }
    .status-done { --accent:var(--green); } .status-progress { --accent:var(--orange); } .status-blocked { --accent:var(--red); } .status-planned { --accent:var(--white); } .status-future { --accent:var(--future); }
    section { margin-top:54px; }
    .section-head { display:flex; justify-content:space-between; gap:24px; align-items:end; margin-bottom:20px; }
    h2 { margin:0; font-size:clamp(1.7rem,4vw,2.6rem); letter-spacing:-.035em; }
    .section-head p { max-width:560px; margin:0; color:var(--muted); }
    .stages { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
    .stage-card { display:flex; min-height:126px; gap:16px; padding:20px; border:1px solid var(--line); border-left:4px solid var(--accent); border-radius:14px; background:var(--panel); }
    .stage-number { display:grid; place-items:center; flex:0 0 42px; height:42px; border-radius:10px; background:#0c0f12; color:var(--accent); font-weight:800; }
    .stage-card h3 { margin:1px 0 5px; font-size:1rem; }
    .stage-card p { margin:0; color:var(--muted); font-size:.86rem; }
    .stage-card .stage-status { color:var(--accent); font-size:.76rem; font-weight:700; }
    .toolbar { position:sticky; top:0; z-index:5; display:grid; grid-template-columns:1fr 190px auto; gap:10px; padding:14px 0; background:rgba(11,13,16,.93); backdrop-filter:blur(14px); }
    .toolbar input,.toolbar select,.toolbar button { min-height:44px; padding:0 13px; color:var(--text); border:1px solid var(--line); border-radius:10px; background:#111419; }
    .toolbar button { cursor:pointer; }
    .results { align-self:center; color:var(--muted); white-space:nowrap; }
    .backlog-list { display:grid; gap:9px; }
    .backlog-row { display:grid; grid-template-columns:100px 1fr auto; gap:20px; align-items:start; padding:20px; border:1px solid var(--line); border-left:4px solid var(--accent); border-radius:12px; background:var(--panel); scroll-margin-top:90px; }
    .backlog-row[hidden] { display:none; }
    .item-id a { color:var(--accent); font-weight:850; text-decoration:none; }
    .item-id span { display:block; margin-top:3px; color:var(--muted); font-size:.76rem; }
    .item-main h3 { margin:0; font-size:1.02rem; }
    .item-main > p { margin:4px 0 10px; color:var(--muted); font-size:.88rem; }
    .dependencies { display:flex; flex-wrap:wrap; gap:6px; align-items:center; font-size:.75rem; }
    .dependencies strong { margin-right:2px; color:#cbd1d8; }
    .dependency { padding:2px 7px; border:1px solid var(--line); border-radius:999px; color:#cbd1d8; text-decoration:none; }
    .dependency:hover { border-color:var(--orange); }
    .muted { color:var(--muted); }
    .status-pill { display:inline-flex; padding:5px 9px; color:var(--accent); border:1px solid color-mix(in srgb,var(--accent) 45%,transparent); border-radius:999px; background:color-mix(in srgb,var(--accent) 8%,transparent); font-size:.78rem; font-weight:750; white-space:nowrap; }
    footer { padding:30px 0 50px; border-top:1px solid var(--line); color:var(--muted); font-size:.88rem; }
    footer .wrap { display:flex; justify-content:space-between; gap:20px; }
    footer a { color:#cbd1d8; }
    @media (max-width:850px) { .counts { grid-template-columns:repeat(2,1fr); } .stages { grid-template-columns:repeat(2,1fr); } .backlog-row { grid-template-columns:82px 1fr; } .backlog-row > :last-child { grid-column:2; } }
    @media (max-width:570px) { header { padding-top:38px; } .wrap { width:min(100% - 22px,1180px); } .counts,.stages { grid-template-columns:1fr; } .section-head { display:block; } .section-head p { margin-top:8px; } .toolbar { grid-template-columns:1fr 1fr; } .toolbar input { grid-column:1/-1; } .results { text-align:right; } .backlog-row { grid-template-columns:1fr; gap:11px; } .backlog-row > :last-child { grid-column:auto; } footer .wrap { display:block; } }
  </style>
</head>
<body>
  <header><div class="wrap">
    <div class="brand"><span class="coin">₿</span><span>BitcoinWalk</span></div>
    <h1>Open work.<br>Visible progress.</h1>
    <p class="lede">The live, colour-coded delivery backlog for BitcoinWalk. This public view is rebuilt automatically from the maintained project tracker.</p>
    <span class="updated">Last reviewed ${escapeHtml(reviewed)}</span>
  </div></header>
  <main class="wrap">
    <div class="counts" aria-label="Backlog status summary">${countCards}</div>
    <section aria-labelledby="stages-title">
      <div class="section-head"><div><h2 id="stages-title">Stages 0–10</h2></div><p>The complete product scope, from protocol decisions and the web foundation through paid-city infrastructure and launch operations.</p></div>
      <div class="stages">${stageCards}</div>
    </section>
    <section aria-labelledby="items-title">
      <div class="section-head"><div><h2 id="items-title">All backlog items</h2></div><p>Search by ID or title, filter by status, or narrow the list to a delivery stage.</p></div>
      <div class="toolbar">
        <input id="search" type="search" placeholder="Search BW-44, dashboard…" aria-label="Search backlog">
        <select id="stage-filter" aria-label="Filter by stage"><option value="">All stages</option>${stages.map((stage) => `<option value="${stage.number}">Stage ${stage.number}: ${escapeHtml(stage.name)}</option>`).join("")}</select>
        <span class="results" id="results">${items.length} items</span>
      </div>
      <div class="backlog-list" id="backlog-list">${itemRows}</div>
    </section>
  </main>
  <footer><div class="wrap"><span>Public tracker generated from the BitcoinWalk delivery backlog.</span><a href="https://github.com/BitcoinWalk/web/blob/main/docs/project-backlog.md">View maintained source</a></div></footer>
  <script>
    const rows=[...document.querySelectorAll('.backlog-row')];
    const search=document.querySelector('#search');
    const stage=document.querySelector('#stage-filter');
    const results=document.querySelector('#results');
    const buttons=[...document.querySelectorAll('[data-filter]')];
    let activeStatus='';
    function applyFilters(){
      const query=search.value.trim().toLowerCase();
      let shown=0;
      for(const row of rows){
        const stages=row.dataset.stage.split(',').map(value=>value.trim());
        const visible=(!query||row.dataset.search.includes(query))&&(!activeStatus||row.dataset.status===activeStatus)&&(!stage.value||stages.includes(stage.value));
        row.hidden=!visible;
        if(visible) shown++;
      }
      results.textContent=shown+' item'+(shown===1?'':'s');
    }
    search.addEventListener('input',applyFilters);
    stage.addEventListener('change',applyFilters);
    for(const button of buttons) button.addEventListener('click',()=>{
      activeStatus=activeStatus===button.dataset.filter?'':button.dataset.filter;
      for(const other of buttons) other.setAttribute('aria-pressed',String(other.dataset.filter===activeStatus));
      applyFilters();
      document.querySelector('#items-title').scrollIntoView({behavior:'smooth'});
    });
  </script>
</body>
</html>`;

const forbidden = [
  /213\.232\.235\.138/,
  /\/var\/backups\//,
  /\/opt\/bitcoinwalk/,
  /npub1[a-z0-9]{20,}/,
  /nsec1[a-z0-9]+/,
];
for (const pattern of forbidden) {
  if (pattern.test(html)) throw new Error(`Public backlog contains forbidden operational detail matching ${pattern}.`);
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDir, "index.html"), html),
  writeFile(path.join(outputDir, ".nojekyll"), ""),
]);

console.log(`Built public backlog: ${items.length} items across ${stages.length} stages.`);
console.log(statusOrder.map((status) => `${status}: ${counts[status]}`).join(" | "));
