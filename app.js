const ENERGY_OPTIONS = [
  {
    value: 1,
    label: "Very low",
    blurb: "Sleepy snail mode",
    image: "images/energy-1.svg",
    accent: "#5c6ac4"
  },
  {
    value: 2,
    label: "Low",
    blurb: "Soft puff mode",
    image: "images/energy-2.svg",
    accent: "#4ea8de"
  },
  {
    value: 3,
    label: "Steady",
    blurb: "Sunny and usable",
    image: "images/energy-3.svg",
    accent: "#f4c95d"
  },
  {
    value: 4,
    label: "High",
    blurb: "Bouncy spark mode",
    image: "images/energy-4.svg",
    accent: "#ff8c42"
  },
  {
    value: 5,
    label: "Very high",
    blurb: "Rocket goblin mode",
    image: "images/energy-5.svg",
    accent: "#ff5d73"
  }
];

const COOKIE_NAME = "energy_garden_log";
const COOKIE_DAYS = 365;
const MAX_ENTRIES = 400;

const energyGrid = document.getElementById("energyGrid");
const latestEntry = document.getElementById("latestEntry");
const entryCount = document.getElementById("entryCount");
const historyRange = document.getElementById("historyRange");
const chartEmpty = document.getElementById("chartEmpty");
const clearHistoryButton = document.getElementById("clearHistory");
const undoButton = document.getElementById("undoButton");
const canvas = document.getElementById("energyChart");
const ctx = canvas.getContext("2d");

let entries = loadEntries();
let undoTimeoutId = null;
let lastRemovedEntry = null;

renderEnergyButtons();
refreshUI();

historyRange.addEventListener("change", refreshChart);
window.addEventListener("resize", refreshChart);
clearHistoryButton.addEventListener("click", clearHistory);
undoButton.addEventListener("click", undoLastEntry);

function renderEnergyButtons() {
  energyGrid.innerHTML = "";

  for (const option of ENERGY_OPTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "energy-card";
    button.style.setProperty("--accent", option.accent);
    button.setAttribute("role", "listitem");
    button.setAttribute("aria-label", `${option.label}: ${option.blurb}`);
    button.innerHTML = `
      <span class="energy-meter">${option.value}</span>
      <img class="energy-art" src="${option.image}" alt="" />
      <strong>${option.label}</strong>
      <span>${option.blurb}</span>
    `;
    button.addEventListener("click", () => logEnergy(option.value));
    energyGrid.appendChild(button);
  }
}

function logEnergy(value) {
  const nextEntry = {
    value,
    timestamp: Date.now()
  };
  entries.push(nextEntry);
  lastRemovedEntry = nextEntry;

  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(entries.length - MAX_ENTRIES);
  }

  saveEntries(entries);
  showUndoButton();
  refreshUI();
}

function refreshUI() {
  entryCount.textContent = String(entries.length);

  if (entries.length === 0) {
    latestEntry.textContent = "No entries yet";
  } else {
    const last = entries[entries.length - 1];
    const option = ENERGY_OPTIONS.find((item) => item.value === last.value);
    latestEntry.textContent = `${option.label} at ${formatDateTime(last.timestamp)}`;
  }

  refreshChart();
}

