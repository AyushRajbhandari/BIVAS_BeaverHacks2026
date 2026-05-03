const ROUTE_COLORS = ["#e74c3c", "#2f80ed", "#8e44ad", "#16a085", "#f39c12", "#c0392b"];

let BUILDINGS = {};
let buildingsReady = loadBuildings();
let map = null;
let directionsService = null;
let mapUnavailable = false;
let pendingClasses = null;
let currentRouteMode = "WALKING";
let currentMapClasses = [];
let routeModeSwitch = null;
let markers = [];
let routeEndpointMarkers = [];
let routeLines = [];
let infoWindows = [];

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

function refreshMapSize() {
  if (!map || typeof google === "undefined" || !google.maps?.event) return;

  requestAnimationFrame(() => {
    google.maps.event.trigger(map, "resize");
  });
}

function initMap() {
  const container = document.getElementById("map");
  if (!container || mapUnavailable) return;

  try {
    map = new google.maps.Map(container, {
      center: { lat: 44.5646, lng: -123.2776 },
      zoom: 16,
      mapTypeControl: false,
      streetViewControl: false,
    });
    directionsService = new google.maps.DirectionsService();
    attachRouteModeSwitch();
    refreshMapSize();

    if (pendingClasses) {
      const classes = pendingClasses;
      pendingClasses = null;
      renderMap(classes);
    }
  } catch (err) {
    mapUnavailable = true;
    container.innerHTML = `<div class="map-error">Map failed to load.</div>`;
    console.error("Google Map failed to initialize:", err);
  }
}

window.initMap = initMap;

function bindRouteModeSwitch(switchEl) {
  switchEl.querySelectorAll("[data-route-mode]").forEach(button => {
    button.addEventListener("click", async () => {
      const nextMode = button.dataset.routeMode;
      if (!nextMode || nextMode === currentRouteMode) return;

      currentRouteMode = nextMode;
      updateRouteModeSwitch();
      await renderMap(currentMapClasses);
    });
  });

  updateRouteModeSwitch();
}

function createRouteModeSwitch() {
  const switchEl = document.createElement("div");
  switchEl.className = "route-mode-switch";
  switchEl.id = "route-mode-switch";
  switchEl.setAttribute("aria-label", "Route travel mode");
  switchEl.innerHTML = `
    <span class="route-mode-thumb"></span>
    <button type="button" class="route-mode-option active" data-route-mode="WALKING">Walk</button>
    <button type="button" class="route-mode-option" data-route-mode="BICYCLING">Bike</button>
  `;
  bindRouteModeSwitch(switchEl);
  return switchEl;
}

function attachRouteModeSwitch() {
  if (!map || !google.maps?.ControlPosition) return;

  if (!routeModeSwitch) {
    routeModeSwitch = createRouteModeSwitch();
  }

  if (!routeModeSwitch.parentNode) {
    map.controls[google.maps.ControlPosition.TOP_LEFT].push(routeModeSwitch);
  }

  updateRouteModeSwitch();
}

function updateRouteModeSwitch() {
  const switchEl = routeModeSwitch || document.getElementById("route-mode-switch");
  if (!switchEl) return;

  switchEl.classList.toggle("biking", currentRouteMode === "BICYCLING");
  switchEl.querySelectorAll("[data-route-mode]").forEach(button => {
    button.classList.toggle("active", button.dataset.routeMode === currentRouteMode);
  });
}

function clearMap() {
  markers.forEach(marker => marker.setMap(null));
  routeEndpointMarkers.forEach(marker => marker.setMap(null));
  routeLines.forEach(line => line.setMap(null));
  infoWindows.forEach(infoWindow => infoWindow.close());
  markers = [];
  routeEndpointMarkers = [];
  routeLines = [];
  infoWindows = [];
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function normalizeDays(days) {
  return (days || "").replaceAll("Th", "R");
}

function buildingPosition(building) {
  return { lat: building.lat, lng: building.lng };
}

function sortedClassesWithLocations(classes) {
  return classes
    .filter(cls => BUILDINGS[cls.building])
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
}

function addPin(cls, index) {
  if (!map) return;
  const building = BUILDINGS[cls.building];
  if (!building) return;

  const marker = new google.maps.Marker({
    position: buildingPosition(building),
    map,
    label: {
      text: (index + 1).toString(),
      color: "white",
      fontWeight: "700",
    },
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: cls.color || "#333",
      fillOpacity: 1,
      strokeWeight: 2,
      strokeColor: "white",
      scale: 16,
    },
  });

  const infoWindow = new google.maps.InfoWindow({
    content: `
      <div style="font-family:monospace; font-size:12px; color:#333;">
        <strong>${escapeHtml(cls.name)}</strong> - ${escapeHtml(cls.title)}<br>
        CRN ${escapeHtml(cls.crn)}<br>
        ${escapeHtml(building.name)}<br>
        Room ${escapeHtml(cls.room)}<br>
        ${formatTime(cls.start)}-${formatTime(cls.end)} | ${normalizeDays(cls.days)}
      </div>
    `,
  });

  marker.addListener("click", () => {
    infoWindows.forEach(iw => iw.close());
    infoWindow.open(map, marker);
  });

  marker.classBuilding = cls.building;
  markers.push(marker);
  infoWindows.push(infoWindow);
}

function getRoute(origin, destination) {
  return new Promise(resolve => {
    directionsService.route({
      origin,
      destination,
      travelMode: google.maps.TravelMode[currentRouteMode],
      provideRouteAlternatives: false,
    }, (result, status) => {
      resolve(status === "OK" ? result : null);
    });
  });
}

