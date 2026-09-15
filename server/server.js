/* ================================================================
   GForce backend — self-hosted, single Node process.

   Serves three things:
     1. The barangay portal      →  http://<host>:<port>/
     2. The admin dashboard      →  http://<host>:<port>/admin
     3. The shared REST API      →  http://<host>:<port>/api/*

   Storage is a single JSON file (data.json, created on first run
   from the seed below) — intentionally not a real RDBMS. For an
   LGU-scale deployment (a few hundred requests per disaster event,
   a handful of concurrent staff) a file store is plenty, and it
   means "npm install && npm start" is the entire setup — no
   database server to install, configure, or secure separately.

   If this ever needs to run multiple admin sessions concurrently
   with heavy write contention, swap `readState`/`writeState` below
   for a real database — every route already goes through those two
   functions, so that's the only place that would need to change.
   ================================================================ */

const express = require("express");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8787;
const DATA_FILE = path.join(__dirname, "data.json");

// ---------------------------------------------------------------
// Reference data — kept identical in shape to admin/js/data.js so
// the two frontends never disagree about what a barangay or a
// disaster-type code is. If you add a barangay in one place, add it
// here too (or, better: point admin/js/data.js's BARANGAYS constant
// at GET /api/barangays instead of hardcoding it — see README).
// ---------------------------------------------------------------
const BARANGAYS = [
  { code:"SIS", name:"Brgy. San Isidro",   psgc:"04-21-14-021", lat:14.652, lng:121.049 },
  { code:"MAL", name:"Brgy. Malinis",      psgc:"04-21-14-013", lat:14.661, lng:121.038 },
  { code:"STC", name:"Brgy. Sta. Cruz",    psgc:"04-21-14-027", lat:14.640, lng:121.062 },
  { code:"LKB", name:"Brgy. Look-Bunga",   psgc:"04-21-14-009", lat:14.629, lng:121.031 }
];
const DISASTER_CODES = { flood:"FLD", typhoon:"TYP", fire:"FIR", earthquake:"EQK", landslide:"LSD" };

function offsetTime(seconds){ return new Date(Date.now()+seconds*1000).toISOString(); }

