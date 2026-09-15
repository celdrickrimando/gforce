/* ============================================================
   GForce — App shell / router
   ============================================================ */
const TITLES = {
  overview:      ["Overview", "Common operating picture for active response."],
  gis:           ["GIS Disaster Map", "Where the disaster is, who's affected, and where resources sit."],
  tickets:       ["Requests / Ticketing", "Barangay resource requests and their approval pipeline."],
  inventory:     ["Resource Allocation", "Available inventory and how it's committed across requests."],
  ai:            ["AI Prioritization", "Interface to the prioritization model — recommends, does not decide."],
  "barcode-requestor": ["My Pickup Barcode", "Present this code on-site to collect released resources."],
  "barcode-verifier":  ["Barcode Verifier", "Confirm the right goods reach the right requestor."],
  transparency:  ["Transparency Report", "Full audit trail from request to verified delivery."],
  alerts:        ["Alerts & Comms", "Broadcast conditions and hazards to connected barangays."],
  evac:          ["Evacuation Centers", "Live occupancy across active centers."],
  personnel:     ["Volunteer & Personnel", "Deployed rescue/relief staff per barangay."],
  roadmap:       ["Suggested Roadmap", "Additional modules worth building next."]
};

const App = {
  role: "official",
  view: "overview",

  init(){
    document.querySelectorAll(".nav-item").forEach(btn=>{
      btn.addEventListener("click", ()=> this.go(btn.dataset.view));
    });
    document.getElementById("role-select").addEventListener("change", e=>{
      this.role = e.target.value;
      this.go(this.view);
      this.refreshNotifs();
      const roleLabels = { barangay:"Barangay Requestor", verifier:"Verifying Officer", admin:"Logistics Admin", official:"Approving Official" };
      toast(`Now viewing as ${roleLabels[e.target.value] || e.target.value}.`);
    });
    wireSelects(document);
    this.initTheme();
    this.initNotifs();
    this.initChrome();
    this.initConnectivity();
    this.tickClock();
    setInterval(()=>this.tickClock(), 1000);
    this.go("overview");
    this.refreshNotifs();
    this.initServerSync();
  },

  // Pulls the shared backend on load and periodically after — this is
  // how a request filed on the barangay portal actually appears here,
  // since the two run as separate frontends against one datastore.
  initServerSync(){
    let announced = false;
    DB.startSync(()=>{
      this.go(this.view);
      this.refreshNotifs();
      if(!announced){ toast("Synced with server."); announced = true; }
    }, 25000);
  },

  // Everything here already runs entirely off localStorage, so the app
  // itself doesn't stop working offline — but a barangay/verifier
  // should still *see* their connectivity state plainly, since it's the
  // whole reason the relayed-request form on the Requests tab exists.
  initConnectivity(){
    const dot = document.getElementById("conn-dot");
    const label = document.getElementById("conn-label");
    const update = ()=>{
      const online = navigator.onLine;
      dot.style.background = online ? "var(--green)" : "var(--red)";
      dot.style.boxShadow = online ? "0 0 0 3px var(--green-dim)" : "0 0 0 3px var(--red-dim)";
      label.textContent = online ? "Online" : "Offline — saved locally";
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
  },

  // The brand row + tab strip hide as one unit on scroll-down and
  // reappear on scroll-up, instead of relying on `position:sticky` on
  // two separate bars (which clips unpredictably, especially with
  // mobile browsers that resize the viewport as their own chrome
  // hides). transform-only + rAF-throttled so it stays smooth.
  initChrome(){
    const chrome = document.getElementById("app-chrome");
    const setHeight = ()=>{
      document.documentElement.style.setProperty("--chrome-h", chrome.offsetHeight + "px");
    };
    setHeight();
    window.addEventListener("resize", setHeight);

    let lastY = window.scrollY, ticking = false;
    const threshold = 6;
    window.addEventListener("scroll", ()=>{
      if(ticking) return;
      ticking = true;
      requestAnimationFrame(()=>{
        const y = window.scrollY;
        const delta = y - lastY;
        if(y < chrome.offsetHeight){
          chrome.classList.remove("chrome-hidden");
        }else if(delta > threshold){
          chrome.classList.add("chrome-hidden");
        }else if(delta < -threshold){
          chrome.classList.remove("chrome-hidden");
        }
        lastY = y;
        ticking = false;
      });
    }, { passive:true });
  },

  // Nudges the currently-selected role toward whatever it owes an action
  // on, instead of relying on someone remembering to check the dashboard.
  initNotifs(){
    const bell = document.getElementById("notif-bell");
    const panel = document.getElementById("notif-panel");
    bell.addEventListener("click", ()=>{
      const open = panel.hasAttribute("hidden");
      if(open){ panel.removeAttribute("hidden"); bell.setAttribute("aria-expanded","true"); }
      else{ panel.setAttribute("hidden",""); bell.setAttribute("aria-expanded","false"); }
    });
    document.addEventListener("click", e=>{
      if(!panel.contains(e.target) && e.target!==bell){ panel.setAttribute("hidden",""); bell.setAttribute("aria-expanded","false"); }
    });
    panel.addEventListener("click", e=>{
      const row = e.target.closest("[data-goto]");
      if(row){ this.go("tickets"); panel.setAttribute("hidden",""); }
    });
  },

  refreshNotifs(){
    const bell = document.getElementById("notif-bell");
    const panel = document.getElementById("notif-panel");
    if(!bell || typeof DB === "undefined" || !DB.state) return;
    const pending = DB.pendingFor(this.role);
    bell.innerHTML = `${Icons.bell()}${pending.length ? `<span class="notif-count">${pending.length}</span>` : ""}`;
    panel.innerHTML = pending.length
      ? pending.map(t=>`<div class="notif-row" data-goto="${t.id}"><strong>${t.id}</strong> — ${t.barangay} needs your action (${t.status}).</div>`).join("")
      : `<div class="notif-row notif-empty">Nothing pending for your role.</div>`;
  },

  initTheme(){
    const btn = document.getElementById("theme-toggle");
    const apply = (mode)=>{
      if(mode==="dark"){ document.documentElement.setAttribute("data-theme","dark"); btn.innerHTML = `${Icons.sun()} LIGHT MODE`; }
      else{ document.documentElement.removeAttribute("data-theme"); btn.innerHTML = `${Icons.moon()} DARK MODE`; }
      localStorage.setItem("gforce_theme", mode);
      if(GIS.map) GIS.applyTheme(mode);
    };
    const current = localStorage.getItem("gforce_theme") === "dark" ? "dark" : "light";
    apply(current);
    btn.addEventListener("click", ()=>{
      const now = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      apply(now);
    });
  },

  go(view){
    this.view = view;
    document.querySelectorAll(".nav-item").forEach(b=> b.classList.toggle("active", b.dataset.view===view));
    const [title, sub] = TITLES[view] || [view, ""];
    document.getElementById("view-title").textContent = title;
    document.getElementById("view-sub").textContent = sub;
    const root = document.getElementById("view-root");
    root.innerHTML = "";
    (Views[view] || Views.overview)(root);
    this.refreshNotifs();
    if(view==="gis" && GIS.map){
      const saved = localStorage.getItem("gforce_theme") === "dark" ? "dark" : "light";
      GIS.applyTheme(saved);
    }
  },

  tickClock(){
    const el = document.getElementById("clock");
    if(el) el.textContent = new Date().toLocaleString(undefined, { weekday:"short", hour:"2-digit", minute:"2-digit", second:"2-digit" });
  }
};

document.addEventListener("DOMContentLoaded", ()=> App.init());
