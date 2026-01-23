const STORAGE_KEY = "time-manager-state";

const todayList = document.querySelector('[data-items="today"]');
const tomorrowList = document.querySelector('[data-items="tomorrow"]');
const todayInput = document.querySelector('[data-input="today"]');
const tomorrowInput = document.querySelector('[data-input="tomorrow"]');
const todayTime = document.querySelector('[data-time="today"]');
const tomorrowTime = document.querySelector('[data-time="tomorrow"]');
const todayAdd = document.querySelector('[data-add="today"]');
const tomorrowAdd = document.querySelector('[data-add="tomorrow"]');
const todayBoard = document.querySelector('[data-view="today"]');
const tomorrowBoard = document.querySelector('[data-view="tomorrow"]');
const viewPrev = document.querySelector("[data-view-prev]");
const viewNext = document.querySelector("[data-view-next]");
const viewLabel = document.querySelector("[data-view-label]");
const itemTemplate = document.querySelector("#item-template");

const state = loadState();
const viewState = {
  current: "today",
};
const dragState = {
  list: null,
};

const HARD_CODED_SCHEDULE = {
  0: [],
  1: [
    { time: "10:00", text: "应用数理统计 南教419" },
    { time: "19:00", text: "文学与电影 北教213" },
  ],
  2: [
    { time: "10:00", text: "体育" },
    { time: "14:00", text: "Python 北教217" },
  ],
  3: [
    { time: "08:15", text: "Python 敏学215" },
    { time: "14:00", text: "中国共产党党史 北教213" },
    { time: "16:30", text: "财务会计 北教311" },
    { time: "19:00", text: "R语言与金融应用 敏学101" },
  ],
  4: [
    { time: "10:00", text: "毛泽东思想概论 北教216" },
    { time: "14:00", text: "形势与政策 南教215" },
  ],
  5: [{ time: "14:00", text: "投资学 北教308" }],
  6: [],
};

function getDateKey(date = new Date()) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

function getLocalDayIndex(dateKey) {
  const parts = dateKey.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return new Date().getDay();
  }
  const local = new Date(parts[0], parts[1] - 1, parts[2]);
  return local.getDay();
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const today = getDateKey();

  if (!raw) {
    return { date: today, today: [], tomorrow: [], scheduleDate: "" };
  }

  try {
    const parsed = JSON.parse(raw);
    const safe = {
      date: parsed.date || today,
      today: Array.isArray(parsed.today) ? parsed.today : [],
      tomorrow: Array.isArray(parsed.tomorrow) ? parsed.tomorrow : [],
      scheduleDate: parsed.scheduleDate || "",
    };

    if (safe.date !== today) {
      const carryToday = safe.today.filter((item) => !item.done);
      const carryTomorrow = safe.tomorrow.map((item) => ({
        ...item,
        done: false,
      }));
      return {
        date: today,
        today: [...carryTomorrow, ...carryToday].map((item) => ({
          ...item,
          done: false,
        })),
        tomorrow: [],
        scheduleDate: "",
      };
    }

    return safe;
  } catch {
    return { date: today, today: [], tomorrow: [], scheduleDate: "" };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function importScheduleIfNeeded() {
  const dayIndex = getLocalDayIndex(state.date);
  const tasks = HARD_CODED_SCHEDULE[dayIndex] || [];
  const hasScheduleItems = state.today.some(
    (item) => item.source === "schedule"
  );

  if (state.scheduleDate === state.date && (hasScheduleItems || !tasks.length)) {
    return;
  }

  const existing = new Set(
    state.today.map(
      (item) => `${item.text}::${item.time || ""}::${item.source || ""}`
    )
  );

  tasks.forEach((task) => {
    if (!task || !task.text) return;
    const trimmed = task.text.trim();
    if (!trimmed) return;
    const timeValue = task.time ? task.time.trim() : "";
    const key = `${trimmed}::${timeValue}::schedule`;
    if (existing.has(key)) return;
    state.today.push({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      text: trimmed,
      time: timeValue,
      done: false,
      source: "schedule",
    });
    existing.add(key);
  });

  state.scheduleDate = state.date;
  saveState();
}

function createItem(listName, item) {
  const node = itemTemplate.content.firstElementChild.cloneNode(true);
  const checkbox = node.querySelector("input");
  const timeEl = node.querySelector(".item__time");
  const textEl = node.querySelector(".item__text");
  const moveBtn = node.querySelector("[data-move]");
  const deleteBtn = node.querySelector("[data-delete]");

  textEl.textContent = item.text;
  checkbox.checked = item.done;
  node.dataset.id = item.id;
  node.classList.toggle("done", item.done);

  if (item.time) {
    timeEl.textContent = item.time;
    timeEl.classList.remove("is-hidden");
  } else {
    timeEl.textContent = "";
    timeEl.classList.add("is-hidden");
  }

  moveBtn.textContent = listName === "today" ? "转到明日" : "转到今日";
  moveBtn.addEventListener("click", () => moveItem(listName, item.id));
  deleteBtn.addEventListener("click", () => deleteItem(listName, item.id));

  checkbox.addEventListener("change", () => {
    item.done = checkbox.checked;
    node.classList.toggle("done", item.done);
    saveState();
  });

  node.addEventListener("dragstart", (event) => {
    dragState.list = listName;
    node.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
  });

  node.addEventListener("dragend", () => {
    node.classList.remove("is-dragging");
    syncListOrder(listName, listName === "today" ? todayList : tomorrowList);
    dragState.list = null;
  });

  return node;
}

function renderList(listName, listEl) {
  listEl.innerHTML = "";
  const items = state[listName];
  items.forEach((item) => {
    listEl.append(createItem(listName, item));
  });
}

function render() {
  renderList("today", todayList);
  renderList("tomorrow", tomorrowList);
}

function addItem(listName, text, time) {
  const trimmed = text.trim();
  if (!trimmed) return;
  state[listName].unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text: trimmed,
    time: time ? time.trim() : "",
    done: false,
    source: "manual",
  });
  saveState();
  render();
}

