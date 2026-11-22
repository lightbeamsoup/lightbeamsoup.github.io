// Shared fixed-step simulation. Leaderboards replay the same gate inputs.
export const WIDTH = 780,
  HEIGHT = 316,
  HZ = 60;
export const colors = [
  ["Coral", "#ff917f", "#502e3c", "●"],
  ["Mint", "#79e3c3", "#254448", "◆"],
  ["Honey", "#ffd07c", "#50402e", "▲"],
  ["Iris", "#bba1ff", "#3e3555", "✦"],
  ["Blue", "#88c8ff", "#2c3d56", "■"],
  ["Rose", "#f4a1d2", "#50384c", "♥"],
];
export const levels = [
  ["The Split", "Two colors. Two chambers. One little demon.", ["01"], 1],
  [
    "Short Circuit",
    "One small room makes timing the return trip trickier.",
    ["001", "001"],
    2,
  ],
  [
    "The Elbow",
    "Watch for rebounds around the first corner.",
    ["001", "011"],
    2,
  ],
  [
    "Three’s Company",
    "Route the outer colors through Mint in the middle.",
    ["012"],
    2,
  ],
  ["Dogleg", "Two bends break up the straight route.", ["0012", "0112"], 2],
  ["Cross Purposes", "Four chambers share a loop of gates.", ["01", "32"], 2],
  [
    "Pocket Change",
    "The small Honey pocket fills up quickly.",
    ["0011", "0221", "3331"],
    2,
  ],
  [
    "Switchboard",
    "Use the middle chamber to connect four neighbors.",
    ["00111", "04441", "22233"],
    2,
  ],
  [
    "The Detour",
    "Plan a route through five uneven chambers.",
    ["00112", "03122", "33344"],
    3,
  ],
  [
    "Grand Central",
    "Six colors compete for space at the junctions.",
    ["00011222", "00111122", "55444433", "55544333"],
    3,
  ],
];
// Each teaching ball is [x, y, vx, vy, destination] in board units per tick.
const lessons = [
  // The two travelers glance off one another at the open gate.
  [
    [188, 153, 1.45, -0.06, 1],
    [635, 162, -1.48, 0.06, 0],
  ],
  // Two pairs exchange chambers on staggered approaches.
  [
    [380, 150, 1.42, 0.08, 1],
    [62, 183, 1.35, 0.06, 1],
    [678, 187, -1.4, -0.02, 0],
    [618, 152, 1.25, -0.08, 0],
  ],
  // Three travelers approach three different openings around the elbow.
  [
    [293, 94, 1.4, 0.074, 1],
    [390, 114, 0.028, -0.82, 1],
    [681, 72, -1.28, 0.062, 0],
    [565, 257, -1.26, -0.045, 0],
  ],
  // Outer colors cross two boundaries. Mint belongs in the middle.
  [
    [86, 110, 1.46, 0.11, 2],
    [104, 243, -1.22, -0.32, 0],
    [357, 209, 0.83, -0.25, 1],
    [447, 85, -0.79, 0.48, 1],
    [721, 176, -1.39, -0.11, 0],
    [650, 66, 0.93, 0.49, 2],
  ],
];

// Each destination list is a permutation of the starting rooms.
const transfers = [
  [
    [2, 1, 0],
    [1, 0, 2],
  ],
  [
    [2, 3, 0, 1],
    [0, 1, 2, 3],
  ],
  [
    [1, 3, 0, 2],
    [3, 1, 2, 0],
  ],
  [
    [3, 2, 1, 0, 4],
    [1, 0, 3, 2, 4],
  ],
  [
    [4, 3, 0, 2, 1],
    [2, 4, 3, 1, 0],
  ],
  [
    [3, 4, 5, 0, 1, 2],
    [2, 5, 0, 1, 3, 4],
  ],
];
// Fixed starts tested at 200, 300 and 400 ms between possible gate inputs.
const campaignSeeds = [26, 92, 229, 64, 148, 154];
export const campaignKey = (index) => "level-" + (index + 1) + "-v3";
export const dayKey = (date = new Date()) => date.toISOString().slice(0, 10);
export const dailyBoardKey = (date) => "daily-v3-" + dayKey(date);
export const validBoard = (key) =>
  /^level-(?:[1-9]|10)-v3$/.test(key) || /^daily-v3-\d{4}-\d\d-\d\d$/.test(key);
