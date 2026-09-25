/*
 * Smart Interactive Reporting — embeddable widget.
 *
 * Drop one tag on any page:
 *
 *   <script src="https://APP/widget.js"
 *           data-token="<embed token from your backend>"></script>
 *
 * Optional: data-title, data-origin (defaults to where this script came from),
 * data-position="left", data-open="true".
 *
 * The panel is an <iframe> pointing at /embed/reporting on OUR origin, so the
 * host page's CSS and ours can never collide, and the API call happens
 * same-origin inside the frame (no CORS involved at all).
 *
 * Mint the token SERVER-SIDE (POST /v1/embed/token with the service account's
 * login) and render it per visitor. Never ship the service account's own
 * credentials to a page.
 */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var token = script.getAttribute("data-token") || "";
  if (!token) {
    console.error("[reporting-widget] data-token is required");
    return;
  }

  var origin = script.getAttribute("data-origin") || new URL(script.src).origin;
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
    ".panel{position:fixed;bottom:88px;" + side + ":20px;z-index:2147483647;",
    "width:min(440px,calc(100vw - 40px));height:min(640px,calc(100vh - 120px));",
    "border:0;border-radius:14px;background:#fff;display:none;",
    "box-shadow:0 12px 40px rgba(0,0,0,.3);overflow:hidden}",
    ".panel.open{display:block}",
    "@media(max-width:480px){.panel{width:calc(100vw - 20px);",
    "height:calc(100vh - 100px);" + side + ":10px}}",
  ].join("");

  var frame = document.createElement("iframe");
  frame.className = "panel";
  frame.title = title;
  // Enough to run the app, nothing more: no top-navigation, no popups.
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-downloads");

  var btn = document.createElement("button");
  btn.className = "btn";
  btn.type = "button";
  btn.setAttribute("aria-label", title);
  btn.setAttribute("aria-expanded", "false");
  btn.textContent = "\u{1F4AC}";

  var loaded = false;
  function toggle(force) {
    var open = force === undefined ? !frame.classList.contains("open") : force;
    // Load lazily: an unopened widget should cost the host page nothing.
    if (open && !loaded) {
      frame.src = origin + "/embed/reporting#token=" + encodeURIComponent(token);
      loaded = true;
    }
    frame.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", String(open));
    btn.textContent = open ? "✕" : "\u{1F4AC}";
  }

  btn.addEventListener("click", function () { toggle(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") toggle(false);
  });

  root.appendChild(style);
  root.appendChild(frame);
  root.appendChild(btn);
  document.body.appendChild(host);

  if (script.getAttribute("data-open") === "true") toggle(true);

  window.ReportingWidget = {
    open: function () { toggle(true); },
    close: function () { toggle(false); },
    toggle: function () { toggle(); },
  };
})();