function seedState(){
  return {
    meta:{ lguName:"LGU San Isidro", disaster:"Flood — Typhoon Basyang", updated:new Date().toISOString() },
    inventory:[
      { id:"food",    label:"Food Packs",     unit:"pack", onHand:2000, reserved:0, warehouse:"Central Warehouse A" },
      { id:"water",   label:"Drinking Water", unit:"L",    onHand:8000, reserved:0, warehouse:"Central Warehouse A" },
      { id:"vehicle", label:"Rescue Vehicles",unit:"unit", onHand:6,    reserved:0, warehouse:"Motor Pool" }
    ],
    evac:[
      { id:"ec1", name:"San Isidro Elem. School", capacity:600, occupied:410, barangay:"Brgy. San Isidro" },
      { id:"ec2", name:"Brgy. Malinis Covered Court", capacity:300, occupied:295, barangay:"Brgy. Malinis" },
      { id:"ec3", name:"Sta. Cruz National HS", capacity:800, occupied:180, barangay:"Brgy. Sta. Cruz" }
    ],
    tickets:[
      {
        id:"SIS-FLD-2026-1042", barangay:"Brgy. San Isidro", barangayCode:"SIS", disasterCode:"FLD",
        contact:"Kagawad R. Domingo", channel:"app", loggedBy:null, lat:14.652, lng:121.049,
        items:[{res:"food",qty:1000},{res:"water",qty:2000},{res:"vehicle",qty:2}],
        reason:"Flooding affecting approximately 1,800 residents; two access roads impassable.",
        affectedPop:1800, status:"Recommended",
        aiPriority:"High", aiFoodQty:850, aiScore:88,
        approvedQty:null, approvedBy:null, approvalNote:"",
        barcode:null, deliveredConfirmedBy:null, requestPhoto:null, deliveryPhoto:null,
        submitted:offsetTime(-5*3600),
        log:[
          {t:offsetTime(-5*3600), a:"Request submitted by Brgy. San Isidro."},
          {t:offsetTime(-4.5*3600), a:"Verified by Officer M. Reyes — location and population confirmed."},
          {t:offsetTime(-3*3600), a:"AI prioritization engine returned recommendation (High priority, score 88)."}
        ]
      },
      {
        id:"MAL-FLD-2026-1043", barangay:"Brgy. Malinis", barangayCode:"MAL", disasterCode:"FLD",
        contact:"Brgy. Capt. E. Santos", channel:"app", loggedBy:null, lat:14.661, lng:121.038,
        items:[{res:"food",qty:600},{res:"water",qty:1200},{res:"vehicle",qty:1}],
        reason:"Evacuation center at 98% capacity, requesting resupply and additional transport.",
        affectedPop:950, status:"Approved",
        aiPriority:"High", aiFoodQty:600, aiScore:91,
        approvedQty:600, approvedBy:"Mayor's Office", approvalNote:"Approved as recommended — critical evac capacity.",
        barcode:null, deliveredConfirmedBy:null, requestPhoto:null, deliveryPhoto:null,
        submitted:offsetTime(-9*3600),
        log:[
          {t:offsetTime(-9*3600), a:"Request submitted by Brgy. Malinis."},
          {t:offsetTime(-8*3600), a:"Verified by Officer M. Reyes."},
          {t:offsetTime(-7*3600), a:"AI prioritization engine returned recommendation (High priority, score 91)."},
          {t:offsetTime(-6*3600), a:"Approved by Mayor's Office — 600 food packs, 1200L water, 1 rescue vehicle."}
        ]
      },
      {
        id:"STC-FLD-2026-1039", barangay:"Brgy. Sta. Cruz", barangayCode:"STC", disasterCode:"FLD",
        contact:"Kagawad L. Bautista", channel:"app", loggedBy:null, lat:14.640, lng:121.062,
        items:[{res:"food",qty:400},{res:"water",qty:800},{res:"vehicle",qty:0}],
        reason:"Preventive resupply ahead of expected water level rise.",
        affectedPop:520, status:"Delivered",
        aiPriority:"Medium", aiFoodQty:400, aiScore:63,
        approvedQty:400, approvedBy:"Mayor's Office", approvalNote:"Approved as recommended.",
        barcode:"GF-1039-7734", deliveredConfirmedBy:null, requestPhoto:null, deliveryPhoto:null,
        submitted:offsetTime(-30*3600),
        log:[
          {t:offsetTime(-30*3600), a:"Request submitted by Brgy. Sta. Cruz."},
          {t:offsetTime(-29*3600), a:"Verified by Officer M. Reyes."},
          {t:offsetTime(-27*3600), a:"AI recommendation returned (Medium priority, score 63)."},
          {t:offsetTime(-26*3600), a:"Approved by Mayor's Office."},
          {t:offsetTime(-24*3600), a:"Resources released from Central Warehouse A."},
          {t:offsetTime(-20*3600), a:"Marked in transit — Vehicle unit RV-02."},
          {t:offsetTime(-15*3600), a:"Delivered to Brgy. Sta. Cruz staging point."}
        ]
      },
      {
        id:"LKB-FLD-2026-1030", barangay:"Brgy. Look-Bunga", barangayCode:"LKB", disasterCode:"FLD",
        contact:"Brgy. Capt. J. Villar", channel:"app", loggedBy:null, lat:14.629, lng:121.031,
        items:[{res:"food",qty:250},{res:"water",qty:500},{res:"vehicle",qty:0}],
        reason:"Minor flooding, household resupply.",
        affectedPop:210, status:"Received",
        aiPriority:"Low", aiFoodQty:250, aiScore:41,
        approvedQty:250, approvedBy:"Mayor's Office", approvalNote:"Approved as recommended.",
        barcode:"GF-1030-2210", deliveredConfirmedBy:"Brgy. Capt. J. Villar", requestPhoto:null, deliveryPhoto:null,
        submitted:offsetTime(-52*3600),
        log:[
          {t:offsetTime(-52*3600), a:"Request submitted by Brgy. Look-Bunga."},
          {t:offsetTime(-50*3600), a:"Verified by Officer M. Reyes."},
          {t:offsetTime(-48*3600), a:"AI recommendation returned (Low priority, score 41)."},
          {t:offsetTime(-47*3600), a:"Approved by Mayor's Office."},
          {t:offsetTime(-44*3600), a:"Released and dispatched."},
          {t:offsetTime(-38*3600), a:"Delivered to barangay hall."},
          {t:offsetTime(-36*3600), a:"Receipt confirmed via barcode scan by Brgy. Capt. J. Villar."}
        ]
      }
    ],
    alerts:[
      { id:"a1", t:offsetTime(-1*3600), level:"critical", text:"Brgy. Malinis evacuation center at 98% capacity." },
      { id:"a2", t:offsetTime(-3*3600), level:"warning", text:"River level near Brgy. San Isidro at Alert Level 2 (rising)." },
      { id:"a3", t:offsetTime(-6*3600), level:"info", text:"Road closure: Bridge along Purok 4, San Isidro impassable." }
    ],
    personnel:[
      { id:"p1", name:"Rescuer A. Dizon",   role:"Rescue Team",     barangay:"Brgy. San Isidro", status:"Deployed", ticketId:"SIS-FLD-2026-1042", since:offsetTime(-4*3600) },
      { id:"p2", name:"Medic C. Reyes",     role:"Medical",         barangay:"Brgy. Malinis",    status:"Deployed", ticketId:"MAL-FLD-2026-1043", since:offsetTime(-6*3600) },
      { id:"p3", name:"Vol. Team Sta. Cruz",role:"Relief Packing",  barangay:"Brgy. Sta. Cruz",  status:"Returned", ticketId:"STC-FLD-2026-1039", since:offsetTime(-28*3600) }
    ],
    donations:[
      { id:"d1", donor:"Philippine Red Cross — Cavite Chapter", resource:"food", qty:300, received:offsetTime(-30*3600), note:"Delivered directly to Central Warehouse A." },
      { id:"d2", donor:"Zonta Club of Makati", resource:"water", qty:1500, received:offsetTime(-20*3600), note:"" }
    ]
  };
}