function refreshChart() {
  const filtered = filterEntriesByRange(entries, historyRange.value);
  resizeCanvas();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (filtered.length === 0) {
    chartEmpty.classList.remove("hidden");
    return;
  }

  chartEmpty.classList.add("hidden");
  drawChart(filtered);
}

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const bounds = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.floor(bounds.width));
  const height = Math.max(260, Math.floor(bounds.height));
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function drawChart(data) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const padding = { top: 18, right: 20, bottom: 42, left: 42 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const minTime = data[0].timestamp;
  const maxTime = data[data.length - 1].timestamp;
  const timeSpan = Math.max(maxTime - minTime, 1);

  ctx.fillStyle = "#f6efe4";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(56, 72, 93, 0.18)";
  ctx.lineWidth = 1;

  for (let level = 1; level <= 5; level += 1) {
    const y = padding.top + chartHeight - ((level - 1) / 4) * chartHeight;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();

    ctx.fillStyle = "#546070";
    ctx.font = "12px monospace";
    ctx.fillText(String(level), 18, y + 4);
  }

  ctx.strokeStyle = "#20344a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, height - padding.bottom);
  ctx.lineTo(width - padding.right, height - padding.bottom);
  ctx.stroke();

  ctx.strokeStyle = "#ff7f50";
  ctx.lineWidth = 3;
  ctx.beginPath();

  data.forEach((entry, index) => {
    const x = padding.left + ((entry.timestamp - minTime) / timeSpan) * chartWidth;
    const y = padding.top + chartHeight - ((entry.value - 1) / 4) * chartHeight;

    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();

  data.forEach((entry) => {
    const x = padding.left + ((entry.timestamp - minTime) / timeSpan) * chartWidth;
    const y = padding.top + chartHeight - ((entry.value - 1) / 4) * chartHeight;
    const option = ENERGY_OPTIONS.find((item) => item.value === entry.value);

    ctx.fillStyle = option.accent;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  });

  drawTimeLabels(data, padding, chartWidth, height);
}

function drawTimeLabels(data, padding, chartWidth, height) {
  const labelCount = Math.min(4, data.length);
  const used = new Set();
  ctx.fillStyle = "#546070";
  ctx.font = "12px monospace";
  ctx.textAlign = "center";

  for (let i = 0; i < labelCount; i += 1) {
    const index = Math.round((i / Math.max(labelCount - 1, 1)) * (data.length - 1));
    if (used.has(index)) {
      continue;
    }

    used.add(index);
    const entry = data[index];
    const minTime = data[0].timestamp;
    const maxTime = data[data.length - 1].timestamp;
    const timeSpan = Math.max(maxTime - minTime, 1);
    const x = padding.left + ((entry.timestamp - minTime) / timeSpan) * chartWidth;
    ctx.fillText(formatAxisTime(entry.timestamp), x, height - 14);
  }

  ctx.textAlign = "start";
}

function filterEntriesByRange(allEntries, range) {
  if (range === "all") {
    return [...allEntries];
  }

  const now = Date.now();
  const rangeMap = {
    "1d": 24 * 60 * 60 * 1000,
    "3d": 3 * 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000
  };

  const cutoff = now - rangeMap[range];
  return allEntries.filter((entry) => entry.timestamp >= cutoff);
}

function loadEntries() {
  const raw = getCookie(COOKIE_NAME);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item) => typeof item?.value === "number" && typeof item?.timestamp === "number")
      .sort((a, b) => a.timestamp - b.timestamp);
  } catch {
    return [];
  }
}

function saveEntries(nextEntries) {
  const expires = new Date(Date.now() + COOKIE_DAYS * 24 * 60 * 60 * 1000).toUTCString();
  if (nextEntries.length === 0) {
    document.cookie = `${COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
    return;
  }

  const encoded = encodeURIComponent(JSON.stringify(nextEntries));
  document.cookie = `${COOKIE_NAME}=${encoded}; expires=${expires}; path=/; SameSite=Lax`;
}

function getCookie(name) {
  const prefix = `${name}=`;
  const cookie = document.cookie
    .split("; ")
    .find((row) => row.startsWith(prefix));

  if (!cookie) {
    return "";
  }

  return decodeURIComponent(cookie.slice(prefix.length));
}

function formatDateTime(timestamp) {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatAxisTime(timestamp) {
  const value = new Date(timestamp);
  return value.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric"
  });
}

function clearHistory() {
  entries = [];
  lastRemovedEntry = null;
  hideUndoButton();
  saveEntries(entries);
  refreshUI();
}

function undoLastEntry() {
  if (!lastRemovedEntry || entries.length === 0) {
    hideUndoButton();
    return;
  }

  const latest = entries[entries.length - 1];
  if (latest.timestamp !== lastRemovedEntry.timestamp || latest.value !== lastRemovedEntry.value) {
    hideUndoButton();
    return;
  }

  entries = entries.slice(0, -1);
  lastRemovedEntry = null;
  hideUndoButton();
  saveEntries(entries);
  refreshUI();
}

function showUndoButton() {
  undoButton.classList.remove("hidden");

  if (undoTimeoutId !== null) {
    window.clearTimeout(undoTimeoutId);
  }

  undoTimeoutId = window.setTimeout(() => {
    lastRemovedEntry = null;
    hideUndoButton();
  }, 5000);
}

function hideUndoButton() {
  undoButton.classList.add("hidden");

  if (undoTimeoutId !== null) {
    window.clearTimeout(undoTimeoutId);
    undoTimeoutId = null;
  }
}
