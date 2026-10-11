/* ============================================================
   GeoVyn - data.js
   Author : Aseel  (GitHub: aseel-aihub)
   Copyright (c) 2026 Aseel. All rights reserved. See LICENSE.
   ============================================================ */
// NOTE: this file reads csv text, checks every value, and makes the exported csv safe.
//       nothing is sent to any server, everything stays in the browser.

"use strict";

GV.data = (function () {
  // NOTE: limits so a big or bad file can not freeze the page
  var MAX_FILE_BYTES = 1024 * 1024;
  var MAX_ROWS = 300;
  var MAX_TEXT_LEN = 80;
  var DAY_MS = 86400000;

  // NOTE: the columns every input file must have
  var REQUIRED = ["id", "name", "agency", "work_type", "corridor", "detour_route",
    "lat", "lon", "radius_m", "start_date", "end_date", "closure", "priority"];

  // NOTE: allowed values for the choice columns
  var WORK_TYPES = ["Road", "Excavation", "Utility", "Building", "Intersection"];
  var CLOSURES = ["Full", "Partial", "None"];

  // NOTE: rough box around Saudi Arabia, used to reject wrong coordinates
  var LAT_MIN = 16.0, LAT_MAX = 32.5, LON_MIN = 34.5, LON_MAX = 55.7;

  // NOTE: id can only have letters, numbers, - and _
  var ID_PATTERN = /^[A-Za-z0-9_-]{1,30}$/;
  // NOTE: hidden characters (control, zero width, text direction tricks) we remove
  var HIDDEN_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g;

  // NOTE: clean one text value: remove hidden chars, trim spaces, cut long text
  function cleanText(value) {
    if (value === undefined || value === null) return "";
    return String(value).replace(HIDDEN_CHARS, "").trim().slice(0, MAX_TEXT_LEN);
  }

  // NOTE: "Road", "road", "ROAD" -> "Road"
  function titleCase(text) {
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  }

  // NOTE: turn text into a normal finite number, or throw an error
  function toNumber(value, field) {
    var text = cleanText(value);
    if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(text)) throw new Error(field + " must be a number");
    var n = Number(text);
    if (!isFinite(n)) throw new Error(field + " must be a normal number");
    return n;
  }

  // NOTE: dates are stored as "day numbers" (days since 1970) to avoid time zone bugs
  function toDay(value, field) {
    var text = cleanText(value);
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (!m) throw new Error(field + " must be written as YYYY-MM-DD");
    var y = +m[1], mo = +m[2], d = +m[3];
    var t = Date.UTC(y, mo - 1, d);
    var check = new Date(t);
    // NOTE: this catches dates like 2026-02-30
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
      throw new Error(field + " is not a real date");
    }
    if (y < 2020 || y > 2040) throw new Error("dates must be between 2020 and 2040");
    return Math.round(t / DAY_MS);
  }

  // NOTE: day number -> "YYYY-MM-DD"
  function dayToText(day) {
    return new Date(day * DAY_MS).toISOString().slice(0, 10);
  }

  // NOTE: today's date (on the user's computer) as a day number
  function todayDay() {
    var now = new Date();
    return Math.round(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS);
  }

  // NOTE: simple csv reader: handles commas, quotes "..." and new lines inside quotes
  function parseCsv(text) {
    var rows = [], row = [], cell = "", inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQuotes) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { cell += ch; }
      } else if (ch === '"' && cell === "") {
        // NOTE: a quote only starts a quoted cell at the beginning of the cell
        inQuotes = true;
      } else if (ch === ",") {
        row.push(cell); cell = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
        // NOTE: stop reading early when the file has too many rows
        if (rows.length > MAX_ROWS + 1) break;
      } else {
        cell += ch;
      }
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    // NOTE: drop fully empty lines
    return rows.filter(function (r) { return r.some(function (c) { return c.trim() !== ""; }); });
  }

  // NOTE: check one row and return a clean work object (throws an Error if bad)
  function checkRow(r) {
    var id = cleanText(r.id);
    if (!ID_PATTERN.test(id)) throw new Error("id must be letters, numbers, - or _ (max 30)");

    // NOTE: location must be inside Saudi Arabia
    var lat = toNumber(r.lat, "lat");
    var lon = toNumber(r.lon, "lon");
    if (lat < LAT_MIN || lat > LAT_MAX || lon < LON_MIN || lon > LON_MAX) {
      throw new Error("coordinates are outside Saudi Arabia");
    }

    // NOTE: size of the work zone in meters
    var radius = toNumber(r.radius_m, "radius_m");
    if (radius < 10 || radius > 3000) throw new Error("radius_m must be between 10 and 3000");

    // NOTE: dates must be real, in order and not too long
    var start = toDay(r.start_date, "start_date");
    var end = toDay(r.end_date, "end_date");
    if (end < start) throw new Error("end_date is before start_date");
    if (end - start > 1500) throw new Error("work duration is longer than 1500 days");

    // NOTE: choice columns must match the allowed lists
    var workType = titleCase(cleanText(r.work_type));
    if (WORK_TYPES.indexOf(workType) === -1) throw new Error("work_type must be one of " + WORK_TYPES.join(", "));
    var closure = titleCase(cleanText(r.closure));
    if (CLOSURES.indexOf(closure) === -1) throw new Error("closure must be Full, Partial or None");

    // NOTE: priority 1 = high (never moved), 2 = medium, 3 = low
    var priority = toNumber(r.priority, "priority");
    if ([1, 2, 3].indexOf(priority) === -1) throw new Error("priority must be 1, 2 or 3");

    // NOTE: name and agency can not be empty
    var name = cleanText(r.name), agency = cleanText(r.agency);
    if (!name || !agency) throw new Error("name and agency are required");

    return {
      id: id, name: name, agency: agency, work_type: workType,
      corridor: cleanText(r.corridor), detour_route: cleanText(r.detour_route),
      lat: lat, lon: lon, radius_m: radius,
      start: start, end: end, closure: closure, priority: priority
    };
  }

  // NOTE: read csv text -> {works, messages}. works is null when nothing is valid
  function readWorks(text) {
    var messages = [];
    var rows = parseCsv(text);
    if (rows.length < 2) return { works: null, messages: ["The file is empty or has no data rows."] };

    // NOTE: header row -> column positions (first copy of a repeated column wins)
    var header = rows[0].map(function (h) { return cleanText(h).toLowerCase(); });
    var pos = {};
    header.forEach(function (h, i) { if (!(h in pos)) pos[h] = i; });
    var missing = REQUIRED.filter(function (c) { return !(c in pos); });
    if (missing.length) return { works: null, messages: ["Missing columns: " + missing.join(", ")] };

    var body = rows.slice(1);
    if (body.length > MAX_ROWS) {
      messages.push("Only the first " + MAX_ROWS + " rows were used.");
      body = body.slice(0, MAX_ROWS);
    }

    // NOTE: check each row, skip bad ones and say why
    var works = [], seen = {};
    body.forEach(function (cells, i) {
      var r = {};
      REQUIRED.forEach(function (c) { r[c] = cells[pos[c]]; });
      try {
        var w = checkRow(r);
        if (seen[w.id]) throw new Error("duplicate id");
        seen[w.id] = true;
        works.push(w);
      } catch (e) {
        messages.push("Row " + (i + 2) + " skipped: " + e.message);
      }
    });

    if (!works.length) return { works: null, messages: messages.concat(["No valid rows were found."]) };
    return { works: works, messages: messages };
  }

  // NOTE: read a file the user picked (checks type and size first)
  function readFile(file, done) {
    if (!/\.csv$/i.test(file.name)) return done({ works: null, messages: ["Only .csv files are accepted."] });
    if (file.size > MAX_FILE_BYTES) return done({ works: null, messages: ["File is larger than 1 MB."] });
    var reader = new FileReader();
    reader.onload = function () { done(readWorks(String(reader.result))); };
    reader.onerror = function () { done({ works: null, messages: ["The file could not be read."] }); };
    reader.readAsText(file, "utf-8");
  }

  // NOTE: make one csv cell safe:
  //       - a text cell that starts with = + - @ gets a ' so Excel does not run it as a formula
  //       - quotes and commas are wrapped correctly
  function safeCell(value) {
    var text = String(value);
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = "'" + text;
    if (/[",\n\r]/.test(text)) text = '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  // NOTE: build a csv file from rows and start the download (no server needed)
  function download(fileName, header, rows) {
    var lines = [header.map(safeCell).join(",")];
    rows.forEach(function (r) { lines.push(r.map(safeCell).join(",")); });
    var blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  return {
    REQUIRED: REQUIRED,
    readWorks: readWorks,
    readFile: readFile,
    download: download,
    dayToText: dayToText,
    todayDay: todayDay
  };
})();
