// "SkyRewards": a small airline-loyalty database, generated deterministically from a seed
// so every visitor (and every test run) gets exactly the same rows.

export const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE airports (
  code        TEXT PRIMARY KEY,           -- IATA code, e.g. YOW
  city        TEXT NOT NULL,
  country     TEXT NOT NULL
);

CREATE TABLE airlines (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  alliance    TEXT                         -- NULL when unaligned
);

CREATE TABLE flights (
  id             INTEGER PRIMARY KEY,
  airline_id     INTEGER NOT NULL REFERENCES airlines(id),
  flight_no      TEXT NOT NULL,
  origin         TEXT NOT NULL REFERENCES airports(code),
  destination    TEXT NOT NULL REFERENCES airports(code),
  departs_at     TEXT NOT NULL,              -- ISO-8601 timestamp
  distance_km    INTEGER NOT NULL CHECK (distance_km > 0),
  business_seats INTEGER NOT NULL,
  economy_seats  INTEGER NOT NULL,
  CHECK (origin <> destination)
);

CREATE TABLE members (
  id           INTEGER PRIMARY KEY,
  first_name   TEXT NOT NULL,
  last_name    TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  tier         TEXT NOT NULL CHECK (tier IN ('Blue', 'Silver', 'Gold', 'Platinum')),
  joined_on    TEXT NOT NULL,                -- ISO date
  home_airport TEXT REFERENCES airports(code)
);

CREATE TABLE bookings (
  id         INTEGER PRIMARY KEY,
  member_id  INTEGER NOT NULL REFERENCES members(id),
  flight_id  INTEGER NOT NULL REFERENCES flights(id),
  cabin      TEXT NOT NULL CHECK (cabin IN ('Economy', 'Premium', 'Business')),
  fare_cad   REAL NOT NULL,
  booked_on  TEXT NOT NULL
);

CREATE TABLE upgrade_bids (
  id           INTEGER PRIMARY KEY,
  booking_id   INTEGER NOT NULL REFERENCES bookings(id),
  bid_cad      REAL NOT NULL CHECK (bid_cad > 0),
  status       TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
  submitted_at TEXT NOT NULL
);

