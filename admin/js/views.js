/* ============================================================
   GForce — View renderers
   Each Views.xxx(root) function renders one nav destination into
   the #view-root element and wires up its own event listeners.
   ============================================================ */
const Views = {};

/* ---------------- shared helpers ---------------- */

// Custom-styled dropdown: a native <select> renders its open list with
// browser chrome we can't restyle (that flat blue-highlight menu). This
// builds a div/button menu that matches the rest of the UI, while a
// hidden <input> keeps the same `name` so existing FormData-based form
// handlers don't need to change at all.
function selectHTML(name, options, selected){
  const sel = options.find(o=>o.value===selected) || options[0];
  return `
    <div class="cselect" data-cselect="${name}">
      <button type="button" class="cselect-btn">
        <span class="cselect-label">${sel ? sel.label : ""}</span>
        ${Icons.chevron(14)}
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
    btn.addEventListener("click", e=>{
      e.stopPropagation();
      const isOpen = !menu.hasAttribute("hidden");
      document.querySelectorAll(".cselect-menu").forEach(m=>m.setAttribute("hidden",""));
      document.querySelectorAll(".cselect[data-open]").forEach(w=>w.removeAttribute("data-open"));
      if(!isOpen){ menu.removeAttribute("hidden"); wrap.setAttribute("data-open",""); }
    });
    menu.querySelectorAll(".cselect-opt").forEach(opt=>{
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

function fmtTime(iso){
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" });
}
function fmtAgo(iso){
  const mins = Math.round((Date.now()-new Date(iso).getTime())/60000);
  if(mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins/60);
  if(hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs/24)}d ago`;
}
function badgeForStatus(status){
  const map = {
    "Requested":"badge-dim", "Verified":"badge-blue", "Recommended":"badge-blue",
    "Approved":"badge-amber", "Released":"badge-amber", "In Transit":"badge-amber",
    "Delivered":"badge-teal", "Received":"badge-teal"
  };
  return `<span class="badge ${map[status]||'badge-dim'}">${status}</span>`;
}
function priorityBadge(p){
  if(!p) return `<span class="badge badge-dim">Pending</span>`;
  const map = { High:"badge-coral", Medium:"badge-amber", Low:"badge-teal" };
  return `<span class="badge ${map[p]}">${p}</span>`;
}
function pipelineHTML(status){
  const idx = PIPELINE_STEPS.indexOf(status);
  return `<div class="pipeline">` + PIPELINE_STEPS.map((s,i)=>{
    const cls = i<idx ? "done" : i===idx ? "now" : "";
    const arrow = i>0 ? `<span class="arrow">→</span>` : "";
    return `${arrow}<span class="step ${cls}">${s}</span>`;
  }).join("") + `</div>`;
}
function itemsSummary(items){
  const labels = { food:"food packs", water:"L water", vehicle:"rescue vehicles" };
  return items.filter(i=>i.qty>0).map(i=>`${i.qty.toLocaleString()} ${labels[i.res]}`).join(" · ");
}
function toast(msg){
  const t = document.getElementById("tpl-toast").content.cloneNode(true);
  t.querySelector(".toast").textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=>{ document.querySelectorAll(".toast").forEach(el=>el.remove()); }, 2600);
}

/* ================================================================
   OVERVIEW
   ================================================================ */
