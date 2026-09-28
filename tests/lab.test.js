import { test, before } from "node:test";
import assert from "node:assert/strict";
import initSqlJs from "sql.js";

import { buildSql, generateData, distanceKm } from "../src/dataset.js";
import { CHALLENGES } from "../src/challenges.js";
import { compareResults, splitStatements, toCsv } from "../src/grader.js";

let db;
const query = (sql) => db.exec(sql).at(-1);

before(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  db.exec(buildSql());
});

test("dataset is deterministic for a given seed", () => {
  assert.equal(buildSql(1), buildSql(1));
  assert.notEqual(buildSql(1), buildSql(2));
});

test("dataset loads with the expected row counts", () => {
  const counts = Object.fromEntries(
    ["airports", "airlines", "flights", "members", "bookings"].map((t) => [t, query(`SELECT COUNT(*) FROM ${t}`).values[0][0]])
  );
  assert.deepEqual(counts, { airports: 12, airlines: 5, flights: 120, members: 200, bookings: 800 });
  assert.ok(query("SELECT COUNT(*) FROM upgrade_bids").values[0][0] > 50);
});

test("every foreign key and CHECK constraint holds", () => {
  assert.equal(db.exec("PRAGMA foreign_key_check").length, 0);
  assert.equal(query("SELECT COUNT(*) FROM flights WHERE origin = destination").values[0][0], 0);
});

test("great-circle distances are sensible", () => {
  assert.equal(distanceKm("YOW", "YOW"), 0);
  const ottawaToronto = distanceKm("YOW", "YYZ");
  assert.ok(ottawaToronto > 330 && ottawaToronto < 380, `YOW-YYZ was ${ottawaToronto}`);
  assert.equal(distanceKm("YOW", "LHR"), distanceKm("LHR", "YOW"));
});

test("some members never book (so the anti-join challenge is meaningful)", () => {
  const data = generateData();
  const booked = new Set(data.bookings.map((b) => b[1]));
  assert.ok(data.members.some((m) => !booked.has(m[0])));
});

for (const c of CHALLENGES) {
  test(`challenge "${c.title}": reference solution runs, returns rows, and grades itself as correct`, () => {
    const expected = query(c.solution);
    assert.ok(expected && expected.values.length > 0, "solution returned no rows");
    assert.deepEqual(compareResults(expected, expected, { ordered: c.ordered }), { pass: true });
  });
}

test("grader accepts an equivalent query written differently", () => {
  const c = CHALLENGES.find((x) => x.id === "never-booked");
  const expected = query(c.solution);
  const alt = query(`SELECT id, email FROM members m WHERE NOT EXISTS (SELECT 1 FROM bookings b WHERE b.member_id = m.id) ORDER BY email DESC`);
  assert.equal(compareResults(alt, expected).pass, true);
});

test("grader rejects wrong rows, wrong columns and wrong order", () => {
  const c = CHALLENGES.find((x) => x.id === "tier-counts");
  const expected = query(c.solution);
  const reversed = query("SELECT tier, COUNT(*) FROM members GROUP BY tier ORDER BY COUNT(*) ASC");
  const orderResult = compareResults(reversed, expected, { ordered: true });
  assert.equal(orderResult.pass, false);
  assert.match(orderResult.reason, /order/i);

  const extraCol = query("SELECT tier, COUNT(*), 1 FROM members GROUP BY tier");
  assert.match(compareResults(extraCol, expected).reason, /column/);

  const wrong = query("SELECT tier, COUNT(*) + 1 FROM members GROUP BY tier");
  assert.equal(compareResults(wrong, expected).pass, false);
  assert.equal(compareResults(undefined, expected).pass, false);
});

test("grader compares floats to 2 decimals", () => {
  const a = { columns: ["x"], values: [[1.004]] };
  const b = { columns: ["y"], values: [[1.0]] };
  assert.equal(compareResults(a, b).pass, true);
});

test("splitStatements respects strings and comments", () => {
  const parts = splitStatements("SELECT 'a;b'; -- comment; here\nSELECT 2; /* x; y */ SELECT 'it''s';");
  assert.deepEqual(parts, ["SELECT 'a;b'", "SELECT 2", "SELECT 'it''s'"]);
});

test("toCsv escapes commas, quotes and NULLs", () => {
  const csv = toCsv({ columns: ["a", "b"], values: [["x,y", 'say "hi"'], [null, 3]] });
  assert.equal(csv, 'a,b\n"x,y","say ""hi"""\n,3');
});
