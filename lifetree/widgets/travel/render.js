export function compareTripDisplay(left, right) {
  const leftDate = left.startDate || left.endDate || "9999-12-31";
  const rightDate = right.startDate || right.endDate || "9999-12-31";
  if (leftDate !== rightDate) {
    return leftDate.localeCompare(rightDate);
  }
  return (right.updatedAt || 0) - (left.updatedAt || 0);
}

export function compareTemplateDisplay(left, right) {
  return (left.name || "").localeCompare(right.name || "");
}

export function renderTravelWidgetShell({
  settings,
  upcomingTrips,
  nextTrip,
  activeTrip,
  activeTripCount,
  openTravelTaskCount,
  unpackedActiveTripQuantity,
  displayLiveByTripId,
  escapeHtml
}, deps) {
  return `
    <div class="widget-slot-header">
      <div>
        <h3>Travel Buddy</h3>
        <p>Keep upcoming trips, itinerary details, and reusable packing lists in one place.</p>
      </div>
      <span class="widget-badge">Beta</span>
    </div>
    <p>${nextTrip
      ? `Next trip: ${escapeHtml(nextTrip.name)}${nextTrip.destination ? ` to ${escapeHtml(nextTrip.destination)}` : ""}`
      : "No trips yet. Add one from the Overview tab."}</p>
    <p>${activeTripCount ? `${activeTripCount} active trip${activeTripCount === 1 ? "" : "s"}. ` : ""}${upcomingTrips.length ? `${upcomingTrips.length} upcoming trip${upcomingTrips.length === 1 ? "" : "s"}.` : "Nothing upcoming yet."}</p>
    <p>${activeTrip
      ? `${unpackedActiveTripQuantity} unpacked item${unpackedActiveTripQuantity === 1 ? "" : "s"} for ${escapeHtml(activeTrip.name)}.`
      : "When a trip becomes active, Travel Buddy will show how much packing is still left."}</p>
    <p>${nextTrip
      ? escapeHtml(describeTripMilestone(nextTrip, deps))
      : "Create a trip to start tracking transit, lodging, and packing details."}</p>
    <p>${settings.homeLocation
      ? `Home base: ${escapeHtml(settings.homeLocation)}${settings.homeTimeZone ? ` · ${escapeHtml(settings.homeTimeZone)}` : ""}`
      : "Set your home location in Travel settings to support timezone-aware trip planning."}</p>
    <div class="travel-shell-list">
      ${upcomingTrips.length
        ? upcomingTrips.slice(0, 3).map((trip) => renderTravelShellCard(
          trip,
          escapeHtml,
          displayLiveByTripId?.[trip.id] || null,
          settings,
          deps
        )).join("")
        : `<p class="empty-state">Your upcoming trips will show up here.</p>`}
    </div>
    <div class="widget-actions">
      <button type="button" class="ghost-button" data-widget-action="travel-new-trip">New trip</button>
      <button type="button" class="ghost-button" data-widget-action="open-widget-detail">Open panel</button>
    </div>
    <p class="sync-status">Flight check-ins, itinerary tasks, and packing tasks surface here automatically. Open travel tasks: ${openTravelTaskCount}.</p>
  `;
}

