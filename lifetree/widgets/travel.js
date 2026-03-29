export const TRAVEL_WIDGET_TYPE = "travel";

const TRAVEL_CATEGORY = {
  key: "travel",
  label: "Travel",
  color: "#6aa9ff"
};
const TRAVEL_WIDGET_AIRPORT_TIME_ZONES = {
  SEA: "America/Los_Angeles",
  PDX: "America/Los_Angeles",
  SFO: "America/Los_Angeles",
  SJC: "America/Los_Angeles",
  LAX: "America/Los_Angeles",
  SAN: "America/Los_Angeles",
  LAS: "America/Los_Angeles",
  PHX: "America/Phoenix",
  DEN: "America/Denver",
  SLC: "America/Denver",
  DFW: "America/Chicago",
  DAL: "America/Chicago",
  AUS: "America/Chicago",
  IAH: "America/Chicago",
  ORD: "America/Chicago",
  MSP: "America/Chicago",
  ATL: "America/New_York",
  MIA: "America/New_York",
  JFK: "America/New_York",
  LGA: "America/New_York",
  EWR: "America/New_York",
  BOS: "America/New_York",
  DCA: "America/New_York",
  IAD: "America/New_York",
  CLT: "America/New_York",
  HNL: "Pacific/Honolulu",
  ANC: "America/Anchorage",
  LHR: "Europe/London",
  LGW: "Europe/London",
  CDG: "Europe/Paris",
  FCO: "Europe/Rome",
  AMS: "Europe/Amsterdam",
  MAD: "Europe/Madrid",
  NRT: "Asia/Tokyo",
  HND: "Asia/Tokyo",
  ICN: "Asia/Seoul",
  SYD: "Australia/Sydney"
};
const TRAVEL_LOCATION_TIME_ZONE_HINTS = [
  { timeZone: "America/Los_Angeles", pattern: /\b(seattle|portland|san francisco|oakland|san jose|los angeles|san diego|las vegas|vegas|california|oregon|washington state|wa|or|ca)\b/i },
  { timeZone: "America/Phoenix", pattern: /\b(phoenix|scottsdale|tempe|tucson|arizona|az)\b/i },
  { timeZone: "America/Denver", pattern: /\b(denver|boulder|salt lake|utah|ut|colorado|co|boise|idaho|id)\b/i },
  { timeZone: "America/Chicago", pattern: /\b(chicago|dallas|houston|austin|minneapolis|new orleans|texas|tx|illinois|il|minnesota|mn|wisconsin|wi|louisiana|la)\b/i },
  { timeZone: "America/New_York", pattern: /\b(new york|nyc|boston|miami|atlanta|orlando|philadelphia|washington dc|dc|virginia|va|new jersey|nj|florida|fl|georgia|ga|massachusetts|ma)\b/i },
  { timeZone: "Pacific/Honolulu", pattern: /\b(honolulu|hawaii|hi|maui)\b/i },
  { timeZone: "America/Anchorage", pattern: /\b(anchorage|alaska|ak)\b/i },
  { timeZone: "Europe/London", pattern: /\b(london|england|united kingdom|uk)\b/i },
  { timeZone: "Europe/Paris", pattern: /\b(paris|france)\b/i },
  { timeZone: "Europe/Rome", pattern: /\b(rome|italy)\b/i },
  { timeZone: "Europe/Amsterdam", pattern: /\b(amsterdam|netherlands)\b/i },
  { timeZone: "Europe/Madrid", pattern: /\b(madrid|barcelona|spain)\b/i },
  { timeZone: "Asia/Tokyo", pattern: /\b(tokyo|japan)\b/i },
  { timeZone: "Asia/Seoul", pattern: /\b(seoul|korea)\b/i },
  { timeZone: "Australia/Sydney", pattern: /\b(sydney|melbourne|australia)\b/i }
];
const TRIP_STATUS_OPTIONS = [
  { value: "planning", label: "Planning" },
  { value: "booked", label: "Booked" },
  { value: "active", label: "Active" },
  { value: "complete", label: "Complete" }
];
const TRIP_PRESET_STATUS_OPTIONS = ["planning", "booked"];
const TRAVEL_FLIGHT_LOOKAHEAD_MS = 1000 * 60 * 60 * 24;
const TRAVEL_SHELL_LIVE_TTL_MS = 1000 * 60;
const travelWidgetUiState = new Map();

