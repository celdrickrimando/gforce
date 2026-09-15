/* ============================================================
   GForce — Data layer
   In-browser mock store, persisted to localStorage so the
   prototype behaves statefully across reloads. Swap `DB.save`
   for real API calls when the backend is ready — the rest of
   the app only talks to the DB object below.
   ============================================================ */

const PIPELINE_STEPS = [
  "Requested","Verified","Recommended","Approved","Released","In Transit","Delivered","Received"
];

// ---------------------------------------------------------------
// Barangay registry — real request/ticket IDs are built from this,
// not an arbitrary chessboard grid. Rationale: a barangay is a known
// point-of-origin (the office filing the request), not an ambiguous
// area, so identity-based coding avoids the "which cell does this
// irregular polygon belong to" problem a uniform grid runs into.
// `psgc` mocks the real Philippine Standard Geographic Code shape
// (region.province.city.barangay) so the ID scheme could map onto
// the actual PSA registry a real LGU deployment would use.
//
// Same-name collisions: within one city/municipality, barangay names
// are already unique by law — a municipality can't have two barangays
// both named "San Isidro" — so at the scope this prototype targets
// (one LGU cluster), `code` colliding is structurally impossible.
// It only becomes a real risk if GForce is ever run across MULTIPLE
// LGUs at once, since "San Isidro", "Poblacion", "Santo Niño" etc.
// repeat constantly nationwide. The fix for that future case is NOT
// a smarter initialism — it's to stop deriving `code` from the name
// at all and instead suffix it with digits from `psgc` (which IS
// nationally unique), e.g. two unrelated "San Isidro"s would become
// `SIS21` and `SIS04`. assertUniqueBarangayCodes() below fails loudly
// the moment a second LGU's roster gets merged in with a colliding
// code, so this can't silently ship a duplicate ID prefix.
// ---------------------------------------------------------------
const BARANGAYS = [
  { code:"SIS", name:"Brgy. San Isidro",   psgc:"04-21-14-021", lat:14.652, lng:121.049 },
  { code:"MAL", name:"Brgy. Malinis",      psgc:"04-21-14-013", lat:14.661, lng:121.038 },
  { code:"STC", name:"Brgy. Sta. Cruz",    psgc:"04-21-14-027", lat:14.640, lng:121.062 },
  { code:"LKB", name:"Brgy. Look-Bunga",   psgc:"04-21-14-009", lat:14.629, lng:121.031 }
];
function assertUniqueBarangayCodes(){
  const seen = new Map();
  BARANGAYS.forEach(b=>{
    if(seen.has(b.code)){
      console.warn(`[GForce] Duplicate barangay code "${b.code}" for ${seen.get(b.code)} and ${b.name} — ticket IDs will collide. Suffix one with PSGC digits, e.g. "${b.code}${b.psgc.slice(-2)}".`);
    }
    seen.set(b.code, b.name);
  });
}
assertUniqueBarangayCodes();
const DISASTER_CODES = { flood:"FLD", typhoon:"TYP", fire:"FIR", earthquake:"EQK", landslide:"LSD" };

