const WEEK_DAYS = [
  { key: "M", label: "Mon" },
  { key: "T", label: "Tue" },
  { key: "W", label: "Wed" },
  { key: "R", label: "Thu" },
  { key: "F", label: "Fri" },
];

let loadedClasses = [];
let selectedDay = "M";

function toMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function formatTime(t) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const hour = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  return `${hour}:${String(m).padStart(2, "0")}${ampm}`;
}

function gapLabel(mins) {
  if (mins < 15) return { text:`${mins} min - tight!`, cls:"gap-tight" };
  if (mins < 30) return { text:`${mins} min - short`,  cls:"gap-short" };
  return               { text:`${mins} min - good`,   cls:"gap-good"  };
}

function getMealBreak(fromClass, toClass) {
  const breakStart = toMinutes(fromClass.end);
  const breakEnd = toMinutes(toClass.start);
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
  if (dayKey === "R") return days.includes("R");
  return days.includes(dayKey);
}

function classesForDay(dayKey) {
  return loadedClasses
    .filter(cls => classMeetsOnDay(cls, dayKey))
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
}

function firstDayWithClasses(classes) {
  return WEEK_DAYS.find(day => classes.some(cls => classMeetsOnDay(cls, day.key)))?.key || "M";
}

async function loadClasses() {
  const input = document.getElementById("crn-input").value;
  const crns = input.split("\n").map(c => c.trim()).filter(Boolean);
  const container = document.getElementById("class-list");

  if (!crns.length) { alert("Enter at least one CRN."); return; }

  const results = await Promise.all(crns.map(getClass));
  loadedClasses = results
    .filter(Boolean)
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

  container.innerHTML = "";

  if (!loadedClasses.length) {
    container.innerHTML = `
      <div class="error-card">
        No classes found for: <strong>${crns.join(", ")}</strong><br>
        Try: 11111, 22222, 33333, 44444
      </div>`;
    document.getElementById("timeline-section").style.display = "none";
    await renderMap([]);
    return;
  }

  selectedDay = firstDayWithClasses(loadedClasses);
  await renderScheduleForSelectedDay();
}

async function selectDay(dayKey) {
  selectedDay = dayKey;
  await renderScheduleForSelectedDay();
}

async function renderScheduleForSelectedDay() {
  renderDaySelector();
  renderWeekOverview();
  const dayClasses = classesForDay(selectedDay);
  renderCards(dayClasses);
  renderTimeline(dayClasses);
  await renderMap(dayClasses);
}

function renderDaySelector() {
  const daySelector = document.getElementById("day-selector");
  daySelector.innerHTML = "";

  WEEK_DAYS.forEach(day => {
    const count = classesForDay(day.key).length;
    const button = document.createElement("button");
    button.type = "button";
    button.className = day.key === selectedDay ? "day-tab active" : "day-tab";
    button.disabled = count === 0;
    button.textContent = `${day.label} ${count}`;
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
        item.style.borderColor = cls.color;
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
    const card = document.createElement("div");
    card.className = "class-card";
    card.style.borderLeftColor = cls.color;
    card.innerHTML = `
      <div class="name">${index + 1}. ${cls.name} - ${cls.title}</div>
      <div class="details">CRN ${cls.crn} | ${cls.building} | Room ${cls.room} | ${formatTime(cls.start)}-${formatTime(cls.end)} | ${normalizeDays(cls.days)}</div>
    `;
    card.addEventListener("click", () => {
      document.querySelectorAll(".class-card").forEach(c => c.classList.remove("active"));
      card.classList.add("active");
      focusBuilding(cls);
    });
    container.appendChild(card);

    if (index < classes.length - 1) {
      const next = classes[index + 1];
      const gap = toMinutes(next.start) - toMinutes(cls.end);
      const { text, cls: badgeCls } = gapLabel(gap);
      const badge = document.createElement("div");
      badge.className = `gap-badge ${badgeCls}`;
      badge.textContent = `Next: ${text} until ${next.name}`;
      container.appendChild(badge);

      const meal = getMealBreak(cls, next);
      if (meal) {
        const mealBadge = document.createElement("div");
        mealBadge.className = "meal-badge";
        mealBadge.textContent = `${meal.name}: ${formatMinutes(meal.start)}-${formatMinutes(meal.end)} available`;
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
    const left = ((toMinutes(cls.start) - DAY_START) / TOTAL * 100).toFixed(1);
    const width = ((toMinutes(cls.end) - toMinutes(cls.start)) / TOTAL * 100).toFixed(1);

    const block = document.createElement("div");
    block.className = "timeline-block";
    block.style.left = `${left}%`;
    block.style.width = `${width}%`;
    block.style.background = cls.color;
    block.title = `CRN ${cls.crn}: ${cls.name} ${formatTime(cls.start)}-${formatTime(cls.end)}`;
    block.textContent = `${cls.crn}`;
    block.addEventListener("click", () => focusBuilding(cls));
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

