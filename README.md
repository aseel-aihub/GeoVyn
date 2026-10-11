# GeoVyn

**Spatial-temporal conflict detection and rescheduling for city project**

محرك التنبؤ وإدارة التعارضات المكانية والزمنية

An independent project that finds clashes between road works and excavation permits before work starts,
and suggests new dates that remove them.

> Author: **Aseel** ([@aseel-aihub](https://github.com/aseel-aihub))
> Copyright (c) 2026 Aseel. All rights reserved. See [LICENSE](LICENSE).

**Live site:** https://aseel-aihub.github.io/GeoVyn/

## What it does

1. Reads excavation permits and road / infrastructure projects (dates + location).
2. Finds conflicts: two works on the same site at the same time, or a work that blocks the detour road of a closure.
3. Warns about repeated digging at the same spot.
4. Suggests new dates (high priority works stay fixed). The planner approves or rejects each move.
5. Estimates daily congestion and extra fuel use before and after the changes.

Everything runs in the browser. Uploaded files never leave the device.

## Run it

- **Online:** open the live site link.
- **On your computer:** download the repository and open `index.html` in a browser. No install needed.

## Files

| File | What it does |
|---|---|
| `index.html` | The page and its security rules (Content Security Policy) |
| `css/style.css` | Colors and layout from the GeoVyn presentation |
| `js/signature.js` | Author info used in the app |
| `js/data.js` | Reads and checks CSV files, safe CSV export |
| `js/engine.js` | Conflict detection, delay estimate, rescheduling, impact model |
| `js/charts.js` | Timeline and line chart (SVG) |
| `js/app.js` | Builds the screens and handles user actions |
| `js/sample-data.js` | **Fictional** sample data used by the page |
| `sample_works.csv` | The same fictional data as a CSV file |
| `vendor/leaflet/` | Map library, stored in the project (no outside CDN) |

## CSV format

`id, name, agency, work_type, corridor, detour_route, lat, lon, radius_m, start_date, end_date, closure, priority`

- `work_type`: Road, Excavation, Utility, Building, Intersection
- `closure`: Full, Partial, None
- `priority`: 1 (high, never moved), 2, 3
- dates: `YYYY-MM-DD`

## Data note

All data in this repository is **fictional** and made for the demo. Upload your own CSV to check real permits.

## Security

See [SECURITY.md](SECURITY.md).

## License

Proprietary. No copying, reuse or redistribution without written permission from the author. See [LICENSE](LICENSE).
