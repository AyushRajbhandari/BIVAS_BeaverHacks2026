// ============================================================
//  HACKATHON GLUE — CRN Lookup → Map + Timeline
//  Connects: Flask API · BUILDING_DATA · Leaflet · Timeline
// ============================================================

// ------------------------------------
// 0. FALLBACK COORDINATES
//    Used when a building code is missing from BUILDING_DATA.
//    Points to the center of OSU campus.
// ------------------------------------
const FALLBACK_COORDS = { lat: 44.5650, lng: -123.2788 };

// ------------------------------------
// 1. EVENT LISTENER
//    Wires the form button to the main async handler.
//    Prevents double-submits by disabling the button mid-flight.
// ------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  const submitBtn = document.getElementById("submit-crn");
  const crnInput  = document.getElementById("crn-input");

  if (!submitBtn || !crnInput) {
    console.error("[GLUE] FATAL: Could not find #submit-crn or #crn-input in the DOM.");
    return; // bail early — no point continuing if the form isn't there
  }

  submitBtn.addEventListener("click", async () => {
    const crn = crnInput.value.trim();

    // --- basic input guard ---
    if (!crn) {
      showUserError("Please enter a CRN before submitting.");
      return;
    }

    // --- disable button so we don't fire two requests at once ---
    submitBtn.disabled = true;
    submitBtn.textContent = "Loading…";

    try {
      await lookupAndRender(crn);
    } finally {
      // always re-enable, even if lookupAndRender threw
      submitBtn.disabled = false;
      submitBtn.textContent = "Look Up";
    }
  });
});


// ------------------------------------
// 2. CORE ASYNC FUNCTION
//    Fetches, merges, and calls the map + timeline APIs.
// ------------------------------------
async function lookupAndRender(crn) {
  await window.buildingDataReady;

  // ── Step A: Fetch from Flask ─────────────────────────────
  let courseData;
  try {
    const response = await fetch(`http://localhost:5000/class/${encodeURIComponent(crn)}`);

    if (!response.ok) {
      // e.g. 404 = unknown CRN, 500 = server blew up
      const msg = `API returned HTTP ${response.status} for CRN "${crn}".`;
      showUserError(msg);
      console.error("[GLUE] Fetch failed:", msg);
      return; // stop here — nothing to render
    }

    courseData = await response.json();
  } catch (networkErr) {
    // fetch() itself threw — server is probably down or CORS blocked
    showUserError("Could not reach the course API. Is the Flask server running on port 5000?");
    console.error("[GLUE] Network error fetching CRN:", networkErr);
    return;
  }

  // ── Step B: Validate the shape of the response ───────────
  // Guard against the backend sending malformed JSON mid-demo.
  const requiredFields = ["crn", "name", "building", "start", "end", "days"];
  for (const field of requiredFields) {
    if (courseData[field] == null) {
      showUserError(`API response is missing the "${field}" field. Check the Flask endpoint.`);
      console.error("[GLUE] Malformed API response — missing field:", field, courseData);
      return;
    }
  }

  // ── Step C: Merge with BUILDING_DATA ─────────────────────
  const buildingCode = courseData.building;
  let coords;

  try {
    if (typeof BUILDING_DATA === "undefined") {
      throw new Error("BUILDING_DATA global is not defined — was the JSON file loaded?");
    }

    const buildingEntry = BUILDING_DATA[buildingCode];

    if (!buildingEntry) {
      // Building code came from the API but isn't in our lookup table.
      // Use the fallback so the pin still lands on the map.
      console.warn(
        `[GLUE] Building code "${buildingCode}" not found in BUILDING_DATA. Using fallback coords.`
      );
      showUserWarning(
        `Unknown building code "${buildingCode}". Showing a fallback pin on the map.`
      );
      coords = FALLBACK_COORDS;
    } else if (buildingEntry.lat == null || buildingEntry.lng == null) {
      // Entry exists but coords are broken
      console.warn(
        `[GLUE] BUILDING_DATA["${buildingCode}"] is missing lat/lng. Using fallback.`,
        buildingEntry
      );
      coords = FALLBACK_COORDS;
    } else {
      coords = { lat: buildingEntry.lat, lng: buildingEntry.lng };
    }
  } catch (lookupErr) {
    // Catch-all for anything weird in the lookup (e.g. BUILDING_DATA is null)
    console.error("[GLUE] Building lookup error:", lookupErr);
    showUserWarning("Building lookup failed. Using fallback pin location.");
    coords = FALLBACK_COORDS;
  }

  // ── Step D: Build human-readable popup text ───────────────
  const buildingDisplayName =
    (typeof BUILDING_DATA !== "undefined" &&
      BUILDING_DATA[buildingCode]?.name) ||
    buildingCode; // fall back to raw code if no display name

  const popupText =
    `<strong>${courseData.name}</strong><br>` +
    `${buildingDisplayName}<br>` +
    `${courseData.days} · ${courseData.start}–${courseData.end}`;

  // ── Step E: Call Person 2's map function ──────────────────
  try {
    if (typeof addPinToMap !== "function") {
      throw new Error("addPinToMap is not defined — is Person 2's script loaded?");
    }
    addPinToMap(coords.lat, coords.lng, popupText);
  } catch (mapErr) {
    // Map failure is bad, but we can still add it to the timeline.
    console.error("[GLUE] addPinToMap failed:", mapErr);
    showUserWarning("Map pin could not be added, but the course was still added to the timeline.");
  }

  // ── Step F: Call Person 3's timeline function ─────────────
  try {
    if (typeof addCourseToTimeline !== "function") {
      throw new Error("addCourseToTimeline is not defined — is Person 3's script loaded?");
    }
    addCourseToTimeline(courseData.name, courseData.start, courseData.end);
  } catch (timelineErr) {
    // Timeline failure shouldn't kill the pin we already placed.
    console.error("[GLUE] addCourseToTimeline failed:", timelineErr);
    showUserWarning("Course was pinned on the map, but the timeline could not be updated.");
  }

  // ── Step G: Happy-path confirmation ───────────────────────
  console.info(
    `[GLUE] ✓ CRN ${courseData.crn} (${courseData.name}) rendered — ` +
    `pin @ (${coords.lat}, ${coords.lng}), timeline ${courseData.start}–${courseData.end}`
  );
  showUserSuccess(`${courseData.name} added to map and timeline!`);
}


// ------------------------------------
// 3. UI FEEDBACK HELPERS
//    Swap these out for whatever toast / snackbar / alert
//    system the team decides to use. Right now they write
//    to a simple #status-message div (create one in your HTML).
// ------------------------------------
function showUserError(msg) {
  _writeStatus(msg, "error");
}

function showUserWarning(msg) {
  _writeStatus(msg, "warning");
}

function showUserSuccess(msg) {
  _writeStatus(msg, "success");
}

function _writeStatus(msg, level = "info") {
  const el = document.getElementById("status-message");
  if (el) {
    el.textContent = msg;
    el.className = `status-${level}`; // style these classes in your CSS
  } else {
    // graceful degradation: no status div? just log it
    const logFn = level === "error" ? console.error
                : level === "warning" ? console.warn
                : console.info;
    logFn(`[GLUE][${level.toUpperCase()}]`, msg);
  }
}