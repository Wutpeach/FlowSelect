import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const detectorPath = path.resolve("browser-extension/bilibili-detector.js");
const detectorSource = readFileSync(detectorPath, "utf8");

class FakeElement {}

class FakeHtmlElement extends FakeElement {
  constructor({ classNames = [], children = [], width = 32, height = 32, display = "block", visibility = "visible", tagName = "DIV", role = null } = {}) {
    super();
    this._children = [];
    this.isConnected = true;
    this.classList = {
      contains: (name) => classNames.includes(name),
      [Symbol.iterator]: function* iterator() {
        yield* classNames;
      },
    };
    this.className = classNames.join(" ");
    this._rect = {
      width,
      height,
      top: 0,
      left: 0,
      right: Math.max(width, 1),
      bottom: Math.max(height, 1),
    };
    this._style = { display, visibility };
    this.tagName = tagName;
    this._role = role;
    this.children = this._children;
    this.querySelector = (selector) => {
      if (!selector.startsWith(".")) {
        return null;
      }
      const className = selector.slice(1);
      return this.querySelectorAll("*").find((node) => node.classList.contains(className)) || null;
    };
    this.querySelectorAll = (selector) => {
      if (selector !== "*") {
        return [];
      }
      return this._children.flatMap((child) => [child, ...child.querySelectorAll("*")]);
    };

    children.forEach((child) => this.appendChild(child));
  }

  appendChild(child) {
    this._children.push(child);
    this.children = this._children;
    child.parentElement = this;
  }

  getBoundingClientRect() {
    return this._rect;
  }

  getAttribute(name) {
    if (name === "role") {
      return this._role;
    }
    return null;
  }
}

function loadHooks() {
  const selectorMap = new Map();
  const window = {
    location: {
      href: "https://www.bilibili.com/video/BV1xx411c7mD?p=1",
      pathname: "/video/BV1xx411c7mD",
    },
    innerWidth: 1440,
    innerHeight: 900,
    getComputedStyle(element) {
      return element?._style || { display: "block", visibility: "visible" };
    },
    FlowSelectControlStyleUtils: {
      isControlBarReady() {
        return false;
      },
    },
  };

  const context = {
    window,
    self: {},
    globalThis: {},
    URL,
    console,
    Date,
    Math,
    Array,
    Number,
    Map,
    Set,
    Blob,
    navigator: {
      language: "zh-CN",
      clipboard: {},
    },
    MutationObserver: class MutationObserver {
      observe() {}
      disconnect() {}
    },
    HTMLElement: FakeHtmlElement,
    Element: FakeElement,
    HTMLAnchorElement: class HTMLAnchorElement extends FakeHtmlElement {},
    HTMLVideoElement: class HTMLVideoElement extends FakeHtmlElement {},
    FileReader: class FileReader {},
    chrome: {
      runtime: {
        onMessage: {
          addListener() {},
        },
      },
    },
    document: {
      readyState: "loading",
      addEventListener() {},
      querySelector(selector) {
        return selectorMap.get(selector) || null;
      },
      querySelectorAll() {
        return [];
      },
      getElementById() {
        return null;
      },
      body: new FakeHtmlElement(),
    },
  };

  vm.runInNewContext(detectorSource, context, { filename: detectorPath });
  return {
    hooks: context.window.FlowSelectBilibiliDetectorTestHooks,
    selectorMap,
  };
}

describe("bilibili detector", () => {
  it("treats nested native controls as a usable control bar fallback", () => {
    const { hooks } = loadHooks();
    const nestedButton = new FakeHtmlElement({
      classNames: ["bpx-player-ctrl-btn"],
      width: 24,
      height: 24,
    });
    const wrapper = new FakeHtmlElement({
      classNames: ["control-wrapper"],
      children: [nestedButton],
      width: 24,
      height: 24,
    });
    const container = new FakeHtmlElement({
      classNames: ["bpx-player-control-bottom-right"],
      children: [wrapper],
      width: 120,
      height: 36,
    });

    expect(hooks.hasRenderableNativeControlChildFallback(container, "bpx-player-ctrl-btn")).toBe(false);
    expect(hooks.hasRenderableNativeControlDescendantFallback(container, "bpx-player-ctrl-btn")).toBe(true);
    expect(hooks.isControlBarReady(container, "bpx-player-ctrl-btn")).toBe(true);
  });

  it("detects whether injected buttons still exist inside the control container", () => {
    const { hooks } = loadHooks();
    const injectedButton = new FakeHtmlElement({
      classNames: ["flowselect-bilibili-btn"],
      width: 24,
      height: 24,
    });
    const container = new FakeHtmlElement({
      classNames: ["bpx-player-control-bottom-right"],
      children: [injectedButton],
      width: 120,
      height: 36,
    });

    expect(hooks.hasInjectedButtons(container)).toBe(true);
    expect(hooks.hasInjectedButtons(new FakeHtmlElement())).toBe(false);
  });

  it("falls back to the ancestor control container derived from a native button", () => {
    const { hooks, selectorMap } = loadHooks();
    const nativeButton = new FakeHtmlElement({
      classNames: ["bpx-player-ctrl-btn"],
      width: 24,
      height: 24,
    });
    const innerWrapper = new FakeHtmlElement({
      classNames: ["bpx-item"],
      children: [nativeButton],
      width: 24,
      height: 24,
    });
    const controlContainer = new FakeHtmlElement({
      classNames: ["mystery-player-control-bottom-right"],
      children: [innerWrapper],
      width: 160,
      height: 36,
    });

    selectorMap.set(".bpx-player-ctrl-btn", nativeButton);

    expect(hooks.resolveControlContainerFromNativeButton(nativeButton)).toBe(controlContainer);
    expect(hooks.findNativeControlButtonCandidate()).toBe(nativeButton);
  });
});
