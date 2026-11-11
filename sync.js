/* Vattna – delad molnlogg (Firestore REST, ingen SDK).
   Inga hemligheter här: åtkomsten styrs av Firestore-reglerna (firestore.rules). */
(function (root) {
  const CONFIG = {
    projectId: "vattna-lundin-11c018",
    household: "hh_HnMZVx3YSJ1d_PS8xzLhAqqX",
    host: "https://firestore.googleapis.com"
  };

  const OVERLAP_MS = 2 * 60 * 1000;

  function cfg(over) { return Object.assign({}, CONFIG, over || {}); }
  function configured(c) { return !!c.projectId && !/^PLATSHALLARE/.test(c.projectId); }
  function dbPath(c) { return `projects/${c.projectId}/databases/(default)/documents`; }
  function base(c) { return `${c.host}/v1/${dbPath(c)}`; }
  function householdDoc(c) { return `${dbPath(c)}/households/${c.household}`; }

  function safeId(s) { return String(s).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120); }
  function newEntryId(plantId) {
    const rnd = Math.random().toString(36).slice(2, 8);
    return safeId(`e-${Date.now().toString(36)}-${rnd}-${plantId}`);
  }

  function fromFs(doc) {
    const f = doc.fields || {};
    const str = (k) => (f[k] && f[k].stringValue) || "";
    return {
      id: doc.name.split("/").pop(),
      plantId: str("plantId"),
      name: str("name"),
      at: str("at"),
      by: str("by"),
      undone: !!(f.undone && f.undone.booleanValue),
      updatedAt: f.updatedAt && f.updatedAt.timestampValue
    };
  }

  /* Förbered state: unika id, härled watered från loggen, köa allt osynkat. */
  function migrate(state) {
    state.cloud = Object.assign({ lastPulled: null, metaDirty: false }, state.cloud || {});
    const seen = new Set();
    state.log = (state.log || []).filter((e) => e && e.plantId && e.at).map((e) => {
      let id = e.id ? safeId(e.id) : safeId(`${e.at}-${e.plantId}`);
      while (seen.has(id)) id = safeId(id + "_");
      seen.add(id);
      return Object.assign({}, e, { id, undone: !!e.undone, synced: !!e.synced, undoneDirty: !!e.undoneDirty });
    });
    // Vattningar som bara finns i watered (t.ex. gammal import) blir egna loggposter.
    Object.keys(state.watered || {}).forEach((pid) => {
      const at = state.watered[pid];
      if (!at) return;
      const has = state.log.some((e) => e.plantId === pid && !e.undone && e.at >= at);
      if (!has) {
        const id = safeId(`${at}-${pid}`);
        if (!seen.has(id)) {
          seen.add(id);
          state.log.push({ id, plantId: pid, name: pid, at, by: state.person || "Erik", undone: false, synced: false, undoneDirty: false });
        }
      }
    });
    derive(state);
    return state;
  }

  /* watered = senaste ej ångrade vattning per växt. Loggen sorteras nyast först. */
  function derive(state) {
    state.log.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : (a.id < b.id ? 1 : -1)));
    const w = {};
    state.log.forEach((e) => {
      if (e.undone) return;
      if (!w[e.plantId] || e.at > w[e.plantId]) w[e.plantId] = e.at;
    });
    state.watered = w;
  }

  function mergeRemote(state, remote) {
    const byId = new Map(state.log.map((e) => [e.id, e]));
    let changed = false;
    remote.forEach((r) => {
      const l = byId.get(r.id);
      if (!l) {
        const e = { id: r.id, plantId: r.plantId, name: r.name, at: r.at, by: r.by, undone: r.undone, synced: true, undoneDirty: false };
        state.log.push(e);
        byId.set(r.id, e);
        changed = true;
        return;
      }
      if (!l.synced) { l.synced = true; changed = true; }
      if (r.undone && !l.undone) { l.undone = true; changed = true; }
      if (r.undone && l.undoneDirty) { l.undoneDirty = false; changed = true; }
      if (!r.undone && l.undone && !l.undoneDirty) { l.undoneDirty = true; changed = true; }
    });
    if (changed) derive(state);
    return changed;
  }

  async function call(c, fetchFn, url, body) {
    const res = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store"
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    return json;
  }

  function entryWrite(c, e) {
    return {
      update: {
        name: `${householdDoc(c)}/entries/${e.id}`,
        fields: {
          plantId: { stringValue: String(e.plantId).slice(0, 40) },
          name: { stringValue: String(e.name || e.plantId).slice(0, 60) },
          at: { stringValue: String(e.at).slice(0, 40) },
          by: { stringValue: String(e.by || "?").slice(0, 20) },
          undone: { booleanValue: !!e.undone }
        }
      },
      updateTransforms: [{ fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }],
      currentDocument: { exists: false }
    };
  }

  function undoWrite(c, e) {
    return {
      update: { name: `${householdDoc(c)}/entries/${e.id}`, fields: { undone: { booleanValue: true } } },
      updateMask: { fieldPaths: ["undone"] },
      updateTransforms: [{ fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }],
      currentDocument: { exists: true }
    };
  }

  function metaWrite(c, state) {
    return {
      update: {
        name: `${householdDoc(c)}/meta/state`,
        fields: { streak: { integerValue: String(Math.max(0, Math.min(100000, state.streak | 0))) } }
      },
      updateTransforms: [{ fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }]
    };
  }

  async function push(state, c, fetchFn) {
    const creates = state.log.filter((e) => !e.synced);
    const undos = state.log.filter((e) => e.synced && e.undone && e.undoneDirty);
    const items = [];
    creates.forEach((e) => items.push({ kind: "create", e, w: entryWrite(c, e) }));
    undos.forEach((e) => items.push({ kind: "undo", e, w: undoWrite(c, e) }));
    if (state.cloud.metaDirty) items.push({ kind: "meta", w: metaWrite(c, state) });
    let failed = 0;
    // En commit per skrivning, så att en redan uppladdad post inte stoppar resten.
    const one = async (x) => {
      let code = 0;
      try {
        await call(c, fetchFn, `${base(c)}:commit`, { writes: [x.w] });
      } catch (err) {
        if (!err.status) throw err; // nätfel: försök igen senare
        const m = /"status":\s*"([A-Z_]+)"/.exec(err.message);
        const st = m ? m[1] : "";
        code = st === "ALREADY_EXISTS" || err.status === 409 ? 6 : st === "NOT_FOUND" || err.status === 404 ? 5 : 7;
      }
      if (x.kind === "create") {
        if (code === 0) { x.e.synced = true; x.e.undoneDirty = false; }
        else if (code === 6) { x.e.synced = true; x.e.undoneDirty = !!x.e.undone; }
        else failed++;
      } else if (x.kind === "undo") {
        if (code === 0) x.e.undoneDirty = false;
        else if (code === 5) { x.e.synced = false; } // posten fanns inte, skapa den igen
        else failed++;
      } else if (x.kind === "meta") {
        if (code === 0) state.cloud.metaDirty = false;
        else failed++;
      }
    };
    for (let i = 0; i < items.length; i += 6) {
      await Promise.all(items.slice(i, i + 6).map(one));
    }
    return { pushed: items.length, failed };
  }

  async function pull(state, c, fetchFn) {
    let since = state.cloud.lastPulled ? new Date(new Date(state.cloud.lastPulled).getTime() - OVERLAP_MS) : new Date(0);
    let changed = false;
    let maxSeen = state.cloud.lastPulled;
    for (let page = 0; page < 50; page++) {
      const out = await call(c, fetchFn, `${base(c)}/households/${c.household}:runQuery`, {
        structuredQuery: {
          from: [{ collectionId: "entries" }],
          where: { fieldFilter: { field: { fieldPath: "updatedAt" }, op: "GREATER_THAN_OR_EQUAL", value: { timestampValue: since.toISOString() } } },
          orderBy: [{ field: { fieldPath: "updatedAt" }, direction: "ASCENDING" }],
          limit: 500
        }
      });
      const docs = (out || []).filter((r) => r.document).map((r) => fromFs(r.document));
      if (mergeRemote(state, docs)) changed = true;
      docs.forEach((d) => { if (d.updatedAt && (!maxSeen || d.updatedAt > maxSeen)) maxSeen = d.updatedAt; });
      if (docs.length < 500) break;
      since = new Date(docs[docs.length - 1].updatedAt);
    }
    state.cloud.lastPulled = maxSeen;
    // Familjens streak
    if (!state.cloud.metaDirty) {
      try {
        const res = await fetchFn(`${base(c)}/households/${c.household}/meta/state`, { cache: "no-store" });
        if (res.ok) {
          const doc = await res.json();
          const v = doc.fields && doc.fields.streak && Number(doc.fields.streak.integerValue);
          if (Number.isFinite(v) && v !== state.streak) { state.streak = v; changed = true; }
        }
      } catch { /* ingen meta än */ }
    }
    return { changed };
  }

  /* En hel synkrunda: först skicka, sen hämta, sen skicka ev. rester. */
  async function syncOnce(state, over, fetchFn) {
    const c = cfg(over);
    if (!configured(c)) return { status: "unconfigured" };
    const f = fetchFn || root.fetch.bind(root);
    const p1 = await push(state, c, f);
    const r = await pull(state, c, f);
    const p2 = await push(state, c, f);
    return { status: p1.failed || p2.failed ? "partial" : "ok", changed: r.changed, pushed: p1.pushed + p2.pushed };
  }

  const api = { CONFIG, configured: () => configured(cfg()), migrate, derive, mergeRemote, newEntryId, syncOnce, safeId };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.VattnaCloud = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
