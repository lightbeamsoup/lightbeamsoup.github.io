export function toLocalDate(value) {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  if (typeof value === "number") {
    return new Date(value);
  }
  if (typeof value !== "string" || !value) {
    return new Date(Number.NaN);
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
  }

  return new Date(value);
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function getTimeOfDayPhase(date = new Date()) {
  const minutes = (date.getHours() * 60) + date.getMinutes() + (date.getSeconds() / 60);
  if (minutes < 300) return "night";
  if (minutes < 420) return "sunrise";
  if (minutes < 660) return "morning";
  if (minutes < 900) return "midday";
  if (minutes < 1080) return "evening";
  if (minutes < 1200) return "sunset";
  return "night";
}

export function titleCasePhase(phase) {
  if (phase === "sunrise") return "Sunrise";
  if (phase === "midday") return "Midday";
  if (phase === "sunset") return "Sunset";
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

export function buildOrbitPosition(progress, {
  centerX = 50,
  centerY = 54,
  radiusX = 38,
  radiusY = 40,
  startAngle = 210,
  endAngle = 330
}) {
  const angle = startAngle + ((endAngle - startAngle) * progress);
  const radians = (angle * Math.PI) / 180;
  return {
    left: centerX + (Math.cos(radians) * radiusX),
    top: centerY + (Math.sin(radians) * radiusY)
  };
}

export function buildTemporalState(date = new Date()) {
  const minutes = (date.getHours() * 60) + date.getMinutes() + (date.getSeconds() / 60);
  const phase = getTimeOfDayPhase(date);
  const phaseStyles = {
    sunrise: {
      skyTop: "#f8c3a2",
      skyBottom: "#fff1d1",
      horizonGlow: "rgba(255, 205, 136, 0.82)",
      sunOpacity: 0.92,
      moonOpacity: 0.26,
      starOpacity: 0.18
    },
    morning: {
      skyTop: "#b8defa",
      skyBottom: "#eef8ff",
      horizonGlow: "rgba(255, 231, 178, 0.45)",
      sunOpacity: 0.98,
      moonOpacity: 0,
      starOpacity: 0
    },
    midday: {
      skyTop: "#89c6f3",
      skyBottom: "#ebf9ff",
      horizonGlow: "rgba(255, 240, 205, 0.28)",
      sunOpacity: 1,
      moonOpacity: 0,
      starOpacity: 0
    },
    evening: {
      skyTop: "#ffd49e",
      skyBottom: "#fff1d8",
      horizonGlow: "rgba(255, 190, 122, 0.52)",
      sunOpacity: 0.84,
      moonOpacity: 0.12,
      starOpacity: 0.04
    },
    sunset: {
      skyTop: "#7769aa",
      skyBottom: "#ffc18f",
      horizonGlow: "rgba(255, 157, 101, 0.72)",
      sunOpacity: 0.68,
      moonOpacity: 0.42,
      starOpacity: 0.3
    },
    night: {
      skyTop: "#0d1530",
      skyBottom: "#263a63",
      horizonGlow: "rgba(89, 121, 188, 0.38)",
      sunOpacity: 0,
      moonOpacity: 0.94,
      starOpacity: 0.88
    }
  };

  const sunProgress = clamp((minutes - 300) / 900, 0, 1);
  const moonMinutes = minutes >= 1200 ? minutes - 1200 : minutes + 240;
  const moonProgress = clamp(moonMinutes / 540, 0, 1);
  const sun = buildOrbitPosition(sunProgress, {
    centerX: 50,
    centerY: 52,
    radiusX: 43,
    radiusY: 43,
    startAngle: 210,
    endAngle: 330
  });
  const moon = buildOrbitPosition(moonProgress, {
    centerX: 50,
    centerY: 52,
    radiusX: 43,
    radiusY: 43,
    startAngle: 330,
    endAngle: 210
  });
  const timeZoneLabel = Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time";

  return {
    phase,
    phaseLabel: titleCasePhase(phase),
    clockLabel: date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit"
    }),
    dateLabel: date.toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric"
    }),
    timeZoneLabel,
    sunLeft: sun.left,
    sunTop: sun.top,
    moonLeft: moon.left,
    moonTop: moon.top,
    ...phaseStyles[phase]
  };
}

export function formatDate(value) {
  const date = toLocalDate(value);
  if (Number.isNaN(date.getTime())) {
    return String(value || "");
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function formatDateTime(value, { includePhase = false } = {}) {
  const date = toLocalDate(value);
  if (Number.isNaN(date.getTime())) {
    return String(value || "");
  }
  const formatted = date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
  return includePhase ? `${formatted} · ${titleCasePhase(getTimeOfDayPhase(date))}` : formatted;
}
