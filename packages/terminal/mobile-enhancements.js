(() => {
  const keyMap = {
    Escape: "\x1b",
    Tab: "\t",
    ArrowLeft: "\x1b[D",
    ArrowUp: "\x1b[A",
    ArrowDown: "\x1b[B",
    ArrowRight: "\x1b[C",
    Enter: "\r",
  };
  let fitTimer;

  const getTerm = () => window.term;

  const fit = () => {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(() => {
      requestAnimationFrame(() => getTerm()?.fit?.());
    }, 80);
  };

  const updateViewport = () => {
    const height = window.visualViewport?.height || window.innerHeight;
    document.documentElement.style.setProperty("--ttyd-app-height", `${Math.round(height)}px`);
    fit();
  };

  const send = (data) => {
    const term = getTerm();
    if (!term?.sendData) return;
    term.sendData(data);
    term.focus();
  };

  const createButton = (label, key, ariaLabel = label) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.dataset.key = key;
    button.setAttribute("aria-label", ariaLabel);
    return button;
  };

  const init = () => {
    const term = getTerm();
    if (!term?.fit || !term?.element || !term?.sendData) {
      setTimeout(init, 25);
      return;
    }

    const toolbar = document.createElement("nav");
    toolbar.id = "ttyd-mobile-toolbar";
    toolbar.setAttribute("aria-label", "Terminal keys");

    const scrollKeys = document.createElement("div");
    scrollKeys.className = "ttyd-mobile-toolbar-scroll";
    scrollKeys.setAttribute("role", "group");
    scrollKeys.setAttribute("aria-label", "Additional terminal keys");
    scrollKeys.append(
      createButton("Esc", "Escape"),
      createButton("Tab", "Tab"),
      createButton("←", "ArrowLeft", "Left arrow"),
      createButton("↑", "ArrowUp", "Up arrow"),
      createButton("↓", "ArrowDown", "Down arrow"),
      createButton("→", "ArrowRight", "Right arrow"),
    );

    const primaryKeys = document.createElement("div");
    primaryKeys.className = "ttyd-mobile-toolbar-primary";
    primaryKeys.setAttribute("role", "group");
    primaryKeys.setAttribute("aria-label", "Primary terminal actions");
    primaryKeys.append(
      createButton("Enter", "Enter"),
      createButton("Input", "Input", "Open text composer"),
    );
    toolbar.append(scrollKeys, primaryKeys);

    const composer = document.createElement("section");
    composer.id = "ttyd-mobile-composer";
    composer.hidden = true;
    composer.setAttribute("role", "dialog");
    composer.setAttribute("aria-modal", "false");
    composer.setAttribute("aria-label", "Compose terminal input");
    composer.innerHTML = `
      <textarea id="ttyd-mobile-composer-text" aria-label="Terminal input" placeholder="Type or paste text"></textarea>
      <div class="ttyd-mobile-composer-actions">
        <button id="ttyd-mobile-composer-cancel" type="button">Cancel</button>
        <button id="ttyd-mobile-composer-expand" type="button" aria-pressed="false">전체화면</button>
        <button id="ttyd-mobile-composer-send" type="button">Send</button>
      </div>`;

    document.body.append(toolbar, composer);

    const textarea = composer.querySelector("textarea");
    const expandButton = composer.querySelector("#ttyd-mobile-composer-expand");
    const setFullscreen = (fullscreen) => {
      composer.classList.toggle("is-fullscreen", fullscreen);
      composer.setAttribute("aria-modal", String(fullscreen));
      expandButton.setAttribute("aria-pressed", String(fullscreen));
      expandButton.textContent = fullscreen ? "축소" : "전체화면";
      updateViewport();
    };
    const closeComposer = () => {
      composer.hidden = true;
      setFullscreen(false);
      term.focus();
    };
    const openComposer = () => {
      composer.hidden = false;
      updateViewport();
      requestAnimationFrame(() => textarea.focus());
    };

    toolbar.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-key]");
      if (!button) return;
      if (button.dataset.key === "Input") {
        openComposer();
        return;
      }
      send(keyMap[button.dataset.key]);
    });

    composer.querySelector("#ttyd-mobile-composer-cancel").addEventListener("click", closeComposer);
    expandButton.addEventListener("click", () => {
      setFullscreen(!composer.classList.contains("is-fullscreen"));
      textarea.focus();
    });
    composer.querySelector("#ttyd-mobile-composer-send").addEventListener("click", () => {
      const value = textarea.value.replace(/\r\n?/g, "\n");
      if (!value.trim()) return;
      const payload = term.modes?.bracketedPasteMode
        ? `\x1b[200~${value}\x1b[201~`
        : value;
      term.sendData(`${payload}\r`);
      textarea.value = "";
      closeComposer();
    });

    let touchY;
    term.element.addEventListener("touchstart", (event) => {
      if (event.touches.length === 1) touchY = event.touches[0].clientY;
    }, { capture: true, passive: true });
    term.element.addEventListener("touchmove", (event) => {
      if (event.touches.length !== 1 || touchY === undefined) return;
      const nextY = event.touches[0].clientY;
      const deltaY = touchY - nextY;
      touchY = nextY;
      if (!deltaY) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      term.element.dispatchEvent(new WheelEvent("wheel", {
        deltaY,
        deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        bubbles: true,
        cancelable: true,
      }));
    }, { capture: true, passive: false });
    const clearTouch = () => { touchY = undefined; };
    term.element.addEventListener("touchend", clearTouch, { capture: true, passive: true });
    term.element.addEventListener("touchcancel", clearTouch, { capture: true, passive: true });

    // Reconnect immediately when the page comes back to the foreground
    // (Android drops the WebSocket while the tab is frozen in the background).
    const reconnectIfNeeded = () => {
      if (document.visibilityState !== "visible") return;
      getTerm()?.reconnect?.();
    };
    document.addEventListener("visibilitychange", reconnectIfNeeded);
    window.addEventListener("pageshow", reconnectIfNeeded);
    window.addEventListener("online", reconnectIfNeeded);

    window.addEventListener("resize", updateViewport, { passive: true });
    window.addEventListener("orientationchange", updateViewport, { passive: true });
    window.visualViewport?.addEventListener("resize", updateViewport, { passive: true });
    window.visualViewport?.addEventListener("scroll", updateViewport, { passive: true });
    document.fonts.load('13px "JetBrains Mono"').catch(() => {}).finally(updateViewport);
    updateViewport();
  };

  init();
})();
