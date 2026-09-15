/* ================================================================
   GForce Barangay Portal
   Three jobs only: file a request, see your own request history,
   check what's currently in stock. Everything reads/writes through
   the shared backend — this file has no localStorage fallback on
   purpose, since a barangay's own request history living only in
   one browser's storage would defeat the point of a shared system.
   ================================================================ */

// Same-origin by default (server.js serves this file itself, at "/").
// If you ever host the portal separately from the API, point this at
// the full backend URL instead, e.g. "https://gforce.yourdomain.gov.ph/api".
const API_BASE = "/api";

const Portal = {
  barangayCode: localStorage.getItem("gforce_portal_barangay") || "",
  barangays: [],
  view: "new",

  async init(){
    this.initConnectivity();
    try{
      const [barangays, meta] = await Promise.all([
        fetchJSON(`${API_BASE}/barangays`),
        fetchJSON(`${API_BASE}/meta`)
      ]);
      this.barangays = barangays;
      document.getElementById("meta-scope").textContent = `${meta.lguName} — ${meta.disaster}`;
      this.renderBarangayOptions();
      if(this.barangayCode) this.selectBarangay(this.barangayCode, false);
    }catch(e){
      document.getElementById("meta-scope").textContent = "Can't reach the server";
      toast("Couldn't load barangay list — check that the GForce server is running and reachable.");
    }

    document.querySelectorAll(".nav-item").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        document.querySelectorAll(".nav-item").forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        this.view = btn.dataset.view;
        this.render();
      });
    });
  },

  initConnectivity(){
    const dot = document.getElementById("conn-dot");
    const label = document.getElementById("conn-label");
    const update = ()=>{
      const online = navigator.onLine;
      dot.style.background = online ? "var(--green)" : "var(--red)";
      label.textContent = online ? "Online" : "Offline";
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
  },

  renderBarangayOptions(){
    const menu = document.getElementById("barangay-options");
    menu.innerHTML = this.barangays.map(b=>
      `<div class="cselect-opt${b.code===this.barangayCode?' is-active':''}" data-value="${b.code}">${b.name}</div>`
    ).join("");
    wireSelects(document);
    menu.querySelectorAll(".cselect-opt").forEach(opt=>{
      opt.addEventListener("click", ()=> this.selectBarangay(opt.dataset.value, true));
    });
  },

  selectBarangay(code, isUserAction){
    this.barangayCode = code;
    localStorage.setItem("gforce_portal_barangay", code);
    const b = this.barangays.find(x=>x.code===code);
    const label = document.querySelector('[data-cselect="barangayCode"] .cselect-label');
    const hidden = document.getElementById("barangay-code");
    if(b && label){ label.textContent = b.name; hidden.value = b.code; }
    document.querySelectorAll("#barangay-options .cselect-opt").forEach(o=>o.classList.toggle("is-active", o.dataset.value===code));
    if(isUserAction) toast(`Switched to ${b ? b.name : code}.`);
    this.render();
  },

  render(){
    const root = document.getElementById("view-root");
    if(!this.barangayCode){
      root.innerHTML = `<div class="empty-state">Select your barangay above to get started.</div>`;
      return;
    }
    if(this.view==="new") return renderNewRequest(root);
    if(this.view==="archive") return renderArchive(root);
    if(this.view==="stock") return renderStock(root);
  }
};