export const travelWidgetDefinition = {
  type: TRAVEL_WIDGET_TYPE,
  title: "Travel Buddy",
  detailTitle: "Trips, itineraries, and packing",
  detailSubtitle: "Plan trips, track upcoming transit and lodging details, and reuse saved packing lists or itineraries.",
  ownerLabel: "Travel Buddy",
  menuLabel: "Add Travel Buddy",
  menuDescription: "Track trips, itinerary details, and reusable packing lists from one panel.",
  singleton: true,

  createWidget({ slotIndex, retiredWidget, createId, now }) {
    if (retiredWidget) {
      return {
        ...retiredWidget,
        slotIndex,
        updatedAt: retiredWidget.updatedAt || now
      };
    }

    return {
      id: createId(),
      type: TRAVEL_WIDGET_TYPE,
      slotIndex,
      settings: {
        homeLocation: "",
        homeTimeZone: ""
      },
      data: {
        trips: [],
        packingTemplates: [],
        itineraryTemplates: []
      },
      createdAt: now,
      updatedAt: now
    };
  },

  normalizeWidget(widget, { createId, now, maxWidgets }) {
    if (!widget || typeof widget !== "object") {
      return null;
    }

    return {
      id: typeof widget.id === "string" ? widget.id : createId(),
      type: TRAVEL_WIDGET_TYPE,
      slotIndex: normalizeSlotIndex(widget.slotIndex, maxWidgets || 5),
      settings: normalizeTravelSettings(widget.settings),
      data: {
        trips: normalizeTrips(widget.data?.trips, createId),
        packingTemplates: normalizePackingTemplates(widget.data?.packingTemplates, createId),
        itineraryTemplates: normalizeItineraryTemplates(widget.data?.itineraryTemplates, createId)
      },
      createdAt: typeof widget.createdAt === "number" ? widget.createdAt : now,
      updatedAt: typeof widget.updatedAt === "number" ? widget.updatedAt : now
    };
  },

  getUpdatedAt(widget) {
    const latestTrip = normalizeTrips(widget?.data?.trips).reduce((max, trip) => Math.max(max, trip.updatedAt || 0), 0);
    const latestPackingTemplate = normalizePackingTemplates(widget?.data?.packingTemplates).reduce((max, template) => Math.max(max, template.updatedAt || 0), 0);
    const latestItineraryTemplate = normalizeItineraryTemplates(widget?.data?.itineraryTemplates).reduce((max, template) => Math.max(max, template.updatedAt || 0), 0);
    return Math.max(widget?.updatedAt || 0, widget?.createdAt || 0, latestTrip, latestPackingTemplate, latestItineraryTemplate, widget?.settings?.updatedAt || 0);
  },

  getCategories() {
    return [TRAVEL_CATEGORY];
  },

  ensureTasks({ widget, store, helpers }) {
    syncTravelTripLifecycle(widget);
    syncTravelOwnedTasks(widget, store, helpers);
  },

  render({ widget, tasks, escapeHtml }) {
    const trips = normalizeTrips(widget.data?.trips);
    const settings = normalizeTravelSettings(widget.settings);
    const shellLiveByTripId = getTravelUiState(widget.id).shellLiveByTripId || {};
    const upcomingTrips = getUpcomingTrips(trips);
    const nextTrip = upcomingTrips[0] || trips[0] || null;
    const activeTripCount = trips.filter((trip) => trip.status === "active").length;
    const openTravelTaskCount = tasks.filter((task) => task.status === "open" && !task.archived && task.ownerWidgetId === widget.id).length;

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
      <p>${nextTrip
        ? escapeHtml(describeTripMilestone(nextTrip))
        : "Create a trip to start tracking transit, lodging, and packing details."}</p>
      <p>${settings.homeLocation
        ? `Home base: ${escapeHtml(settings.homeLocation)}${settings.homeTimeZone ? ` · ${escapeHtml(settings.homeTimeZone)}` : ""}`
        : "Set your home location in Travel settings to support timezone-aware trip planning."}</p>
      <div class="travel-shell-list">
        ${upcomingTrips.length
          ? upcomingTrips.slice(0, 3).map((trip) => renderTravelShellCard(trip, escapeHtml, shellLiveByTripId[trip.id] || null, settings)).join("")
          : `<p class="empty-state">Your upcoming trips will show up here.</p>`}
      </div>
      <div class="widget-actions">
        <button type="button" class="ghost-button" data-widget-action="travel-new-trip">New trip</button>
        <button type="button" class="ghost-button" data-widget-action="open-widget-detail">Open panel</button>
      </div>
      <p class="sync-status">Flight check-in tasks surface here automatically. Open travel tasks: ${openTravelTaskCount}. Broader itinerary task generation is still coming.</p>
    `;
  },

  async hydrateShell({ widget, root, apiBase, fetchCredentials }) {
    if (!root?.isConnected) {
      return;
    }

    const trips = getUpcomingTrips(normalizeTrips(widget.data?.trips)).slice(0, 3);
    const settings = normalizeTravelSettings(widget.settings);
    const requests = trips
      .map((trip) => buildTravelShellLiveRequest(trip, settings))
      .filter(Boolean);
    const uiState = getTravelUiState(widget.id);

    applyTravelShellLiveData(root, trips, settings, uiState.shellLiveByTripId || {});

    if (requests.length === 0) {
      return;
    }

    const requestKey = JSON.stringify(requests);
    const now = Date.now();
    if (
      uiState.shellLiveRequestKey === requestKey
      && uiState.shellLiveFetchedAt
      && now - uiState.shellLiveFetchedAt < TRAVEL_SHELL_LIVE_TTL_MS
    ) {
      return;
    }
    if (uiState.shellLivePendingKey === requestKey) {
      return;
    }

    const pendingByTripId = {
      ...(uiState.shellLiveByTripId || {})
    };
    for (const request of requests) {
      if (!pendingByTripId[request.tripId]) {
        pendingByTripId[request.tripId] = { status: "loading" };
      }
    }
    uiState.shellLiveByTripId = pendingByTripId;
    uiState.shellLivePendingKey = requestKey;
    const requestToken = now;
    uiState.shellLiveRequestToken = requestToken;
    applyTravelShellLiveData(root, trips, settings, pendingByTripId);

    try {
      const response = await fetch(`${apiBase || ""}/api/travel/live`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: fetchCredentials || "same-origin",
        body: JSON.stringify({ trips: requests })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Travel live lookup failed");
      }
      if (!root.isConnected || getTravelUiState(widget.id).shellLiveRequestToken !== requestToken) {
        return;
      }

      const nextByTripId = {
        ...(uiState.shellLiveByTripId || {})
      };
      for (const snapshot of Array.isArray(payload.trips) ? payload.trips : []) {
        if (!snapshot?.tripId) {
          continue;
        }
        nextByTripId[snapshot.tripId] = snapshot;
      }
      uiState.shellLiveByTripId = nextByTripId;
      uiState.shellLiveFetchedAt = Date.now();
      uiState.shellLiveRequestKey = requestKey;
      uiState.shellLivePendingKey = "";
      applyTravelShellLiveData(root, trips, settings, nextByTripId);
    } catch (error) {
      if (!root.isConnected || getTravelUiState(widget.id).shellLiveRequestToken !== requestToken) {
        return;
      }
      const nextByTripId = {
        ...(uiState.shellLiveByTripId || {})
      };
      for (const request of requests) {
        nextByTripId[request.tripId] = {
          status: "error",
          message: String(error?.message || "Live travel lookup failed")
        };
      }
      uiState.shellLiveByTripId = nextByTripId;
      uiState.shellLivePendingKey = "";
      applyTravelShellLiveData(root, trips, settings, nextByTripId);
    }
  },

  renderDetail({ widget, escapeHtml, formatDate }) {
    const trips = normalizeTrips(widget.data?.trips);
    const settings = normalizeTravelSettings(widget.settings);
    const packingTemplates = normalizePackingTemplates(widget.data?.packingTemplates);
    const itineraryTemplates = normalizeItineraryTemplates(widget.data?.itineraryTemplates);
    const activeTab = getTravelDetailTab(widget.id, trips);
    const activeTrip = activeTab.startsWith("trip:") ? trips.find((trip) => trip.id === activeTab.slice(5)) || null : null;
    const upcomingTrips = getUpcomingTrips(trips);

    return `
      <section class="energy-detail">
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
                ? trips.map((trip) => renderTravelOverviewCard(trip, escapeHtml, formatDate)).join("")
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
          ${activeTrip ? renderTravelTripPanel(activeTrip, packingTemplates, itineraryTemplates, settings, escapeHtml, formatDate) : ""}
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
                ${renderTravelTemplateItemRows([], escapeHtml)}
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
                ? itineraryTemplates.map((template) => renderItineraryTemplateCard(template, escapeHtml, formatDate)).join("")
                : `<p class="empty-state">No saved itineraries yet.</p>`}
            </div>
          </section>
        </div>
      </section>
    `;
  },

  mountDetail({ widget, container, helpers }) {
    const clickHandler = (event) => {
      const tabButton = event.target.closest("[data-travel-detail-tab]");
      if (tabButton) {
        setTravelDetailTab(widget.id, tabButton.getAttribute("data-travel-detail-tab") || "overview", widget.data?.trips);
        helpers.renderAll();
        return;
      }

      const addTemplateItemButton = event.target.closest("[data-travel-add-template-item]");
      if (addTemplateItemButton) {
        const list = container.querySelector("[data-travel-template-item-list]");
        if (list) {
          list.insertAdjacentHTML("beforeend", renderTravelTemplateItemRow({ label: "", quantity: 1 }, helpers.createId(), helpers.escapeHtml || fallbackEscapeHtml));
        }
        return;
      }

      const removeTemplateItemButton = event.target.closest("[data-travel-remove-template-item]");
      if (removeTemplateItemButton) {
        removeTemplateItemButton.closest(".travel-template-item-row")?.remove();
        return;
      }

      const addCustomTaskButton = event.target.closest("[data-travel-add-custom-task]");
      if (addCustomTaskButton) {
        const list = container.querySelector("[data-travel-custom-task-list]");
        if (list) {
          list.querySelector(".empty-state")?.remove();
          list.insertAdjacentHTML("beforeend", renderTravelCustomTaskRow({ name: "", details: "", offsetMinutes: 0 }, null, helpers.escapeHtml || fallbackEscapeHtml));
        }
        return;
      }

      const removeCustomTaskButton = event.target.closest("[data-travel-remove-custom-task]");
      if (removeCustomTaskButton) {
        const row = removeCustomTaskButton.closest(".travel-custom-task-row");
        const list = row?.parentElement;
        row?.remove();
        if (list && !list.querySelector(".travel-custom-task-row")) {
          list.innerHTML = `<p class="empty-state">No itinerary tasks yet. Add things like booking a ride or printing boarding passes.</p>`;
        }
        return;
      }

      const newTripButton = event.target.closest("[data-travel-new-trip]");
      if (newTripButton) {
        const nextTrip = createEmptyTrip(helpers.createId, Date.now(), helpers.todayString());
        widget.data.trips = [...normalizeTrips(widget.data?.trips), nextTrip].sort(compareTripDisplay);
        syncTravelTripLifecycle(widget);
        widget.updatedAt = Date.now();
        syncTravelOwnedTasks(widget, helpers.getStore(), helpers);
        setTravelDetailTab(widget.id, `trip:${nextTrip.id}`, widget.data.trips);
        helpers.persistStore();
        helpers.renderAll();
        helpers.setSyncStatus("Added a new trip.", "success");
        return;
      }

      const openTripButton = event.target.closest("[data-travel-open-trip]");
      if (openTripButton) {
        const tripId = openTripButton.getAttribute("data-trip-id") || "";
        setTravelDetailTab(widget.id, `trip:${tripId}`, widget.data?.trips);
        helpers.renderAll();
        return;
      }

      const deleteTripButton = event.target.closest("[data-travel-delete-trip]");
      if (deleteTripButton) {
        const tripId = deleteTripButton.getAttribute("data-trip-id") || "";
        const before = normalizeTrips(widget.data?.trips);
        widget.data.trips = before.filter((trip) => trip.id !== tripId);
        if (widget.data.trips.length === before.length) {
          helpers.setSyncStatus("That trip could not be found.", "error");
          return;
        }
        syncTravelTripLifecycle(widget);
        widget.updatedAt = Date.now();
        syncTravelOwnedTasks(widget, helpers.getStore(), helpers);
        setTravelDetailTab(widget.id, "overview", widget.data.trips);
        helpers.persistStore();
        helpers.renderAll();
        helpers.setSyncStatus("Removed that trip.", "info");
        return;
      }

      const startTripButton = event.target.closest("[data-travel-start-trip]");
      if (startTripButton) {
        const tripId = startTripButton.getAttribute("data-trip-id") || "";
        const now = Date.now();
        const updatedTrip = updateTripById(widget, tripId, (trip) => ({
          ...trip,
          status: "active",
          statusOverride: "active",
          updatedAt: now
        }));
        if (!updatedTrip) {
          helpers.setSyncStatus("That trip could not be found.", "error");
          return;
        }
        syncTravelTripLifecycle(widget);
        widget.updatedAt = now;
        syncTravelOwnedTasks(widget, helpers.getStore(), helpers);
        helpers.persistStore();
        helpers.renderAll();
        helpers.setSyncStatus(`Started ${updatedTrip.name}.`, "success");
        return;
      }

      const endTripButton = event.target.closest("[data-travel-end-trip]");
      if (endTripButton) {
        const tripId = endTripButton.getAttribute("data-trip-id") || "";
        const now = Date.now();
        const updatedTrip = updateTripById(widget, tripId, (trip) => ({
          ...trip,
          status: "complete",
          statusOverride: "complete",
          updatedAt: now
        }));
        if (!updatedTrip) {
          helpers.setSyncStatus("That trip could not be found.", "error");
          return;
        }
        syncTravelTripLifecycle(widget);
        widget.updatedAt = now;
        syncTravelOwnedTasks(widget, helpers.getStore(), helpers);
        helpers.persistStore();
        helpers.renderAll();
        helpers.setSyncStatus(`Ended ${updatedTrip.name}.`, "info");
        return;
      }

      const togglePackedButton = event.target.closest("[data-travel-toggle-packed]");
      if (togglePackedButton) {
        const tripId = togglePackedButton.getAttribute("data-trip-id") || "";
        const itemId = togglePackedButton.getAttribute("data-item-id") || "";
        const updatedTrip = updateTripById(widget, tripId, (trip) => {
          const now = Date.now();
          return {
            ...trip,
            packingList: {
              ...trip.packingList,
              items: trip.packingList.items.map((item) => item.id === itemId ? { ...item, packed: !item.packed, updatedAt: now } : item),
              updatedAt: now
            },
            updatedAt: now
          };
        });
        if (!updatedTrip) {
          helpers.setSyncStatus("That trip could not be found.", "error");
          return;
        }
        widget.updatedAt = Date.now();
        helpers.persistStore();
        helpers.renderAll();
        return;
      }

      const adjustQuantityButton = event.target.closest("[data-travel-adjust-quantity]");
      if (adjustQuantityButton) {
        const tripId = adjustQuantityButton.getAttribute("data-trip-id") || "";
        const itemId = adjustQuantityButton.getAttribute("data-item-id") || "";
        const delta = Number(adjustQuantityButton.getAttribute("data-quantity-delta") || "0");
        const updatedTrip = updateTripById(widget, tripId, (trip) => {
          const now = Date.now();
          return {
            ...trip,
            packingList: {
              ...trip.packingList,
              items: trip.packingList.items.map((item) => item.id === itemId ? {
                ...item,
                quantity: normalizePackingQuantity((item.quantity || 1) + delta),
                updatedAt: now
              } : item),
              updatedAt: now
            },
            updatedAt: now
          };
        });
        if (!updatedTrip) {
          helpers.setSyncStatus("That packing item could not be found.", "error");
          return;
        }
        widget.updatedAt = Date.now();
        helpers.persistStore();
        helpers.renderAll();
        return;
      }

      const deleteItemButton = event.target.closest("[data-travel-delete-item]");
      if (deleteItemButton) {
        const tripId = deleteItemButton.getAttribute("data-trip-id") || "";
        const itemId = deleteItemButton.getAttribute("data-item-id") || "";
        const updatedTrip = updateTripById(widget, tripId, (trip) => {
          const now = Date.now();
          return {
            ...trip,
            packingList: {
              ...trip.packingList,
              items: trip.packingList.items.filter((item) => item.id !== itemId),
              updatedAt: now
            },
            updatedAt: now
          };
        });
        if (!updatedTrip) {
          helpers.setSyncStatus("That trip could not be found.", "error");
          return;
        }
        widget.updatedAt = Date.now();
        helpers.persistStore();
        helpers.renderAll();
        helpers.setSyncStatus("Removed that packing item.", "info");
        return;
      }

      const applyPackingTemplateButton = event.target.closest("[data-travel-apply-packing-template]");
      if (applyPackingTemplateButton) {
        const tripId = applyPackingTemplateButton.getAttribute("data-trip-id") || "";
        const select = container.querySelector(`[data-travel-packing-template-select="${tripId}"]`);
        const templateId = select?.value || "";
        const template = normalizePackingTemplates(widget.data?.packingTemplates).find((entry) => entry.id === templateId);
        if (!template) {
          helpers.setSyncStatus("Choose a saved packing list first.", "error");
          return;
        }
        const now = Date.now();
        const updatedTrip = updateTripById(widget, tripId, (trip) => ({
          ...trip,
          packingList: {
            ...trip.packingList,
            items: dedupePackingItems([
              ...trip.packingList.items,
              ...template.items.map((item) => ({
                id: helpers.createId(),
                label: item.label,
                packed: false,
                quantity: item.quantity || 1,
                notes: "",
                updatedAt: now
              }))
            ]),
            updatedAt: now
          },
          updatedAt: now
        }));
        if (!updatedTrip) {
          helpers.setSyncStatus("That trip could not be found.", "error");
          return;
        }
        widget.updatedAt = now;
        syncTravelOwnedTasks(widget, helpers.getStore(), helpers);
        helpers.persistStore();
        helpers.renderAll();
        helpers.setSyncStatus(`Applied ${template.name} to ${updatedTrip.name}.`, "success");
        return;
      }

      const savePackingTemplateButton = event.target.closest("[data-travel-save-packing-template]");
      if (savePackingTemplateButton) {
        const tripId = savePackingTemplateButton.getAttribute("data-trip-id") || "";
        const trip = normalizeTrips(widget.data?.trips).find((entry) => entry.id === tripId);
        const input = container.querySelector(`[data-travel-save-packing-name="${tripId}"]`);
        const templateName = normalizeText(input?.value, 80);
        if (!trip || !templateName) {
          helpers.setSyncStatus("Enter a template name before saving this packing list.", "error");
          return;
        }
        const now = Date.now();
        widget.data.packingTemplates = [
          ...normalizePackingTemplates(widget.data?.packingTemplates),
          {
            id: helpers.createId(),
            name: templateName,
            items: trip.packingList.items.map((item) => ({
              id: helpers.createId(),
              label: item.label,
              quantity: item.quantity || 1,
              packed: false,
              notes: ""
            })),
            createdAt: now,
            updatedAt: now
          }
        ].sort(compareTemplateDisplay);
        widget.updatedAt = now;
        helpers.persistStore();
        helpers.renderAll();
        helpers.setSyncStatus(`Saved ${templateName} as a packing list template.`, "success");
        return;
      }

      const applyItineraryTemplateButton = event.target.closest("[data-travel-apply-itinerary-template]");
      if (applyItineraryTemplateButton) {
        const tripId = applyItineraryTemplateButton.getAttribute("data-trip-id") || "";
        const select = container.querySelector(`[data-travel-itinerary-template-select="${tripId}"]`);
        const templateId = select?.value || "";
        const template = normalizeItineraryTemplates(widget.data?.itineraryTemplates).find((entry) => entry.id === templateId);
        if (!template) {
          helpers.setSyncStatus("Choose a saved itinerary first.", "error");
          return;
        }
        const now = Date.now();
        const updatedTrip = updateTripById(widget, tripId, (trip) => ({
          ...trip,
          destination: template.destination || trip.destination,
          startDate: template.startDate || trip.startDate,
          endDate: template.endDate || trip.endDate,
          itinerary: normalizeTripItinerary(template.itinerary, helpers.createId),
          packingList: {
            items: template.packingItems.map((item) => ({
              id: helpers.createId(),
              label: item.label,
              quantity: item.quantity || 1,
              packed: false,
              notes: "",
              updatedAt: now
            })),
            updatedAt: now
          },
          updatedAt: now
        }));
        if (!updatedTrip) {
          helpers.setSyncStatus("That trip could not be found.", "error");
          return;
        }
        syncTravelTripLifecycle(widget);
        widget.updatedAt = now;
        syncTravelOwnedTasks(widget, helpers.getStore(), helpers);
        helpers.persistStore();
        helpers.renderAll();
        helpers.setSyncStatus(`Applied ${template.name} to ${updatedTrip.name}.`, "success");
        return;
      }

      const saveItineraryTemplateButton = event.target.closest("[data-travel-save-itinerary-template]");
      if (saveItineraryTemplateButton) {
        const tripId = saveItineraryTemplateButton.getAttribute("data-trip-id") || "";
        const trip = normalizeTrips(widget.data?.trips).find((entry) => entry.id === tripId);
        const input = container.querySelector(`[data-travel-save-itinerary-name="${tripId}"]`);
        const templateName = normalizeText(input?.value, 80);
        if (!trip || !templateName) {
          helpers.setSyncStatus("Enter a template name before saving this itinerary.", "error");
          return;
        }
        const now = Date.now();
        widget.data.itineraryTemplates = [
          ...normalizeItineraryTemplates(widget.data?.itineraryTemplates),
          {
            id: helpers.createId(),
            name: templateName,
            destination: trip.destination,
            startDate: trip.startDate,
            endDate: trip.endDate,
            itinerary: normalizeTripItinerary(trip.itinerary, helpers.createId),
            packingItems: trip.packingList.items.map((item) => ({
              id: helpers.createId(),
              label: item.label,
              quantity: item.quantity || 1,
              packed: false,
              notes: ""
            })),
            createdAt: now,
            updatedAt: now
          }
        ].sort(compareTemplateDisplay);
        widget.updatedAt = now;
        helpers.persistStore();
        helpers.renderAll();
        helpers.setSyncStatus(`Saved ${templateName} as an itinerary template.`, "success");
        return;
      }

      const createTripFromTemplateButton = event.target.closest("[data-travel-create-trip-from-template]");
      if (createTripFromTemplateButton) {
        const templateId = createTripFromTemplateButton.getAttribute("data-template-id") || "";
        const template = normalizeItineraryTemplates(widget.data?.itineraryTemplates).find((entry) => entry.id === templateId);
        if (!template) {
          helpers.setSyncStatus("That itinerary template could not be found.", "error");
          return;
        }
        const now = Date.now();
        const trip = {
          id: helpers.createId(),
          name: template.name,
          destination: template.destination,
          status: "planning",
          statusPreset: "planning",
          statusOverride: "",
          startDate: template.startDate,
          endDate: template.endDate,
          itinerary: normalizeTripItinerary(template.itinerary, helpers.createId),
          packingList: {
            items: template.packingItems.map((item) => ({
              id: helpers.createId(),
              label: item.label,
              quantity: item.quantity || 1,
              packed: false,
              notes: "",
              updatedAt: now
            })),
            updatedAt: now
          },
          createdAt: now,
          updatedAt: now
        };
        widget.data.trips = [...normalizeTrips(widget.data?.trips), trip].sort(compareTripDisplay);
        syncTravelTripLifecycle(widget);
        widget.updatedAt = now;
        syncTravelOwnedTasks(widget, helpers.getStore(), helpers);
        setTravelDetailTab(widget.id, `trip:${trip.id}`, widget.data.trips);
        helpers.persistStore();
        helpers.renderAll();
        helpers.setSyncStatus(`Created a new trip from ${template.name}.`, "success");
        return;
      }

      const deletePackingTemplateButton = event.target.closest("[data-travel-delete-packing-template]");
      if (deletePackingTemplateButton) {
        const templateId = deletePackingTemplateButton.getAttribute("data-template-id") || "";
        const before = normalizePackingTemplates(widget.data?.packingTemplates);
        widget.data.packingTemplates = before.filter((template) => template.id !== templateId);
        if (widget.data.packingTemplates.length === before.length) {
          helpers.setSyncStatus("That packing template could not be found.", "error");
          return;
        }
        widget.updatedAt = Date.now();
        helpers.persistStore();
        helpers.renderAll();
        helpers.setSyncStatus("Removed that saved packing list.", "info");
        return;
      }

      const deleteItineraryTemplateButton = event.target.closest("[data-travel-delete-itinerary-template]");
      if (deleteItineraryTemplateButton) {
        const templateId = deleteItineraryTemplateButton.getAttribute("data-template-id") || "";
        const before = normalizeItineraryTemplates(widget.data?.itineraryTemplates);
        widget.data.itineraryTemplates = before.filter((template) => template.id !== templateId);
        if (widget.data.itineraryTemplates.length === before.length) {
          helpers.setSyncStatus("That itinerary template could not be found.", "error");
          return;
        }
        widget.updatedAt = Date.now();
        helpers.persistStore();
        helpers.renderAll();
        helpers.setSyncStatus("Removed that saved itinerary.", "info");
      }
    };

    const submitHandler = (event) => {
      const settingsForm = event.target.closest("[data-travel-settings-form]");
      if (settingsForm) {
        event.preventDefault();
        const homeLocation = normalizeText(settingsForm.querySelector("[data-travel-home-location]")?.value, 120);
        const homeTimeZone = normalizeTimeZone(settingsForm.querySelector("[data-travel-home-timezone]")?.value);
        if (settingsForm.querySelector("[data-travel-home-timezone]")?.value && !homeTimeZone) {
          helpers.setSyncStatus("Home time zone must be a valid IANA zone like America/Los_Angeles.", "error");
          return;
        }
        widget.settings = {
          ...normalizeTravelSettings(widget.settings),
          homeLocation,
          homeTimeZone,
          updatedAt: Date.now()
        };
        syncTravelTripLifecycle(widget);
        widget.updatedAt = Date.now();
        syncTravelOwnedTasks(widget, helpers.getStore(), helpers);
        helpers.persistStore();
        helpers.renderAll();
        helpers.setSyncStatus("Saved Travel Buddy settings.", "success");
        return;
      }

      const tripForm = event.target.closest("[data-travel-trip-form]");
      if (tripForm) {
        event.preventDefault();
        const tripId = tripForm.getAttribute("data-trip-id") || "";
        const now = Date.now();
        const selectedStatus = normalizeTripStatus(tripForm.querySelector("[data-travel-status]")?.value);
        const outboundDate = normalizeDateValue(tripForm.querySelector("[data-travel-outbound-date]")?.value);
        const outboundTime = normalizeTimeValue(tripForm.querySelector("[data-travel-outbound-time]")?.value);
        const tripTaskEntries = collectTripCustomTasks({
          form: tripForm,
          createId: helpers.createId,
          settings: normalizeTravelSettings(widget.settings),
          outboundDate,
          outboundTime,
          outboundOrigin: normalizeText(tripForm.querySelector("[data-travel-outbound-origin]")?.value, 120),
          outboundLabel: normalizeText(tripForm.querySelector("[data-travel-outbound-label]")?.value, 80),
          outboundDestination: normalizeText(tripForm.querySelector("[data-travel-outbound-destination]")?.value, 120),
          tripDestination: normalizeText(tripForm.querySelector("[data-travel-destination]")?.value, 120)
        });
        if (tripTaskEntries.error) {
          helpers.setSyncStatus(tripTaskEntries.error, "error");
          return;
        }
        const updatedTrip = updateTripById(widget, tripId, (trip) => ({
          ...trip,
          name: normalizeText(tripForm.querySelector("[data-travel-name]")?.value, 80) || "Trip",
          destination: normalizeText(tripForm.querySelector("[data-travel-destination]")?.value, 120),
          status: selectedStatus,
          statusPreset: selectedStatus === "planning" || selectedStatus === "booked"
            ? selectedStatus
            : normalizeTripStatusPreset(trip.statusPreset || trip.status),
          statusOverride: selectedStatus === "active" || selectedStatus === "complete" ? selectedStatus : "",
          startDate: normalizeDateValue(tripForm.querySelector("[data-travel-start-date]")?.value),
          endDate: normalizeDateValue(tripForm.querySelector("[data-travel-end-date]")?.value),
          itinerary: normalizeTripItinerary({
            outboundLabel: tripForm.querySelector("[data-travel-outbound-label]")?.value,
            outboundOrigin: tripForm.querySelector("[data-travel-outbound-origin]")?.value,
            outboundDestination: tripForm.querySelector("[data-travel-outbound-destination]")?.value,
            outboundFlightNumber: tripForm.querySelector("[data-travel-outbound-flight-number]")?.value,
            outboundDate: tripForm.querySelector("[data-travel-outbound-date]")?.value,
            outboundTime: tripForm.querySelector("[data-travel-outbound-time]")?.value,
            returnLabel: tripForm.querySelector("[data-travel-return-label]")?.value,
            returnOrigin: tripForm.querySelector("[data-travel-return-origin]")?.value,
            returnDestination: tripForm.querySelector("[data-travel-return-destination]")?.value,
            returnFlightNumber: tripForm.querySelector("[data-travel-return-flight-number]")?.value,
            returnDate: tripForm.querySelector("[data-travel-return-date]")?.value,
            returnTime: tripForm.querySelector("[data-travel-return-time]")?.value,
            lodgingName: tripForm.querySelector("[data-travel-lodging-name]")?.value,
            lodgingAddress: tripForm.querySelector("[data-travel-lodging-address]")?.value,
            checkInDate: tripForm.querySelector("[data-travel-checkin-date]")?.value,
            checkOutDate: tripForm.querySelector("[data-travel-checkout-date]")?.value,
            notes: tripForm.querySelector("[data-travel-notes]")?.value,
            customTasks: tripTaskEntries.items
          }, helpers.createId),
          updatedAt: now
        }));
        if (!updatedTrip) {
          helpers.setSyncStatus("That trip could not be found.", "error");
          return;
        }
        syncTravelTripLifecycle(widget);
        widget.updatedAt = now;
        syncTravelOwnedTasks(widget, helpers.getStore(), helpers);
        helpers.persistStore();
        helpers.renderAll();
        helpers.setSyncStatus(`Saved ${updatedTrip.name}.`, "success");
        return;
      }

      const addPackingItemForm = event.target.closest("[data-travel-packing-item-form]");
      if (addPackingItemForm) {
        event.preventDefault();
        const tripId = addPackingItemForm.getAttribute("data-trip-id") || "";
        const input = addPackingItemForm.querySelector("[data-travel-packing-item-input]");
        const quantityInput = addPackingItemForm.querySelector("[data-travel-packing-quantity]");
        const label = normalizeText(input?.value, 120);
        const quantity = normalizePackingQuantity(quantityInput?.value);
        if (!label) {
          helpers.setSyncStatus("Enter a packing item first.", "error");
          return;
        }
        const now = Date.now();
        const updatedTrip = updateTripById(widget, tripId, (trip) => ({
          ...trip,
          packingList: {
            ...trip.packingList,
            items: dedupePackingItems([
              ...trip.packingList.items,
              {
                id: helpers.createId(),
                label,
                packed: false,
                quantity,
                notes: "",
                updatedAt: now
              }
            ]),
            updatedAt: now
          },
          updatedAt: now
        }));
        if (!updatedTrip) {
          helpers.setSyncStatus("That trip could not be found.", "error");
          return;
        }
        widget.updatedAt = now;
        helpers.persistStore();
        helpers.renderAll();
        helpers.setSyncStatus(`Added ${label} to ${updatedTrip.name}.`, "success");
        return;
      }

      const packingTemplateForm = event.target.closest("[data-travel-packing-template-form]");
      if (packingTemplateForm) {
        event.preventDefault();
        const name = normalizeText(packingTemplateForm.querySelector("[data-travel-template-name]")?.value, 80);
        const items = collectTemplateItems(packingTemplateForm);
        if (!name || items.length === 0) {
          helpers.setSyncStatus("Enter a name and at least one packing item.", "error");
          return;
        }
        const now = Date.now();
        widget.data.packingTemplates = [
          ...normalizePackingTemplates(widget.data?.packingTemplates),
          {
            id: helpers.createId(),
            name,
            items: items.map((item) => ({
              id: helpers.createId(),
              label: item.label,
              quantity: item.quantity,
              packed: false,
              notes: ""
            })),
            createdAt: now,
            updatedAt: now
          }
        ].sort(compareTemplateDisplay);
        widget.updatedAt = now;
        helpers.persistStore();
        helpers.renderAll();
        helpers.setSyncStatus(`Saved ${name} as a packing template.`, "success");
      }
    };

    container.addEventListener("click", clickHandler);
    container.addEventListener("submit", submitHandler);
    return () => {
      container.removeEventListener("click", clickHandler);
      container.removeEventListener("submit", submitHandler);
    };
  },

  handleAction({ action, actionTarget, widget, helpers }) {
    if (action === "travel-new-trip") {
      const nextTrip = createEmptyTrip(helpers.createId, Date.now(), formatTodayLocal());
      widget.data.trips = [...normalizeTrips(widget.data?.trips), nextTrip].sort(compareTripDisplay);
      syncTravelTripLifecycle(widget);
      widget.updatedAt = Date.now();
      syncTravelOwnedTasks(widget, helpers.getStore(), helpers);
      setTravelDetailTab(widget.id, `trip:${nextTrip.id}`, widget.data.trips);
      helpers.persistStore();
      helpers.openWidgetDetail(widget);
      helpers.renderAll();
      helpers.setSyncStatus("Added a new trip.", "success");
      return true;
    }

    if (action === "travel-open-trip") {
      const tripId = actionTarget.getAttribute("data-trip-id") || "";
      setTravelDetailTab(widget.id, `trip:${tripId}`, widget.data?.trips);
      helpers.openWidgetDetail(widget);
      return true;
    }

    return false;
  }
};

function normalizeTrips(value, createId = () => `travel-trip-${Math.random()}`) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((trip) => normalizeTrip(trip, createId))
    .filter(Boolean)
    .sort(compareTripDisplay);
}

function normalizeTrip(value, createId) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const now = typeof value.updatedAt === "number" ? value.updatedAt : Date.now();
  const rawStatus = normalizeTripStatus(value.status);
  return {
    id: typeof value.id === "string" && value.id ? value.id : createId(),
    name: normalizeText(value.name, 80) || "Trip",
    destination: normalizeText(value.destination, 120),
    status: rawStatus,
    statusPreset: normalizeTripStatusPreset(value.statusPreset || (rawStatus === "planning" || rawStatus === "booked" ? rawStatus : "booked")),
    statusOverride: normalizeTripStatusOverride(value.statusOverride || (rawStatus === "active" ? "active" : rawStatus === "complete" ? "complete" : "")),
    startDate: normalizeDateValue(value.startDate),
    endDate: normalizeDateValue(value.endDate),
    itinerary: normalizeTripItinerary(value.itinerary, createId),
    packingList: {
      items: normalizePackingItems(value.packingList?.items, createId),
      updatedAt: typeof value.packingList?.updatedAt === "number" ? value.packingList.updatedAt : now
    },
    createdAt: typeof value.createdAt === "number" ? value.createdAt : now,
    updatedAt: now
  };
}

function normalizeTravelSettings(value) {
  return {
    homeLocation: normalizeText(value?.homeLocation, 120),
    homeTimeZone: normalizeTimeZone(value?.homeTimeZone),
    updatedAt: typeof value?.updatedAt === "number" ? value.updatedAt : 0
  };
}

function normalizeTripItinerary(value, createId = () => `travel-custom-task-${Math.random()}`) {
  return {
    outboundLabel: normalizeText(value?.outboundLabel, 80),
    outboundOrigin: normalizeText(value?.outboundOrigin, 120),
    outboundDestination: normalizeText(value?.outboundDestination, 120),
    outboundFlightNumber: normalizeText(value?.outboundFlightNumber, 24).toUpperCase(),
    outboundDate: normalizeDateValue(value?.outboundDate),
    outboundTime: normalizeTimeValue(value?.outboundTime),
    returnLabel: normalizeText(value?.returnLabel, 80),
    returnOrigin: normalizeText(value?.returnOrigin, 120),
    returnDestination: normalizeText(value?.returnDestination, 120),
    returnFlightNumber: normalizeText(value?.returnFlightNumber, 24).toUpperCase(),
    returnDate: normalizeDateValue(value?.returnDate),
    returnTime: normalizeTimeValue(value?.returnTime),
    lodgingName: normalizeText(value?.lodgingName, 120),
    lodgingAddress: normalizeText(value?.lodgingAddress, 240),
    checkInDate: normalizeDateValue(value?.checkInDate),
    checkOutDate: normalizeDateValue(value?.checkOutDate),
    notes: normalizeLongText(value?.notes, 2000),
    customTasks: normalizeTravelCustomTasks(value?.customTasks, createId)
  };
}

function normalizePackingItems(value, createId = () => `travel-item-${Math.random()}`) {
  if (!Array.isArray(value)) {
    return [];
  }
  return dedupePackingItems(value
    .map((item) => normalizePackingItem(item, createId))
    .filter(Boolean));
}

function normalizePackingItem(value, createId) {
  const label = normalizeText(value?.label || value, 120);
  if (!label) {
    return null;
  }
  return {
    id: typeof value?.id === "string" && value.id ? value.id : createId(),
    label,
    packed: value?.packed === true,
    quantity: normalizePackingQuantity(value?.quantity),
    notes: normalizeText(value?.notes, 240),
    updatedAt: typeof value?.updatedAt === "number" ? value.updatedAt : Date.now()
  };
}

function normalizePackingTemplates(value, createId = () => `packing-template-${Math.random()}`) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((template) => {
      const name = normalizeText(template?.name, 80);
      if (!name) {
        return null;
      }
      const now = typeof template.updatedAt === "number" ? template.updatedAt : Date.now();
      return {
        id: typeof template.id === "string" && template.id ? template.id : createId(),
        name,
        items: normalizePackingItems(template.items, createId),
        createdAt: typeof template.createdAt === "number" ? template.createdAt : now,
        updatedAt: now
      };
    })
    .filter(Boolean)
    .sort(compareTemplateDisplay);
}

function normalizeItineraryTemplates(value, createId = () => `itinerary-template-${Math.random()}`) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((template) => {
      const name = normalizeText(template?.name, 80);
      if (!name) {
        return null;
      }
      const now = typeof template.updatedAt === "number" ? template.updatedAt : Date.now();
      return {
        id: typeof template.id === "string" && template.id ? template.id : createId(),
        name,
        destination: normalizeText(template.destination, 120),
        startDate: normalizeDateValue(template.startDate),
        endDate: normalizeDateValue(template.endDate),
        itinerary: normalizeTripItinerary(template.itinerary, createId),
        packingItems: normalizePackingItems(template.packingItems, createId),
        createdAt: typeof template.createdAt === "number" ? template.createdAt : now,
        updatedAt: now
      };
    })
    .filter(Boolean)
    .sort(compareTemplateDisplay);
}

function createEmptyTrip(createId, now, todayString) {
  return {
    id: createId(),
    name: "New trip",
    destination: "",
    status: "planning",
    statusPreset: "planning",
    statusOverride: "",
    startDate: todayString,
    endDate: todayString,
    itinerary: normalizeTripItinerary({}, createId),
    packingList: {
      items: [],
      updatedAt: now
    },
    createdAt: now,
    updatedAt: now
  };
}

function updateTripById(widget, tripId, updater) {
  let updatedTrip = null;
  widget.data.trips = normalizeTrips(widget.data?.trips).map((trip) => {
    if (trip.id !== tripId) {
      return trip;
    }
    updatedTrip = updater(trip);
    return updatedTrip;
  }).sort(compareTripDisplay);
  return updatedTrip;
}

function getUpcomingTrips(trips) {
  return normalizeTrips(trips)
    .filter((trip) => trip.status !== "complete")
    .sort(compareTripDisplay);
}

function syncTravelTripLifecycle(widget) {
  const trips = normalizeTrips(widget.data?.trips);
  if (trips.length === 0) {
    widget.data.trips = [];
    return;
  }

  const settings = normalizeTravelSettings(widget.settings);
  const now = Date.now();
  const candidates = [];
  let changed = false;

  for (const trip of trips) {
    const lifecycle = getTripLifecycle(trip, settings, now);
    if (lifecycle.activeCandidate) {
      candidates.push({ trip, lifecycle });
    }
  }

  const selectedActiveId = chooseActiveTripId(candidates, now);
  for (const trip of trips) {
    const lifecycle = getTripLifecycle(trip, settings, now);
    const previousStatus = trip.status;
    const previousOverride = trip.statusOverride;
    let nextOverride = trip.statusOverride;
    let nextStatus = trip.statusPreset;

    if (nextOverride === "complete" || lifecycle.ended) {
      nextStatus = "complete";
      if (nextOverride === "active" && lifecycle.ended) {
        nextOverride = "";
      }
    } else if (selectedActiveId && trip.id === selectedActiveId) {
      nextStatus = "active";
    } else if (nextOverride === "active") {
      nextOverride = "";
      nextStatus = trip.statusPreset;
    } else {
      nextStatus = trip.statusPreset;
    }

    trip.statusOverride = nextOverride;
    trip.status = nextStatus;
    if (trip.status !== previousStatus || trip.statusOverride !== previousOverride) {
      trip.updatedAt = now;
      changed = true;
    }
  }

  if (changed) {
    widget.updatedAt = now;
  }
  widget.data.trips = trips.sort(compareTripDisplay);
}

function chooseActiveTripId(candidates, now) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return "";
  }

  const sorted = [...candidates].sort((left, right) => compareActiveTripCandidates(left, right, now));
  return sorted[0]?.trip?.id || "";
}

function compareActiveTripCandidates(left, right, now) {
  const leftManual = left.trip.statusOverride === "active";
  const rightManual = right.trip.statusOverride === "active";
  if (leftManual !== rightManual) {
    return leftManual ? -1 : 1;
  }

  const leftInProgress = left.lifecycle.departureTimestamp > 0 && now >= left.lifecycle.departureTimestamp;
  const rightInProgress = right.lifecycle.departureTimestamp > 0 && now >= right.lifecycle.departureTimestamp;
  if (leftInProgress !== rightInProgress) {
    return leftInProgress ? -1 : 1;
  }

  if (leftInProgress && rightInProgress) {
    return right.lifecycle.departureTimestamp - left.lifecycle.departureTimestamp;
  }

  if (left.lifecycle.departureTimestamp !== right.lifecycle.departureTimestamp) {
    return left.lifecycle.departureTimestamp - right.lifecycle.departureTimestamp;
  }

  return (right.trip.updatedAt || 0) - (left.trip.updatedAt || 0);
}

function getTripLifecycle(trip, settings, now = Date.now()) {
  const departureTimestamp = resolveTravelDepartureTimestamp(trip, settings);
  const returnTimestamp = resolveTravelReturnTimestamp(trip, settings);
  const activeStart = Number.isFinite(departureTimestamp) && departureTimestamp > 0
    ? departureTimestamp - 24 * 60 * 60 * 1000
    : 0;
  const activeEnd = Number.isFinite(returnTimestamp) && returnTimestamp > 0
    ? returnTimestamp + 24 * 60 * 60 * 1000
    : 0;
  const autoActive = activeStart > 0 && now >= activeStart && (activeEnd === 0 || now <= activeEnd);
  const ended = activeEnd > 0 && now > activeEnd;
  const defaultStatus = trip.statusOverride === "complete"
    ? "complete"
    : trip.statusOverride === "active"
      ? "active"
      : ended
        ? "complete"
        : autoActive
          ? "active"
          : trip.statusPreset;
  return {
    departureTimestamp,
    returnTimestamp,
    activeStart,
    activeEnd,
    autoActive,
    ended,
    activeCandidate: trip.statusOverride === "active" || autoActive,
    defaultStatus
  };
}

function compareTripDisplay(left, right) {
  const leftDate = left.startDate || left.endDate || "9999-12-31";
  const rightDate = right.startDate || right.endDate || "9999-12-31";
  if (leftDate !== rightDate) {
    return leftDate.localeCompare(rightDate);
  }
  return (right.updatedAt || 0) - (left.updatedAt || 0);
}

function compareTemplateDisplay(left, right) {
  return (left.name || "").localeCompare(right.name || "");
}

function describeTripMilestone(trip) {
  const milestone = getNextTripMilestone(trip);
  if (!milestone) {
    return `${trip.name} is currently ${humanizeTripStatus(trip.status)}.`;
  }
  return `${trip.name}: ${milestone.label} ${milestone.at}.`;
}

function getNextTripMilestone(trip) {
  const now = Date.now();
  const candidates = [
    { label: trip.itinerary.outboundLabel || "Outbound transit", date: trip.itinerary.outboundDate, time: trip.itinerary.outboundTime },
    { label: "Trip start", date: trip.startDate, time: "" },
    { label: "Hotel check-in", date: trip.itinerary.checkInDate, time: "" },
    { label: trip.itinerary.returnLabel || "Return transit", date: trip.itinerary.returnDate, time: trip.itinerary.returnTime },
    { label: "Hotel check-out", date: trip.itinerary.checkOutDate, time: "" },
    { label: "Trip end", date: trip.endDate, time: "" }
  ]
    .map((candidate) => ({ ...candidate, timestamp: toDateTime(candidate.date, candidate.time) }))
    .filter((candidate) => candidate.timestamp);
  const upcoming = candidates.find((candidate) => candidate.timestamp >= now) || candidates[candidates.length - 1];
  if (!upcoming) {
    return null;
  }
  return {
    label: upcoming.label,
    at: formatDateTimeLabel(upcoming.date, upcoming.time)
  };
}

function renderTravelShellCard(trip, escapeHtml, liveSnapshot = null, settings = {}) {
  const liveMarkup = renderTravelShellLiveMarkup(
    liveSnapshot,
    escapeHtml,
    Boolean(buildTravelShellLiveRequest(trip, settings))
  );
  return `
    <article class="travel-shell-card">
      <div class="travel-shell-card-header">
        <div>
          <h4>${escapeHtml(trip.name)}</h4>
          <p>${trip.destination ? escapeHtml(trip.destination) : "Destination TBD"}</p>
        </div>
        <span class="travel-status-chip is-${trip.status}">${escapeHtml(humanizeTripStatus(trip.status))}</span>
      </div>
      <p class="travel-shell-card-meta">${escapeHtml(describeTripRange(trip))}</p>
      <p class="travel-shell-card-meta">${escapeHtml(describeTripMilestone(trip))}</p>
      <div class="travel-shell-live" data-travel-live-trip-id="${trip.id}">
        ${liveMarkup}
      </div>
      <div class="widget-actions travel-shell-actions">
        <button type="button" class="ghost-button" data-widget-action="travel-open-trip" data-trip-id="${trip.id}">View trip</button>
      </div>
    </article>
  `;
}

function renderTravelShellLiveMarkup(snapshot, escapeHtml, shouldShowPlaceholder = false) {
  if (!snapshot) {
    return shouldShowPlaceholder ? `<p class="travel-shell-live-note muted">Fetching live travel updates...</p>` : "";
  }
  if (snapshot.status === "loading") {
    return `<p class="travel-shell-live-note muted">Fetching live travel updates...</p>`;
  }
  if (snapshot.status === "error") {
    return `<p class="travel-shell-live-note muted">${escapeHtml(snapshot.message || "Live travel updates are unavailable right now.")}</p>`;
  }

  const sections = [];
  if (snapshot.flight) {
    sections.push(renderTravelFlightLiveSection(snapshot.flight, escapeHtml));
  }
  if (snapshot.weather) {
    sections.push(renderTravelWeatherLiveSection(snapshot.weather, escapeHtml));
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

  return `
    <section class="travel-shell-live-section">
      <span class="travel-shell-live-label">Flight</span>
      <strong>${escapeHtml(flight.flightLabel || "Flight status")}</strong>
      ${routeLabel ? `<span>${escapeHtml(routeLabel)}</span>` : ""}
      ${detailBits.length ? `<span>${escapeHtml(detailBits.join(" · "))}</span>` : ""}
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

function applyTravelShellLiveData(root, trips, settings, liveByTripId = {}) {
  if (!root?.isConnected) {
    return;
  }
  for (const trip of trips) {
    const container = root.querySelector(`[data-travel-live-trip-id="${trip.id}"]`);
    if (!container) {
      continue;
    }
    container.innerHTML = renderTravelShellLiveMarkup(
      liveByTripId[trip.id] || null,
      fallbackEscapeHtml,
      Boolean(buildTravelShellLiveRequest(trip, settings))
    );
  }
}

function renderTravelOverviewCard(trip, escapeHtml, formatDate) {
  return `
    <article class="travel-board-card">
      <div class="travel-board-card-header">
        <div>
          <h4>${escapeHtml(trip.name)}</h4>
          <p>${trip.destination ? escapeHtml(trip.destination) : "Destination TBD"}</p>
        </div>
        <span class="travel-status-chip is-${trip.status}">${escapeHtml(humanizeTripStatus(trip.status))}</span>
      </div>
      <p>${escapeHtml(describeTripRange(trip, formatDate))}</p>
      <p>${escapeHtml(describeTripMilestone(trip))}</p>
      <p>${trip.packingList.items.length} packing item${trip.packingList.items.length === 1 ? "" : "s"} · ${trip.packingList.items.filter((item) => item.packed).length} packed</p>
      <div class="widget-actions workout-inline-actions">
        <button type="button" class="ghost-button" data-travel-open-trip data-trip-id="${trip.id}">Open trip</button>
      </div>
    </article>
  `;
}

function renderTravelTripPanel(trip, packingTemplates, itineraryTemplates, settings, escapeHtml, formatDate) {
  return `
    <section class="energy-detail-card">
      <div class="energy-detail-header">
        <div>
          <p class="eyebrow">Trip</p>
          <h3>${escapeHtml(trip.name)}</h3>
          <p class="sync-status">${escapeHtml(describeTripMilestone(trip))}</p>
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
              ${TRIP_STATUS_OPTIONS.map((option) => `
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
              ${renderTravelCustomTaskRows(trip, settings, escapeHtml)}
            </div>
            <div class="widget-actions workout-inline-actions">
              <button type="button" class="ghost-button" data-travel-add-custom-task data-trip-id="${trip.id}">Add itinerary task</button>
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
            ? `${trip.packingList.items.filter((item) => item.packed).length}/${trip.packingList.items.length} packed for this trip.`
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
          ? trip.packingList.items.map((item) => renderTripPackingItem(trip, item, escapeHtml)).join("")
          : `<p class="empty-state">No packing items yet.</p>`}
      </div>
      <form class="travel-inline-form" data-travel-packing-item-form data-trip-id="${trip.id}">
        <label class="quick-add-title">
          <span>Add packing item</span>
          <input type="text" maxlength="120" placeholder="Passport, chargers, hiking shoes..." data-travel-packing-item-input required />
        </label>
        <label>
          <span>Qty</span>
          <input type="number" min="1" max="99" step="1" value="1" data-travel-packing-quantity />
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
      <p class="sync-status">${escapeHtml(describeTripRange(trip, formatDate))}</p>
    </section>
  `;
}

function renderTripPackingItem(trip, item, escapeHtml) {
  return `
    <article class="travel-packing-item${item.packed ? " is-packed" : ""}">
      <div>
        <h4>${escapeHtml(item.label)}</h4>
        <p>${item.packed ? "Packed" : "Still needed"} · Qty ${item.quantity || 1}</p>
      </div>
      <div class="widget-actions workout-inline-actions">
        <button type="button" class="ghost-button" data-travel-adjust-quantity data-trip-id="${trip.id}" data-item-id="${item.id}" data-quantity-delta="-1">−</button>
        <button type="button" class="ghost-button" data-travel-adjust-quantity data-trip-id="${trip.id}" data-item-id="${item.id}" data-quantity-delta="1">+</button>
        <button type="button" class="ghost-button" data-travel-toggle-packed data-trip-id="${trip.id}" data-item-id="${item.id}">${item.packed ? "Unpack" : "Pack"}</button>
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

function renderItineraryTemplateCard(template, escapeHtml, formatDate) {
  return `
    <article class="travel-template-card">
      <div class="travel-board-card-header">
        <div>
          <h4>${escapeHtml(template.name)}</h4>
          <p>${template.destination ? escapeHtml(template.destination) : "Destination TBD"}</p>
        </div>
      </div>
      <p>${escapeHtml(describeTemplateRange(template, formatDate))}</p>
      <p>${escapeHtml(describeTemplateSummary(template))}</p>
      <div class="widget-actions workout-inline-actions">
        <button type="button" class="ghost-button" data-travel-create-trip-from-template data-template-id="${template.id}">Create trip</button>
        <button type="button" class="ghost-button" data-travel-delete-itinerary-template data-template-id="${template.id}">Delete</button>
      </div>
    </article>
  `;
}

function renderTravelTemplateItemRows(items, escapeHtml) {
  const normalizedItems = Array.isArray(items) && items.length ? items : [{ label: "", quantity: 1 }];
  return normalizedItems.map((item, index) => renderTravelTemplateItemRow(item, `travel-template-row-${index}`, escapeHtml)).join("");
}

function renderTravelTemplateItemRow(item, rowId, escapeHtml) {
  const safeEscapeHtml = typeof escapeHtml === "function" ? escapeHtml : fallbackEscapeHtml;
  return `
    <div class="travel-template-item-row" data-travel-template-row="${rowId}">
      <label class="quick-add-title">
        <span>Item</span>
        <input type="text" maxlength="120" value="${safeEscapeHtml(item?.label || "")}" placeholder="Passport" data-travel-template-item-label />
      </label>
      <label>
        <span>Qty</span>
        <input type="number" min="1" max="99" step="1" value="${normalizePackingQuantity(item?.quantity)}" data-travel-template-item-quantity />
      </label>
      <button type="button" class="ghost-button" data-travel-remove-template-item>Remove</button>
    </div>
  `;
}

function renderTravelCustomTaskRows(trip, settings, escapeHtml) {
  const items = Array.isArray(trip?.itinerary?.customTasks) ? trip.itinerary.customTasks : [];
  if (items.length === 0) {
    return `<p class="empty-state">No itinerary tasks yet. Add things like booking a ride or printing boarding passes.</p>`;
  }
  return items.map((item) => renderTravelCustomTaskRow(item, trip, escapeHtml, settings)).join("");
}

function renderTravelCustomTaskRow(item, trip, escapeHtml, settings) {
  const safeEscapeHtml = typeof escapeHtml === "function" ? escapeHtml : fallbackEscapeHtml;
  const schedule = trip ? describeTravelCustomTaskSchedule(item, trip, settings) : { dueDate: "", dueTime: "", relativeLabel: "" };
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

function describeTripRange(trip, formatDate) {
  if (trip.startDate && trip.endDate && trip.startDate !== trip.endDate) {
    return `${formatMaybeDate(trip.startDate, formatDate)} to ${formatMaybeDate(trip.endDate, formatDate)}`;
  }
  if (trip.startDate) {
    return formatMaybeDate(trip.startDate, formatDate);
  }
  if (trip.endDate) {
    return `Ends ${formatMaybeDate(trip.endDate, formatDate)}`;
  }
  return "Dates still flexible";
}

function describeTemplateRange(template, formatDate) {
  if (template.startDate && template.endDate && template.startDate !== template.endDate) {
    return `${formatMaybeDate(template.startDate, formatDate)} to ${formatMaybeDate(template.endDate, formatDate)}`;
  }
  return template.startDate ? formatMaybeDate(template.startDate, formatDate) : "Dates are customizable";
}

function formatMaybeDate(dateString, formatDate) {
  if (!dateString) {
    return "";
  }
  if (typeof formatDate === "function") {
    return formatDate(dateString);
  }
  return formatDateTimeLabel(dateString, "");
}

function normalizePackingQuantity(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return Math.min(99, Math.round(parsed));
}

function normalizeTimeZone(value) {
  const trimmed = normalizeText(value, 80);
  if (!trimmed) {
    return "";
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed }).format(new Date());
    return trimmed;
  } catch {
    return "";
  }
}