export function renderTravelWidgetDetail({
  trips,
  settings,
  packingTemplates,
  itineraryTemplates,
  packingCategoryListId,
  packingCategories,
  activeTab,
  activeTrip,
  upcomingTrips,
  escapeHtml,
  formatDate
}, deps) {
  return `
    <section class="energy-detail">
      <datalist id="${escapeHtml(packingCategoryListId)}">
        ${packingCategories.map((category) => `<option value="${escapeHtml(category)}"></option>`).join("")}
      </datalist>
      <div class="workout-detail-tabs" role="tablist" aria-label="Travel detail sections">
        ${renderTravelDetailTabButton("overview", "Overview", activeTab, escapeHtml)}
        ${renderTravelDetailTabButton("settings", "Settings", activeTab, escapeHtml)}
        ${trips.map((trip) => renderTravelDetailTabButton(`trip:${trip.id}`, trip.name || "Trip", activeTab, escapeHtml)).join("")}
        ${renderTravelDetailTabButton("packing-templates", "Saved packing lists", activeTab, escapeHtml)}
        ${renderTravelDetailTabButton("itinerary-templates", "Saved itineraries", activeTab, escapeHtml)}
      </div>

      <div class="travel-detail-panel${activeTab === "overview" ? "" : " hidden"}" data-travel-tab-panel="overview">
        <section class="energy-detail-card">
          <div class="energy-detail-header">
            <div>
              <p class="eyebrow">Overview</p>
              <h3>Trip status board</h3>
              <p class="sync-status">Track active and upcoming trips here, then jump into each trip tab for editing.</p>
            </div>
            <div class="widget-actions workout-inline-actions">
              <button type="button" class="primary-button" data-travel-new-trip>New trip</button>
            </div>
          </div>
          <div class="travel-overview-grid">
            <article class="travel-overview-stat">
              <span>Trips</span>
              <strong>${trips.length}</strong>
            </article>
            <article class="travel-overview-stat">
              <span>Upcoming</span>
              <strong>${upcomingTrips.length}</strong>
            </article>
            <article class="travel-overview-stat">
              <span>Saved packing lists</span>
              <strong>${packingTemplates.length}</strong>
            </article>
            <article class="travel-overview-stat">
              <span>Saved itineraries</span>
              <strong>${itineraryTemplates.length}</strong>
            </article>
          </div>
          <div class="travel-trip-board">
            ${trips.length
              ? trips.map((trip) => renderTravelOverviewCard(trip, escapeHtml, formatDate, deps)).join("")
              : `<p class="empty-state">No trips yet. Use New trip to add your first itinerary.</p>`}
          </div>
        </section>
      </div>

      <div class="travel-detail-panel${activeTab === "settings" ? "" : " hidden"}" data-travel-tab-panel="settings">
        <section class="energy-detail-card">
          <div class="energy-detail-header">
            <div>
              <p class="eyebrow">Settings</p>
              <h3>Home location and time zone</h3>
              <p class="sync-status">Travel Buddy uses your home base to reason about trip stages and timezone-sensitive planning. Use an IANA timezone when you want an exact override.</p>
            </div>
          </div>
          <form class="travel-template-form" data-travel-settings-form>
            <div class="quick-add-grid">
              <label class="quick-add-title">
                <span>Home location</span>
                <input type="text" maxlength="120" value="${escapeHtml(settings.homeLocation)}" placeholder="Seattle, WA or SEA" data-travel-home-location />
              </label>
              <label>
                <span>Home time zone</span>
                <input type="text" maxlength="80" value="${escapeHtml(settings.homeTimeZone)}" placeholder="America/Los_Angeles" data-travel-home-timezone />
              </label>
            </div>
            <div class="widget-actions workout-inline-actions">
              <button type="submit" class="primary-button">Save settings</button>
            </div>
          </form>
        </section>
      </div>

      <div class="travel-detail-panel${activeTrip ? "" : " hidden"}" data-travel-tab-panel="trip">
        ${activeTrip ? renderTravelTripPanel(activeTrip, packingTemplates, itineraryTemplates, settings, packingCategoryListId, escapeHtml, formatDate, deps) : ""}
      </div>

      <div class="travel-detail-panel${activeTab === "packing-templates" ? "" : " hidden"}" data-travel-tab-panel="packing-templates">
        <section class="energy-detail-card">
          <div class="energy-detail-header">
            <div>
              <p class="eyebrow">Templates</p>
              <h3>Saved packing lists</h3>
              <p class="sync-status">Save reusable packing presets here and apply them to any trip tab.</p>
            </div>
          </div>
          <form class="travel-template-form" data-travel-packing-template-form>
            <div class="travel-template-item-list" data-travel-template-item-list>
              ${renderTravelTemplateItemRows([], packingCategoryListId, escapeHtml, deps)}
            </div>
            <div class="widget-actions workout-inline-actions">
              <button type="button" class="ghost-button" data-travel-add-template-item>Add item</button>
            </div>
            <div class="quick-add-grid">
              <label class="quick-add-title">
                <span>Template name</span>
                <input type="text" maxlength="80" placeholder="Weekend carry-on, beach trip..." data-travel-template-name required />
              </label>
            </div>
            <div class="widget-actions workout-inline-actions">
              <button type="submit" class="primary-button">Save packing list</button>
            </div>
          </form>
          <div class="travel-template-list">
            ${packingTemplates.length
              ? packingTemplates.map((template) => renderPackingTemplateCard(template, escapeHtml)).join("")
              : `<p class="empty-state">No saved packing lists yet.</p>`}
          </div>
        </section>
      </div>

      <div class="travel-detail-panel${activeTab === "itinerary-templates" ? "" : " hidden"}" data-travel-tab-panel="itinerary-templates">
        <section class="energy-detail-card">
          <div class="energy-detail-header">
            <div>
              <p class="eyebrow">Templates</p>
              <h3>Saved itineraries</h3>
              <p class="sync-status">Create itinerary templates from a trip tab, then reuse them to spin up future trips faster.</p>
            </div>
          </div>
          <div class="travel-template-list">
            ${itineraryTemplates.length
              ? itineraryTemplates.map((template) => renderItineraryTemplateCard(template, escapeHtml, formatDate, deps)).join("")
              : `<p class="empty-state">No saved itineraries yet.</p>`}
          </div>
        </section>
      </div>
    </section>
  `;
}

function describeTripMilestone(trip, deps) {
  const milestone = getNextTripMilestone(trip, deps);
  if (!milestone) {
    return `${trip.name} is currently ${deps.humanizeTripStatus(trip.status)}.`;
  }
  return `${trip.name}: ${milestone.label} ${milestone.at}.`;
}

