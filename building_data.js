// building_data.js — fetches buildings.json and blocks until ready
window.BUILDING_DATA = null;

window.buildingDataReady = fetch("buildings.json")
  .then(r => {
    if (!r.ok) throw new Error(`Could not load buildings.json (HTTP ${r.status})`);
    return r.json();
  })
  .then(data => {
    window.BUILDING_DATA = data;
    console.info("[BUILDING DATA] Loaded", Object.keys(data).length, "buildings from buildings.json");
  })
  .catch(err => {
    console.error("[BUILDING DATA] Failed to load buildings.json:", err);
  });