function normalizeTripStatusPreset(value) {
  return TRIP_PRESET_STATUS_OPTIONS.includes(value) ? value : "booked";
}

function normalizeTripStatusOverride(value) {
  return value === "active" || value === "complete" ? value : "";
}

function normalizeTravelCustomTasks(value, createId = () => `travel-custom-task-${Math.random()}`) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => normalizeTravelCustomTask(item, createId))
    .filter(Boolean)
    .sort((left, right) => left.offsetMinutes - right.offsetMinutes || left.name.localeCompare(right.name));
}

function normalizeTravelCustomTask(value, createId) {
  const name = normalizeText(value?.name || value?.label, 120);
  if (!name) {
    return null;
  }
  const offsetMinutes = Number(value?.offsetMinutes);
  return {
    id: typeof value?.id === "string" && value.id ? value.id : createId(),
    name,
    details: normalizeText(value?.details, 240),
    offsetMinutes: Number.isFinite(offsetMinutes) ? Math.round(offsetMinutes) : 0,
    updatedAt: typeof value?.updatedAt === "number" ? value.updatedAt : Date.now()
  };
}

function fallbackEscapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function extractAirportCode(value) {
  const text = normalizeText(value, 120).toUpperCase();
  const match = text.match(/\b([A-Z]{3})\b/);
  return match?.[1] || "";
}

