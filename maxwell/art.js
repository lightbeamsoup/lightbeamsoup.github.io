import { WIDTH, HEIGHT, colors, roomAt } from "./engine.js";
const paths = {
  pad: "M7 8h10c3 0 4 2 5 9 .3 3-2 4-4 2l-3-3H9l-3 3c-2 2-4 1-4-2 1-7 2-9 5-9z M6 12h5m-2.5-2.5v5m7-2.5h.1m3 2h.1",
  bolt: "m13 2-9 12h7l-1 8 10-13h-8z",
  cup: "M7 3h10v6a5 5 0 0 1-10 0z M7 5H3v2a5 5 0 0 0 5 5m9-7h4v2a5 5 0 0 1-5 5m-4 2v6m-5 1h10",
  mute: "m3 9 4 0 5-4v14l-5-4H3z M16 9l5 6m0-6-5 6",
  sound: "m3 9 4 0 5-4v14l-5-4H3z M16 8q4 4 0 8m3-11q7 7 0 14",
  help: "M22 12a10 10 0 1 1-20 0 10 10 0 1 1 20 0 M9 9a3 3 0 1 1 4 3c-1 .5-1 1-1 2m0 3h.01",
  scope:
    "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5 M15 12a3 3 0 1 1-6 0 3 3 0 1 1 6 0",
  play: "m6 3 14 9-14 9z",
  pause: "M7 4v16m10-16v16",
  restart: "M3 5v6h6 M3 11a9 9 0 1 1 1 7",
  stats: "M4 20V9m7 11V4m7 16v-7",
  clock: "M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 1 1 18 0",
  balls:
    "M10 16a4 4 0 1 1-8 0 4 4 0 1 1 8 0m12 0a4 4 0 1 1-8 0 4 4 0 1 1 8 0m-6-9a4 4 0 1 1-8 0 4 4 0 1 1 8 0",
  gate: "M4 3v18m16-18v18M7 6h10M7 12h10M7 18h10",
  note: "M5 3h14v14l-4 4H5z M8 7h8M8 11h6m0 10v-5h5",
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  close: "M5 5l14 14m0-14L5 19",
};
export function icon(name) {
  return (
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="' +
    (name === "play" ? "currentColor" : "none") +
    '" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="' +
    paths[name] +
    '"/></svg>'
  );
}
export function icons(el = document) {
  el.querySelectorAll("[data-icon]").forEach(
    (i) => (i.innerHTML = icon(i.dataset.icon)),
  );
}
export function miniMap(map) {
  const rows = map.length,
    cols = map[0].length,
    w = 25 / cols,
    h = 17 / rows;
  let s = '<rect x="1" y="2" width="25" height="17" rx="2"/>';
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = 1 + c * w,
        y = 2 + r * h;
      if (c && map[r][c - 1] !== map[r][c])
        s += '<path d="M' + x + " " + y + "v" + h + '"/>';
      if (r && map[r - 1][c] !== map[r][c])
        s += '<path d="M' + x + " " + y + "h" + w + '"/>';
    }
  return (
    '<svg aria-hidden="true" viewBox="0 0 28 22" fill="none" stroke="currentColor" stroke-width="1.5">' +
    s +
    "</svg>"
  );
}
const line = (s, stroke, width, extra = "") =>
  '<line x1="' +
  s.x1 +
  '" y1="' +
  s.y1 +
  '" x2="' +
  s.x2 +
  '" y2="' +
  s.y2 +
  '" stroke="' +
  stroke +
  '" stroke-width="' +
  width +
  '" ' +
  extra +
  "/>";
const rect = (x, y, w, h, fill, rx = 0) =>
  '<rect x="' +
  x +
  '" y="' +
  y +
  '" width="' +
  w +
  '" height="' +
  h +
  '" rx="' +
  rx +
  '" fill="' +
  fill +
  '"/>';
const circle = (x, y, r, fill) =>
  '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + fill + '"/>';
const text = (x, y, content, fill, style = "") =>
  '<text x="' +
  x +
  '" y="' +
  y +
  '" fill="' +
  fill +
  '" ' +
  style +
  ">" +
  content +
  "</text>";