const SEED = {
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
      id:"SIS-FLD-2026-1042", barangay:"Brgy. San Isidro", contact:"Kagawad R. Domingo",
      lat:14.652, lng:121.049,
      items:[{res:"food",qty:1000},{res:"water",qty:2000},{res:"vehicle",qty:2}],
      reason:"Flooding affecting approximately 1,800 residents; two access roads impassable.",
      affectedPop:1800,
      status:"Recommended",
      aiPriority:"High", aiFoodQty:850, aiScore:88,
      approvedQty:null, approvedBy:null, approvalNote:"",
      barcode:null, deliveredConfirmedBy:null,
      submitted:offsetTime(-5*3600),
      log:[
        {t:offsetTime(-5*3600), a:"Request submitted by Brgy. San Isidro."},
        {t:offsetTime(-4.5*3600), a:"Verified by Officer M. Reyes — location and population confirmed."},
        {t:offsetTime(-3*3600), a:"AI prioritization engine returned recommendation (High priority, score 88)."}
      ]
    },
    {
      id:"MAL-FLD-2026-1043", barangay:"Brgy. Malinis", contact:"Brgy. Capt. E. Santos",
      lat:14.661, lng:121.038,
      items:[{res:"food",qty:600},{res:"water",qty:1200},{res:"vehicle",qty:1}],
      reason:"Evacuation center at 98% capacity, requesting resupply and additional transport.",
      affectedPop:950,
      status:"Approved",
      aiPriority:"High", aiFoodQty:600, aiScore:91,
      approvedQty:600, approvedBy:"Mayor's Office", approvalNote:"Approved as recommended — critical evac capacity.",
      barcode:null, deliveredConfirmedBy:null,
      submitted:offsetTime(-9*3600),
      log:[
        {t:offsetTime(-9*3600), a:"Request submitted by Brgy. Malinis."},
        {t:offsetTime(-8*3600), a:"Verified by Officer M. Reyes."},
        {t:offsetTime(-7*3600), a:"AI prioritization engine returned recommendation (High priority, score 91)."},
        {t:offsetTime(-6*3600), a:"Approved by Mayor's Office — 600 food packs, 1200L water, 1 rescue vehicle."}
      ]
    },
    {
      id:"STC-FLD-2026-1039", barangay:"Brgy. Sta. Cruz", contact:"Kagawad L. Bautista",
      lat:14.640, lng:121.062,
      items:[{res:"food",qty:400},{res:"water",qty:800},{res:"vehicle",qty:0}],
      reason:"Preventive resupply ahead of expected water level rise.",
      affectedPop:520,
      status:"Delivered",
      aiPriority:"Medium", aiFoodQty:400, aiScore:63,
      approvedQty:400, approvedBy:"Mayor's Office", approvalNote:"Approved as recommended.",
      barcode:"GF-1039-7734", deliveredConfirmedBy:null,
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
      id:"LKB-FLD-2026-1030", barangay:"Brgy. Look-Bunga", contact:"Brgy. Capt. J. Villar",
      lat:14.629, lng:121.031,
      items:[{res:"food",qty:250},{res:"water",qty:500},{res:"vehicle",qty:0}],
      reason:"Minor flooding, household resupply.",
      affectedPop:210,
      status:"Received",
      aiPriority:"Low", aiFoodQty:250, aiScore:41,
      approvedQty:250, approvedBy:"Mayor's Office", approvalNote:"Approved as recommended.",
      barcode:"GF-1030-2210", deliveredConfirmedBy:"Brgy. Capt. J. Villar",
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

  // Composition tags for stock already reflected in `inventory[].onHand`
  // above (not additive — these describe where part of the seeded
  // totals came from). New donations logged at runtime via
  // DB.receiveDonation() DO add to onHand, since that's genuinely new
  // stock arriving.
  donations:[
    { id:"d1", donor:"Philippine Red Cross — Cavite Chapter", resource:"food", qty:300, received:offsetTime(-30*3600), note:"Delivered directly to Central Warehouse A." },
    { id:"d2", donor:"Zonta Club of Makati", resource:"water", qty:1500, received:offsetTime(-20*3600), note:"" }
  ]
};

function offsetTime(seconds){
  return new Date(Date.now()+seconds*1000).toISOString();
}

