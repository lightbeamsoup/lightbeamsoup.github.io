import { applyRemoteDeletedGoogleCalendarTask } from "./googleCalendarConflict.js";

export function createNotificationSyncController({
  apiBase,
  fetchCredentials,
  refs,
  authState,
  syncState,
  driveSaveState,
  notificationSendState,
  remoteDriftState,
  syncChannelState,
  getStore,
  persistStore,
  formatDateTime,
  normalizeDevSettings,
  normalizeProfile,
  normalizeIntegrations,
  normalizeGoogleCalendarIntegration,
  normalizeGoogleCalendarTaskLink,
  buildGoogleCalendarScheduleSyncRequest,
  normalizeTask,
  renderAll,
  normalizeNotifications,
  normalizeNotificationTimezone,
  normalizeRecipientEmail,
  normalizeNotificationTime,
  normalizeWeekday,
  normalizeEmailSummaryConfig,
  normalizeEmailReminderConfig,
  appendNotificationHistoryEntry,
  buildEmailSummaryKey,
  buildEmailSummaryPreview,
  renderEmailSummaryBodyHtml,
  renderEmailSummaryBodyText,
  buildEmailReminderTemplates,
  renderEmailReminderBodyHtml,
  renderEmailReminderBodyText,
  renderNotificationsPreview,
  renderNotificationHistory,
  computeStoreFingerprint,
  computeUserContentFingerprint,
  createId,
  addDeletionMarker = null,
  escapeHtml,
  setSyncStatus,
  renderDeveloperPanel,
  isDeveloperUser,
  isSettingsOpen,
  closeSettings,
  refreshAuthStatus,
  disconnectGoogle,
  loadFromDrive,
  saveToDrive,
  peekRemoteStore,
  finalizeStoreState = null,
  autosave
}) {
  const {
    notificationsModal,
    notificationsSummaryEnabledInput,
    notificationsRecipientEmailInput,
    notificationsSendTimeInput,
    notificationsFrequencyInput,
    notificationsWeekdayInput,
    notificationsWeekdayRow,
    notificationsRemindersEnabledInput,
    notificationsReminderDueSoonEnabledInput,
    notificationsReminderOverdueEnabledInput,
    notificationsReminderDailyAgendaEnabledInput,
    notificationsReminderDailyAgendaTimeInput,
    notificationsReminderQuietHoursEnabledInput,
    notificationsReminderQuietHoursStartInput,
    notificationsReminderQuietHoursEndInput,
    notificationsIncludeOverdueInput,
    notificationsIncludeDueSoonInput,
    notificationsIncludeCompletedInput,
    notificationsIncludeRecurringProgressInput,
    notificationsIncludeTreePointsInput,
    notificationsIncludeWidgetHighlightsInput,
    notificationsPreview,
    notificationsHistory,
    sendNotificationSummaryButton,
    sendNotificationReminderButton,
    syncLocalCard,
    syncDriveCard,
    syncAutosaveCard,
    syncCalendarCard,
    syncLocalValue,
    syncDriveValue,
    syncAutosaveValue,
    syncCalendarValue,
    googleSignInButton,
    syncGoogleCalendarButton,
    copyGoogleCalendarDiagnosticsButton,
    clearDriveDataButton,
    clearWidgetDriveDataButton,
    downloadDriveDataButton,
    sendDeveloperDailySummaryButton,
    sendDeveloperDailyAgendaButton
  } = refs;

  const localFingerprintCache = {
    storeRef: null,
    updatedAt: Number.NaN,
    fingerprint: ""
  };
  const googleSyncState = {
    inFlight: false,
    phase: ""
  };

  function isVerboseDriveSyncEnabled() {
    return normalizeDevSettings(getStore().devSettings).verboseDriveSync === true;
  }

  function buildVerboseGoogleSyncSummary({
    lead = "",
    appliedCount = 0,
    changedCount = 0,
    pulledCount = 0,
    pushedCount = 0,
    statusMirroredCount = 0,
    instanceOverrideAppliedCount = 0,
    checkedCount = 0,
    relinkedCount = 0,
    remoteDeletedCount = 0,
    recreatedAfterRemoteDeleteCount = 0,
    processedDeletionCount = 0,
    deletedEventCount = 0,
    duplicateDeletedCount = 0,
    orphanDeletedCount = 0
  }) {
    const summarySuffix = `; ${checkedCount} already up to date; ${relinkedCount} relinked; ${remoteDeletedCount} remote deleted; ${recreatedAfterRemoteDeleteCount} recreated after remote delete`;
    return `${lead}Google sync checked ${appliedCount} task${appliedCount === 1 ? "" : "s"} (${changedCount} changed: ${pulledCount} pulled, ${pushedCount} pushed, ${statusMirroredCount} status mirrored, ${instanceOverrideAppliedCount} instance override${instanceOverrideAppliedCount === 1 ? "" : "s"} applied${summarySuffix}) and processed ${processedDeletionCount} deletion${processedDeletionCount === 1 ? "" : "s"} (${deletedEventCount} Google event${deletedEventCount === 1 ? "" : "s"} removed, ${duplicateDeletedCount} duplicate${duplicateDeletedCount === 1 ? "" : "s"} cleaned up, ${orphanDeletedCount} orphan${orphanDeletedCount === 1 ? "" : "s"} removed)`;
  }

  function buildCompactGoogleSyncSummary({
    appliedCount = 0,
    nextCalendarSummary = "Lifetree",
    mirroredToDrive = false
  }) {
    return `Google sync checked ${appliedCount} task${appliedCount === 1 ? "" : "s"} against ${nextCalendarSummary}. Everything was already up to date.${mirroredToDrive ? " Mirrored the current Lifetree state to Drive." : " Drive state was unchanged."}`;
  }

  function isNotificationsOpen() {
    return !notificationsModal.classList.contains("hidden");
  }

  function openNotifications() {
    if (isSettingsOpen()) {
      closeSettings();
    }
    const notifications = normalizeNotifications(getStore().notifications);
    const summaries = notifications.email.summaries;
    const reminders = notifications.email.reminders;
    const include = summaries.include;
    notificationsSummaryEnabledInput.checked = summaries.enabled;
    notificationsRecipientEmailInput.value = notifications.email.recipientEmail || authState.user?.email || "";
    notificationsSendTimeInput.value = summaries.sendTime;
    notificationsFrequencyInput.value = summaries.frequency;
    notificationsWeekdayInput.value = String(summaries.weekday);
    notificationsRemindersEnabledInput.checked = reminders.enabled;
    notificationsReminderDueSoonEnabledInput.checked = reminders.dueSoonEnabled;
    notificationsReminderOverdueEnabledInput.checked = reminders.overdueEnabled;
    notificationsReminderDailyAgendaEnabledInput.checked = reminders.dailyAgendaEnabled;
    notificationsReminderDailyAgendaTimeInput.value = reminders.dailyAgendaTime;
    notificationsReminderQuietHoursEnabledInput.checked = reminders.quietHoursEnabled;
    notificationsReminderQuietHoursStartInput.value = reminders.quietHoursStart;
    notificationsReminderQuietHoursEndInput.value = reminders.quietHoursEnd;
    notificationsIncludeOverdueInput.checked = include.overdue;
    notificationsIncludeDueSoonInput.checked = include.dueSoon;
    notificationsIncludeCompletedInput.checked = include.completed;
    notificationsIncludeRecurringProgressInput.checked = include.recurringProgress;
    notificationsIncludeTreePointsInput.checked = include.treePoints;
    notificationsIncludeWidgetHighlightsInput.checked = include.widgetHighlights;
    syncNotificationsInputs();
    notificationsModal.classList.remove("hidden");
    notificationsModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("notifications-open");
    renderNotificationsIfOpen();
    window.setTimeout(() => notificationsRecipientEmailInput.focus(), 0);
  }

  function closeNotifications() {
    notificationsModal.classList.add("hidden");
    notificationsModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("notifications-open");
  }

  function syncNotificationsInputs() {
    const weekly = notificationsFrequencyInput.value === "weekly";
    notificationsWeekdayRow.classList.toggle("hidden", !weekly);
    notificationsWeekdayInput.disabled = !weekly;
    const remindersEnabled = notificationsRemindersEnabledInput.checked;
    notificationsReminderDueSoonEnabledInput.disabled = !remindersEnabled;
    notificationsReminderOverdueEnabledInput.disabled = !remindersEnabled;
    notificationsReminderDailyAgendaEnabledInput.disabled = !remindersEnabled;
    notificationsReminderQuietHoursEnabledInput.disabled = !remindersEnabled;
    notificationsReminderDailyAgendaTimeInput.disabled = !remindersEnabled || !notificationsReminderDailyAgendaEnabledInput.checked;
    notificationsReminderQuietHoursStartInput.disabled = !remindersEnabled || !notificationsReminderQuietHoursEnabledInput.checked;
    notificationsReminderQuietHoursEndInput.disabled = !remindersEnabled || !notificationsReminderQuietHoursEnabledInput.checked;
  }

  function readNotificationsDraft() {
    const current = normalizeNotifications(getStore().notifications).email;
    const currentTimezone = normalizeNotificationTimezone(
      current.summaries.timezone,
      typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined
    );
    return {
      recipientEmail: normalizeRecipientEmail(
        notificationsRecipientEmailInput?.value
        || current.recipientEmail
        || authState.user?.email
        || ""
      ),
      summaries: normalizeEmailSummaryConfig({
        enabled: notificationsSummaryEnabledInput.checked,
        frequency: notificationsFrequencyInput.value,
        sendTime: normalizeNotificationTime(notificationsSendTimeInput.value, current.summaries.sendTime),
        weekday: normalizeWeekday(notificationsWeekdayInput.value, current.summaries.weekday),
        timezone: currentTimezone,
        include: {
          overdue: notificationsIncludeOverdueInput.checked,
          dueSoon: notificationsIncludeDueSoonInput.checked,
          completed: notificationsIncludeCompletedInput.checked,
          recurringProgress: notificationsIncludeRecurringProgressInput.checked,
          treePoints: notificationsIncludeTreePointsInput.checked,
          widgetHighlights: notificationsIncludeWidgetHighlightsInput.checked
        },
        updatedAt: current.summaries.updatedAt
      }),
      reminders: normalizeEmailReminderConfig({
        enabled: notificationsRemindersEnabledInput.checked,
        dueSoonEnabled: notificationsReminderDueSoonEnabledInput.checked,
        overdueEnabled: notificationsReminderOverdueEnabledInput.checked,
        dailyAgendaEnabled: notificationsReminderDailyAgendaEnabledInput.checked,
        dailyAgendaTime: normalizeNotificationTime(notificationsReminderDailyAgendaTimeInput.value, current.reminders.dailyAgendaTime),
        quietHoursEnabled: notificationsReminderQuietHoursEnabledInput.checked,
        quietHoursStart: normalizeNotificationTime(notificationsReminderQuietHoursStartInput.value, current.reminders.quietHoursStart),
        quietHoursEnd: normalizeNotificationTime(notificationsReminderQuietHoursEndInput.value, current.reminders.quietHoursEnd),
        updatedAt: current.reminders.updatedAt
      }),
      history: current.history,
      updatedAt: current.updatedAt
    };
  }

  function persistNotificationsDraft(draft, { history = draft.history, updatedAt = Date.now() } = {}) {
    const store = getStore();
    store.notifications = normalizeNotifications({
      ...store.notifications,
      email: {
        ...normalizeNotifications(store.notifications).email,
        recipientEmail: normalizeRecipientEmail(draft.recipientEmail || authState.user?.email || ""),
        summaries: normalizeEmailSummaryConfig({
          ...draft.summaries,
          updatedAt
        }),
        reminders: normalizeEmailReminderConfig({
          ...draft.reminders,
          updatedAt
        }),
        history,
        updatedAt
      }
    });
    persistStore();
    renderNotificationsIfOpen();
  }

  function persistGoogleCalendarState(nextGoogleCalendar, updatedAt = Date.now()) {
    const store = getStore();
    const currentIntegrations = normalizeIntegrations(store.integrations);
    store.integrations = normalizeIntegrations({
      ...currentIntegrations,
      googleCalendar: normalizeGoogleCalendarIntegration({
        ...currentIntegrations.googleCalendar,
        ...nextGoogleCalendar,
        updatedAt
      })
    });
    persistStore({ touchUserUpdatedAt: false });
  }

  function buildSummarySendDraft(baseDraft, { frequencyOverride = "" } = {}) {
    return {
      ...baseDraft,
      summaries: normalizeEmailSummaryConfig({
        ...baseDraft.summaries,
        frequency: frequencyOverride || baseDraft.summaries.frequency,
        updatedAt: baseDraft.summaries.updatedAt
      })
    };
  }

  async function sendNotificationEmailDraft({
    kind = "summary",
    draft = readNotificationsDraft(),
    buildPreview,
    renderHtml,
    renderText,
    endpoint,
    requireContent = false,
    successMessage = "",
    missingRecipientMessage = "",
    missingAuthMessage = "",
    failurePrefix = "Notification send failed",
    historyEntry = () => ({})
  } = {}) {
    const kindLabel = kind ? `${kind.charAt(0).toUpperCase()}${kind.slice(1)}` : "Notification";
    if (!draft.recipientEmail) {
      setSyncStatus(missingRecipientMessage, "error");
      return { success: false };
    }

    if (!authState.authenticated) {
      const authenticated = await refreshAuthStatus({ suppressUnavailableError: false });
      if (!authenticated) {
        setSyncStatus(missingAuthMessage, "error");
        renderNotificationsIfOpen();
        return { success: false };
      }
    }

    const now = new Date();
    const preview = buildPreview(now);
    if (!preview.recipientEmail) {
      setSyncStatus(missingRecipientMessage, "error");
      return { success: false };
    }
    if (requireContent && preview.sections.length === 0) {
      setSyncStatus("No matching notification items are due right now.", "info");
      return { success: false };
    }

    const requestBody = {
      recipientEmail: preview.recipientEmail,
      subject: preview.subject,
      html: renderHtml(preview),
      text: renderText(preview)
    };

    setNotificationSendInFlight(true, kind);
    try {
      const response = await fetch(`${apiBase}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: fetchCredentials,
        body: JSON.stringify(requestBody)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || `${kindLabel} send failed`);
      }

      const history = appendNotificationHistoryEntry(
        normalizeNotifications(getStore().notifications).email.history,
        {
          id: createId(),
          at: typeof payload.sentAt === "number" ? payload.sentAt : Date.now(),
          status: "sent",
          kind,
          recipientEmail: preview.recipientEmail,
          subject: preview.subject,
          ...historyEntry(preview, now)
        }
      );
      persistNotificationsDraft({ ...draft, history }, {
        history,
        updatedAt: Date.now()
      });
      await saveCurrentStoreToDrive({ quiet: true, force: true, mode: "manual" });
      setSyncStatus(successMessage || `Sent ${kind} email to ${preview.recipientEmail}.`, "success");
      return { success: true, preview, history };
    } catch (error) {
      const message = String(error?.message || `${kindLabel} send failed`);
      const history = appendNotificationHistoryEntry(
        normalizeNotifications(getStore().notifications).email.history,
        {
          id: createId(),
          at: Date.now(),
          status: "error",
          kind,
          recipientEmail: preview.recipientEmail,
          subject: preview.subject,
          ...historyEntry(preview, now)
        }
      );
      persistNotificationsDraft({ ...draft, history }, {
        history,
        updatedAt: Date.now()
      });
      if (message.includes("insufficientPermissions")) {
        setSyncStatus("Reconnect Google and grant Gmail send access, then try sending the notification again.", "error");
      } else if (message === "Not authenticated") {
        setSyncStatus(missingAuthMessage, "error");
      } else {
        setSyncStatus(`${failurePrefix}: ${message}`, "error");
      }
      return { success: false, error: message };
    } finally {
      setNotificationSendInFlight(false, "");
    }
  }

  async function sendNotificationSummaryDraft({
    draft = readNotificationsDraft(),
    frequencyOverride = "",
    successMessage = "",
    failurePrefix = "Summary send failed"
  } = {}) {
    const sendDraft = buildSummarySendDraft(draft, { frequencyOverride });
    return sendNotificationEmailDraft({
      kind: "summary",
      draft: sendDraft,
      endpoint: "/api/notifications/send-summary",
      requireContent: false,
      successMessage: successMessage || `Sent summary to ${sendDraft.recipientEmail}.`,
      missingRecipientMessage: "Choose a recipient email before sending a summary.",
      missingAuthMessage: "Connect Google first to send email summaries.",
      failurePrefix,
      buildPreview: (now) => buildEmailSummaryPreview({
        store: getStore(),
        emailConfig: sendDraft,
        now,
        fallbackRecipientEmail: authState.user?.email || ""
      }),
      renderHtml: renderEmailSummaryBodyHtml,
      renderText: renderEmailSummaryBodyText,
      historyEntry: (_preview, now) => ({
        summaryKey: buildEmailSummaryKey(sendDraft.summaries, now)
      })
    });
  }

  function handleNotificationsFormChange() {
    syncNotificationsInputs();
    renderNotificationsIfOpen();
  }

  function handleNotificationsSubmit(event) {
    event.preventDefault();
    const current = normalizeNotifications(getStore().notifications).email;
    const currentTimezone = normalizeNotificationTimezone(
      current.summaries.timezone,
      typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined
    );
    const nextRecipientEmail = normalizeRecipientEmail(
      notificationsRecipientEmailInput.value
      || current.recipientEmail
      || authState.user?.email
      || ""
    );
    const comparableSummaries = normalizeEmailSummaryConfig({
      enabled: notificationsSummaryEnabledInput.checked,
      frequency: notificationsFrequencyInput.value,
      sendTime: normalizeNotificationTime(notificationsSendTimeInput.value, current.summaries.sendTime),
      weekday: normalizeWeekday(notificationsWeekdayInput.value, current.summaries.weekday),
      timezone: currentTimezone,
      include: {
        overdue: notificationsIncludeOverdueInput.checked,
        dueSoon: notificationsIncludeDueSoonInput.checked,
        completed: notificationsIncludeCompletedInput.checked,
        recurringProgress: notificationsIncludeRecurringProgressInput.checked,
        treePoints: notificationsIncludeTreePointsInput.checked,
        widgetHighlights: notificationsIncludeWidgetHighlightsInput.checked
      },
      updatedAt: current.summaries.updatedAt
    });
    const nextSummaries = normalizeEmailSummaryConfig({
      ...comparableSummaries,
      updatedAt: Date.now()
    });
    const comparableReminders = normalizeEmailReminderConfig({
      enabled: notificationsRemindersEnabledInput.checked,
      dueSoonEnabled: notificationsReminderDueSoonEnabledInput.checked,
      overdueEnabled: notificationsReminderOverdueEnabledInput.checked,
      dailyAgendaEnabled: notificationsReminderDailyAgendaEnabledInput.checked,
      dailyAgendaTime: normalizeNotificationTime(notificationsReminderDailyAgendaTimeInput.value, current.reminders.dailyAgendaTime),
      quietHoursEnabled: notificationsReminderQuietHoursEnabledInput.checked,
      quietHoursStart: normalizeNotificationTime(notificationsReminderQuietHoursStartInput.value, current.reminders.quietHoursStart),
      quietHoursEnd: normalizeNotificationTime(notificationsReminderQuietHoursEndInput.value, current.reminders.quietHoursEnd),
      updatedAt: current.reminders.updatedAt
    });
    const nextReminders = normalizeEmailReminderConfig({
      ...comparableReminders,
      updatedAt: Date.now()
    });

    if ((nextSummaries.enabled || nextReminders.enabled) && !nextRecipientEmail) {
      setSyncStatus("Choose a recipient email before enabling email notifications.", "error");
      return;
    }

    const unchanged = (
      nextRecipientEmail === current.recipientEmail
      && JSON.stringify(comparableSummaries) === JSON.stringify(current.summaries)
      && JSON.stringify(comparableReminders) === JSON.stringify(current.reminders)
    );
    if (unchanged) {
      closeNotifications();
      return;
    }

    persistNotificationsDraft({
      recipientEmail: nextRecipientEmail,
      summaries: nextSummaries,
      reminders: nextReminders,
      history: current.history,
      updatedAt: current.updatedAt
    }, {
      history: current.history,
      updatedAt: Date.now()
    });
    closeNotifications();
    setSyncStatus(nextSummaries.enabled || nextReminders.enabled ? "Saved email notification settings." : "Saved notification settings.", "info");
  }

  function renderNotificationsIfOpen() {
    if (!isNotificationsOpen()) {
      return;
    }

    const draft = readNotificationsDraft();
    const summaryPreview = buildEmailSummaryPreview({
      store: getStore(),
      emailConfig: draft,
      now: new Date(),
      fallbackRecipientEmail: authState.user?.email || ""
    });
    const reminderTemplates = buildEmailReminderTemplates({
      store: getStore(),
      emailConfig: draft,
      now: new Date(),
      fallbackRecipientEmail: authState.user?.email || ""
    });
    notificationsPreview.innerHTML = renderNotificationsPreview(summaryPreview, reminderTemplates, { escapeHtml });
    notificationsHistory.innerHTML = renderNotificationHistory(draft.history, { escapeHtml, formatDateTime });
    syncNotificationActionState(draft);
  }

  function syncNotificationActionState(draft = null) {
    const nextDraft = draft || readNotificationsDraft();
    const reminderTemplates = buildEmailReminderTemplates({
      store: getStore(),
      emailConfig: nextDraft,
      now: new Date(),
      fallbackRecipientEmail: authState.user?.email || ""
    });
    const canSendBase = Boolean(authState.authenticated && nextDraft.recipientEmail && !notificationSendState.inFlight);
    sendNotificationSummaryButton.disabled = !canSendBase;
    sendNotificationSummaryButton.textContent = notificationSendState.inFlight && notificationSendState.kind === "summary"
      ? "Sending…"
      : "Send summary now";
    sendNotificationSummaryButton.title = !authState.authenticated
      ? "Connect Google to send summaries from the authenticated Gmail account."
      : !nextDraft.recipientEmail
        ? "Choose a recipient email before sending a summary."
        : "";
    sendNotificationReminderButton.disabled = !canSendBase || reminderTemplates.length === 0;
    sendNotificationReminderButton.textContent = notificationSendState.inFlight && notificationSendState.kind === "reminder"
      ? "Sending…"
      : "Send reminders now";
    sendNotificationReminderButton.title = !authState.authenticated
      ? "Connect Google to send reminders from the authenticated Gmail account."
      : !nextDraft.recipientEmail
        ? "Choose a recipient email before sending reminders."
        : reminderTemplates.length === 0
          ? "No reminder emails are due right now."
          : "";
  }

  function setNotificationSendInFlight(inFlight, kind = "") {
    notificationSendState.inFlight = Boolean(inFlight);
    notificationSendState.kind = inFlight ? kind : "";
    syncNotificationActionState();
    if (isDeveloperUser()) {
      renderDeveloperPanel();
    }
  }

  async function handleSendNotificationSummary() {
    await sendNotificationSummaryDraft({
      draft: readNotificationsDraft(),
      successMessage: "",
      failurePrefix: "Summary send failed"
    });
  }

  async function sendNotificationReminderDraft({
    draft = readNotificationsDraft(),
    includeKinds = null,
    requireDailyAgendaTime = false,
    successMessage = "",
    failurePrefix = "Reminder send failed"
  } = {}) {
    if (!draft.recipientEmail) {
      setSyncStatus("Choose a recipient email before sending reminders.", "error");
      return { success: false };
    }

    if (!authState.authenticated) {
      const authenticated = await refreshAuthStatus({ suppressUnavailableError: false });
      if (!authenticated) {
        setSyncStatus("Connect Google first to send email reminders.", "error");
        renderNotificationsIfOpen();
        return { success: false };
      }
    }

    const now = new Date();
    const reminderTemplates = buildEmailReminderTemplates({
      store: getStore(),
      emailConfig: draft,
      now,
      fallbackRecipientEmail: authState.user?.email || "",
      includeKinds,
      requireDailyAgendaTime
    });
    if (reminderTemplates.length === 0) {
      setSyncStatus("No matching reminder emails are due right now.", "info");
      return { success: false };
    }

    setNotificationSendInFlight(true, "reminder");
    let history = normalizeNotifications(getStore().notifications).email.history;
    let sentCount = 0;
    try {
      for (const preview of reminderTemplates) {
        const response = await fetch(`${apiBase}/api/notifications/send-reminder`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          credentials: fetchCredentials,
          body: JSON.stringify({
            recipientEmail: preview.recipientEmail,
            subject: preview.subject,
            html: renderEmailReminderBodyHtml(preview),
            text: renderEmailReminderBodyText(preview)
          })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || "Reminder send failed");
        }
        history = appendNotificationHistoryEntry(history, {
          id: createId(),
          at: typeof payload.sentAt === "number" ? payload.sentAt : Date.now(),
          status: "sent",
          kind: "reminder",
          reminderTemplateKind: preview.templateKind || "",
          recipientEmail: preview.recipientEmail,
          subject: preview.subject,
          reminderKey: preview.reminderKey || "",
          reminderEventKeys: Array.isArray(preview.eventKeys) ? preview.eventKeys : []
        });
        sentCount += 1;
      }

      persistNotificationsDraft({ ...draft, history }, {
        history,
        updatedAt: Date.now()
      });
      await saveCurrentStoreToDrive({ quiet: true, force: true, mode: "manual" });
      setSyncStatus(successMessage || `Sent ${sentCount} reminder email${sentCount === 1 ? "" : "s"} to ${draft.recipientEmail}.`, "success");
      return { success: true, history, count: sentCount };
    } catch (error) {
      const message = String(error?.message || "Reminder send failed");
      if (message.includes("insufficientPermissions")) {
        setSyncStatus("Reconnect Google and grant Gmail send access, then try sending the notification again.", "error");
      } else if (message === "Not authenticated") {
        setSyncStatus("Connect Google first to send email reminders.", "error");
      } else {
        setSyncStatus(`${failurePrefix}: ${message}`, "error");
      }
      return { success: false, error: message };
    } finally {
      setNotificationSendInFlight(false, "");
    }
  }

  async function handleSendNotificationReminder() {
    await sendNotificationReminderDraft({
      draft: readNotificationsDraft(),
      successMessage: "",
      failurePrefix: "Reminder send failed"
    });
  }

  async function handleGoogleDisconnect() {
    await disconnectGoogle();
    autosave.clearSavedBaseline();
    autosave.refreshSchedule();
    clearRemoteStoreState();
    renderSyncMeta();
  }

  function applyDriveLoadObservation(result) {
    if (result?.found) {
      observeRemoteStoreState({
        updatedAt: result.remoteUpdatedAt,
        fingerprint: result.remoteFingerprint,
        savedAt: result.remoteSavedAt,
        userUpdatedAt: result.remoteUserUpdatedAt,
        userFingerprint: result.remoteUserFingerprint
      });
      if (result.applied || result.synced) {
        setRemoteComparisonBase({
          userUpdatedAt: result.remoteUserUpdatedAt,
          userFingerprint: result.remoteUserFingerprint
        });
        announceRemoteStoreState();
      } else if (result.keptLocalChanges) {
        remoteDriftState.remoteChangedSinceBase = Boolean(
          result.remoteUserFingerprint
          && result.remoteUserFingerprint !== getCurrentUserFingerprint()
        );
      }
    } else if (result && result.found === false) {
      clearRemoteStoreState();
    }
    autosave.refreshSchedule();
    if (result?.applied && result.synced) {
      autosave.markCurrentAsSaved();
    }
    renderSyncMeta();
  }

  async function handleManualLoadFromDrive() {
    const result = await loadFromDrive();
    applyDriveLoadObservation(result);
  }

  async function handleManualSaveToDrive() {
    await saveCurrentStoreToDrive({ quiet: false, force: false, mode: "manual" });
  }

  async function ensureGoogleCalendarReady({
    showSuccessStatus = true,
    missingAuthMessage = "Connect Google first to sync Lifetree with Google."
  } = {}) {
    if (!authState.authenticated) {
      const authenticated = await refreshAuthStatus({ suppressUnavailableError: false });
      if (!authenticated) {
        setSyncStatus(missingAuthMessage, "error");
        return { ok: false, error: "Not authenticated" };
      }
    }

    const current = normalizeIntegrations(getStore().integrations).googleCalendar;
    const currentUserTimeZone = typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || ""
      : "";
    try {
      const response = await fetch(`${apiBase}/api/google-calendar/bootstrap`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: fetchCredentials,
        body: JSON.stringify({
          summary: current.calendarSummary || "Lifetree",
          timeZone: currentUserTimeZone
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Calendar bootstrap failed");
      }

      const now = Date.now();
      persistGoogleCalendarState({
        connected: true,
        calendarId: payload.calendarId || "",
        calendarSummary: payload.calendarSummary || current.calendarSummary || "Lifetree",
        calendarTimeZone: payload.calendarTimeZone || "",
        lastCalendarSyncAt: now,
        lastCalendarSyncStatus: "success",
        lastCalendarSyncMessage: payload.created
          ? "Created the dedicated Lifetree calendar."
          : "Found the existing Lifetree calendar.",
        lastCalendarSyncToken: current.lastCalendarSyncToken || ""
      }, now);
      renderSyncMeta();
      if (showSuccessStatus) {
        setSyncStatus(
          payload.created
            ? `Created the ${payload.calendarSummary || "Lifetree"} Google Calendar.`
            : payload.updated
              ? `Updated the ${payload.calendarSummary || "Lifetree"} Google Calendar to ${payload.calendarTimeZone || currentUserTimeZone || "your current timezone"}.`
            : `Linked the existing ${payload.calendarSummary || "Lifetree"} Google Calendar.`,
          "success"
        );
      }
      return {
        ok: true,
        calendarId: payload.calendarId || "",
        calendarSummary: payload.calendarSummary || current.calendarSummary || "Lifetree",
        calendarTimeZone: payload.calendarTimeZone || "",
        created: payload.created === true,
        updated: payload.updated === true
      };
    } catch (error) {
      const message = String(error?.message || "Calendar bootstrap failed");
      const now = Date.now();
      persistGoogleCalendarState({
        lastCalendarSyncAt: now,
        lastCalendarSyncStatus: "error",
        lastCalendarSyncMessage: message
      }, now);
      renderSyncMeta();
      if (message.includes("insufficientPermissions") || message.includes("insufficient_scope")) {
        setSyncStatus("Reconnect Google and grant Calendar access, then run Google sync again.", "error");
      } else if (message === "Not authenticated") {
        setSyncStatus(missingAuthMessage, "error");
      } else {
        setSyncStatus(`Lifetree calendar setup failed: ${message}`, "error");
      }
      return { ok: false, error: message };
    }
  }

  async function handleEnsureGoogleCalendar() {
    try {
      await ensureGoogleCalendarReady({
        showSuccessStatus: true,
        missingAuthMessage: "Connect Google first to sync Lifetree with Google."
      });
    } finally {
      updateGoogleButtons();
    }
  }

  function setGoogleSyncInFlight(inFlight, phase = "") {
    googleSyncState.inFlight = Boolean(inFlight);
    googleSyncState.phase = googleSyncState.inFlight ? phase : "";
    updateGoogleButtons();
  }

  async function reconcileDriveBeforeGoogleSync() {
    const localStore = getStore();
    const localUserUpdatedAt = localStore.userUpdatedAt || localStore.updatedAt || 0;
    const localUserFingerprint = getCurrentUserFingerprint();
    const remoteResult = await peekRemoteStore({ suppressAuthError: false });

    if (!remoteResult?.ok) {
      if (remoteResult?.error) {
        setSyncStatus(`Google sync could not check Drive: ${remoteResult.error}`, "error");
      }
      return { ok: false };
    }

    if (!remoteResult.found) {
      clearRemoteStoreState();
      autosave.refreshSchedule();
      renderSyncMeta();
      return { ok: true, lead: "" };
    }

    observeRemoteStoreState({
      updatedAt: remoteResult.remoteUpdatedAt,
      fingerprint: remoteResult.remoteFingerprint,
      savedAt: remoteResult.remoteSavedAt,
      userUpdatedAt: remoteResult.remoteUserUpdatedAt,
      userFingerprint: remoteResult.remoteUserFingerprint
    });
    renderSyncMeta();

    const remoteUserUpdatedAt = remoteResult.remoteUserUpdatedAt || 0;
    const remoteUserFingerprint = remoteResult.remoteUserFingerprint || "";
    if (remoteUserFingerprint && remoteUserFingerprint === localUserFingerprint) {
      setRemoteComparisonBase({
        userUpdatedAt: remoteUserUpdatedAt,
        userFingerprint: remoteUserFingerprint
      });
      announceRemoteStoreState();
      return { ok: true, lead: "" };
    }

    if (localUserUpdatedAt > remoteUserUpdatedAt) {
      const saveResult = await saveCurrentStoreToDrive({
        quiet: false,
        force: false,
        mode: "google-sync"
      });
      if (saveResult?.cancelled) {
        setSyncStatus("Google sync cancelled. Local changes were not sent to Drive.", "info");
        return { ok: false, cancelled: true };
      }
      if (!saveResult?.success) {
        return { ok: false };
      }
      return {
        ok: true,
        lead: saveResult.skipped ? "" : "Saved newer local Drive changes first. "
      };
    }

    const loadResult = await loadFromDrive({
      conflictStrategy: "remote"
    });
    applyDriveLoadObservation(loadResult);
    if (loadResult?.cancelled) {
      return { ok: false, cancelled: true };
    }
    if (!loadResult?.found || (!loadResult?.applied && !loadResult?.synced)) {
      return { ok: false };
    }
    return {
      ok: true,
      lead: loadResult.applied ? "Loaded newer Drive changes first. " : ""
    };
  }

  async function syncGoogleCalendarScheduleOnly({ lead = "" } = {}) {
    const googleCalendar = normalizeIntegrations(getStore().integrations).googleCalendar;
    if (!googleCalendar.calendarId) {
      setSyncStatus("Google sync could not find the dedicated Lifetree calendar.", "error");
      return { ok: false, mirroredToDrive: false, upToDate: false };
    }

    const currentUserTimeZone = typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || ""
      : "";
    const syncRequest = buildGoogleCalendarScheduleSyncRequest(getStore(), googleCalendar, {
      userTimeZone: currentUserTimeZone
    });
    if (syncRequest.tasks.length === 0 && (!Array.isArray(syncRequest.pendingDeletions) || syncRequest.pendingDeletions.length === 0)) {
      const now = Date.now();
      const message = syncRequest.totalEligibleTasks > 0
        ? "The Lifetree calendar schedule is already up to date."
        : "No scheduled Lifetree tasks are ready for calendar sync.";
      persistGoogleCalendarState({
        lastCalendarSyncAt: now,
        lastCalendarSyncStatus: "success",
        lastCalendarSyncMessage: message
      }, now);
      renderSyncMeta();
      setSyncStatus(`${lead}${message}`, "info");
      return { ok: true, mirroredToDrive: false, upToDate: true };
    }

    try {
      const response = await fetch(`${apiBase}/api/google-calendar/sync-schedule`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: fetchCredentials,
        body: JSON.stringify(syncRequest)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Calendar schedule sync failed");
      }

      const now = Date.now();
      const results = Array.isArray(payload.tasks) ? payload.tasks : [];
      const byTaskId = new Map(results
        .filter((entry) => entry && typeof entry.taskId === "string" && entry.taskId)
        .map((entry) => [entry.taskId, entry]));
      const nextCalendarSummary = payload.calendarSummary || googleCalendar.calendarSummary || "Lifetree";
      const nextCalendarTimeZone = payload.calendarTimeZone || googleCalendar.calendarTimeZone || "";
      const processedDeletionIds = new Set(
        Array.isArray(payload.processedDeletionIds)
          ? payload.processedDeletionIds.filter((value) => typeof value === "string" && value)
          : []
      );
      const pendingDeletions = Array.isArray(googleCalendar.pendingDeletions)
        ? googleCalendar.pendingDeletions
        : [];
      const remainingPendingDeletions = pendingDeletions.filter((entry) => !processedDeletionIds.has(entry?.id));

      const store = getStore();
      let appliedCount = 0;
      let checkedCount = 0;
      let pulledCount = 0;
      let pushedCount = 0;
      let statusMirroredCount = 0;
      let instanceOverrideAppliedCount = 0;
      let relinkedCount = 0;
      let duplicateDeletedCount = 0;
      let remoteDeletedCount = 0;
      let recreatedAfterRemoteDeleteCount = 0;
      for (const task of [...store.tasks]) {
        const result = byTaskId.get(task.id);
        if (!result || result.ok !== true) {
          continue;
        }
        if (result.direction === "remote-delete") {
          const outcome = applyRemoteDeletedGoogleCalendarTask(store, task.id, {
            now,
            addDeletionMarker
          });
          if (outcome.changed) {
            remoteDeletedCount += 1;
          }
          if (result.relinked === true) {
            relinkedCount += 1;
          }
          if (typeof result.duplicateDeletedCount === "number" && result.duplicateDeletedCount > 0) {
            duplicateDeletedCount += result.duplicateDeletedCount;
          }
          appliedCount += 1;
          continue;
        }
        const currentLink = normalizeGoogleCalendarTaskLink(task.googleCalendar, {
          calendarId: googleCalendar.calendarId
        });
        task.googleCalendar = normalizeGoogleCalendarTaskLink({
          calendarId: result.calendarId || googleCalendar.calendarId,
          eventId: result.eventId || "",
          recurringEventId: result.recurringEventId || "",
          originalStartDate: typeof result.originalStartDate === "string" ? result.originalStartDate : currentLink.originalStartDate,
          originalTimeOfDay: typeof result.originalTimeOfDay === "string" ? result.originalTimeOfDay : currentLink.originalTimeOfDay,
          source: "lifetree",
          linkedAt: typeof result.linkedAt === "number" ? result.linkedAt : now,
          lastSeenGoogleUpdatedAt: typeof result.lastSeenGoogleUpdatedAt === "string" ? result.lastSeenGoogleUpdatedAt : "",
          scheduleFingerprint: typeof result.scheduleFingerprint === "string" ? result.scheduleFingerprint : "",
          statusMirroredAt: typeof result.statusMirroredAt === "number"
            ? result.statusMirroredAt
            : (typeof currentLink.statusMirroredAt === "number" ? currentLink.statusMirroredAt : 0),
          schemaVersion: 1
        }, {
          calendarId: result.calendarId || googleCalendar.calendarId
        });
        if (result.direction === "pull" && result.schedulePatch && typeof result.schedulePatch === "object") {
          const nextTask = normalizeTask({
            ...task,
            name: typeof result.schedulePatch.name === "string" ? result.schedulePatch.name : task.name,
            details: typeof result.schedulePatch.details === "string" ? result.schedulePatch.details : task.details,
            startDate: typeof result.schedulePatch.startDate === "string" ? result.schedulePatch.startDate : task.startDate,
            dueDate: typeof result.schedulePatch.dueDate === "string" ? result.schedulePatch.dueDate : task.dueDate,
            timeOfDay: typeof result.schedulePatch.timeOfDay === "string" ? result.schedulePatch.timeOfDay : task.timeOfDay,
            recurrence: result.schedulePatch.recurrence || task.recurrence,
            reminders: {
              ...(task.reminders && typeof task.reminders === "object" ? task.reminders : {}),
              ...(result.schedulePatch.reminders && typeof result.schedulePatch.reminders === "object" ? result.schedulePatch.reminders : {})
            },
            widgetTaskMeta: {
              ...(task.widgetTaskMeta && typeof task.widgetTaskMeta === "object" ? task.widgetTaskMeta : {}),
              ...(result.schedulePatch.widgetTaskMeta && typeof result.schedulePatch.widgetTaskMeta === "object" ? result.schedulePatch.widgetTaskMeta : {})
            },
            googleCalendar: task.googleCalendar,
            updatedAt: now
          });
          Object.assign(task, nextTask);
          pulledCount += 1;
        } else {
          if (result.direction === "push" || result.direction === "create") {
            task.updatedAt = now;
            pushedCount += 1;
          } else if (result.direction === "status") {
            task.updatedAt = now;
            statusMirroredCount += 1;
          } else if (result.direction === "noop") {
            const appliedInstanceStatuses = applyRecurringInstanceStatusResults(store, task, result, result.calendarId || googleCalendar.calendarId, now);
            if (appliedInstanceStatuses > 0) {
              statusMirroredCount += appliedInstanceStatuses;
            } else {
              checkedCount += 1;
            }
          }
        }
        if (result.direction !== "noop") {
          const appliedInstanceStatuses = applyRecurringInstanceStatusResults(store, task, result, result.calendarId || googleCalendar.calendarId, now);
          if (appliedInstanceStatuses > 0) {
            statusMirroredCount += appliedInstanceStatuses;
          }
        }
        const appliedOverrides = applyRecurringInstanceOverrides(store, task, result, result.calendarId || googleCalendar.calendarId, now);
        if (appliedOverrides > 0) {
          instanceOverrideAppliedCount += appliedOverrides;
        }
        if (result.relinked === true) {
          relinkedCount += 1;
        }
        if (result.recreatedAfterRemoteDelete === true) {
          recreatedAfterRemoteDeleteCount += 1;
        }
        if (typeof result.duplicateDeletedCount === "number" && result.duplicateDeletedCount > 0) {
          duplicateDeletedCount += result.duplicateDeletedCount;
        }
        appliedCount += 1;
      }
      const localTaskChangeCount = pulledCount + pushedCount + statusMirroredCount + instanceOverrideAppliedCount + relinkedCount + remoteDeletedCount;
      if (localTaskChangeCount > 0) {
        persistStore();
        renderAll();
      }

      const errorCount = results.filter((entry) => entry?.ok === false).length;
      const deletionErrorCount = Array.isArray(payload.deletionResults)
        ? payload.deletionResults.filter((entry) => entry?.ok === false).length
        : 0;
      const orphanDeletionErrorCount = Array.isArray(payload.orphanDeletionResults)
        ? payload.orphanDeletionResults.filter((entry) => entry?.ok === false).length
        : 0;
      const processedDeletionCount = typeof payload.processedDeletionCount === "number" ? payload.processedDeletionCount : 0;
      const deletedEventCount = typeof payload.deletedCount === "number" ? payload.deletedCount : 0;
      const orphanDeletedCount = typeof payload.orphanDeletedCount === "number" ? payload.orphanDeletedCount : 0;
      let mirroredToDrive = false;
      persistGoogleCalendarState({
        connected: true,
        calendarId: payload.calendarId || googleCalendar.calendarId,
        calendarSummary: nextCalendarSummary,
        calendarTimeZone: nextCalendarTimeZone,
        pendingDeletions: remainingPendingDeletions,
        lastCalendarSyncAt: now,
        lastCalendarSyncStatus: errorCount + deletionErrorCount + orphanDeletionErrorCount > 0 && appliedCount === 0 && processedDeletionCount === 0 && orphanDeletedCount === 0 ? "error" : "success",
        lastCalendarSyncMessage: errorCount + deletionErrorCount + orphanDeletionErrorCount > 0
          ? `Synced ${appliedCount} scheduled task${appliedCount === 1 ? "" : "s"}, applied ${remoteDeletedCount} remote deletion${remoteDeletedCount === 1 ? "" : "s"}, processed ${processedDeletionCount} requested calendar deletion${processedDeletionCount === 1 ? "" : "s"}, removed ${orphanDeletedCount} orphaned calendar event${orphanDeletedCount === 1 ? "" : "s"}, and hit ${errorCount + deletionErrorCount + orphanDeletionErrorCount} error${errorCount + deletionErrorCount + orphanDeletionErrorCount === 1 ? "" : "s"}.`
          : `Synced ${appliedCount} scheduled task${appliedCount === 1 ? "" : "s"}, applied ${remoteDeletedCount} remote deletion${remoteDeletedCount === 1 ? "" : "s"}, processed ${processedDeletionCount} requested calendar deletion${processedDeletionCount === 1 ? "" : "s"}, and removed ${orphanDeletedCount} orphaned calendar event${orphanDeletedCount === 1 ? "" : "s"} in Google Calendar.`
      }, now);
      if (
        errorCount + deletionErrorCount + orphanDeletionErrorCount === 0
        && !hasObservedRemoteDrift()
        && (localTaskChangeCount > 0 || processedDeletionCount > 0 || orphanDeletedCount > 0 || duplicateDeletedCount > 0)
      ) {
        const driveResult = await saveCurrentStoreToDrive({
          quiet: true,
          force: false,
          mode: "calendar-sync"
        });
        mirroredToDrive = driveResult?.success === true;
      }
      renderSyncMeta();
      const changedCount = pulledCount + pushedCount + statusMirroredCount + instanceOverrideAppliedCount + remoteDeletedCount;
      const verboseSummary = buildVerboseGoogleSyncSummary({
        lead,
        appliedCount,
        changedCount,
        pulledCount,
        pushedCount,
        statusMirroredCount,
        instanceOverrideAppliedCount,
        checkedCount,
        relinkedCount,
        remoteDeletedCount,
        recreatedAfterRemoteDeleteCount,
        processedDeletionCount,
        deletedEventCount,
        duplicateDeletedCount,
        orphanDeletedCount
      });
      if (errorCount + deletionErrorCount + orphanDeletionErrorCount > 0) {
        const firstError = results.find((entry) => entry?.ok === false)?.error
          || payload.deletionResults?.find((entry) => entry?.ok === false)?.error
          || payload.orphanDeletionResults?.find((entry) => entry?.ok === false)?.error
          || "Google sync hit one or more Google errors.";
        setSyncStatus(`${verboseSummary}, but ${errorCount + deletionErrorCount + orphanDeletionErrorCount} failed: ${firstError}`, "error");
      } else {
        const shouldShowVerboseSummary = isVerboseDriveSyncEnabled()
          || Boolean(lead)
          || changedCount > 0
          || processedDeletionCount > 0
          || deletedEventCount > 0
          || duplicateDeletedCount > 0
          || orphanDeletedCount > 0
          || relinkedCount > 0
          || recreatedAfterRemoteDeleteCount > 0
          || mirroredToDrive;
        setSyncStatus(
          shouldShowVerboseSummary
            ? `${verboseSummary} against ${nextCalendarSummary}.${mirroredToDrive ? " Mirrored the updated Google state to Drive." : " Drive state was unchanged."}`
            : buildCompactGoogleSyncSummary({
                appliedCount,
                nextCalendarSummary,
                mirroredToDrive
              }),
          "success"
        );
      }
      return {
        ok: errorCount + deletionErrorCount + orphanDeletionErrorCount === 0,
        mirroredToDrive,
        upToDate: false
      };
    } catch (error) {
      const message = String(error?.message || "Calendar schedule sync failed");
      const now = Date.now();
      persistGoogleCalendarState({
        lastCalendarSyncAt: now,
        lastCalendarSyncStatus: "error",
        lastCalendarSyncMessage: message
      }, now);
      renderSyncMeta();
      if (message.includes("insufficientPermissions") || message.includes("insufficient_scope")) {
        setSyncStatus("Reconnect Google and grant Calendar access, then sync Lifetree with Google again.", "error");
      } else if (message === "Not authenticated") {
        setSyncStatus("Connect Google first to sync Lifetree with Google.", "error");
      } else {
        setSyncStatus(`Google sync failed: ${message}`, "error");
      }
      return { ok: false, mirroredToDrive: false, upToDate: false };
    }
  }

  async function handleSyncGoogleCalendarSchedule() {
    if (!authState.authenticated) {
      const authenticated = await refreshAuthStatus({ suppressUnavailableError: false });
      if (!authenticated) {
        setSyncStatus("Connect Google first to sync Lifetree with Google.", "error");
        return;
      }
    }

    if (typeof finalizeStoreState === "function") {
      finalizeStoreState();
    }

    setGoogleSyncInFlight(true, "Syncing…");
    try {
      const driveResult = await reconcileDriveBeforeGoogleSync();
      if (!driveResult?.ok) {
        return;
      }

      const calendarResult = await ensureGoogleCalendarReady({
        showSuccessStatus: false,
        missingAuthMessage: "Connect Google first to sync Lifetree with Google."
      });
      if (!calendarResult?.ok) {
        return;
      }

      const scheduleResult = await syncGoogleCalendarScheduleOnly({
        lead: driveResult.lead || ""
      });
      if (!scheduleResult?.ok) {
        return;
      }

      const needsDriveSave = !hasObservedRemoteDrift() && (
        !syncState.remoteSavedAt
        || !syncState.remoteUserFingerprint
        || syncState.remoteUserFingerprint !== getCurrentUserFingerprint()
      );
      if (needsDriveSave) {
        const driveSaveResult = await saveCurrentStoreToDrive({
          quiet: true,
          force: false,
          mode: "google-sync"
        });
        if (
          scheduleResult.upToDate
          && driveSaveResult?.success
          && !driveSaveResult.skipped
        ) {
          setSyncStatus(`${driveResult.lead || ""}The Lifetree calendar schedule was already up to date, and the current Lifetree state was saved to Drive.`, "success");
        }
      }
    } finally {
      setGoogleSyncInFlight(false);
    }
  }

  function applyRecurringInstanceOverrides(store, templateTask, result, calendarId, now) {
    if (!templateTask || String(templateTask.recurrence?.type || "none") === "none") {
      return 0;
    }
    const overrides = Array.isArray(result?.instanceOverrides) ? result.instanceOverrides : [];
    let appliedCount = 0;
    for (const override of overrides) {
      const schedulePatch = override?.schedulePatch && typeof override.schedulePatch === "object"
        ? override.schedulePatch
        : null;
      const originalStartDate = typeof override?.originalStartDate === "string" ? override.originalStartDate : "";
      const originalTimeOfDay = typeof override?.originalTimeOfDay === "string" ? override.originalTimeOfDay : "";
      if (!schedulePatch || !originalStartDate) {
        continue;
      }
      const instanceTask = store.tasks.find((candidate) => (
        !candidate.archived
        && candidate.templateId === templateTask.id
        && (candidate.dueDate || candidate.startDate || "") === originalStartDate
        && (!originalTimeOfDay || (candidate.timeOfDay || "") === originalTimeOfDay)
      ));
      if (!instanceTask) {
        continue;
      }
      const currentLink = normalizeGoogleCalendarTaskLink(instanceTask.googleCalendar, {
        calendarId
      });
      const nextTask = normalizeTask({
        ...instanceTask,
        name: typeof schedulePatch.name === "string" ? schedulePatch.name : instanceTask.name,
        details: typeof schedulePatch.details === "string" ? schedulePatch.details : instanceTask.details,
        startDate: typeof schedulePatch.startDate === "string" ? schedulePatch.startDate : instanceTask.startDate,
        dueDate: typeof schedulePatch.dueDate === "string" ? schedulePatch.dueDate : instanceTask.dueDate,
        timeOfDay: typeof schedulePatch.timeOfDay === "string" ? schedulePatch.timeOfDay : instanceTask.timeOfDay,
        reminders: {
          ...(instanceTask.reminders && typeof instanceTask.reminders === "object" ? instanceTask.reminders : {}),
          ...(schedulePatch.reminders && typeof schedulePatch.reminders === "object" ? schedulePatch.reminders : {})
        },
        widgetTaskMeta: {
          ...(instanceTask.widgetTaskMeta && typeof instanceTask.widgetTaskMeta === "object" ? instanceTask.widgetTaskMeta : {}),
          ...(schedulePatch.widgetTaskMeta && typeof schedulePatch.widgetTaskMeta === "object" ? schedulePatch.widgetTaskMeta : {})
        },
        recurrence: instanceTask.recurrence,
        googleCalendar: {
          ...currentLink,
          calendarId,
          eventId: typeof override?.eventId === "string" ? override.eventId : (currentLink.eventId || ""),
          recurringEventId: typeof override?.recurringEventId === "string" ? override.recurringEventId : (currentLink.recurringEventId || ""),
          originalStartDate: originalStartDate || currentLink.originalStartDate || "",
          originalTimeOfDay: originalTimeOfDay || currentLink.originalTimeOfDay || "",
          source: "lifetree",
          linkedAt: currentLink.linkedAt || now,
          lastSeenGoogleUpdatedAt: typeof override?.updated === "string" ? override.updated : (currentLink.lastSeenGoogleUpdatedAt || ""),
          scheduleFingerprint: typeof schedulePatch.scheduleFingerprint === "string"
            ? schedulePatch.scheduleFingerprint
            : currentLink.scheduleFingerprint,
          statusMirroredAt: typeof currentLink.statusMirroredAt === "number" ? currentLink.statusMirroredAt : 0,
          schemaVersion: 1
        },
        updatedAt: now
      });
      Object.assign(instanceTask, nextTask);
      appliedCount += 1;
    }
    return appliedCount;
  }

  function applyRecurringInstanceStatusResults(store, templateTask, result, calendarId, now) {
    if (!templateTask || String(templateTask.recurrence?.type || "none") === "none") {
      return 0;
    }
    const statusResults = Array.isArray(result?.instanceStatusResults) ? result.instanceStatusResults : [];
    let appliedCount = 0;
    for (const statusResult of statusResults) {
      if (!statusResult || statusResult.ok !== true) {
        continue;
      }
      const sourceTaskId = typeof statusResult.sourceTaskId === "string" ? statusResult.sourceTaskId : "";
      const originalStartDate = typeof statusResult.originalStartDate === "string" ? statusResult.originalStartDate : "";
      const originalTimeOfDay = typeof statusResult.originalTimeOfDay === "string" ? statusResult.originalTimeOfDay : "";
      const instanceTask = store.tasks.find((candidate) => (
        !candidate.archived
        && candidate.templateId === templateTask.id
        && (
          (sourceTaskId && candidate.id === sourceTaskId)
          || (
            originalStartDate
            && (candidate.googleCalendar?.originalStartDate || candidate.startDate || candidate.dueDate || "") === originalStartDate
            && (!originalTimeOfDay || (candidate.googleCalendar?.originalTimeOfDay || candidate.timeOfDay || "") === originalTimeOfDay)
          )
        )
      ));
      if (!instanceTask) {
        continue;
      }
      const currentLink = normalizeGoogleCalendarTaskLink(instanceTask.googleCalendar, {
        calendarId
      });
      instanceTask.googleCalendar = normalizeGoogleCalendarTaskLink({
        ...currentLink,
        calendarId,
        eventId: typeof statusResult.eventId === "string" ? statusResult.eventId : currentLink.eventId,
        recurringEventId: typeof statusResult.recurringEventId === "string" ? statusResult.recurringEventId : currentLink.recurringEventId,
        originalStartDate: originalStartDate || currentLink.originalStartDate || "",
        originalTimeOfDay: originalTimeOfDay || currentLink.originalTimeOfDay || "",
        source: "lifetree",
        linkedAt: typeof statusResult.linkedAt === "number" ? statusResult.linkedAt : (currentLink.linkedAt || now),
        lastSeenGoogleUpdatedAt: typeof statusResult.lastSeenGoogleUpdatedAt === "string"
          ? statusResult.lastSeenGoogleUpdatedAt
          : (currentLink.lastSeenGoogleUpdatedAt || ""),
        scheduleFingerprint: typeof statusResult.scheduleFingerprint === "string"
          ? statusResult.scheduleFingerprint
          : currentLink.scheduleFingerprint,
        statusMirroredAt: typeof statusResult.statusMirroredAt === "number"
          ? statusResult.statusMirroredAt
          : (typeof currentLink.statusMirroredAt === "number" ? currentLink.statusMirroredAt : 0),
        schemaVersion: 1
      }, {
        calendarId
      });
      appliedCount += 1;
    }
    return appliedCount;
  }

  async function saveCurrentStoreToDrive({ quiet = false, force = false, mode = "manual" } = {}) {
    if (driveSaveState.inFlight) {
      return { success: false, skipped: true };
    }
    setDriveSaveInFlight(true, mode);
    try {
      const result = await saveToDrive({ quiet, force });
      if (result?.success) {
        observeRemoteStoreState({
          updatedAt: result.remoteUpdatedAt,
          fingerprint: result.remoteFingerprint,
          savedAt: result.remoteSavedAt,
          userUpdatedAt: result.remoteUserUpdatedAt,
          userFingerprint: result.remoteUserFingerprint
        });
        setRemoteComparisonBase({
          userUpdatedAt: result.remoteUserUpdatedAt,
          userFingerprint: result.remoteUserFingerprint
        });
        announceRemoteStoreState();
        autosave.markCurrentAsSaved();
      }
      return result;
    } finally {
      setDriveSaveInFlight(false);
      renderSyncMeta();
    }
  }

  function renderSyncMeta(now = new Date()) {
    const store = getStore();
    const localUpdatedAt = store.userUpdatedAt || 0;
    const googleCalendar = normalizeIntegrations(store.integrations).googleCalendar;
    const remoteSavedAt = syncState.remoteSavedAt || 0;
    const remoteUpdatedAt = syncState.remoteUserUpdatedAt || 0;
    const remoteFingerprint = syncState.remoteUserFingerprint || "";
    const localFingerprint = remoteFingerprint ? getCurrentUserFingerprint() : "";
    const profile = normalizeProfile(store.profile);
    const autosaveStatus = autosave.getStatus();

    let localState = "neutral";
    let driveState = "neutral";

    if (hasUnresolvedRemoteConflict()) {
      localState = "error";
      driveState = "error";
    } else if (remoteUpdatedAt > 0 || remoteFingerprint) {
      if (remoteFingerprint && localFingerprint && remoteFingerprint === localFingerprint) {
        localState = "success";
        driveState = "success";
      } else if (localUpdatedAt > remoteUpdatedAt) {
        localState = "success";
        driveState = "error";
      } else if (remoteUpdatedAt > localUpdatedAt) {
        localState = "error";
        driveState = "success";
      } else {
        localState = "error";
        driveState = "error";
      }
    }

    syncLocalCard.dataset.state = localState;
    syncDriveCard.dataset.state = driveState;
    syncLocalValue.textContent = localUpdatedAt ? formatDateTime(localUpdatedAt) : "No local edits yet";
    syncDriveValue.textContent = remoteSavedAt
      ? formatDateTime(remoteSavedAt)
      : remoteUpdatedAt
        ? formatDateTime(remoteUpdatedAt)
        : "No Drive save yet";

    let autosaveState = "neutral";
    let autosaveText = "Autosave off";
    if (driveSaveState.inFlight) {
      autosaveState = "info";
      autosaveText = driveSaveState.mode === "autosave" ? "Autosaving now…" : "Saving now…";
    } else if (!authState.authenticated) {
      autosaveText = profile.autosaveEnabled ? "Connect Google" : "Autosave off";
    } else if (!profile.autosaveEnabled) {
      autosaveText = "Autosave off";
    } else if (autosaveStatus.blockedReason === "stale-conflict") {
      autosaveState = "error";
      autosaveText = "Resolve conflict";
    } else if (autosaveStatus.blockedReason === "remote-stale") {
      autosaveState = "error";
      autosaveText = "Refresh needed";
    } else if (autosaveStatus.inFlight) {
      autosaveState = "info";
      autosaveText = "Saving now…";
    } else if (autosaveStatus.nextRunAt > 0) {
      autosaveState = "info";
      autosaveText = formatAutosaveCountdown(Math.max(0, autosaveStatus.nextRunAt - now.getTime()));
    } else {
      autosaveText = `Every ${profile.autosaveIntervalMinutes} min`;
    }

    syncAutosaveCard.dataset.state = autosaveState;
    syncAutosaveValue.textContent = autosaveText;

    let calendarState = "neutral";
    let calendarText = "Not set up";
    if (!authState.authenticated) {
      calendarText = "Connect Google";
    } else if (googleCalendar.calendarId) {
      calendarState = googleCalendar.lastCalendarSyncStatus === "error" ? "error" : "success";
      calendarText = `${googleCalendar.calendarSummary || "Lifetree"} ready`;
    } else if (googleCalendar.lastCalendarSyncStatus === "error") {
      calendarState = "error";
      calendarText = "Setup failed";
    } else if (googleCalendar.lastCalendarSyncAt > 0) {
      calendarState = "info";
      calendarText = "Checked";
    } else {
      calendarState = "info";
    }
    syncCalendarCard.dataset.state = calendarState;
    syncCalendarValue.textContent = calendarText;
  }

  function getCurrentStoreFingerprint() {
    const store = getStore();
    if (localFingerprintCache.storeRef !== store || localFingerprintCache.updatedAt !== (store.updatedAt || 0)) {
      localFingerprintCache.storeRef = store;
      localFingerprintCache.updatedAt = store.updatedAt || 0;
      localFingerprintCache.fingerprint = computeStoreFingerprint(store);
    }
    return localFingerprintCache.fingerprint;
  }

  function getCurrentUserFingerprint() {
    return computeUserContentFingerprint(getStore());
  }

  function observeRemoteStoreState({
    updatedAt = 0,
    fingerprint = "",
    savedAt = 0,
    userUpdatedAt = 0,
    userFingerprint = ""
  } = {}) {
    syncState.remoteUpdatedAt = updatedAt || 0;
    syncState.remoteFingerprint = fingerprint || "";
    syncState.remoteSavedAt = savedAt || 0;
    syncState.remoteUserUpdatedAt = userUpdatedAt || 0;
    syncState.remoteUserFingerprint = userFingerprint || "";
  }

  function setRemoteComparisonBase({
    userUpdatedAt = 0,
    userFingerprint = ""
  } = {}) {
    remoteDriftState.baseRemoteUserUpdatedAt = userUpdatedAt || 0;
    remoteDriftState.baseRemoteUserFingerprint = userFingerprint || "";
    remoteDriftState.remoteChangedSinceBase = false;
  }

  function announceRemoteStoreState() {
    broadcastSyncEvent("remote-state", {
      updatedAt: syncState.remoteUpdatedAt || 0,
      fingerprint: syncState.remoteFingerprint || "",
      savedAt: syncState.remoteSavedAt || 0,
      userUpdatedAt: syncState.remoteUserUpdatedAt || 0,
      userFingerprint: syncState.remoteUserFingerprint || ""
    });
  }

  function clearRemoteStoreState() {
    syncState.remoteUpdatedAt = 0;
    syncState.remoteFingerprint = "";
    syncState.remoteSavedAt = 0;
    syncState.remoteUserUpdatedAt = 0;
    syncState.remoteUserFingerprint = "";
    remoteDriftState.baseRemoteUserUpdatedAt = 0;
    remoteDriftState.baseRemoteUserFingerprint = "";
    remoteDriftState.remoteChangedSinceBase = false;
    remoteDriftState.lastCheckedAt = 0;
  }

  function isLocalDirtyComparedToRemoteBase() {
    const baseFingerprint = remoteDriftState.baseRemoteUserFingerprint || "";
    return Boolean(baseFingerprint) && getCurrentUserFingerprint() !== baseFingerprint;
  }

  function hasObservedRemoteDrift() {
    return remoteDriftState.remoteChangedSinceBase === true;
  }

  function hasUnresolvedRemoteConflict() {
    return hasObservedRemoteDrift() && isLocalDirtyComparedToRemoteBase();
  }

  function getAutosavePermission() {
    if (hasUnresolvedRemoteConflict()) {
      return {
        allowed: false,
        reason: "stale-conflict"
      };
    }
    if (hasObservedRemoteDrift()) {
      return {
        allowed: false,
        reason: "remote-stale"
      };
    }
    return {
      allowed: true,
      reason: ""
    };
  }

  async function checkForRemoteDrift({ reason = "manual", force = false } = {}) {
    if (!authState.authenticated || driveSaveState.inFlight || remoteDriftState.checkInFlight) {
      return null;
    }
    if (document.visibilityState === "hidden" && reason !== "online") {
      return null;
    }
    const now = Date.now();
    if (!force && (now - remoteDriftState.lastCheckedAt) < 30_000) {
      return null;
    }

    remoteDriftState.checkInFlight = true;
    remoteDriftState.lastCheckedAt = now;
    try {
      const result = await peekRemoteStore();
      if (!result?.ok) {
        return result;
      }
      if (!result.found) {
        clearRemoteStoreState();
        renderSyncMeta();
        return result;
      }

      const baseFingerprint = remoteDriftState.baseRemoteUserFingerprint || "";
      const observedFingerprint = result.remoteUserFingerprint || "";
      observeRemoteStoreState({
        updatedAt: result.remoteUpdatedAt,
        fingerprint: result.remoteFingerprint,
        savedAt: result.remoteSavedAt,
        userUpdatedAt: result.remoteUserUpdatedAt,
        userFingerprint: observedFingerprint
      });

      if (!baseFingerprint) {
        setRemoteComparisonBase({
          userUpdatedAt: result.remoteUserUpdatedAt,
          userFingerprint: observedFingerprint
        });
        renderSyncMeta();
        return result;
      }

      remoteDriftState.remoteChangedSinceBase = Boolean(observedFingerprint && observedFingerprint !== baseFingerprint);
      if (remoteDriftState.remoteChangedSinceBase) {
        setSyncStatus(
          hasUnresolvedRemoteConflict()
            ? "Google Drive changed in another session while this tab also has local edits. Run Google sync to resolve it before autosave runs again."
            : "Google Drive changed in another session. Run Google sync to refresh, or keep editing until you're ready to merge.",
          hasUnresolvedRemoteConflict() ? "error" : "info"
        );
      }
      renderSyncMeta();
      return result;
    } finally {
      remoteDriftState.checkInFlight = false;
    }
  }

  function initializeSyncChannel() {
    if (typeof window.BroadcastChannel !== "function" || syncChannelState.channel) {
      return;
    }
    try {
      const channel = new window.BroadcastChannel("lifetree-sync");
      channel.addEventListener("message", handleSyncChannelMessage);
      syncChannelState.channel = channel;
    } catch {
      syncChannelState.channel = null;
    }
  }

  function broadcastSyncEvent(type, payload = {}) {
    const channel = syncChannelState.channel;
    if (!channel) {
      return;
    }
    try {
      channel.postMessage({
        type,
        tabId: syncChannelState.tabId,
        at: Date.now(),
        ...payload
      });
    } catch {}
  }

  function handleSyncChannelMessage(event) {
    const message = event?.data;
    if (!message || message.tabId === syncChannelState.tabId || typeof message.type !== "string") {
      return;
    }

    if (message.type === "remote-state") {
      const nextFingerprint = typeof message.userFingerprint === "string" ? message.userFingerprint : "";
      observeRemoteStoreState({
        updatedAt: typeof message.updatedAt === "number" ? message.updatedAt : 0,
        fingerprint: typeof message.fingerprint === "string" ? message.fingerprint : "",
        savedAt: typeof message.savedAt === "number" ? message.savedAt : 0,
        userUpdatedAt: typeof message.userUpdatedAt === "number" ? message.userUpdatedAt : 0,
        userFingerprint: nextFingerprint
      });
      if (remoteDriftState.baseRemoteUserFingerprint) {
        remoteDriftState.remoteChangedSinceBase = Boolean(
          nextFingerprint && nextFingerprint !== remoteDriftState.baseRemoteUserFingerprint
        );
      } else if (nextFingerprint) {
        setRemoteComparisonBase({
          userUpdatedAt: typeof message.userUpdatedAt === "number" ? message.userUpdatedAt : 0,
          userFingerprint: nextFingerprint
        });
      }
      if (remoteDriftState.remoteChangedSinceBase) {
        setSyncStatus(
          hasUnresolvedRemoteConflict()
            ? "Another Lifetree tab saved newer Drive changes while this tab also has local edits. Run Google sync to resolve it before autosave runs again."
            : "Another Lifetree tab saved newer Drive changes. Run Google sync to refresh before you keep editing here.",
          hasUnresolvedRemoteConflict() ? "error" : "info"
        );
      }
      renderSyncMeta();
      return;
    }

    if (message.type === "local-edit" && !remoteDriftState.remoteChangedSinceBase) {
      setSyncStatus("Another Lifetree tab has unsaved local changes. Save carefully if both tabs edit the same items.", "info");
    }
  }

  async function copyGoogleCalendarDiagnostics() {
    const googleCalendar = normalizeIntegrations(getStore().integrations).googleCalendar;
    if (!googleCalendar.calendarId) {
      setSyncStatus("Set up the Lifetree calendar before copying calendar diagnostics.", "error");
      return;
    }

    const currentUserTimeZone = typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || ""
      : "";
    const diagnosticsRequest = buildGoogleCalendarScheduleSyncRequest(getStore(), googleCalendar, {
      userTimeZone: currentUserTimeZone
    });

    try {
      const response = await fetch(`${apiBase}/api/google-calendar/diagnostics`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: fetchCredentials,
        body: JSON.stringify(diagnosticsRequest)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Calendar diagnostics failed");
      }
      const diagnostics = `${JSON.stringify(payload, null, 2)}\n`;
      try {
        await navigator.clipboard.writeText(diagnostics);
        setSyncStatus("Copied Google Calendar diagnostics. Paste that output here and I can inspect missing or duplicate recurring check-ins.", "info");
      } catch {
        setSyncStatus("Clipboard access failed. Open DevTools and copy the Google Calendar diagnostics from the console instead.", "error");
        console.log(diagnostics);
      }
    } catch (error) {
      setSyncStatus(`Calendar diagnostics failed: ${error.message}`, "error");
    }
  }

  function setDriveSaveInFlight(inFlight, mode = "") {
    driveSaveState.inFlight = Boolean(inFlight);
    driveSaveState.mode = driveSaveState.inFlight ? mode : "";
    updateGoogleButtons();
  }

  function formatAutosaveCountdown(ms) {
    if (ms <= 15_000) {
      return "Due shortly";
    }
    const totalMinutes = Math.max(1, Math.ceil(ms / 60_000));
    if (totalMinutes < 60) {
      return `${totalMinutes} min`;
    }
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
  }

  function updateGoogleButtons() {
    const saveInFlight = driveSaveState.inFlight;
    const googleBusy = saveInFlight || googleSyncState.inFlight;
    googleSignInButton.disabled = googleBusy;
    googleSignInButton.textContent = authState.authenticated ? "Disconnect Google" : "Connect Google";
    const googleCalendar = normalizeIntegrations(getStore().integrations).googleCalendar;
    syncGoogleCalendarButton.disabled = !authState.authenticated || googleBusy;
    syncGoogleCalendarButton.dataset.state = googleBusy ? (driveSaveState.mode || "syncing") : "idle";
    if (copyGoogleCalendarDiagnosticsButton) {
      copyGoogleCalendarDiagnosticsButton.disabled = !authState.authenticated || !googleCalendar.calendarId;
    }
    syncGoogleCalendarButton.textContent = googleSyncState.inFlight
      ? (googleSyncState.phase || "Syncing…")
      : saveInFlight
        ? (driveSaveState.mode === "autosave" ? "Autosaving…" : "Syncing…")
        : "Google sync";
    clearDriveDataButton.disabled = !isDeveloperUser();
    clearWidgetDriveDataButton.disabled = !isDeveloperUser();
    downloadDriveDataButton.disabled = !isDeveloperUser();
    sendDeveloperDailySummaryButton.disabled = !authState.authenticated || notificationSendState.inFlight;
    sendDeveloperDailyAgendaButton.disabled = !authState.authenticated || notificationSendState.inFlight;
    renderDeveloperPanel();
    renderSyncMeta();
    renderNotificationsIfOpen();
  }

  async function sendDeveloperDailySummary() {
    if (!isDeveloperUser()) {
      return;
    }
    const savedDraft = normalizeNotifications(getStore().notifications).email;
    const recipientEmail = savedDraft.recipientEmail || authState.user?.email || "";
    await sendNotificationSummaryDraft({
      draft: {
        ...savedDraft,
        recipientEmail
      },
      frequencyOverride: "daily",
      successMessage: `Sent daily summary to ${recipientEmail || "the configured recipient"}.`,
      failurePrefix: "Daily summary send failed"
    });
  }

  async function sendDeveloperNotificationTest() {
    if (!isDeveloperUser()) {
      return;
    }
    if (!authState.authenticated) {
      const authenticated = await refreshAuthStatus({ suppressUnavailableError: false });
      if (!authenticated) {
        setSyncStatus("Connect Google first to send a test notification email.", "error");
        return;
      }
    }

    const recipientEmail = normalizeNotifications(getStore().notifications).email.recipientEmail || authState.user?.email || "";
    if (!recipientEmail) {
      setSyncStatus("Choose a recipient email before sending a test notification email.", "error");
      return;
    }

    setNotificationSendInFlight(true, "test");
    try {
      const response = await fetch(`${apiBase}/api/notifications/dev-send-test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: fetchCredentials,
        body: JSON.stringify({ recipientEmail })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Test notification send failed");
      }
      setSyncStatus(`Sent a test notification email to ${recipientEmail}.`, "success");
    } catch (error) {
      const message = String(error?.message || "Test notification send failed");
      if (message.includes("insufficientPermissions")) {
        setSyncStatus("Reconnect Google and grant Gmail send access, then try sending the test notification again.", "error");
      } else if (message === "Not authenticated") {
        setSyncStatus("Connect Google first to send a test notification email.", "error");
      } else {
        setSyncStatus(`Test notification send failed: ${message}`, "error");
      }
    } finally {
      setNotificationSendInFlight(false, "");
    }
  }

  async function sendDeveloperDailyAgenda() {
    if (!isDeveloperUser()) {
      return;
    }
    const savedDraft = normalizeNotifications(getStore().notifications).email;
    const recipientEmail = savedDraft.recipientEmail || authState.user?.email || "";
    await sendNotificationReminderDraft({
      draft: {
        ...savedDraft,
        recipientEmail,
        reminders: normalizeEmailReminderConfig({
          ...savedDraft.reminders,
          enabled: true,
          dailyAgendaEnabled: true,
          updatedAt: savedDraft.reminders?.updatedAt || 0
        })
      },
      includeKinds: {
        dueSoon: false,
        overdue: false,
        dailyAgenda: true
      },
      requireDailyAgendaTime: false,
      successMessage: `Sent daily agenda to ${recipientEmail || "the configured recipient"}.`,
      failurePrefix: "Daily agenda send failed"
    });
  }

  async function copyNotificationDiagnostics() {
    if (!isDeveloperUser()) {
      return;
    }

    try {
      const response = await fetch(`${apiBase}/api/notifications/dev-diagnostics`, {
        credentials: fetchCredentials
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Notification diagnostics failed");
      }
      const diagnostics = `${JSON.stringify(payload, null, 2)}\n`;
      try {
        await navigator.clipboard.writeText(diagnostics);
        setSyncStatus("Copied notification diagnostics from the Drive-backed store. Paste that output here and I can tell you exactly what the worker is seeing.", "info");
      } catch {
        setSyncStatus("Clipboard access failed. Open DevTools and copy the notification diagnostics from the console instead.", "error");
        console.log(diagnostics);
      }
    } catch (error) {
      setSyncStatus(`Notification diagnostics failed: ${error.message}`, "error");
    }
  }

  function getNotificationSendState() {
    return { ...notificationSendState };
  }

  function getKnownRemoteState() {
    return { ...syncState };
  }

  return {
    announceRemoteStoreState,
    broadcastSyncEvent,
    checkForRemoteDrift,
    clearRemoteStoreState,
    closeNotifications,
    copyGoogleCalendarDiagnostics,
    copyNotificationDiagnostics,
    getAutosavePermission,
    getCurrentStoreFingerprint,
    getCurrentUserFingerprint,
    getKnownRemoteState,
    getNotificationSendState,
    handleGoogleDisconnect,
    handleEnsureGoogleCalendar,
    handleSyncGoogleCalendarSchedule,
    handleManualLoadFromDrive,
    handleManualSaveToDrive,
    handleNotificationsFormChange,
    handleNotificationsSubmit,
    handleSendNotificationReminder,
    handleSendNotificationSummary,
    hasObservedRemoteDrift,
    hasUnresolvedRemoteConflict,
    initializeSyncChannel,
    isLocalDirtyComparedToRemoteBase,
    isNotificationsOpen,
    observeRemoteStoreState,
    openNotifications,
    renderNotificationsIfOpen,
    renderSyncMeta,
    saveCurrentStoreToDrive,
    sendDeveloperDailyAgenda,
    sendDeveloperDailySummary,
    sendDeveloperNotificationTest,
    sendNotificationReminderDraft,
    sendNotificationSummaryDraft,
    setRemoteComparisonBase,
    updateGoogleButtons
  };
}