function getNextTripMilestone(trip, deps) {
  const now = Date.now();
  const candidates = [
    { label: trip.itinerary.outboundLabel || "Outbound transit", date: trip.itinerary.outboundDate, time: trip.itinerary.outboundTime },
    { label: "Trip start", date: trip.startDate, time: "" },
    { label: "Hotel check-in", date: trip.itinerary.checkInDate, time: "" },
    { label: trip.itinerary.returnLabel || "Return transit", date: trip.itinerary.returnDate, time: trip.itinerary.returnTime },
    { label: "Hotel check-out", date: trip.itinerary.checkOutDate, time: "" },
    { label: "Trip end", date: trip.endDate, time: "" }
  ]
    .map((candidate) => ({ ...candidate, timestamp: deps.toDateTime(candidate.date, candidate.time) }))
    .filter((candidate) => candidate.timestamp);
  const upcoming = candidates.find((candidate) => candidate.timestamp >= now) || candidates[candidates.length - 1];
  if (!upcoming) {
    return null;
  }
  return {
    label: upcoming.label,
    at: deps.formatDateTimeLabel(upcoming.date, upcoming.time)
  };
}

function renderTravelShellCard(trip, escapeHtml, liveSnapshot = null, settings = {}, deps) {
  const hasFlightRefresh = Boolean(deps.buildTravelFlightRequest(trip, settings));
  const unpackedQuantity = deps.getUnpackedPackingQuantity(trip);
  const packingStatus = !trip.packingList.items.length
    ? "No packing list items yet."
    : unpackedQuantity
      ? `${unpackedQuantity} unpacked item${unpackedQuantity === 1 ? "" : "s"} left to pack.`
      : "Packing list complete.";
  const liveMarkup = renderTravelShellLiveMarkup(
    liveSnapshot,
    escapeHtml,
    Boolean(deps.buildTravelShellLiveRequest(trip, settings))
  );
  return `
    <article class="travel-shell-card">
      <div class="travel-shell-card-header">
        <div>
          <h4>${escapeHtml(trip.name)}</h4>
          <p>${trip.destination ? escapeHtml(trip.destination) : "Destination TBD"}</p>
        </div>
        <span class="travel-status-chip is-${trip.status}">${escapeHtml(deps.humanizeTripStatus(trip.status))}</span>
      </div>
      <p class="travel-shell-card-meta">${escapeHtml(describeTripRange(trip, null, deps))}</p>
      <p class="travel-shell-card-meta">${escapeHtml(describeTripMilestone(trip, deps))}</p>
      ${trip.status === "active"
        ? `<p class="travel-shell-card-meta">${packingStatus}</p>`
        : ""}
      <div class="travel-shell-live" data-travel-live-trip-id="${trip.id}">
        ${liveMarkup}
      </div>
      <div class="widget-actions travel-shell-actions">
        ${hasFlightRefresh
          ? `<button type="button" class="ghost-button" data-widget-action="travel-refresh-flight" data-trip-id="${trip.id}">Refresh flight</button>`
          : ""}
        <button type="button" class="ghost-button" data-widget-action="travel-open-trip" data-trip-id="${trip.id}">View trip</button>
      </div>
    </article>
  `;
}

export function renderTravelShellLiveMarkup(snapshot, escapeHtml, shouldShowPlaceholder = false) {
  if (!snapshot) {
    return shouldShowPlaceholder ? `<p class="travel-shell-live-note muted">Fetching live travel updates...</p>` : "";
  }

  const sections = [];
  if (snapshot.flight) {
    sections.push(renderTravelFlightLiveSection(snapshot.flight, escapeHtml));
  }
  if (snapshot.weather) {
    sections.push(renderTravelWeatherLiveSection(snapshot.weather, escapeHtml));
  }
  if (snapshot.pending) {
    sections.push(`<p class="travel-shell-live-note muted">Refreshing live travel updates…</p>`);
  }
  if (snapshot.flightNotice) {
    sections.push(`<p class="travel-shell-live-note muted">${escapeHtml(snapshot.flightNotice)}</p>`);
  }
  if (snapshot.weatherNotice) {
    sections.push(`<p class="travel-shell-live-note muted">${escapeHtml(snapshot.weatherNotice)}</p>`);
  }
  if (sections.length === 0) {
    return shouldShowPlaceholder ? `<p class="travel-shell-live-note muted">No live travel updates are ready yet.</p>` : "";
  }
  return sections.join("");
}

