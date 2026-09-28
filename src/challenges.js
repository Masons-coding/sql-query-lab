// Graded exercises, ordered from fundamentals to analytics.
// `ordered: true` means row order is part of the answer.

export const CHALLENGES = [
  {
    id: "platinum",
    level: "Basics",
    title: "Platinum members",
    prompt: "List the first name, last name and email of every Platinum member.",
    hint: "Filter rows with WHERE tier = '…'.",
    concepts: ["SELECT", "WHERE"],
    solution: `SELECT first_name, last_name, email
FROM members
WHERE tier = 'Platinum';`,
  },
  {
    id: "tier-counts",
    level: "Basics",
    title: "Members per tier",
    prompt: "How many members are in each tier? Return the tier and the count, largest group first.",
    hint: "GROUP BY the tier and COUNT(*), then ORDER BY the count descending.",
    concepts: ["GROUP BY", "COUNT", "ORDER BY"],
    ordered: true,
    solution: `SELECT tier, COUNT(*) AS members
FROM members
GROUP BY tier
ORDER BY members DESC;`,
  },
  {
    id: "longest",
    level: "Basics",
    title: "Five longest flights",
    prompt: "Show the flight number, origin, destination and distance of the 5 longest flights (longest first). Break ties by flight id.",
    hint: "ORDER BY distance_km DESC, id — then LIMIT.",
    concepts: ["ORDER BY", "LIMIT"],
    ordered: true,
    solution: `SELECT flight_no, origin, destination, distance_km
FROM flights
ORDER BY distance_km DESC, id
LIMIT 5;`,
  },
  {
    id: "ottawa-departures",
    level: "Joins",
    title: "Leaving Ottawa",
    prompt: "For every flight departing YOW, show the flight number, the destination city and the departure time.",
    hint: "JOIN airports ON airports.code = flights.destination.",
    concepts: ["INNER JOIN"],
    solution: `SELECT f.flight_no, a.city, f.departs_at
FROM flights f
JOIN airports a ON a.code = f.destination
WHERE f.origin = 'YOW';`,
  },
  {
    id: "airline-revenue",
    level: "Joins",
    title: "Revenue by airline",
    prompt: "Total booking revenue (sum of fare_cad) per airline name, highest first, rounded to 2 decimals.",
    hint: "bookings → flights → airlines, then SUM and GROUP BY.",
    concepts: ["multi-table JOIN", "SUM", "ROUND"],
    ordered: true,
    solution: `SELECT al.name, ROUND(SUM(b.fare_cad), 2) AS revenue
FROM bookings b
JOIN flights f  ON f.id = b.flight_id
JOIN airlines al ON al.id = f.airline_id
GROUP BY al.name
ORDER BY revenue DESC;`,
  },
  {
    id: "never-booked",
    level: "Joins",
    title: "Members who never flew",
    prompt: "Find the id and email of members who have no bookings at all.",
    hint: "LEFT JOIN bookings and keep rows where the booking is NULL — or use NOT EXISTS.",
    concepts: ["LEFT JOIN", "anti-join", "NOT EXISTS"],
    solution: `SELECT m.id, m.email
FROM members m
LEFT JOIN bookings b ON b.member_id = m.id
WHERE b.id IS NULL;`,
  },
  {
    id: "busy-routes",
    level: "Aggregation",
    title: "Busy routes",
    prompt: "Which routes (origin, destination) have 10 or more bookings? Return origin, destination and the booking count.",
    hint: "WHERE filters rows before grouping; HAVING filters groups after.",
    concepts: ["GROUP BY", "HAVING"],
    solution: `SELECT f.origin, f.destination, COUNT(*) AS bookings
FROM bookings b
JOIN flights f ON f.id = b.flight_id
GROUP BY f.origin, f.destination
HAVING COUNT(*) >= 10;`,
  },
  {
    id: "bid-acceptance",
    level: "Aggregation",
    title: "Upgrade bid acceptance",
    prompt: "For each cabin that received upgrade bids, show the cabin, the number of bids and the % accepted (rounded to 1 decimal).",
    hint: "SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) counts matches inside an aggregate.",
    concepts: ["CASE", "conditional aggregation"],
    solution: `SELECT b.cabin,
       COUNT(*) AS bids,
       ROUND(100.0 * SUM(CASE WHEN u.status = 'accepted' THEN 1 ELSE 0 END) / COUNT(*), 1) AS pct_accepted
FROM upgrade_bids u
JOIN bookings b ON b.id = u.booking_id
GROUP BY b.cabin;`,
  },
  {
    id: "points-balance",
    level: "Aggregation",
    title: "Top point balances",
    prompt: "Show the 10 members with the highest current points balance: member id, full name (first + ' ' + last) and balance. Break ties by id.",
    hint: "Balance = SUM(delta) from points_ledger. Concatenate strings with ||.",
    concepts: ["SUM", "string concatenation"],
    ordered: true,
    solution: `SELECT m.id, m.first_name || ' ' || m.last_name AS name, SUM(p.delta) AS balance
FROM members m
JOIN points_ledger p ON p.member_id = m.id
GROUP BY m.id
ORDER BY balance DESC, m.id
LIMIT 10;`,
  },
  {
    id: "monthly",
    level: "Dates",
    title: "Bookings by month",
    prompt: "Count bookings per booking month (format YYYY-MM), in chronological order.",
    hint: "strftime('%Y-%m', booked_on) extracts the month in SQLite.",
    concepts: ["date functions", "strftime"],
    ordered: true,
    solution: `SELECT strftime('%Y-%m', booked_on) AS month, COUNT(*) AS bookings
FROM bookings
GROUP BY month
ORDER BY month;`,
  },
  {
    id: "above-average",
    level: "Subqueries & CTEs",
    title: "Big spenders",
    prompt: "Using a CTE, find members whose total spend is above the average total spend per member. Return member id and total spend (2 decimals), biggest first.",
    hint: "WITH spend AS (…) SELECT … WHERE total > (SELECT AVG(total) FROM spend).",
    concepts: ["CTE", "subquery"],
    ordered: true,
    solution: `WITH spend AS (
  SELECT member_id, SUM(fare_cad) AS total
  FROM bookings
  GROUP BY member_id
)
SELECT member_id, ROUND(total, 2) AS total
FROM spend
WHERE total > (SELECT AVG(total) FROM spend)
ORDER BY total DESC, member_id;`,
  },
  {
    id: "top-per-tier",
    level: "Window functions",
    title: "Top spender in each tier",
    prompt: "For each tier, return the tier, member id and total spend of its #1 spender (2 decimals).",
    hint: "RANK() OVER (PARTITION BY tier ORDER BY total DESC) inside a CTE, then keep rank = 1.",
    concepts: ["window functions", "RANK", "PARTITION BY"],
    solution: `WITH ranked AS (
  SELECT m.tier, m.id, SUM(b.fare_cad) AS total,
         RANK() OVER (PARTITION BY m.tier ORDER BY SUM(b.fare_cad) DESC) AS rnk
  FROM members m
  JOIN bookings b ON b.member_id = m.id
  GROUP BY m.id
)
SELECT tier, id, ROUND(total, 2)
FROM ranked
WHERE rnk = 1;`,
  },
  {
    id: "running-total",
    level: "Window functions",
    title: "Running points total",
    prompt: "For member 42, list every ledger entry's created_at, delta and running balance, oldest first (tie-break by ledger id).",
    hint: "SUM(delta) OVER (ORDER BY created_at, id) is a running total.",
    concepts: ["window functions", "running totals"],
    ordered: true,
    solution: `SELECT created_at, delta,
       SUM(delta) OVER (ORDER BY created_at, id) AS balance
FROM points_ledger
WHERE member_id = 42
ORDER BY created_at, id;`,
  },
  {
    id: "load-factor",
    level: "Window functions",
    title: "Most-booked flight per airline",
    prompt: "For each airline, return the airline name, flight number and booking count of its most-booked flight (ties: lowest flight id).",
    hint: "ROW_NUMBER() OVER (PARTITION BY airline ORDER BY count DESC, flight id) = 1.",
    concepts: ["ROW_NUMBER", "CTE", "JOIN"],
    solution: `WITH counts AS (
  SELECT f.airline_id, f.id, f.flight_no, COUNT(b.id) AS n
  FROM flights f
  LEFT JOIN bookings b ON b.flight_id = f.id
  GROUP BY f.id
), ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY airline_id ORDER BY n DESC, id) AS rn
  FROM counts
)
SELECT al.name, r.flight_no, r.n
FROM ranked r
JOIN airlines al ON al.id = r.airline_id
WHERE r.rn = 1;`,
  },
];
