export function renderNotificationsPreview(summaryPreview, reminderTemplates, { escapeHtml }) {
  return `
    ${renderEmailSummaryPreview(summaryPreview, escapeHtml)}
    ${renderReminderTemplatesPreview(reminderTemplates, escapeHtml)}
  `;
}

export function renderNotificationHistory(historyEntries, { escapeHtml, formatDateTime }) {
  const entries = Array.isArray(historyEntries) ? historyEntries : [];
  if (entries.length === 0) {
    return `<p class="sync-status">No notification emails have been sent yet. Send a summary or reminder now to start building history.</p>`;
  }
  return `
    <div class="notifications-history-list">
      ${entries.map((entry) => `
        <article class="notifications-history-item">
          <div>
            <strong>${escapeHtml(entry.subject || "Notification email")}</strong>
            <p class="sync-status">${escapeHtml(entry.recipientEmail || "No recipient")} · ${escapeHtml(formatDateTime(entry.at))}</p>
          </div>
          <span class="widget-badge">${entry.status === "error" ? "Error" : formatNotificationHistoryBadge(entry)}</span>
        </article>
      `).join("")}
    </div>
  `;
}

function renderEmailSummaryPreview(preview, escapeHtml) {
  const recipientCopy = preview.recipientEmail || "No recipient selected yet";
  return `
    <article class="notifications-preview-card">
      <p class="eyebrow">Subject</p>
      <h4>${escapeHtml(preview.subject)}</h4>
      <div class="notifications-preview-header">
        <div class="notifications-preview-meta">
          <span class="sync-status">Recipient</span>
          <strong>${escapeHtml(recipientCopy)}</strong>
        </div>
        <div class="notifications-preview-meta">
          <span class="sync-status">Schedule</span>
          <strong>${escapeHtml(preview.scheduleLabel)}</strong>
        </div>
        <div class="notifications-preview-meta">
          <span class="sync-status">Status</span>
          <strong>${preview.enabled ? "Enabled" : "Saved only"}</strong>
        </div>
      </div>
      ${preview.sections.length > 0 ? preview.sections.map((section) => `
        <section class="notifications-preview-section">
          <strong>${escapeHtml(section.title)}</strong>
          <ul>
            ${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </section>
      `).join("") : `<p class="sync-status">No matching content yet. As tasks, widgets, and tree progress change, this preview will fill in automatically.</p>`}
    </article>
  `;
}

function renderReminderTemplatesPreview(reminderTemplates, escapeHtml) {
  if (!Array.isArray(reminderTemplates) || reminderTemplates.length === 0) {
    return `
      <article class="notifications-preview-card">
        <p class="eyebrow">Reminder preview</p>
        <h4>No reminder emails are due right now</h4>
        <p class="sync-status">Agenda, due-soon, and overdue emails will appear here as separate templates when they have content.</p>
      </article>
    `;
  }
  return reminderTemplates.map((preview) => renderEmailReminderPreview(preview, escapeHtml)).join("");
}

function renderEmailReminderPreview(preview, escapeHtml) {
  const recipientCopy = preview.recipientEmail || "No recipient selected yet";
  return `
    <article class="notifications-preview-card">
      <p class="eyebrow">${escapeHtml(preview.eyebrow || "Reminder preview")}</p>
      <h4>${escapeHtml(preview.subject)}</h4>
      <div class="notifications-preview-header">
        <div class="notifications-preview-meta">
          <span class="sync-status">Recipient</span>
          <strong>${escapeHtml(recipientCopy)}</strong>
        </div>
        <div class="notifications-preview-meta">
          <span class="sync-status">Schedule</span>
          <strong>${escapeHtml(preview.scheduleLabel)}</strong>
        </div>
        <div class="notifications-preview-meta">
          <span class="sync-status">Items</span>
          <strong>${preview.eventCount || 0}</strong>
        </div>
      </div>
      ${preview.quietHoursActive ? `<p class="sync-status">Quiet hours are active right now. Manual sends still work, but automatic reminder delivery will pause during that window.</p>` : ""}
      <p class="sync-status">${escapeHtml(buildReminderPreviewIntro(preview))}</p>
      <section class="notifications-preview-section">
        <ul>
          ${preview.items.map((item) => renderReminderPreviewListItem(item, escapeHtml)).join("")}
        </ul>
      </section>
      ${Array.isArray(preview.travelHighlights) && preview.travelHighlights.length > 0 ? `
        <section class="notifications-preview-section">
          <strong>Travel snapshot</strong>
          <ul>
            ${preview.travelHighlights.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </section>
      ` : ""}
    </article>
  `;
}

function buildReminderPreviewIntro(preview) {
  if (preview.templateKind === "agenda") {
    return "This agenda includes everything due today plus overdue items you can still complete. Completed and skipped tasks stay visible for context.";
  }
  if (preview.templateKind === "overdue") {
    return "This email is for tasks that have already crossed their overdue threshold.";
  }
  return "This email is for tasks that are nearing their due time.";
}

function renderReminderPreviewListItem(item, escapeHtml) {
  const normalized = normalizeReminderPreviewItem(item);
  const closed = normalized.status === "completed" || normalized.status === "skipped";
  const statusCopy = normalized.status === "completed"
    ? "Completed"
    : normalized.status === "skipped"
      ? "Skipped"
      : "";
  return `
    <li class="${closed ? "notifications-preview-item-closed" : ""}">
      <span>${escapeHtml(normalized.label)}</span>
      ${statusCopy ? `<span class="notifications-preview-item-status ${normalized.status}">${escapeHtml(statusCopy)}</span>` : ""}
    </li>
  `;
}

function normalizeReminderPreviewItem(item) {
  if (item && typeof item === "object" && !Array.isArray(item)) {
    return {
      label: String(item.label || ""),
      status: item.status === "completed" || item.status === "skipped" ? item.status : "open"
    };
  }
  return {
    label: String(item || ""),
    status: "open"
  };
}

function formatNotificationHistoryBadge(entry) {
  if (entry?.kind !== "reminder") {
    return "Summary";
  }
  if (entry?.reminderTemplateKind === "agenda") {
    return "Agenda";
  }
  if (entry?.reminderTemplateKind === "overdue") {
    return "Overdue";
  }
  if (entry?.reminderTemplateKind === "due-soon") {
    return "Due soon";
  }
  return "Reminder";
}