function moveItem(fromList, id) {
  const from = state[fromList];
  const index = from.findIndex((item) => item.id === id);
  if (index === -1) return;
  const [moved] = from.splice(index, 1);
  const toList = fromList === "today" ? "tomorrow" : "today";
  moved.done = false;
  state[toList].unshift(moved);
  saveState();
  render();
}

function deleteItem(listName, id) {
  const list = state[listName];
  const index = list.findIndex((item) => item.id === id);
  if (index === -1) return;
  list.splice(index, 1);
  saveState();
  render();
}

function handleAdd(listName) {
  const input = listName === "today" ? todayInput : tomorrowInput;
  const timeInput = listName === "today" ? todayTime : tomorrowTime;
  addItem(listName, input.value, timeInput.value);
  input.value = "";
  timeInput.value = "";
  input.focus();
}

todayAdd.addEventListener("click", () => handleAdd("today"));
tomorrowAdd.addEventListener("click", () => handleAdd("tomorrow"));

todayInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") handleAdd("today");
});

tomorrowInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") handleAdd("tomorrow");
});

function setView(view) {
  const nextView = view === "tomorrow" ? "tomorrow" : "today";
  viewState.current = nextView;
  todayBoard.classList.toggle("is-hidden", nextView !== "today");
  tomorrowBoard.classList.toggle("is-hidden", nextView !== "tomorrow");
  viewLabel.textContent = nextView === "today" ? "今日事项" : "明日事项";
  viewPrev.disabled = nextView === "today";
  viewNext.disabled = nextView === "tomorrow";
}

function syncListOrder(listName, listEl) {
  if (!listEl) return;
  const ids = Array.from(listEl.querySelectorAll(".item")).map(
    (item) => item.dataset.id
  );
  const ordered = ids
    .map((id) => state[listName].find((item) => item.id === id))
    .filter(Boolean);
  if (ordered.length) {
    state[listName] = ordered;
    saveState();
  }
}

function getDragAfterElement(container, y) {
  const items = [...container.querySelectorAll(".item:not(.is-dragging)")];
  return items.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

function setupDrag(listName, listEl) {
  listEl.addEventListener("dragover", (event) => {
    if (dragState.list !== listName) return;
    event.preventDefault();
    const dragging = listEl.querySelector(".is-dragging");
    if (!dragging) return;
    const afterElement = getDragAfterElement(listEl, event.clientY);
    if (afterElement == null) {
      listEl.append(dragging);
    } else {
      listEl.insertBefore(dragging, afterElement);
    }
  });

  listEl.addEventListener("drop", (event) => {
    if (dragState.list !== listName) return;
    event.preventDefault();
    syncListOrder(listName, listEl);
  });
}

function ensureDate() {
  const today = getDateKey();
  if (state.date === today) return;

  const carryToday = state.today.filter((item) => !item.done);
  const carryTomorrow = state.tomorrow.map((item) => ({
    ...item,
    done: false,
  }));

  state.date = today;
  state.today = [...carryTomorrow, ...carryToday].map((item) => ({
    ...item,
    done: false,
  }));
  state.tomorrow = [];
  state.scheduleDate = "";
  saveState();
  importScheduleIfNeeded();
  render();
  setView("today");
}

setupDrag("today", todayList);
setupDrag("tomorrow", tomorrowList);
importScheduleIfNeeded();

viewPrev.addEventListener("click", () => setView("today"));
viewNext.addEventListener("click", () => setView("tomorrow"));

render();
setView("today");
setInterval(ensureDate, 60000);
