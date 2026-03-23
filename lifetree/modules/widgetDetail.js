export function createWidgetDetailController({
  widgetDetailModal,
  closeWidgetDetailButton,
  closeWidgetDetailBackdrop,
  closeWidgetMenu,
  body = document.body,
  bodyClassName = "widget-detail-open"
}) {
  function openWidgetDetail() {
    closeWidgetMenu();
    widgetDetailModal.classList.remove("hidden");
    widgetDetailModal.setAttribute("aria-hidden", "false");
    body.classList.add(bodyClassName);
  }

  function closeWidgetDetail() {
    widgetDetailModal.classList.add("hidden");
    widgetDetailModal.setAttribute("aria-hidden", "true");
    body.classList.remove(bodyClassName);
  }

  closeWidgetDetailButton.addEventListener("click", closeWidgetDetail);
  closeWidgetDetailBackdrop.addEventListener("click", closeWidgetDetail);

  return {
    openWidgetDetail,
    closeWidgetDetail,
    isWidgetDetailOpen() {
      return !widgetDetailModal.classList.contains("hidden");
    }
  };
}
