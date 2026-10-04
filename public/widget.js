/*
 * Smart Interactive Reporting — embeddable widget.
 *
 * Drop one tag on any page:
 *
 *   <script src="https://APP/widget.js" data-widget-id="<installation id>"
 *           data-api-base="https://API/v1"></script>
 *
 * Optional: data-title, data-origin (defaults to where this script came from),
 * data-position="left", data-open="true".
 *
 * The panel is an <iframe> pointing at /embed/reporting on OUR origin, so the
 * host page's CSS and ours can never collide. Session exchange runs from the
 * host page with an origin check; reporting calls run inside the frame.
 *
 * The installation ID is public. A superadmin authorizes its exact website
 * origin; the widget obtains and renews a short-lived reporting session.
 * data-token remains available for manually issued tokens.
 */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var token = script.getAttribute("data-token") || "";
  var installationId = script.getAttribute("data-widget-id") || "";
  if (!token && !installationId) {
    console.error("[reporting-widget] data-widget-id or data-token is required");
    return;
  }

  var origin = script.getAttribute("data-origin") || new URL(script.src).origin;
  var apiBase = (script.getAttribute("data-api-base") || origin + "/v1").replace(/\/$/, "");
  var title = script.getAttribute("data-title") || "Smart Interactive Reporting";
  var left = script.getAttribute("data-position") === "left";
  var side = left ? "left" : "right";

  var host = document.createElement("div");
  // A shadow root keeps the host page's stylesheets from reaching the launcher
  // button, the one part of the widget that is not inside the iframe.
  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;

  var style = document.createElement("style");
  style.textContent = [
    ":host{all:initial}",
    ".btn{position:fixed;bottom:20px;" + side + ":20px;z-index:2147483647;",
    "width:56px;height:56px;border-radius:50%;border:0;cursor:pointer;",
    "background:#f06a25;color:#fff;font-size:24px;line-height:1;",
    "box-shadow:0 6px 20px rgba(0,0,0,.25)}",
    ".btn:hover{filter:brightness(1.08)}",
    // KPI tables are wide: a narrow panel turns every answer into a
    // horizontal scroll hunt. 520px is the point where the Data/%MoM/%QoQ
    // columns fit without the host page feeling taken over.
    ".panel{position:fixed;z-index:2147483646;display:none;flex-direction:column;",
    "overflow:hidden;border:1px solid #3b3834;border-radius:16px;background:#1a1a19;",
    "box-shadow:0 18px 50px rgba(0,0,0,.35)}",
    ".panel.open{display:flex}",
    ".head{display:flex;align-items:center;gap:8px;flex:none;height:38px;padding:0 8px 0 14px;",
    "background:#292724;color:#f1ece3;font:600 12px system-ui,sans-serif;",
    "touch-action:none;cursor:grab;user-select:none}",
    ".head.dragging{cursor:grabbing}",
    ".title{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;flex:1}",
    ".control{display:grid;place-items:center;width:28px;height:28px;padding:0;",
    "border:0;border-radius:6px;background:transparent;color:inherit;cursor:pointer;",
    "font:18px/1 system-ui,sans-serif}",
    ".control:hover,.control:focus-visible{background:#45413b;outline:none}",
    ".frame{display:block;flex:1;min-height:0;width:100%;border:0;background:#1a1a19}",
    ".grip{position:absolute;right:0;bottom:0;width:24px;height:24px;",
    "cursor:nwse-resize;touch-action:none;background:linear-gradient(135deg,transparent 58%,#b8aca0 60%,#b8aca0 65%,transparent 67%)}",
    ".panel.maximized .grip{display:none}",
    ".status{display:none;position:absolute;inset:38px 0 0;place-items:center;padding:24px;",
    "background:#1a1a19;color:#e8d5c7;text-align:center;font:14px system-ui,sans-serif}",
    ".status.visible{display:grid}",
  ].join("");

  var panel = document.createElement("div");
  panel.className = "panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", title);
  var head = document.createElement("div");
  head.className = "head";
  head.setAttribute("aria-label", "Geser jendela chat");
  var label = document.createElement("span");
  label.className = "title";
  label.textContent = title;
  var maximize = document.createElement("button");
  maximize.className = "control";
  maximize.type = "button";
  maximize.setAttribute("aria-label", "Perbesar widget");
  maximize.title = "Perbesar";
  maximize.textContent = "□";
  var close = document.createElement("button");
  close.className = "control";
  close.type = "button";
  close.setAttribute("aria-label", "Tutup widget");
  close.title = "Tutup";
  close.textContent = "×";
  head.appendChild(label);
  head.appendChild(maximize);
  head.appendChild(close);

  var frame = document.createElement("iframe");
  frame.className = "frame";
  frame.title = title;
  // Enough to run the app, nothing more: no top-navigation, no popups.
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-downloads");
  var status = document.createElement("div");
  status.className = "status";
  status.setAttribute("role", "status");
  var grip = document.createElement("div");
  grip.className = "grip";
  grip.setAttribute("aria-label", "Ubah ukuran widget");
  panel.appendChild(head);
  panel.appendChild(frame);
  panel.appendChild(status);
  panel.appendChild(grip);

  var btn = document.createElement("button");
  btn.className = "btn";
  btn.type = "button";
  btn.setAttribute("aria-label", title);
  btn.setAttribute("aria-expanded", "false");
  btn.textContent = "\u{1F4AC}";

  var geometry;
  var maximized = false;
  var loaded = false;
  var sessionExpiresAt = 0;
  var sessionTimer = null;
  var sessionRequest = null;
  function refreshSession() {
    if (!installationId) return Promise.resolve(token);
    if (sessionRequest) return sessionRequest;
    sessionRequest = fetch(apiBase + "/embed/installations/" + encodeURIComponent(installationId) + "/session", {
      credentials: "omit", cache: "no-store"
    }).then(function (response) {
      if (!response.ok) throw new Error("Widget session unavailable (HTTP " + response.status + ")");
      return response.json();
    }).then(function (data) {
      token = data.token;
      status.classList.remove("visible");
      sessionExpiresAt = Date.now() + data.expiresInSeconds * 1000;
      if (loaded && frame.contentWindow) {
        frame.contentWindow.postMessage({ type: "reporting-widget-token", token: token }, origin);
      }
      if (sessionTimer) clearTimeout(sessionTimer);
      sessionTimer = setTimeout(function () {
        if (panel.classList.contains("open")) refreshSession().catch(function (error) {
          console.error("[reporting-widget]", error);
          status.textContent = "Sesi widget belum tersedia. Sedang mencoba lagi...";
          status.classList.add("visible");
          function retry() {
            if (!panel.classList.contains("open")) return;
            refreshSession().catch(function (retryError) {
              console.error("[reporting-widget]", retryError);
              sessionTimer = setTimeout(retry, 30000);
            });
          }
          sessionTimer = setTimeout(retry, 30000);
        });
      }, Math.max(1000, (data.expiresInSeconds - 120) * 1000));
      return token;
    }).finally(function () { sessionRequest = null; });
    return sessionRequest;
  }
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
  function fit(rect) {
    var margin = 8;
    var maxWidth = Math.max(1, window.innerWidth - margin * 2);
    var maxHeight = Math.max(1, window.innerHeight - margin * 2);
    var width = clamp(rect.width, Math.min(320, maxWidth), maxWidth);
    var height = clamp(rect.height, Math.min(260, maxHeight), maxHeight);
    return {
      x: clamp(rect.x, margin, Math.max(margin, window.innerWidth - width - margin)),
      y: clamp(rect.y, margin, Math.max(margin, window.innerHeight - height - margin)),
      width: width,
      height: height,
    };
  }
  function initialGeometry() {
    var width = Math.min(520, window.innerWidth - 16);
    var height = Math.min(720, window.innerHeight - 96);
    return fit({
      x: side === "left" ? 20 : window.innerWidth - width - 20,
      y: window.innerHeight - height - 88,
      width: width,
      height: height,
    });
  }
  function draw(rect) {
    panel.style.left = rect.x + "px";
    panel.style.top = rect.y + "px";
    panel.style.width = rect.width + "px";
    panel.style.height = rect.height + "px";
  }
  function fullGeometry() {
    return { x: 8, y: 8, width: window.innerWidth - 16, height: window.innerHeight - 16 };
  }
  function toggleMaximize() {
    maximized = !maximized;
    panel.classList.toggle("maximized", maximized);
    maximize.setAttribute("aria-label", maximized ? "Pulihkan ukuran widget" : "Perbesar widget");
    maximize.title = maximized ? "Pulihkan" : "Perbesar";
    maximize.textContent = maximized ? "❐" : "□";
    if (maximized) {
      draw(fullGeometry());
    } else {
      geometry = fit(geometry || initialGeometry());
      draw(geometry);
    }
  }
  function toggle(force) {
    var open = force === undefined ? !panel.classList.contains("open") : force;
    // Load lazily: an unopened widget should cost the host page nothing.
    if (open && !loaded) {
      if (installationId) {
        refreshSession().then(function () {
          if (!loaded) {
            frame.src = origin + "/embed/reporting?widget=" + encodeURIComponent(installationId) +
              "#token=" + encodeURIComponent(token);
            loaded = true;
          }
        }).catch(function (error) {
          console.error("[reporting-widget]", error);
          status.textContent = "Widget belum tersedia. Periksa domain pendaftaran atau koneksi server.";
          status.classList.add("visible");
          setTimeout(function () {
            if (panel.classList.contains("open") && !loaded) toggle(true);
          }, 30000);
        });
      } else {
        frame.src = origin + "/embed/reporting#token=" + encodeURIComponent(token);
        loaded = true;
      }
    } else if (open && installationId && sessionExpiresAt - Date.now() < 120000) {
      refreshSession().catch(function (error) { console.error("[reporting-widget]", error); });
    }
    if (open) {
      geometry = fit(geometry || initialGeometry());
      draw(maximized ? fullGeometry() : geometry);
    }
    panel.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", String(open));
    btn.textContent = open ? "✕" : "\u{1F4AC}";
  }
  function startPointer(event, mode) {
    if (maximized || event.button !== 0 || event.target.closest("button")) return;
    event.preventDefault();
    var target = event.currentTarget;
    var startX = event.clientX;
    var startY = event.clientY;
    var from = fit(geometry || initialGeometry());
    target.setPointerCapture(event.pointerId);
    if (mode === "drag") head.classList.add("dragging");
    function move(next) {
      var dx = next.clientX - startX;
      var dy = next.clientY - startY;
      geometry = fit(mode === "drag"
        ? { x: from.x + dx, y: from.y + dy, width: from.width, height: from.height }
        : { x: from.x, y: from.y, width: from.width + dx, height: from.height + dy });
      draw(geometry);
    }
    function stop() {
      head.classList.remove("dragging");
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", stop);
      target.removeEventListener("pointercancel", stop);
    }
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", stop);
    target.addEventListener("pointercancel", stop);
  }

  head.addEventListener("pointerdown", function (event) { startPointer(event, "drag"); });
  grip.addEventListener("pointerdown", function (event) { startPointer(event, "resize"); });
  maximize.addEventListener("click", toggleMaximize);
  close.addEventListener("click", function () { toggle(false); });
  btn.addEventListener("click", function () { toggle(); });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && panel.classList.contains("open")) toggle(false);
  });
  window.addEventListener("resize", function () {
    if (maximized) draw(fullGeometry());
    else if (geometry) {
      geometry = fit(geometry);
      draw(geometry);
    }
  });

  root.appendChild(style);
  root.appendChild(panel);
  root.appendChild(btn);
  document.body.appendChild(host);

  if (script.getAttribute("data-open") === "true") toggle(true);

  window.ReportingWidget = {
    open: function () { toggle(true); },
    close: function () { toggle(false); },
    toggle: function () { toggle(); },
    maximize: function () { if (!maximized) toggleMaximize(); },
    restore: function () { if (maximized) toggleMaximize(); },
  };
})();
