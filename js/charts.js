/* ============================================================
   GeoVyn - charts.js
   Author : Aseel  (GitHub: aseel-aihub)
   Copyright (c) 2026 Aseel. All rights reserved. See LICENSE.
   ============================================================ */
// NOTE: two small charts drawn with SVG: a timeline (gantt) and a line chart.
//       no chart library is used, and text is added with textContent only (safe from injection)

"use strict";

GV.charts = (function () {
  var NS = "http://www.w3.org/2000/svg";
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // NOTE: make one svg element with attributes
  function svgEl(tag, attrs, text) {
    var node = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // NOTE: list of month starts between two day numbers (for the x axis labels)
  function monthTicks(first, last) {
    var ticks = [];
    var d = new Date(first * 86400000);
    var m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    while (m.getTime() / 86400000 <= last) {
      ticks.push({ day: m.getTime() / 86400000, label: MONTHS[m.getUTCMonth()] + " " + m.getUTCFullYear() });
      m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1));
    }
    return ticks;
  }

  // NOTE: draw the x axis with month labels and light grid lines
  function drawMonths(svg, first, last, x, top, bottom) {
    var ticks = monthTicks(first, last);
    var step = Math.max(1, Math.ceil(ticks.length / 8));
    ticks.forEach(function (t, i) {
      svg.appendChild(svgEl("line", { x1: x(t.day), x2: x(t.day), y1: top, y2: bottom, stroke: "#262F48" }));
      if (i % step === 0) {
        svg.appendChild(svgEl("text", { x: x(t.day) + 4, y: bottom + 16 }, t.label));
      }
    });
  }

  // NOTE: timeline chart. rows = [{label, start, end, color, tip}]
  function gantt(box, rows) {
    box.replaceChildren();
    if (!rows.length) return;
    var width = Math.max(box.clientWidth, 640);
    var labelW = Math.min(300, width * 0.36);
    var rowH = 28, top = 8, height = top + rows.length * rowH + 30;

    var first = Math.min.apply(null, rows.map(function (r) { return r.start; }));
    var last = Math.max.apply(null, rows.map(function (r) { return r.end; }));
    var span = Math.max(last - first + 1, 1);
    var x = function (day) { return labelW + (day - first) / span * (width - labelW - 10); };

    var svg = svgEl("svg", { width: width, height: height, role: "img", "aria-label": "Timeline of works" });
    drawMonths(svg, first, last, x, top, height - 30);

    // NOTE: one bar per work, with the name on the left and a hover tip
    rows.forEach(function (r, i) {
      var y = top + i * rowH;
      svg.appendChild(svgEl("text", { x: labelW - 10, y: y + 18, "text-anchor": "end" }, r.label));
      var bar = svgEl("rect", {
        x: x(r.start), y: y + 5, rx: 3,
        width: Math.max(x(r.end + 1) - x(r.start), 3), height: rowH - 10, fill: r.color
      });
      bar.appendChild(svgEl("title", {}, r.tip));
      svg.appendChild(bar);
    });
    box.appendChild(svg);
  }

  // NOTE: line chart. series = [{name, color, fill, points:[{day, y}]}], y goes 0..100
  function line(box, series, title) {
    box.replaceChildren();
    var all = [];
    series.forEach(function (s) { all = all.concat(s.points); });
    if (!all.length) return;
    var width = Math.max(box.clientWidth, 520), height = 340;
    var left = 46, right = 10, top = 10, bottom = height - 30;

    var first = Math.min.apply(null, all.map(function (p) { return p.day; }));
    var last = Math.max.apply(null, all.map(function (p) { return p.day; }));
    var span = Math.max(last - first, 1);
    var x = function (day) { return left + (day - first) / span * (width - left - right); };
    var y = function (v) { return bottom - v / 100 * (bottom - top); };

    var svg = svgEl("svg", { width: width, height: height, role: "img", "aria-label": title });

    // NOTE: y grid lines every 20 points
    [0, 20, 40, 60, 80, 100].forEach(function (v) {
      svg.appendChild(svgEl("line", { x1: left, x2: width - right, y1: y(v), y2: y(v), stroke: "#262F48" }));
      svg.appendChild(svgEl("text", { x: left - 8, y: y(v) + 4, "text-anchor": "end" }, String(v)));
    });
    drawMonths(svg, first, last, x, top, bottom);

    // NOTE: one step line per series (the value stays the same for the whole day)
    series.forEach(function (s) {
      if (!s.points.length) return;
      var d = "";
      s.points.forEach(function (p, i) {
        var px = x(p.day).toFixed(1), py = y(p.y).toFixed(1);
        d += i === 0 ? "M" + px + " " + py : " H" + px + " V" + py;
      });

      // NOTE: soft colored area under the line
      if (s.fill) {
        var startX = x(s.points[0].day).toFixed(1);
        svg.appendChild(svgEl("path", {
          d: d + " V" + bottom + " H" + startX + " Z", fill: s.color, "fill-opacity": "0.12", stroke: "none"
        }));
      }

      var path = svgEl("path", { d: d, fill: "none", stroke: s.color, "stroke-width": 2 });
      path.appendChild(svgEl("title", {}, s.name));
      svg.appendChild(path);
    });

    box.appendChild(svg);
  }

  return { gantt: gantt, line: line };
})();