function renderTravelFlightLiveSection(flight, escapeHtml) {
  if (flight.status === "unconfigured") {
    return `<p class="travel-shell-live-note muted">${escapeHtml(flight.message || "Add a flight API key to show live status.")}</p>`;
  }
  if (flight.status === "not-found") {
    return `<p class="travel-shell-live-note muted">${escapeHtml(flight.message || "No live flight status is available yet.")}</p>`;
  }
  if (flight.status === "error") {
    return `<p class="travel-shell-live-note muted">${escapeHtml(flight.message || "Live flight status is unavailable right now.")}</p>`;
  }
  if (flight.status !== "ok") {
    return "";
  }

  const routeLabel = [flight.departureCode, flight.arrivalCode].filter(Boolean).join(" -> ");
  const detailBits = [
    flight.statusLabel || "",
    flight.departureTimeLabel ? `Dep ${flight.departureTimeLabel}` : "",
    flight.gate ? `Gate ${flight.gate}` : "",
    flight.terminal ? `T${flight.terminal}` : ""
  ].filter(Boolean);
  const freshnessLabel = flight.fetchedAt ? `Checked ${formatRelativeMinutesAgo(flight.fetchedAt)}` : "";

  return `
    <section class="travel-shell-live-section">
      <span class="travel-shell-live-label">Flight</span>
      <strong>${escapeHtml(flight.flightLabel || "Flight status")}</strong>
      ${routeLabel ? `<span>${escapeHtml(routeLabel)}</span>` : ""}
      ${detailBits.length ? `<span>${escapeHtml(detailBits.join(" · "))}</span>` : ""}
      ${freshnessLabel ? `<span>${escapeHtml(freshnessLabel)}</span>` : ""}
    </section>
  `;
}

function renderTravelWeatherLiveSection(weather, escapeHtml) {
  if (weather.status === "out-of-range" || weather.status === "not-found" || weather.status === "error") {
    return `<p class="travel-shell-live-note muted">${escapeHtml(weather.message || "Forecast unavailable.")}</p>`;
  }
  if (weather.status !== "ok" || !Array.isArray(weather.days) || weather.days.length === 0) {
    return "";
  }

  return `
    <section class="travel-shell-live-section">
      <span class="travel-shell-live-label">Forecast${weather.locationLabel ? ` · ${escapeHtml(weather.locationLabel)}` : ""}</span>
      <div class="travel-shell-forecast-strip">
        ${weather.days.slice(0, 4).map((day) => `
          <div class="travel-shell-forecast-day">
            <strong>${escapeHtml(day.shortLabel || day.dateLabel || day.date || "")}</strong>
            <span>${escapeHtml(day.temperatureLabel || "")}</span>
            <span>${escapeHtml(day.conditionLabel || "")}</span>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function formatRelativeMinutesAgo(at) {
  const diffMs = Math.max(0, Date.now() - at);
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }
  const hours = Math.round(diffMinutes / 60);
  return `${hours} hr ago`;
}

function renderTravelOverviewCard(trip, escapeHtml, formatDate, deps) {
  const packedCount = trip.packingList.items.filter((item) => item.packed).length;
  const unpackedQuantity = deps.getUnpackedPackingQuantity(trip);
  const packingSummary = trip.status === "active"
    ? (trip.packingList.items.length ? ` · ${unpackedQuantity} left` : " · no packing items yet")
    : "";
  return `
    <article class="travel-board-card">
      <div class="travel-board-card-header">
        <div>
          <h4>${escapeHtml(trip.name)}</h4>
          <p>${trip.destination ? escapeHtml(trip.destination) : "Destination TBD"}</p>
        </div>
        <span class="travel-status-chip is-${trip.status}">${escapeHtml(deps.humanizeTripStatus(trip.status))}</span>
      </div>
      <p>${escapeHtml(describeTripRange(trip, formatDate, deps))}</p>
      <p>${escapeHtml(describeTripMilestone(trip, deps))}</p>
      <p>${trip.packingList.items.length} packing item${trip.packingList.items.length === 1 ? "" : "s"} · ${packedCount} packed${packingSummary}</p>
      <div class="widget-actions workout-inline-actions">
        <button type="button" class="ghost-button" data-travel-open-trip data-trip-id="${trip.id}">Open trip</button>
      </div>
    </article>
  `;
}

