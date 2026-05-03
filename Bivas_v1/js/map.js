const OSRM = "https://router.project-osrm.org/route/v1";
const ROUTE_COLORS = ["#e74c3c", "#2f80ed", "#8e44ad", "#16a085", "#f39c12", "#c0392b"];

let BUILDINGS = {};
let buildingsReady = loadBuildings();
let map = null;
let mapUnavailable = false;
let markers = [];
let routeLine = [];

async function loadBuildings() {
  try {
    const response = await fetch("js/building.js");
    if (!response.ok) throw new Error(`Building file returned ${response.status}`);
    BUILDINGS = await response.json();
  } catch (err) {
    console.error("Building locations failed to load:", err);
    BUILDINGS = {};
  }
}

if (window.L) {
  map = L.map("map").setView([44.5646, -123.2776], 16);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "OpenStreetMap contributors"
  }).addTo(map);
} else {
  mapUnavailable = true;
  document.getElementById("map").innerHTML = `
    <div class="map-error">
      Map failed to load. Check your internet connection and reload the page.
    </div>
  `;
}

function clearMap() {
  if (!map) return;
  markers.forEach(m => map.removeLayer(m));
  routeLine.forEach(l => map.removeLayer(l));
  markers = [];
  routeLine = [];
  map.closePopup();
}

function normalizeDays(days) {
  return (days || "").replaceAll("Th", "R");
}

function addPin(cls, index) {
  if (!map) return;
  const b = BUILDINGS[cls.building];
  if (!b) return;

  const icon = L.divIcon({
    className: "",
    html: `<div style="
      width:32px; height:32px;
      background:${cls.color};
      border:2px solid white;
      border-radius:50%;
      display:flex; align-items:center; justify-content:center;
      font-size:11px; font-weight:700; color:white;
      font-family:monospace;
      box-shadow:0 2px 6px rgba(0,0,0,0.3);
    ">${index + 1}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

  const marker = L.marker([b.lat, b.lng], { icon })
    .addTo(map)
    .bindPopup(`
      <div style="font-family:monospace; font-size:12px;">
        <strong>${cls.name}</strong> - ${cls.title}<br>
        CRN ${cls.crn}<br>
        ${b.name}<br>
        Room ${cls.room}<br>
        ${formatTime(cls.start)}-${formatTime(cls.end)} | ${normalizeDays(cls.days)}
      </div>
    `);

  markers.push(marker);
}

function focusBuilding(cls) {
  if (!map) return;
  const b = BUILDINGS[cls.building];
  if (!b) return;
  map.flyTo([b.lat, b.lng], 18, { duration: 0.8 });
  markers.forEach(m => {
    if (m.getLatLng().lat === b.lat && m.getLatLng().lng === b.lng) {
      m.openPopup();
    }
  });
}

async function getRoute(from, to, profile = "driving") {
  const coords = `${from[1]},${from[0]};${to[1]},${to[0]}`;
  const url = `${OSRM}/${profile}/${coords}?overview=full&geometries=geojson`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    return data.routes?.[0] || null;
  } catch (err) {
    console.error("Routing error:", err);
    return null;
  }
}

function distanceMiles(from, to) {
  const radiusMiles = 3958.8;
  const dLat = (to[0] - from[0]) * Math.PI / 180;
  const dLng = (to[1] - from[1]) * Math.PI / 180;
  const lat1 = from[0] * Math.PI / 180;
  const lat2 = to[0] * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return radiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimatedMinutes(from, to, mph) {
  return Math.max(1, Math.round((distanceMiles(from, to) / mph) * 60));
}

function offsetPolyline(coords, offsetPixels) {
  if (!map || !offsetPixels || coords.length < 2) return coords;

  return coords.map((coord, index) => {
    const prev = coords[Math.max(0, index - 1)];
    const next = coords[Math.min(coords.length - 1, index + 1)];
    const prevPoint = map.latLngToLayerPoint(prev);
    const nextPoint = map.latLngToLayerPoint(next);
    const dx = nextPoint.x - prevPoint.x;
    const dy = nextPoint.y - prevPoint.y;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;
    const normalX = -dy / length;
    const normalY = dx / length;
    const point = map.latLngToLayerPoint(coord);
    return map.layerPointToLatLng(L.point(
      point.x + normalX * offsetPixels,
      point.y + normalY * offsetPixels
    ));
  });
}

async function drawRoute(classes) {
  if (!map) return;
  const dayClasses = classes
    .filter(c => BUILDINGS[c.building])
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

  if (dayClasses.length < 2) return;

  const segmentCount = dayClasses.length - 1;

  for (let i = 0; i < dayClasses.length - 1; i++) {
    const fromClass = dayClasses[i];
    const toClass = dayClasses[i + 1];
    const fromB = BUILDINGS[fromClass.building];
    const toB = BUILDINGS[toClass.building];
    const from = [fromB.lat, fromB.lng];
    const to = [toB.lat, toB.lng];
    const driveRoute = await getRoute(from, to, "driving");
    const routeCoords = driveRoute
      ? driveRoute.geometry.coordinates.map(([lng, lat]) => [lat, lng])
      : [from, to];
    const offsetPixels = (i - ((segmentCount - 1) / 2)) * 8;
    const lineCoords = offsetPolyline(routeCoords, offsetPixels);
    const color = ROUTE_COLORS[i % ROUTE_COLORS.length];

    const line = L.polyline(lineCoords, {
      color,
      weight: 4,
      opacity: 0.9,
    }).addTo(map);
    routeLine.push(line);

    const midCoord = lineCoords[Math.floor(lineCoords.length / 2)];
    const gap = toMinutes(toClass.start) - toMinutes(fromClass.end);
    const gapColor = gap < 15 ? "#c0392b" : gap < 30 ? "#e67e22" : "#27ae60";
    const walkMins = estimatedMinutes(from, to, 3);
    const bikeMins = estimatedMinutes(from, to, 10);
    const driveMins = driveRoute
      ? Math.max(1, Math.round(driveRoute.duration / 60))
      : estimatedMinutes(from, to, 18);

    const popup = L.popup({ closeButton: true, autoClose: false, closeOnClick: false })
      .setLatLng(midCoord)
      .setContent(`
        <div style="font-family:monospace; font-size:12px; min-width:160px;">
          <div style="font-weight:700; margin-bottom:6px; color:${color};">
            ${fromClass.name} to ${toClass.name}
          </div>
          <div style="margin-bottom:6px;">CRN ${fromClass.crn} to ${toClass.crn}</div>
          <table style="width:100%;">
            <tr><td>Walk</td><td style="text-align:right; font-weight:600;">${walkMins} min</td></tr>
            <tr><td>Bike</td><td style="text-align:right; font-weight:600;">${bikeMins} min</td></tr>
            <tr><td>Drive</td><td style="text-align:right; font-weight:600;">${driveMins} min</td></tr>
          </table>
          <div style="margin-top:6px; padding-top:6px; border-top:1px solid #eee; color:${gapColor};">
            ${gap} min between classes
          </div>
        </div>
      `)
      .addTo(map);
    routeLine.push(popup);
  }
}

async function renderMap(classes) {
  if (mapUnavailable) return;
  await buildingsReady;
  clearMap();
  classes.forEach((cls, i) => addPin(cls, i));
  await drawRoute(classes);

  const coords = classes
    .map(c => BUILDINGS[c.building])
    .filter(Boolean)
    .map(b => [b.lat, b.lng]);
  if (coords.length) {
    map.fitBounds(L.latLngBounds(coords).pad(0.2));
  } else if (map) {
    map.setView([44.5646, -123.2776], 16);
  }
}