async function fetchJSON(url, opts){
  const res = await fetch(url, opts);
  if(!res.ok){
    const body = await res.json().catch(()=>({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

function toast(msg){
  document.querySelectorAll(".toast").forEach(t=>t.remove());
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(()=> el.remove(), 3800);
}

function fileToDataUrl(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = ()=> resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------------- custom select (mirrors admin app's component) ---------------- */
function selectHTML(name, options, selected){
  const sel = options.find(o=>o.value===selected) || options[0];
  return `
    <div class="cselect" data-cselect="${name}">
      <button type="button" class="cselect-btn">
        <span class="cselect-label">${sel ? sel.label : ""}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div class="cselect-menu" hidden>
        ${options.map(o=>`<div class="cselect-opt${o.value===sel?.value?' is-active':''}" data-value="${o.value}">${o.label}</div>`).join("")}
      </div>
      <input type="hidden" name="${name}" value="${sel ? sel.value : ""}">
    </div>`;
}
function wireSelects(root){
  root.querySelectorAll("[data-cselect]").forEach(wrap=>{
    const btn = wrap.querySelector(".cselect-btn");
    const menu = wrap.querySelector(".cselect-menu");
    const input = wrap.querySelector("input[type=hidden]");
    const label = wrap.querySelector(".cselect-label");
    if(btn._wired) return;
    btn._wired = true;
    btn.addEventListener("click", e=>{
      e.stopPropagation();
      const isOpen = !menu.hasAttribute("hidden");
      document.querySelectorAll(".cselect-menu").forEach(m=>m.setAttribute("hidden",""));
      document.querySelectorAll(".cselect[data-open]").forEach(w=>w.removeAttribute("data-open"));
      if(!isOpen){ menu.removeAttribute("hidden"); wrap.setAttribute("data-open",""); }
    });
    menu.querySelectorAll(".cselect-opt").forEach(opt=>{
      if(wrap.dataset.cselect==="barangayCode") return; // wired separately in Portal.renderBarangayOptions
      opt.addEventListener("click", ()=>{
        input.value = opt.dataset.value;
        label.textContent = opt.textContent;
        menu.querySelectorAll(".cselect-opt").forEach(o=>o.classList.remove("is-active"));
        opt.classList.add("is-active");
        menu.setAttribute("hidden","");
        wrap.removeAttribute("data-open");
        input.dispatchEvent(new Event("change", { bubbles:true }));
      });
    });
  });
  if(!wireSelects._docBound){
    document.addEventListener("click", ()=>{
      document.querySelectorAll(".cselect-menu").forEach(m=>m.setAttribute("hidden",""));
      document.querySelectorAll(".cselect[data-open]").forEach(w=>w.removeAttribute("data-open"));
    });
    wireSelects._docBound = true;
  }
}

/* ---------------- New Request ---------------- */
function renderNewRequest(root){
  root.innerHTML = `
  <section class="view">
    <div class="card">
      <div class="card-head"><h3>File a new request</h3><span class="hint">Sent straight to the LGU's verifying officer</span></div>
      <form id="request-form">
        <div class="field"><label>Contact person</label><input required name="contact" placeholder="Name / position"></div>
        <div class="field-row">
          <div class="field"><label>Food packs needed</label><input type="number" min="0" name="food" value="0"></div>
          <div class="field"><label>Drinking water needed (L)</label><input type="number" min="0" name="water" value="0"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Rescue vehicles needed</label><input type="number" min="0" name="vehicle" value="0"></div>
          <div class="field"><label>Estimated affected residents</label><input type="number" min="0" required name="affectedPop"></div>
        </div>
        <div class="field"><label>Reason / situation</label><textarea name="reason" required placeholder="Describe the situation driving this request"></textarea></div>
        <div class="field"><label>Photo evidence (optional)</label><input type="file" accept="image/*" name="photo"></div>
        <div class="btn-row"><button class="btn btn-primary" type="submit">Submit request</button></div>
      </form>
    </div>
  </section>`;

  root.querySelector("#request-form").addEventListener("submit", async e=>{
    e.preventDefault();
    const f = new FormData(e.target);
    const affectedPop = Math.max(0, Math.round(Number(f.get("affectedPop"))||0));
    const contact = (f.get("contact")||"").trim();
    const reason = (f.get("reason")||"").trim();
    const items = {
      food: Math.max(0, Math.round(Number(f.get("food"))||0)),
      water: Math.max(0, Math.round(Number(f.get("water"))||0)),
      vehicle: Math.max(0, Math.round(Number(f.get("vehicle"))||0))
    };
    if(!contact || !reason){ toast("Contact and reason are both required."); return; }
    if(affectedPop <= 0){ toast("Enter a valid number of affected residents."); return; }
    if(!Object.values(items).some(q=>q>0)){ toast("Request at least one item."); return; }

    const photoFile = f.get("photo");
    const requestPhoto = (photoFile && photoFile.size>0) ? await fileToDataUrl(photoFile) : null;

    const submitBtn = e.target.querySelector("button[type=submit]");
    submitBtn.disabled = true; submitBtn.textContent = "Submitting…";
    try{
      const ticket = await fetchJSON(`${API_BASE}/tickets`, {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ barangayCode: Portal.barangayCode, contact, reason, affectedPop, items, requestPhoto })
      });
      toast(`Submitted — your reference number is ${ticket.id}.`);
      e.target.reset();
    }catch(err){
      toast(err.message || "Couldn't submit — check your connection and try again.");
    }finally{
      submitBtn.disabled = false; submitBtn.textContent = "Submit request";
    }
  });
}

/* ---------------- My Requests (archive) ---------------- */
const PIPELINE_STEPS = ["Requested","Verified","Recommended","Approved","Released","In Transit","Delivered","Received"];

async function renderArchive(root){
  root.innerHTML = `<section class="view"><div class="card"><div class="empty">Loading your requests…</div></div></section>`;
  try{
    const tickets = await fetchJSON(`${API_BASE}/tickets?barangayCode=${Portal.barangayCode}`);
    if(!tickets.length){
      root.innerHTML = `<section class="view"><div class="card empty"><strong>No requests yet</strong>Anything you file will show up here.</div></section>`;
      return;
    }
    root.innerHTML = `<section class="view">${tickets.map(t=>{
      const stepIdx = PIPELINE_STEPS.indexOf(t.status);
      const foodQty = t.items.find(i=>i.res==="food")?.qty || 0;
      const waterQty = t.items.find(i=>i.res==="water")?.qty || 0;
      const vehicleQty = t.items.find(i=>i.res==="vehicle")?.qty || 0;
      return `
      <div class="request-card">
        <div class="rc-head">
          <div>
            <h4>${t.id}</h4>
            <div class="rc-meta">${[foodQty&&`${foodQty} food`, waterQty&&`${waterQty}L water`, vehicleQty&&`${vehicleQty} vehicle(s)`].filter(Boolean).join(" · ")} · filed ${new Date(t.submitted).toLocaleString()}</div>
          </div>
          <span class="badge ${statusBadgeClass(t.status)}">${t.status}</span>
        </div>
        <p style="color:var(--text-dim);font-size:12.5px;margin-top:8px;">${t.reason}</p>
        <div class="pipeline">
          ${PIPELINE_STEPS.map((s,i)=>`<span class="step ${i<stepIdx?"done":i===stepIdx?"now":""}">${s}</span>`).join("")}
        </div>
        ${t.barcode ? `<div class="section-note" style="margin-top:12px;">Pickup code issued: <strong style="font-family:var(--font-mono);">${t.barcode}</strong></div>` : ""}
      </div>`;
    }).join("")}</section>`;
  }catch(e){
    root.innerHTML = `<section class="view"><div class="card empty"><strong>Couldn't load your requests</strong>Check your connection and try again.</div></section>`;
  }
}
function statusBadgeClass(status){
  if(["Delivered","Received"].includes(status)) return "badge-teal";
  if(["Requested"].includes(status)) return "badge-dim";
  if(["Approved","Released","In Transit"].includes(status)) return "badge-blue";
  return "badge-amber";
}

/* ---------------- Resource Levels (mirrors admin's Allocation numbers) ---------------- */
async function renderStock(root){
  root.innerHTML = `<section class="view"><div class="card"><div class="empty">Loading current stock…</div></div></section>`;
  try{
    const inv = await fetchJSON(`${API_BASE}/inventory`);
    root.innerHTML = `<section class="view">
      <div class="section-note">These numbers come straight from the LGU's live inventory — the same figures
        the approving official sees. "Available" is what's left after everything already approved or in transit.</div>
      ${inv.map(item=>{
        const pct = item.onHand ? Math.min(100, Math.round(item.reservedNow/item.onHand*100)) : 0;
        return `<div class="card">
          <div class="card-head"><h3>${item.label}</h3><span class="hint">${item.warehouse}</span></div>
          <div class="stat" style="margin-bottom:10px;">
            <span class="num">${item.available.toLocaleString()} <span style="font-size:13px;color:var(--text-faint);">${item.unit}</span></span>
            <span class="lbl">available now</span>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:var(--amber);"></div></div>
          <div style="display:flex;justify-content:space-between;color:var(--text-faint);font-size:11.5px;">
            <span>${item.reservedNow.toLocaleString()} reserved / in pipeline</span><span>${item.onHand.toLocaleString()} total on hand</span>
          </div>
        </div>`;
      }).join("")}
    </section>`;
  }catch(e){
    root.innerHTML = `<section class="view"><div class="card empty"><strong>Couldn't load stock levels</strong>Check your connection and try again.</div></section>`;
  }
}

Portal.init();
