(() => {
  const STORAGE_KEY = "vattna-lundin-v1";
  const TZ = "Europe/Stockholm";

  const PLANTS = [
    { id: "fredskalla", name: "Fredskalla", floor: "Plan 2", interval: 7 },
    { id: "ginsengfikus", name: "Ginsengfikus", floor: "Vardagsrum", interval: 7 },
    { id: "anthurium", name: "Anthurium", floor: "Vardagsrum", interval: 7 },
    { id: "paraplyaralia", name: "Paraplyaralia", floor: "Lekrum", interval: 7 },
    { id: "bergpalm", name: "Bergpalm", floor: "Gustafs rum", interval: 7 },
    { id: "gummitrad", name: "Gummiträd", floor: "Vardagsrum", interval: 14 },
    { id: "aeonium", name: "Aeonium", floor: "Vardagsrum", interval: 14 },
    { id: "peperomia", name: "Peperomia", floor: "Vardagsrum", interval: 14 },
    { id: "clusia", name: "Clusia", floor: "Lekrum", interval: 14 },
    { id: "orkide", name: "Orkidé", floor: "Vardagsrum", interval: 14, note: "doppvattnas" },
    { id: "svarrmorstunga_rund", name: "Svärmorstunga rund", floor: "Nils rum", interval: 28 },
    { id: "svarrmorstunga_gra", name: "Svärmorstunga grå kruka", floor: "Plan 2", interval: 28 },
    { id: "svarrmorstunga_brun", name: "Svärmorstunga brun kruka", floor: "Plan 2", interval: 28 },
    { id: "euphorbia", name: "Euphorbia", floor: "Vardagsrum", interval: 28 },
    { id: "zamioculcas", name: "Zamioculcas", floor: "Vardagsrum", interval: 28 }
  ];

  const LEVELS = ["Grodd", "Skott", "Planta", "Buske", "Träd", "Djungel"];
  const FILTERS = [
    { id: "due", label: "Dags nu" },
    { id: "all", label: "Alla" },
    { id: "Vardagsrum", label: "Vardagsrum" },
    { id: "Lekrum", label: "Lekrum" },
    { id: "Gustafs rum", label: "Gustafs rum" },
    { id: "Nils rum", label: "Nils rum" },
    { id: "Plan 2", label: "Plan 2" }
  ];

  const defaultState = () => ({
    person: null,
    watered: {},
    log: [],
    streak: 0,
    lastUndo: null,
    settings: { sync: true, shortcutName: "Vattnat" },
    filter: "due"
  });

  let state = load();
  let toastTimer = 0;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return {
        ...defaultState(),
        ...parsed,
        watered: parsed.watered || {},
        log: Array.isArray(parsed.log) ? parsed.log : [],
        settings: { sync: true, shortcutName: "Vattnat", ...(parsed.settings || {}) }
      };
    } catch {
      return defaultState();
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function nowDate(d = new Date()) {
    return new Date(d.toLocaleString("en-US", { timeZone: TZ }));
  }

  function intervalDays(plant, date = nowDate()) {
    const month = date.getMonth() + 1;
    const summer = month >= 4 && month <= 9;
    if (plant.interval === 7) return 7;
    if (plant.interval === 14) return summer ? 7 : 14;
    if (plant.interval === 28) return summer ? 14 : 28;
    return plant.interval;
  }

  function lastWatered(id) {
    return state.watered[id] ? new Date(state.watered[id]) : null;
  }

  function moisture(plant, now = new Date()) {
    const last = lastWatered(plant.id);
    if (!last) return 0;
    const span = intervalDays(plant) * 86400000;
    const left = 1 - (now - last) / span;
    return Math.max(0, Math.min(1, left));
  }

  function statusOf(plant, now = new Date()) {
    const m = moisture(plant, now);
    if (m <= 0) return "due";
    if (m <= 0.22) return "soon";
    return "ok";
  }

  function levelInfo() {
    const n = state.log.length;
    const idx = Math.min(LEVELS.length - 1, Math.floor(n / 10));
    return { level: idx + 1, name: LEVELS[idx], total: n };
  }

  function plantById(id) {
    return PLANTS.find((p) => p.id === id);
  }

  function visiblePlants() {
    const now = new Date();
    return PLANTS.filter((p) => {
      if (state.filter === "due") return statusOf(p, now) === "due";
      if (state.filter === "all") return true;
      return p.floor === state.filter;
    });
  }

  function duePlants() {
    const now = new Date();
    return PLANTS.filter((p) => statusOf(p, now) === "due");
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function formatWhen(iso) {
    if (!iso) return "aldrig";
    const d = new Date(iso);
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: TZ,
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    }).format(d);
  }

  function iconPath(id) {
    return `icons/${id}.webp`;
  }

  function setPerson(name) {
    state.person = name;
    save();
    render();
  }

  function syncText(ids, who) {
    return `vattnat: ${ids.join(", ")} | av: ${who}`;
  }

  function notifyTilda(ids, who) {
    return; // genvägen borttagen 11 nov 2026
    if (!state.settings.sync) return;
    if (!isIOS()) return;
    const name = (state.settings.shortcutName || "Vattnat").trim() || "Vattnat";
    const text = syncText(ids, who);
    const url = `shortcuts://run-shortcut?name=${encodeURIComponent(name)}&input=text&text=${encodeURIComponent(text)}`;
    window.location.href = url;
  }

  function celebrate(ids) {
    const layer = document.getElementById("drops");
    layer.innerHTML = "";
    const origin = document.body.getBoundingClientRect();
    ids.forEach((id, i) => {
      const card = document.querySelector(`[data-plant="${id}"]`);
      const rect = card ? card.getBoundingClientRect() : origin;
      for (let n = 0; n < 5; n++) {
        const el = document.createElement("span");
        el.className = "drop";
        el.textContent = "💧";
        el.style.left = `${rect.left + rect.width * (0.2 + Math.random() * 0.6)}px`;
        el.style.top = `${rect.top + 20 + Math.random() * 30}px`;
        el.style.animationDelay = `${i * 40 + n * 70}ms`;
        layer.appendChild(el);
      }
      if (card) card.classList.add("pop");
    });
    setTimeout(() => { layer.innerHTML = ""; }, 1400);
  }

  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 2600);
  }

  function water(ids) {
    if (!ids.length) return;
    if (!state.person) {
      showOnboarding();
      return;
    }
    const who = state.person;
    const at = new Date().toISOString();
    const prev = ids.map((id) => ({ id, prev: state.watered[id] || null }));
    const dueBefore = new Set(duePlants().map((p) => p.id));
    ids.forEach((id) => {
      state.watered[id] = at;
      const plant = plantById(id);
      state.log.unshift({
        id: `${at}-${id}`,
        plantId: id,
        name: plant ? plant.name : id,
        at,
        by: who
      });
    });
    const dueAfter = duePlants();
    const completedRound = ids.some((id) => dueBefore.has(id)) && dueAfter.length === 0;
    const prevStreak = state.streak;
    if (completedRound) state.streak += 1;
    state.lastUndo = { items: prev, logIds: ids.map((id) => `${at}-${id}`), streak: prevStreak };
    save();
    renderFilters();
    renderHud();
    ids.forEach((id) => {
      const card = document.querySelector(`[data-plant="${id}"]`);
      if (!card) return;
      card.classList.remove("due", "soon");
      card.classList.add("ok", "pop");
      const bar = card.querySelector(".meter > span");
      if (bar) bar.style.width = "100%";
      const pill = card.querySelector(".pill");
      if (pill) { pill.className = "pill ok"; pill.textContent = "OK"; }
      const pct = card.querySelector(".status-row .card-meta");
      if (pct) pct.textContent = "100%";
    });
    celebrate(ids);
    const names = ids.map((id) => (plantById(id) || { name: id }).name);
    toast(ids.length === 1 ? `${names[0]} är vattnad` : `${ids.length} växter vattnade`);
    setTimeout(() => notifyTilda(ids, who), 550);
    setTimeout(render, 1100);
  }

  function undo() {
    if (!state.lastUndo) return;
    const { items, logIds } = state.lastUndo;
    items.forEach(({ id, prev }) => {
      if (prev) state.watered[id] = prev;
      else delete state.watered[id];
    });
    state.log = state.log.filter((entry) => !logIds.includes(entry.id));
    if (typeof state.lastUndo.streak === "number") state.streak = state.lastUndo.streak;
    state.lastUndo = null;
    save();
    render();
    toast("Senaste vattningen ångrad");
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date()).replace(/\s/g, "_");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `vattna-lundin-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== "object") throw new Error("ogiltig");
        state = {
          ...defaultState(),
          ...parsed,
          watered: parsed.watered || {},
          log: Array.isArray(parsed.log) ? parsed.log : [],
          settings: { sync: true, shortcutName: "Vattnat", ...(parsed.settings || {}) }
        };
        save();
        render();
        toast("Data importerad");
      } catch {
        toast("Kunde inte läsa filen");
      }
    };
    reader.readAsText(file);
  }

  function showOnboarding() {
    document.getElementById("onboarding").classList.remove("hidden");
    document.getElementById("main").classList.add("hidden");
  }

  function closeSheets() {
    document.getElementById("sheet-backdrop").classList.add("hidden");
    document.getElementById("sheet-log").classList.add("hidden");
    document.getElementById("sheet-settings").classList.add("hidden");
  }

  function openSheet(id) {
    document.getElementById("toast").classList.add("hidden");
    document.getElementById("sheet-backdrop").classList.remove("hidden");
    document.getElementById(id).classList.remove("hidden");
    if (id === "sheet-log") renderLog();
    if (id === "sheet-settings") {
      document.getElementById("set-person").value = state.person || "Erik";
    }
  }

  function renderFilters() {
    const dueCount = duePlants().length;
    const wrap = document.getElementById("filters");
    wrap.innerHTML = FILTERS.map((f) => {
      const selected = state.filter === f.id;
      const extra = f.id === "due" ? `<span class="count">${dueCount}</span>` : "";
      return `<button type="button" class="chip" role="tab" aria-selected="${selected}" data-filter="${f.id}">${f.label}${extra}</button>`;
    }).join("");
  }

  function renderGrid() {
    const plants = visiblePlants();
    const grid = document.getElementById("grid");
    const empty = document.getElementById("empty");
    empty.classList.toggle("hidden", plants.length > 0);
    const now = new Date();
    grid.innerHTML = plants.map((p) => {
      const st = statusOf(p, now);
      const m = moisture(p, now);
      const label = st === "due" ? "Dags nu" : st === "soon" ? "Snart" : "OK";
      const note = p.note ? ` · ${p.note}` : "";
      const pct = Math.round(m * 100);
      return `
        <article class="card ${st}" data-plant="${p.id}">
          <div class="card-art"><img src="${iconPath(p.id)}" alt="" width="288" height="288"></div>
          <div class="card-body">
            <h2 class="card-name">${p.name}</h2>
            <p class="card-meta">${p.floor}${note}</p>
            <div class="meter" aria-hidden="true"><span style="width:${pct}%"></span></div>
            <div class="status-row">
              <span class="pill ${st}">${label}</span>
              <span class="card-meta">${pct}%</span>
            </div>
            <button type="button" class="water-btn" data-water="${p.id}" aria-label="Vattna ${p.name}">💧</button>
          </div>
        </article>`;
    }).join("");
  }

  function renderHud() {
    const info = levelInfo();
    document.getElementById("hud-level").textContent = `${info.level} · ${info.name}`;
    document.getElementById("hud-streak").textContent = state.streak === 1 ? "1 runda" : `${state.streak} rundor`;
    document.getElementById("hud-who").textContent = (state.person || "?").charAt(0);
    const due = duePlants();
    const allBtn = document.getElementById("btn-water-all");
    allBtn.classList.toggle("hidden", due.length === 0);
    allBtn.querySelector("span:last-child").textContent =
      due.length > 1 ? `Vattna alla som är dags (${due.length})` : "Vattna alla som är dags";
  }

  function renderLog() {
    const list = document.getElementById("log-list");
    document.getElementById("btn-undo").disabled = !state.lastUndo;
    if (!state.log.length) {
      list.innerHTML = `<li><span></span><div><strong>Inget vattnat ännu</strong><span>Första trycket hamnar här.</span></div></li>`;
      return;
    }
    list.innerHTML = state.log.map((entry) => `
      <li>
        <img src="${iconPath(entry.plantId)}" alt="">
        <div>
          <strong>${entry.name}</strong>
          <span>${entry.by} · ${formatWhen(entry.at)}</span>
        </div>
      </li>`).join("");
  }

  function render() {
    if (!state.person) {
      showOnboarding();
      return;
    }
    document.getElementById("onboarding").classList.add("hidden");
    document.getElementById("main").classList.remove("hidden");
    renderFilters();
    renderHud();
    renderGrid();
    if (!document.getElementById("sheet-log").classList.contains("hidden")) renderLog();
  }

  function bind() {
    document.querySelectorAll(".who-card").forEach((btn) => {
      btn.addEventListener("click", () => setPerson(btn.dataset.person));
    });
    document.getElementById("filters").addEventListener("click", (e) => {
      const chip = e.target.closest("[data-filter]");
      if (!chip) return;
      state.filter = chip.dataset.filter;
      save();
      render();
    });
    document.getElementById("grid").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-water]");
      if (!btn) return;
      water([btn.dataset.water]);
    });
    document.getElementById("btn-water-all").addEventListener("click", () => {
      water(duePlants().map((p) => p.id));
    });
    document.getElementById("btn-log").addEventListener("click", () => openSheet("sheet-log"));
    document.getElementById("btn-settings").addEventListener("click", () => openSheet("sheet-settings"));
    document.getElementById("sheet-backdrop").addEventListener("click", closeSheets);
    document.getElementById("btn-undo").addEventListener("click", undo);
    document.getElementById("hud-who").addEventListener("click", () => openSheet("sheet-settings"));
    document.getElementById("set-person").addEventListener("change", (e) => {
      state.person = e.target.value;
      save();
      render();
    });
    document.getElementById("btn-export").addEventListener("click", exportJson);
    document.getElementById("btn-import").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) importJson(file);
      e.target.value = "";
    });
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  bind();
  render();
})();