export function drawBoard(svg, g, onToggle) {
  const shape = "M12 0H768L780 12V304L768 316H12L0 304V12Z";
  let defs =
    '<clipPath id="arenaClip"><path d="' +
    shape +
    '"/></clipPath><pattern id="grid" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M22 0H0V22" fill="none" stroke="#faf7ff" stroke-opacity=".084" stroke-width="1"/><circle cx="0" cy="0" r="1.2" fill="#fff" opacity=".18"/></pattern><pattern id="hazard" width="11" height="11" patternUnits="userSpaceOnUse" patternTransform="rotate(32)"><rect width="4" height="11" fill="#b7a1cb"/></pattern>';
  colors.forEach(([, col], i) => {
    defs +=
      '<radialGradient id="orb' +
      i +
      '" cx=".35" cy=".23" r=".90"><stop stop-color="#fff" stop-opacity=".96"/><stop offset=".25" stop-color="' +
      col +
      '"/><stop offset=".75" stop-color="' +
      col +
      '"/><stop offset="1" stop-color="#3c283c"/></radialGradient>';
  });
  let floor = "",
    labels = "",
    walls = "";
  g.cells.forEach((cells, i) => {
    const [name, ink, base, symbol] = colors[i];
    for (const [x, y] of cells)
      floor += rect(x, y, g.cw + 0.15, g.ch + 0.15, base);
    const [x, y] = cells[0],
      long = g.cw > 140,
      label = long ? name.toUpperCase() : symbol;
    const lx = x + 13,
      ly = y + 12;
    labels +=
      rect(lx, ly, long ? label.length * 8 + 37 : 25, 23, base, 5) +
      text(
        lx + 7,
        ly + 16,
        long ? symbol + " " + label : label,
        ink,
        'font-size="13" font-weight="bold" letter-spacing="1.1" font-family="monospace"',
      );
    // Color the inner edge along its owning chamber, including irregular corners.
    for (const [x, y] of cells) {
      const c = Math.round(x / g.cw),
        r = Math.round(y / g.ch),
        id = String(i),
        pad = 3.5;
      if (g.map[r - 1]?.[c] !== id) floor += rect(x, y + pad, g.cw, 2.5, ink);
      if (g.map[r + 1]?.[c] !== id)
        floor += rect(x, y + g.ch - pad - 2.5, g.cw, 2.5, ink);
      if (g.map[r]?.[c - 1] !== id) floor += rect(x + pad, y, 2.5, g.ch, ink);
      if (g.map[r]?.[c + 1] !== id)
        floor += rect(x + g.cw - pad - 2.5, y, 2.5, g.ch, ink);
    }
  });
  for (const gate of g.gates) {
    const { x1, y1, x2, y2, vertical } = gate,
      mx = (x1 + x2) / 2,
      my = (y1 + y2) / 2;
    const near =
      colors[roomAt(g, mx - (vertical ? 1 : 0), my - (vertical ? 0 : 1))][2];
    const far =
      colors[roomAt(g, mx + (vertical ? 1 : 0), my + (vertical ? 0 : 1))][2];
    floor += vertical
      ? rect(x1 - 7, y1, 7, y2 - y1, near) + rect(x1, y1, 7, y2 - y1, far)
      : rect(x1, y1 - 7, x2 - x1, 7, near) + rect(x1, y1, x2 - x1, 7, far);
  }
  for (const w of g.walls)
    walls += line(w, "#1a1521", 9) + line(w, "#756780", 3);
  let screws = "";
  for (const x of [-8, WIDTH + 8])
    for (const y of [-7, HEIGHT + 7])
      screws +=
        circle(x, y, 4.1, "#19141f") +
        line(
          { x1: x - 2, y1: y + 1.5, x2: x + 2, y2: y - 1.5 },
          "#94839a",
          1.3,
        );
  let marks = "";
  for (const y of [-10, HEIGHT + 10])
    for (const x of [55, WIDTH - 105])
      for (let j = 0; j < 7; j++)
        marks += rect(x + j * 8, y, 4, 2.5, "#8e7c99", 1);
  svg.innerHTML =
    "<defs>" +
    defs +
    '</defs><g transform="translate(30 42)">' +
    rect(-17, -17, WIDTH + 34, HEIGHT + 39, "#100e16", 19) +
    rect(-17, -20, WIDTH + 34, HEIGHT + 36, "#706477", 19) +
    rect(-17, -17, WIDTH + 34, HEIGHT + 34, "#44394c", 18) +
    rect(-11, -11, WIDTH + 22, HEIGHT + 22, "#231e2a", 13) +
    '<g clip-path="url(#arenaClip)">' +
    floor +
    rect(0, 0, WIDTH, HEIGHT, "url(#grid)") +
    labels +
    walls +
    "</g>" +
    marks +
    screws +
    '<g class="orbs"></g><g class="doors"></g></g>';
  const orbs = svg.querySelector(".orbs"),
    doors = svg.querySelector(".doors");
  orbs.innerHTML = g.balls
    .map((b) => {
      const r = g.radius,
        ink = colors[b.target][1];
      return (
        '<g><g class="trail" opacity=".45">' +
        circle(-r * 1.4, 0, r * 0.22, ink) +
        circle(-r * 2.1, 0, r * 0.14, ink) +
        circle(-r * 2.7, 0, r * 0.08, ink) +
        "</g>" +
        circle(1.5, 3, r + 1, "#1a142088") +
        '<circle r="' +
        r +
        '" fill="url(#orb' +
        b.target +
        ')" stroke="#241c2b" stroke-width="2"/>' +
        circle(-r * 0.35, -r * 0.42, r * 0.17, "#fff4ec") +
        circle(-r * 0.2, r * 0.04, r * 0.095, "#352534") +
        circle(r * 0.31, r * 0.04, r * 0.095, "#352534") +
        '<path d="M0 ' +
        r * 0.25 +
        "q" +
        r * 0.1 +
        " " +
        r * 0.12 +
        " " +
        r * 0.2 +
        ' 0" fill="none" stroke="#4a3347" stroke-width="1.2"/></g>'
      );
    })
    .join("");
  const nodes = [...orbs.children];
  const portalSize = g.rooms < 3 ? 58 : g.rooms < 5 ? 40 : 31;
  const gateNodes = [];
  doors.innerHTML = g.gates
    .map((gate, i) => {
      const { x1, y1, x2, y2, vertical } = gate,
        mx = (x1 + x2) / 2,
        my = (y1 + y2) / 2;
      let mounts = "";
      for (const [x, y] of [
        [x1, y1],
        [x2, y2],
      ])
        mounts +=
          rect(
            x - (vertical ? 10 : 6),
            y - (vertical ? 6 : 10),
            vertical ? 20 : 12,
            vertical ? 12 : 20,
            "#211b28",
            3,
          ) + rect(x - 5, y - 4, 10, 8, "#95829e", 2);
      const sx = vertical ? x1 : x1 + 5,
        sy = vertical ? y1 + 8 : y1 + 4;
      return (
        '<g class="gate" tabindex="0" role="button" data-index="' +
        i +
        '">' +
        line(gate, "#1c1723", 14, 'class="door-base"') +
        line(gate, "url(#hazard)", 8, 'class="door-stripe"') +
        mounts +
        line(gate, "transparent", 38) +
        '<image class="gate-sprite" href="assets/maxwell.png" x="' +
        (sx - portalSize / 2) +
        '" y="' +
        (sy - portalSize * 0.93) +
        '" width="' +
        portalSize +
        '" height="' +
        portalSize * 1.1 +
        '"/><title>Toggle gate ' +
        (i + 1) +
        "</title></g>"
      );
    })
    .join("");
  [...doors.children].forEach((el, i) => {
    gateNodes.push({
      el,
      base: el.querySelector(".door-base"),
      stripe: el.querySelector(".door-stripe"),
    });
    el.addEventListener("click", () => onToggle(i));
    el.addEventListener("keydown", (e) => {
      if (["Enter", " "].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        onToggle(i);
      }
    });
  });
  function paintGates() {
    g.gates.forEach((gate, i) => {
      const n = gateNodes[i];
      n.base.setAttribute("stroke", gate.open ? "#c1ffde" : "#241d2b");
      n.base.setAttribute("stroke-width", gate.open ? "2" : "14");
      n.base.setAttribute("stroke-dasharray", gate.open ? "4 8" : "none");
      n.stripe.style.opacity = gate.open ? "0" : "1";
      n.el.setAttribute(
        "aria-label",
        "Gate " + (i + 1) + (gate.open ? " open" : " closed"),
      );
      n.el.setAttribute("aria-pressed", String(gate.open));
    });
  }
  function paintBalls() {
    g.balls.forEach((b, i) => {
      nodes[i].setAttribute(
        "transform",
        "translate(" + b.x.toFixed(2) + " " + b.y.toFixed(2) + ")",
      );
      nodes[i].firstChild.setAttribute(
        "transform",
        "rotate(" + Math.round((Math.atan2(b.vy, b.vx) * 180) / Math.PI) + ")",
      );
    });
  }
  paintGates();
  paintBalls();
  return { paintGates, paintBalls };
}
