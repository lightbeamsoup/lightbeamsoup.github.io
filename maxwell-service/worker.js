import {
  createGame,
  validBoard,
  step,
  toggle,
  hasWon,
  dayKey,
} from "../maxwell/engine.js";

const origins = new Set(["https://www.joshcodes.ai", "https://joshcodes.ai"]);
const headers = { "Cache-Control": "no-store", Vary: "Origin" };
const chunkTicks = 600;
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const json = (data, status, extra) =>
  Response.json(data, { status, headers: { ...headers, ...extra } });

export function replayChunk(game, from, to, events) {
  if (
    !Number.isSafeInteger(to) ||
    to <= from ||
    to > from + chunkTicks ||
    !Array.isArray(events) ||
    events.length > chunkTicks * 2
  )
    fail("Invalid replay segment.");
  let i = 0;
  for (; game.tick < to; ) {
    while (
      i < events.length &&
      Array.isArray(events[i]) &&
      events[i][0] === game.tick
    ) {
      const id = events[i++][1];
      if (!Number.isInteger(id) || !toggle(game, id))
        fail("Gate replay did not match.");
    }
    step(game);
    if (hasWon(game) && game.tick !== to)
      fail("Run already finished.");
  }
  if (i !== events.length) fail("Gate inputs out of order.");
  return hasWon(game);
}
async function api(request, env, url) {
  const board = url.searchParams.get("board") || "";
  if (request.method === "GET" && url.pathname === "/scores") {
    if (!validBoard(board)) fail("Unknown board.");
    const { results } = await env.DB.prepare(
      "SELECT alias,ticks,moves FROM scores WHERE board=('sealed/' || ?) ORDER BY ticks,created,player LIMIT 20",
    )
      .bind(board)
      .all();
    return { scores: results };
  }
  if (
    request.method !== "POST" ||
    !["/reviews", "/segment"].includes(url.pathname)
  )
    fail("Unknown route.", 404);
  const permitted = await env.WRITE_LIMIT.limit({
    key: request.headers.get("CF-Connecting-IP") || "local",
  });
  if (!permitted.success)
    fail("Too many requests. Try again in a minute.", 429);
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    fail("Expected JSON.", 415);
  if (Number(request.headers.get("Content-Length")) > 32000)
    fail("Request too large.", 413);
  const raw = await request.text();
  if (raw.length > 32000) fail("Request too large.", 413);
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    fail("Invalid JSON.");
  }
  if (!body || typeof body !== "object") fail("Invalid request.");
  const now = Date.now();
  if (url.pathname === "/reviews") {
    const { board, player, alias } = body;
    if (
      !validBoard(String(board)) ||
      (board.startsWith("daily-") &&
        ![dayKey(), dayKey(new Date(now - 86400000))].some(
          (d) => board === "daily-" + d,
        ))
    )
      fail("Unknown or expired board.");
    if (
      typeof alias !== "string" ||
      !/^[\p{L}\p{N} _-]{1,18}$/u.test(alias.trim()) ||
      !/^[a-f0-9-]{36}$/i.test(String(player))
    )
      fail(
        "Use a name of 1–18 letters, numbers, spaces, dashes or underscores.",
      );
    const token = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO reviews(token,board,player,alias,expires) VALUES(?,?,?,?,?)",
    )
      .bind(token, board, player, alias.trim(), now + 3600000)
      .run();
    return { token };
  }
  const { token, from, to, events } = body;
  if (
    typeof token !== "string" ||
    token.length !== 36 ||
    !Number.isSafeInteger(from)
  )
    fail("Invalid run.");
  const row = await env.DB.prepare(
    "SELECT * FROM reviews WHERE token=? AND expires>?",
  )
    .bind(token, now)
    .first();
  if (!row) fail("Run expired. Submit again.", 410);
  if (row.tick !== from) fail("Run position changed. Submit again.", 409);
  const g = createGame(row.board);
  if (row.state) {
    const state = JSON.parse(row.state);
    g.balls = state.balls;
    g.moves = state.moves;
    g.tick = row.tick;
    state.open.forEach((open, i) => (g.gates[i].open = open));
  }
  const won = replayChunk(g, from, to, events);
  if (won) {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO scores(board,player,alias,ticks,moves,created) SELECT 'sealed/' || board,player,alias,?,?,? FROM reviews WHERE token=? AND tick=? ON CONFLICT(board,player) DO UPDATE SET ticks=excluded.ticks,moves=excluded.moves,alias=excluded.alias,created=excluded.created WHERE excluded.ticks<scores.ticks",
      ).bind(g.tick, g.moves, now, token, from),
      env.DB.prepare("DELETE FROM reviews WHERE token=? AND tick=?").bind(
        token,
        from,
      ),
    ]);
  } else {
    const state = JSON.stringify({
      balls: g.balls,
      moves: g.moves,
      open: g.gates.map((s) => s.open),
    });
    const result = await env.DB.prepare(
      "UPDATE reviews SET tick=?,state=? WHERE token=? AND tick=?",
    )
      .bind(to, state, token, from)
      .run();
    if (!result.meta.changes) fail("Concurrent review. Submit again.", 409);
  }
  return { verified: won, tick: g.tick };
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin"),
      local = new URL(request.url).hostname;
    const allowed =
      origins.has(origin) ||
      (["127.0.0.1", "localhost"].includes(local) &&
        /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || ""));
    if (origin && !allowed) return json({ error: "Origin unavailable." }, 403);
    const cors = allowed
      ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        }
      : {};
    if (request.method === "OPTIONS")
      return new Response(null, {
        status: 204,
        headers: { ...headers, ...cors },
      });
    try {
      return json(await api(request, env, new URL(request.url)), 200, cors);
    } catch (e) {
      if (!e.status) console.error(e);
      return json(
        { error: e.status ? e.message : "Scores are temporarily unavailable." },
        e.status || 500,
        cors,
      );
    }
  },
  async scheduled(_event, env) {
    await env.DB.prepare("DELETE FROM reviews WHERE expires < ?")
      .bind(Date.now())
      .run();
  },
};
