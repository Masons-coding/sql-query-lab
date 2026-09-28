import { buildSql } from "./dataset.js";
import { CHALLENGES } from "./challenges.js";
import { compareResults, splitStatements, toCsv } from "./grader.js";
import { initTabs } from "./ui/tabs.js";

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};
const MAX_ROWS = 500;
const STORAGE_KEY = "sql-lab-solved";

let SQL; // sql.js module
let db; // playground database (your queries can modify it)
let pristine; // bytes of the untouched database, for resets and fair grading
let current = CHALLENGES[0];
let lastResult = null;
const drafts = new Map();
const expectedCache = new Map();
const history = [];

const loadSolved = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
  } catch {
    return new Set();
  }
};
const solved = loadSolved();
const saveSolved = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...solved]));
  } catch {
    /* storage unavailable (private mode) — progress just won't persist */
  }
};

/* ---------------- Database ---------------- */
async function boot() {
  SQL = await window.initSqlJs({ locateFile: (file) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.14.2/${file}` });
  const seed = new SQL.Database();
  seed.exec(buildSql());
  pristine = seed.export();
  seed.close();
  db = new SQL.Database(pristine);
  db.exec("PRAGMA foreign_keys = ON;");

  $("loading").hidden = true;
  $("lab").hidden = false;
  initTabs();
  renderSchema();
  renderChallengeList();
  selectChallenge(CHALLENGES.find((c) => !solved.has(c.id)) || CHALLENGES[0]);
}

const freshCopy = () => {
  const copy = new SQL.Database(pristine);
  copy.exec("PRAGMA foreign_keys = ON;");
  return copy;
};

function expectedFor(challenge) {
  if (!expectedCache.has(challenge.id)) {
    const copy = freshCopy();
    expectedCache.set(challenge.id, copy.exec(challenge.solution).at(-1));
    copy.close();
  }
  return expectedCache.get(challenge.id);
}

/* ---------------- Schema browser ---------------- */
function renderSchema() {
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")[0]?.values.map((r) => r[0]) ?? [];
  const nodes = tables.map((name) => {
    const cols = db.exec(`PRAGMA table_info(${name})`)[0].values; // cid, name, type, notnull, default, pk
    const fks = new Set((db.exec(`PRAGMA foreign_key_list(${name})`)[0]?.values ?? []).map((r) => r[3]));
    const count = db.exec(`SELECT COUNT(*) FROM ${name}`)[0].values[0][0];
    const button = el("button", { type: "button", title: `Preview ${name}` }, el("span", { textContent: name }), el("span", { className: "muted", textContent: `${count} rows` }));
    button.addEventListener("click", () => {
      setEditor(`SELECT *\nFROM ${name}\nLIMIT 20;`);
      run();
    });
    const list = el(
      "ul",
      {},
      ...cols.map(([, col, type, , , pk]) =>
        el("li", {}, el("b", { textContent: col, className: pk ? "pk" : fks.has(col) ? "fk" : "" }), el("span", { textContent: `${type || "ANY"}${pk ? " · PK" : fks.has(col) ? " · FK" : ""}` }))
      )
    );
    return el("div", { className: "schema-table" }, button, list);
  });
  $("schema").replaceChildren(...nodes);
}

/* ---------------- Challenges ---------------- */
function renderChallengeList() {
  const items = [];
  let level = null;
  CHALLENGES.forEach((c, i) => {
    if (c.level !== level) {
      level = c.level;
      items.push(el("li", { className: "level", textContent: level }));
    }
    const button = el("button", { type: "button" }, el("span", { className: "check", textContent: solved.has(c.id) ? "✓" : "" }), el("span", { textContent: `${i + 1}. ${c.title}` }));
    button.setAttribute("aria-current", String(c === current));
    button.addEventListener("click", () => selectChallenge(c));
    items.push(el("li", { className: solved.has(c.id) ? "solved" : "" }, button));
  });
  $("challenge-list").replaceChildren(...items);
  $("progress-text").textContent = `${solved.size} / ${CHALLENGES.length} solved`;
  $("progress-fill").style.width = `${(solved.size / CHALLENGES.length) * 100}%`;
}

function selectChallenge(c) {
  drafts.set(current.id, $("editor").value);
  current = c;
  $("challenge-level").textContent = c.level;
  $("challenge-concepts").replaceChildren(...c.concepts.map((k) => el("span", { className: "tag", textContent: k })));
  $("challenge-title").textContent = c.title;
  $("challenge-prompt").textContent = c.prompt + (c.ordered ? " (Row order matters.)" : "");
  $("hint").hidden = true;
  setEditor(drafts.get(c.id) ?? `-- ${c.title}\n-- Write your query below, then press "Check answer".\n\n`);
  $("verdict").hidden = true;
  renderChallengeList();
}

/* ---------------- Editor ---------------- */
function setEditor(text) {
  const editor = $("editor");
  editor.value = text;
  editor.focus({ preventScroll: true });
  editor.setSelectionRange(text.length, text.length);
}

$("editor").addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    run();
  } else if (e.key === "Tab" && !e.shiftKey) {
    e.preventDefault();
    const t = e.target;
    const { selectionStart: s, selectionEnd: end } = t;
    t.value = t.value.slice(0, s) + "  " + t.value.slice(end);
    t.selectionStart = t.selectionEnd = s + 2;
  }
});

/* ---------------- Results rendering ---------------- */
function renderTable(result) {
  if (!result) {
    $("result").replaceChildren(el("p", { className: "muted small plan", textContent: "Statement executed — no rows returned." }));
    return;
  }
  const head = el("tr", {}, ...result.columns.map((c) => el("th", { textContent: c })));
  const rows = result.values.slice(0, MAX_ROWS).map((row) =>
    el(
      "tr",
      {},
      ...row.map((v) => el("td", { textContent: v === null ? "NULL" : String(v), className: v === null ? "null" : typeof v === "number" ? "num" : "" }))
    )
  );
  $("result").replaceChildren(el("table", {}, el("thead", {}, head), el("tbody", {}, ...rows)));
}

function showError(message) {
  $("result").replaceChildren(el("pre", { className: "output error", textContent: message }));
  $("result-meta").textContent = "";
  $("csv-btn").disabled = true;
}

function pushHistory(sql) {
  if (history[0] === sql) return;
  history.unshift(sql);
  history.length = Math.min(history.length, 15);
  $("history").replaceChildren(
    ...history.map((q) => {
      const b = el("button", { type: "button", textContent: q.replace(/\s+/g, " "), title: q });
      b.addEventListener("click", () => setEditor(q));
      return el("li", {}, b);
    })
  );
}

function execute(target, sql) {
  const t0 = performance.now();
  const results = target.exec(sql);
  return { result: results.at(-1), ms: performance.now() - t0 };
}

function run() {
  const sql = $("editor").value.trim();
  $("verdict").hidden = true;
  if (!sql) return;
  try {
    const { result, ms } = execute(db, sql);
    lastResult = result ?? null;
    renderTable(result);
    const n = result?.values.length ?? 0;
    $("result-meta").textContent = `${n.toLocaleString()} row${n === 1 ? "" : "s"}${n > MAX_ROWS ? ` (showing ${MAX_ROWS})` : ""} · ${ms.toFixed(1)} ms`;
    $("csv-btn").disabled = !result;
    pushHistory(sql);
    if (/\b(create|drop|alter|insert|update|delete)\b/i.test(sql)) renderSchema();
  } catch (err) {
    showError(err.message);
  }
}

function check() {
  const sql = $("editor").value.trim();
  if (!sql) return;
  const copy = freshCopy(); // grade against untouched data
  try {
    const { result, ms } = execute(copy, sql);
    renderTable(result);
    lastResult = result ?? null;
    $("csv-btn").disabled = !result;
    $("result-meta").textContent = `${result?.values.length ?? 0} rows · ${ms.toFixed(1)} ms`;
    const verdict = compareResults(result, expectedFor(current), { ordered: current.ordered });
    const box = $("verdict");
    box.hidden = false;
    box.className = `verdict ${verdict.pass ? "verdict--pass" : "verdict--fail"}`;
    box.textContent = verdict.pass ? "✅ Correct! Nice query." : `❌ Not quite: ${verdict.reason}`;
    if (verdict.pass && !solved.has(current.id)) {
      solved.add(current.id);
      saveSolved();
      renderChallengeList();
    }
    pushHistory(sql);
  } catch (err) {
    showError(err.message);
  } finally {
    copy.close();
  }
}

function explain() {
  const statements = splitStatements($("editor").value);
  const last = statements.at(-1);
  if (!last) return;
  try {
    const result = db.exec(`EXPLAIN QUERY PLAN ${last}`)[0];
    if (!result) return showError("Nothing to explain.");
    // Columns: id, parent, notused, detail — rebuild the tree
    const nodes = new Map([[0, el("ul", { className: "plan" })]]);
    for (const [id, parent, , detail] of result.values) {
      const li = el("li", { textContent: detail, className: /^SCAN/.test(detail) ? "scan" : /^SEARCH/.test(detail) ? "search" : "" });
      const children = el("ul");
      li.append(children);
      nodes.set(id, children);
      (nodes.get(parent) || nodes.get(0)).append(li);
    }
    $("result").replaceChildren(nodes.get(0));
    $("result-meta").textContent = "EXPLAIN QUERY PLAN · green = index lookup, orange = full scan";
    $("verdict").hidden = true;
  } catch (err) {
    showError(err.message);
  }
}

/* ---------------- Buttons ---------------- */
$("run-btn").addEventListener("click", run);
$("check-btn").addEventListener("click", check);
$("explain-btn").addEventListener("click", explain);
$("hint-btn").addEventListener("click", () => {
  $("hint").textContent = current.hint;
  $("hint").hidden = !$("hint").hidden;
});
$("solution-btn").addEventListener("click", () => setEditor(current.solution));
$("reset-btn").addEventListener("click", () => {
  db.close();
  db = new SQL.Database(pristine);
  db.exec("PRAGMA foreign_keys = ON;");
  renderSchema();
  $("result").replaceChildren();
  $("result-meta").textContent = "Database reset to its original state.";
});
$("csv-btn").addEventListener("click", () => {
  if (!lastResult) return;
  const url = URL.createObjectURL(new Blob([toCsv(lastResult)], { type: "text/csv" }));
  const a = el("a", { href: url, download: "query-results.csv" });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

boot().catch((err) => {
  $("loading").textContent = `Couldn't start SQLite: ${err.message}. Please refresh the page.`;
});
