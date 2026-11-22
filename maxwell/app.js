import {
  levels,
  createGame,
  step,
  toggle,
  countSorted,
  formatTime,
  dayKey,
  HZ,
} from "./engine.js";
import { icon, icons, miniMap, drawBoard } from "./art.js";
const $ = (id) => document.getElementById(id),
  modal = $("modal"),
  body = $("modalBody");
const API = ["localhost", "127.0.0.1"].includes(location.hostname)
  ? "http://127.0.0.1:8787"
  : "https://maxwell-scores.joshcodes-ai.workers.dev";
const cookieName = "maxwell_lab_v1",
  keyFor = (i) => "level-" + (i + 1);
let saved = {};
try {
  saved =
    JSON.parse(
      decodeURIComponent(
        document.cookie
          .split("; ")
          .find((s) => s.startsWith(cookieName + "="))
          ?.slice(cookieName.length + 1) || "%7B%7D",
      ),
    ) || {};
} catch {}
if (typeof saved !== "object" || Array.isArray(saved)) saved = {};
if (!saved.best || typeof saved.best !== "object") saved.best = {};
if (!/^[a-f\d-]{36}$/i.test(saved.player || ""))
  saved.player = crypto.randomUUID();
let cookieOK = true;
function persist() {
  try {
    document.cookie =
      cookieName +
      "=" +
      encodeURIComponent(JSON.stringify(saved)) +
      "; Path=/maxwell/; Max-Age=31536000; SameSite=Lax" +
      (location.protocol === "https:" ? "; Secure" : "");
    cookieOK = document.cookie
      .split("; ")
      .some((v) => v.startsWith(cookieName + "="));
  } catch {
    cookieOK = false;
  }
  $("saveText").textContent = cookieOK
    ? "Progress saved on this device"
    : "Cookies unavailable · session only";
}
let game,
  art,
  mode = "ready",
  events = [],
  acc = 0,
  last = 0,
  ctx,
  ticket = 0,
  tipTimer;
const levelNotes = [
  "Click Maxwell to open or close a gate. Match each ball to its chamber color.",
  "The smaller room sends balls back sooner. Keep an eye on the return trip.",
  "Follow the corner wall. Each shared opening has its own gatekeeper.",
  "The middle chamber doubles as a passage for the two outer colors.",
  "Let a ball finish its turn before you open the next gate.",
  "Try routing balls around the loop in one direction.",
  "Give the smallest pocket a clear exit before sending more balls in.",
  "Open a route through the middle, then close it behind the right ball.",
  "Look one room ahead. A short detour can save you a long wait.",
  "Take it one junction at a time. Watch the colors already at home.",
];
const notes = () =>
  game.daily
    ? "Every open or close counts. Sort all the balls using at most ten gate toggles."
    : levelNotes[game.level];