function renderTravelTripPanel(trip, packingTemplates, itineraryTemplates, settings, packingCategoryListId, escapeHtml, formatDate, deps) {
  const defaultPackingCategory = settings.lastPackingCategory || deps.DEFAULT_TRAVEL_PACKING_CATEGORY;
  return `
    <section class="energy-detail-card">
      <div class="energy-detail-header">
        <div>
          <p class="eyebrow">Trip</p>
          <h3>${escapeHtml(trip.name)}</h3>
          <p class="sync-status">${escapeHtml(describeTripMilestone(trip, deps))}</p>
        </div>
        <div class="widget-actions workout-inline-actions">
          <button type="button" class="ghost-button" data-travel-${trip.status === "active" ? "end" : "start"}-trip data-trip-id="${trip.id}">${trip.status === "active" ? "End trip" : "Start trip"}</button>
          <button type="button" class="ghost-button" data-travel-delete-trip data-trip-id="${trip.id}">Delete trip</button>
        </div>
      </div>
      <form class="travel-trip-form" data-travel-trip-form data-trip-id="${trip.id}">
        <div class="quick-add-grid">
          <label class="quick-add-title">
            <span>Trip name</span>
            <input type="text" maxlength="80" value="${escapeHtml(trip.name)}" data-travel-name required />
          </label>
          <label>
            <span>Destination</span>
            <input type="text" maxlength="120" value="${escapeHtml(trip.destination)}" data-travel-destination />
          </label>
          <label>
            <span>Status</span>
            <select data-travel-status>
              ${deps.TRIP_STATUS_OPTIONS.map((option) => `
                <option value="${option.value}" ${trip.status === option.value ? "selected" : ""}>${option.label}</option>
              `).join("")}
            </select>
          </label>
          <label>
            <span>Start date</span>
            <input type="date" value="${escapeHtml(trip.startDate)}" data-travel-start-date />
          </label>
          <label>
            <span>End date</span>
            <input type="date" value="${escapeHtml(trip.endDate)}" data-travel-end-date />
          </label>
        </div>

        <div class="travel-trip-sections">
          <section class="workout-recurrence-panel">
            <h4>Transit</h4>
            <div class="quick-add-grid">
              <label class="quick-add-title">
                <span>Outbound</span>
                <input type="text" maxlength="80" value="${escapeHtml(trip.itinerary.outboundLabel)}" placeholder="Flight, train, drive..." data-travel-outbound-label />
              </label>
              <label>
                <span>Outbound origin</span>
                <input type="text" maxlength="120" value="${escapeHtml(trip.itinerary.outboundOrigin)}" placeholder="${escapeHtml(settings.homeLocation || "Origin")}" data-travel-outbound-origin />
              </label>
              <label>
                <span>Outbound destination</span>
                <input type="text" maxlength="120" value="${escapeHtml(trip.itinerary.outboundDestination)}" placeholder="${escapeHtml(trip.destination || "Destination")}" data-travel-outbound-destination />
              </label>
              <label>
                <span>Flight number</span>
                <input type="text" maxlength="24" value="${escapeHtml(trip.itinerary.outboundFlightNumber)}" placeholder="AS 331, DL204" data-travel-outbound-flight-number />
              </label>
              <label>
                <span>Outbound date</span>
                <input type="date" value="${escapeHtml(trip.itinerary.outboundDate)}" data-travel-outbound-date />
              </label>
              <label>
                <span>Outbound time</span>
                <input type="time" value="${escapeHtml(trip.itinerary.outboundTime)}" data-travel-outbound-time />
              </label>
              <label class="quick-add-title">
                <span>Return</span>
                <input type="text" maxlength="80" value="${escapeHtml(trip.itinerary.returnLabel)}" placeholder="Flight, train, drive..." data-travel-return-label />
              </label>
              <label>
                <span>Return origin</span>
                <input type="text" maxlength="120" value="${escapeHtml(trip.itinerary.returnOrigin)}" placeholder="${escapeHtml(trip.destination || "Origin")}" data-travel-return-origin />
              </label>
              <label>
                <span>Return destination</span>
                <input type="text" maxlength="120" value="${escapeHtml(trip.itinerary.returnDestination)}" placeholder="${escapeHtml(settings.homeLocation || "Destination")}" data-travel-return-destination />
              </label>
              <label>
                <span>Flight number</span>
                <input type="text" maxlength="24" value="${escapeHtml(trip.itinerary.returnFlightNumber)}" placeholder="AS 332, DL205" data-travel-return-flight-number />
              </label>
              <label>
                <span>Return date</span>
                <input type="date" value="${escapeHtml(trip.itinerary.returnDate)}" data-travel-return-date />
              </label>
              <label>
                <span>Return time</span>
                <input type="time" value="${escapeHtml(trip.itinerary.returnTime)}" data-travel-return-time />
              </label>
            </div>
          </section>

          <section class="workout-recurrence-panel">
            <h4>Lodging</h4>
            <div class="quick-add-grid">
              <label class="quick-add-title">
                <span>Hotel / stay</span>
                <input type="text" maxlength="120" value="${escapeHtml(trip.itinerary.lodgingName)}" data-travel-lodging-name />
              </label>
              <label class="travel-wide-field">
                <span>Address</span>
                <input type="text" maxlength="240" value="${escapeHtml(trip.itinerary.lodgingAddress)}" data-travel-lodging-address />
              </label>
              <label>
                <span>Check-in</span>
                <input type="date" value="${escapeHtml(trip.itinerary.checkInDate)}" data-travel-checkin-date />
              </label>
              <label>
                <span>Check-out</span>
                <input type="date" value="${escapeHtml(trip.itinerary.checkOutDate)}" data-travel-checkout-date />
              </label>
            </div>
          </section>

          <section class="workout-recurrence-panel">
            <h4>Notes</h4>
            <label class="travel-template-items-input">
              <span>Trip notes</span>
              <textarea rows="5" data-travel-notes>${escapeHtml(trip.itinerary.notes)}</textarea>
            </label>
          </section>

          <section class="workout-recurrence-panel">
            <h4>Itinerary tasks</h4>
            <p class="sync-status">These tasks stay anchored to outbound departure time. Save the trip after editing to repair any missing generated tasks.</p>
            <div class="travel-custom-task-list" data-travel-custom-task-list>
              ${renderTravelCustomTaskRows(trip, settings, escapeHtml, deps)}
            </div>
            <div class="widget-actions workout-inline-actions">
              <button type="button" class="ghost-button" data-travel-add-custom-task data-trip-id="${trip.id}">Add itinerary task</button>
            </div>
          </section>

          <section class="workout-recurrence-panel">
            <h4>Packing task</h4>
            <p class="sync-status">Travel Buddy creates a packing task for this trip on the evening before departure and keeps it synced to the checklist below.</p>
            <div class="quick-add-grid">
              <label>
                <span>Pack task due time</span>
                <input type="time" value="${escapeHtml(deps.normalizePackingTaskSettings(trip.packingTask).dueTime)}" data-travel-pack-due-time />
              </label>
              <label>
                <span>Skip after departure + min</span>
                <input type="number" min="0" max="720" step="1" value="${deps.normalizePackingTaskGraceMinutes(trip.packingTask?.overdueGraceMinutes)}" data-travel-pack-grace-minutes />
              </label>
            </div>
          </section>
        </div>

        <div class="widget-actions workout-inline-actions">
          <button type="submit" class="primary-button">Save trip</button>
        </div>
      </form>
    </section>

    <section class="energy-detail-card">
      <div class="energy-detail-header">
        <div>
          <p class="eyebrow">Packing</p>
          <h3>${escapeHtml(trip.name)} packing list</h3>
          <p class="sync-status">${trip.packingList.items.length
            ? `${trip.packingList.items.filter((item) => item.packed).length}/${trip.packingList.items.length} packed · ${deps.getUnpackedPackingQuantity(trip)} unpacked item${deps.getUnpackedPackingQuantity(trip) === 1 ? "" : "s"} left.`
            : "Add what you need to bring, then reuse it as a template later."}</p>
        </div>
      </div>
      <div class="travel-template-apply-row">
        <label>
          <span>Apply saved packing list</span>
          <select data-travel-packing-template-select="${trip.id}">
            <option value="">Choose a packing list</option>
            ${packingTemplates.map((template) => `<option value="${template.id}">${escapeHtml(template.name)}</option>`).join("")}
          </select>
        </label>
        <button type="button" class="ghost-button" data-travel-apply-packing-template data-trip-id="${trip.id}" ${packingTemplates.length ? "" : "disabled"}>Apply</button>
      </div>
      <div class="travel-packing-list">
        ${trip.packingList.items.length
          ? renderTripPackingGroups(trip, escapeHtml, deps)
          : `<p class="empty-state">No packing items yet.</p>`}
      </div>
      <form class="travel-inline-form travel-packing-add-form" data-travel-packing-item-form data-trip-id="${trip.id}">
        <label class="quick-add-title">
          <span>Add packing item</span>
          <input type="text" maxlength="120" placeholder="Passport, chargers, hiking shoes..." data-travel-packing-item-input required />
        </label>
        <label>
          <span>Qty</span>
          <input type="number" min="1" max="99" step="1" value="1" data-travel-packing-quantity />
        </label>
        <label>
          <span>Category</span>
          <input type="text" maxlength="40" value="${escapeHtml(defaultPackingCategory)}" placeholder="General" list="${escapeHtml(packingCategoryListId)}" data-travel-packing-category />
        </label>
        <button type="submit" class="ghost-button">Add item</button>
      </form>
      <div class="travel-template-save-grid">
        <label>
          <span>Save this packing list as</span>
          <input type="text" maxlength="80" placeholder="Template name" data-travel-save-packing-name="${trip.id}" />
        </label>
        <button type="button" class="ghost-button" data-travel-save-packing-template data-trip-id="${trip.id}">Save packing list</button>
      </div>
    </section>

    <section class="energy-detail-card">
      <div class="energy-detail-header">
        <div>
          <p class="eyebrow">Templates</p>
          <h3>Reusable itinerary setup</h3>
          <p class="sync-status">Apply a saved itinerary to this trip or save the current trip as a reusable template.</p>
        </div>
      </div>
      <div class="travel-template-apply-row">
        <label>
          <span>Apply saved itinerary</span>
          <select data-travel-itinerary-template-select="${trip.id}">
            <option value="">Choose an itinerary</option>
            ${itineraryTemplates.map((template) => `<option value="${template.id}">${escapeHtml(template.name)}</option>`).join("")}
          </select>
        </label>
        <button type="button" class="ghost-button" data-travel-apply-itinerary-template data-trip-id="${trip.id}" ${itineraryTemplates.length ? "" : "disabled"}>Apply</button>
      </div>
      <div class="travel-template-save-grid">
        <label>
          <span>Save this itinerary as</span>
          <input type="text" maxlength="80" placeholder="Template name" data-travel-save-itinerary-name="${trip.id}" />
        </label>
        <button type="button" class="ghost-button" data-travel-save-itinerary-template data-trip-id="${trip.id}">Save itinerary</button>
      </div>
      <p class="sync-status">${escapeHtml(describeTripRange(trip, formatDate, deps))}</p>
    </section>
  `;
}

