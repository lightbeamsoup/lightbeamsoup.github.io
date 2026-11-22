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
  ["The Split", "Two colors. Two chambers. One little demon.", ["01"], 4],
  [
    "Short Circuit",
    "One small room makes timing the return trip trickier.",
    ["001", "001"],
    5,
  ],
  [
    "The Elbow",
    "Watch for rebounds around the first corner.",
    ["001", "011"],
    5,
  ],
  [
    "Three’s Company",
    "Route the outer colors through Mint in the middle.",
    ["012"],
    3,
  ],
  ["Dogleg", "Two bends break up the straight route.", ["0012", "0112"], 3],
  ["Cross Purposes", "Four chambers share a loop of gates.", ["01", "32"], 3],
  [
    "Pocket Change",
    "The small Honey pocket fills up quickly.",
    ["0011", "0221", "3331"],
    3,
  ],
  [
    "Switchboard",
    "Use the middle chamber to connect four neighbors.",
    ["00111", "04441", "22233"],
    3,
  ],
  [
    "The Detour",
    "Plan a route through five uneven chambers.",
    ["00112", "03122", "33344"],
    4,
  ],
  [
    "Grand Central",
    "Six colors compete for space at the junctions.",
    ["001122", "033142", "335544"],
    4,
  ],
];
export const dayKey = (date = new Date()) => date.toISOString().slice(0, 10);
export const validBoard = (key) =>
  /^level-(?:[1-9]|10)$/.test(key) || /^daily-\d{4}-\d\d-\d\d$/.test(key);
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
  const random = rng(seed);
  const level = daily ? seed % 3 : Number(key.slice(6)) - 1;
  const [, , map, perRoom] = levels[level];
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
  function divider(x, y, vertical, count, step) {
    const length = count * step,
      half = Math.min(54, length * 0.3);
    const part = (a, b) =>
      vertical ? segment(x, y + a, x, y + b) : segment(x + a, y, x + b, y);
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
      divider(c * cw, r * ch, true, end - r, ch);
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
      divider(c * cw, r * ch, false, end - c, cw);
      c = end;
    }
  map.forEach((row, r) =>
    [...row].forEach((id, c) => cells[Number(id)].push([c * cw, r * ch])),
  );
  const radius = rooms < 3 ? 14 : rooms < 5 ? 10 : 8;
  const balls = [];
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
      const target =
        i < (daily ? 1 : Math.ceil(perRoom / 2)) ? (room + 1) % rooms : room;
      balls.push({
        x,
        y,
        vx: Math.cos(angle) * speed * (room % 2 ? -1 : 1),
        vy: Math.sin(angle) * speed,
        target,
      });
    }
  if (level === 0 && !daily) {
    const positions = [
      [101, 79],
      [254, 205],
      [295, 91],
      [119, 233],
      [498, 206],
      [670, 82],
      [501, 77],
      [669, 241],
    ];
    balls.forEach((b, i) => {
      [b.x, b.y] = positions[i];
    });
    Object.assign(balls[1], { vx: 1.65, vy: -0.54 });
    Object.assign(balls[4], { vx: -1.6, vy: -0.55 });
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
  return g.gates.every((gate) => !gate.open) && countSorted(g) === g.balls.length;
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
export function step(g) {
  for (const b of g.balls) {
    b.x += b.vx;
    b.y += b.vy;
    for (const s of g.walls) bounce(b, s, g.radius);
    for (const gate of g.gates) if (!gate.open) bounce(b, gate, g.radius);
  }
  g.tick++;
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
