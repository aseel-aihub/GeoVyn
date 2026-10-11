/* ============================================================
   GeoVyn - sample-data.js
   Author : Aseel  (GitHub: aseel-aihub)
   Copyright (c) 2026 Aseel. All rights reserved. See LICENSE.
   ============================================================ */

"use strict";

// NOTE: FICTIONAL sample data for a Riyadh test zone (not real permits)
// NOTE: kept inside a js file so the page also works when opened from the computer
//       (browsers block reading local csv files directly)
GV.sampleCsv = [
  "id,name,agency,work_type,corridor,detour_route,lat,lon,radius_m,start_date,end_date,closure,priority",
  "PRJ-101,Thumamah Rd east widening,RCRC,Road,Thumamah Rd,King Abdulaziz Rd,24.8462,46.7105,900,2026-11-15,2027-01-20,Full,1",
  "EXC-204,Water main replacement,NWC,Excavation,King Abdulaziz Rd,,24.8215,46.6890,450,2026-12-05,2027-01-10,Partial,3",
  "EXC-207,Fiber duct installation,STC,Utility,Thumamah Rd,,24.8478,46.7148,350,2026-12-01,2026-12-20,Partial,3",
  "PRJ-112,Othman bin Affan Rd north upgrade,RCRC,Road,Othman bin Affan Rd,Anas bin Malik Rd,24.8350,46.6585,1000,2026-12-01,2027-03-31,Partial,1",
  "EXC-215,Power cable extension - Al Nakheel,SEC,Utility,Al Nakheel internal roads,,24.7455,46.6370,400,2026-11-05,2026-11-30,Partial,2",
  "EXC-216,Sewer line works - Al Nakheel,NWC,Excavation,Al Nakheel internal roads,,24.7462,46.6382,400,2026-11-20,2026-12-20,Partial,3",
  "EXC-219,Storm drainage - Al Nakheel,Riyadh Municipality,Excavation,Al Nakheel internal roads,,24.7449,46.6377,350,2027-01-15,2027-02-20,Partial,3",
  "BLD-301,Commercial building - Al Yasmin,Private developer,Building,Al Yasmin internal roads,,24.8270,46.6420,250,2026-10-20,2027-06-30,None,2",
  "EXC-224,Street lighting cables - Al Sahafa,Riyadh Municipality,Utility,Al Sahafa internal roads,,24.8030,46.6310,300,2026-11-10,2026-12-05,Partial,3",
  "PRJ-130,Northern Ring x Othman intersection,Riyadh Municipality,Intersection,Northern Ring Rd,Othman bin Affan Rd,24.7905,46.6610,700,2027-01-10,2027-03-01,Full,2",
  "EXC-233,Irrigation line - Al Malqa park,Riyadh Municipality,Excavation,Al Malqa internal roads,,24.8105,46.6050,300,2026-11-01,2026-12-15,None,3",
  "EXC-240,Telecom duct - King Abdulaziz Rd,STC,Utility,King Abdulaziz Rd,,24.8010,46.6880,300,2026-12-10,2026-12-24,Partial,3"
].join("\n");
