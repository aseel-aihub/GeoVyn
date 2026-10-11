/* ============================================================
   GeoVyn - app.js (builds the page)
   Author : Aseel  (GitHub: aseel-aihub)
   Copyright (c) 2026 Aseel. All rights reserved. See LICENSE.
   ============================================================ */
// NOTE: this file only builds the screens. Logic is in engine.js, data checks in data.js.
// NOTE: SECURITY RULE for this file: user text is ALWAYS added with textContent,
//       never with innerHTML, so no html or script from a csv file can run.

"use strict";

(function () {
  var D = GV.data, E = GV.engine, C = GV.charts;
  var COLORS = { purple: "#7B5CE6", blue: "#3E8ED6", teal: "#16A79A", rose: "#E2557A", amber: "#E3A34B" };

  // ------------------------------------------------------------
  // small helpers
  // ------------------------------------------------------------

  // NOTE: find an element by id
  function $(id) { return document.getElementById(id); }

  // NOTE: make an element: el("div", {class: "card"}, "text", childNode, ...)
  //       strings become text nodes, so they can never turn into html
  function el(tag, attrs) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "class") node.className = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined || child === false) continue;
      node.appendChild(typeof child === "string" || typeof child === "number"
        ? document.createTextNode(String(child)) : child);
    }
    return node;
  }

  // NOTE: put new children inside a box (removes the old ones)
  function fill(box) {
    box.replaceChildren.apply(box, Array.prototype.slice.call(arguments, 1).filter(Boolean));
  }

  // NOTE: one KPI block
  function kpi(label, value, hint, before, color) {
    return el("div", { class: "kpi" + (color ? " kpi-" + color : "") },
      el("div", { class: "label" }, label),
      el("div", { class: "value" },
        before !== undefined ? el("span", { class: "from" }, before + " \u2192 ") : null,
        String(value)),
      el("div", { class: "hint" }, hint || ""));
  }

  // NOTE: simple table from a header list and rows (cells can be text or elements)
  function table(header, rows, numCols) {
    numCols = numCols || [];
    return el("table", {},
      el("thead", {}, el("tr", {}, ...header.map(function (h) { return el("th", { scope: "col" }, h); }))),
      el("tbody", {}, ...rows.map(function (r) {
        return el("tr", {}, ...r.map(function (c, i) {
          return el("td", numCols.indexOf(i) > -1 ? { class: "num" } : {}, c);
        }));
      })));
  }

  // NOTE: +5 / -3 style text for moved days
  function signed(n) { return (n > 0 ? "+" : "") + n; }

  // ------------------------------------------------------------
  // app state (everything the page needs to remember)
  // ------------------------------------------------------------
  var state = {
    source: "sample",
    works: null,          // NOTE: valid works from the sample or the uploaded file
    messages: [],         // NOTE: file check notes
    fileName: "",
    gap: 7, maxShift: 90, useDelay: true,
    hidden: {},           // NOTE: agencies the user hid from the views
    rejected: {},         // NOTE: moves the user unticked (by work id)
    runKey: "",
    plan: "before", allDays: true, day: 0,
    tab: "map"
  };
  var sampleWorks = D.readWorks(GV.sampleCsv).works;
  var cache = { key: "", result: null };
  var map = null, mapLayer = null;

  // ------------------------------------------------------------
  // run the engine (and remember the result for the same inputs)
  // ------------------------------------------------------------
  function runEngine() {
    var key = [state.source, state.fileName, state.works.length, state.gap, state.maxShift, state.useDelay].join("|");
    if (cache.key === key) return cache.result;

    var t0 = performance.now();
    var works = E.addDelay(state.works, state.useDelay);
    var relations = E.buildRelations(works);
    var before = E.detect(works, relations, state.gap);
    var proposals = E.reschedule(works, relations, state.gap, state.maxShift);
    var time = (performance.now() - t0) / 1000;

    // NOTE: new data or new settings = forget old rejections
    if (state.runKey !== key) { state.rejected = {}; state.runKey = key; }

    cache = { key: key, result: { works: works, relations: relations, before: before, proposals: proposals, time: time } };
    return cache.result;
  }

  // NOTE: the plan after the approved moves (changes every time a box is ticked)
  function afterPlan(r) {
    var shifts = {};
    r.proposals.forEach(function (p) {
      if (p.shift !== 0 && !state.rejected[p.work.id]) shifts[p.work.id] = p.shift;
    });
    var works = E.applyShifts(r.works, shifts);
    return { works: works, shifts: shifts, result: E.detect(works, r.relations, state.gap) };
  }

  // NOTE: true when the agency of a work is shown
  function shown(w) { return !state.hidden[w.agency]; }

  // ------------------------------------------------------------
  // draw everything
  // ------------------------------------------------------------
  function render() {
    var r;
    try {
      r = runEngine();
    } catch (e) {
      // NOTE: never show the real error to the user, only a simple message
      var text = e && e.message === "TOO_MANY_LINKS"
        ? "This file links too many works in the same area. Split it into smaller zones and upload again."
        : "The analysis could not run on this data. Check the file values and try again.";
      fill($("notice"), el("div", { class: "alert error" }, text));
      fill($("kpis"));
      return;
    }
    var after = afterPlan(r);
    renderNotice();
    renderKpis(r, after);
    renderMap(r, after);
    renderConflicts(r);
    renderPlan(r, after);
    renderImpact(r, after);
    renderData(r);
  }

  // NOTE: fictional data note + file notes
  function renderNotice() {
    var box = $("notice");
    if (state.source === "sample") {
      fill(box, el("div", { class: "note" },
        "Fictional sample data for a Riyadh test zone. Upload your own CSV to check real permits."));
    } else if (state.messages.length) {
      fill(box, el("div", { class: "alert warn" },
        state.messages.length + " rows were skipped. See the Data tab for details."));
    } else {
      fill(box);
    }
  }

  // NOTE: top KPIs (every number comes from the engine, nothing is fixed)
  function renderKpis(r, after) {
    var nb = r.before.conflicts.length, na = after.result.conflicts.length;
    var moves = r.proposals.filter(function (p) { return p.shift !== 0; }).length;
    var agencies = {};
    r.works.forEach(function (w) { agencies[w.agency] = true; });
    fill($("kpis"),
      kpi("Works and permits checked", r.works.length, Object.keys(agencies).length + " agencies", undefined, ""),
      kpi("Conflicts", na, "after approved changes", nb, "teal"),
      kpi("Conflict reduction", (nb ? Math.round((1 - na / nb) * 100) : 0) + "%",
        Object.keys(after.shifts).length + " of " + moves + " moves approved", undefined, "teal"),
      kpi("Analysis time", r.time < 1 ? Math.max(1, Math.round(r.time * 1000)) + " ms" : r.time.toFixed(2) + " s",
        "detection and rescheduling", undefined, ""));
  }

  // ------------------------------------------------------------
  // tab 1: map
  // ------------------------------------------------------------
  function setupMap() {
    // NOTE: the map is made only once
    map = L.map("map", { zoomControl: true, attributionControl: true });

    // NOTE: dark tiles (Esri) + normal street map (OpenStreetMap), both free without a key
    var dark = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 16, attribution: "Tiles &copy; Esri" });
    var street = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" });
    dark.addTo(map);
    L.control.layers({ "Dark map": dark, "Street map": street }, null, { collapsed: true }).addTo(map);
    mapLayer = L.layerGroup().addTo(map);
  }

  // NOTE: popup content built from elements (safe), not from an html string
  function popupFor(w) {
    return el("div", {},
      el("b", {}, w.id), " ", w.name, el("br"),
      w.agency + ", " + w.work_type, el("br"),
      D.dayToText(w.start) + " to " + D.dayToText(w.end), el("br"),
      "Closure: " + w.closure + ", priority " + w.priority);
  }

  function renderMap(r, after) {
    if (!map) setupMap();
    var plan = state.plan === "before" ? r.works : after.works;
    var conflicts = state.plan === "before" ? r.before.conflicts : after.result.conflicts;

    // NOTE: day slider goes from the first start to the last (delayed) end
    var first = Math.min.apply(null, plan.map(function (w) { return w.start; }));
    var last = Math.max.apply(null, plan.map(function (w) { return w.planEnd; }));
    var slider = $("day");
    slider.min = first; slider.max = last;
    if (state.day < first || state.day > last) state.day = first;
    slider.value = state.day;
    slider.disabled = state.allDays || first === last;
    $("day-out").textContent = D.dayToText(state.day);

    // NOTE: works to draw (filtered by agency and day)
    var view = plan.filter(function (w) {
      return shown(w) && (state.allDays || (w.start <= state.day && w.planEnd >= state.day));
    });
    var inConflict = {};
    conflicts.forEach(function (c) { inConflict[c.a.id] = true; inConflict[c.b.id] = true; });

    // NOTE: one circle per work zone: rose = conflict, purple = full closure, teal = ok
    mapLayer.clearLayers();
    var ids = {};
    view.forEach(function (w) {
      ids[w.id] = w;
      var color = inConflict[w.id] ? COLORS.rose : (w.closure === "Full" ? COLORS.purple : COLORS.teal);
      L.circle([w.lat, w.lon], { radius: w.radius_m, color: color, weight: 2, fillColor: color, fillOpacity: 0.25 })
        .bindPopup(popupFor(w))
        .bindTooltip(el("span", {}, w.id + " " + w.name))
        .addTo(mapLayer);
    });

    // NOTE: dashed line between the two works of each conflict
    conflicts.forEach(function (c) {
      var a = ids[c.a.id], b = ids[c.b.id];
      if (!a || !b) return;
      L.polyline([[a.lat, a.lon], [b.lat, b.lon]], { color: COLORS.rose, weight: 2, dashArray: "6 6" })
        .bindTooltip(el("span", {}, c.type))
        .addTo(mapLayer);
    });

    // NOTE: zoom to the works the first time, or when the data changes
    if (state.mapKey !== state.runKey) {
      state.mapKey = state.runKey;
      var bounds = L.latLngBounds(plan.map(function (w) { return [w.lat, w.lon]; }));
      map.fitBounds(bounds.pad(0.15), { maxZoom: 14 });
    }
    $("map-empty").hidden = view.length > 0;
  }

  // ------------------------------------------------------------
  // tab 2: conflicts
  // ------------------------------------------------------------
  function conflictCard(c) {
    return el("div", { class: "card " + c.level },
      el("div", { class: "top" }, el("span", {}, c.type), el("span", { class: "tag" }, c.level + " risk, score " + c.score)),
      el("div", { class: "pair" },
        c.a.id + " " + c.a.name + " ", el("span", {}, "(" + c.a.agency + ")"), el("br"),
        c.b.id + " " + c.b.name + " ", el("span", {}, "(" + c.b.agency + ")")),
      el("div", { class: "meta" }, c.detail + " Overlap of " + c.days + " days from " + D.dayToText(c.from) + "."));
  }

  function renderConflicts(r) {
    // NOTE: conflicts in the current plan, worst first
    var list = r.before.conflicts.filter(function (c) { return shown(c.a) || shown(c.b); });
    $("conf-title").textContent = list.length + (list.length === 1 ? " conflict" : " conflicts") + " in the current plan";
    fill($("conf-list"), list.length ? null : el("p", { class: "muted" }, "No spatial or temporal conflicts were found."));
    list.forEach(function (c) { $("conf-list").appendChild(conflictCard(c)); });

    // NOTE: repeated digging = same spot dug again within a few months
    var warns = r.before.warnings;
    fill($("warn-list"), warns.length ? null : el("p", { class: "muted" }, "No repeated digging found."));
    warns.forEach(function (w) {
      $("warn-list").appendChild(el("div", { class: "card warn" },
        el("div", { class: "pair" }, w.a.id + " " + w.a.name, el("br"), w.b.id + " " + w.b.name),
        el("div", { class: "meta" }, "Same spot dug again after " + w.wait +
          " days. Dig once: plan a joint trench or run the works back to back.")));
    });

    // NOTE: how many conflicts each agency is part of (helps plan coordination)
    var count = {};
    r.before.conflicts.forEach(function (c) {
      count[c.a.agency] = (count[c.a.agency] || 0) + 1;
      count[c.b.agency] = (count[c.b.agency] || 0) + 1;
    });
    var rows = Object.keys(count).sort(function (a, b) { return count[b] - count[a]; })
      .map(function (a) { return [a, count[a]]; });
    fill($("agency-table"), rows.length
      ? el("div", { class: "table-wrap" }, table(["Agency", "Conflicts"], rows, [1]))
      : el("p", { class: "muted" }, "No agency is part of a conflict."));
  }

  // ------------------------------------------------------------
  // tab 3: rescheduling
  // ------------------------------------------------------------
  function renderPlan(r, after) {
    // NOTE: approval table, one checkbox per suggested move
    var moves = r.proposals.filter(function (p) { return p.shift !== 0; });
    if (!moves.length) {
      fill($("moves"), el("p", { class: "muted" }, "No moves are needed with the current settings."));
    } else {
      var rows = moves.map(function (p) {
        var box = el("input", { type: "checkbox", "aria-label": "Approve move for " + p.work.id });
        box.checked = !state.rejected[p.work.id];
        box.addEventListener("change", function () {
          if (box.checked) delete state.rejected[p.work.id];
          else state.rejected[p.work.id] = true;
          render();
        });
        return [box, p.work.id, p.work.name, p.work.agency, D.dayToText(p.work.start),
          D.dayToText(p.work.start + p.shift), signed(p.shift), p.action];
      });
      fill($("moves"), table(["Approve", "ID", "Work", "Agency", "Old start", "New start", "Days moved", "Action"], rows, [6]));
    }

    // NOTE: works that can not be fixed by moving dates need a meeting
    var stuck = r.proposals.filter(function (p) { return p.stuck; });
    fill($("stuck"), stuck.length ? el("div", { class: "alert warn" },
      "Needs a coordination meeting: " + stuck.map(function (p) { return p.work.id + " (" + p.work.agency + ")"; }).join(", ") +
      ". No date in the allowed window clears the conflict.") : null);

    // NOTE: timeline of the plan after the approved moves
    var still = {};
    after.result.conflicts.forEach(function (c) { still[c.a.id] = true; still[c.b.id] = true; });
    var rowsG = after.works.filter(shown).slice().sort(function (a, b) { return a.start - b.start; }).map(function (w) {
      var color = still[w.id] ? COLORS.rose : (after.shifts[w.id] ? COLORS.teal : COLORS.purple);
      return {
        label: w.id + " " + w.name, start: w.start, end: w.end, color: color,
        tip: w.id + " " + w.name + " (" + w.agency + "): " + D.dayToText(w.start) + " to " + D.dayToText(w.end)
      };
    });
    if (state.tab === "plan") C.gantt($("gantt"), rowsG);
    state.lastGantt = rowsG;
    state.lastAfter = after;
  }

  // NOTE: download the new schedule (cells are made safe for Excel in data.js)
  function exportSchedule() {
    if (!state.lastAfter) return;
    var rows = state.lastAfter.works.map(function (w) {
      return [w.id, w.name, w.agency, w.work_type, D.dayToText(w.start), D.dayToText(w.end), w.closure, w.priority];
    });
    D.download("geovyn_new_schedule.csv",
      ["id", "name", "agency", "work_type", "start_date", "end_date", "closure", "priority"], rows);
  }

  // ------------------------------------------------------------
  // tab 4: traffic and fuel impact
  // ------------------------------------------------------------
  function renderImpact(r, after) {
    var before = E.dailyImpact(r.works, r.before.conflicts);
    var later = E.dailyImpact(after.works, after.result.conflicts);

    // NOTE: small helpers for the KPIs
    var clashDays = function (s) { return s.filter(function (p) { return p.clash; }).length; };
    var peak = function (s) { return Math.max.apply(null, s.map(function (p) { return p.fuel; })); };
    var avg = function (s) { return s.reduce(function (t, p) { return t + p.congestion; }, 0) / s.length; };

    fill($("impact-kpis"),
      kpi("Days with an active conflict", clashDays(later), "days where works clash", clashDays(before), "teal"),
      kpi("Peak extra fuel use", Math.round(peak(later)) + "%", "on the worst day", Math.round(peak(before)) + "%", "teal"),
      kpi("Average congestion index", Math.round(avg(later)), "over the whole period", Math.round(avg(before)), ""));

    state.lastLine = [
      { name: "Current plan", color: COLORS.rose, points: before.map(function (p) { return { day: p.day, y: p.congestion }; }) },
      { name: "After approved changes", color: COLORS.teal, fill: true, points: later.map(function (p) { return { day: p.day, y: p.congestion }; }) }
    ];
    if (state.tab === "impact") C.line($("line"), state.lastLine, "Daily congestion index");
  }

  // ------------------------------------------------------------
  // tab 5: data and assumptions
  // ------------------------------------------------------------
  function renderData(r) {
    // NOTE: notes from the file check (skipped rows and why)
    fill($("file-notes"), state.messages.length
      ? el("div", { class: "alert warn" }, ...state.messages.slice(0, 50).map(function (m) { return el("div", {}, m); }))
      : null);

    // NOTE: the input table with the expected delay of each work
    var rows = r.works.filter(shown).map(function (w) {
      return [w.id, w.name, w.agency, w.work_type, w.corridor, w.detour_route, w.lat, w.lon, w.radius_m,
        D.dayToText(w.start), D.dayToText(w.end), w.closure, w.priority, w.delay];
    });
    fill($("data-table"), table(["ID", "Name", "Agency", "Type", "Corridor", "Detour route", "Lat", "Lon", "Radius (m)",
      "Start", "End", "Closure", "Priority", "Expected delay (days)"], rows, [6, 7, 8, 12, 13]));

    // NOTE: every assumption the engine uses, so planners can review it
    fill($("assumptions"),
      el("li", {}, "Two works are on the same site when their work zones (center + radius) overlap."),
      el("li", {}, "A detour conflict happens when a work sends traffic to a road where another work is active."),
      el("li", {}, "Works on the same site need " + state.gap + " rest days between them."),
      el("li", {}, "Expected delay is a share of the planned duration by work type (fictional averages: road 18%, " +
        "intersection 20%, excavation 12%, utility 10%, building 8%). A model trained on real permit history can replace this."),
      el("li", {}, "Priority 1 works never move. Other works move up to " + state.maxShift +
        " days, and not sooner than " + E.MIN_LEAD_DAYS + " days from today."),
      el("li", {}, "Everything runs in your browser. Uploaded files are never sent anywhere."));
  }

  // ------------------------------------------------------------
  // agency checkboxes in the settings panel
  // ------------------------------------------------------------
  function renderAgencies() {
    var names = {};
    state.works.forEach(function (w) { names[w.agency] = true; });
    var box = $("agencies");
    fill(box);
    Object.keys(names).sort().forEach(function (name) {
      var input = el("input", { type: "checkbox" });
      input.checked = !state.hidden[name];
      input.addEventListener("change", function () {
        if (input.checked) delete state.hidden[name]; else state.hidden[name] = true;
        render();
      });
      box.appendChild(el("label", {}, input, name));
    });
  }

  // ------------------------------------------------------------
  // tabs
  // ------------------------------------------------------------
  var TABS = ["map", "conf", "plan", "impact", "data"];

  function openTab(name, focus) {
    state.tab = name;
    TABS.forEach(function (t) {
      var on = t === name;
      $("tab-" + t).setAttribute("aria-selected", on ? "true" : "false");
      $("tab-" + t).tabIndex = on ? 0 : -1;
      $("view-" + t).hidden = !on;
    });
    if (focus) $("tab-" + name).focus();
    // NOTE: charts and map need to be drawn when their tab is visible (they need the real width)
    if (name === "map" && map) map.invalidateSize();
    if (name === "plan" && state.lastGantt) C.gantt($("gantt"), state.lastGantt);
    if (name === "impact" && state.lastLine) C.line($("line"), state.lastLine, "Daily congestion index");
  }

  // ------------------------------------------------------------
  // events (user actions)
  // ------------------------------------------------------------
  function setWorks(works, messages, source, fileName) {
    state.works = works; state.messages = messages; state.source = source; state.fileName = fileName || "";
    state.hidden = {};
    renderAgencies();
    render();
  }

  function bindEvents() {
    // NOTE: data source: sample or upload
    document.querySelectorAll('input[name="source"]').forEach(function (radio) {
      radio.addEventListener("change", function () {
        $("upload-box").hidden = radio.value !== "upload";
        if (radio.value === "sample") setWorks(sampleWorks, [], "sample");
      });
    });

    // NOTE: read the picked file inside the browser only
    $("file").addEventListener("change", function () {
      var file = this.files && this.files[0];
      if (!file) return;
      $("file-name").textContent = file.name.slice(0, 60);
      D.readFile(file, function (res) {
        if (!res.works) {
          fill($("notice"), el("div", { class: "alert error" }, "The file was not loaded. " + res.messages.slice(0, 3).join(" ")));
          return;
        }
        setWorks(res.works, res.messages, "upload", file.name + ":" + file.size + ":" + file.lastModified);
      });
    });

    // NOTE: template = the sample file, so users can see the format
    $("btn-template").addEventListener("click", function () {
      var rows = GV.sampleCsv.split("\n").map(function (l) { return l.split(","); });
      D.download("geovyn_template.csv", rows[0], rows.slice(1, 3));
    });

    // NOTE: engine settings
    $("gap").addEventListener("input", function () { state.gap = +this.value; $("gap-out").textContent = this.value; render(); });
    $("shift").addEventListener("input", function () { state.maxShift = +this.value; $("shift-out").textContent = this.value; render(); });
    $("delay").addEventListener("change", function () { state.useDelay = this.checked; render(); });

    // NOTE: map controls
    document.querySelectorAll('input[name="plan"]').forEach(function (radio) {
      radio.addEventListener("change", function () { state.plan = radio.value; render(); });
    });
    $("all-days").addEventListener("change", function () { state.allDays = this.checked; render(); });
    $("day").addEventListener("input", function () { state.day = +this.value; render(); });

    // NOTE: tabs with mouse and with arrow keys
    TABS.forEach(function (t, i) {
      $("tab-" + t).addEventListener("click", function () { openTab(t); });
      $("tab-" + t).addEventListener("keydown", function (e) {
        if (e.key === "ArrowRight") openTab(TABS[(i + 1) % TABS.length], true);
        if (e.key === "ArrowLeft") openTab(TABS[(i + TABS.length - 1) % TABS.length], true);
      });
    });

    $("btn-export").addEventListener("click", exportSchedule);

    // NOTE: redraw charts when the window size changes
    var timer = null;
    window.addEventListener("resize", function () {
      clearTimeout(timer);
      timer = setTimeout(function () { openTab(state.tab); }, 150);
    });
  }

  // ------------------------------------------------------------
  // start
  // ------------------------------------------------------------
  // NOTE: anti clickjacking: if another site puts GeoVyn inside a hidden frame, do not show it
  if (window.top !== window.self) {
    document.body.replaceChildren(el("p", { class: "alert error" }, "GeoVyn can not be opened inside another site."));
    return;
  }

  // NOTE: on phones the settings start folded to save space
  if (window.matchMedia("(max-width: 960px)").matches) $("settings").open = false;
  $("signature").textContent = GV.signature.text;
  bindEvents();
  setWorks(sampleWorks, [], "sample");
})();
