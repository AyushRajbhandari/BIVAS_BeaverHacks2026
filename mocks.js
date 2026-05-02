// =============================================================
//  MOCKS — Simulates Person 2 (map) and Person 3 (timeline)
//  AND mocks the Flask API so you don't need the server running.
//
//  HOW TO USE:
//    - To test WITHOUT the Flask server: keep MOCK_API = true
//    - To test WITH the real Flask server: set MOCK_API = false
//    - To simulate a missing building code: use CRN "99999"
//    - To simulate an API error: use CRN "00000"
// =============================================================

const MOCK_API = true; // ← flip this to false to hit real Flask

// ------------------------------------
//  MOCK FLASK API
//  Intercepts fetch() calls to localhost:5000 when MOCK_API = true
// ------------------------------------
const MOCK_COURSES = {
  "12345": { crn: "12345", name: "CS 161",    building: "KELL",  start: "09:00", end: "09:50", days: "MWF" },
  "23456": { crn: "23456", name: "MATH 251",  building: "LINC",  start: "10:00", end: "10:50", days: "MWF" },
  "34567": { crn: "34567", name: "PHYS 201",  building: "WLKN",  start: "14:00", end: "14:50", days: "TR"  },
  "45678": { crn: "45678", name: "ENGR 112",  building: "GRAF",  start: "11:00", end: "11:50", days: "MWF" },
  "56789": { crn: "56789", name: "CH 121",    building: "GILK",  start: "08:00", end: "08:50", days: "TR"  },
  "99999": { crn: "99999", name: "UNKN 000",  building: "XYZZY", start: "13:00", end: "13:50", days: "F"   }, // ← unknown building
};

if (MOCK_API) {
  const _realFetch = window.fetch.bind(window);

  window.fetch = async function(url, options) {
    // Only intercept our Flask API calls
    if (typeof url === "string" && url.includes("localhost:5000/class/")) {
      const crn = url.split("/class/")[1];

      console.log(`[MOCK API] Intercepted fetch for CRN: ${crn}`);
      await new Promise(r => setTimeout(r, 400)); // simulate network delay

      if (crn === "00000") {
        // Simulate a hard network failure
        throw new TypeError("Failed to fetch (mock network error)");
      }

      const course = MOCK_COURSES[crn];
      if (!course) {
        // Simulate a 404
        return new Response(JSON.stringify({ error: "CRN not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify(course), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Pass all other fetches through normally
    return _realFetch(url, options);
  };

  console.info("[MOCK API] Active — fetch() to localhost:5000 is intercepted.");
  console.info("[MOCK API] Valid test CRNs:", Object.keys(MOCK_COURSES).join(", "));
  console.info("[MOCK API] CRN 00000 = network error | CRN 99999 = unknown building | Any other = 404");
}


// ------------------------------------
//  MOCK MAP  (Person 2)
//  Renders pins as cards in the #map-output div
// ------------------------------------
function addPinToMap(lat, lng, popupText) {
  console.log(`[MOCK MAP] addPinToMap called → lat: ${lat}, lng: ${lng}`);
  console.log(`[MOCK MAP] Popup text:`, popupText);

  const container = document.getElementById("map-output");
  if (!container) return;

  const pin = document.createElement("div");
  pin.className = "mock-pin";
  pin.innerHTML = `
    <span class="pin-icon">📍</span>
    <div class="pin-body">
      <div class="pin-coords">${lat.toFixed(4)}, ${lng.toFixed(4)}</div>
      <div class="pin-popup">${popupText}</div>
    </div>
  `;
  container.appendChild(pin);
}


// ------------------------------------
//  MOCK TIMELINE  (Person 3)
//  Renders course blocks in the #timeline-output div
// ------------------------------------
function addCourseToTimeline(courseName, startTime, endTime) {
  console.log(`[MOCK TIMELINE] addCourseToTimeline called → ${courseName} ${startTime}–${endTime}`);

  const container = document.getElementById("timeline-output");
  if (!container) return;

  // Convert "HH:MM" to minutes-from-midnight for positioning
  const toMins = t => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };

  const DAY_START = 7 * 60;  // 07:00
  const DAY_END   = 20 * 60; // 20:00
  const DAY_SPAN  = DAY_END - DAY_START;

  const startMins = toMins(startTime);
  const endMins   = toMins(endTime);
  const leftPct   = ((startMins - DAY_START) / DAY_SPAN) * 100;
  const widthPct  = ((endMins - startMins)   / DAY_SPAN) * 100;

  const block = document.createElement("div");
  block.className = "timeline-block";
  block.style.left  = `${Math.max(0, leftPct).toFixed(2)}%`;
  block.style.width = `${Math.max(1, widthPct).toFixed(2)}%`;
  block.innerHTML = `<span>${courseName}</span><small>${startTime}–${endTime}</small>`;
  container.appendChild(block);
}