function tip(message) {
  clearTimeout(tipTimer);
  $("tip").textContent = message;
  tipTimer = setTimeout(() => ($("tip").textContent = notes()), 2700);
}
function chirp(freq, duration = 0.09) {
  if (!saved.sound) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const o = ctx.createOscillator(),
      v = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(
      freq * 1.25,
      ctx.currentTime + duration,
    );
    v.gain.setValueAtTime(0.05, ctx.currentTime);
    v.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    o.connect(v).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + duration);
  } catch {}
}
function audioButton() {
  const label = saved.sound ? "Mute sound" : "Enable sound";
  $("audio").innerHTML = icon(saved.sound ? "sound" : "mute");
  $("audio").title = label;
  $("audio").setAttribute("aria-label", label);
  $("audio").setAttribute("aria-pressed", String(!!saved.sound));
}
function show(html) {
  ticket++;
  body.innerHTML = html;
  icons(body);
  if (!modal.open) modal.showModal();
  return ticket;
}
function endDialog() {
  if (modal.open) modal.close();
  ticket++;
}
function updateRun() {
  const label = {
    ready: "Ready",
    running: "Live",
    paused: "Paused",
    won: "Sorted",
    failed: "Limit reached",
  }[mode];
  $("status").innerHTML = "<b></b>" + label;
  $("status").classList.toggle("live", mode === "running" || mode === "won");
  const name =
    mode === "running"
      ? "Pause"
      : mode === "paused"
        ? "Resume"
        : mode === "won"
          ? "Results"
          : mode === "failed"
            ? "Try again"
            : game.daily
              ? "Start challenge"
              : "Start level";
  $("start").innerHTML =
    icon(mode === "running" ? "pause" : mode === "won" ? "cup" : "play") +
    "<span>" +
    name +
    "</span>";
  $("start").setAttribute("aria-label", name);
}
function stats() {
  $("time").textContent = formatTime(game.tick);
  $("sorted").innerHTML =
    countSorted(game) + " <em>/ " + game.balls.length + "</em>";
  $("moves").innerHTML = game.moves + (game.daily ? " <em>/ 10</em>" : "");
}
function campaignProgress() {
  const cleared = levels.filter((_, i) =>
    Number.isFinite(saved.best[keyFor(i)]),
  ).length;
  $("progressText").textContent = cleared + " / 10";
  $("progressBars").innerHTML = levels
    .map(
      (_, i) => '<b class="' + (saved.best[keyFor(i)] ? "done" : "") + '"></b>',
    )
    .join("");
  $("levelList").innerHTML = "";
  levels.forEach(([name, , map], i) => {
    const el = document.createElement("button"),
      key = keyFor(i),
      best = saved.best[key];
    el.className =
      "levelTile" +
      (key === game.key ? " current" : "") +
      (best ? " cleared" : "");
    el.title =
      "Level " +
      (i + 1) +
      " · " +
      name +
      (best ? " · Best " + formatTime(best) : "");
    el.setAttribute("aria-label", el.title);
    if (key === game.key) el.setAttribute("aria-current", "true");
    el.innerHTML =
      miniMap(map) + "<span>" + String(i + 1).padStart(2, "0") + "</span>";
    el.onclick = () => changeBoard(key);
    $("levelList").append(el);
  });
  $("levelCount").textContent = saved.best[game.key]
    ? "Personal best · " + formatTime(saved.best[game.key])
    : "10 campaign levels";
}
function load(key) {
  clearTimeout(tipTimer);
  endDialog();
  game = createGame(key);
  events = [];
  mode = "ready";
  acc = 0;
  last = 0;
  if (!game.daily) saved.level = game.level;
  persist();
  $("campaign").classList.toggle("active", !game.daily);
  $("daily").classList.toggle("active", game.daily);
  $("modeLabel").textContent = game.daily ? "DAILY CHALLENGE" : "CAMPAIGN";
  $("levelLabel").textContent = game.daily
    ? game.key.slice(6) + " UTC"
    : "LEVEL " + String(game.level + 1).padStart(2, "0");
  $("title").textContent = game.daily ? "Ten Toggles" : levels[game.level][0];
  $("subtitle").textContent = game.daily
    ? "One daily board. Ten gate toggles. Fastest time wins."
    : levels[game.level][1];
  $("tip").textContent = notes();
  art = drawBoard($("board"), game, gateClick);
  stats();
  updateRun();
  campaignProgress();
}
function pause() {
  if (mode === "running") {
    mode = "paused";
    acc = 0;
    updateRun();
  }
}
function changeBoard(key, force = false) {
  if (!force && key === game.key) return;
  if (["running", "paused"].includes(mode) && game.tick > 0) {
    pause();
    show(
      '<div class="eyebrow">CURRENT RUN</div><h2>Leave this run?</h2><p>Your next run will start with a fresh timer.</p><div class="actionrow"><button class="primary" id="leave">Start fresh</button><button class="secondary" id="stay">Keep playing</button></div>',
    );
    $("leave").onclick = () => load(key);
    $("stay").onclick = () => {
      endDialog();
      start();
    };
    return;
  }
  load(key);
}
function start() {
  if (mode === "won") {
    result();
    return;
  }
  if (mode === "failed") load(game.key);
  if (mode === "running") {
    pause();
    return;
  }
  mode = "running";
  last = performance.now();
  acc = 0;
  updateRun();
  chirp(330);
}
function gateClick(i) {
  if (modal.open || ["won", "failed"].includes(mode)) return;
  if (mode === "paused") {
    tip("Resume the timer to use a gate.");
    return;
  }
  if (mode === "ready") start();
  if (!toggle(game, i)) {
    tip(
      game.moves >= game.limit
        ? "All ten toggles used. Watch the remaining balls."
        : "A ball is in the doorway. Try again when it passes.",
    );
    return;
  }
  events.push([game.tick, i]);
  art.paintGates();
  stats();
  chirp(game.gates[i].open ? 500 : 250);
}
function advance(now) {
  if (mode === "running") {
    acc += Math.min(250, Math.max(0, now - last));
    while (acc >= 1000 / HZ && mode === "running") {
      acc -= 1000 / HZ;
      step(game);
      if (countSorted(game) === game.balls.length) {
        mode = "won";
        if (game.daily)
          Object.keys(saved.best)
            .filter((k) => k.startsWith("daily-") && k !== game.key)
            .forEach((k) => delete saved.best[k]);
        saved.best[game.key] = Math.min(
          saved.best[game.key] || Infinity,
          game.tick,
        );
        persist();
        campaignProgress();
        chirp(770, 0.22);
        updateRun();
        result();
      } else if (
        game.moves === game.limit &&
        game.gates.every((g) => !g.open)
      ) {
        mode = "failed";
        updateRun();
        tip("Ten toggles used and all gates are closed. Try a new run.");
      }
    }
    art.paintBalls();
    stats();
  }
  last = now;
  requestAnimationFrame(advance);
}
async function api(path, data) {
  const res = await fetch(
    API + path,
    data
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          signal: AbortSignal.timeout(20000),
        }
      : { signal: AbortSignal.timeout(12000) },
  );
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error || "Leaderboard unavailable.");
  return payload;
}
async function submit(name, g, log, onProgress) {
  const { token } = await api("/reviews", {
    board: g.key,
    player: saved.player,
    alias: name,
  });
  let cursor = 0,
    verified = false;
  for (let from = 0; from < g.tick; from += 600) {
    const to = Math.min(from + 600, g.tick),
      slice = [];
    while (cursor < log.length && log[cursor][0] < to)
      slice.push(log[cursor++]);
    const response = await api("/segment", { token, from, to, events: slice });
    verified = response.verified;
    onProgress(Math.round((100 * to) / g.tick));
  }
  if (!verified) throw new Error("The replay could not be verified.");
}
function result() {
  const g = game,
    log = events.slice(),
    next = g.level + 1;
  const id = show(
    '<img class="modal-sprite" src="assets/maxwell.png" alt=""><div class="eyebrow">ALL BALLS SORTED</div><h2>Order restored!</h2><div class="resulttime">' +
      formatTime(g.tick) +
      "</div><p>" +
      g.moves +
      " gate toggles · Best on this device " +
      formatTime(saved.best[g.key]) +
      '</p><form id="scoreForm"><label for="alias">Leaderboard name</label><input id="alias" required maxlength="18" autocomplete="nickname" placeholder="Little Demon"><div class="actionrow"><button class="primary" type="submit" id="post">Post time</button><button class="secondary" id="next" type="button">' +
      (g.daily ? "View daily ranks" : next < 10 ? "Next level" : "View ranks") +
      '</button></div><p id="postMsg" role="status"></p></form>',
  );
  $("alias").value = saved.alias || "Little Demon";
  $("next").onclick = () => {
    if (!g.daily && next < 10) load(keyFor(next));
    else rankings(g.key);
  };
  $("scoreForm").onsubmit = async (e) => {
    e.preventDefault();
    const name = $("alias").value.trim();
    if (!/^[\p{L}\p{N} _-]{1,18}$/u.test(name)) {
      $("postMsg").textContent =
        "Use 1–18 letters, numbers, spaces, dashes or underscores.";
      return;
    }
    saved.alias = name;
    persist();
    $("post").disabled = true;
    $("postMsg").textContent = "Checking your gate replay…";
    try {
      await submit(name, g, log, (p) => {
        if (ticket === id)
          $("postMsg").textContent = "Checking replay · " + p + "%";
      });
      if (ticket === id) rankings(g.key);
    } catch (err) {
      if (ticket === id) {
        $("post").disabled = false;
        $("postMsg").textContent = "Couldn’t post this time. " + err.message;
      }
    }
  };
}
function rankings(key) {
  pause();
  const today = "daily-" + dayKey();
  const dailyKey = key.startsWith("daily-") ? key : today;
  const options =
    levels
      .map(
        ([name], i) =>
          '<option value="' +
          keyFor(i) +
          '">Level ' +
          (i + 1) +
          " · " +
          name +
          "</option>",
      )
      .join("") +
    '<option value="' +
    dailyKey +
    '">Daily · ' +
    dailyKey.slice(6) +
    " UTC</option>";
  show(
    '<div class="eyebrow">GLOBAL TIMES</div><h2>Leaderboards</h2><label for="boardChoice">Choose a board</label><select id="boardChoice">' +
      options +
      '</select><p id="localBest"></p><div id="results" aria-live="polite"></div>',
  );
  const choice = $("boardChoice");
  choice.value = key;
  async function refresh() {
    const id = ++ticket,
      which = choice.value;
    $("localBest").textContent =
      "Your best · " +
      (saved.best[which] ? formatTime(saved.best[which]) : "No finish yet");
    $("results").textContent = "Loading times…";
    try {
      const { scores } = await api(
        "/scores?board=" + encodeURIComponent(which),
      );
      if (id !== ticket) return;
      const box = $("results");
      box.replaceChildren();
      if (!scores.length) {
        box.textContent =
          "No times posted yet. Be the first to finish this board.";
        return;
      }
      scores.forEach(({ alias, ticks }, i) => {
        const row = document.createElement("div"),
          who = document.createElement("span"),
          time = document.createElement("strong");
        row.className = "rankrow";
        who.textContent = i + 1 + ". " + alias;
        time.textContent = formatTime(ticks);
        row.append(who, time);
        box.append(row);
      });
    } catch {
      if (id === ticket) {
        $("results").textContent = "Global times are unavailable. ";
        const retry = document.createElement("button");
        retry.className = "secondary";
        retry.textContent = "Retry";
        retry.onclick = refresh;
        $("results").append(retry);
      }
    }
  }
  choice.onchange = refresh;
  refresh();
}
$("campaign").onclick = () => changeBoard(keyFor(saved.level || 0));
$("daily").onclick = () => changeBoard("daily-" + dayKey());
$("ranks").onclick = () => rankings(game.key);
$("start").onclick = start;
$("restart").onclick = () => changeBoard(game.key, true);
$("audio").onclick = () => {
  saved.sound = !saved.sound;
  persist();
  audioButton();
  chirp(490);
};
$("help").onclick = () => {
  pause();
  show(
    '<img class="modal-sprite" src="assets/maxwell.png" alt=""><div class="eyebrow">FIELD GUIDE</div><h2>How to play</h2><p>Get every ball into the chamber that matches its color. They bounce on their own. You control the gates.</p><ol><li>Start the level and watch the balls approach.</li><li>Click a demon or the striped gate to let balls through. Click again to close it once the doorway is clear.</li><li>The timer stops when every ball is home. Post your time to compete worldwide.</li></ol><p><kbd>Space</kbd> pauses or resumes. Tab to a gate and press Enter to toggle it. Daily challenges reset at midnight UTC.</p>',
  );
};
$("dismiss").onclick = endDialog;
modal.addEventListener("close", () => {
  if (!modal.open) ticket++;
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});
document.addEventListener("keydown", (e) => {
  if (modal.open || e.repeat) return;
  if (
    e.code === "Space" &&
    (document.activeElement === document.body ||
      document.activeElement === $("start") ||
      document.activeElement === $("board"))
  ) {
    e.preventDefault();
    start();
  } else if (/^[1-9]$/.test(e.key) && Number(e.key) <= game.gates.length) {
    gateClick(Number(e.key) - 1);
  }
});
icons();
audioButton();
load(
  keyFor(
    Number.isInteger(saved.level) && saved.level >= 0 && saved.level < 10
      ? saved.level
      : 0,
  ),
);
requestAnimationFrame(advance);
