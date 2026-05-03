const WEEK_DAYS = [
  { key: "M", label: "Mon" },
  { key: "T", label: "Tue" },
  { key: "W", label: "Wed" },
  { key: "R", label: "Thu" },
  { key: "F", label: "Fri" },
];

const CLASS_COLOR_PALETTE = {
  1: "#2563EB",
  2: "#059669",
  3: "#D97706",
  4: "#7C3AED",
  5: "#DC2626",
  6: "#0891B2",
  7: "#4F46E5",
  8: "#65A30D",
  9: "#BE185D",
  10: "#0F766E",
  11: "#9333EA",
  12: "#475569",
};

let loadedClasses = [];
let selectedDay = "M";
let ratingLoadId = 0;

function toMinutes(t) {
  if (!t || typeof t !== "string" || !t.includes(":")) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function formatTime(t) {
  if (!t) return "TBA";
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return "TBA";
  const ampm = h >= 12 ? "pm" : "am";
  const hour = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  return `${hour}:${String(m).padStart(2, "0")}${ampm}`;
}

function hasScheduledTime(cls) {
  return toMinutes(cls.start) !== null && toMinutes(cls.end) !== null;
}

function compareClassStart(a, b) {
  const aStart = toMinutes(a.start);
  const bStart = toMinutes(b.start);

  if (aStart === null && bStart === null) return (a.name || "").localeCompare(b.name || "");
  if (aStart === null) return 1;
  if (bStart === null) return -1;

  return aStart - bStart;
}

function gapLabel(mins) {
  if (mins < 15) return { text: "Tight gap", cls: "gap-tight" };
  if (mins < 30) return { text: "Short gap", cls: "gap-short" };
  return { text: "Comfortable gap", cls: "gap-good" };
}

function getMealBreak(fromClass, toClass) {
  const breakStart = toMinutes(fromClass.end);
  const breakEnd = toMinutes(toClass.start);
  if (breakStart === null || breakEnd === null) return null;
  if (breakEnd - breakStart < 30) return null;

  const meals = [
    { name: "Lunch", start: toMinutes("11:30"), end: toMinutes("14:00") },
    { name: "Dinner", start: toMinutes("17:00"), end: toMinutes("19:00") },
  ];

  for (const meal of meals) {
    const start = Math.max(breakStart, meal.start);
    const end = Math.min(breakEnd, meal.end);
    if (end - start >= 30) {
      return { name: meal.name, start, end };
    }
  }

  return null;
}

function formatMinutes(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return formatTime(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
}

function normalizeDays(days) {
  return (days || "").replaceAll("Th", "R");
}

function classMeetsOnDay(cls, dayKey) {
  const days = normalizeDays(cls.days);
  if (days === "TBA") return true;
  if (dayKey === "R") return days.includes("R");
  return days.includes(dayKey);
}

function classesForDay(dayKey) {
  return loadedClasses
    .filter(cls => classMeetsOnDay(cls, dayKey))
    .sort(compareClassStart);
}

function firstDayWithClasses(classes) {
  return WEEK_DAYS.find(day => classes.some(cls => classMeetsOnDay(cls, day.key)))?.key || "M";
}

function colorForChronologicalIndex(index) {
  const colorKeys = Object.keys(CLASS_COLOR_PALETTE);
  const key = colorKeys[index % colorKeys.length];
  return CLASS_COLOR_PALETTE[key];
}

function assignChronologicalColors(classes) {
  return classes.map((cls, index) => ({
    ...cls,
    displayColor: colorForChronologicalIndex(index),
  }));
}

function professorNameForClass(cls) {
  return cls.professor || cls.instructor || cls.teacher || cls.professor_name || "";
}

function ratingForClass(cls) {
  return cls.rmpRating || cls.rmp_rating || cls.professorRating || cls.professor_rating || cls.rating || "";
}

function formatProfessorRating(rating) {
  if (!rating) return "Not available";

  const numericRating = Number(rating);
  if (!Number.isNaN(numericRating)) return `${numericRating.toFixed(1)}/5`;

  return `${rating}/5`;
}

function withProfessorRating(cls, rating) {
  return {
    ...cls,
    rmpRating: rating || ratingForClass(cls) || null,
  };
}

async function getProfessorRating(professor) {
  if (!professor) return null;

  try {
    const response = await fetch(`http://localhost:5000/api/rmp?professor=${encodeURIComponent(professor)}`);
    if (!response.ok) return null;

    const data = await response.json();
    return data.rating || null;
  } catch (err) {
    console.error("Professor rating unavailable:", err);
    return null;
  }
}

async function addProfessorRatings(classes) {
  return Promise.all(classes.map(async cls => {
    if (ratingForClass(cls)) return withProfessorRating(cls);
    if (cls.rmpRatingChecked) return withProfessorRating(cls, null);

    const professor = professorNameForClass(cls);
    if (!professor) return withProfessorRating(cls, null);

    const rating = await getProfessorRating(professor);
    return withProfessorRating(cls, rating);
  }));
}

function overlappingClassConflicts(classes) {
  const conflicts = [];
  const sortedClasses = [...classes].sort(compareClassStart);

  for (let i = 0; i < sortedClasses.length; i++) {
    const current = sortedClasses[i];
    const currentStart = toMinutes(current.start);
    const currentEnd = toMinutes(current.end);
    if (currentStart === null || currentEnd === null) continue;

    for (let j = i + 1; j < sortedClasses.length; j++) {
      const next = sortedClasses[j];
      const nextStart = toMinutes(next.start);
      const nextEnd = toMinutes(next.end);
      if (nextStart === null || nextEnd === null) continue;

      if (nextStart >= currentEnd) break;

      const overlapStart = Math.max(currentStart, nextStart);
      const overlapEnd = Math.min(currentEnd, nextEnd);

      if (overlapStart < overlapEnd) {
        conflicts.push({
          classes: [current, next],
          overlapStart,
          overlapEnd,
        });
      }
    }
  }

  return conflicts;
}

async function loadClasses() {
  const currentRatingLoadId = ++ratingLoadId;
  const input = document.getElementById("crn-input").value;
  const crns = input.split("\n").map(c => c.trim()).filter(Boolean);
  const container = document.getElementById("class-list");
  const mascot = document.getElementById("sidebar-mascot");

  if (!crns.length) { alert("Enter at least one CRN."); return; }
  if (mascot) mascot.classList.add("hidden");

  const results = await Promise.all(crns.map(getClass));
  loadedClasses = results
    .filter(Boolean)
    .sort(compareClassStart);
  loadedClasses = assignChronologicalColors(loadedClasses);

  container.innerHTML = "";

  if (!loadedClasses.length) {
    renderConflictWarning([]);
    document.getElementById("week-section").style.display = "none";
    container.innerHTML = `
      <div class="error-card">
        No classes found for: <strong>${crns.join(", ")}</strong><br>
        Try: 11111, 22222, 33333, 44444
      </div>`;
    document.getElementById("timeline-section").style.display = "none";
    await renderMap([]);
    return;
  }

  document.getElementById("week-section").style.display = "block";
  selectedDay = firstDayWithClasses(loadedClasses);
  await renderScheduleForSelectedDay();
  loadProfessorRatingsForCurrentClasses(currentRatingLoadId);
}

async function loadProfessorRatingsForCurrentClasses(loadId) {
  const ratedClasses = await addProfessorRatings(loadedClasses);
  if (loadId !== ratingLoadId) return;

  loadedClasses = ratedClasses.map((cls, index) => ({
    ...cls,
    displayColor: loadedClasses[index]?.displayColor || cls.displayColor,
  }));

  renderCards(classesForDay(selectedDay));
}

async function selectDay(dayKey) {
  selectedDay = dayKey;
  await renderScheduleForSelectedDay();
}

async function renderScheduleForSelectedDay() {
  renderDaySelector();
  renderWeekOverview();
  const dayClasses = classesForDay(selectedDay);
  renderConflictWarning(dayClasses);
  renderCards(dayClasses);
  renderTimeline(dayClasses);
  await renderMap(dayClasses);
}

function renderConflictWarning(classes) {
  const warningContainer = document.getElementById("schedule-warning");
  if (!warningContainer) return;

  const conflicts = overlappingClassConflicts(classes);
  warningContainer.innerHTML = "";

  conflicts.forEach(conflict => {
    const warning = document.createElement("div");
    warning.className = "conflict-warning";
    warning.innerHTML = `
      <strong>Schedule conflict</strong>
      <span>${conflict.classes.map(cls => cls.name).join(" and ")} overlap from ${formatMinutes(conflict.overlapStart)} to ${formatMinutes(conflict.overlapEnd)}.</span>
    `;
    warningContainer.appendChild(warning);
  });
}

function renderDaySelector() {
  const daySelector = document.getElementById("day-selector");
  const weekSection = document.getElementById("week-section");
  daySelector.innerHTML = "";

  if (weekSection && !weekSection.querySelector(".week-heading")) {
    weekSection.insertAdjacentHTML("afterbegin", `
      <div class="week-heading">
        <span>Week</span>
        <strong id="selected-day-heading"></strong>
      </div>
    `);
  }

  const selectedHeading = document.getElementById("selected-day-heading");
  if (selectedHeading) {
    selectedHeading.textContent = WEEK_DAYS.find(day => day.key === selectedDay)?.label || "";
  }

  WEEK_DAYS.forEach(day => {
    const count = classesForDay(day.key).length;
    const button = document.createElement("button");
    button.type = "button";
    button.className = day.key === selectedDay ? "day-tab active" : "day-tab";
    button.disabled = count === 0;
    button.innerHTML = `${day.label} <span>${count}</span>`;
    button.addEventListener("click", () => selectDay(day.key));
    daySelector.appendChild(button);
  });
}

function renderWeekOverview() {
  const weekOverview = document.getElementById("week-overview");
  weekOverview.innerHTML = "";

  WEEK_DAYS.forEach(day => {
    const rowClasses = classesForDay(day.key);
    const row = document.createElement("div");
    row.className = day.key === selectedDay ? "week-row active" : "week-row";
    row.addEventListener("click", () => {
      if (rowClasses.length) selectDay(day.key);
    });

    const label = document.createElement("div");
    label.className = "week-day-label";
    label.textContent = day.label;
    row.appendChild(label);

    const items = document.createElement("div");
    items.className = "week-day-classes";
    if (!rowClasses.length) {
      items.textContent = "No classes";
    } else {
      rowClasses.forEach(cls => {
        const item = document.createElement("span");
        item.className = "week-class-pill";
        item.style.borderColor = cls.displayColor;
        item.textContent = `${cls.crn} ${cls.name} ${formatTime(cls.start)}`;
        items.appendChild(item);
      });
    }

    row.appendChild(items);
    weekOverview.appendChild(row);
  });
}

function renderCards(classes) {
  const container = document.getElementById("class-list");
  container.innerHTML = "";

  if (!classes.length) {
    container.innerHTML = `<div class="empty-card">No classes on this day.</div>`;
    return;
  }

  classes.forEach((cls, index) => {
    const professor = professorNameForClass(cls);
    const rating = ratingForClass(cls);
    const ratingText = formatProfessorRating(rating);
    const professorText = professor ? `${professor} - ${ratingText}` : ratingText;
    const card = document.createElement("div");
    card.className = "class-card";
    card.style.setProperty("--accent", cls.displayColor || "#378ADD");
    card.innerHTML = `
      <div class="class-time">${formatTime(cls.start)}-${formatTime(cls.end)}</div>
      <div class="name">${index + 1}. ${cls.name}</div>
      <div class="details">${cls.title}</div>
      <div class="professor-rating">RateMyProfessor: ${professorText}</div>
      <div class="meta-row">
        <span>CRN ${cls.crn}</span>
        <span>${cls.building}</span>
        <span>Room ${cls.room}</span>
        <span>${normalizeDays(cls.days)}</span>
      </div>
    `;
    card.addEventListener("click", () => {
      document.querySelectorAll(".class-card").forEach(c => c.classList.remove("active"));
      card.classList.add("active");
      focusBuilding(cls);
    });
    container.appendChild(card);

    if (index < classes.length - 1) {
      const next = classes[index + 1];
      if (!hasScheduledTime(cls) || !hasScheduledTime(next)) return;

      const gap = toMinutes(next.start) - toMinutes(cls.end);
      if (gap < 0) return;

      const { text, cls: badgeCls } = gapLabel(gap);
      const badge = document.createElement("div");
      badge.className = `gap-badge ${badgeCls}`;
      badge.innerHTML = `
        <span>Next</span>
        <strong>${gap} min</strong>
        <em>${text} until ${next.name}</em>
      `;
      container.appendChild(badge);

      const meal = getMealBreak(cls, next);
      if (meal) {
        const mealBadge = document.createElement("div");
        mealBadge.className = "meal-badge";
        mealBadge.innerHTML = `
          <span>${meal.name}</span>
          <strong>${formatMinutes(meal.start)}-${formatMinutes(meal.end)}</strong>
          <em>Available</em>
        `;
        container.appendChild(mealBadge);
      }
    }
  });
}

function renderTimeline(classes) {
  const DAY_START = 8 * 60;
  const DAY_END = 18 * 60;
  const TOTAL = DAY_END - DAY_START;

  const bar = document.getElementById("timeline-bar");
  const labels = document.getElementById("timeline-labels");
  const section = document.getElementById("timeline-section");
  const activeLabel = document.getElementById("active-day-label");

  bar.innerHTML = "";
  labels.innerHTML = "";
  section.style.display = "block";
  activeLabel.textContent = WEEK_DAYS.find(day => day.key === selectedDay)?.label || "";

  classes.forEach(cls => {
    const startMin = toMinutes(cls.start);
    const endMin = toMinutes(cls.end);
    if (startMin === null || endMin === null) return;
    
    const left = ((startMin - DAY_START) / TOTAL * 100).toFixed(1);
    const width = ((endMin - startMin) / TOTAL * 100).toFixed(1);
    const block = document.createElement("div");
    
    block.className = "timeline-block";
    block.style.left = `${left}%`;
    block.style.width = `${width}%`;
    block.style.background = cls.displayColor || "#378ADD";
    block.title = `${cls.name}: ${formatTime(cls.start)}-${formatTime(cls.end)}`;
    bar.appendChild(block);
  });

  for (let i = 0; i < classes.length - 1; i++) {
    const meal = getMealBreak(classes[i], classes[i + 1]);
    if (!meal) continue;

    const left = ((meal.start - DAY_START) / TOTAL * 100).toFixed(1);
    const width = ((meal.end - meal.start) / TOTAL * 100).toFixed(1);
    const block = document.createElement("div");
    block.className = "meal-block";
    block.style.left = `${left}%`;
    block.style.width = `${width}%`;
    block.title = `${meal.name}: ${formatMinutes(meal.start)}-${formatMinutes(meal.end)}`;
    block.textContent = meal.name;
    bar.appendChild(block);
  }

  for (let h = 8; h <= 18; h += 2) {
    const label = document.createElement("span");
    label.textContent = h > 12 ? `${h - 12}p` : (h === 12 ? "12p" : `${h}a`);
    labels.appendChild(label);
  }
}