function rng(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
export function createGame(key) {
  if (!validBoard(key)) throw new Error("Unknown board");
  const daily = key.startsWith("daily-");
  let seed = 7919;
  for (const c of key) seed = (Math.imul(seed, 31) + c.charCodeAt(0)) >>> 0;
  const level = daily ? seed % 3 : Number(key.split("-")[1]) - 1;
  const random = rng(daily ? seed : (campaignSeeds[level - 4] ?? seed));
  const [, , map, campaignCount] = levels[level];
  const perRoom = daily ? [3, 4, 4][level] : campaignCount;
  const rows = map.length,
    cols = map[0].length,
    cw = WIDTH / cols,
    ch = HEIGHT / rows;
  const rooms = Math.max(...map.join("").split("").map(Number)) + 1;
  const walls = [],
    gates = [],
    cells = Array.from({ length: rooms }, () => []);
  const segment = (x1, y1, x2, y2) => ({ x1, y1, x2, y2 });
  walls.push(
    segment(0, 0, WIDTH, 0),
    segment(0, HEIGHT, WIDTH, HEIGHT),
    segment(0, 0, 0, HEIGHT),
    segment(WIDTH, 0, WIDTH, HEIGHT),
  );
  // Merge continuous shared edges so long boundaries get one central gate.
  function divider(x, y, vertical, count, step, a, b) {
    const length = count * step,
      half = daily ? Math.min(54, length * 0.3) : Math.min(73, length * 0.39);
    const part = (a, b) =>
      vertical ? segment(x, y + a, x, y + b) : segment(x + a, y, x + b, y);
    // Pocket Change routes its three outer rooms through the Honey pocket.
    if (level === 6 && a !== "2" && b !== "2") {
      walls.push(part(0, length));
      return;
    }
    walls.push(part(0, length / 2 - half), part(length / 2 + half, length));
    gates.push({
      ...part(length / 2 - half, length / 2 + half),
      vertical,
      open: false,
    });
  }
  for (let c = 1; c < cols; c++)
    for (let r = 0; r < rows; ) {
      const a = map[r][c - 1],
        b = map[r][c];
      if (a === b) {
        r++;
        continue;
      }
      let end = r + 1;
      while (end < rows && map[end][c - 1] === a && map[end][c] === b) end++;
      divider(c * cw, r * ch, true, end - r, ch, a, b);
      r = end;
    }
  for (let r = 1; r < rows; r++)
    for (let c = 0; c < cols; ) {
      const a = map[r - 1][c],
        b = map[r][c];
      if (a === b) {
        c++;
        continue;
      }
      let end = c + 1;
      while (end < cols && map[r - 1][end] === a && map[r][end] === b) end++;
      divider(c * cw, r * ch, false, end - c, cw, a, b);
      c = end;
    }
  map.forEach((row, r) =>
    [...row].forEach((id, c) => cells[Number(id)].push([c * cw, r * ch])),
  );
  const radius = rooms < 3 ? 14 : rooms < 5 ? 10 : 8;
  const balls =
    !daily && level < lessons.length
      ? lessons[level].map(([x, y, vx, vy, target]) => ({
          x,
          y,
          vx,
          vy,
          target,
        }))
      : [];
  if (!balls.length)
    for (let room = 0; room < rooms; room++)
      for (let i = 0; i < perRoom; i++) {
        const cell = cells[room][Math.floor(random() * cells[room].length)];
        let x, y;
        for (let attempt = 0; attempt < 100; attempt++) {
          x = cell[0] + radius + 8 + random() * (cw - 2 * radius - 16);
          y = cell[1] + radius + 8 + random() * (ch - 2 * radius - 16);
          if (balls.every((b) => Math.hypot(x - b.x, y - b.y) > radius * 3.4))
            break;
        }
        const angle = (random() * 0.85 + 0.25) * [1, -1][i % 2],
          speed = (1.45 + random() * 0.52) * (1 + level * 0.022);
        const target = daily
          ? i === 0
            ? (room + 1) % rooms
            : room
          : (transfers[level - 4][i]?.[room] ?? room);
        balls.push({
          x,
          y,
          vx: Number(
            (Math.cos(angle) * speed * (room % 2 ? -1 : 1)).toFixed(6),
          ),
          vy: Number((Math.sin(angle) * speed).toFixed(6)),
          target,
        });
      }
  return {
    key,
    daily,
    level,
    map,
    cells,
    cw,
    ch,
    rooms,
    walls,
    gates,
    balls,
    radius,
    tick: 0,
    moves: 0,
    limit: daily ? 10 : Infinity,
  };
}
export function roomAt(g, x, y) {
  const r = Math.max(0, Math.min(g.map.length - 1, Math.floor(y / g.ch)));
  const c = Math.max(0, Math.min(g.map[0].length - 1, Math.floor(x / g.cw)));
  return Number(g.map[r][c]);
}
export function countSorted(g) {
  return g.balls.reduce(
    (n, b) => n + Number(roomAt(g, b.x, b.y) === b.target),
    0,
  );
}
export function hasWon(g) {
  return (
    g.gates.every((gate) => !gate.open) && countSorted(g) === g.balls.length
  );
}
function nearest(b, s) {
  const dx = b.x - Math.max(s.x1, Math.min(s.x2, b.x)),
    dy = b.y - Math.max(s.y1, Math.min(s.y2, b.y));
  return [dx, dy];
}
export function toggle(g, id) {
  const gate = g.gates[id];
  if (!gate || g.moves >= g.limit) return false;
  if (
    gate.open &&
    g.balls.some((b) => Math.hypot(...nearest(b, gate)) < g.radius + 0.25)
  )
    return false;
  gate.open = !gate.open;
  g.moves++;
  return true;
}
function bounce(b, s, r) {
  const dx = b.x - Math.max(s.x1, Math.min(s.x2, b.x)),
    dy = b.y - Math.max(s.y1, Math.min(s.y2, b.y));
  const dd = dx * dx + dy * dy;
  if (dd >= r * r || dd === 0) return;
  const d = Math.sqrt(dd),
    nx = dx / d,
    ny = dy / d,
    dot = b.vx * nx + b.vy * ny;
  b.x += nx * (r - d);
  b.y += ny * (r - d);
  if (dot < 0) {
    b.vx -= 2 * dot * nx;
    b.vy -= 2 * dot * ny;
  }
}
function contain(ball, game) {
  for (const wall of game.walls) bounce(ball, wall, game.radius);
  for (const gate of game.gates)
    if (!gate.open) bounce(ball, gate, game.radius);
}

function collide(a, b, diameter) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const distanceSquared = dx * dx + dy * dy;
  if (distanceSquared >= diameter * diameter) return null;
  const distance = Math.sqrt(distanceSquared);
  const vx = a.vx - b.vx,
    vy = a.vy - b.vy;
  // At coincident centers, use the incoming relative velocity as the normal.
  const relativeSpeed = distance === 0 ? Math.hypot(vx, vy) : 0;
  const nx = distance ? dx / distance : relativeSpeed ? vx / relativeSpeed : 1;
  const ny = distance ? dy / distance : relativeSpeed ? vy / relativeSpeed : 0;
  const correction = (diameter - distance) / 2;
  a.x -= nx * correction;
  a.y -= ny * correction;
  b.x += nx * correction;
  b.y += ny * correction;
  const approach = vx * nx + vy * ny;
  if (approach <= 0) return 0;
  // Equal masses exchange normal velocity and retain their tangential velocity.
  a.vx -= approach * nx;
  a.vy -= approach * ny;
  b.vx += approach * nx;
  b.vy += approach * ny;
  return 1;
}

export function step(g) {
  for (const ball of g.balls) {
    ball.x += ball.vx;
    ball.y += ball.vy;
    contain(ball, g);
  }
  let impacts = 0;
  const diameter = 2 * g.radius;
  // Recheck walls immediately after separation, including at a closed gate.
  // A second pass settles simultaneous contacts in a cluster.
  for (let pass = 0; pass < 2; pass++) {
    let contact = false;
    for (let i = 0; i < g.balls.length; i++) {
      const a = g.balls[i];
      for (let j = i + 1; j < g.balls.length; j++) {
        const b = g.balls[j];
        const impact = collide(a, b, diameter);
        if (impact === null) continue;
        impacts += impact;
        contain(a, g);
        contain(b, g);
        contact = true;
      }
    }
    if (!contact) break;
  }
  g.tick++;
  return impacts;
}
export const formatTime = (ticks) => {
  const cs = Math.floor((ticks * 100) / HZ);
  return (
    String(Math.floor(cs / 6000)).padStart(2, "0") +
    ":" +
    String(Math.floor(cs / 100) % 60).padStart(2, "0") +
    "." +
    String(cs % 100).padStart(2, "0")
  );
};