CREATE TABLE points_ledger (
  id         INTEGER PRIMARY KEY,
  member_id  INTEGER NOT NULL REFERENCES members(id),
  delta      INTEGER NOT NULL,               -- positive = earned, negative = redeemed
  reason     TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_bookings_member ON bookings(member_id);
CREATE INDEX idx_bookings_flight ON bookings(flight_id);
CREATE INDEX idx_flights_origin  ON flights(origin);
CREATE INDEX idx_ledger_member   ON points_ledger(member_id);
`;

const AIRPORTS = [
  ["YOW", "Ottawa", "Canada"],
  ["YYZ", "Toronto", "Canada"],
  ["YUL", "Montreal", "Canada"],
  ["YVR", "Vancouver", "Canada"],
  ["YYC", "Calgary", "Canada"],
  ["JFK", "New York", "USA"],
  ["LAX", "Los Angeles", "USA"],
  ["MIA", "Miami", "USA"],
  ["LHR", "London", "UK"],
  ["CDG", "Paris", "France"],
  ["NRT", "Tokyo", "Japan"],
  ["CUN", "Cancun", "Mexico"],
];

// Approximate great-circle distances (km) between airports, keyed "AAA-BBB"
const COORDS = {
  YOW: [45.32, -75.67], YYZ: [43.68, -79.63], YUL: [45.47, -73.74], YVR: [49.19, -123.18],
  YYC: [51.13, -114.01], JFK: [40.64, -73.78], LAX: [33.94, -118.41], MIA: [25.79, -80.29],
  LHR: [51.47, -0.45], CDG: [49.01, 2.55], NRT: [35.77, 140.39], CUN: [21.04, -86.87],
};

export function distanceKm(a, b) {
  const [lat1, lon1] = COORDS[a].map((d) => (d * Math.PI) / 180);
  const [lat2, lon2] = COORDS[b].map((d) => (d * Math.PI) / 180);
  const h = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)));
}

const AIRLINES = [
  [1, "Maple Air", "Star Alliance"],
  [2, "Northern Lights Airways", "oneworld"],
  [3, "Atlantic Blue", "SkyTeam"],
  [4, "Pacific Crest", "Star Alliance"],
  [5, "Sunward Charters", null],
];

const FIRST = ["Ava", "Liam", "Noah", "Olivia", "Emma", "Lucas", "Mia", "Ethan", "Chloe", "Leo", "Zoe", "Owen", "Maya", "Jack", "Aria", "Ben", "Nora", "Sam", "Isla", "Theo", "Priya", "Arjun", "Mei", "Kenji", "Sofia", "Mateo", "Amara", "Omar", "Hana", "Luca"];
const LAST = ["Tremblay", "Martin", "Roy", "Gagnon", "Lee", "Wilson", "Smith", "Brown", "Singh", "Chen", "Patel", "Nguyen", "Kim", "Garcia", "Cote", "Clarke", "Murphy", "Walsh", "Khan", "Ito"];
const TIERS = [["Blue", 0.45], ["Silver", 0.3], ["Gold", 0.17], ["Platinum", 0.08]];

// Mulberry32: tiny, fast, seedable PRNG
export function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sqlValue = (v) => (v === null ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const insert = (table, rows) =>
  rows.length ? `INSERT INTO ${table} VALUES\n${rows.map((r) => `  (${r.map(sqlValue).join(", ")})`).join(",\n")};\n` : "";

const pad = (n) => String(n).padStart(2, "0");
const isoDate = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const isoTime = (d) => `${isoDate(d)}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00`;

export function generateData(seed = 2026) {
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const day = 86400000;
  const epoch = Date.UTC(2025, 0, 1);

  const flights = [];
  for (let id = 1; id <= 120; id++) {
    const airline = pick(AIRLINES);
    const origin = pick(AIRPORTS)[0];
    let destination = pick(AIRPORTS)[0];
    while (destination === origin) destination = pick(AIRPORTS)[0];
    const departs = new Date(epoch + int(0, 364) * day + int(5, 22) * 3600000 + pick([0, 15, 30, 45]) * 60000);
    const wide = distanceKm(origin, destination) > 3000;
    flights.push([id, airline[0], `${airline[1].slice(0, 2).toUpperCase()}${100 + id * 7}`, origin, destination, isoTime(departs), distanceKm(origin, destination), wide ? int(24, 40) : int(8, 16), wide ? int(220, 300) : int(90, 150)]);
  }

  const members = [];
  for (let id = 1; id <= 200; id++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    let roll = r();
    const tier = TIERS.find(([, p]) => (roll -= p) < 0)?.[0] ?? "Blue";
    const joined = new Date(Date.UTC(2015, 0, 1) + int(0, 3650) * day);
    members.push([id, first, last, `${first}.${last}${id}@example.com`.toLowerCase(), tier, isoDate(joined), r() < 0.9 ? pick(AIRPORTS.slice(0, 5))[0] : null]);
  }

  // Members 190-200 never book anything (useful for anti-join questions)
  const bookings = [];
  for (let id = 1; id <= 800; id++) {
    const member = members[int(0, 188)];
    const flight = pick(flights);
    const tierBoost = { Blue: 0, Silver: 0.05, Gold: 0.12, Platinum: 0.25 }[member[4]];
    const roll = r();
    const cabin = roll < 0.12 + tierBoost ? "Business" : roll < 0.3 + tierBoost ? "Premium" : "Economy";
    const perKm = { Economy: 0.11, Premium: 0.19, Business: 0.42 }[cabin];
    const fare = Math.round((80 + flight[6] * perKm) * (0.8 + r() * 0.5) * 100) / 100;
    const booked = new Date(Date.parse(flight[5] + "Z") - int(3, 120) * day);
    bookings.push([id, member[0], flight[0], cabin, fare, isoDate(booked)]);
  }

  const bids = [];
  let bidId = 1;
  for (const b of bookings) {
    if (b[3] === "Business" || r() > 0.35) continue;
    const status = r() < 0.15 ? "pending" : r() < 0.55 ? "accepted" : "rejected";
    const bid = Math.round(b[4] * (0.25 + r() * 0.6) * 100) / 100;
    const submitted = new Date(Date.parse(b[5] + "T12:00:00Z") + int(1, 3) * day);
    bids.push([bidId++, b[0], bid, status, isoTime(submitted)]);
  }

  const ledger = [];
  let ledgerId = 1;
  const flightById = new Map(flights.map((f) => [f[0], f]));
  for (const b of bookings) {
    const f = flightById.get(b[2]);
    const mult = { Economy: 1, Premium: 1.5, Business: 2 }[b[3]];
    ledger.push([ledgerId++, b[1], Math.round((f[6] / 10) * mult), `Flight ${f[2]}`, `${f[5].slice(0, 10)}T23:00:00`]);
  }
  for (let k = 0; k < 150; k++) {
    const m = members[int(0, 188)];
    ledger.push([ledgerId++, m[0], -pick([500, 1000, 2500, 5000]), pick(["Seat upgrade", "Lounge pass", "Gift card", "Checked bag"]), `2025-${pad(int(1, 12))}-${pad(int(1, 28))}T10:00:00`]);
  }

  return { airports: AIRPORTS, airlines: AIRLINES, flights, members, bookings, upgrade_bids: bids, points_ledger: ledger };
}

export function buildSql(seed) {
  const data = generateData(seed);
  return SCHEMA + Object.entries(data).map(([table, rows]) => insert(table, rows)).join("");
}
