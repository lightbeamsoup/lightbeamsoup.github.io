import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  levels,
  campaignKey,
  createGame,
  toggle,
  step,
  roomAt,
  hasWon,
  countSorted,
} from "../maxwell/engine.js";
import { playtest } from "./playtest.js";
import worker, { replayChunk } from "./worker.js";

for (let i = 0; i < levels.length; i++)
  test("Level " + (i + 1) + " can be solved and replayed", () => {
    const key = campaignKey(i),
      solution = playtest(createGame(key)),
      g = createGame(key);
    const slower = playtest(createGame(key), 24);
    const previousPerColor = [2, 3, 3, 3, 3, 3, 3, 3, 4, 4][i];
    for (let color = 0; color < g.rooms; color++) {
      assert.equal(
        g.balls.filter((ball) => ball.target === color).length,
        previousPerColor - 1,
      );
    }
    assert.ok(
      solution.impacts > 0,
      "The winning run includes a ball collision",
    );
    assert.ok(slower.won && slower.longestWait <= 15 * 60);
    assert.ok(solution.won);
    assert.ok(solution.longestWait <= 15 * 60, "long idle stretch");
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
test("Head-on balls exchange velocity, separate, and can pass once the gate opens", () => {
  const g = createGame(campaignKey(0));
  const [a, b] = g.balls;
  Object.assign(a, { x: 200, y: 160, vx: 2, vy: 0 });
  Object.assign(b, { x: 228, y: 160, vx: -1, vy: 0 });
  assert.equal(step(g), 1);
  assert.equal(a.vx, -1);
  assert.equal(b.vx, 2);
  assert.equal(b.x - a.x, 2 * g.radius);
  assert.equal(step(g), 0);
  Object.assign(a, { x: 350, y: 160, vx: 2, vy: 0 });
  Object.assign(b, { x: 432, y: 160, vx: 0, vy: 0 });
  for (let i = 0; i < 30; i++) step(g);
  assert.equal(b.vx, 0);
  assert.equal(roomAt(g, a.x, a.y), 0);
  assert.ok(toggle(g, 0));
  Object.assign(a, { x: 350, y: 160, vx: 2, vy: 0 });
  for (let i = 0; i < 30; i++) step(g);
  assert.equal(b.vx, 2);
  assert.equal(roomAt(g, a.x, a.y), 1);
});
test("A glancing contact conserves momentum and kinetic energy", () => {
  const g = createGame(campaignKey(0));
  const [a, b] = g.balls;
  Object.assign(a, { x: 200, y: 160, vx: 2, vy: 0 });
  Object.assign(b, { x: 224, y: 175, vx: -1, vy: 0 });
  assert.equal(step(g), 1);
  assert.ok(Math.abs(a.vy) > 0.1 && Math.abs(b.vy) > 0.1);
  assert.ok(Math.abs(a.vx + b.vx - 1) < 1e-12 && Math.abs(a.vy + b.vy) < 1e-12);
  assert.ok(
    Math.abs(a.vx ** 2 + a.vy ** 2 + b.vx ** 2 + b.vy ** 2 - 5) < 1e-12,
  );
});
test("The opening lessons offer another pass after missing the first window", () => {
  for (let i = 0; i < 3; i++) {
    const game = createGame(campaignKey(i));
    for (let t = 0; t < 240; t++) step(game);
    const run = playtest(game, 18, 240 + 15 * 60);
    assert.ok(run.won, "Missed opening on level " + (i + 1));
  }
});
test("A sorted board finishes only after the last open gate closes", () => {
  const g = createGame(campaignKey(3));
  // Assign every ball to its starting chamber and keep the doorways clear.
  g.balls.forEach((ball) => {
    ball.target = roomAt(g, ball.x, ball.y);
    ball.x = (ball.target + 0.5) * g.cw;
    ball.y = g.ch / 2;
  });
  assert.equal(countSorted(g), g.balls.length);
  assert.equal(
    replayChunk(g, 0, 1, [
      [0, 0],
      [0, 1],
    ]),
    false,
  );
  assert.equal(replayChunk(g, 1, 2, [[1, 0]]), false);
  assert.equal(replayChunk(g, 2, 3, [[2, 1]]), true);
  g.balls[0].target = (g.balls[0].target + 1) % g.rooms;
  assert.equal(hasWon(g), false);
});
test("Daily boards repeat for everyone and enforce ten toggles", () => {
  const daily = playtest(createGame("daily-v3-2026-11-22"));
  assert.ok(daily.won && daily.events.length <= 10);
  const g = createGame("daily-v3-2026-11-21");
  for (let color = 0; color < g.rooms; color++) {
    assert.equal(
      g.balls.filter((b) => b.target === color).length,
      [3, 4, 4][g.level],
    );
  }
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
    board = campaignKey(0),
    alias = "Test Imp";
  const { ticks, events } = playtest(createGame(board));
  db.prepare("INSERT INTO scores VALUES(?,?,?,?,?,?)").run(
    "sealed/level-1",
    player,
    alias,
    1,
    1,
    1,
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
  const list = await (await send("/scores?board=" + board)).json();
  assert.equal(list.scores.length, 1);
  assert.equal(list.scores[0].ticks, ticks);
  assert.deepEqual(
    await (await send("/scores?board=" + campaignKey(1))).json(),
    {
      scores: [],
    },
  );
  db.close();
});
