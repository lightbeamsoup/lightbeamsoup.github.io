import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  levels,
  campaignKey,
  createGame,
  toggle,
  flick,
  FLICK_COOLDOWN,
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
test("Head-on balls reverse direction at their own speeds, separate, and can pass once the gate opens", () => {
  const g = createGame(campaignKey(0));
  const [a, b] = g.balls;
  Object.assign(a, { x: 200, y: 160, vx: 2, vy: 0 });
  Object.assign(b, { x: 228, y: 160, vx: -1, vy: 0 });
  assert.equal(step(g), 1);
  assert.equal(a.vx, -2);
  assert.equal(b.vx, 1);
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
  assert.equal(b.vx, 0);
  assert.equal(a.vx, -2);
  assert.equal(roomAt(g, a.x, a.y), 1);
});
test("A glancing contact redirects both balls and preserves each speed", () => {
  const g = createGame(campaignKey(0));
  const [a, b] = g.balls;
  Object.assign(a, { x: 200, y: 160, vx: 2, vy: 0 });
  Object.assign(b, { x: 224, y: 175, vx: -1, vy: 0 });
  assert.equal(step(g), 1);
  assert.ok(Math.abs(a.vy) > 0.1 && Math.abs(b.vy) > 0.1);
  assert.ok(Math.abs(Math.hypot(a.vx, a.vy) - 2) < 1e-12);
  assert.ok(Math.abs(Math.hypot(b.vx, b.vy) - 1) < 1e-12);
});
test("The opening lessons offer another pass after missing the first window", () => {
  for (let i = 0; i < 3; i++) {
    const game = createGame(campaignKey(i));
    for (let t = 0; t < 240; t++) step(game);
    const run = playtest(game, 18, 240 + 15 * 60);
    assert.ok(run.won, "Missed opening on level " + (i + 1));
  }
});
test("The resident Mint ball can escape through a gate left open after the first arrival", () => {
  const g = createGame(campaignKey(1));
  const resident = g.balls.find((b) => roomAt(g, b.x, b.y) === b.target);
  assert.equal(resident.target, 1);
  const { events } = playtest(createGame(g.key));
  const [[firstOpen], [firstClose], [secondOpen]] = events;
  let escaped = false;
  for (let tick = 0; tick < secondOpen; tick++) {
    if (tick === firstOpen) assert.ok(toggle(g, 0));
    step(g);
    if (tick > firstClose && roomAt(g, resident.x, resident.y) === 0)
      escaped = true;
  }
  assert.ok(escaped);
});
test("A flick toward the doorway recovers a missed level-two arrival", () => {
  const game = createGame(campaignKey(1));
  for (let t = 0; t < 60; t++) step(game);
  const gatesOnly = playtest(structuredClone(game));
  const ball = game.balls[1],
    gate = game.gates[0];
  assert.ok(ball.x > gate.x1 && ball.vx > 0);
  const speed = Math.hypot(ball.vx, ball.vy);
  const heading = Math.round(
    (Math.atan2((gate.y1 + gate.y2) / 2 - ball.y, gate.x1 - ball.x) * 180) /
      Math.PI,
  );
  assert.ok(flick(game, 1, heading));
  assert.equal(game.moves, 0);
  assert.ok(Math.abs(Math.hypot(ball.vx, ball.vy) - speed) < 1e-12);
  const redirected = playtest(game);
  assert.ok(redirected.won && gatesOnly.won);
  assert.ok(redirected.ticks + 120 <= gatesOnly.ticks);
  const inputs = [[60, "flick", 1, heading], ...redirected.events];
  assert.ok(replayChunk(createGame(game.key), 0, redirected.ticks, inputs));
});
test("Flicks share one charge and recharge only on the exact active tick", () => {
  const g = createGame(campaignKey(1));
  for (const [id, heading] of [
    [-1, 0],
    [g.balls.length, 90],
    [0, 360],
    [0, 1.5],
  ]) {
    assert.equal(flick(g, id, heading), false);
  }
  assert.ok(flick(g, 0, 180));
  assert.ok(!flick(g, 1, 90));
  for (let i = 0; i < FLICK_COOLDOWN - 1; i++) step(g);
  assert.ok(!flick(g, 1, 90));
  step(g);
  assert.ok(flick(g, 1, 90));
  assert.ok(Math.abs(g.balls[1].vx) < 1e-12 && g.balls[1].vy > 0);
});
test("Individual ball speeds stay stable through repeated collisions and wall rebounds", () => {
  const g = createGame(campaignKey(9));
  const speeds = g.balls.map((b) => Math.hypot(b.vx, b.vy));
  let impacts = 0;
  for (let tick = 0; tick < 6000; tick++) {
    impacts += step(g);
    g.balls.forEach((b, i) => {
      assert.ok(Math.abs(Math.hypot(b.vx, b.vy) - speeds[i]) < 1e-10);
    });
  }
  assert.ok(impacts > 100);
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
  const daily = playtest(createGame("daily-v5-2026-11-22"));
  assert.ok(daily.won && daily.events.length <= 10);
  const g = createGame("daily-v5-2026-11-21");
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
  const { token: flickReview } = await (
    await send("/reviews", { board, alias, player })
  ).json();
  const segment = (from, to, inputs) =>
    send("/segment", { token: flickReview, from, to, events: inputs });
  assert.equal((await segment(0, 600, [[550, "flick", 0, 42]])).status, 200);
  assert.equal(
    (await segment(600, 1151, [[1149, "flick", 1, 270]])).status,
    400,
  );
  assert.equal(
    (await segment(600, 1151, [[1150, "flick", 1, 270]])).status,
    200,
  );
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
