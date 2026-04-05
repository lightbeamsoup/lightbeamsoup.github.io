import test from "node:test";
import assert from "node:assert/strict";
import { travelWidgetDefinition } from "./widgets/travel.js";

test("travel-owned itinerary and flight check-in tasks stay completable before their due time", () => {
  let idCounter = 0;
  const widget = {
    id: "travel-widget",
    type: "travel",
    slotIndex: 0,
    settings: {
      homeLocation: "Seattle",
      homeTimeZone: "America/Los_Angeles"
    },
    data: {
      trips: [
        {
          id: "trip-1",
          name: "Chico",
          destination: "London",
          status: "booked",
          startDate: "2099-04-17",
          endDate: "2099-04-24",
          itinerary: {
            outboundOrigin: "SEA",
            outboundDestination: "LHR",
            outboundFlightNumber: "BA48",
            outboundDate: "2099-04-17",
            outboundTime: "20:00",
            customTasks: [
              {
                id: "book-hotel",
                name: "Book hotel",
                details: "",
                offsetMinutes: 24 * 60,
                updatedAt: 100
              }
            ]
          },
          packingList: {
            items: []
          },
          packingTask: {}
        }
      ],
      packingTemplates: [],
      itineraryTemplates: [],
      liveSnapshots: {}
    },
    createdAt: 100,
    updatedAt: 100
  };
  const store = {
    tasks: []
  };

  travelWidgetDefinition.ensureTasks({
    widget,
    store,
    helpers: {
      createId: () => `task-${++idCounter}`,
      resolveCategorySnapshot: () => ({
        key: "travel",
        label: "Travel",
        color: "#6aa9ff"
      }),
      skipWidgetTaskById: () => {},
      reopenWidgetTaskById: () => {},
      applyAutoSkipRules: () => {}
    }
  });

  const itineraryTask = store.tasks.find((task) => task.widgetTaskKind === "travel-itinerary-task");
  const flightCheckinTask = store.tasks.find((task) => task.widgetTaskKind === "flight-checkin");

  assert.ok(itineraryTask);
  assert.equal(itineraryTask.name, "Book hotel");
  assert.equal(itineraryTask.notBeforeAt, 0);

  assert.ok(flightCheckinTask);
  assert.equal(flightCheckinTask.notBeforeAt, 0);
});
