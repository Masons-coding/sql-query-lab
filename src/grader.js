// Grades a learner's result set against the reference solution's result set.
// Column names are ignored (aliases are free); numbers are compared to 2 decimal places;
// row order only matters when the challenge asks for a specific ORDER BY.

const normalize = (v) => {
  if (v === null || v === undefined) return "∅";
  if (typeof v === "number") return String(Math.round(v * 100) / 100 + 0); // +0 turns -0 into 0
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) && /^-?\d+(\.\d+)?$/.test(v.trim())) {
    return normalize(Number(v));
  }
  return String(v);
};

const rowKey = (row) => JSON.stringify(row.map(normalize));

export function compareResults(actual, expected, { ordered = false } = {}) {
  if (!actual) return { pass: false, reason: "Your query didn't return a result set. Make sure it ends with a SELECT." };
  const aCols = actual.columns.length;
  const eCols = expected.columns.length;
  if (aCols !== eCols) return { pass: false, reason: `Expected ${eCols} column${eCols === 1 ? "" : "s"}, got ${aCols}.` };
  if (actual.values.length !== expected.values.length) {
    return { pass: false, reason: `Expected ${expected.values.length} row${expected.values.length === 1 ? "" : "s"}, got ${actual.values.length}.` };
  }

  const a = actual.values.map(rowKey);
  const e = expected.values.map(rowKey);

  if (ordered) {
    const firstBad = a.findIndex((k, i) => k !== e[i]);
    if (firstBad === -1) return { pass: true };
    const sameSet = [...a].sort().join("|") === [...e].sort().join("|");
    return {
      pass: false,
      reason: sameSet ? "Right rows, wrong order — check your ORDER BY." : `Row ${firstBad + 1} doesn't match the expected result.`,
    };
  }

  // Multiset comparison
  const counts = new Map();
  for (const k of e) counts.set(k, (counts.get(k) || 0) + 1);
  for (const k of a) {
    const c = counts.get(k);
    if (!c) return { pass: false, reason: "Some rows don't match the expected result." };
    counts.set(k, c - 1);
  }
  return { pass: true };
}

// Split a script into statements, respecting quotes and comments (for history / explain)
export function splitStatements(sql) {
  const out = [];
  let cur = "";
  let quote = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (!quote && ch === "-" && next === "-") {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end;
      cur += "\n";
      continue;
    }
    if (!quote && ch === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 1;
      continue;
    }
    if (quote) {
      cur += ch;
      if (ch === quote) {
        if (next === quote) {
          cur += next; // escaped quote ('') stays inside the string
          i++;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (ch === "'" || ch === '"') quote = ch;
    if (ch === ";") {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function toCsv({ columns, values }) {
  const cell = (v) => {
    const s = v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns, ...values].map((row) => row.map(cell).join(",")).join("\n");
}
