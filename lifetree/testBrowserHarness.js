import { pathToFileURL } from "node:url";
import path from "node:path";

export function installBrowserTestHarness() {
  const originals = captureOriginalGlobals();
  const elementCache = new Map();
  let intervalId = 1;

  function createClassList() {
    const values = new Set();
    return {
      add: (...tokens) => tokens.forEach((token) => values.add(token)),
      remove: (...tokens) => tokens.forEach((token) => values.delete(token)),
      contains: (token) => values.has(token),
      toggle: (token, force) => {
        if (force === true) {
          values.add(token);
          return true;
        }
        if (force === false) {
          values.delete(token);
          return false;
        }
        if (values.has(token)) {
          values.delete(token);
          return false;
        }
        values.add(token);
        return true;
      },
      toString: () => Array.from(values).join(" ")
    };
  }

  function createFakeElement(tagName = "div") {
    const attributes = new Map();
    const styleValues = new Map();
    const element = {
      tagName: String(tagName || "div").toUpperCase(),
      nodeName: String(tagName || "div").toUpperCase(),
      value: "",
      checked: false,
      disabled: false,
      innerHTML: "",
      textContent: "",
      dataset: {},
      children: [],
      options: [],
      selectedOptions: [],
      classList: createClassList(),
      style: {
        setProperty(name, value) {
          styleValues.set(name, value);
        },
        removeProperty(name) {
          styleValues.delete(name);
        }
      },
      addEventListener() {},
      removeEventListener() {},
      setAttribute(name, value) {
        attributes.set(name, String(value));
      },
      getAttribute(name) {
        return attributes.get(name) || "";
      },
      removeAttribute(name) {
        attributes.delete(name);
      },
      appendChild(child) {
        this.children.push(child);
        this.options.push(child);
        return child;
      },
      append(...items) {
        this.children.push(...items);
        this.options.push(...items);
      },
      remove() {},
      reset() {},
      focus() {},
      click() {},
      contains(target) {
        return target === this || this.children.includes(target);
      },
      closest() {
        return null;
      },
      matches() {
        return false;
      },
      querySelector() {
        return createFakeElement("div");
      },
      querySelectorAll() {
        return [];
      },
      getBoundingClientRect() {
        return {
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          width: 0,
          height: 0
        };
      },
      getContext() {
        return {
          clearRect() {},
          beginPath() {},
          moveTo() {},
          lineTo() {},
          stroke() {},
          fill() {},
          fillText() {},
          arc() {},
          closePath() {},
          setLineDash() {}
        };
      }
    };
    return element;
  }

  const document = {
    body: createFakeElement("body"),
    documentElement: createFakeElement("html"),
    visibilityState: "visible",
    cookie: "",
    getElementById(id) {
      if (!elementCache.has(id)) {
        const element = createFakeElement("div");
        element.id = id;
        elementCache.set(id, element);
      }
      return elementCache.get(id);
    },
    querySelector() {
      return createFakeElement("div");
    },
    querySelectorAll() {
      return [];
    },
    createElement(tagName) {
      return createFakeElement(tagName);
    },
    addEventListener() {},
    removeEventListener() {}
  };

  const location = {
    origin: "http://localhost:3000",
    protocol: "http:",
    hostname: "localhost",
    port: "3000",
    pathname: "/lifetree/",
    search: "",
    hash: "",
    href: "http://localhost:3000/lifetree/"
  };

  const localStorageState = new Map();
  const navigator = {
    clipboard: {
      async writeText() {}
    }
  };

  const window = {
    document,
    navigator,
    location,
    TASK_DECK_CONFIG: {},
    crypto: {
      randomUUID: () => `test-id-${Math.random().toString(16).slice(2)}`
    },
    localStorage: {
      getItem(key) {
        return localStorageState.has(key) ? localStorageState.get(key) : null;
      },
      setItem(key, value) {
        localStorageState.set(key, String(value));
      },
      removeItem(key) {
        localStorageState.delete(key);
      }
    },
    matchMedia() {
      return {
        matches: false,
        media: "",
        addEventListener() {},
        removeEventListener() {}
      };
    },
    addEventListener() {},
    removeEventListener() {},
    setInterval() {
      intervalId += 1;
      return intervalId;
    },
    clearInterval() {},
    setTimeout(callback) {
      intervalId += 1;
      return intervalId;
    },
    clearTimeout() {},
    confirm() {
      return true;
    },
    alert() {},
    prompt() {
      return "";
    },
    BroadcastChannel: class {
      addEventListener() {}
      removeEventListener() {}
      postMessage() {}
      close() {}
    },
    URL: {
      createObjectURL() {
        return "blob:test";
      },
      revokeObjectURL() {}
    }
  };

  async function fetchStub(url) {
    const target = String(url || "");
    if (target.includes("/api/auth/status")) {
      return createJsonResponse(true, { authenticated: false, user: null });
    }
    if (target.includes("/api/lifetree/load")) {
      return createJsonResponse(true, { found: false });
    }
    if (target.includes("/api/lifetree/save")) {
      return createJsonResponse(true, { ok: true, fileId: "test-file-id" });
    }
    if (target.includes("/api/lifetree/peek")) {
      return createJsonResponse(true, { found: false });
    }
    if (target.includes("/api/auth/logout")) {
      return createJsonResponse(true, { ok: true });
    }
    return createJsonResponse(false, { error: "Unhandled fetch in browser smoke harness" }, 404);
  }

  defineGlobal("window", window);
  defineGlobal("document", document);
  defineGlobal("navigator", navigator);
  defineGlobal("fetch", fetchStub);
  defineGlobal("location", location);
  defineGlobal("URL", window.URL);
  defineGlobal("Blob", globalThis.Blob || class {
    constructor(parts = [], options = {}) {
      this.parts = parts;
      this.type = options.type || "";
    }
  });

  return {
    async importAppModule() {
      return import(`${pathToFileURL(path.resolve("lifetree/app.js")).href}?startup-smoke=${Date.now()}`);
    },
    async flushAsync() {
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
    },
    restore() {
      restoreGlobals(originals);
    }
  };
}

function createJsonResponse(ok, payload, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    async json() {
      return payload;
    }
  };
}

function captureOriginalGlobals() {
  return {
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
    fetch: globalThis.fetch,
    location: globalThis.location,
    URL: globalThis.URL,
    Blob: globalThis.Blob
  };
}

function restoreGlobals(originals) {
  for (const [key, value] of Object.entries(originals)) {
    if (typeof value === "undefined") {
      delete globalThis[key];
    } else {
      defineGlobal(key, value);
    }
  }
}

function defineGlobal(name, value) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value
  });
}
