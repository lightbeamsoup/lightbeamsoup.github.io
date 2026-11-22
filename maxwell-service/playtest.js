// Repeatable campaign balance check. Every input goes through the real gate control.
import { pathToFileURL } from "node:url";
import {
  campaignKey,
  createGame,
  step,
  toggle,
  roomAt,
  hasWon,
  HZ,
} from "../maxwell/engine.js";

function roomGraph(game) {
  const edges = game.gates.map((gate) => {
    const x = (gate.x1 + gate.x2) / 2,
      y = (gate.y1 + gate.y2) / 2;
    const dx = Number(gate.vertical),
      dy = Number(!gate.vertical);
    return [roomAt(game, x - dx, y - dy), roomAt(game, x + dx, y + dy)];
  });
  const distances = Array.from({ length: game.rooms }, (_, i) =>
    Array.from({ length: game.rooms }, (_, j) => (i === j ? 0 : Infinity)),
  );
  for (const [a, b] of edges) distances[a][b] = distances[b][a] = 1;
  for (let k = 0; k < game.rooms; k++)
    for (let i = 0; i < game.rooms; i++)
      for (let j = 0; j < game.rooms; j++)
        distances[i][j] = Math.min(
          distances[i][j],
          distances[i][k] + distances[k][j],
        );
  return { edges, distances };
}

export function playtest(game, interval = 12, maxTicks = HZ * 600) {
  const { edges, distances } = roomGraph(game);
  const minimumTransfers = game.balls.reduce(
    (sum, b) => sum + distances[roomAt(game, b.x, b.y)][b.target],
    0,
  );
  const events = [];
  let impacts = 0;
  let longestWait = 0,
    lastInput = game.tick;
  while (game.tick < maxTicks) {
    if (game.tick % interval === 0) {
      const choices = [];
      game.gates.forEach((gate, id) => {
        let nearest = Infinity,
          allow = false;
        for (const b of game.balls) {
          const dx = gate.vertical ? gate.x1 - b.x : gate.y1 - b.y;
          const v = gate.vertical ? b.vx : b.vy;
          const crossing = dx / v;
          if (crossing <= 0 || crossing > 40 || crossing >= nearest) continue;
          const along = gate.vertical
            ? b.y + b.vy * crossing
            : b.x + b.vx * crossing;
          if (
            along < (gate.vertical ? gate.y1 : gate.x1) + game.radius ||
            along > (gate.vertical ? gate.y2 : gate.x2) - game.radius
          )
            continue;
          const [a, z] = edges[id];
          const before = dx > 0 ? a : z,
            after = dx > 0 ? z : a;
          if (roomAt(game, b.x, b.y) !== before) continue;
          nearest = crossing;
          allow = distances[after][b.target] < distances[before][b.target];
        }
        if (gate.open !== allow) choices.push({ id, nearest });
      });
      choices.sort((a, b) => a.nearest - b.nearest);
      for (const { id } of choices) {
        if (toggle(game, id)) {
          longestWait = Math.max(longestWait, game.tick - lastInput);
          lastInput = game.tick;
          events.push([game.tick, id]);
          break;
        }
      }
    }
    impacts += step(game);
    if (hasWon(game)) break;
  }
  return {
    won: hasWon(game),
    impacts,
    ticks: game.tick,
    events,
    minimumTransfers,
    longestWait: Math.max(longestWait, game.tick - lastInput),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const interval = Number(process.argv[2] || 12);
  if (!Number.isInteger(interval) || interval < 1)
    throw new Error("Expected a positive input interval in ticks.");
  const rows = Array.from({ length: 10 }, (_, i) => {
    const g = createGame(campaignKey(i)),
      r = playtest(g, interval);
    return {
      level: i + 1,
      won: r.won,
      impacts: r.impacts,
      seconds: +(r.ticks / HZ).toFixed(1),
      toggles: r.events.length,
      distinctGates: new Set(r.events.map((e) => e[1])).size,
      minimumTransfers: r.minimumTransfers,
      longestWaitSeconds: +(r.longestWait / HZ).toFixed(1),
    };
  });
  console.table(rows);
  if (rows.some((r) => !r.won)) process.exitCode = 1;
}