Views.overview = function(root){
  const T = DB.state.tickets;
  const active = T.filter(t=>!["Received"].includes(t.status));
  const critical = T.filter(t=>t.aiPriority==="High" && !["Delivered","Received"].includes(t.status));
  const delivered = T.filter(t=>["Delivered","Received"].includes(t.status)).length;
  const affected = T.reduce((s,t)=>s+t.affectedPop,0);

  root.innerHTML = `
  <section class="view">
    <div class="grid grid-4">
      <div class="card stat">
        <span class="lbl">Active requests</span>
        <span class="num">${active.length}</span>
        <span class="delta">${T.length} total this response</span>
      </div>
      <div class="card stat">
        <span class="lbl">High-priority / unresolved</span>
        <span class="num" style="color:var(--red)">${critical.length}</span>
        <span class="delta">awaiting release or transit</span>
      </div>
      <div class="card stat">
        <span class="lbl">Requests fulfilled</span>
        <span class="num" style="color:var(--green)">${delivered}</span>
        <span class="delta up">of ${T.length} submitted</span>
      </div>
      <div class="card stat">
        <span class="lbl">Residents represented</span>
        <span class="num">${affected.toLocaleString()}</span>
        <span class="delta">across ${new Set(T.map(t=>t.barangay)).size} barangays</span>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card-head"><h3>Requests in the pipeline</h3><span class="hint">${T.length} shown</span></div>
        <table>
          <thead><tr><th>Request</th><th>Barangay</th><th>Items</th><th>Priority</th><th>Status</th></tr></thead>
          <tbody>
            ${T.slice(0,6).map(t=>`
              <tr>
                <td>${t.id}</td>
                <td>${t.barangay}</td>
                <td>${itemsSummary(t.items)}</td>
                <td>${priorityBadge(t.aiPriority)}</td>
                <td>${badgeForStatus(t.status)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="card-head"><h3>Live alerts</h3><span class="hint">last 24h</span></div>
        ${DB.state.alerts.map(a=>`
          <div class="log-item">
            <span class="log-dot" style="background:${a.level==='critical'?'var(--red)':a.level==='warning'?'var(--amber)':'var(--steel)'}"></span>
            <div>
              <div>${a.text}</div>
              <div class="log-time" style="width:auto;margin-top:2px;">${fmtAgo(a.t)}</div>
            </div>
          </div>`).join("")}
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Evacuation center capacity</h3><span class="hint">flags at &gt;90% occupancy</span></div>
      <div class="grid grid-3">
        ${DB.state.evac.map(e=>{
          const pct = Math.round(e.occupied/e.capacity*100);
          const color = pct>90?"var(--red)":pct>60?"var(--amber)":"var(--green)";
          return `<div>
            <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px;">
              <span>${e.name}</span><span style="color:${color}">${pct}%</span>
            </div>
            <div style="height:6px;background:var(--panel-2);border-radius:4px;overflow:hidden;">
              <div style="height:100%;width:${pct}%;background:${color};"></div>
            </div>
            <div style="color:var(--text-faint);font-size:11px;margin-top:4px;">${e.occupied}/${e.capacity} · ${e.barangay}</div>
          </div>`;
        }).join("")}
      </div>
    </div>
  </section>`;
};

/* ================================================================
   GIS MAP
   ================================================================ */
Views.gis = function(root){
  root.innerHTML = `
  <section class="view">
    <div class="grid grid-2">
      <div class="map-wrap"><div id="map-canvas" style="height:100%;"></div></div>
      <div class="card">
        <div class="card-head"><h3>Map layers</h3></div>
        <div class="layer-toggles">
          <label><input type="checkbox" data-layer="hazard" checked> Flood hazard zone</label>
          <label><input type="checkbox" data-layer="barangay" checked> Barangay boundaries / population</label>
          <label><input type="checkbox" data-layer="evac" checked> Evacuation centers</label>
          <label><input type="checkbox" data-layer="warehouse" checked> Warehouses / resource depots</label>
          <label><input type="checkbox" data-layer="requests" checked> Active resource requests</label>
          <label><input type="checkbox" data-layer="roads" checked> Roads &amp; accessibility</label>
        </div>
        <div class="section-note" style="margin-top:16px;">
          Answers: <strong>where is the disaster, who is affected, where are resources,
          and where should they be prioritized</strong> — one operating picture per §6 of the project brief.
          This prototype uses mock geometry; wire to real hydro/hazard feeds and the
          barangay GIS layer when available.
        </div>
      </div>
    </div>
  </section>`;

  GIS.init("map-canvas");
  root.querySelectorAll("[data-layer]").forEach(cb=>{
    cb.addEventListener("change", ()=> GIS.toggle(cb.dataset.layer, cb.checked));
  });
};

/* ================================================================
   TICKETING
   ================================================================ */
Views.tickets = function(root){
  const canFile = App.role === "barangay";
  const canRelay = App.role === "verifier";

  root.innerHTML = `
  <section class="view">
    ${canFile ? ticketFormHTML({ id:"ticket-form", title:"File a new request", hint:"Barangay resource request", relay:false }) : ""}
    ${canRelay ? ticketFormHTML({ id:"relay-form", title:"Log a relayed request", hint:"SMS / radio / phone — no live connection at the barangay end", relay:true }) : ""}

    <div class="card">
      <div class="card-head"><h3>All requests</h3><span class="hint">${DB.state.tickets.length} total</span></div>
      <div id="ticket-list"></div>
    </div>
  </section>`;

  if(canFile) wireTicketForm(root.querySelector("#ticket-form"), root, false);
  if(canRelay) wireTicketForm(root.querySelector("#relay-form"), root, true);

  renderTicketList(root);
};

// Shared markup for both the barangay's own filing form and the
// verifier's SMS/radio relay form — same underlying request, only the
// intake channel and who's typing it differs.
function ticketFormHTML({ id, title, hint, relay }){
  return `
    <div class="card">
      <div class="card-head"><h3>${title}</h3><span class="hint">${hint}</span></div>
      <form id="${id}">
        ${relay ? `
        <div class="section-note" style="margin-bottom:16px;">
          Use this when a barangay can't reach GForce directly — flooding often takes out data signal first.
          Key in whatever came through over SMS, handheld radio, or a phone call; it enters the same pipeline
          as a self-filed request, just tagged with how it arrived for the audit trail.
        </div>
        <div class="field-row">
          <div class="field"><label>Channel</label>
            ${selectHTML("channel", [
              { value:"sms", label:"SMS" },
              { value:"radio", label:"Handheld radio" },
              { value:"phone", label:"Phone call" }
            ], "sms")}
          </div>
          <div class="field"><label>Logged by (verifier)</label><input required name="loggedBy" placeholder="Your name"></div>
        </div>` : ""}
        <div class="field-row">
          <div class="field"><label>Barangay</label>
            ${selectHTML("barangayCode", [{ value:"", label:"Select barangay" }, ...BARANGAYS.map(b=>({ value:b.code, label:`${b.name} (${b.code})` }))], "")}
          </div>
          <div class="field"><label>Contact person</label><input required name="contact" placeholder="Name / position"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Food packs needed</label><input type="number" min="0" name="food" value="0"></div>
          <div class="field"><label>Drinking water needed (L)</label><input type="number" min="0" name="water" value="0"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Rescue vehicles needed</label><input type="number" min="0" name="vehicle" value="0"></div>
          <div class="field"><label>Estimated affected residents</label><input type="number" min="0" required name="affectedPop"></div>
        </div>
        <div class="field"><label>Reason / situation</label><textarea name="reason" required placeholder="Describe the situation driving this request"></textarea></div>
        ${!relay ? `<div class="field"><label>Photo evidence (optional)</label><input type="file" accept="image/*" name="photo"></div>` : ""}
        <div class="btn-row"><button class="btn btn-primary" type="submit">${relay ? "Log relayed request" : "Submit request"}</button></div>
      </form>
    </div>`;
}

function wireTicketForm(formEl, root, isRelay){
  wireSelects(formEl);
  formEl.addEventListener("submit", async e=>{
    e.preventDefault();
    const f = new FormData(e.target);
    const items = [
      {res:"food", qty:Math.max(0, Math.round(Number(f.get("food"))||0))},
      {res:"water", qty:Math.max(0, Math.round(Number(f.get("water"))||0))},
      {res:"vehicle", qty:Math.max(0, Math.round(Number(f.get("vehicle"))||0))}
    ];
    const affectedPop = Math.max(0, Math.round(Number(f.get("affectedPop"))||0));
    const barangayCode = f.get("barangayCode")||"";
    const barangayRec = BARANGAYS.find(b=>b.code===barangayCode);
    const contact = (f.get("contact")||"").trim();
    const reason = (f.get("reason")||"").trim();
    const loggedBy = (f.get("loggedBy")||"").trim();

    if(!barangayRec || !contact || !reason){
      toast("Barangay, contact, and reason are all required.");
      return;
    }
    if(isRelay && !loggedBy){
      toast("Enter who's logging this relayed request.");
      return;
    }
    if(affectedPop <= 0){
      toast("Enter a valid number of affected residents.");
      return;
    }
    if(!items.some(i=>i.qty>0)){
      toast("Request at least one item — food, water, or vehicles.");
      return;
    }

    const photoFile = f.get("photo");
    const requestPhoto = (photoFile && photoFile.size>0) ? await fileToDataUrl(photoFile) : null;
    const channel = isRelay ? (f.get("channel")||"sms") : "app";

    const t = DB.createTicket({
      barangay:barangayRec.name, barangayCode:barangayRec.code,
      disasterCode: DISASTER_CODES[(DB.state.meta.disaster||"").toLowerCase().split(" ")[0]] || "FLD",
      lat:barangayRec.lat, lng:barangayRec.lng,
      contact, items, reason, affectedPop, requestPhoto, channel, loggedBy: isRelay ? loggedBy : null
    });
    const flags = DB.fraudFlags(t);
    toast(flags.length
      ? `${t.id} filed — flagged for review: ${flags[0].text}`
      : `${t.id} ${isRelay ? "logged" : "submitted"} for ${t.barangay}.`);
    e.target.reset();
    renderTicketList(root);
    App.refreshNotifs();
  });
}

// Converts a File to a base64 data URL for local (prototype) storage —
// swap for a real upload endpoint returning a URL when there's a backend.
function fileToDataUrl(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = ()=> resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderTicketList(root){
  const wrap = root.querySelector("#ticket-list");
  if(!DB.state.tickets.length){
    wrap.innerHTML = `<div class="empty"><strong>No requests yet</strong>Submitted requests will appear here.</div>`;
    return;
  }
  wrap.innerHTML = DB.state.tickets.map(t=>{
    const flags = DB.fraudFlags(t);
    return `
    <div class="card" style="background:var(--bg-raised);margin-bottom:12px;">
      <div class="card-head">
        <div>
          <h3>${t.id} — ${t.barangay}</h3>
          <span class="hint">${itemsSummary(t.items)} · ${t.affectedPop.toLocaleString()} residents affected · ${fmtAgo(t.submitted)}</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          ${t.channel && t.channel!=="app" ? `<span class="badge badge-blue" title="Logged by ${t.loggedBy||'verifier'}">Relayed · ${({sms:"SMS",radio:"Radio",phone:"Phone"})[t.channel]||t.channel}</span>` : ""}
          ${priorityBadge(t.aiPriority)}${badgeForStatus(t.status)}
        </div>
      </div>
      <p style="color:var(--text-dim);font-size:12.5px;margin-bottom:12px;">${t.reason}</p>
      ${flags.length ? `<div class="section-note" style="margin-bottom:12px;">
        <strong>${Icons.alert ? Icons.alert() : ""} Flagged for review</strong>
        ${flags.map(f=>`<div style="margin-top:4px;">${f.text}</div>`).join("")}
      </div>` : ""}
      ${(t.requestPhoto || t.deliveryPhoto) ? `<div style="display:flex;gap:10px;margin-bottom:12px;">
        ${t.requestPhoto ? `<div><img src="${t.requestPhoto}" alt="Request evidence" style="width:84px;height:84px;object-fit:cover;border-radius:var(--r-sm);border:1px solid var(--line);"><div class="hint" style="margin-top:4px;">Filed evidence</div></div>` : ""}
        ${t.deliveryPhoto ? `<div><img src="${t.deliveryPhoto}" alt="Delivery evidence" style="width:84px;height:84px;object-fit:cover;border-radius:var(--r-sm);border:1px solid var(--line);"><div class="hint" style="margin-top:4px;">Delivery evidence</div></div>` : ""}
      </div>` : ""}
      ${pipelineHTML(t.status)}
      <div class="btn-row" style="margin-top:14px;" data-actions="${t.id}"></div>
      <input type="file" accept="image/*" data-photo-input="${t.id}" style="display:none;">
    </div>
  `;}).join("");

  DB.state.tickets.forEach(t=>{
    const actionsEl = wrap.querySelector(`[data-actions="${t.id}"]`);
    actionsEl.innerHTML = actionButtons(t);
    wireActionButtons(actionsEl, t, root);
    const photoInput = wrap.querySelector(`[data-photo-input="${t.id}"]`);
    photoInput.addEventListener("change", async ()=>{
      const file = photoInput.files[0];
      if(!file) return;
      const dataUrl = await fileToDataUrl(file);
      DB.attachDeliveryPhoto(t, dataUrl);
      toast(`Delivery photo attached to ${t.id}.`);
      renderTicketList(root);
    });
  });
}

// Available stock per resource = on hand minus everything already committed
// to Approved/Released/In-Transit tickets. Excludes `excludeId` so a ticket
// can be checked against stock without double-counting its own prior hold.
function availableStock(resId, excludeId){
  const inv = DB.state.inventory.find(i=>i.id===resId);
  if(!inv) return Infinity;
  const committed = DB.state.tickets
    .filter(t=>t.id!==excludeId && ["Approved","Released","In Transit"].includes(t.status))
    .reduce((sum,t)=>{
      const item = t.items.find(i=>i.res===resId);
      if(!item) return sum;
      const qty = (resId==="food" && t.approvedQty!=null) ? t.approvedQty : item.qty;
      return sum + qty;
    }, 0);
  return inv.onHand - committed;
}

function actionButtons(t){
  const role = App.role;
  const btns = [];
  if(role==="verifier" && t.status==="Requested"){
    btns.push(`<button class="btn btn-sm btn-primary" data-act="verify">Verify</button>`);
    btns.push(`<button class="btn btn-sm btn-danger" data-act="reject">Reject</button>`);
    btns.push(`<button class="btn btn-sm btn-ghost" data-act="clarify">Request clarification</button>`);
  }
  if(role==="admin" && t.status==="Approved"){
    btns.push(`<button class="btn btn-sm btn-primary" data-act="release">Release from warehouse</button>`);
  }
  if(role==="admin" && t.status==="Released"){
    btns.push(`<button class="btn btn-sm btn-primary" data-act="transit">Mark in transit</button>`);
  }
  if(role==="admin" && t.status==="In Transit"){
    btns.push(`<button class="btn btn-sm btn-primary" data-act="deliver">Mark delivered</button>`);
  }
  if(role==="admin" && ["Released","In Transit","Delivered"].includes(t.status)){
    btns.push(`<button class="btn btn-sm btn-ghost" data-act="attachphoto">${t.deliveryPhoto ? "Replace" : "Attach"} delivery photo</button>`);
  }
  if(role==="official" && t.status==="Recommended"){
    const avail = availableStock("food", t.id);
    const short = t.aiFoodQty > avail;
    if(short){
      btns.push(`<span class="badge badge-coral">Only ${avail.toLocaleString()} food packs available — recommended ${t.aiFoodQty.toLocaleString()}</span>`);
      btns.push(`<button class="btn btn-sm btn-ghost" data-act="modify">Approve reduced quantity</button>`);
      btns.push(`<button class="btn btn-sm btn-danger" data-act="rejectofficial">Reject</button>`);
    }else{
      btns.push(`<button class="btn btn-sm btn-primary" data-act="approve">Approve as recommended</button>`);
      btns.push(`<button class="btn btn-sm btn-ghost" data-act="modify">Modify &amp; approve</button>`);
      btns.push(`<button class="btn btn-sm btn-danger" data-act="rejectofficial">Reject</button>`);
    }
  }
  if(!btns.length){
    return `<span class="hint">No action available for your current role at this stage.</span>`;
  }
  return btns.join("");
}

function wireActionButtons(el, t, root){
  el.querySelectorAll("[data-act]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const act = btn.dataset.act;
      // Defense in depth: re-check the role gate at execution time, not
      // just at render time. actionButtons() already hides buttons the
      // current role can't use — this guard catches a stale render,
      // a double-click race, or a forged call, so the gate can't be
      // bypassed by anything short of editing this file.
      if(!DB.canPerform(App.role, act, t)){
        toast("Your role can't perform that action at this stage.");
        renderTicketList(root);
        return;
      }
      if(act==="approve"){
        // Re-check stock at the moment of the click, not just at render —
        // two officials approving different tickets in the same window
        // could both have passed the render-time check.
        const avail = availableStock("food", t.id);
        if(t.aiFoodQty > avail){
          toast(`Stock changed — only ${avail.toLocaleString()} food packs available now. Use "Modify & approve" instead.`);
          renderTicketList(root);
          return;
        }
      }
      if(act==="attachphoto"){
        const input = el.parentElement.querySelector(`[data-photo-input="${t.id}"]`);
        if(input) input.click();
        return;
      }
      if(act==="verify"){ DB.advance(t, "Verified", "Request verified against population and inventory data."); runAI(t); }
      if(act==="reject"){ DB.advance(t, "Requested", "Rejected by verifying officer — returned to requestor."); }
      if(act==="clarify"){ DB.addLog(t, "Clarification requested from barangay."); DB.save(); }
      if(act==="release"){ DB.advance(t, "Released", "Resources released from warehouse."); }
      if(act==="transit"){ DB.advance(t, "In Transit", "Dispatched to barangay staging point."); }
      if(act==="deliver"){ DB.advance(t, "Delivered", "Delivered to barangay staging point."); Barcode.issue(t); }
      if(act==="approve"){ t.approvedQty = t.aiFoodQty; t.approvedBy="Mayor's Office"; t.approvalNote="Approved as recommended."; DB.advance(t, "Approved", `Approved by Mayor's Office — ${t.aiFoodQty} food packs (as recommended).`); }
      if(act==="rejectofficial"){ DB.advance(t, "Recommended", "Rejected by approving official — sent back for review."); }
      if(act==="modify"){
        const avail = availableStock("food", t.id);
        const qty = prompt(`AI recommended ${t.aiFoodQty} food packs. Warehouse has ${avail} available. Enter final approved food pack quantity:`, Math.min(t.aiFoodQty, avail));
        if(qty===null) return;
        const num = Number(qty);
        if(isNaN(num) || num < 0){ toast("Enter a valid quantity."); return; }
        if(num > avail){ toast(`Cannot approve more than ${avail} food packs — that's all that's available.`); return; }
        t.approvedQty = num;
        t.approvedBy = "Mayor's Office";
        t.approvalNote = "Modified from AI recommendation by approving official.";
        DB.advance(t, "Approved", `Approved with modification — ${num} food packs (AI recommended ${t.aiFoodQty}, ${avail} were available).`);
      }
      renderTicketList(root);
      App.refreshNotifs();
      toast(`${t.id} updated.`);
    });
  });
}

