export function createBaseFixtureStore(overrides = {}) {
  return {
    version: 18,
    updatedAt: 1_000,
    userUpdatedAt: 1_000,
    driveFileId: "",
    profile: {
      displayName: "Fixture User",
      autosaveEnabled: true,
      autosaveIntervalMinutes: 5
    },
    notifications: {
      email: {
        recipientEmail: "fixture@example.com",
        summaries: {
          enabled: true,
          frequency: "daily",
          sendTime: "20:00",
          include: {
            overdue: true,
            dueSoon: true,
            completed: true,
            recurringProgress: true,
            treePoints: true,
            widgetHighlights: true
          }
        },
        reminders: {
          enabled: true,
          dueSoonEnabled: true,
          overdueEnabled: true,
          dailyAgendaEnabled: true,
          dailyAgendaTime: "07:00"
        },
        history: []
      }
    },
    tasks: [],
    pointLedger: [],
    pointHistory: [],
    treeState: {},
    devSettings: {},
    categories: [],
    widgets: [],
    retiredWidgets: [],
    recurringBonusSelections: [],
    deletionMarkers: [],
    ...overrides
  };
}

export function createTravelFixtureStore() {
  return createBaseFixtureStore({
    updatedAt: 2_000,
    userUpdatedAt: 2_000,
    widgets: [
      {
        id: "travel-widget-1",
        type: "travel",
        createdAt: 1_950,
        updatedAt: 2_000,
        settings: {
          homeLocation: "San Francisco, CA",
          homeTimeZone: "America/Los_Angeles"
        },
        data: {
          trips: [
            {
              id: "trip-1",
              name: "AI4NS",
              destination: "Albuquerque, NM",
              status: "active",
              startDate: "2026-03-30",
              endDate: "2026-04-01",
              itinerary: {
                outboundDate: "2026-03-30",
                outboundTime: "12:00",
                outboundOrigin: "SFO",
                outboundDestination: "ABQ",
                outboundFlightNumber: "UA5375"
              }
            }
          ],
          liveSnapshots: {
            "trip-1": {
              flight: {
                status: "ok",
                flightLabel: "UA5375",
                statusLabel: "Scheduled",
                departureCode: "SFO",
                arrivalCode: "ABQ",
                departureTimeLabel: "Mar 30, 12:00 PM"
              },
              weather: {
                status: "ok",
                locationLabel: "Albuquerque, New Mexico",
                days: [
                  { shortLabel: "Mon", temperatureLabel: "81/52F", conditionLabel: "Clouds" },
                  { shortLabel: "Tue", temperatureLabel: "75/55F", conditionLabel: "Drizzle" }
                ]
              }
            }
          }
        }
      }
    ],
    tasks: [
      {
        id: "travel-flight-checkin-1",
        name: "Check in for UA5375",
        status: "open",
        dueDate: "2026-03-29",
        timeOfDay: "12:00",
        categoryKey: "travel",
        categoryLabel: "Travel",
        categoryColor: "#4a7fd6",
        createdAt: 1_960,
        updatedAt: 1_990,
        ownerWidgetType: "travel",
        ownerTaskKey: "travel-flight-checkin:trip-1:outbound",
        widgetTaskKind: "flight-checkin",
        widgetTaskMeta: {
          tripId: "trip-1",
          timeZone: "America/Los_Angeles"
        },
        reminders: { enabled: true, dueSoonMinutes: 60, overdueMinutes: 15 },
        skipRule: { type: "none" },
        recurrence: { type: "none" },
        dependencies: [],
        history: []
      }
    ]
  });
}

export function createWorkoutFixtureStore() {
  return createBaseFixtureStore({
    updatedAt: 3_000,
    userUpdatedAt: 3_000,
    widgets: [
      {
        id: "workout-widget-1",
        type: "workout",
        createdAt: 2_900,
        updatedAt: 3_000,
        settings: { weightUnit: "lbs" },
        data: {
          workoutEntries: [
            { at: Date.parse("2026-03-29T18:30:00-07:00"), workoutType: "Dog walk", caloriesBurned: 60 }
          ],
          weightEntries: [
            { at: Date.parse("2026-03-29T08:00:00-07:00"), value: 201.2, unit: "lbs" }
          ]
        }
      }
    ],
    tasks: [
      {
        id: "workout-task-1",
        name: "Dog walk",
        status: "open",
        dueDate: "2026-03-29",
        timeOfDay: "18:30",
        categoryKey: "health",
        categoryLabel: "Health",
        categoryColor: "#6dc7bf",
        createdAt: 2_910,
        updatedAt: 2_995,
        ownerWidgetType: "workout",
        ownerTaskKey: "workout-plan:walk-series:2026-03-29T18:30",
        widgetTaskKind: "workout-session",
        widgetTaskMeta: {
          workoutType: "Dog walk",
          caloriesBurned: 60,
          durationMinutes: 45
        },
        reminders: { enabled: true, dueSoonMinutes: 30, overdueMinutes: 0 },
        skipRule: { type: "widget-lockout", policy: "workout-next-window" },
        recurrence: { type: "daily", interval: 1 },
        dependencies: [],
        history: []
      }
    ]
  });
}

