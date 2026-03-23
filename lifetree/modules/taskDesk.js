export function createTaskDeskController({
  taskDeskModal,
  closeWidgetMenu,
  body = document.body,
  bodyClassName = "task-desk-open"
}) {
  function openTaskDesk() {
    closeWidgetMenu();
    taskDeskModal.classList.remove("hidden");
    taskDeskModal.setAttribute("aria-hidden", "false");
    body.classList.add(bodyClassName);
  }

  function closeTaskDesk() {
    taskDeskModal.classList.add("hidden");
    taskDeskModal.setAttribute("aria-hidden", "true");
    body.classList.remove(bodyClassName);
  }

  function isTaskDeskOpen() {
    return !taskDeskModal.classList.contains("hidden");
  }

  return {
    openTaskDesk,
    closeTaskDesk,
    isTaskDeskOpen
  };
}