const DB = {
  state:null,

  load(){
    const raw = localStorage.getItem("gforce_state_v4");
    if(raw){
      try{ this.state = JSON.parse(raw); return; }catch(e){ /* fall through to seed */ }
    }
    this.state = JSON.parse(JSON.stringify(SEED));
    this.save();
  },

  save(){
    localStorage.setItem("gforce_state_v4", JSON.stringify(this.state));
    this.pushToServer();
  },

  reset(){
    localStorage.removeItem("gforce_state_v4");
    this.load();
  },

  getTicket(id){ return this.state.tickets.find(t=>t.id===id); },

  addLog(ticket, text){
    ticket.log.push({ t:new Date().toISOString(), a:text });
  },

  // ---------------------------------------------------------------
  // Ticket ID = <barangay code>-<disaster code>-<year>-<sequence>, e.g.
  // "SIS-FLD-2026-0001". The year was added once we realized the
  // sequence alone would eventually roll past 9999 for a busy
  // barangay; scoping the sequence to a year keeps IDs short forever
  // (resets to 0001 each year) instead of growing an extra digit
  // every decade, and it also makes multi-year disaster-history
  // queries trivial ("all of SIS's 2026 flood requests" = one prefix
  // match) — useful for the after-action report.
  // ---------------------------------------------------------------
  // Sequence is scoped to barangay+disaster+year and always rendered as
  // 4 digits, i.e. 0000–9999 before rolling into next year's sequence
  // (which starts back at 0000 since the year is part of the prefix).
  nextId(barangayCode, disasterCode, year){
    const prefix = `${barangayCode}-${disasterCode}-${year}-`;
    const nums = this.state.tickets
      .filter(t=>t.id.startsWith(prefix))
      .map(t=>parseInt(t.id.slice(prefix.length),10))
      .filter(n=>!isNaN(n));
    const next = nums.length ? Math.max(...nums) + 1 : 0;
    if(next > 9999){
      console.warn(`[GForce] ${prefix} sequence exceeded 9999 for ${year} — this barangay has filed 10,000+ ${disasterCode} requests this year. IDs will still be unique but will run to 5 digits.`);
    }
    return prefix + String(next).padStart(4,"0");
  },

  createTicket(payload){
    const barangayCode = payload.barangayCode || "GEN";
    const disasterCode = payload.disasterCode || "FLD";
    const year = new Date().getFullYear();
    const channel = payload.channel || "app";
    const CHANNEL_LABEL = { app:"the app", sms:"SMS relay", radio:"radio relay", phone:"phone relay" };
    const t = {
      id:this.nextId(barangayCode, disasterCode, year),
      barangay:payload.barangay,
      barangayCode, disasterCode,
      contact:payload.contact,
      channel, loggedBy:payload.loggedBy || null,
      lat:payload.lat ?? (14.63+Math.random()*0.04), lng:payload.lng ?? (121.03+Math.random()*0.04),
      items:payload.items,
      reason:payload.reason,
      affectedPop:payload.affectedPop,
      status:"Requested",
      aiPriority:null, aiFoodQty:null, aiScore:null,
      approvedQty:null, approvedBy:null, approvalNote:"",
      barcode:null, deliveredConfirmedBy:null,
      requestPhoto:payload.requestPhoto || null,
      deliveryPhoto:null,
      submitted:new Date().toISOString(),
      log:[{ t:new Date().toISOString(), a: channel==="app"
        ? `Request submitted by ${payload.barangay}.`
        : `Request relayed via ${CHANNEL_LABEL[channel]} from ${payload.barangay}, logged by ${payload.loggedBy}.` }]
    };
    this.state.tickets.unshift(t);
    this.save();
    return t;
  },

  attachDeliveryPhoto(ticket, dataUrl){
    ticket.deliveryPhoto = dataUrl;
    this.addLog(ticket, "Delivery photo attached as evidence.");
    this.save();
  },

  // ---------------------------------------------------------------
  // Volunteer & personnel tracking — deployed alongside goods so
  // staffing gaps show up on the same operating picture as resource
  // shortages, per roadmap item 4.
  // ---------------------------------------------------------------
  deployPersonnel({ name, role, barangay, ticketId }){
    const p = {
      id:"p"+Date.now(), name, role, barangay, ticketId:ticketId||null,
      status:"Deployed", since:new Date().toISOString()
    };
    this.state.personnel.unshift(p);
    this.save();
    return p;
  },

  returnPersonnel(id){
    const p = this.state.personnel.find(p=>p.id===id);
    if(!p) return;
    p.status = "Returned";
    p.returnedAt = new Date().toISOString();
    this.save();
  },

  // ---------------------------------------------------------------
  // Donor / external-aid ledger — roadmap item 5. Donated goods are
  // added straight into the same inventory pool used for allocation
  // (so approving officials work off one real number, not two), but
  // every addition is logged here with its source so an auditor can
  // still separate government-procured stock from donated stock.
  // ---------------------------------------------------------------
  receiveDonation({ donor, resource, qty, note }){
    const inv = this.state.inventory.find(i=>i.id===resource);
    if(!inv) return null;
    inv.onHand += qty;
    const d = { id:"d"+Date.now(), donor, resource, qty, received:new Date().toISOString(), note:note||"" };
    this.state.donations.unshift(d);
    this.save();
    return d;
  },

  advance(ticket, toStatus, note){
    ticket.status = toStatus;
    this.addLog(ticket, note || `Status updated to ${toStatus}.`);
    this.save();
  },

  // ---------------------------------------------------------------
  // Single source of truth for "who can do what, at which stage."
  // Used both to decide which buttons to render AND to re-check
  // before an action actually executes, so a forged/late click
  // (console call, stale render, double-click race) can't bypass
  // the role gate the UI appears to enforce.
  // ---------------------------------------------------------------
  canPerform(role, action, ticket){
    const rules = {
      verify:        r => r==="verifier" && ticket.status==="Requested",
      reject:        r => r==="verifier" && ticket.status==="Requested",
      clarify:       r => r==="verifier" && ticket.status==="Requested",
      release:       r => r==="admin"    && ticket.status==="Approved",
      transit:       r => r==="admin"    && ticket.status==="Released",
      deliver:       r => r==="admin"    && ticket.status==="In Transit",
      approve:       r => r==="official" && ticket.status==="Recommended",
      modify:        r => r==="official" && ticket.status==="Recommended",
      rejectofficial:r => r==="official" && ticket.status==="Recommended",
      attachphoto:   r => r==="admin"    && ["Released","In Transit","Delivered"].includes(ticket.status)
    };
    return !!(rules[action] && rules[action](role));
  },

  // ---------------------------------------------------------------
  // Integrity / fraud-risk flags for a ticket, computed against the
  // rest of the ticket pool. Pattern-level only: flags a ticket for
  // human review, never auto-rejects it.
  // ---------------------------------------------------------------
  fraudFlags(ticket){
    const flags = [];
    const sameBarangay = this.state.tickets.filter(t=>
      t.id!==ticket.id && t.barangay===ticket.barangay
    );
    const submittedMs = new Date(ticket.submitted).getTime();
    const duplicate = sameBarangay.find(t=>{
      const diffHrs = Math.abs(submittedMs - new Date(t.submitted).getTime())/3600000;
      return diffHrs <= 6 && t.status!=="Requested" ? true : diffHrs <= 6;
    });
    if(duplicate){
      flags.push({ level:"warning", text:`Another request from ${ticket.barangay} was filed within 6 hours (${duplicate.id}).` });
    }
    const foodQty = ticket.items.find(i=>i.res==="food")?.qty || 0;
    const ratio = ticket.affectedPop>0 ? foodQty/ticket.affectedPop : 0;
    if(ratio > 1.2){
      flags.push({ level:"critical", text:`Requested ${ratio.toFixed(2)} food packs per affected resident — well above the typical ~0.6 ratio. Verify population count.` });
    }
    return flags;
  },

  // ---------------------------------------------------------------
  // Tickets the given role currently owes an action on — powers the
  // notification bell so the right role is nudged automatically
  // instead of relying on someone checking the dashboard.
  // ---------------------------------------------------------------
  pendingFor(role){
    const stageByRole = {
      verifier: "Requested",
      official: "Recommended",
      admin: ["Approved","Released","In Transit"]
    };
    const target = stageByRole[role];
    if(!target) return [];
    const stages = Array.isArray(target) ? target : [target];
    return this.state.tickets.filter(t=>stages.includes(t.status));
  },

  // ---------------------------------------------------------------
  // Backend sync — kept deliberately non-blocking so nothing about the
  // app's synchronous rendering model had to change. load()/save()
  // above still write to localStorage instantly, exactly as before;
  // this layer reconciles with the shared server underneath that.
  //
  //   - On boot (and every SYNC_INTERVAL_MS after), pull the server's
  //     state — this is how requests filed on the barangay portal
  //     actually show up here.
  //   - Every DB.save() also fires a PUT of the full state to the
  //     server, fire-and-forget.
  //
  // This is a "last write wins, whole-state" sync — fine for one LGU
  // ops room with a handful of staff, not a CRDT. If two admins edit
  // at the exact same moment, whichever PUT lands last overwrites the
  // other's change server-side (their own browser still shows their
  // own edit until the next pull). Good enough at this scale; flagged
  // here so it's a known tradeoff, not a silent one.
  // ---------------------------------------------------------------
  API_BASE: "/api",
  serverReachable: false,

  async pullFromServer(){
    try{
      const res = await fetch(`${this.API_BASE}/state`, { cache:"no-store" });
      if(!res.ok) throw new Error(res.status);
      const serverState = await res.json();
      this.state = serverState;
      localStorage.setItem("gforce_state_v4", JSON.stringify(this.state));
      this.serverReachable = true;
      return true;
    }catch(e){
      this.serverReachable = false;
      return false;
    }
  },

  pushToServer(){
    fetch(`${this.API_BASE}/state`, {
      method:"PUT", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(this.state)
    }).then(res=>{ this.serverReachable = res.ok; })
      .catch(()=>{ this.serverReachable = false; });
  },

  // Called once at startup after the (synchronous, localStorage-backed)
  // initial render, then on an interval. Skips re-rendering while the
  // admin is actively typing so a poll can't wipe out a half-filled form.
  startSync(onUpdate, intervalMs){
    const tick = async ()=>{
      const changed = await this.pullFromServer();
      if(changed && typeof onUpdate === "function"){
        const typing = document.activeElement && ["INPUT","TEXTAREA"].includes(document.activeElement.tagName);
        if(!typing) onUpdate();
      }
    };
    tick();
    setInterval(tick, intervalMs || 25000);
    document.addEventListener("visibilitychange", ()=>{ if(!document.hidden) tick(); });
  }
};

DB.load();

// Keep BARANGAYS in sync with the server's copy rather than trusting
// the hardcoded list above forever — mutated in place (not reassigned)
// so every other file's reference to the same array stays valid.
// Falls back to the hardcoded list above if the server's unreachable.
fetch(`${DB.API_BASE}/barangays`, { cache:"no-store" })
  .then(res=> res.ok ? res.json() : null)
  .then(list=>{
    if(!Array.isArray(list) || !list.length) return;
    BARANGAYS.splice(0, BARANGAYS.length, ...list);
    assertUniqueBarangayCodes();
  })
  .catch(()=>{ /* offline / server not reachable — keep the local copy */ });