export function createDriveConflictFixtureStores() {
  return {
    autoMerge: {
      local: createBaseFixtureStore({
        updatedAt: 4_000,
        userUpdatedAt: 4_000,
        tasks: [
          {
            id: "local-task-1",
            name: "Local-only task",
            status: "open",
            dueDate: "2026-04-03",
            timeOfDay: "10:00",
            categoryKey: "productivity",
            categoryLabel: "Productivity",
            categoryColor: "#7dbf74",
            createdAt: 3_950,
            updatedAt: 4_000,
            reminders: { enabled: false, dueSoonMinutes: null, overdueMinutes: null },
            skipRule: { type: "none" },
            recurrence: { type: "none" },
            dependencies: [],
            history: []
          }
        ]
      }),
      remote: createBaseFixtureStore({
        updatedAt: 4_100,
        userUpdatedAt: 4_100,
        tasks: [
          {
            id: "remote-task-1",
            name: "Remote-only task",
            status: "open",
            dueDate: "2026-04-04",
            timeOfDay: "11:00",
            categoryKey: "health",
            categoryLabel: "Health",
            categoryColor: "#6dc7bf",
            createdAt: 4_050,
            updatedAt: 4_100,
            reminders: { enabled: true, dueSoonMinutes: 15, overdueMinutes: 15 },
            skipRule: { type: "none" },
            recurrence: { type: "none" },
            dependencies: [],
            history: []
          }
        ]
      })
    },
    ambiguous: {
      local: createBaseFixtureStore({
        updatedAt: 5_000,
        userUpdatedAt: 5_000,
        tasks: [
          {
            id: "shared-task-1",
            name: "Morning review",
            status: "open",
            dueDate: "2026-04-05",
            timeOfDay: "09:00",
            categoryKey: "productivity",
            categoryLabel: "Productivity",
            categoryColor: "#7dbf74",
            createdAt: 4_950,
            updatedAt: 5_000,
            reminders: { enabled: false, dueSoonMinutes: null, overdueMinutes: null },
            skipRule: { type: "none" },
            recurrence: { type: "none" },
            dependencies: [],
            history: []
          }
        ]
      }),
      remote: createBaseFixtureStore({
        updatedAt: 5_000,
        userUpdatedAt: 5_000,
        tasks: [
          {
            id: "shared-task-1",
            name: "Morning reflection",
            status: "open",
            dueDate: "2026-04-05",
            timeOfDay: "09:00",
            categoryKey: "productivity",
            categoryLabel: "Productivity",
            categoryColor: "#7dbf74",
            createdAt: 4_950,
            updatedAt: 5_000,
            reminders: { enabled: false, dueSoonMinutes: null, overdueMinutes: null },
            skipRule: { type: "none" },
            recurrence: { type: "none" },
            dependencies: [],
            history: []
          }
        ]
      })
    }
  };
}

export const malformedDrivePayloadFixtures = [
  undefined,
  null,
  42,
  "broken",
  {
    updatedAt: 6_000,
    tasks: [
      null,
      {
        id: "legacy-task-1",
        name: "Legacy task",
        status: "open",
        dueDate: "2026-04-06",
        timeOfDay: "08:00",
        categoryKey: "health",
        createdAt: 5_900,
        recurrence: { type: "weekly", interval: "bad" },
        reminders: null,
        widgetTaskMeta: null,
        history: []
      }
    ],
    widgets: [
      {
        id: "travel-widget-legacy",
        type: "travel",
        data: {
          trips: [
            {
              id: "legacy-trip-1",
              name: "Legacy trip",
              destination: "Seattle, WA",
              startDate: "2026-04-10",
              endDate: "2026-04-12",
              itinerary: {
                outboundDate: "2026-04-10",
                outboundTime: "09:00"
              }
            }
          ]
        }
      }
    ],
    notifications: null,
    treeState: null,
    pointLedger: [
      {
        id: "point-1",
        at: 5_950,
        points: 3,
        categoryKey: "health"
      }
    ]
  }
];