function renderTripPackingGroups(trip, escapeHtml, deps) {
  return deps.groupPackingItemsByCategory(trip.packingList.items).map((group) => `
    <section class="travel-packing-category">
      <div class="travel-packing-category-header">
        <h4>${escapeHtml(group.label)}</h4>
        <span>${group.items.length} item${group.items.length === 1 ? "" : "s"} · ${group.unpackedQuantity} unpacked</span>
      </div>
      <div class="travel-packing-category-list">
        ${group.items.map((item) => renderTripPackingItem(trip, item, escapeHtml, deps)).join("")}
      </div>
    </section>
  `).join("");
}

function renderTripPackingItem(trip, item, escapeHtml, deps) {
  return `
    <article class="travel-packing-item${item.packed ? " is-packed" : ""}">
      <div>
        <h4>${escapeHtml(item.label)}</h4>
        <p>${escapeHtml(item.category || deps.DEFAULT_TRAVEL_PACKING_CATEGORY)} · ${item.packed ? "Packed" : "Still needed"} · Qty ${item.quantity || 1}</p>
      </div>
      <div class="widget-actions workout-inline-actions">
        <label class="travel-packing-check">
          <input type="checkbox" ${item.packed ? "checked" : ""} data-travel-toggle-packed data-trip-id="${trip.id}" data-item-id="${item.id}" />
          <span>Packed</span>
        </label>
        <button type="button" class="ghost-button" data-travel-adjust-quantity data-trip-id="${trip.id}" data-item-id="${item.id}" data-quantity-delta="-1">−</button>
        <button type="button" class="ghost-button" data-travel-adjust-quantity data-trip-id="${trip.id}" data-item-id="${item.id}" data-quantity-delta="1">+</button>
        <button type="button" class="ghost-button" data-travel-delete-item data-trip-id="${trip.id}" data-item-id="${item.id}">Delete</button>
      </div>
    </article>
  `;
}

