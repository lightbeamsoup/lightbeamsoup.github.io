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
    googleSignOutButton,
    loadDriveButton,
    saveDriveButton,
    bootstrapGoogleCalendarButton,
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
    persistStore();
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

  async function handleManualLoadFromDrive() {
    const result = await loadFromDrive();
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

  async function handleManualSaveToDrive() {
    await saveCurrentStoreToDrive({ quiet: false, force: false, mode: "manual" });
  }

  async function handleEnsureGoogleCalendar() {
    if (!authState.authenticated) {
      const authenticated = await refreshAuthStatus({ suppressUnavailableError: false });
      if (!authenticated) {
        setSyncStatus("Connect Google first to set up the Lifetree calendar.", "error");
        return;
      }
    }

    const current = normalizeIntegrations(getStore().integrations).googleCalendar;
    const currentUserTimeZone = typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || ""
      : "";
    bootstrapGoogleCalendarButton.disabled = true;
    bootstrapGoogleCalendarButton.textContent = current.calendarId ? "Checking…" : "Setting up…";
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
      setSyncStatus(
        payload.created
          ? `Created the ${payload.calendarSummary || "Lifetree"} Google Calendar.`
          : payload.updated
            ? `Updated the ${payload.calendarSummary || "Lifetree"} Google Calendar to ${payload.calendarTimeZone || currentUserTimeZone || "your current timezone"}.`
          : `Linked the existing ${payload.calendarSummary || "Lifetree"} Google Calendar.`,
        "success"
      );
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
        setSyncStatus("Reconnect Google and grant Calendar access, then set up the Lifetree calendar again.", "error");
      } else if (message === "Not authenticated") {
        setSyncStatus("Connect Google first to set up the Lifetree calendar.", "error");
      } else {
        setSyncStatus(`Lifetree calendar setup failed: ${message}`, "error");
      }
    } finally {
      updateGoogleButtons();
    }
  }

  async function handleSyncGoogleCalendarSchedule() {
    if (!authState.authenticated) {
      const authenticated = await refreshAuthStatus({ suppressUnavailableError: false });
      if (!authenticated) {
        setSyncStatus("Connect Google first to sync the Lifetree schedule.", "error");
        return;
      }
    }

    const googleCalendar = normalizeIntegrations(getStore().integrations).googleCalendar;
    if (!googleCalendar.calendarId) {
      setSyncStatus("Set up the Lifetree calendar first, then sync the schedule.", "error");
      return;
    }

    const currentUserTimeZone = typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || ""
      : "";
    const syncRequest = buildGoogleCalendarScheduleSyncRequest(getStore(), googleCalendar, {
      userTimeZone: currentUserTimeZone
    });
    if (syncRequest.tasks.length === 0 && (!Array.isArray(syncRequest.pendingDeletions) || syncRequest.pendingDeletions.length === 0)) {
      const now = Date.now();
      persistGoogleCalendarState({
        lastCalendarSyncAt: now,
        lastCalendarSyncStatus: "success",
        lastCalendarSyncMessage: syncRequest.totalEligibleTasks > 0
          ? "The Lifetree calendar schedule is already up to date."
          : "No scheduled Lifetree tasks are ready for calendar sync."
      }, now);
      renderSyncMeta();
      setSyncStatus(
        syncRequest.totalEligibleTasks > 0
          ? "The Lifetree calendar schedule is already up to date."
          : "No scheduled Lifetree tasks are ready for calendar sync.",
        "info"
      );
      updateGoogleButtons();
      return;
    }

    syncGoogleCalendarButton.disabled = true;
    syncGoogleCalendarButton.textContent = "Syncing…";
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
      let pulledCount = 0;
      let pushedCount = 0;
      let statusMirroredCount = 0;
      let relinkedCount = 0;
      let duplicateDeletedCount = 0;
      for (const task of store.tasks) {
        const result = byTaskId.get(task.id);
        if (!result || result.ok !== true) {
          continue;
        }
        const currentLink = normalizeGoogleCalendarTaskLink(task.googleCalendar, {
          calendarId: googleCalendar.calendarId
        });
        task.googleCalendar = normalizeGoogleCalendarTaskLink({
          calendarId: result.calendarId || googleCalendar.calendarId,
          eventId: result.eventId || "",
          recurringEventId: result.recurringEventId || "",
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
          task.updatedAt = now;
          if (result.direction === "push" || result.direction === "create") {
            pushedCount += 1;
          } else if (result.direction === "status") {
            statusMirroredCount += 1;
          }
        }
        if (result.relinked === true) {
          relinkedCount += 1;
        }
        if (typeof result.duplicateDeletedCount === "number" && result.duplicateDeletedCount > 0) {
          duplicateDeletedCount += result.duplicateDeletedCount;
        }
        appliedCount += 1;
      }
      if (appliedCount > 0) {
        persistStore();
        renderAll();
      }

      const errorCount = results.filter((entry) => entry?.ok === false).length;
      const deletionErrorCount = Array.isArray(payload.deletionResults)
        ? payload.deletionResults.filter((entry) => entry?.ok === false).length
        : 0;
      const processedDeletionCount = typeof payload.processedDeletionCount === "number" ? payload.processedDeletionCount : 0;
      const deletedEventCount = typeof payload.deletedCount === "number" ? payload.deletedCount : 0;
      persistGoogleCalendarState({
        connected: true,
        calendarId: payload.calendarId || googleCalendar.calendarId,
        calendarSummary: nextCalendarSummary,
        calendarTimeZone: nextCalendarTimeZone,
        pendingDeletions: remainingPendingDeletions,
        lastCalendarSyncAt: now,
        lastCalendarSyncStatus: errorCount + deletionErrorCount > 0 && appliedCount === 0 && processedDeletionCount === 0 ? "error" : "success",
        lastCalendarSyncMessage: errorCount + deletionErrorCount > 0
          ? `Synced ${appliedCount} scheduled task${appliedCount === 1 ? "" : "s"} and ${processedDeletionCount} calendar deletion${processedDeletionCount === 1 ? "" : "s"} with ${errorCount + deletionErrorCount} error${errorCount + deletionErrorCount === 1 ? "" : "s"}.`
          : `Synced ${appliedCount} scheduled task${appliedCount === 1 ? "" : "s"} and ${processedDeletionCount} calendar deletion${processedDeletionCount === 1 ? "" : "s"} to Google Calendar.`
      }, now);
      renderSyncMeta();
      if (errorCount + deletionErrorCount > 0) {
        const firstError = results.find((entry) => entry?.ok === false)?.error
          || payload.deletionResults?.find((entry) => entry?.ok === false)?.error
          || "Calendar sync hit one or more Google errors.";
        setSyncStatus(`Calendar sync updated ${appliedCount} task${appliedCount === 1 ? "" : "s"} (${pulledCount} pulled, ${pushedCount} pushed, ${statusMirroredCount} status mirrored, ${relinkedCount} relinked) and processed ${processedDeletionCount} deletion${processedDeletionCount === 1 ? "" : "s"} (${deletedEventCount} Google event${deletedEventCount === 1 ? "" : "s"} removed, ${duplicateDeletedCount} duplicate${duplicateDeletedCount === 1 ? "" : "s"} cleaned up), but ${errorCount + deletionErrorCount} failed: ${firstError}`, "error");
      } else {
        setSyncStatus(`Calendar sync updated ${appliedCount} task${appliedCount === 1 ? "" : "s"} (${pulledCount} pulled, ${pushedCount} pushed, ${statusMirroredCount} status mirrored, ${relinkedCount} relinked) and processed ${processedDeletionCount} deletion${processedDeletionCount === 1 ? "" : "s"} (${deletedEventCount} Google event${deletedEventCount === 1 ? "" : "s"} removed, ${duplicateDeletedCount} duplicate${duplicateDeletedCount === 1 ? "" : "s"} cleaned up) against ${nextCalendarSummary}. Save to Drive if you want the links and pulled edits on other devices.`, "success");
      }
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
        setSyncStatus("Reconnect Google and grant Calendar access, then sync the Lifetree schedule again.", "error");
      } else if (message === "Not authenticated") {
        setSyncStatus("Connect Google first to sync the Lifetree schedule.", "error");
      } else {
        setSyncStatus(`Lifetree schedule sync failed: ${message}`, "error");
      }
    } finally {
      updateGoogleButtons();
    }
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
    const store = getStore();
    return typeof store.userFingerprint === "string" && store.userFingerprint
      ? store.userFingerprint
      : computeUserContentFingerprint(store);
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
            ? "Google Drive changed in another session while this tab also has local edits. Use Load from Drive or Save to Drive to resolve it before autosave runs again."
            : "Google Drive changed in another session. Load from Drive to refresh, or keep editing and choose a conflict action when saving.",
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
            ? "Another Lifetree tab saved newer Drive changes while this tab also has local edits. Resolve the conflict before autosave runs again."
            : "Another Lifetree tab saved newer Drive changes. Load from Drive to refresh, or choose a conflict action when saving.",
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
    googleSignInButton.disabled = authState.authenticated || saveInFlight;
    googleSignOutButton.disabled = !authState.authenticated || saveInFlight;
    loadDriveButton.disabled = !authState.authenticated || saveInFlight;
    saveDriveButton.disabled = !authState.authenticated || saveInFlight;
    const googleCalendar = normalizeIntegrations(getStore().integrations).googleCalendar;
    bootstrapGoogleCalendarButton.disabled = !authState.authenticated || saveInFlight;
    syncGoogleCalendarButton.disabled = !authState.authenticated || saveInFlight || !googleCalendar.calendarId;
    if (copyGoogleCalendarDiagnosticsButton) {
      copyGoogleCalendarDiagnosticsButton.disabled = !authState.authenticated || !googleCalendar.calendarId;
    }
    bootstrapGoogleCalendarButton.textContent = saveInFlight
      ? "Waiting…"
      : (googleCalendar.calendarId ? "Check Lifetree calendar" : "Setup Lifetree calendar");
    syncGoogleCalendarButton.textContent = saveInFlight ? "Waiting…" : "Sync Lifetree schedule";
    saveDriveButton.dataset.state = saveInFlight ? driveSaveState.mode || "saving" : "idle";
    saveDriveButton.textContent = saveInFlight
      ? (driveSaveState.mode === "autosave" ? "Autosaving…" : "Saving…")
      : "Save to Drive";
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
