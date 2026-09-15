/* ============================================================
   GForce — GIS Disaster Map (Leaflet, 2D)
   Mock flood polygon + barangay/evac/warehouse/request markers.
   Each layer maps to §6 of the project doc. Swap the GeoJSON
   sources for real hazard/hydro feeds when available.
   ============================================================ */

// Optional: paste a free MapTiler key here (maptiler.com/cloud, no
// credit card) for the most reliable basemap. Every public, keyless
// tile host has its own anti-hotlinking rules, and which one lets a
// given network/browser through varies — a keyed provider is the only
// option that doesn't depend on guessing right. Leave blank to fall
// back through the keyless providers below automatically.
const MAP_TILE_API_KEY = "";

// Tried in order until one actually loads tiles. Each entry is a style
// built for exactly this kind of embedding, not a scraped tile host.
const TILE_PROVIDERS = [
  ...(MAP_TILE_API_KEY ? [{
    url:`https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${MAP_TILE_API_KEY}`,
    attribution:'&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; OpenStreetMap contributors'
  }] : []),
  {
    url:'https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png',
    attribution:'&copy; <a href="https://wikimediafoundation.org/wiki/Maps_Terms_of_Use">Wikimedia</a> &copy; OpenStreetMap contributors'
  },
  {
    url:'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    attribution:'&copy; OpenStreetMap France (Humanitarian) &copy; OpenStreetMap contributors'
  },
  {
    url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution:'&copy; Esri &mdash; Source: Esri, HERE, Garmin, USGS, NGA'
  }
];

const GIS = {
  map:null, layers:{}, base:null, providerIndex:0, tileFailures:0,

  init(containerId){
    if(this.map){ this.map.remove(); this.map=null; }
    this.providerIndex = 0;
    this.tileFailures = 0;

    this.map = L.map(containerId, { zoomControl:true }).setView([14.646, 121.046], 13);
    this.containerId = containerId;

    const provider = TILE_PROVIDERS[0];
    this.base = L.tileLayer(provider.url, { attribution:provider.attribution, maxZoom:19 }).addTo(this.map);

    const savedTheme = localStorage.getItem("gforce_theme")==="dark" ? "dark" : "light";
    GIS.applyTheme(savedTheme);

    // If a provider gets blocked (hotlink policy, network firewall, rate
    // limit), move to the next one instead of just sitting on a gray
    // grid. Only after every provider has failed do we say so plainly.
    this.base.on("tileerror", ()=> this.handleTileError());

    // Flood hazard zone (mock polygon)
    this.layers.hazard = L.polygon([
      [14.660,121.028],[14.665,121.052],[14.648,121.066],[14.630,121.055],[14.633,121.030]
    ], { color:"#C82E1B", weight:1.5, fillColor:"#C82E1B", fillOpacity:0.12 })
      .bindTooltip("Flood hazard zone — Alert Level 2", {sticky:true});

    // Barangay boundary markers (mock centroids)
    const barangays = [
      {name:"Brgy. San Isidro", lat:14.652, lng:121.049, pop:6200},
      {name:"Brgy. Malinis", lat:14.661, lng:121.038, pop:3100},
      {name:"Brgy. Sta. Cruz", lat:14.640, lng:121.062, pop:2600},
      {name:"Brgy. Look-Bunga", lat:14.629, lng:121.031, pop:1400}
    ];
    this.layers.barangay = L.layerGroup(barangays.map(b =>
      L.circleMarker([b.lat,b.lng], {radius:5, color:"#33587A", weight:1, fillOpacity:.6})
        .bindTooltip(`${b.name} — pop. ${b.pop.toLocaleString()}`)
    ));

    // Evacuation centers, sized/colored by occupancy
    this.layers.evac = L.layerGroup(DB.state.evac.map(e=>{
      const pct = e.occupied/e.capacity;
      const color = pct>0.9 ? "#C82E1B" : pct>0.6 ? "#96651E" : "#2E6B45";
      return L.circleMarker([evacLatLng(e)[0], evacLatLng(e)[1]], {radius:7, color, weight:2, fillOpacity:.5})
        .bindTooltip(`${e.name}<br>${e.occupied}/${e.capacity} occupants (${Math.round(pct*100)}%)`);
    }));

    // Warehouses
    this.layers.warehouse = L.layerGroup([
      L.marker([14.648,121.041], {icon:diamondIcon("#96651E")}).bindTooltip("Central Warehouse A — Food / Water"),
      L.marker([14.635,121.052], {icon:diamondIcon("#96651E")}).bindTooltip("Motor Pool — Rescue Vehicles")
    ]);

    // Active requests
    this.layers.requests = L.layerGroup(DB.state.tickets.map(t=>{
      const color = t.status==="Requested"||t.status==="Verified" ? "#96651E" :
                    t.status==="Delivered"||t.status==="Received" ? "#2E6B45" : "#33587A";
      return L.marker([t.lat,t.lng], {icon:pinIcon(color)})
        .bindTooltip(`${t.id} — ${t.barangay}<br>Status: ${t.status}`);
    }));

    // Roads (mock accessibility line)
    this.layers.roads = L.polyline([[14.629,121.031],[14.648,121.041],[14.661,121.038]], {
      color:"#6B6A60", weight:2, dashArray:"4 5"
    }).bindTooltip("Primary access route — 1 segment reported impassable");

    Object.values(this.layers).forEach(l=>l.addTo(this.map));
  },

  toggle(name, on){
    if(!this.layers[name]) return;
    if(on) this.layers[name].addTo(this.map);
    else this.map.removeLayer(this.layers[name]);
  },

  handleTileError(){
    this.tileFailures++;
    if(this.tileFailures < 6) return; // let a few one-off timeouts slide

    this.tileFailures = 0;
    this.providerIndex++;
    if(this.providerIndex < TILE_PROVIDERS.length){
      const next = TILE_PROVIDERS[this.providerIndex];
      this.base.setUrl(next.url);
      return;
    }
    // Every provider failed — almost always a network/firewall blocking
    // outbound tile requests entirely, not something fixable in code.
    const el = document.getElementById(this.containerId);
    if(el.querySelector(".map-offline-note")) return;
    const note = document.createElement("div");
    note.className = "map-offline-note";
    note.innerHTML = `Map tiles unavailable from any provider — likely a network/firewall block on this
      connection rather than the app. Markers and layers below still work. For a guaranteed basemap, add a
      free key from <a href="https://www.maptiler.com/cloud/" target="_blank" rel="noopener">maptiler.com</a>
      to <code>MAP_TILE_API_KEY</code> in js/map.js.`;
    el.appendChild(note);
  },

  // Single (light) tile style, so dark mode applies a CSS filter to the
  // tile pane rather than switching tile servers.
  applyTheme(mode){
    if(!this.map) return;
    const container = this.map.getContainer();
    container.classList.toggle("map-dark", mode==="dark");
  }
};

function evacLatLng(e){
  const map = { ec1:[14.653,121.050], ec2:[14.662,121.037], ec3:[14.639,121.063] };
  return map[e.id] || [14.646,121.046];
}

function diamondIcon(color){
  return L.divIcon({
    className:"", html:`<div style="width:12px;height:12px;background:${color};transform:rotate(45deg);border:1px solid #0E1420;"></div>`,
    iconSize:[12,12]
  });
}
function pinIcon(color){
  return L.divIcon({
    className:"", html:`<div style="width:11px;height:11px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);border:1px solid #0E1420;"></div>`,
    iconSize:[11,11]
  });
}