function renderPackingTemplateCard(template, escapeHtml) {
  return `
    <article class="travel-template-card">
      <div class="travel-board-card-header">
        <div>
          <h4>${escapeHtml(template.name)}</h4>
          <p>${template.items.length} item${template.items.length === 1 ? "" : "s"}</p>
        </div>
      </div>
      <p>${escapeHtml(template.items.slice(0, 4).map((item) => `${item.quantity || 1}× ${item.label}`).join(" · ") || "No items yet")}</p>
      <div class="widget-actions workout-inline-actions">
        <button type="button" class="ghost-button" data-travel-delete-packing-template data-template-id="${template.id}">Delete</button>
      </div>
    </article>
  `;
}

function renderItineraryTemplateCard(template, escapeHtml, formatDate, deps) {
  return `
    <article class="travel-template-card">
      <div class="travel-board-card-header">
        <div>
          <h4>${escapeHtml(template.name)}</h4>
          <p>${template.destination ? escapeHtml(template.destination) : "Destination TBD"}</p>
        </div>
      </div>
      <p>${escapeHtml(describeTemplateRange(template, formatDate, deps))}</p>
      <p>${escapeHtml(describeTemplateSummary(template))}</p>
      <div class="widget-actions workout-inline-actions">
        <button type="button" class="ghost-button" data-travel-create-trip-from-template data-template-id="${template.id}">Create trip</button>
        <button type="button" class="ghost-button" data-travel-delete-itinerary-template data-template-id="${template.id}">Delete</button>
      </div>
    </article>
  `;
}

export function renderTravelTemplateItemRows(items, packingCategoryListId, escapeHtml, deps) {
  const normalizedItems = Array.isArray(items) && items.length ? items : [{ label: "", quantity: 1, category: deps.DEFAULT_TRAVEL_PACKING_CATEGORY }];
  return normalizedItems.map((item, index) => renderTravelTemplateItemRow(item, `travel-template-row-${index}`, packingCategoryListId, escapeHtml)).join("");
}

export function renderTravelTemplateItemRow(item, rowId, packingCategoryListId, escapeHtml) {
  const safeEscapeHtml = typeof escapeHtml === "function" ? escapeHtml : fallbackEscapeHtml;
  return `
    <div class="travel-template-item-row" data-travel-template-row="${rowId}">
      <label class="quick-add-title">
        <span>Item</span>
        <input type="text" maxlength="120" value="${safeEscapeHtml(item?.label || "")}" placeholder="Passport" data-travel-template-item-label />
      </label>
      <label>
        <span>Qty</span>
        <input type="number" min="1" max="99" step="1" value="${Number.isFinite(Number(item?.quantity)) ? Math.max(1, Math.min(99, Math.round(Number(item.quantity)))) : 1}" data-travel-template-item-quantity />
      </label>
      <label>
        <span>Category</span>
        <input type="text" maxlength="40" value="${safeEscapeHtml(item?.category || "General")}" placeholder="General" list="${safeEscapeHtml(packingCategoryListId)}" data-travel-template-item-category />
      </label>
      <button type="button" class="ghost-button" data-travel-remove-template-item>Remove</button>
    </div>
  `;
}

