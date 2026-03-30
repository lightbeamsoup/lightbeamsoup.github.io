import { shouldAutoSkipTask } from "../logic.js";
import {
  compareTemplateDisplay,
  compareTripDisplay,
  fallbackEscapeHtml,
  renderTravelCustomTaskRow,
  renderTravelShellLiveMarkup,
  renderTravelTemplateItemRow,
  renderTravelWidgetDetail,
  renderTravelWidgetShell
} from "./travel/render.js";

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
const DEFAULT_TRAVEL_PACKING_CATEGORY = "General";
const DEFAULT_TRAVEL_PACKING_DUE_TIME = "20:00";
const DEFAULT_TRAVEL_PACKING_OVERDUE_GRACE_MINUTES = 15;
const travelWidgetUiState = new Map();
const travelRenderDeps = {
  DEFAULT_TRAVEL_PACKING_CATEGORY,
  TRIP_STATUS_OPTIONS,
  buildTravelFlightRequest,
  buildTravelShellLiveRequest,
  describeTravelCustomTaskSchedule,
  formatDateTimeLabel,
  getUnpackedPackingQuantity,
  groupPackingItemsByCategory,
  humanizeTripStatus,
  normalizePackingTaskGraceMinutes,
  normalizePackingTaskSettings,
  toDateTime
};

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
        itineraryTemplates: [],
        liveSnapshots: {}
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
        itineraryTemplates: normalizeItineraryTemplates(widget.data?.itineraryTemplates, createId),
        liveSnapshots: normalizeTravelLiveSnapshots(widget.data?.liveSnapshots, widget.data?.trips, createId)
      },
      createdAt: typeof widget.createdAt === "number" ? widget.createdAt : now,
      updatedAt: typeof widget.updatedAt === "number" ? widget.updatedAt : now
    };
  },

  getUpdatedAt(widget) {
    const latestTrip = normalizeTrips(widget?.data?.trips).reduce((max, trip) => Math.max(max, trip.updatedAt || 0), 0);
    const latestPackingTemplate = normalizePackingTemplates(widget?.data?.packingTemplates).reduce((max, template) => Math.max(max, template.updatedAt || 0), 0);
    const latestItineraryTemplate = normalizeItineraryTemplates(widget?.data?.itineraryTemplates).reduce((max, template) => Math.max(max, template.updatedAt || 0), 0);
    const latestLiveSnapshot = Object.values(normalizeTravelLiveSnapshots(widget?.data?.liveSnapshots, widget?.data?.trips)).reduce((max, snapshot) => Math.max(max, snapshot?.updatedAt || snapshot?.fetchedAt || 0), 0);
    return Math.max(widget?.updatedAt || 0, widget?.createdAt || 0, latestTrip, latestPackingTemplate, latestItineraryTemplate, latestLiveSnapshot, widget?.settings?.updatedAt || 0);
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
    const persistedLiveByTripId = normalizeTravelLiveSnapshots(widget.data?.liveSnapshots, trips);
    const shellLiveByTripId = getTravelUiState(widget.id).shellLiveByTripId || {};
    const upcomingTrips = getUpcomingTrips(trips);
    const nextTrip = upcomingTrips[0] || trips[0] || null;
    const activeTrip = trips.find((trip) => trip.status === "active") || null;
    const activeTripCount = trips.filter((trip) => trip.status === "active").length;
    const openTravelTaskCount = tasks.filter((task) => task.status === "open" && !task.archived && task.ownerWidgetId === widget.id).length;
    const unpackedActiveTripQuantity = activeTrip ? getUnpackedPackingQuantity(activeTrip) : 0;
    const displayLiveByTripId = Object.fromEntries(
      upcomingTrips.slice(0, 3).map((trip) => [
        trip.id,
        buildTravelDisplaySnapshot(persistedLiveByTripId[trip.id], shellLiveByTripId[trip.id])
      ])
    );

    return renderTravelWidgetShell({
      settings,
      upcomingTrips,
      nextTrip,
      activeTrip,
      activeTripCount,
      openTravelTaskCount,
      unpackedActiveTripQuantity,
      displayLiveByTripId,
      escapeHtml
    }, travelRenderDeps);
  },

  async hydrateShell({ widget, root, apiBase, fetchCredentials, persistStore }) {
    if (!root?.isConnected) {
      return;
    }

    const trips = getUpcomingTrips(normalizeTrips(widget.data?.trips)).slice(0, 3);
    const settings = normalizeTravelSettings(widget.settings);
    const uiState = getTravelUiState(widget.id);
    const persistedLiveByTripId = normalizeTravelLiveSnapshots(widget.data?.liveSnapshots, trips);
    const displayLiveByTripId = {};
    for (const trip of trips) {
      displayLiveByTripId[trip.id] = buildTravelDisplaySnapshot(persistedLiveByTripId[trip.id], uiState.shellLiveByTripId?.[trip.id]);
    }
    applyTravelShellLiveData(root, trips, settings, displayLiveByTripId);

    const requests = trips
      .map((trip) => {
        const request = buildTravelShellLiveRequest(trip, settings);
        if (!request) {
          return null;
        }
        const persistedSnapshot = persistedLiveByTripId[trip.id] || null;
        const shouldRefresh = shouldRefreshTravelShellTrip({
          request,
          persistedSnapshot,
          forceFlightRefresh: Boolean(uiState.forceFlightRefreshTripIds?.[trip.id])
        });
        if (!shouldRefresh) {
          return null;
        }
        return {
          ...request,
          forceFlightRefresh: Boolean(uiState.forceFlightRefreshTripIds?.[trip.id]),
          forceWeatherRefresh: Boolean(uiState.forceFlightRefreshTripIds?.[trip.id]),
          existingSnapshot: persistedSnapshot
        };
      })
      .filter(Boolean);

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

    const pendingByTripId = { ...(uiState.shellLiveByTripId || {}) };
    for (const request of requests) {
      pendingByTripId[request.tripId] = {
        ...(pendingByTripId[request.tripId] || {}),
        pending: true,
        flightNotice: ""
      };
    }
    uiState.shellLiveByTripId = pendingByTripId;
    uiState.shellLivePendingKey = requestKey;
    const requestToken = now;
    uiState.shellLiveRequestToken = requestToken;
    applyTravelShellLiveData(root, trips, settings, Object.fromEntries(
      trips.map((trip) => [trip.id, buildTravelDisplaySnapshot(persistedLiveByTripId[trip.id], pendingByTripId[trip.id])])
    ));

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
        const persistedSnapshot = persistedLiveByTripId[snapshot.tripId] || null;
        const mergedSnapshot = mergeTravelLiveSnapshot(persistedSnapshot, snapshot);
        nextByTripId[snapshot.tripId] = mergedSnapshot;
        persistTravelLiveSnapshot(widget, snapshot.tripId, mergedSnapshot);
      }
      uiState.shellLiveByTripId = nextByTripId;
      uiState.shellLiveFetchedAt = Date.now();
      uiState.shellLiveRequestKey = requestKey;
      uiState.shellLivePendingKey = "";
      uiState.shellLiveRequestToken = 0;
      if (typeof persistStore === "function") {
        widget.updatedAt = Date.now();
        persistStore({ touchUserUpdatedAt: false });
      }
      applyTravelShellLiveData(root, trips, settings, Object.fromEntries(
        trips.map((trip) => [trip.id, buildTravelDisplaySnapshot(
          normalizeTravelLiveSnapshots(widget.data?.liveSnapshots, trips)[trip.id],
          nextByTripId[trip.id]
        )])
      ));
      for (const request of requests) {
        if (uiState.forceFlightRefreshTripIds) {
          delete uiState.forceFlightRefreshTripIds[request.tripId];
        }
      }
    } catch (error) {
      if (!root.isConnected || getTravelUiState(widget.id).shellLiveRequestToken !== requestToken) {
        return;
      }
      const nextByTripId = {
        ...(uiState.shellLiveByTripId || {})
      };
      for (const request of requests) {
        nextByTripId[request.tripId] = {
          ...(nextByTripId[request.tripId] || {}),
          pending: false,
          flightNotice: request.flight ? String(error?.message || "Live flight status is unavailable right now.") : "",
          weatherNotice: request.weather ? String(error?.message || "Live weather is unavailable right now.") : ""
        };
      }
      uiState.shellLiveByTripId = nextByTripId;
      uiState.shellLivePendingKey = "";
      uiState.shellLiveRequestToken = 0;
      for (const request of requests) {
        if (uiState.forceFlightRefreshTripIds) {
          delete uiState.forceFlightRefreshTripIds[request.tripId];
        }
      }
      applyTravelShellLiveData(root, trips, settings, Object.fromEntries(
        trips.map((trip) => [trip.id, buildTravelDisplaySnapshot(persistedLiveByTripId[trip.id], nextByTripId[trip.id])])
      ));
    }
  },

  renderDetail({ widget, escapeHtml, formatDate }) {
    const trips = normalizeTrips(widget.data?.trips);
    const settings = normalizeTravelSettings(widget.settings);
    const packingTemplates = normalizePackingTemplates(widget.data?.packingTemplates);
    const itineraryTemplates = normalizeItineraryTemplates(widget.data?.itineraryTemplates);
    const packingCategoryListId = getTravelPackingCategoryListId(widget.id);
    const packingCategories = collectTravelPackingCategories(widget);
    const activeTab = getTravelDetailTab(widget.id, trips);
    const activeTrip = activeTab.startsWith("trip:") ? trips.find((trip) => trip.id === activeTab.slice(5)) || null : null;
    const upcomingTrips = getUpcomingTrips(trips);
    return renderTravelWidgetDetail({
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
    }, travelRenderDeps);
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
          const categoryListId = getTravelPackingCategoryListId(widget.id);
          const defaultCategory = normalizeTravelSettings(widget.settings).lastPackingCategory || DEFAULT_TRAVEL_PACKING_CATEGORY;
          list.insertAdjacentHTML("beforeend", renderTravelTemplateItemRow({ label: "", quantity: 1, category: defaultCategory }, helpers.createId(), categoryListId, helpers.escapeHtml || fallbackEscapeHtml));
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
        syncTravelOwnedTasks(widget, helpers.getStore(), helpers);
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
        syncTravelOwnedTasks(widget, helpers.getStore(), helpers);
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
                category: normalizePackingCategory(item.category),
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
              category: normalizePackingCategory(item.category),
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
          forecastLocation: template.forecastLocation || trip.forecastLocation || template.destination || trip.destination,
          startDate: template.startDate || trip.startDate,
          endDate: template.endDate || trip.endDate,
          itinerary: normalizeTripItinerary(template.itinerary, helpers.createId),
          packingList: {
            items: template.packingItems.map((item) => ({
              id: helpers.createId(),
              label: item.label,
              quantity: item.quantity || 1,
              category: normalizePackingCategory(item.category),
              packed: false,
              notes: "",
              updatedAt: now
            })),
            updatedAt: now
          },
          packingTask: normalizePackingTaskSettings(template.packingTask || trip.packingTask),
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
            forecastLocation: trip.forecastLocation,
            startDate: trip.startDate,
            endDate: trip.endDate,
            itinerary: normalizeTripItinerary(trip.itinerary, helpers.createId),
            packingTask: normalizePackingTaskSettings(trip.packingTask),
            packingItems: trip.packingList.items.map((item) => ({
              id: helpers.createId(),
              label: item.label,
              quantity: item.quantity || 1,
              category: normalizePackingCategory(item.category),
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
          forecastLocation: template.forecastLocation || template.destination,
          status: "planning",
          statusPreset: "planning",
          statusOverride: "",
          startDate: template.startDate,
          endDate: template.endDate,
          itinerary: normalizeTripItinerary(template.itinerary, helpers.createId),
          packingTask: normalizePackingTaskSettings(template.packingTask),
          packingList: {
            items: template.packingItems.map((item) => ({
              id: helpers.createId(),
              label: item.label,
              quantity: item.quantity || 1,
              category: normalizePackingCategory(item.category),
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

    const changeHandler = (event) => {
      const togglePackedInput = event.target.closest("[data-travel-toggle-packed]");
      if (!togglePackedInput) {
        return;
      }
      const tripId = togglePackedInput.getAttribute("data-trip-id") || "";
      const itemId = togglePackedInput.getAttribute("data-item-id") || "";
      const nextPacked = togglePackedInput instanceof HTMLInputElement
        ? togglePackedInput.checked
        : false;
      const updatedTrip = updateTripById(widget, tripId, (trip) => {
        const now = Date.now();
        return {
          ...trip,
          packingList: {
            ...trip.packingList,
            items: trip.packingList.items.map((item) => item.id === itemId ? { ...item, packed: nextPacked, updatedAt: now } : item),
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
      syncTravelOwnedTasks(widget, helpers.getStore(), helpers);
      helpers.persistStore();
      helpers.renderAll();
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
          packingTask: normalizePackingTaskSettings({
            dueTime: tripForm.querySelector("[data-travel-pack-due-time]")?.value,
            overdueGraceMinutes: tripForm.querySelector("[data-travel-pack-grace-minutes]")?.value,
            updatedAt: now
          }),
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
        const categoryInput = addPackingItemForm.querySelector("[data-travel-packing-category]");
        const label = normalizeText(input?.value, 120);
        const quantity = normalizePackingQuantity(quantityInput?.value);
        const category = normalizePackingCategory(categoryInput?.value);
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
                category,
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
        widget.settings = {
          ...normalizeTravelSettings(widget.settings),
          lastPackingCategory: category,
          updatedAt: now
        };
        if (input) input.value = "";
        if (quantityInput) quantityInput.value = "1";
        if (categoryInput) categoryInput.value = category;
        widget.updatedAt = now;
        syncTravelOwnedTasks(widget, helpers.getStore(), helpers);
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
              category: normalizePackingCategory(item.category),
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
    container.addEventListener("change", changeHandler);
    return () => {
      container.removeEventListener("click", clickHandler);
      container.removeEventListener("submit", submitHandler);
      container.removeEventListener("change", changeHandler);
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

    if (action === "travel-refresh-flight") {
      const tripId = actionTarget.getAttribute("data-trip-id") || "";
      if (!tripId) {
        return false;
      }
      const uiState = getTravelUiState(widget.id);
      uiState.forceFlightRefreshTripIds = {
        ...(uiState.forceFlightRefreshTripIds || {}),
        [tripId]: true
      };
      uiState.shellLiveRequestKey = "";
      uiState.shellLiveFetchedAt = 0;
      uiState.shellLivePendingKey = "";
      helpers.renderAll();
      helpers.setSyncStatus("Refreshing live travel updates…", "info");
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

function normalizeTravelLiveSnapshots(value, trips = [], createId = () => `travel-live-${Math.random()}`) {
  const tripIds = new Set(normalizeTrips(trips, createId).map((trip) => trip.id));
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.entries(value).reduce((result, [tripId, snapshot]) => {
    if (!tripIds.has(tripId)) {
      return result;
    }
    const normalized = normalizeTravelLiveSnapshot(snapshot);
    if (normalized) {
      result[tripId] = normalized;
    }
    return result;
  }, {});
}

function normalizeTravelLiveSnapshot(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const normalized = {
    fetchedAt: typeof value.fetchedAt === "number" ? value.fetchedAt : 0,
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : (typeof value.fetchedAt === "number" ? value.fetchedAt : 0),
    weather: normalizeTravelWeatherSnapshot(value.weather),
    flight: normalizeTravelFlightSnapshot(value.flight),
    flightNotice: normalizeText(value.flightNotice, 240),
    flightNoticeAt: typeof value.flightNoticeAt === "number" ? value.flightNoticeAt : 0,
    weatherNotice: normalizeText(value.weatherNotice, 240),
    weatherNoticeAt: typeof value.weatherNoticeAt === "number" ? value.weatherNoticeAt : 0,
    pending: value.pending === true
  };

  if (!normalized.weather && !normalized.flight && !normalized.flightNotice && !normalized.weatherNotice && !normalized.pending) {
    return null;
  }
  return normalized;
}

function normalizeTravelWeatherSnapshot(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const days = Array.isArray(value.days)
    ? value.days.slice(0, 6).map((day) => ({
        date: normalizeDateValue(day?.date),
        shortLabel: normalizeText(day?.shortLabel, 24),
        dateLabel: normalizeText(day?.dateLabel, 24),
        temperatureLabel: normalizeText(day?.temperatureLabel, 40),
        conditionLabel: normalizeText(day?.conditionLabel, 80)
      })).filter((day) => day.date || day.shortLabel || day.temperatureLabel || day.conditionLabel)
    : [];
  return {
    status: normalizeText(value.status, 32),
    message: normalizeText(value.message, 240),
    query: normalizeText(value.query, 160),
    locationLabel: normalizeText(value.locationLabel, 120),
    fetchedAt: typeof value.fetchedAt === "number" ? value.fetchedAt : 0,
    nextRefreshAt: typeof value.nextRefreshAt === "number" ? value.nextRefreshAt : 0,
    days
  };
}

function normalizeTravelFlightSnapshot(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  return {
    status: normalizeText(value.status, 32),
    message: normalizeText(value.message, 240),
    flightLabel: normalizeText(value.flightLabel, 40),
    statusLabel: normalizeText(value.statusLabel, 80),
    departureCode: normalizeText(value.departureCode, 8).toUpperCase(),
    arrivalCode: normalizeText(value.arrivalCode, 8).toUpperCase(),
    departureTimeLabel: normalizeText(value.departureTimeLabel, 80),
    gate: normalizeText(value.gate, 12),
    terminal: normalizeText(value.terminal, 12),
    fetchedAt: typeof value.fetchedAt === "number" ? value.fetchedAt : 0,
    nextRefreshAt: typeof value.nextRefreshAt === "number" ? value.nextRefreshAt : 0
  };
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
    forecastLocation: normalizeText(value.forecastLocation, 160),
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
    packingTask: normalizePackingTaskSettings(value.packingTask),
    createdAt: typeof value.createdAt === "number" ? value.createdAt : now,
    updatedAt: now
  };
}

function normalizeTravelSettings(value) {
  return {
    homeLocation: normalizeText(value?.homeLocation, 120),
    homeTimeZone: normalizeTimeZone(value?.homeTimeZone),
    lastPackingCategory: normalizePackingCategory(value?.lastPackingCategory),
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
    category: normalizePackingCategory(value?.category),
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
        forecastLocation: normalizeText(template.forecastLocation, 160),
        startDate: normalizeDateValue(template.startDate),
        endDate: normalizeDateValue(template.endDate),
        itinerary: normalizeTripItinerary(template.itinerary, createId),
        packingTask: normalizePackingTaskSettings(template.packingTask),
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
    forecastLocation: "",
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
    packingTask: normalizePackingTaskSettings({ updatedAt: now }),
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

function buildTravelDisplaySnapshot(persistedSnapshot, uiSnapshot) {
  const base = normalizeTravelLiveSnapshot(persistedSnapshot) || null;
  if (!uiSnapshot) {
    return base;
  }
  return mergeTravelLiveSnapshot(base, uiSnapshot);
}

function mergeTravelLiveSnapshot(base, update) {
  const normalizedBase = normalizeTravelLiveSnapshot(base) || {};
  const normalizedUpdate = normalizeTravelLiveSnapshot(update) || {};
  const updateFlightFailed = normalizedUpdate.flight && normalizedUpdate.flight.status && normalizedUpdate.flight.status !== "ok";
  const updateWeatherFailed = normalizedUpdate.weather && normalizedUpdate.weather.status && normalizedUpdate.weather.status !== "ok";
  const mergedFlight = normalizedUpdate.flight
    ? (normalizedUpdate.flight.status === "ok"
        ? normalizedUpdate.flight
        : (normalizedBase.flight || normalizedUpdate.flight))
    : normalizedBase.flight;
  const mergedWeather = normalizedUpdate.weather
    ? (normalizedUpdate.weather.status === "ok" ? normalizedUpdate.weather : (normalizedBase.weather || normalizedUpdate.weather))
    : (normalizedBase.weather || null);
  return {
    ...normalizedBase,
    ...normalizedUpdate,
    fetchedAt: Math.max(normalizedBase.fetchedAt || 0, normalizedUpdate.fetchedAt || 0),
    updatedAt: Math.max(normalizedBase.updatedAt || 0, normalizedUpdate.updatedAt || 0, normalizedUpdate.fetchedAt || 0),
    flight: mergedFlight || null,
    weather: mergedWeather,
    flightNotice: updateFlightFailed && normalizedBase.flight && mergedFlight?.status === "ok"
      ? (normalizedUpdate.flight?.message || normalizedUpdate.flightNotice || normalizedBase.flightNotice || "")
      : (normalizedUpdate.flight?.status === "ok" ? "" : (normalizedUpdate.flightNotice || normalizedBase.flightNotice || "")),
    flightNoticeAt: updateFlightFailed
      ? Math.max(normalizedUpdate.flight?.fetchedAt || 0, normalizedUpdate.flightNoticeAt || 0, normalizedUpdate.fetchedAt || 0)
      : 0,
    weatherNotice: updateWeatherFailed && normalizedBase.weather && mergedWeather?.status === "ok"
      ? (normalizedUpdate.weather?.message || normalizedUpdate.weatherNotice || normalizedBase.weatherNotice || "")
      : (normalizedUpdate.weather?.status === "ok" ? "" : (normalizedUpdate.weatherNotice || normalizedBase.weatherNotice || "")),
    weatherNoticeAt: updateWeatherFailed
      ? Math.max(normalizedUpdate.weather?.fetchedAt || 0, normalizedUpdate.weatherNoticeAt || 0, normalizedUpdate.fetchedAt || 0)
      : 0,
    pending: normalizedUpdate.pending === true
  };
}

function shouldRefreshTravelShellTrip({ request, persistedSnapshot, forceFlightRefresh = false }) {
  const now = Date.now();
  if (forceFlightRefresh && (request.flight || request.weather)) {
    return true;
  }
  if (!persistedSnapshot) {
    return true;
  }
  const weatherQueryChanged = Boolean(
    request.weather
    && persistedSnapshot.weather
    && normalizeText(persistedSnapshot.weather.query, 160) !== normalizeText(request.weather.destinationQuery, 160)
  );
  if (weatherQueryChanged) {
    return true;
  }
  const weatherDue = Boolean(request.weather) && shouldRefreshLiveComponent(persistedSnapshot.weather, now);
  const flightDue = Boolean(request.flight) && shouldRefreshLiveComponent(persistedSnapshot.flight, now);
  return weatherDue || flightDue;
}

function shouldRefreshLiveComponent(componentSnapshot, now = Date.now()) {
  if (!componentSnapshot) {
    return true;
  }
  const nextRefreshAt = Number(componentSnapshot.nextRefreshAt || 0);
  if (!nextRefreshAt) {
    return true;
  }
  return nextRefreshAt <= now;
}

function persistTravelLiveSnapshot(widget, tripId, snapshot) {
  const trips = normalizeTrips(widget.data?.trips);
  const persistedByTripId = normalizeTravelLiveSnapshots(widget.data?.liveSnapshots, trips);
  const merged = mergeTravelLiveSnapshot(persistedByTripId[tripId], snapshot);
  merged.pending = false;
  widget.data.liveSnapshots = {
    ...persistedByTripId,
    [tripId]: merged
  };
}

function normalizePackingQuantity(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return Math.min(99, Math.round(parsed));
}

function normalizePackingCategory(value) {
  return normalizeText(value, 40) || DEFAULT_TRAVEL_PACKING_CATEGORY;
}

function normalizePackingTaskGraceMinutes(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_TRAVEL_PACKING_OVERDUE_GRACE_MINUTES;
  }
  return Math.min(720, Math.round(parsed));
}

function normalizePackingTaskSettings(value) {
  return {
    dueTime: normalizeTimeValue(value?.dueTime) || DEFAULT_TRAVEL_PACKING_DUE_TIME,
    overdueGraceMinutes: normalizePackingTaskGraceMinutes(value?.overdueGraceMinutes),
    updatedAt: typeof value?.updatedAt === "number" ? value.updatedAt : Date.now()
  };
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

function getTravelUiState(widgetId) {
  if (!travelWidgetUiState.has(widgetId)) {
    travelWidgetUiState.set(widgetId, {
      detailTab: "overview",
      shellLiveByTripId: {},
      shellLiveFetchedAt: 0,
      shellLiveRequestKey: "",
      shellLivePendingKey: "",
      shellLiveRequestToken: 0,
      forceFlightRefreshTripIds: {}
    });
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
  const weather = buildTravelWeatherRequest(trip, settings);
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

function buildTravelWeatherRequest(trip, settings) {
  const weatherTarget = getNextTravelWeatherTarget(trip, settings);
  const destinationQuery = normalizeText(weatherTarget.primaryQuery, 160);
  if (!destinationQuery) {
    return null;
  }
  return {
    destinationQuery,
    candidateQueries: weatherTarget.candidateQueries,
    startDate: normalizeDateValue(trip?.startDate || trip?.itinerary?.checkInDate || trip?.itinerary?.outboundDate),
    endDate: normalizeDateValue(trip?.endDate || trip?.itinerary?.checkOutDate || trip?.itinerary?.returnDate)
  };
}

function getNextTravelWeatherTarget(trip, settings) {
  const itinerary = normalizeTripItinerary(trip?.itinerary);
  const now = Date.now();
  const normalizedSettings = normalizeTravelSettings(settings);
  const departureTimestamp = resolveTravelDepartureTimestamp(trip, normalizedSettings);
  const returnTimestamp = resolveTravelReturnTimestamp(trip, normalizedSettings);
  const beforeDeparture = Number.isFinite(departureTimestamp) && departureTimestamp > now;
  const duringTrip = trip?.status === "active"
    || (Number.isFinite(departureTimestamp) && departureTimestamp <= now && (!Number.isFinite(returnTimestamp) || returnTimestamp > now));

  const candidateQueries = [];
  const pushCandidate = (value) => {
    const normalized = normalizeText(value, 160);
    if (normalized && !candidateQueries.includes(normalized)) {
      candidateQueries.push(normalized);
    }
  };

  if (beforeDeparture) {
    pushCandidate(itinerary.lodgingAddress);
    pushCandidate(itinerary.outboundDestination);
    pushCandidate(trip?.destination);
  } else if (duringTrip) {
    pushCandidate(itinerary.lodgingAddress);
    pushCandidate(trip?.destination);
    pushCandidate(itinerary.outboundDestination);
    pushCandidate(itinerary.returnOrigin);
  } else {
    pushCandidate(itinerary.lodgingAddress);
    pushCandidate(itinerary.outboundDestination);
    pushCandidate(trip?.destination);
  }

  return {
    primaryQuery: candidateQueries[0] || "",
    candidateQueries
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

function shiftDateString(dateString, dayOffset) {
  const [year, month, day] = String(dateString || "").split("-").map(Number);
  if (!year || !month || !day) {
    return "";
  }
  const shifted = new Date(Date.UTC(year, month - 1, day + Number(dayOffset || 0)));
  return shifted.toISOString().slice(0, 10);
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
    const packingTask = buildPackingTaskForTrip({ widget, trip, settings, helpers });
    desired.push(...tripTasks, ...buildItineraryTasksForTrip({ widget, trip, settings, helpers }));
    if (packingTask) {
      desired.push(packingTask);
    }
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

function buildPackingTaskForTrip({ widget, trip, settings, helpers }) {
  if (!trip?.packingList?.items?.length) {
    return null;
  }

  const departureTimestamp = resolveTravelDepartureTimestamp(trip, settings);
  if (!Number.isFinite(departureTimestamp) || departureTimestamp <= 0) {
    return null;
  }

  const packingTask = normalizePackingTaskSettings(trip.packingTask);
  const timeZone = resolveOutboundStageTimeZone(trip, settings);
  const departureDate = formatZonedDateString(departureTimestamp, timeZone);
  const dueDate = shiftDateString(departureDate, -1);
  const dueTimestamp = zonedDateTimeToTimestamp(dueDate, packingTask.dueTime, timeZone);
  const skipCutoffTimestamp = departureTimestamp + packingTask.overdueGraceMinutes * 60_000;
  if (!Number.isFinite(dueTimestamp) || skipCutoffTimestamp <= Date.now()) {
    return null;
  }

  const graceMinutes = Math.max(0, Math.round((skipCutoffTimestamp - dueTimestamp) / 60_000));
  const unpackedQuantity = getUnpackedPackingQuantity(trip);
  const travelCategory = helpers.resolveCategorySnapshot("travel");
  const now = Date.now();

  return {
    id: helpers.createId(),
    templateId: "",
    occurrenceIndex: 0,
    name: `${trip.name}: pack for departure`,
    details: buildTravelPackingTaskDetails({
      trip,
      timeZone,
      dueDate,
      dueTime: packingTask.dueTime,
      departureDate,
      departureTime: normalizeTripItinerary(trip.itinerary).outboundTime || "12:00",
      overdueGraceMinutes: packingTask.overdueGraceMinutes,
      unpackedQuantity
    }),
    startDate: dueDate,
    dueDate,
    timeOfDay: packingTask.dueTime,
    lateGraceMinutes: graceMinutes,
    notBeforeAt: 0,
    pointsValue: 3,
    pointsEntryId: "",
    length: "medium",
    categoryKey: travelCategory.key,
    categoryLabel: travelCategory.label,
    categoryColor: travelCategory.color,
    importance: "medium",
    status: "open",
    createdAt: now,
    updatedAt: now,
    ownerWidgetId: widget.id,
    ownerWidgetType: widget.type,
    ownerTaskKey: ["travel-pack", trip.id].join(":"),
    widgetTaskKind: "travel-pack",
    widgetTaskMeta: {
      tripId: trip.id,
      timeZone,
      departureDate,
      departureTime: normalizeTripItinerary(trip.itinerary).outboundTime || "12:00",
      dueTime: packingTask.dueTime,
      overdueGraceMinutes: packingTask.overdueGraceMinutes,
      unpackedQuantity
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
    skipRule: {
      type: "after-due-minutes",
      graceMinutes
    },
    dependencies: [],
    recurrence: { type: "none" },
    history: []
  };
}

function buildTravelItineraryTaskDetails({ trip, item, timeZone }) {
  const parts = [`Created by Travel Buddy for ${trip.name}.`, item.details || ""].filter(Boolean);
  parts.push(`${formatTravelOffsetLabel(item.offsetMinutes, timeZone)}.`);
  return parts.join(" ");
}

function buildTravelPackingTaskDetails({
  trip,
  timeZone,
  dueDate,
  dueTime,
  departureDate,
  departureTime,
  overdueGraceMinutes,
  unpackedQuantity
}) {
  const parts = [
    `Created by Travel Buddy for ${trip.name}.`,
    `${unpackedQuantity || trip.packingList.items.length} unpacked item${(unpackedQuantity || trip.packingList.items.length) === 1 ? "" : "s"} remain on this packing list.`,
    `Pack by ${formatDateTimeLabel(dueDate, dueTime)} (${timeZone}).`,
    `This checklist expires ${overdueGraceMinutes} minute${overdueGraceMinutes === 1 ? "" : "s"} after departure at ${formatDateTimeLabel(departureDate, departureTime)} (${timeZone}).`
  ];
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
    && (task.widgetTaskKind === "flight-checkin" || task.widgetTaskKind === "travel-itinerary-task" || task.widgetTaskKind === "travel-pack")
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
    if (existing.widgetTaskKind === "travel-pack" && existing.status === "open" && shouldAutoSkipTask(existing, new Date())) {
      helpers.skipWidgetTaskById?.(existing.id, Date.now());
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

  syncTravelPackingTaskState(widget, store, helpers);
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

function syncTravelPackingTaskState(widget, store, helpers) {
  if (!store || !Array.isArray(store.tasks)) {
    return;
  }

  const tripsById = new Map(normalizeTrips(widget.data?.trips).map((trip) => [trip.id, trip]));
  const now = Date.now();
  let shouldRunAutoSkip = false;

  for (const task of store.tasks) {
    if (
      task.ownerWidgetId !== widget.id
      || task.ownerWidgetType !== TRAVEL_WIDGET_TYPE
      || task.widgetTaskKind !== "travel-pack"
      || task.templateId
      || task.archived
    ) {
      continue;
    }

    const trip = tripsById.get(task.widgetTaskMeta?.tripId || "");
    if (!trip || !trip.packingList.items.length) {
      continue;
    }

    const checklistComplete = getUnpackedPackingQuantity(trip) === 0;
    const pastSkipCutoff = shouldAutoSkipTask(task, new Date(now));

    if (pastSkipCutoff) {
      if (task.status === "done") {
        continue;
      }
      if (task.status !== "open") {
        helpers.reopenWidgetTaskById?.(task.id, now);
      }
      shouldRunAutoSkip = true;
      continue;
    }

    if (checklistComplete) {
      if (task.status !== "open") {
        helpers.reopenWidgetTaskById?.(task.id, now);
      }
      helpers.completeWidgetTaskById?.(task.id, now);
      continue;
    }

    if (task.status !== "open") {
      helpers.reopenWidgetTaskById?.(task.id, now);
    }
  }

  if (shouldRunAutoSkip) {
    helpers.applyAutoSkipRules?.(new Date(now));
  }
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
      quantity: normalizePackingQuantity(row.querySelector("[data-travel-template-item-quantity]")?.value),
      category: normalizePackingCategory(row.querySelector("[data-travel-template-item-category]")?.value)
    }))
    .filter((item) => item.label);
}

function dedupePackingItems(items) {
  const seenLabels = new Set();
  const deduped = [];
  for (const item of items) {
    const labelKey = normalizeText(item.label, 120).toLowerCase();
    const categoryKey = normalizePackingCategory(item.category).toLowerCase();
    const dedupeKey = `${categoryKey}::${labelKey}`;
    if (!labelKey || seenLabels.has(dedupeKey)) {
      continue;
    }
    seenLabels.add(dedupeKey);
    deduped.push(item);
  }
  return deduped;
}

function getTravelPackingCategoryListId(widgetId) {
  return `travel-packing-categories-${widgetId}`;
}

function collectTravelPackingCategories(widget) {
  const settings = normalizeTravelSettings(widget?.settings);
  const categories = new Set([DEFAULT_TRAVEL_PACKING_CATEGORY]);
  if (settings.lastPackingCategory) {
    categories.add(settings.lastPackingCategory);
  }
  for (const trip of normalizeTrips(widget?.data?.trips)) {
    for (const item of normalizePackingItems(trip?.packingList?.items)) {
      categories.add(normalizePackingCategory(item.category));
    }
  }
  for (const template of normalizePackingTemplates(widget?.data?.packingTemplates)) {
    for (const item of normalizePackingItems(template?.items)) {
      categories.add(normalizePackingCategory(item.category));
    }
  }
  for (const template of normalizeItineraryTemplates(widget?.data?.itineraryTemplates)) {
    for (const item of normalizePackingItems(template?.packingItems)) {
      categories.add(normalizePackingCategory(item.category));
    }
  }
  return Array.from(categories).sort((left, right) => {
    if (left === DEFAULT_TRAVEL_PACKING_CATEGORY) {
      return -1;
    }
    if (right === DEFAULT_TRAVEL_PACKING_CATEGORY) {
      return 1;
    }
    return left.localeCompare(right);
  });
}

function getUnpackedPackingItems(trip) {
  return normalizePackingItems(trip?.packingList?.items).filter((item) => !item.packed);
}

function getUnpackedPackingQuantity(trip) {
  return getUnpackedPackingItems(trip).reduce((sum, item) => sum + normalizePackingQuantity(item.quantity), 0);
}

function groupPackingItemsByCategory(items) {
  const grouped = new Map();
  for (const item of normalizePackingItems(items)) {
    const category = normalizePackingCategory(item.category);
    if (!grouped.has(category)) {
      grouped.set(category, []);
    }
    grouped.get(category).push(item);
  }

  return Array.from(grouped.entries())
    .map(([label, groupedItems]) => ({
      label,
      items: groupedItems.sort((left, right) => left.label.localeCompare(right.label)),
      unpackedQuantity: groupedItems
        .filter((item) => !item.packed)
        .reduce((sum, item) => sum + normalizePackingQuantity(item.quantity), 0)
    }))
    .sort((left, right) => {
      if (left.label === DEFAULT_TRAVEL_PACKING_CATEGORY) {
        return -1;
      }
      if (right.label === DEFAULT_TRAVEL_PACKING_CATEGORY) {
        return 1;
      }
      return left.label.localeCompare(right.label);
    });
}
