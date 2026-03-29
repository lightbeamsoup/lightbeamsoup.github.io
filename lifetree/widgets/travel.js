export const TRAVEL_WIDGET_TYPE = "travel";

const TRAVEL_CATEGORY = {
  key: "travel",
  label: "Travel",
  color: "#6aa9ff"
};
const TRIP_STATUS_OPTIONS = [
  { value: "planning", label: "Planning" },
  { value: "booked", label: "Booked" },
  { value: "active", label: "Active" },
  { value: "complete", label: "Complete" }
];
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

  render({ widget, tasks, escapeHtml }) {
    const trips = normalizeTrips(widget.data?.trips);
    const settings = normalizeTravelSettings(widget.settings);
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
          ? upcomingTrips.slice(0, 3).map((trip) => renderTravelShellCard(trip, escapeHtml)).join("")
          : `<p class="empty-state">Your upcoming trips will show up here.</p>`}
      </div>
      <div class="widget-actions">
        <button type="button" class="ghost-button" data-widget-action="travel-new-trip">New trip</button>
        <button type="button" class="ghost-button" data-widget-action="open-widget-detail">Open panel</button>
      </div>
      <p class="sync-status">Travel Buddy tasks will surface here once itinerary task generation is wired in. Current open travel tasks: ${openTravelTaskCount}.</p>
    `;
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
          list.insertAdjacentHTML("beforeend", renderTravelTemplateItemRow({ label: "", quantity: 1 }, helpers.createId));
        }
        return;
      }

      const removeTemplateItemButton = event.target.closest("[data-travel-remove-template-item]");
      if (removeTemplateItemButton) {
        removeTemplateItemButton.closest(".travel-template-item-row")?.remove();
        return;
      }

      const newTripButton = event.target.closest("[data-travel-new-trip]");
      if (newTripButton) {
        const nextTrip = createEmptyTrip(helpers.createId, Date.now(), helpers.todayString());
        widget.data.trips = [...normalizeTrips(widget.data?.trips), nextTrip].sort(compareTripDisplay);
        widget.updatedAt = Date.now();
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
        widget.updatedAt = Date.now();
        setTravelDetailTab(widget.id, "overview", widget.data.trips);
        helpers.persistStore();
        helpers.renderAll();
        helpers.setSyncStatus("Removed that trip.", "info");
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
          itinerary: normalizeTripItinerary(template.itinerary),
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
        widget.updatedAt = now;
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
            itinerary: normalizeTripItinerary(trip.itinerary),
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
          startDate: template.startDate,
          endDate: template.endDate,
          itinerary: normalizeTripItinerary(template.itinerary),
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
        widget.updatedAt = now;
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
        widget.updatedAt = Date.now();
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
        const updatedTrip = updateTripById(widget, tripId, (trip) => ({
          ...trip,
          name: normalizeText(tripForm.querySelector("[data-travel-name]")?.value, 80) || "Trip",
          destination: normalizeText(tripForm.querySelector("[data-travel-destination]")?.value, 120),
          status: normalizeTripStatus(tripForm.querySelector("[data-travel-status]")?.value),
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
            notes: tripForm.querySelector("[data-travel-notes]")?.value
          }),
          updatedAt: now
        }));
        if (!updatedTrip) {
          helpers.setSyncStatus("That trip could not be found.", "error");
          return;
        }
        widget.updatedAt = now;
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
      widget.updatedAt = Date.now();
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
  return {
    id: typeof value.id === "string" && value.id ? value.id : createId(),
    name: normalizeText(value.name, 80) || "Trip",
    destination: normalizeText(value.destination, 120),
    status: normalizeTripStatus(value.status),
    startDate: normalizeDateValue(value.startDate),
    endDate: normalizeDateValue(value.endDate),
    itinerary: normalizeTripItinerary(value.itinerary),
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

function normalizeTripItinerary(value) {
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
    notes: normalizeLongText(value?.notes, 2000)
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
        itinerary: normalizeTripItinerary(template.itinerary),
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
    startDate: todayString,
    endDate: todayString,
    itinerary: normalizeTripItinerary({}),
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
  const today = formatTodayLocal();
  return normalizeTrips(trips)
    .filter((trip) => trip.status !== "complete" || (trip.endDate && trip.endDate >= today))
    .sort(compareTripDisplay);
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

function renderTravelShellCard(trip, escapeHtml) {
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
      <div class="widget-actions travel-shell-actions">
        <button type="button" class="ghost-button" data-widget-action="travel-open-trip" data-trip-id="${trip.id}">View trip</button>
      </div>
    </article>
  `;
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
  return `
    <div class="travel-template-item-row" data-travel-template-row="${rowId}">
      <label class="quick-add-title">
        <span>Item</span>
        <input type="text" maxlength="120" value="${escapeHtml(item?.label || "")}" placeholder="Passport" data-travel-template-item-label />
      </label>
      <label>
        <span>Qty</span>
        <input type="number" min="1" max="99" step="1" value="${normalizePackingQuantity(item?.quantity)}" data-travel-template-item-quantity />
      </label>
      <button type="button" class="ghost-button" data-travel-remove-template-item>Remove</button>
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