function renderTravelCustomTaskRows(trip, settings, escapeHtml, deps) {
  const items = Array.isArray(trip?.itinerary?.customTasks) ? trip.itinerary.customTasks : [];
  if (items.length === 0) {
    return `<p class="empty-state">No itinerary tasks yet. Add things like booking a ride or printing boarding passes.</p>`;
  }
  return items.map((item) => renderTravelCustomTaskRow(item, trip, escapeHtml, settings, deps)).join("");
}

export function renderTravelCustomTaskRow(item, trip, escapeHtml, settings, deps) {
  const safeEscapeHtml = typeof escapeHtml === "function" ? escapeHtml : fallbackEscapeHtml;
  const schedule = trip ? deps.describeTravelCustomTaskSchedule(item, trip, settings) : { dueDate: "", dueTime: "", relativeLabel: "" };
  return `
    <div class="travel-custom-task-row" data-travel-custom-task-row="${safeEscapeHtml(item?.id || "")}">
      <label class="quick-add-title">
        <span>Task</span>
        <input type="text" maxlength="120" value="${safeEscapeHtml(item?.name || "")}" placeholder="Book airport ride" data-travel-custom-task-name />
      </label>
      <label>
        <span>Due date</span>
        <input type="date" value="${safeEscapeHtml(schedule.dueDate || "")}" data-travel-custom-task-date />
      </label>
      <label>
        <span>Due time</span>
        <input type="time" value="${safeEscapeHtml(schedule.dueTime || "")}" data-travel-custom-task-time />
      </label>
      <label class="travel-wide-field">
        <span>Notes</span>
        <input type="text" maxlength="240" value="${safeEscapeHtml(item?.details || "")}" placeholder="Pickup from hotel lobby" data-travel-custom-task-details />
      </label>
      <p class="sync-status">${safeEscapeHtml(schedule.relativeLabel || "Anchor this to outbound departure once the departure date/time is set.")}</p>
      <button type="button" class="ghost-button" data-travel-remove-custom-task>Remove</button>
    </div>
  `;
}

function describeTemplateSummary(template) {
  const parts = [];
  if (template.itinerary.outboundLabel) {
    parts.push(template.itinerary.outboundLabel);
  }
  if (template.itinerary.lodgingName) {
    parts.push(template.itinerary.lodgingName);
  }
  if ((template.itinerary.customTasks || []).length) {
    parts.push(`${template.itinerary.customTasks.length} itinerary task${template.itinerary.customTasks.length === 1 ? "" : "s"}`);
  }
  if (template.packingItems.length) {
    parts.push(`${template.packingItems.length} packing item${template.packingItems.length === 1 ? "" : "s"}`);
  }
  return parts.join(" · ") || "Reusable itinerary template.";
}

function describeTripRange(trip, formatDate, deps) {
  if (trip.startDate && trip.endDate && trip.startDate !== trip.endDate) {
    return `${formatMaybeDate(trip.startDate, formatDate, deps)} to ${formatMaybeDate(trip.endDate, formatDate, deps)}`;
  }
  if (trip.startDate) {
    return formatMaybeDate(trip.startDate, formatDate, deps);
  }
  if (trip.endDate) {
    return `Ends ${formatMaybeDate(trip.endDate, formatDate, deps)}`;
  }
  return "Dates still flexible";
}

function describeTemplateRange(template, formatDate, deps) {
  if (template.startDate && template.endDate && template.startDate !== template.endDate) {
    return `${formatMaybeDate(template.startDate, formatDate, deps)} to ${formatMaybeDate(template.endDate, formatDate, deps)}`;
  }
  return template.startDate ? formatMaybeDate(template.startDate, formatDate, deps) : "Dates are customizable";
}

function formatMaybeDate(dateString, formatDate, deps) {
  if (!dateString) {
    return "";
  }
  if (typeof formatDate === "function") {
    return formatDate(dateString);
  }
  return deps.formatDateTimeLabel(dateString, "");
}

export function fallbackEscapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderTravelDetailTabButton(key, label, activeTab, escapeHtml) {
  const active = activeTab === key;
  return `
    <button
      type="button"
      class="workout-detail-tab${active ? " is-active" : ""}"
      data-travel-detail-tab="${key}"
      role="tab"
      aria-selected="${active ? "true" : "false"}"
      title="${escapeHtml(label)}"
    >${escapeHtml(label)}</button>
  `;
}