// ---------------------------------------------------------------
// Storage — plain JSON file, read fresh and written whole on every
// mutation. Simple, human-inspectable (you can `cat data.json` on
// the server to see exactly what's stored), and easy to back up —
// just copy the file.
// ---------------------------------------------------------------
function readState(){
  if(!fs.existsSync(DATA_FILE)){
    writeState(seedState());
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}
function writeState(state){
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

// Same ID scheme as the admin app: <barangay>-<disaster>-<year>-<seq>,
// sequence scoped per barangay+disaster+year and reset to 0000 each
// January. Kept here too so tickets filed directly through the portal
// (which never touches admin/js/data.js) still get a correct ID.
function nextId(state, barangayCode, disasterCode, year){
  const prefix = `${barangayCode}-${disasterCode}-${year}-`;
  const nums = state.tickets
    .filter(t=>t.id.startsWith(prefix))
    .map(t=>parseInt(t.id.slice(prefix.length),10))
    .filter(n=>!isNaN(n));
  const next = nums.length ? Math.max(...nums)+1 : 0;
  return prefix + String(next).padStart(4,"0");
}

const app = express();
app.use(express.json({ limit:"15mb" })); // generous limit — request/delivery photos are base64

// Permissive CORS: this is a small, self-hosted internal tool, and the
// portal + admin may end up on different subdomains/ports depending on
// how you deploy it. Tighten `Access-Control-Allow-Origin` to your
// actual domain(s) once you know them.
app.use((req, res, next)=>{
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if(req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/* ---------------- API ---------------- */

// Full state — the admin dashboard bootstraps from this and pushes
// updates back with PUT (see README for why it's whole-state, not
// per-field, and the tradeoff that comes with that).
app.get("/api/state", (req, res)=>{
  res.json(readState());
});
app.put("/api/state", (req, res)=>{
  if(!req.body || typeof req.body !== "object") return res.status(400).json({ error:"Expected a JSON state object." });
  writeState(req.body);
  res.json({ ok:true });
});

app.get("/api/barangays", (req, res)=> res.json(BARANGAYS));
app.get("/api/meta", (req, res)=> res.json(readState().meta));

// Read-only inventory mirror for the portal's "resource levels" tab —
// same numbers the admin dashboard's Allocation view computes from.
app.get("/api/inventory", (req, res)=>{
  const state = readState();
  const reserved = {};
  state.tickets.forEach(t=>{
    if(["Approved","Released","In Transit"].includes(t.status)){
      t.items.forEach(i=>{ reserved[i.res] = (reserved[i.res]||0) + (i.res==="food" && t.approvedQty!=null ? t.approvedQty : i.qty); });
    }
  });
  res.json(state.inventory.map(inv=>({
    ...inv,
    reservedNow: reserved[inv.id]||0,
    available: inv.onHand - (reserved[inv.id]||0)
  })));
});

// A barangay's own requests (portal's "My Requests" archive). Every
// portal-issued request carries barangayCode, so this is a simple filter.
app.get("/api/tickets", (req, res)=>{
  const state = readState();
  const { barangayCode } = req.query;
  const tickets = barangayCode ? state.tickets.filter(t=>t.barangayCode===barangayCode) : state.tickets;
  res.json(tickets);
});

// Portal submits a new request here. Runs the same validation the
// admin app's form does client-side, but re-checked server-side since
// this endpoint is open to whatever's on the other end of the network.
app.post("/api/tickets", (req, res)=>{
  const b = req.body || {};
  const barangay = BARANGAYS.find(x=>x.code===b.barangayCode);
  if(!barangay) return res.status(400).json({ error:"Unknown barangay code." });
  if(!b.contact || !String(b.contact).trim()) return res.status(400).json({ error:"Contact person is required." });
  if(!b.reason || !String(b.reason).trim()) return res.status(400).json({ error:"Reason is required." });
  const affectedPop = Math.max(0, Math.round(Number(b.affectedPop)||0));
  if(affectedPop <= 0) return res.status(400).json({ error:"Enter a valid number of affected residents." });
  const items = ["food","water","vehicle"].map(res=>({
    res, qty: Math.max(0, Math.round(Number(b.items?.[res])||0))
  }));
  if(!items.some(i=>i.qty>0)) return res.status(400).json({ error:"Request at least one item." });

  const state = readState();
  const disasterCode = DISASTER_CODES[(state.meta.disaster||"").toLowerCase().split(" ")[0]] || "FLD";
  const year = new Date().getFullYear();
  const channel = ["sms","radio","phone"].includes(b.channel) ? b.channel : "app";

  const ticket = {
    id: nextId(state, barangay.code, disasterCode, year),
    barangay: barangay.name, barangayCode: barangay.code, disasterCode,
    contact: String(b.contact).trim(),
    channel, loggedBy: b.loggedBy || null,
    lat: barangay.lat, lng: barangay.lng,
    items, reason: String(b.reason).trim(), affectedPop,
    status:"Requested",
    aiPriority:null, aiFoodQty:null, aiScore:null,
    approvedQty:null, approvedBy:null, approvalNote:"",
    barcode:null, deliveredConfirmedBy:null,
    requestPhoto: b.requestPhoto || null, deliveryPhoto:null,
    submitted: new Date().toISOString(),
    log:[{ t:new Date().toISOString(), a: channel==="app"
      ? `Request submitted by ${barangay.name} via the barangay portal.`
      : `Request relayed via ${channel} from ${barangay.name}, logged by ${b.loggedBy}.` }]
  };
  state.tickets.unshift(ticket);
  writeState(state);
  res.status(201).json(ticket);
});

/* ---------------- static sites ---------------- */
// Portal at the root — this is what gets sent to barangays.
app.use("/", express.static(path.join(__dirname, "..", "portal")));
// Admin dashboard at /admin — for LGU staff only.
app.use("/admin", express.static(path.join(__dirname, "..", "admin")));

app.listen(PORT, ()=>{
  console.log(`GForce server running:`);
  console.log(`  Barangay portal → http://localhost:${PORT}/`);
  console.log(`  Admin dashboard → http://localhost:${PORT}/admin`);
  console.log(`  API             → http://localhost:${PORT}/api`);
});
