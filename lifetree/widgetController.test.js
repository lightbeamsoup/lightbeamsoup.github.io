import test from "node:test";
import assert from "node:assert/strict";
import { createWidgetController } from "./modules/widgetController.js";

function createClassList() {
  const values = new Set();
  return {
    add: (...tokens) => tokens.forEach((token) => values.add(token)),
    remove: (...tokens) => tokens.forEach((token) => values.delete(token)),
    contains: (token) => values.has(token)
  };
}

function createSlotElement(slotIndex) {
  const attributes = new Map([["data-slot-index", String(slotIndex)]]);
  return {
    innerHTML: "",
    classList: createClassList(),
    getAttribute(name) {
      return attributes.get(name) || "";
    }
  };
}

test("widget render fallback smoke test isolates malformed widget data to one slot", () => {
  const widgetSlots = [createSlotElement(0), createSlotElement(1)];
  const store = {
    widgets: [
      {
        id: "broken-widget",
        type: "broken",
        slotIndex: 0,
        data: null
      },
      {
        id: "healthy-widget",
        type: "healthy",
        slotIndex: 1,
        data: { label: "Still renders" }
      }
    ],
    tasks: []
  };
  const definitions = new Map([
    ["broken", {
      type: "broken",
      title: "Broken widget",
      render({ widget }) {
        return widget.data.trip.name;
      }
    }],
    ["healthy", {
      type: "healthy",
      title: "Healthy widget",
      render({ widget }) {
        return `
          <div class="widget-slot-header">
            <h3>${widget.data.label}</h3>
          </div>
        `;
      }
    }]
  ]);
  const consoleErrors = [];
  const originalConsoleError = console.error;
  console.error = (...args) => {
    consoleErrors.push(args.map((value) => String(value)).join(" "));
  };

  try {
    const controller = createWidgetController({
      refs: {
        widgetSlots
      },
      getStore: () => store,
      getWidgetDefinition: (type) => definitions.get(type) || null,
      listWidgetDefinitions: () => Array.from(definitions.values()),
      escapeHtml: (value) => String(value ?? "")
    });

    controller.renderWidgetOrbit();
  } finally {
    console.error = originalConsoleError;
  }

  assert.match(widgetSlots[0].innerHTML, /This widget shell could not render from the current saved data\./);
  assert.match(widgetSlots[0].innerHTML, /Broken widget/);
  assert.match(widgetSlots[1].innerHTML, /Still renders/);
  assert.equal(widgetSlots[0].classList.contains("filled"), true);
  assert.equal(widgetSlots[1].classList.contains("filled"), true);
  assert.ok(consoleErrors.some((entry) => entry.includes("Widget shell render failed for broken:")));
});
