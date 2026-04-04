/**
 * Shared Lifetree record typedefs for editor hints and schema docs.
 * These describe the normalized shapes written to local storage and Drive.
 */

/**
 * @typedef {"open" | "done" | "skipped"} LifetreeTaskStatus
 */

/**
 * @typedef {object} LifetreeCategorySnapshot
 * @property {string} key
 * @property {string} label
 * @property {string} color
 */

/**
 * @typedef {object} LifetreeTaskHistoryEntry
 * @property {string} id
 * @property {string} type
 * @property {number} at
 * @property {string} reason
 */

/**
 * @typedef {object} LifetreeTaskReminderConfig
 * @property {boolean} enabled
 * @property {number|null} dueSoonMinutes
 * @property {number|null} overdueMinutes
 */

/**
 * @typedef {object} LifetreeGoogleCalendarTaskLink
 * @property {string} calendarId
 * @property {string} eventId
 * @property {string} recurringEventId
 * @property {string} source
 * @property {number} linkedAt
 * @property {string} lastSeenGoogleUpdatedAt
 * @property {string} scheduleFingerprint
 * @property {number} statusMirroredAt
 * @property {number} schemaVersion
 */

/**
 * @typedef {object} LifetreeTask
 * @property {string} id
 * @property {string} templateId
 * @property {number} occurrenceIndex
 * @property {string} name
 * @property {string} details
 * @property {string} startDate
 * @property {string} dueDate
 * @property {string} timeOfDay
 * @property {number} lateGraceMinutes
 * @property {number} notBeforeAt
 * @property {string} length
 * @property {number} pointsValue
 * @property {string} pointsEntryId
 * @property {string} categoryKey
 * @property {string} categoryLabel
 * @property {string} categoryColor
 * @property {string} importance
 * @property {LifetreeTaskStatus} status
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {string} ownerWidgetId
 * @property {string} ownerWidgetType
 * @property {string} ownerTaskKey
 * @property {string} widgetTaskKind
 * @property {Record<string, unknown>} widgetTaskMeta
 * @property {LifetreeGoogleCalendarTaskLink} googleCalendar
 * @property {LifetreeTaskReminderConfig} reminders
 * @property {{groupId: string, kind: string, slotIndex: number, slotCount: number}} linkedSeries
 * @property {string} sequenceDependencyId
 * @property {Record<string, unknown>} widgetCompletion
 * @property {Record<string, unknown>} skipRule
 * @property {string[]} dependencies
 * @property {Record<string, unknown>} recurrence
 * @property {boolean} archived
 * @property {boolean} historyOnly
 * @property {number} hideAfterAt
 * @property {string} seriesOriginId
 * @property {LifetreeTaskHistoryEntry[]} history
 */

/**
 * @typedef {object} LifetreeWidgetRecord
 * @property {string} id
 * @property {string} type
 * @property {number} slotIndex
 * @property {Record<string, unknown>} settings
 * @property {Record<string, unknown>} data
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/**
 * @typedef {object} LifetreeStore
 * @property {number} version
 * @property {number} updatedAt
 * @property {number} userUpdatedAt
 * @property {string} userFingerprint
 * @property {string} driveFileId
 * @property {Record<string, unknown>} profile
 * @property {Record<string, unknown>} integrations
 * @property {Record<string, unknown>} notifications
 * @property {LifetreeTask[]} tasks
 * @property {Array<Record<string, unknown>>} pointLedger
 * @property {Array<Record<string, unknown>>} pointHistory
 * @property {Record<string, unknown>} treeState
 * @property {Record<string, unknown>} devSettings
 * @property {Array<Record<string, unknown>>} categories
 * @property {LifetreeWidgetRecord[]} widgets
 * @property {LifetreeWidgetRecord[]} retiredWidgets
 * @property {Array<Record<string, unknown>>} recurringBonusSelections
 * @property {Array<Record<string, unknown>>} deletionMarkers
 */

export const LIFETREE_RECORD_TYPES_VERSION = 1;