function inferTravelTimeZone(...values) {
  for (const value of values) {
    const explicit = extractExplicitIanaTimeZone(value);
    if (explicit) {
      return explicit;
    }
  }

  for (const value of values) {
    const airportTimeZone = inferAirportTimeZone(value);
    if (airportTimeZone) {
      return airportTimeZone;
    }
  }

  for (const value of values) {
    const locationTimeZone = inferLocationTimeZone(value);
    if (locationTimeZone) {
      return locationTimeZone;
    }
  }

  return "";
}

function extractExplicitIanaTimeZone(value) {
  const text = normalizeText(value, 240);
  if (!text) {
    return "";
  }
  const matches = text.match(/[A-Za-z_]+\/[A-Za-z0-9_+-]+/g) || [];
  for (const match of matches) {
    const normalized = normalizeTimeZone(match);
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function inferAirportTimeZone(value) {
  const text = normalizeText(value, 240).toUpperCase();
  if (!text) {
    return "";
  }
  const codes = text.match(/\b[A-Z]{3}\b/g) || [];
  for (const code of codes) {
    if (TRAVEL_WIDGET_AIRPORT_TIME_ZONES[code]) {
      return TRAVEL_WIDGET_AIRPORT_TIME_ZONES[code];
    }
  }
  return "";
}

function inferLocationTimeZone(value) {
  const text = normalizeText(value, 240);
  if (!text) {
    return "";
  }
  const match = TRAVEL_LOCATION_TIME_ZONE_HINTS.find((entry) => entry.pattern.test(text));
  return match?.timeZone || "";
}

function formatDateTimeLabel(dateString, timeString) {
  if (!dateString) {
    return "date TBD";
  }
  const timeValue = timeString || "12:00";
  const parsed = new Date(`${dateString}T${timeValue}`);
  if (Number.isNaN(parsed.getTime())) {
    return dateString;
  }
  const options = timeString
    ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric" };
  return new Intl.DateTimeFormat(undefined, options).format(parsed);
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

function getTravelUiState(widgetId) {
  if (!travelWidgetUiState.has(widgetId)) {
    travelWidgetUiState.set(widgetId, { detailTab: "overview" });
  }
  return travelWidgetUiState.get(widgetId);
}

function getTravelDetailTab(widgetId, trips) {
  return normalizeTravelDetailTab(getTravelUiState(widgetId).detailTab, trips);
}

function setTravelDetailTab(widgetId, detailTab, trips) {
  travelWidgetUiState.set(widgetId, {
    ...getTravelUiState(widgetId),
    detailTab: normalizeTravelDetailTab(detailTab, trips)
  });
}

function normalizeTravelDetailTab(value, trips = []) {
  if (value === "overview" || value === "settings" || value === "packing-templates" || value === "itinerary-templates") {
    return value;
  }
  if (typeof value === "string" && value.startsWith("trip:")) {
    const tripId = value.slice(5);
    return normalizeTrips(trips).some((trip) => trip.id === tripId) ? value : "overview";
  }
  return "overview";
}

function buildTravelShellLiveRequest(trip, settings) {
  const weather = buildTravelWeatherRequest(trip);
  const flight = buildTravelFlightRequest(trip, settings);
  if (!weather && !flight) {
    return null;
  }
  return {
    tripId: trip.id,
    weather,
    flight
  };
}

function buildTravelWeatherRequest(trip) {
  const destinationQuery = normalizeText(
    trip?.destination
    || trip?.itinerary?.outboundDestination
    || trip?.itinerary?.lodgingAddress,
    160
  );
  if (!destinationQuery) {
    return null;
  }
  return {
    destinationQuery,
    startDate: normalizeDateValue(trip?.startDate || trip?.itinerary?.checkInDate || trip?.itinerary?.outboundDate),
    endDate: normalizeDateValue(trip?.endDate || trip?.itinerary?.checkOutDate || trip?.itinerary?.returnDate)
  };
}

function buildTravelFlightRequest(trip, settings) {
  const now = Date.now();
  const outboundTimestamp = resolveTravelDepartureTimestamp(trip, settings);
  const returnTimestamp = resolveTravelReturnTimestamp(trip, settings);
  const candidates = [
    buildTravelFlightLegRequest({
      leg: "outbound",
      timestamp: outboundTimestamp,
      timeZone: resolveOutboundStageTimeZone(trip, settings),
      date: trip?.itinerary?.outboundDate,
      time: trip?.itinerary?.outboundTime,
      flightNumber: trip?.itinerary?.outboundFlightNumber,
      origin: trip?.itinerary?.outboundOrigin,
      destination: trip?.itinerary?.outboundDestination
    }),
    buildTravelFlightLegRequest({
      leg: "return",
      timestamp: returnTimestamp,
      timeZone: resolveReturnStageTimeZone(trip, settings),
      date: trip?.itinerary?.returnDate,
      time: trip?.itinerary?.returnTime,
      flightNumber: trip?.itinerary?.returnFlightNumber,
      origin: trip?.itinerary?.returnOrigin,
      destination: trip?.itinerary?.returnDestination
    })
  ]
    .filter(Boolean)
    .filter((entry) => entry.timestamp > now && entry.timestamp <= now + TRAVEL_FLIGHT_LOOKAHEAD_MS)
    .sort((left, right) => left.timestamp - right.timestamp);

  if (!candidates.length) {
    return null;
  }
  const nextFlight = candidates[0];
  return {
    leg: nextFlight.leg,
    flightNumber: nextFlight.flightNumber,
    flightDate: nextFlight.date,
    scheduledTimestamp: nextFlight.timestamp,
    departureCode: extractAirportCode(nextFlight.origin),
    arrivalCode: extractAirportCode(nextFlight.destination),
    displayTimeZone: nextFlight.timeZone,
    scheduledDate: nextFlight.date,
    scheduledTime: nextFlight.time
  };
}

function buildTravelFlightLegRequest({ leg, timestamp, timeZone, date, time, flightNumber, origin, destination }) {
  const normalizedFlightNumber = normalizeText(flightNumber, 24).toUpperCase();
  const normalizedDate = normalizeDateValue(date);
  if (!normalizedFlightNumber || !normalizedDate || !Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }
  return {
    leg,
    timestamp,
    timeZone: timeZone || "",
    date: normalizedDate,
    time: normalizeTimeValue(time),
    flightNumber: normalizedFlightNumber,
    origin: normalizeText(origin, 120),
    destination: normalizeText(destination, 120)
  };
}

function normalizeTripStatus(value) {
  return TRIP_STATUS_OPTIONS.some((option) => option.value === value) ? value : "planning";
}

function humanizeTripStatus(value) {
  return TRIP_STATUS_OPTIONS.find((option) => option.value === value)?.label || "Planning";
}

function normalizeText(value, maxLength = 120) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeLongText(value, maxLength = 2000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeDateValue(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function normalizeTimeValue(value) {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value) ? value : "";
}

function normalizeSlotIndex(value, maxWidgets) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return 0;
  }
  return Math.min(parsed, Math.max(0, maxWidgets - 1));
}

function formatTodayLocal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateTime(dateString, timeString) {
  if (!dateString) {
    return 0;
  }
  const parsed = new Date(`${dateString}T${timeString || "12:00"}`);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function zonedDateTimeToTimestamp(dateString, timeString, timeZone) {
  const normalizedDate = normalizeDateValue(dateString);
  if (!normalizedDate) {
    return Number.NaN;
  }
  const [year, month, day] = normalizedDate.split("-").map(Number);
  const [hours, minutes] = normalizeTimeValue(timeString || "") ? String(timeString).split(":").map(Number) : [23, 59];
  let guess = Date.UTC(year, month - 1, day, hours, minutes, 0);

  for (let index = 0; index < 3; index += 1) {
    const actual = getZonedParts(new Date(guess), timeZone);
    const desiredUtc = Date.UTC(year, month - 1, day, hours, minutes, 0);
    const actualUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hours, actual.minutes, 0);
    const diff = desiredUtc - actualUtc;
    if (diff === 0) {
      break;
    }
    guess += diff;
  }

  return guess;
}

function getZonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  const parts = formatter.formatToParts(date).reduce((result, item) => {
    if (item.type !== "literal") {
      result[item.type] = Number(item.value);
    }
    return result;
  }, {});
  return {
    year: parts.year || 0,
    month: parts.month || 1,
    day: parts.day || 1,
    hours: parts.hour || 0,
    minutes: parts.minute || 0
  };
}

function formatZonedDateString(timestamp, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(timestamp));
}

