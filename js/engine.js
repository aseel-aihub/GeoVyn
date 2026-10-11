/* ============================================================
   GeoVyn - engine.js
   Author : Aseel  (GitHub: aseel-aihub)
   Copyright (c) 2026 Aseel. All rights reserved. See LICENSE.
   ============================================================ */
// NOTE: the "brain" of GeoVyn. Steps:
//   1) estimate the expected delay of each work
//   2) find which works are linked (same site or detour road)
//   3) detect spatial-temporal conflicts
//   4) reschedule works to remove conflicts
//   5) estimate the daily traffic and fuel impact
// NOTE: all dates here are "day numbers" (whole days), see data.js

"use strict";

GV.engine = (function () {
  // NOTE: average delay as a share of the planned duration for each work type
  //       (FICTIONAL numbers for the prototype, a trained model can replace them with real data)
  var DELAY_RATE = { Road: 0.18, Intersection: 0.20, Excavation: 0.12, Utility: 0.10, Building: 0.08 };
  var DELAY_EXTRA = { Full: 3, Partial: 1, None: 0 };

  // NOTE: how much each closure type loads the road network
  var CLOSURE_WEIGHT = { Full: 1.0, Partial: 0.5, None: 0.15 };

  // NOTE: KAPSARC study on Riyadh roads: congestion can raise fuel use by up to 29%
  var MAX_FUEL_INCREASE = 29;

  // NOTE: works that dig the ground (used to find repeated digging at the same spot)
  var DIGGING = { Excavation: true, Utility: true };
  var REPEAT_DIG_DAYS = 180;

  // NOTE: a moved work needs at least this many days to get its permit ready
  var MIN_LEAD_DAYS = 14;

  // NOTE: safety limit, too many linked works = the file is refused (stops very slow runs)
  var MAX_RELATIONS = 1500;

  // NOTE: step 1 - expected delay and the "risky" end date we plan with (planEnd)
  function addDelay(works, useDelay) {
    return works.map(function (w) {
      var duration = w.end - w.start + 1;
      var delay = Math.round(duration * (DELAY_RATE[w.work_type] || 0.1) + DELAY_EXTRA[w.closure]);
      return Object.assign({}, w, { delay: delay, planEnd: w.end + (useDelay ? delay : 0) });
    });
  }

  // NOTE: overlap area of two circles (r1, r2) whose centers are d meters apart
  function circleOverlap(d, r1, r2) {
    if (d >= r1 + r2) return 0;
    var small = Math.min(r1, r2);
    if (d <= Math.abs(r1 - r2)) return Math.PI * small * small;
    var a1 = r1 * r1 * Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1));
    var a2 = r2 * r2 * Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2));
    var k = 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));
    return a1 + a2 - k;
  }

  // NOTE: step 2 - find linked works. Does not depend on dates, so it runs once
  function buildRelations(works) {
    // NOTE: center point of all works, used to turn lat/lon into meters
    var lat0 = 0, lon0 = 0;
    works.forEach(function (w) { lat0 += w.lat; lon0 += w.lon; });
    lat0 /= works.length; lon0 /= works.length;
    var kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110540;

    var relations = [];
    for (var i = 0; i < works.length; i++) {
      for (var j = i + 1; j < works.length; j++) {
        var a = works[i], b = works[j];

        // NOTE: same site = the two work circles touch; ratio = how much they overlap
        var dx = (a.lon - b.lon) * kx, dy = (a.lat - b.lat) * ky;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d <= a.radius_m + b.radius_m) {
          var small = Math.min(a.radius_m, b.radius_m);
          var ratio = circleOverlap(d, a.radius_m, b.radius_m) / (Math.PI * small * small);
          relations.push({ a: a.id, b: b.id, kind: "site", ratio: Math.round(ratio * 100) / 100 });
        }

        // NOTE: detour = one work sends traffic to the road where the other work is
        [[a, b], [b, a]].forEach(function (pair) {
          var first = pair[0], second = pair[1];
          if (first.detour_route && first.closure !== "None" && second.closure !== "None" &&
              first.detour_route.toLowerCase() === second.corridor.toLowerCase()) {
            relations.push({ a: first.id, b: second.id, kind: "detour", ratio: 0 });
          }
        });

        // NOTE: stop early if the file links too many works together
        if (relations.length > MAX_RELATIONS) throw new Error("TOO_MANY_LINKS");
      }
    }
    return relations;
  }

  // NOTE: number of shared days between two date ranges (gap = rest days needed between them)
  function sharedDays(aStart, aEnd, bStart, bEnd, gap) {
    if (aStart <= bEnd + gap && bStart <= aEnd + gap) {
      return Math.max(Math.min(aEnd, bEnd) - Math.max(aStart, bStart) + 1, 1);
    }
    return 0;
  }

  // NOTE: conflict score from 0 to 100 (higher = worse)
  function score(kind, a, b, days, ratio) {
    var s = kind === "detour" ? 50 : 40;
    s += CLOSURE_WEIGHT[a.closure] * 12 + CLOSURE_WEIGHT[b.closure] * 12;
    s += Math.min(days / 2, 20);
    s += ratio * 10;
    if (a.priority === 1 || b.priority === 1) s += 5;
    return Math.floor(Math.min(s, 100));
  }

  // NOTE: score -> simple label
  function level(s) {
    if (s >= 75) return "High";
    if (s >= 55) return "Medium";
    return "Low";
  }

  // NOTE: works list -> lookup by id
  function byId(works) {
    var map = {};
    works.forEach(function (w) { map[w.id] = w; });
    return map;
  }

  // NOTE: step 3 - check every linked pair: do their dates clash?
  function detect(works, relations, gapDays) {
    var map = byId(works);
    var conflicts = [], warnings = [];

    relations.forEach(function (rel) {
      var a = map[rel.a], b = map[rel.b];
      if (!a || !b) return;
      var rest = rel.kind === "site" ? gapDays : 0;
      var days = sharedDays(a.start, a.planEnd, b.start, b.planEnd, rest);

      // NOTE: dates clash = a real conflict
      if (days > 0) {
        var s = score(rel.kind, a, b, days, rel.ratio);
        conflicts.push({
          a: a, b: b, kind: rel.kind,
          type: rel.kind === "site" ? "Same site at the same time" : "Detour route blocked",
          detail: rel.kind === "site"
            ? "Both work zones overlap (" + Math.round(rel.ratio * 100) + "% of the smaller zone)."
            : a.name + " sends traffic to " + a.detour_route + ", where " + b.name + " is working.",
          days: days, from: Math.max(a.start, b.start), score: s, level: level(s)
        });
      } else if (rel.kind === "site" && DIGGING[a.work_type] && DIGGING[b.work_type]) {
        // NOTE: no clash, but the same spot is dug twice within a few months = warning
        var wait = Math.max(a.start, b.start) - Math.min(a.planEnd, b.planEnd);
        if (wait >= 0 && wait <= REPEAT_DIG_DAYS) {
          warnings.push({ a: a, b: b, wait: wait });
        }
      }
    });

    // NOTE: worst conflicts first
    conflicts.sort(function (x, y) { return y.score - x.score; });
    return { conflicts: conflicts, warnings: warnings };
  }

  // NOTE: total conflict score a work would have with the works already placed
  function placementCost(work, start, end, placed, links, gapDays) {
    var cost = 0;
    (links[work.id] || []).forEach(function (l) {
      var other = placed[l.other];
      if (!other) return;
      var rest = l.kind === "site" ? gapDays : 0;
      var days = sharedDays(start, end, other.start, other.planEnd, rest);
      if (days > 0) cost += score(l.kind, work, other, days, l.ratio);
    });
    return cost;
  }

  // NOTE: step 4 - rescheduling (greedy constraint search)
  //       high priority works keep their dates, the others move to the closest date
  //       that removes the conflicts (or at least cuts them by half)
  function reschedule(works, relations, gapDays, maxShift) {
    // NOTE: for each work, the list of works it is linked to
    var links = {};
    relations.forEach(function (r) {
      (links[r.a] = links[r.a] || []).push({ other: r.b, kind: r.kind, ratio: r.ratio });
      (links[r.b] = links[r.b] || []).push({ other: r.a, kind: r.kind, ratio: r.ratio });
    });

    // NOTE: a work can not be moved closer to today than the permit lead time
    var earliest = GV.data.todayDay() + MIN_LEAD_DAYS;

    // NOTE: place works one by one: high priority first, then by start date
    var order = works.slice().sort(function (x, y) { return x.priority - y.priority || x.start - y.start; });
    var placed = {}, proposals = [];

    order.forEach(function (w) {
      var delay = w.planEnd - w.end;
      var baseCost = placementCost(w, w.start, w.planEnd, placed, links, gapDays);
      var bestShift = 0, bestCost = baseCost;

      // NOTE: only medium and low priority works can move. Try +1, -1, +2, -2 ...
      if (w.priority > 1 && baseCost > 0) {
        for (var k = 1; k <= maxShift && bestCost > 0; k++) {
          [k, -k].forEach(function (shift) {
            if (bestCost === 0) return;
            if (shift < 0 && w.start + shift < earliest) return;
            var cost = placementCost(w, w.start + shift, w.end + shift + delay, placed, links, gapDays);
            if (cost < bestCost) { bestShift = shift; bestCost = cost; }
          });
        }
      }

      // NOTE: a move that fixes less than half of the problem is not worth it
      if (bestCost > 0 && bestCost > baseCost * 0.5) { bestShift = 0; bestCost = baseCost; }

      // NOTE: save the work with its new dates
      placed[w.id] = Object.assign({}, w, {
        start: w.start + bestShift, end: w.end + bestShift, planEnd: w.planEnd + bestShift
      });

      // NOTE: simple text for what the planner should do
      var when = Math.abs(bestShift) + " days " + (bestShift > 0 ? "later" : "earlier");
      var action;
      if (baseCost === 0) action = "Keep dates";
      else if (w.priority === 1) action = "Keep dates (high priority)";
      else if (bestShift !== 0 && bestCost === 0) action = "Start " + when;
      else if (bestShift !== 0) action = "Start " + when + ", then coordinate the rest";
      else action = "No free slot, needs coordination meeting";

      proposals.push({ work: w, shift: bestShift, action: action, stuck: action.indexOf("No free slot") === 0 });
    });

    return proposals;
  }

  // NOTE: apply only the moves the user approved
  function applyShifts(works, shifts) {
    return works.map(function (w) {
      var s = shifts[w.id] || 0;
      return s ? Object.assign({}, w, { start: w.start + s, end: w.end + s, planEnd: w.planEnd + s }) : w;
    });
  }

  // NOTE: step 5 - daily impact model
  //       more closures and conflicts on a day = more congestion and more fuel use
  function dailyImpact(works, conflicts) {
    var first = Infinity, last = -Infinity;
    works.forEach(function (w) { first = Math.min(first, w.start); last = Math.max(last, w.planEnd); });
    var load = new Array(last - first + 1).fill(0);
    var clash = new Array(last - first + 1).fill(false);

    // NOTE: every active work adds load by its closure type
    works.forEach(function (w) {
      for (var d = w.start; d <= w.planEnd; d++) load[d - first] += CLOSURE_WEIGHT[w.closure];
    });

    // NOTE: every active conflict adds extra load on top
    var map = byId(works);
    conflicts.forEach(function (c) {
      var a = map[c.a.id], b = map[c.b.id];
      for (var d = Math.max(a.start, b.start); d <= Math.min(a.planEnd, b.planEnd); d++) {
        load[d - first] += c.score / 50;
        clash[d - first] = true;
      }
    });

    // NOTE: congestion index 0-100, fuel scaled to the 29% upper bound, clash = a conflict is active that day
    return load.map(function (l, i) {
      var congestion = Math.min(l * 14, 100);
      return { day: first + i, congestion: congestion, fuel: congestion / 100 * MAX_FUEL_INCREASE, clash: clash[i] };
    });
  }

  return {
    MIN_LEAD_DAYS: MIN_LEAD_DAYS,
    addDelay: addDelay,
    buildRelations: buildRelations,
    detect: detect,
    reschedule: reschedule,
    applyShifts: applyShifts,
    dailyImpact: dailyImpact
  };
})();
