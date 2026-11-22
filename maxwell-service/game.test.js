import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  levels,
  createGame,
  toggle,
  step,
  roomAt,
  hasWon,
  countSorted,
} from "../maxwell/engine.js";
import worker, { replayChunk } from "./worker.js";

// A gatekeeper can direct a ball toward its destination using only legal inputs.
function solve(key) {
  const g = createGame(key),
    events = [];
  const edges = g.gates.map((s) => {
    const x = (s.x1 + s.x2) / 2,
      y = (s.y1 + s.y2) / 2,
      dx = Number(s.vertical),
      dy = Number(!s.vertical);
    return [roomAt(g, x - dx, y - dy), roomAt(g, x + dx, y + dy)];
  });
  const dist = Array.from({ length: g.rooms }, (_, i) =>
    Array.from({ length: g.rooms }, (_, j) => (i === j ? 0 : Infinity)),
  );
  edges.forEach(([a, b]) => (dist[a][b] = dist[b][a] = 1));
  for (let k = 0; k < g.rooms; k++)
    for (let i = 0; i < g.rooms; i++)
      for (let j = 0; j < g.rooms; j++)
        dist[i][j] = Math.min(dist[i][j], dist[i][k] + dist[k][j]);
  assert.ok(dist.flat().every(Number.isFinite));
  while (g.tick < 120000) {
    g.gates.forEach((s, i) => {
      let open = false,
        deny = false;
      for (const b of g.balls) {
        const along = s.vertical ? b.y : b.x,
          delta = s.vertical ? s.x1 - b.x : s.y1 - b.y,
          v = s.vertical ? b.vx : b.vy;
        if (
          Math.abs(delta) > g.radius + 12 ||
          delta * v <= 0 ||
          along < (s.vertical ? s.y1 : s.x1) + g.radius ||
          along > (s.vertical ? s.y2 : s.x2) - g.radius
        )
          continue;
        const [a, z] = edges[i],
          before = delta > 0 ? a : z,
          after = delta > 0 ? z : a;
        if (dist[after][b.target] < dist[before][b.target]) open = true;
        else deny = true;
      }
      if (s.open !== (open && !deny) && toggle(g, i)) events.push([g.tick, i]);
    });
    step(g);
    if (hasWon(g)) return { ticks: g.tick, events };
  }
  throw new Error(key + " did not finish");
}
for (let i = 0; i < levels.length; i++)
  test("Level " + (i + 1) + " can be solved and replayed", () => {
    const key = "level-" + (i + 1),
      solution = solve(key),
      g = createGame(key);
    for (let from = 0; from < solution.ticks; from += 600) {
      const to = Math.min(from + 600, solution.ticks);
      assert.equal(
        replayChunk(
          g,
          from,
          to,
          solution.events.filter(([t]) => t >= from && t < to),
        ),
        to === solution.ticks,
      );
    }
  });
test("A sorted board finishes only after the last open gate closes", () => {
  const g = createGame("level-4");
  // Assign every ball to its starting chamber and keep the doorways clear.
  g.balls.forEach((ball) => {
    ball.target = roomAt(g, ball.x, ball.y);
    ball.x = (ball.target + 0.5) * g.cw;
    ball.y = g.ch / 2;
  });
  assert.equal(countSorted(g), g.balls.length);
  assert.equal(replayChunk(g, 0, 1, [[0, 0], [0, 1]]), false);
  assert.equal(replayChunk(g, 1, 2, [[1, 0]]), false);
  assert.equal(replayChunk(g, 2, 3, [[2, 1]]), true);
  g.balls[0].target = (g.balls[0].target + 1) % g.rooms;
  assert.equal(hasWon(g), false);
});
test("Daily boards repeat for everyone and enforce ten toggles", () => {
  assert.ok(solve("daily-2026-11-22").events.length <= 10);
  const g = createGame("daily-2026-11-21");
  assert.deepEqual(g, createGame(g.key));
  g.balls.forEach((b) => {
    b.x = 25;
    b.y = 25;
  });
  for (let i = 0; i < 10; i++) assert.equal(toggle(g, 0), true);
  assert.equal(toggle(g, 0), false);
});
test("D1 SQL stores one verified best per player, isolates boards, and rejects invalid gate inputs", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    readFileSync(
      new URL("./migrations/0001_scores.sql", import.meta.url),
      "utf8",
    ),
  );
  const DB = {
    prepare(query) {
      return {
        bind(...args) {
          const stmt = db.prepare(query);
          return {
            first: () => stmt.get(...args),
            all: () => ({ results: stmt.all(...args) }),
            run: () => ({ meta: stmt.run(...args) }),
          };
        },
      };
    },
    batch(stmts) {
      return stmts.map((s) => s.run());
    },
  };
  const env = { DB, WRITE_LIMIT: { limit: () => ({ success: true }) } };
  const send = (path, data) =>
    worker.fetch(
      new Request(
        "https://scores.test" + path,
        data
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            }
          : {},
      ),
      env,
    );
  const player = crypto.randomUUID(),
    board = "level-1",
    alias = "Test Imp";
  const { ticks, events } = solve(board);
  db.prepare("INSERT INTO scores VALUES(?,?,?,?,?,?)").run(
    board, player, alias, 1, 1, 1,
  );
  for (let run = 0; run < 2; run++) {
    const { token } = await (
      await send("/reviews", { board, alias, player })
    ).json();
    assert.equal(
      (await send("/segment", { token, from: 0, to: 1, events: [[0, 99]] }))
        .status,
      400,
    );
    for (let from = 0; from < ticks; from += 600) {
      const to = Math.min(ticks, from + 600);
      const result = await (
        await send("/segment", {
          token,
          from,
          to,
          events: events.filter(([t]) => t >= from && t < to),
        })
      ).json();
      assert.equal(result.verified, to === ticks);
    }
  }
  const list = await (await send("/scores?board=level-1")).json();
  assert.equal(list.scores.length, 1);
  assert.equal(list.scores[0].ticks, ticks);
  assert.deepEqual(await (await send("/scores?board=level-2")).json(), {
    scores: [],
  });
  db.close();
});