function routeModeLabel() {
  return currentRouteMode === "BICYCLING" ? "Bike" : "Walk";
}

function routeEndpointIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
      <circle cx="9" cy="9" r="7" fill="white" stroke="black" stroke-width="1.5"/>
      <circle cx="9" cy="9" r="3.2" fill="black"/>
    </svg>
  `;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(18, 18),
    anchor: new google.maps.Point(9, 9),
  };
}

function addRouteEndpoint(position, zIndex) {
  const marker = new google.maps.Marker({
    position,
    map,
    icon: routeEndpointIcon(),
    clickable: false,
    zIndex,
  });

  routeEndpointMarkers.push(marker);
  return marker;
}

function selectRoute(selectedLine) {
  routeLines.forEach((line, index) => {
    const selected = line === selectedLine;
    line.setOptions({
      strokeOpacity: selected ? 1 : 0.75,
      strokeWeight: selected ? 8 : 5,
      zIndex: selected ? 1000 : 100 + index,
    });

    line.endpointMarkers?.forEach(marker => {
      marker.setZIndex(selected ? 1001 : 200 + index);
    });
  });
}

function addRoutePopup(route, fromClass, toClass, color) {
  const path = route.routes[0].overview_path;
  const leg = route.routes[0].legs[0];
  const gap = toMinutes(toClass.start) - toMinutes(fromClass.end);
  const gapColor = gap < 15 ? "#c0392b" : gap < 30 ? "#e67e22" : "#27ae60";
  const travelMins = Math.max(1, Math.round(leg.duration.value / 60));

  const popup = new google.maps.InfoWindow({
    position: path[Math.floor(path.length / 2)],
    content: `
      <div style="font-family:monospace; font-size:12px; min-width:170px;">
        <div style="font-weight:700; margin-bottom:6px; color:${color};">
          ${escapeHtml(fromClass.name)} to ${escapeHtml(toClass.name)}
        </div>
        <table style="width:100%;">
          <tr><td>${routeModeLabel()}</td><td style="text-align:right; font-weight:600;">${travelMins} min</td></tr>
          <tr><td>Distance</td><td style="text-align:right; font-weight:600;">${escapeHtml(leg.distance?.text || "")}</td></tr>
        </table>
        <div style="margin-top:6px; padding-top:6px; border-top:1px solid #eee; color:${gapColor};">
          ${gap} min class gap
        </div>
      </div>
    `,
  });

  popup.open(map);
  infoWindows.push(popup);
  return popup;
}

async function drawRoute(classes) {
  if (!map || !directionsService) return;
  const dayClasses = sortedClassesWithLocations(classes);
  if (dayClasses.length < 2) return;

  for (let i = 0; i < dayClasses.length - 1; i++) {
    const fromClass = dayClasses[i];
    const toClass = dayClasses[i + 1];
    const fromBuilding = BUILDINGS[fromClass.building];
    const toBuilding = BUILDINGS[toClass.building];

    if (fromClass.building === toClass.building) continue;

    const result = await getRoute(
      buildingPosition(fromBuilding),
      buildingPosition(toBuilding)
    );

    if (!result?.routes?.[0]?.overview_path?.length) {
      console.warn(`No ${currentRouteMode.toLowerCase()} route found from ${fromClass.building} to ${toClass.building}`);
      continue;
    }

    const color = ROUTE_COLORS[i % ROUTE_COLORS.length];
    const polyline = new google.maps.Polyline({
      path: result.routes[0].overview_path,
      strokeColor: color,
      strokeOpacity: 0.85,
      strokeWeight: 5,
      zIndex: 100 + i,
      map,
    });
    const popup = addRoutePopup(result, fromClass, toClass, color);
    const path = result.routes[0].overview_path;
    const startMarker = addRouteEndpoint(path[0], 200 + i);
    const endMarker = addRouteEndpoint(path[path.length - 1], 200 + i);
    polyline.endpointMarkers = [startMarker, endMarker];

    polyline.addListener("click", () => {
      infoWindows.forEach(iw => iw.close());
      selectRoute(polyline);
      popup.open(map);
    });

    routeLines.push(polyline);
  }
}

function focusBuilding(cls) {
  if (!map) return;
  const building = BUILDINGS[cls.building];
  if (!building) return;

  infoWindows.forEach(iw => iw.close());
  map.panTo(buildingPosition(building));
  map.setZoom(Math.max(map.getZoom(), 17));

  const markerIndex = markers.findIndex(marker => marker.classBuilding === cls.building);
  if (markerIndex >= 0) {
    infoWindows[markerIndex].open(map, markers[markerIndex]);
  }
}

async function renderMap(classes) {
  if (mapUnavailable) return;
  currentMapClasses = classes;
  await buildingsReady;

  if (typeof google === "undefined" || !google.maps) {
    pendingClasses = classes;
    return;
  }

  if (!map) initMap();
  if (!map) return;

  refreshMapSize();
  clearMap();

  const dayClasses = sortedClassesWithLocations(classes);
  dayClasses.forEach((cls, index) => addPin(cls, index));
  await drawRoute(dayClasses);

  const bounds = new google.maps.LatLngBounds();
  dayClasses.forEach(cls => bounds.extend(buildingPosition(BUILDINGS[cls.building])));
  routeLines.forEach(line => {
    line.getPath().forEach(point => bounds.extend(point));
  });

  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, 56);
  }
}
