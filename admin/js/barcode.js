/* ============================================================
   GForce — Barcode issuance & verification
   Code scheme: GF-<ticket sequence>-<4 digit check block>
   The check block is derived from ticket id + approved qty so a
   verifier can flag a mismatched/tampered code without a live
   backend call. Swap `Barcode.lookup` for a server call later.
   ============================================================ */
const Barcode = {

  checksum(ticket){
    const raw = `${ticket.id}:${ticket.approvedQty}:${ticket.barangay}`;
    let h = 0;
    for(let i=0;i<raw.length;i++){ h = (h*31 + raw.charCodeAt(i)) >>> 0; }
    return String(h).slice(-4).padStart(4,"0");
  },

  issue(ticket){
    if(!ticket.barcode){
      const seq = ticket.id.split("-").pop();
      ticket.barcode = `GF-${seq}-${this.checksum(ticket)}`;
      DB.addLog(ticket, `Pickup barcode ${ticket.barcode} issued to requestor.`);
      DB.save();
    }
    return ticket.barcode;
  },

  render(svgEl, code){
    if(window.JsBarcode){
      JsBarcode(svgEl, code, {
        format:"CODE128", width:2.4, height:70, displayValue:false,
        background:"#ffffff", lineColor:"#0E1420", margin:10
      });
    }
  },

  // Verifier lookup: checks the code against known tickets and their state.
  verify(code){
    const clean = code.trim().toUpperCase();
    const ticket = DB.state.tickets.find(t => t.barcode && t.barcode.toUpperCase() === clean);
    if(!ticket){
      return { ok:false, reason:"unknown", message:"No matching request found for this code." };
    }
    if(ticket.deliveredConfirmedBy){
      return { ok:false, reason:"used", message:`This code was already redeemed for ${ticket.id} (${ticket.barangay}).`, ticket };
    }
    if(!["Released","In Transit","Delivered"].includes(ticket.status)){
      return { ok:false, reason:"not-ready", message:`Request ${ticket.id} is not yet cleared for pickup (status: ${ticket.status}).`, ticket };
    }
    return { ok:true, ticket };
  },

  // ---------------------------------------------------------------
  // Fallback for when scanning hardware isn't available on-site —
  // a printable paper manifest carrying the same chain-of-custody
  // fields as the barcode, so a verifier can key the code in manually
  // and still keep a signed paper trail. Roadmap item 8.
  // ---------------------------------------------------------------
  printManifest(ticket){
    const w = window.open("", "_blank", "width=480,height=680");
    if(!w){ return; }
    const rows = ticket.items.filter(i=>i.qty>0).map(i=>{
      const labels = { food:"Food packs", water:"Drinking water (L)", vehicle:"Rescue vehicles" };
      const qty = (i.res==="food" && ticket.approvedQty!=null) ? ticket.approvedQty : i.qty;
      return `<tr><td>${labels[i.res]||i.res}</td><td style="text-align:right;">${qty.toLocaleString()}</td></tr>`;
    }).join("");
    w.document.write(`
      <html><head><title>Manifest — ${ticket.id}</title>
      <style>
        body{ font-family:-apple-system,Helvetica,Arial,sans-serif; padding:28px; color:#111; }
        h1{ font-size:18px; margin:0 0 4px; } h2{ font-size:12px; color:#555; font-weight:500; margin:0 0 20px; }
        table{ width:100%; border-collapse:collapse; margin-bottom:20px; }
        td, th{ padding:8px 6px; border-bottom:1px solid #ddd; font-size:13px; text-align:left; }
        .code{ font-family:'Courier New',monospace; font-size:20px; letter-spacing:2px; text-align:center;
               border:2px solid #111; padding:14px; margin:16px 0; }
        .sig{ margin-top:48px; display:flex; justify-content:space-between; }
        .sig div{ width:45%; border-top:1px solid #111; padding-top:6px; font-size:11px; color:#555; }
        .note{ font-size:11px; color:#777; margin-top:18px; }
      </style></head><body>
        <h1>GForce Pickup Manifest</h1>
        <h2>${ticket.id} — ${ticket.barangay} — fallback record when barcode scanning hardware is unavailable</h2>
        <table>
          <tr><th>Requestor</th><td>${ticket.contact}</td></tr>
          <tr><th>Status</th><td>${ticket.status}</td></tr>
          <tr><th>Approving authority</th><td>${ticket.approvedBy||"—"}</td></tr>
        </table>
        <table>${rows}</table>
        <div class="code">${ticket.barcode||"NO CODE ISSUED"}</div>
        <p class="note">If the scanner is unavailable, key this code into GForce's Barcode Verifier manually to confirm receipt.</p>
        <div class="sig">
          <div>Released by (signature)</div>
          <div>Received by (signature)</div>
        </div>
      </body></html>
    `);
    w.document.close();
    w.print();
  }
};