function formatZonedTimeString(timestamp, timeZone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(timestamp));
}

function resolveOutboundStageTimeZone(trip, settings) {
  const itinerary = normalizeTripItinerary(trip?.itinerary);
  return normalizeTimeZone(
    inferTravelTimeZone(
      settings?.homeTimeZone,
      settings?.homeLocation,
      itinerary.outboundOrigin,
      itinerary.outboundLabel,
      itinerary.outboundDestination,
      trip?.destination
    )
  ) || normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

function resolveReturnStageTimeZone(trip, settings) {
  const itinerary = normalizeTripItinerary(trip?.itinerary);
  return normalizeTimeZone(
    inferTravelTimeZone(
      itinerary.returnOrigin,
      itinerary.lodgingAddress,
      itinerary.lodgingName,
      trip?.destination,
      itinerary.returnLabel,
      itinerary.returnDestination,
      settings?.homeLocation
    )
  ) || normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

function resolveTravelDepartureTimestamp(trip, settings) {
  const itinerary = normalizeTripItinerary(trip?.itinerary);
  if (itinerary.outboundDate && itinerary.outboundTime) {
    return zonedDateTimeToTimestamp(itinerary.outboundDate, itinerary.outboundTime, resolveOutboundStageTimeZone(trip, settings));
  }
  if (trip?.startDate) {
    return zonedDateTimeToTimestamp(trip.startDate, "12:00", resolveOutboundStageTimeZone(trip, settings));
  }
  return 0;
}

function resolveTravelReturnTimestamp(trip, settings) {
  const itinerary = normalizeTripItinerary(trip?.itinerary);
  if (itinerary.returnDate && itinerary.returnTime) {
    return zonedDateTimeToTimestamp(itinerary.returnDate, itinerary.returnTime, resolveReturnStageTimeZone(trip, settings));
  }
  if (trip?.endDate) {
    return zonedDateTimeToTimestamp(trip.endDate, "12:00", resolveReturnStageTimeZone(trip, settings));
  }
  return 0;
}

function describeTravelCustomTaskSchedule(item, trip, settings) {
  const departureTimestamp = resolveTravelDepartureTimestamp(trip, settings);
  if (!Number.isFinite(departureTimestamp) || departureTimestamp <= 0) {
    return {
      dueDate: "",
      dueTime: "",
      relativeLabel: "Set outbound departure date and time to anchor this task."
    };
  }
  const timeZone = resolveOutboundStageTimeZone(trip, settings);
  const dueTimestamp = departureTimestamp - (Number(item?.offsetMinutes) || 0) * 60_000;
  return {
    dueDate: formatZonedDateString(dueTimestamp, timeZone),
    dueTime: formatZonedTimeString(dueTimestamp, timeZone),
    relativeLabel: formatTravelOffsetLabel(Number(item?.offsetMinutes) || 0, timeZone)
  };
}

function collectTripCustomTasks({
  form,
  createId,
  settings,
  outboundDate,
  outboundTime,
  outboundOrigin,
  outboundLabel,
  outboundDestination,
  tripDestination
}) {
  const rows = Array.from(form.querySelectorAll(".travel-custom-task-row"));
  const items = [];
  const timeZone = normalizeTimeZone(
    inferTravelTimeZone(
      settings?.homeTimeZone,
      settings?.homeLocation,
      outboundOrigin,
      outboundLabel,
      outboundDestination,
      tripDestination
    )
  ) || normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const departureTimestamp = outboundDate && outboundTime
    ? zonedDateTimeToTimestamp(outboundDate, outboundTime, timeZone)
    : Number.NaN;

  for (const row of rows) {
    const name = normalizeText(row.querySelector("[data-travel-custom-task-name]")?.value, 120);
    const details = normalizeText(row.querySelector("[data-travel-custom-task-details]")?.value, 240);
    const dueDate = normalizeDateValue(row.querySelector("[data-travel-custom-task-date]")?.value);
    const dueTime = normalizeTimeValue(row.querySelector("[data-travel-custom-task-time]")?.value || outboundTime);
    if (!name && !details && !dueDate && !dueTime) {
      continue;
    }
    if (!name) {
      return { error: "Each itinerary task needs a name.", items: [] };
    }
    if (!outboundDate || !outboundTime || !Number.isFinite(departureTimestamp)) {
      return { error: "Set the outbound departure date and time before saving itinerary tasks.", items: [] };
    }
    if (!dueDate || !dueTime) {
      return { error: `Choose a due date and time for ${name}.`, items: [] };
    }
    const dueTimestamp = zonedDateTimeToTimestamp(dueDate, dueTime, timeZone);
    if (!Number.isFinite(dueTimestamp)) {
      return { error: `Could not understand the schedule for ${name}.`, items: [] };
    }
    items.push({
      id: row.getAttribute("data-travel-custom-task-row") || createId(),
      name,
      details,
      offsetMinutes: Math.round((departureTimestamp - dueTimestamp) / 60_000),
      updatedAt: Date.now()
    });
  }

  return { error: "", items: normalizeTravelCustomTasks(items, createId) };
}

function formatTravelOffsetLabel(offsetMinutes, timeZone) {
  const minutes = Math.abs(Math.round(offsetMinutes || 0));
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const remainderMinutes = minutes % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (remainderMinutes || parts.length === 0) parts.push(`${remainderMinutes}m`);
  return `${offsetMinutes >= 0 ? parts.join(" ") + " before" : parts.join(" ") + " after"} departure · ${timeZone}`;
}

function buildDesiredTravelTasks(widget, helpers) {
  const settings = normalizeTravelSettings(widget.settings);
  const desired = [];

  for (const trip of normalizeTrips(widget.data?.trips)) {
    if (trip.status === "complete" || trip.statusOverride === "complete") {
      continue;
    }
    const tripTasks = buildFlightCheckinTasksForTrip({ widget, trip, settings, helpers });
    desired.push(...tripTasks, ...buildItineraryTasksForTrip({ widget, trip, settings, helpers }));
  }

  return desired.sort(compareTravelTaskSchedule);
}

function buildFlightCheckinTasksForTrip({ widget, trip, settings, helpers }) {
  const tasks = [];
  const outboundTask = buildFlightCheckinTask({ widget, trip, leg: "outbound", settings, helpers });
  if (outboundTask) {
    tasks.push(outboundTask);
  }
  const returnTask = buildFlightCheckinTask({ widget, trip, leg: "return", settings, helpers });
  if (returnTask) {
    tasks.push(returnTask);
  }
  return tasks;
}

function buildFlightCheckinTask({ widget, trip, leg, settings, helpers }) {
  const itinerary = normalizeTripItinerary(trip.itinerary);
  const isOutbound = leg === "outbound";
  const flightNumber = isOutbound ? itinerary.outboundFlightNumber : itinerary.returnFlightNumber;
  const departureDate = isOutbound ? itinerary.outboundDate : itinerary.returnDate;
  const departureTime = isOutbound ? itinerary.outboundTime : itinerary.returnTime;
  const origin = isOutbound ? itinerary.outboundOrigin : itinerary.returnOrigin;
  const destination = isOutbound ? itinerary.outboundDestination : itinerary.returnDestination;

  if (!flightNumber || !departureDate || !departureTime) {
    return null;
  }

  const stageTimeZone = isOutbound
    ? resolveOutboundStageTimeZone(trip, settings)
    : resolveReturnStageTimeZone(trip, settings);

  const departureTimestamp = zonedDateTimeToTimestamp(departureDate, departureTime, stageTimeZone);
  if (!Number.isFinite(departureTimestamp) || departureTimestamp <= Date.now()) {
    return null;
  }

  const dueTimestamp = departureTimestamp - 24 * 60 * 60 * 1000;
  const dueDate = formatZonedDateString(dueTimestamp, stageTimeZone);
  const dueTime = formatZonedTimeString(dueTimestamp, stageTimeZone);
  const minutesUntilDeparture = Math.max(0, Math.round((departureTimestamp - dueTimestamp) / 60_000));
  const travelCategory = helpers.resolveCategorySnapshot("travel");
  const ownerTaskKey = [
    "travel-flight-checkin",
    trip.id,
    leg,
    flightNumber,
    departureDate,
    departureTime,
    stageTimeZone
  ].join(":");
  const now = Date.now();

  return {
    id: helpers.createId(),
    templateId: "",
    occurrenceIndex: 0,
    name: `${trip.name}: check in to ${flightNumber}`,
    details: buildFlightCheckinDetails({
      trip,
      leg,
      flightNumber,
      origin,
      destination,
      departureDate,
      departureTime,
      stageTimeZone
    }),
    startDate: dueDate,
    dueDate,
    timeOfDay: dueTime,
    lateGraceMinutes: minutesUntilDeparture,
    notBeforeAt: dueTimestamp,
    pointsValue: 1,
    pointsEntryId: "",
    length: "very-short",
    categoryKey: travelCategory.key,
    categoryLabel: travelCategory.label,
    categoryColor: travelCategory.color,
    importance: "high",
    status: "open",
    createdAt: now,
    updatedAt: now,
    ownerWidgetId: widget.id,
    ownerWidgetType: widget.type,
    ownerTaskKey,
    widgetTaskKind: "flight-checkin",
    widgetTaskMeta: {
      tripId: trip.id,
      leg,
      flightNumber,
      origin,
      destination,
      departureDate,
      departureTime,
      timeZone: stageTimeZone,
      reminderDefaults: {
        enabled: true,
        dueSoonMinutes: 15,
        overdueMinutes: minutesUntilDeparture
      }
    },
    reminders: {
      enabled: true,
      dueSoonMinutes: 15,
      overdueMinutes: minutesUntilDeparture
    },
    linkedSeries: {},
    sequenceDependencyId: "",
    widgetCompletion: {
      mechanism: "",
      lockout: "none"
    },
    skipRule: {
      type: "after-due-minutes",
      graceMinutes: minutesUntilDeparture
    },
    dependencies: [],
    recurrence: { type: "none" },
    history: []
  };
}

function buildItineraryTasksForTrip({ widget, trip, settings, helpers }) {
  const customTasks = normalizeTravelCustomTasks(trip?.itinerary?.customTasks, helpers.createId);
  if (!customTasks.length) {
    return [];
  }

  const departureTimestamp = resolveTravelDepartureTimestamp(trip, settings);
  if (!Number.isFinite(departureTimestamp) || departureTimestamp <= 0) {
    return [];
  }
  const timeZone = resolveOutboundStageTimeZone(trip, settings);
  const travelCategory = helpers.resolveCategorySnapshot("travel");

  return customTasks.map((item, index) => {
    const dueTimestamp = departureTimestamp - item.offsetMinutes * 60_000;
    const dueDate = formatZonedDateString(dueTimestamp, timeZone);
    const dueTime = formatZonedTimeString(dueTimestamp, timeZone);
    const now = Date.now() + index;
    return {
      id: helpers.createId(),
      templateId: "",
      occurrenceIndex: 0,
      name: item.name,
      details: buildTravelItineraryTaskDetails({ trip, item, timeZone }),
      startDate: dueDate,
      dueDate,
      timeOfDay: dueTime,
      lateGraceMinutes: 15,
      notBeforeAt: dueTimestamp,
      pointsValue: 1,
      pointsEntryId: "",
      length: "short",
      categoryKey: travelCategory.key,
      categoryLabel: travelCategory.label,
      categoryColor: travelCategory.color,
      importance: "medium",
      status: "open",
      createdAt: now,
      updatedAt: now,
      ownerWidgetId: widget.id,
      ownerWidgetType: widget.type,
      ownerTaskKey: [
        "travel-itinerary-task",
        trip.id,
        item.id,
        trip.itinerary.outboundDate || trip.startDate || "",
        trip.itinerary.outboundTime || "12:00",
        timeZone
      ].join(":"),
      widgetTaskKind: "travel-itinerary-task",
      widgetTaskMeta: {
        tripId: trip.id,
        itineraryTaskId: item.id,
        offsetMinutes: item.offsetMinutes,
        timeZone
      },
      reminders: {
        enabled: false,
        dueSoonMinutes: null,
        overdueMinutes: null
      },
      linkedSeries: {},
      sequenceDependencyId: "",
      widgetCompletion: {
        mechanism: "",
        lockout: "none"
      },
      skipRule: { type: "none" },
      dependencies: [],
      recurrence: { type: "none" },
      history: []
    };
  });
}

function buildTravelItineraryTaskDetails({ trip, item, timeZone }) {
  const parts = [`Created by Travel Buddy for ${trip.name}.`, item.details || ""].filter(Boolean);
  parts.push(`${formatTravelOffsetLabel(item.offsetMinutes, timeZone)}.`);
  return parts.join(" ");
}

function buildFlightCheckinDetails({ trip, leg, flightNumber, origin, destination, departureDate, departureTime, stageTimeZone }) {
  const parts = [
    `Created by Travel Buddy for ${trip.name}.`,
    `Check in to ${flightNumber} 24 hours before departure.`,
    `Leg: ${leg === "outbound" ? "Outbound" : "Return"}.`
  ];
  if (origin || destination) {
    parts.push(`Route: ${origin || "origin TBD"} to ${destination || "destination TBD"}.`);
  }
  parts.push(`Departure: ${formatDateTimeLabel(departureDate, departureTime)} (${stageTimeZone}).`);
  return parts.join(" ");
}

function compareTravelTaskSchedule(left, right) {
  const leftSchedule = `${left.dueDate || left.startDate || ""}T${left.timeOfDay || "23:59"}`;
  const rightSchedule = `${right.dueDate || right.startDate || ""}T${right.timeOfDay || "23:59"}`;
  if (leftSchedule !== rightSchedule) {
    return leftSchedule.localeCompare(rightSchedule);
  }
  return String(left.ownerTaskKey || "").localeCompare(String(right.ownerTaskKey || ""));
}

function syncTravelOwnedTasks(widget, store, helpers) {
  if (!Array.isArray(store?.tasks)) {
    return;
  }

  const desiredTasks = buildDesiredTravelTasks(widget, helpers);
  const existingTasks = store.tasks.filter((task) => (
    task.ownerWidgetId === widget.id
    && task.ownerWidgetType === TRAVEL_WIDGET_TYPE
    && (task.widgetTaskKind === "flight-checkin" || task.widgetTaskKind === "travel-itinerary-task")
    && !task.templateId
    && !task.archived
  ));
  const matchedTaskIds = new Set();
  const removeTaskIds = new Set();

  for (const desired of desiredTasks) {
    const existing = existingTasks.find((task) => task.ownerTaskKey === desired.ownerTaskKey && !matchedTaskIds.has(task.id));
    if (!existing) {
      store.tasks.unshift(desired);
      continue;
    }
    matchedTaskIds.add(existing.id);
    if (!travelOwnedTaskChanged(existing, desired)) {
      continue;
    }
    Object.assign(existing, {
      ...desired,
      id: existing.id,
      createdAt: existing.createdAt,
      status: existing.status,
      history: Array.isArray(existing.history) ? existing.history : [],
      pointsEntryId: existing.pointsEntryId || ""
    });
  }

  for (const existing of existingTasks) {
    if (matchedTaskIds.has(existing.id)) {
      continue;
    }
    if (existing.status === "open" && (!Array.isArray(existing.history) || existing.history.length === 0)) {
      removeTaskIds.add(existing.id);
      continue;
    }
    existing.archived = true;
    existing.updatedAt = Date.now();
  }

  if (removeTaskIds.size > 0) {
    store.tasks = store.tasks.filter((task) => !removeTaskIds.has(task.id));
  }
}

function travelOwnedTaskChanged(existing, desired) {
  return (
    existing.name !== desired.name
    || existing.details !== desired.details
    || existing.startDate !== desired.startDate
    || existing.dueDate !== desired.dueDate
    || existing.timeOfDay !== desired.timeOfDay
    || existing.lateGraceMinutes !== desired.lateGraceMinutes
    || existing.notBeforeAt !== desired.notBeforeAt
    || existing.pointsValue !== desired.pointsValue
    || existing.length !== desired.length
    || existing.categoryKey !== desired.categoryKey
    || existing.categoryLabel !== desired.categoryLabel
    || existing.categoryColor !== desired.categoryColor
    || existing.importance !== desired.importance
    || existing.ownerTaskKey !== desired.ownerTaskKey
    || existing.widgetTaskKind !== desired.widgetTaskKind
    || JSON.stringify(existing.widgetTaskMeta || {}) !== JSON.stringify(desired.widgetTaskMeta || {})
    || JSON.stringify(existing.reminders || {}) !== JSON.stringify(desired.reminders || {})
    || JSON.stringify(existing.skipRule || {}) !== JSON.stringify(desired.skipRule || {})
  );
}

function splitTemplateLines(value) {
  if (typeof value !== "string") {
    return [];
  }
  return Array.from(new Set(value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)));
}

function collectTemplateItems(form) {
  return Array.from(form.querySelectorAll(".travel-template-item-row"))
    .map((row) => ({
      label: normalizeText(row.querySelector("[data-travel-template-item-label]")?.value, 120),
      quantity: normalizePackingQuantity(row.querySelector("[data-travel-template-item-quantity]")?.value)
    }))
    .filter((item) => item.label);
}

function dedupePackingItems(items) {
  const seenLabels = new Set();
  const deduped = [];
  for (const item of items) {
    const labelKey = normalizeText(item.label, 120).toLowerCase();
    if (!labelKey || seenLabels.has(labelKey)) {
      continue;
    }
    seenLabels.add(labelKey);
    deduped.push(item);
  }
  return deduped;
}
