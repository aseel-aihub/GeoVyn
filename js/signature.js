/* ============================================================
   GeoVyn - Spatial-Temporal Conflict Detection Engine
   Author : Aseel  (GitHub: aseel-aihub)
   Copyright (c) 2026 Aseel. All rights reserved.
   See LICENSE file. Copying or reusing this code or idea
   without written permission from the author is not allowed.
   ============================================================ */

"use strict";

// NOTE: one shared object for the whole app (all files add their parts to it)
var GV = window.GV || {};
window.GV = GV;

// NOTE: one place for the author info, the page shows it in the footer
GV.signature = Object.freeze({
  author: "Aseel",
  github: "aseel-aihub",
  project: "GeoVyn",
  year: 2026,
  text: "GeoVyn \u00A9 2026 Aseel (github.com/aseel-aihub). All rights reserved."
});