// Placeholder "AI" — stands in for the teammate's real model, see Views.ai note.
function runAI(t){
  const score = Math.min(99, Math.round(30 + t.affectedPop/40 + Math.random()*15));
  t.aiScore = score;
  t.aiPriority = score>75?"High":score>45?"Medium":"Low";
  const foodReq = t.items.find(i=>i.res==="food")?.qty || 0;
  t.aiFoodQty = Math.max(0, Math.round(foodReq * (0.75 + Math.random()*0.2)));
  DB.advance(t, "Recommended", `AI prioritization engine returned recommendation (${t.aiPriority} priority, score ${score}).`);
}

/* ================================================================
   INVENTORY / RESOURCE ALLOCATION
   ================================================================ */
Views.inventory = function(root){
  const reserved = {};
  DB.state.tickets.forEach(t=>{
    if(["Approved","Released","In Transit"].includes(t.status)){
      t.items.forEach(i=>{ reserved[i.res] = (reserved[i.res]||0) + (i.res==="food" && t.approvedQty!=null ? t.approvedQty : i.qty); });
    }
  });
  const donatedByRes = {};
  DB.state.donations.forEach(d=>{ donatedByRes[d.resource] = (donatedByRes[d.resource]||0) + d.qty; });
  const canReceive = ["admin","official"].includes(App.role);

  root.innerHTML = `
  <section class="view">
    <div class="grid grid-3">
      ${DB.state.inventory.map(inv=>{
        const res = reserved[inv.id]||0;
        const avail = inv.onHand - res;
        const pct = Math.min(100, Math.round(res/inv.onHand*100));
        const donated = donatedByRes[inv.id]||0;
        const donatedPct = inv.onHand ? Math.round(donated/inv.onHand*100) : 0;
        return `<div class="card">
          <div class="card-head"><h3>${inv.label}</h3><span class="hint">${inv.warehouse}</span></div>
          <div class="stat" style="margin-bottom:12px;">
            <span class="num">${avail.toLocaleString()} <span style="font-size:14px;color:var(--text-faint);">${inv.unit}</span></span>
            <span class="lbl">available now</span>
          </div>
          <div style="height:6px;background:var(--panel-2);border-radius:4px;overflow:hidden;margin-bottom:8px;">
            <div style="height:100%;width:${pct}%;background:var(--amber);"></div>
          </div>
          <div style="display:flex;justify-content:space-between;color:var(--text-faint);font-size:11.5px;">
            <span>${res.toLocaleString()} reserved / in pipeline</span><span>${inv.onHand.toLocaleString()} on hand</span>
          </div>
          ${donated>0 ? `<div class="hint" style="margin-top:8px;">${donatedPct}% of on-hand stock (${donated.toLocaleString()} ${inv.unit}) traced to donor contributions</div>` : ""}
        </div>`;
      }).join("")}
    </div>

    <div class="card">
      <div class="card-head"><h3>Allocation by request</h3><span class="hint">approved &amp; in-flight resources</span></div>
      <table>
        <thead><tr><th>Request</th><th>Barangay</th><th>Approved</th><th>Status</th><th>Warehouse route</th></tr></thead>
        <tbody>
          ${DB.state.tickets.filter(t=>t.approvedQty!=null).map(t=>`
            <tr>
              <td>${t.id}</td>
              <td>${t.barangay}</td>
              <td>${t.approvedQty.toLocaleString()} food packs${t.items.find(i=>i.res==='vehicle')?.qty ? ` + ${t.items.find(i=>i.res==='vehicle').qty} vehicle(s)`:''}</td>
              <td>${badgeForStatus(t.status)}</td>
              <td>Central Warehouse A → ${t.barangay}</td>
            </tr>`).join("") || `<tr><td colspan="5"><div class="empty">No approved allocations yet.</div></td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="card">
      <div class="card-head">
        <h3>Donor / external-aid ledger</h3>
        <span class="hint">NGO &amp; private donations, merged into stock but tagged by source</span>
      </div>
      <div class="section-note" style="margin-bottom:16px;">
        Donated goods count toward the same on-hand totals above the moment they're logged — this ledger exists
        so an auditor can still tell which portion of current stock was government-procured versus donated,
        without keeping donors in a separate, harder-to-reconcile system.
      </div>
      ${canReceive ? `
      <form id="donation-form" style="margin-bottom:18px;">
        <div class="field-row">
          <div class="field"><label>Donor / organization</label><input required name="donor" placeholder="e.g. Philippine Red Cross — Cavite Chapter"></div>
          <div class="field"><label>Resource</label>
            ${selectHTML("resource", DB.state.inventory.map(i=>({ value:i.id, label:i.label })), DB.state.inventory[0].id)}
          </div>
        </div>
        <div class="field-row">
          <div class="field"><label>Quantity received</label><input type="number" min="1" required name="qty" placeholder="e.g. 500"></div>
          <div class="field"><label>Note (optional)</label><input name="note" placeholder="e.g. Delivered directly to Central Warehouse A"></div>
        </div>
        <div class="btn-row"><button class="btn btn-primary" type="submit">Log donation &amp; add to stock</button></div>
      </form>` : ""}
      <table>
        <thead><tr><th>Donor</th><th>Resource</th><th>Qty</th><th>Received</th><th>Note</th></tr></thead>
        <tbody>
          ${DB.state.donations.map(d=>{
            const inv = DB.state.inventory.find(i=>i.id===d.resource);
            return `<tr>
              <td>${d.donor}</td>
              <td>${inv?inv.label:d.resource}</td>
              <td>${d.qty.toLocaleString()} ${inv?inv.unit:""}</td>
              <td>${fmtAgo(d.received)}</td>
              <td style="color:var(--text-dim);">${d.note||"—"}</td>
            </tr>`;
          }).join("") || `<tr><td colspan="5"><div class="empty">No donations logged yet.</div></td></tr>`}
        </tbody>
      </table>
    </div>
  </section>`;

  if(canReceive){
    const form = root.querySelector("#donation-form");
    wireSelects(form);
    form.addEventListener("submit", e=>{
      e.preventDefault();
      const f = new FormData(e.target);
      const donor = (f.get("donor")||"").trim();
      const qty = Math.round(Number(f.get("qty"))||0);
      const resource = f.get("resource");
      if(!donor || qty<=0){ toast("Enter a donor name and a quantity greater than zero."); return; }
      DB.receiveDonation({ donor, resource, qty, note:(f.get("note")||"").trim() });
      toast(`Logged ${qty.toLocaleString()} from ${donor} — added to stock.`);
      Views.inventory(document.getElementById("view-root"));
    });
  }
};

/* ================================================================
   AI PRIORITIZATION — placeholder module for teammate's model
   ================================================================ */
Views.ai = function(root){
  const withScores = DB.state.tickets.filter(t=>t.aiScore!=null).sort((a,b)=>b.aiScore-a.aiScore);
  root.innerHTML = `
  <section class="view">
    <div class="section-note">
      <strong>Integration point, not implemented here.</strong> This section is the interface contract for the
      AI &amp; Data Science lead's prioritization/demand model. GForce calls the model after verification and
      renders whatever it returns below — the UI does not compute priority itself. Expected request/response
      shape:
    </div>
    <div class="card">
      <div class="card-head"><h3>Expected model I/O</h3><span class="hint">for integration</span></div>
      <div class="grid grid-2">
        <div>
          <p style="color:var(--text-dim);font-size:12px;margin-bottom:6px;">Request →</p>
          <pre style="background:var(--bg-raised);border:1px solid var(--line);border-radius:8px;padding:12px;font-size:11.5px;color:var(--text-dim);overflow:auto;">{
  "ticketId": "SIS-FLD-2026-1042",
  "affectedPopulation": 1800,
  "requestedItems": {"food": 1000, "water": 2000, "vehicle": 2},
  "inventoryOnHand": {"food": 2000, "water": 8000, "vehicle": 6},
  "hazardSeverity": "alert_level_2",
  "location": {"lat": 14.652, "lng": 121.049}
}</pre>
        </div>
        <div>
          <p style="color:var(--text-dim);font-size:12px;margin-bottom:6px;">← Response (consumed by this dashboard)</p>
          <pre style="background:var(--bg-raised);border:1px solid var(--line);border-radius:8px;padding:12px;font-size:11.5px;color:var(--text-dim);overflow:auto;">{
  "priority": "High",
  "priorityScore": 88,
  "recommendedQty": {"food": 850},
  "rationale": "short string, shown to official"
}</pre>
        </div>
      </div>
      <div class="btn-row" style="margin-top:14px;">
        <button class="btn btn-ghost" id="ai-simulate">Simulate a model response (demo only)</button>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Current recommendations</h3><span class="hint">sorted by priority score</span></div>
      <table>
        <thead><tr><th>Request</th><th>Barangay</th><th>Priority</th><th>Score</th><th>Recommended</th><th>Requested</th></tr></thead>
        <tbody>
          ${withScores.map(t=>`
            <tr>
              <td>${t.id}</td><td>${t.barangay}</td>
              <td>${priorityBadge(t.aiPriority)}</td>
              <td>${t.aiScore}</td>
              <td>${t.aiFoodQty} food packs</td>
              <td>${t.items.find(i=>i.res==='food')?.qty||0} food packs</td>
            </tr>`).join("") || `<tr><td colspan="6"><div class="empty">No requests scored yet — verify a request to trigger a recommendation.</div></td></tr>`}
        </tbody>
      </table>
    </div>
  </section>`;

  root.querySelector("#ai-simulate").addEventListener("click", ()=>{
    const target = DB.state.tickets.find(t=>t.status==="Verified");
    if(!target){ toast("No verified request waiting on a recommendation."); return; }
    runAI(target);
    Views.ai(document.getElementById("view-root"));
    toast(`Simulated recommendation applied to ${target.id}.`);
  });
};

/* ================================================================
   BARCODE — REQUESTOR VIEW
   ================================================================ */
Views["barcode-requestor"] = function(root){
  const eligible = DB.state.tickets.filter(t=>["Released","In Transit","Delivered"].includes(t.status));
  root.innerHTML = `
  <section class="view">
    <div class="section-note"><strong>How this works:</strong> once a request is released for delivery, GForce
      issues a unique pickup code. The requestor presents this barcode on-site; the receiving officer scans
      it on the Barcode Verifier to confirm the correct goods are handed to the correct requestor.
      No scanner on-site? Print the paper manifest below — it carries the same code for manual entry.</div>
    <div class="grid grid-2" id="bc-grid"></div>
  </section>`;

  const grid = root.querySelector("#bc-grid");
  if(!eligible.length){
    grid.innerHTML = `<div class="card empty" style="grid-column:1/-1;"><strong>No pickup codes yet</strong>Codes appear once a request is released for delivery.</div>`;
    return;
  }
  eligible.forEach(t=>{
    const code = Barcode.issue(t);
    const card = document.createElement("div");
    card.className = "card barcode-card";
    card.innerHTML = `
      <h3>${t.id} — ${t.barangay}</h3>
      <p style="color:var(--text-dim);font-size:12px;margin:6px 0 16px;">${itemsSummary(t.items)}</p>
      <svg class="bc-svg"></svg>
      <div class="code-id">${code}</div>
      <div style="margin-top:10px;">${badgeForStatus(t.status)}</div>
      <div class="btn-row" style="margin-top:14px;justify-content:center;">
        <button class="btn btn-sm btn-ghost" data-manifest="${t.id}">Print manifest (fallback)</button>
      </div>
    `;
    grid.appendChild(card);
    Barcode.render(card.querySelector(".bc-svg"), code);
    card.querySelector("[data-manifest]").addEventListener("click", ()=> Barcode.printManifest(t));
  });
  DB.save();
};

/* ================================================================
   BARCODE — ADMIN VERIFIER
   ================================================================ */
Views["barcode-verifier"] = function(root){
  root.innerHTML = `
  <section class="view">
    <div class="grid grid-2">
      <div class="card">
        <div class="card-head"><h3>Scan / enter pickup code</h3><span class="hint">confirms release matches requestor</span></div>
        <div class="field"><label>Pickup code</label><input id="bc-input" placeholder="e.g. GF-1039-7734" autocomplete="off"></div>
        <p style="color:var(--text-faint);font-size:11.5px;margin:-6px 0 14px;">No scanner on-site? Type the code from the printed manifest here — manual entry works exactly like a scan.</p>
        <div class="btn-row">
          <button class="btn btn-primary" id="bc-verify">Verify code</button>
          <button class="btn btn-ghost" id="bc-fill" title="Demo helper">Autofill a valid code</button>
        </div>
        <div id="bc-result"></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Codes issued this response</h3></div>
        <table>
          <thead><tr><th>Code</th><th>Request</th><th>Barangay</th><th>Redeemed</th></tr></thead>
          <tbody>
            ${DB.state.tickets.filter(t=>t.barcode).map(t=>`
              <tr><td>${t.barcode}</td><td>${t.id}</td><td>${t.barangay}</td>
              <td>${t.deliveredConfirmedBy ? `<span class="badge badge-teal">Yes — ${t.deliveredConfirmedBy}</span>` : `<span class="badge badge-dim">No</span>`}</td></tr>
            `).join("") || `<tr><td colspan="4"><div class="empty">No codes issued yet.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  </section>`;

  const resultEl = root.querySelector("#bc-result");
  root.querySelector("#bc-fill").addEventListener("click", ()=>{
    const t = DB.state.tickets.find(t=>t.barcode && !t.deliveredConfirmedBy);
    if(t) root.querySelector("#bc-input").value = t.barcode;
  });

  root.querySelector("#bc-verify").addEventListener("click", ()=>{
    const code = root.querySelector("#bc-input").value;
    if(!code.trim()){ return; }
    const res = Barcode.verify(code);
    if(res.ok){
      const name = prompt("Confirm receiving officer / requestor name to log this pickup:", res.ticket.contact) || res.ticket.contact;
      res.ticket.deliveredConfirmedBy = name;
      DB.advance(res.ticket, "Received", `Pickup verified via barcode by ${name}.`);
      resultEl.innerHTML = `<div class="verify-result verify-ok"><strong>${Icons.check()} Match confirmed.</strong><br>${res.ticket.id} — ${res.ticket.barangay}: ${itemsSummary(res.ticket.items)}.<br>Marked Received and logged.</div>`;
      Views["barcode-verifier"](document.getElementById("view-root"));
    }else if(res.reason==="used"){
      resultEl.innerHTML = `<div class="verify-result verify-used"><strong>${Icons.alert()} Already redeemed.</strong><br>${res.message}</div>`;
    }else{
      resultEl.innerHTML = `<div class="verify-result verify-bad"><strong>${Icons.x()} ${res.reason==='unknown'?'Invalid code':'Not ready for pickup'}.</strong><br>${res.message}</div>`;
    }
  });
};

/* ================================================================
   TRANSPARENCY REPORT
   ================================================================ */
Views.transparency = function(root){
  const T = DB.state.tickets;

  // After-action summary — the numbers a defense/evaluation chapter needs,
  // computed live from the same ticket data the rest of the app uses.
  const fulfilled = T.filter(t=>["Delivered","Received"].includes(t.status));
  const fulfillmentRate = T.length ? Math.round(fulfilled.length/T.length*100) : 0;
  const responseTimes = fulfilled.map(t=>{
    const first = new Date(t.submitted).getTime();
    const deliveredLog = t.log.find(l=>/deliver/i.test(l.a));
    const last = deliveredLog ? new Date(deliveredLog.t).getTime() : new Date(t.submitted).getTime();
    return (last-first)/3600000;
  });
  const avgHrs = responseTimes.length ? (responseTimes.reduce((a,b)=>a+b,0)/responseTimes.length) : 0;
  const allFlags = T.reduce((sum,t)=>sum+DB.fraudFlags(t).length, 0);
  const modified = T.filter(t=>t.approvedQty!=null && t.aiFoodQty!=null && t.approvedQty!==t.aiFoodQty).length;

  root.innerHTML = `
  <section class="view">
    <div class="grid grid-4">
      <div class="card stat"><span class="num">${T.length}</span><span class="lbl">total requests</span></div>
      <div class="card stat"><span class="num">${fulfillmentRate}%</span><span class="lbl">fulfillment rate</span></div>
      <div class="card stat"><span class="num">${avgHrs?avgHrs.toFixed(1):"—"}h</span><span class="lbl">avg. request → delivery</span></div>
      <div class="card stat"><span class="num" style="color:${allFlags?'var(--red)':'var(--text)'}">${allFlags}</span><span class="lbl">integrity flags raised</span></div>
    </div>
    <div class="card">
      <div class="card-head">
        <h3>Full audit trail — resource distribution</h3>
        <div class="btn-row"><button class="btn btn-sm" id="csv-export">Export CSV</button></div>
      </div>
      <table>
        <thead><tr><th>Request</th><th>Barangay</th><th>Requested</th><th>AI recommended</th><th>Approved</th><th>Approving authority</th><th>Status</th><th>Filed</th></tr></thead>
        <tbody>
          ${T.map(t=>`
            <tr>
              <td>${t.id}</td>
              <td>${t.barangay}</td>
              <td>${t.items.find(i=>i.res==='food')?.qty||0}</td>
              <td>${t.aiFoodQty ?? '—'}</td>
              <td>${t.approvedQty ?? '—'}</td>
              <td>${t.approvedBy ?? '—'}</td>
              <td>${badgeForStatus(t.status)}</td>
              <td>${fmtTime(t.submitted)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>

    <div class="grid grid-2">
      ${T.map(t=>`
        <div class="card">
          <div class="card-head"><h3>${t.id} timeline</h3><span class="hint">${t.barangay}</span></div>
          <div class="timeline">
            ${t.log.map((l,i)=>`
              <div class="tl-row">
                <div class="tl-time">${fmtTime(l.t)}</div>
                <div class="tl-line"><div class="tl-dot"></div>${i<t.log.length-1?'<div class="tl-bar"></div>':''}</div>
                <div class="tl-content"><span>${l.a}</span></div>
              </div>`).join("")}
          </div>
        </div>`).join("")}
    </div>
  </section>`;

  root.querySelector("#csv-export").addEventListener("click", ()=>{
    const rows = [["Request","Barangay","Requested Food","AI Recommended","Approved","Approving Authority","Status","Filed"]];
    T.forEach(t=> rows.push([t.id,t.barangay,t.items.find(i=>i.res==='food')?.qty||0,t.aiFoodQty??'',t.approvedQty??'',t.approvedBy??'',t.status,t.submitted]));
    const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], {type:"text/csv"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "gforce_transparency_report.csv";
    a.click();
  });
};

/* ================================================================
   ALERTS & COMMS
   ================================================================ */
Views.alerts = function(root){
  root.innerHTML = `
  <section class="view">
    <div class="card">
      <div class="card-head"><h3>Post an alert</h3><span class="hint">broadcast to all connected barangays</span></div>
      <form id="alert-form">
        <div class="field-row">
          <div class="field"><label>Severity</label>
            ${selectHTML("level", [
              { value:"info", label:"Info" },
              { value:"warning", label:"Warning" },
              { value:"critical", label:"Critical" }
            ], "info")}
          </div>
          <div class="field"><label>Message</label><input name="text" required placeholder="e.g. Water level rising near Brgy. San Isidro"></div>
        </div>
        <div class="btn-row"><button class="btn btn-primary" type="submit">Post alert</button></div>
      </form>
    </div>
    <div class="card">
      <div class="card-head"><h3>Alert log</h3></div>
      <div id="alert-list"></div>
    </div>
  </section>`;

  wireSelects(root);

  function renderAlerts(){
    root.querySelector("#alert-list").innerHTML = DB.state.alerts.map(a=>`
      <div class="log-item">
        <span class="log-dot" style="background:${a.level==='critical'?'var(--red)':a.level==='warning'?'var(--amber)':'var(--steel)'}"></span>
        <div><div>${a.text}</div><div class="log-time" style="width:auto;margin-top:2px;">${fmtAgo(a.t)}</div></div>
      </div>`).join("") || `<div class="empty">No alerts posted.</div>`;
  }
  renderAlerts();

  root.querySelector("#alert-form").addEventListener("submit", e=>{
    e.preventDefault();
    const f = new FormData(e.target);
    DB.state.alerts.unshift({ id:"a"+Date.now(), t:new Date().toISOString(), level:f.get("level"), text:f.get("text") });
    DB.save();
    e.target.reset();
    renderAlerts();
    toast("Alert posted.");
  });
};

/* ================================================================
   EVACUATION CENTERS
   ================================================================ */
Views.evac = function(root){
  root.innerHTML = `
  <section class="view">
    <div class="grid grid-3">
      ${DB.state.evac.map(e=>{
        const pct = Math.round(e.occupied/e.capacity*100);
        const color = pct>90?"var(--red)":pct>60?"var(--amber)":"var(--green)";
        return `<div class="card">
          <div class="card-head"><h3>${e.name}</h3></div>
          <div class="stat" style="margin-bottom:10px;">
            <span class="num" style="color:${color}">${pct}%</span>
            <span class="lbl">${e.occupied} / ${e.capacity} occupants</span>
          </div>
          <div class="field-row">
            <button class="btn btn-sm" data-adj="${e.id}:-10">−10 occupants</button>
            <button class="btn btn-sm" data-adj="${e.id}:10">+10 occupants</button>
          </div>
          <p style="color:var(--text-faint);font-size:11.5px;margin-top:10px;">Serving ${e.barangay}</p>
        </div>`;
      }).join("")}
    </div>
  </section>`;

  root.querySelectorAll("[data-adj]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const [id, delta] = btn.dataset.adj.split(":");
      const e = DB.state.evac.find(x=>x.id===id);
      e.occupied = Math.max(0, Math.min(e.capacity, e.occupied+Number(delta)));
      DB.save();
      Views.evac(document.getElementById("view-root"));
    });
  });
};

/* ================================================================
   VOLUNTEER & PERSONNEL TRACKING — roadmap item 4
   Beyond goods and vehicles, track deployed rescue/relief personnel
   per barangay so staffing gaps show up on the same operating
   picture as resource shortages.
   ================================================================ */
Views.personnel = function(root){
  const P = DB.state.personnel;
  const deployed = P.filter(p=>p.status==="Deployed");
  const canDeploy = ["admin","official"].includes(App.role);

  root.innerHTML = `
  <section class="view">
    <div class="grid grid-3">
      <div class="card stat"><span class="num">${deployed.length}</span><span class="lbl">currently deployed</span></div>
      <div class="card stat"><span class="num">${P.length}</span><span class="lbl">total logged this response</span></div>
      <div class="card stat"><span class="num">${new Set(deployed.map(p=>p.barangay)).size}</span><span class="lbl">barangays staffed</span></div>
    </div>

    ${canDeploy ? `
    <div class="card">
      <div class="card-head"><h3>Deploy personnel</h3><span class="hint">logistics admin / approving official</span></div>
      <form id="personnel-form">
        <div class="field-row">
          <div class="field"><label>Name</label><input required name="name" placeholder="e.g. Rescuer J. Cruz"></div>
          <div class="field"><label>Role</label>
            ${selectHTML("role", ["Rescue Team","Medical","Relief Packing","Transport","Evacuation Support"].map(r=>({value:r,label:r})), "Rescue Team")}
          </div>
        </div>
        <div class="field-row">
          <div class="field"><label>Barangay</label>
            ${selectHTML("barangay", BARANGAYS.map(b=>({ value:b.name, label:b.name })), BARANGAYS[0].name)}
          </div>
          <div class="field"><label>Linked request (optional)</label>
            ${selectHTML("ticketId", [{ value:"", label:"—" }, ...DB.state.tickets.map(t=>({ value:t.id, label:`${t.id} — ${t.barangay}` }))], "")}
          </div>
        </div>
        <div class="btn-row"><button class="btn btn-primary" type="submit">Deploy</button></div>
      </form>
    </div>` : ""}

    <div class="card">
      <div class="card-head"><h3>Deployment log</h3></div>
      <table>
        <thead><tr><th>Name</th><th>Role</th><th>Barangay</th><th>Linked request</th><th>Status</th><th>Since</th><th></th></tr></thead>
        <tbody>
          ${P.map(p=>`
            <tr>
              <td>${p.name}</td><td>${p.role}</td><td>${p.barangay}</td>
              <td>${p.ticketId||"—"}</td>
              <td>${p.status==="Deployed" ? `<span class="badge badge-amber">Deployed</span>` : `<span class="badge badge-teal">Returned</span>`}</td>
              <td>${fmtAgo(p.since)}</td>
              <td>${canDeploy && p.status==="Deployed" ? `<button class="btn btn-sm btn-ghost" data-return="${p.id}">Mark returned</button>` : ""}</td>
            </tr>`).join("") || `<tr><td colspan="7"><div class="empty">No personnel logged yet.</div></td></tr>`}
        </tbody>
      </table>
    </div>
  </section>`;

  if(canDeploy){
    wireSelects(root.querySelector("#personnel-form"));
    root.querySelector("#personnel-form").addEventListener("submit", e=>{
      e.preventDefault();
      const f = new FormData(e.target);
      const name = (f.get("name")||"").trim();
      if(!name){ toast("Enter a name."); return; }
      DB.deployPersonnel({ name, role:f.get("role"), barangay:f.get("barangay"), ticketId:f.get("ticketId")||null });
      toast(`${name} deployed to ${f.get("barangay")}.`);
      Views.personnel(document.getElementById("view-root"));
    });
    root.querySelectorAll("[data-return]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        DB.returnPersonnel(btn.dataset.return);
        Views.personnel(document.getElementById("view-root"));
      });
    });
  }
};

/* ================================================================
   SUGGESTED ROADMAP — answers "what else can you suggest"
   ================================================================ */
Views.roadmap = function(root){
  const groups = [
    { title:"Core modules (this build)", items:[
      ["Offline / low-connectivity fallback","Flooded barangays often lose data signal. Support SMS- or radio-relayed request submission that a verifier keys into GForce manually, so the ticketing pipeline doesn't depend on live internet at the barangay end.", true],
      ["Duplicate & fraud detection","Flag repeat requests from the same barangay/contact within a short window, and cross-check requested quantities against reported population to catch inflated or duplicate claims before they reach an official.", true],
      ["Photo evidence attachments","Let barangays attach photos of flooding or damage to a request, and let receiving officers attach a photo at delivery confirmation — a lightweight supplement to the barcode scan mentioned in the brief.", true],
      ["Volunteer & personnel tracking","Beyond goods and vehicles, track deployed rescue/relief personnel per barangay so staffing gaps show up on the same operating picture as resource shortages.", true],
      ["Donor / external-aid ledger","A separate intake ledger for NGO and private donations, merged into the same inventory pool but tagged by source — keeps government-procured and donated goods distinguishable for audit.", true],
      ["Post-disaster after-action report","Auto-generate a summary report per disaster event (total requests, fulfillment rate, average response time, discrepancies) to feed directly into the research paper's evaluation section.", true],
      ["Role-based notifications","Push alerts to the right role automatically — e.g. notify the approving official the moment a recommendation is ready, notify admin the moment an approval is issued — instead of relying on someone checking the dashboard.", true],
      ["Barcode failure fallback","For cases where scanning hardware isn't available on-site, support manual code entry plus a printable paper manifest as a backup chain-of-custody record.", true],
      ["Barangay self-service portal + shared backend","A separate, simpler site (file a request, see your own history, check live stock) barangays actually get sent, talking to a real Express + JSON-file backend instead of per-browser localStorage — this is what makes the admin dashboard and the barangay portal agree on the same numbers.", true]
    ]},
    { title:"Trust, accountability & security", items:[
      ["Real authentication & per-account accountability","Right now any role can be picked from a dropdown. Named staff logins (even just per-officer passwords) turn every approval/verification log entry into 'this specific person did this specific thing at this specific time' — the single biggest lever left for the anti-corruption thesis.", false],
      ["Tamper-evident audit log","Hash-chain each ticket's log entries (each entry's hash includes the previous entry's hash) so a DB edit made outside the app is detectable — you don't need a blockchain, just a running checksum, to be able to say 'this log was not altered after the fact' in a defense.", false],
      ["Rate limiting & abuse protection on the public portal","The portal's POST /api/tickets is open to anyone with the link. Add basic rate limiting (e.g. express-rate-limit) and a lightweight CAPTCHA or office-code check before this goes on the open internet.", false],
      ["Field-level change history","Track not just status changes but edits to specific fields (approved quantity changed from X to Y, by whom) — currently the log is prose text; structured field diffs are easier to query and report on later.", false]
    ]},
    { title:"Real-world data integration", items:[
      ["Live hydro/hazard feeds","Wire the GIS map's flood-hazard polygon to PAGASA's actual flood advisories/river-level API instead of the mock polygon, so the map reflects real conditions during an actual response.", false],
      ["PSGC-verified barangay registry","Pull the full, authoritative barangay list (and real PSGC codes) from the PSA's published PSGC dataset instead of hand-entering four sample barangays — this is what lets the ticket-ID scheme scale past one LGU cluster.", false],
      ["DSWD/NDRRMC reporting export","LGUs already have to report relief distribution upward in specific formats. An export mode that formats the after-action report to match DSWD's or your region's DRRMC template saves someone from re-typing the same numbers into another spreadsheet.", false]
    ]},
    { title:"Scale & operations", items:[
      ["Swap the JSON file for a real database","Fine at one-LGU scale; the moment several admins are writing heavily at once, move `readState`/`writeState` in server.js to Postgres or SQLite — that's the only place in the codebase that would need to change.", false],
      ["Multi-LGU / multi-tenant support","Running this for more than one municipality means barangay codes need the PSGC-suffix disambiguation already discussed, plus scoping each LGU's data and logins from each other.", false],
      ["Automated backups & disaster recovery for the server itself","A bit on-the-nose given the subject matter, but real: script a nightly copy of data.json off-server (cloud storage, another machine), since 'the disaster response tool' being unrecoverable during a disaster is the one failure mode that can't happen.", false],
      ["Image compression for evidence photos","Request/delivery photos are stored as full base64 currently; downscaling client-side before upload keeps the JSON store small and requests fast on poor connections — directly helps the offline/low-bandwidth story too.", false]
    ]},
    { title:"Usability & reach", items:[
      ["Filipino/Tagalog UI toggle","Barangay-level staff are the actual end users of the portal — a language toggle (or auto-detect) makes it genuinely usable by whoever's on duty, not just whoever's comfortable in English.", false],
      ["Installable/offline-caching portal (PWA)","Add a service worker so the portal's static shell loads even with zero connectivity, queuing a filed request locally until the connection comes back — a stronger version of the SMS/radio fallback for barangays that do have a phone but not always a signal.", false],
      ["Spatial dispatch-sector overlay","The H3/quadtree grid idea from our ID-scheme discussion, as a toggleable GIS layer for triage/routing — separate from ticket IDs, genuinely useful for coordinating rescue teams across barangay lines during a large event.", false],
      ["Accessibility pass","Screen-reader labels, keyboard navigation through the custom dropdowns/forms, and color-contrast check — matters more than usual here since some users will be under real stress during an actual response.", false]
    ]}
  ];

  const flat = groups.flatMap(g=>g.items);
  const doneCount = flat.filter(it=>it[2]).length;

  root.innerHTML = `
  <section class="view">
    <div class="section-note"><strong>Beyond the original brief,</strong> here's what would most strengthen
      GForce for real field use and for scaling past a single-LGU prototype. <strong>${doneCount} of ${flat.length} built so far.</strong></div>
    ${groups.map(g=>`
    <div class="card">
      <div class="card-head"><h3>${g.title}</h3></div>
      ${g.items.map((it,i)=>`
        <div class="roadmap-item">
          <span class="roadmap-num">${String(i+1).padStart(2,"0")}</span>
          <div style="flex:1;">
            <h4>${it[0]} ${it[2] ? `<span class="badge badge-teal" style="margin-left:6px;">Built</span>` : `<span class="badge badge-dim" style="margin-left:6px;">Planned</span>`}</h4>
            <p>${it[1]}</p>
          </div>
        </div>`).join("")}
    </div>`).join("")}
  </section>`;
};
