import React, { useEffect, useMemo, useState } from "react";

/* =========================================================
   Utilities
========================================================= */
const uid = (p = "id") => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const todayISO = () => new Date().toISOString().slice(0, 10);
const prettyTime = (d) =>
  new Date(d || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const ym = (d) => (d || todayISO()).slice(0, 7);
const normalizeDashes = (s) => (s || "").replace(/–|—/g, "-").replace(/\s+/g, " ").trim();
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function copyToClipboard(text) {
  try {
    navigator.clipboard.writeText(text);
  } catch {}
}

function useDebounced(value, delay = 200) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/* Scripture normalization & matching */
const BOOK_ALIASES = {
  psalm: "ps",
  psalms: "ps",
  ps: "ps",
  isaiah: "isa",
  isa: "isa",
  revelation: "rev",
  rev: "rev",
  matthew: "matt",
  matt: "matt",
  daniel: "dan",
  dan: "dan",
  romans: "rom",
  rom: "rom",
  james: "jas",
  "1 john": "1 john",
  "i john": "1 john",
  "2 john": "2 john",
  "3 john": "3 john",
  "1 timothy": "1 tim",
  "2 timothy": "2 tim",
};
function normRef(s) {
  if (!s) return "";
  let x = s.toLowerCase().trim().replace(/\./g, "");
  x = x.replace(/\s+/g, " ").replace(/—|–/g, "-");
  const keys = Object.keys(BOOK_ALIASES).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    const re = new RegExp("^" + k + "\\b");
    if (re.test(x)) {
      x = x.replace(re, BOOK_ALIASES[k]);
      break;
    }
  }
  return x;
}
function findRefKey(graph, input) {
  if (!input) return null;
  const keys = Object.keys(graph || {});
  if (keys.includes(input)) return input;
  const nIn = normRef(input);
  for (const k of keys) if (normRef(k) === nIn) return k;
  for (const k of keys) if (normRef(k).startsWith(nIn)) return k;
  return null;
}

/* NH export text */
function buildNHText(state, nhOnly) {
  const today = todayISO();
  const items = (state.visits || [])
    .filter((v) => v.date === today)
    .filter((v) => (nhOnly ? v.status === "NH" : v.status !== "RV"))
    .map((v) => {
      const addr =
        (state.households[v.householdId] && state.households[v.householdId].address) || "(unknown)";
      const who = v.personName ? " — " + v.personName : "";
      const parts = [addr + who, v.status];
      if (v.scripture) parts.push("📖 " + v.scripture);
      if (v.literature) parts.push("📘 " + v.literature);
      if (v.notes) parts.push("📝 " + v.notes);
      parts.push("🕒 " + prettyTime(v.createdAt));
      return "• " + parts.join(" — ");
    });
  const header = `NH List for ${state.territoryNumber || "(no territory)"} — ${today}
(Export includes ${nhOnly ? "NH only" : "all except RV"}; scope: today only)`;
  return [header, "", ...items].join("\n");
}

/* =========================================================
   Seed Data
========================================================= */
const SCRIPTURE_SUGGEST_STARTER = {
  "Ps 83:18": [
    {
      ref: "Rev 21:3-4",
      why: "Comfort — God’s care for mankind",
      ask: "What does this reveal about using God’s name?",
    },
    { ref: "Matt 6:9-10", why: "Kingdom — God’s name made holy" },
  ],
  "Rev 21:3-4": [{ ref: "Ps 37:10-11,29", why: "Hope — righteous inherit the earth" }],
  "Matt 6:9-10": [{ ref: "Dan 2:44", why: "What the Kingdom will do" }],
};
const TOPIC_LIBRARY_STARTER = [
  {
    topic: "Suffering & Loss",
    refs: ["Rev 21:3-4", "Ps 34:18", "2 Cor 1:3-4"],
    questions: [
      "How would life feel if tears and pain truly ended?",
      "Which loss weighs on you most right now?",
    ],
  },
  {
    topic: "God’s Name & Identity",
    refs: ["Ps 83:18", "Ex 3:15", "Matt 6:9"],
    questions: [
      "Have you ever seen God’s personal name in your Bible?",
      "Why might God want us to know and use his name?",
    ],
  },
];

const SEED = {
  territoryNumber: "",
  dailyThoughts: [],
  serviceLogs: [],
  households: [],
  visits: [],
  returnVisits: [],
  studies: [],
  scriptureSuggest: SCRIPTURE_SUGGEST_STARTER,
  topicLibrary: TOPIC_LIBRARY_STARTER,
};

/* =========================================================
   Safe Persistence (migration-friendly)
========================================================= */
const STORAGE_KEYS = ["mc_state_v1", "mc_state"];
const STORAGE_PRIMARY = "mc_state_v1";

function deepMergeDefaults(existing, defaults) {
  if (Array.isArray(defaults)) {
    return Array.isArray(existing) ? existing : defaults;
  }
  if (defaults && typeof defaults === "object") {
    const out = { ...defaults };
    if (existing && typeof existing === "object") {
      for (const k of Object.keys(existing)) {
        out[k] = deepMergeDefaults(existing[k], defaults[k]);
      }
    }
    return out;
  }
  return existing ?? defaults;
}

function loadAndMigrate(seed) {
  let found = null;
  for (const k of STORAGE_KEYS) {
    const raw = localStorage.getItem(k);
    if (raw) {
      found = { raw, key: k };
      break;
    }
  }
  if (!found) return seed;
  try {
    const parsed = JSON.parse(found.raw);
    const merged = deepMergeDefaults(parsed, seed);
    if (found.key !== STORAGE_PRIMARY) {
      localStorage.setItem(STORAGE_PRIMARY, JSON.stringify(merged));
    }
    return merged;
  } catch {
    return seed;
  }
}

/* =========================================================
   UI Primitives
========================================================= */
const Button = ({ children, className = "", ...props }) => (
  <button
    className={
      "px-3 py-2 rounded-xl shadow-sm border border-neutral-300 dark:border-neutral-700 hover:shadow transition active:scale-[.98] " +
      className
    }
    {...props}
  >
    {children}
  </button>
);

const Input = (props) => (
  <input
    {...props}
    className={
      (props.className || "") +
      " w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
    }
  />
);

const Select = ({ options = [], value, onChange, className = "" }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className={
      "w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 " +
      className
    }
  >
    {options.map((o) => (
      <option key={o} value={o}>
        {o}
      </option>
    ))}
  </select>
);

const TextArea = (props) => (
  <textarea
    {...props}
    className={
      (props.className || "") +
      " w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 min-h-[80px]"
    }
  />
);

const Section = ({ title, children, right }) => (
  <div className="mb-5">
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-lg font-semibold">{title}</h3>
      {right}
    </div>
    <div className="bg-white/70 dark:bg-neutral-900 p-4 rounded-2xl shadow-sm border border-neutral-200/60 dark:border-neutral-800">
      {children}
    </div>
  </div>
);

function Modal({ open, onClose, title, children, footer }) {
  useEffect(() => {
    function onEsc(e) {
      if (e.key === "Escape") onClose?.();
    }
    if (open) window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}></div>
      <div className="relative bg-white dark:bg-neutral-900 rounded-2xl shadow-xl max-w-3xl w-[92vw] max-h-[80vh] overflow-hidden border border-neutral-200 dark:border-neutral-800">
        <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <div className="font-semibold">{title}</div>
          <button className="text-sm px-2 py-1 border rounded-lg" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="p-4 overflow-auto" style={{ maxHeight: "calc(80vh - 110px)" }}>
          {children}
        </div>
        {footer && (
          <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   Mutations
========================================================= */
const addDailyThought = (text, setState) => {
  if (!text?.trim()) return;
  const today = todayISO();
  setState((s) => ({
    ...s,
    dailyThoughts: [
      { id: uid("DT"), date: today, text, createdAt: Date.now(), updatedAt: Date.now() },
      ...s.dailyThoughts.filter((d) => d.date !== today),
    ],
  }));
};

const addDoorLog = ({ address, status, scripture, literature, notes, personName }, state, setState) => {
  if (!address?.trim()) return;

  const existingIdx = state.households.findIndex(
    (h) => (h.address || "").trim().toLowerCase() === address.trim().toLowerCase()
  );
  if (existingIdx !== -1) {
    const ok = window.confirm(
      `A household for "${address}" already exists. Add another entry with the same address?`
    );
    if (!ok) return;
  }

  let idx = state.households.findIndex((h) => h.address === address);
  let households = [...state.households];
  if (idx === -1) {
    households = [...households, { id: uid("H"), address, notes: "", dnc: status === "DNC" }];
    idx = households.length - 1;
  }
  const visit = {
    id: uid("V"),
    date: todayISO(),
    householdId: idx,
    personId: null,
    status,
    scripture,
    literature,
    notes,
    personName,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const visits = [...state.visits, visit];

  let returnVisits = state.returnVisits;
  if (status === "RV") {
    returnVisits = [
      {
        id: uid("RV"),
        personName: personName || "(unknown)",
        address,
        lastScripture: scripture || "",
        nextScripture: "",
        nextVisit: todayISO(),
        bestTime: "",
        priority: "Medium",
        notes: notes || "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      ...returnVisits,
    ];
  }
  setState((s) => ({ ...s, households, visits, returnVisits }));
};

/* =========================================================
   Pages
========================================================= */
function PageHome({ state, setState, openSettings }) {
  const [thought, setThought] = useState("");
  const [hours, setHours] = useState("");
  const [cat, setCat] = useState("Door-to-door");
  const [hNotes, setHNotes] = useState("");

  const todays = state.dailyThoughts?.filter((d) => d.date === todayISO()) || [];
  const thisMonth = ym(todayISO());
  const monthLogs = (state.serviceLogs || []).filter((l) => ym(l.date) === thisMonth);
  const monthHours = monthLogs.reduce((a, b) => a + (Number(b.hours) || 0), 0);

  const addHours = () => {
    if (!hours) return;
    setState((s) => ({
      ...s,
      serviceLogs: [
        ...(s.serviceLogs || []),
        {
          id: uid("HRS"),
          date: todayISO(),
          hours: Number(hours),
          category: cat,
          notes: hNotes,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    }));
    setHours("");
    setHNotes("");
  };
  const exportMonth = () => {
    const lines = [
      `Territory #: ${state.territoryNumber || "—"}`,
      `Month: ${thisMonth}`,
      `Total Hours: ${monthHours.toFixed(2)}`,
      "",
      ...monthLogs.map(
        (l) =>
          `${l.date} — ${l.hours}h — ${l.category || "—"}${
            l.notes ? " — " + l.notes : ""
          } — 🕒 ${prettyTime(l.createdAt)}`
      ),
    ];
    copyToClipboard(lines.join("\n"));
    alert("Monthly log copied to clipboard.");
  };
  const [edit, setEdit] = useState(null);

  return (
    <div className="p-1">
      <Section
        title="Territory & Links"
        right={
          <div className="flex gap-2">
            <a className="px-3 py-2 rounded-xl border" href="https://www.jw.org" target="_blank" rel="noreferrer">
              jw.org ↗
            </a>
            <a
              className="px-3 py-2 rounded-xl border"
              href="https://www.jw.org/en/library/jw-library/"
              target="_blank"
              rel="noreferrer"
            >
              JW Library ↗
            </a>
            <Button className="text-sm" onClick={openSettings}>Settings</Button>
          </div>
        }
      >
        <div className="grid md:grid-cols-2 gap-3">
          <Input
            placeholder="Territory Number (e.g., T-12)"
            value={state.territoryNumber || ""}
            onChange={(e) => setState((s) => ({ ...s, territoryNumber: e.target.value }))}
          />
          <div className="text-sm opacity-75">Used in NH export & monthly report.</div>
        </div>
      </Section>

      <Section
        title="Daily Thought from Conductor"
        right={
          <Button
            onClick={() => {
              addDailyThought(thought, setState);
              setThought("");
            }}
          >
            Save
          </Button>
        }
      >
        <Input
          placeholder="Main point or scripture (e.g., Be warm & empathetic – Rev 21:4)"
          value={thought}
          onChange={(e) => setThought(e.target.value)}
        />
        {todays.length > 0 && (
          <div className="mt-3 text-sm opacity-80">
            <div className="font-medium mb-1">Today’s note</div>
            <ul className="list-disc ml-6">
              {todays.map((t) => (
                <li key={t.id}>
                  {t.text} <span className="opacity-60">• saved {prettyTime(t.createdAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <div className="grid md:grid-cols-2 gap-4">
        <Section title="Log Service Hours" right={<Button className="bg-blue-600 text-white" onClick={addHours}>Add</Button>}>
          <div className="grid grid-cols-5 gap-2 items-center">
            <div className="col-span-1">
              <Input
                type="number"
                min="0"
                step="0.25"
                placeholder="Hours"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <Select
                value={cat}
                onChange={setCat}
                options={[
                  "Door-to-door",
                  "Bible study",
                  "Informal",
                  "Letter writing",
                  "Cart",
                  "Other",
                ]}
              />
            </div>
            <div className="col-span-2">
              <Input
                placeholder="Notes (optional)"
                value={hNotes}
                onChange={(e) => setHNotes(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-2 text-sm opacity-75">
            This month: <span className="font-semibold">{monthHours.toFixed(2)}</span> hours
          </div>
          <div className="mt-2 flex gap-2">
            <Button onClick={exportMonth}>Copy Monthly Log</Button>
          </div>
        </Section>

        <Section title="Recent Hours">
          <div className="space-y-2">
            {(state.serviceLogs || [])
              .slice(-6)
              .reverse()
              .map((l) => (
                <div
                  key={l.id}
                  className="rounded-xl border p-3 border-neutral-200 dark:border-neutral-800"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      {l.date} — <b>{l.hours}h</b> — {l.category || "—"} {l.notes ? " — " + l.notes : ""}
                    </div>
                    <Button className="text-xs" onClick={() => setEdit(l)}>
                      Edit
                    </Button>
                  </div>
                  <div className="text-xs opacity-60">
                    🕒 {prettyTime(l.createdAt)}
                    {l.updatedAt && l.updatedAt !== l.createdAt
                      ? ` • updated ${prettyTime(l.updatedAt)}`
                      : ""}
                  </div>
                </div>
              ))}
          </div>
        </Section>
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title="Edit Hours">
        {edit && (
          <div className="space-y-2">
            <Input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} />
            <Input
              type="number"
              step="0.25"
              value={edit.hours}
              onChange={(e) => setEdit({ ...edit, hours: Number(e.target.value) })}
            />
            <Select
              value={edit.category || "Other"}
              onChange={(v) => setEdit({ ...edit, category: v })}
              options={["Door-to-door", "Bible study", "Informal", "Letter writing", "Cart", "Other"]}
            />
            <Input value={edit.notes || ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} placeholder="Notes" />
            <div className="flex gap-2">
              <Button
                className="bg-blue-600 text-white"
                onClick={() => {
                  setState((s) => ({
                    ...s,
                    serviceLogs: s.serviceLogs.map((x) => (x.id === edit.id ? { ...edit, updatedAt: Date.now() } : x)),
                  }));
                  setEdit(null);
                }}
              >
                Save
              </Button>
              <Button onClick={() => setEdit(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function PageTerritory({ state, setState }) {
  const [address, setAddress] = useState("");
  const [personName, setPersonName] = useState("");
  const [status, setStatus] = useState("NH");
  const [scripture, setScripture] = useState("");
  const [literature, setLiterature] = useState("");
  const [notes, setNotes] = useState("");
  const [nhOnly, setNhOnly] = useState(false);
  const [editing, setEditing] = useState(null);

  const recent = [...(state.visits || [])].reverse().slice(0, 12);

  const exportNH = () => {
    copyToClipboard(buildNHText(state, nhOnly));
    alert("NH list copied to clipboard.");
  };

  const saveEdit = () => {
    setState((s) => {
      const visits = s.visits.map((v) => (v.id === editing.id ? { ...editing, updatedAt: Date.now() } : v));
      const households = [...s.households];
      const hid = editing.householdId;
      if (households[hid]) {
        const newAddr = ((editing.__address ?? households[hid]?.address) || "").trim(); // parentheses fix
        if (newAddr) {
          const dupAt = households.findIndex(
            (h, i) => i !== hid && ((h.address || "").trim().toLowerCase() === newAddr.toLowerCase())
          );
          if (dupAt !== -1) {
            if (!window.confirm(`Another household already uses “${newAddr}”. Keep both with the same address?`)) {
              return s;
            }
          }
          households[hid] = { ...households[hid], address: newAddr };
        }
      }
      return { ...s, visits, households };
    });
    setEditing(null);
  };

  return (
    <div>
      <Section title="Log a Door">
        <div className="grid md:grid-cols-2 gap-3">
          <Input placeholder="Address (e.g., 1410 Amherst)" value={address} onChange={(e) => setAddress(e.target.value)} />
          <Input placeholder="Person’s name" value={personName} onChange={(e) => setPersonName(e.target.value)} />
          <Select options={["NH", "RV", "NI", "DNC", "Vacant", "Empty", "No Trespassing"]} value={status} onChange={setStatus} />
          <Input placeholder="Scripture shared" value={scripture} onChange={(e) => setScripture(e.target.value)} />
          <Input placeholder="Literature left (Invitation, Tract, Watchtower, ELF)" value={literature} onChange={(e) => setLiterature(e.target.value)} />
          <TextArea placeholder="Notes…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="mt-3 flex gap-2">
          <Button
            className="bg-blue-600 text-white"
            onClick={() => {
              addDoorLog({ address, status, scripture, literature, notes, personName }, state, setState);
              setAddress("");
              setPersonName("");
              setScripture("");
              setLiterature("");
              setNotes("");
            }}
          >
            Save Entry
          </Button>
          <Button
            onClick={() => {
              setAddress("");
              setPersonName("");
              setScripture("");
              setLiterature("");
              setNotes("");
            }}
          >
            Clear
          </Button>
        </div>
      </Section>

      <Section
        title="Export NH / Follow-up List"
        right={
          <div className="flex items-center gap-2">
            <label className="text-sm flex items-center gap-2">
              <input type="checkbox" checked={nhOnly} onChange={(e) => setNhOnly(e.target.checked)} /> NH only
            </label>
            <Button onClick={exportNH}>Copy List</Button>
          </div>
        }
      >
        <div className="text-sm opacity-75">Copies a bullet list of today’s doors (default: everything except RV). Share with the territory holder.</div>
      </Section>

      <Section title="Recent Activity">
        <div className="space-y-2">
          {recent.map((v) => (
            <div key={v.id} className="rounded-xl border p-3 border-neutral-200 dark:border-neutral-800">
              <div className="text-sm opacity-70">
                {v.date} • {prettyTime(v.createdAt)}
              </div>
              <div className="font-medium">
                {(state.households[v.householdId] && state.households[v.householdId].address) || "(unknown)"} —{" "}
                <span className="px-2 py-0.5 rounded-full text-xs border">{v.status}</span>
              </div>
              {v.personName && <div className="text-sm">👤 {v.personName}</div>}
              {(v.scripture || v.literature || v.notes) && (
                <div className="text-sm mt-1 opacity-90">
                  {v.scripture && <div>📖 {v.scripture}</div>}
                  {v.literature && <div>📘 {v.literature}</div>}
                  {v.notes && <div>📝 {v.notes}</div>}
                </div>
              )}
              <div className="mt-2">
                <Button className="text-xs" onClick={() => setEditing(v)}>
                  Edit
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Visit">
        {editing && (
          <div className="space-y-2">
            <Input
              placeholder="Address"
              value={
                (editing.__address ??
                  (state.households[editing.householdId] && state.households[editing.householdId].address)) || ""
              }
              onChange={(e) => setEditing({ ...editing, __address: e.target.value })}
            />
            <Input placeholder="Person name" value={editing.personName || ""} onChange={(e) => setEditing({ ...editing, personName: e.target.value })} />
            <Select options={["NH", "RV", "NI", "DNC", "Vacant", "Empty", "No Trespassing"]} value={editing.status} onChange={(v) => setEditing({ ...editing, status: v })} />
            <Input placeholder="Scripture" value={editing.scripture || ""} onChange={(e) => setEditing({ ...editing, scripture: e.target.value })} />
            <Input placeholder="Literature" value={editing.literature || ""} onChange={(e) => setEditing({ ...editing, literature: e.target.value })} />
            <TextArea placeholder="Notes" value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            <div className="flex gap-2">
              <Button className="bg-blue-600 text-white" onClick={saveEdit}>
                Save
              </Button>
              <Button onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function PageReturnVisits({ state, setState }) {
  const [form, setForm] = useState({
    personName: "",
    address: "",
    lastScripture: "",
    nextScripture: "",
    nextVisit: todayISO(),
    bestTime: "",
    notes: "",
  });
  const sorted = [...state.returnVisits].sort((a, b) => (a.nextVisit || "").localeCompare(b.nextVisit || ""));
  const [editing, setEditing] = useState(null);
  const [suggestFor, setSuggestFor] = useState(null);
  const graph = state.scriptureSuggest || {};

  const save = () => {
    if (!form.personName || !form.address) return;
    setState((s) => ({
      ...s,
      returnVisits: [{ id: uid("RV"), ...form, createdAt: Date.now(), updatedAt: Date.now() }, ...s.returnVisits],
    }));
    setForm({
      personName: "",
      address: "",
      lastScripture: "",
      nextScripture: "",
      nextVisit: todayISO(),
      bestTime: "",
      notes: "",
    });
  };

  const suggestions = (rv) => {
    const last = normalizeDashes((rv?.lastScripture || "").trim());
    const key = findRefKey(graph, last);
    return key ? graph[key] || [] : [];
  };

  return (
    <div>
      <Section title="Add Return Visit" right={<Button className="bg-blue-600 text-white" onClick={save}>Save</Button>}>
        <div className="grid md:grid-cols-2 gap-3">
          <Input placeholder="Name" value={form.personName} onChange={(e) => setForm((f) => ({ ...f, personName: e.target.value }))} />
          <Input placeholder="Address" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          <Input placeholder="Scripture shared last time" value={form.lastScripture} onChange={(e) => setForm((f) => ({ ...f, lastScripture: e.target.value }))} />
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Input placeholder="Next scripture" value={form.nextScripture} onChange={(e) => setForm((f) => ({ ...f, nextScripture: e.target.value }))} />
            </div>
            <Button onClick={() => setSuggestFor({ kind: "form", data: form })}>Suggest</Button>
          </div>
          <Input type="date" value={form.nextVisit} onChange={(e) => setForm((f) => ({ ...f, nextVisit: e.target.value }))} />
          <Input placeholder="Best time (e.g., Weekend mornings)" value={form.bestTime} onChange={(e) => setForm((f) => ({ ...f, bestTime: e.target.value }))} />
          <TextArea placeholder="Notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </div>
      </Section>

      <Section title="Queue (by date)">
        <div className="space-y-2">
          {sorted.map((rv) => (
            <div key={rv.id} className="rounded-xl border p-3 border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center justify-between">
                <div className="font-semibold">
                  {rv.personName} — <span className="opacity-70 font-normal">{rv.address}</span>
                </div>
                <div className="flex gap-2">
                  <Button className="text-xs" onClick={() => setSuggestFor({ kind: "rv", data: rv })}>
                    Suggest next scripture
                  </Button>
                  <Button className="text-xs" onClick={() => setEditing(rv)}>
                    Edit
                  </Button>
                </div>
              </div>
              <div className="text-sm mt-1 grid sm:grid-cols-3 gap-2">
                <div>Next: <span className="font-medium">{rv.nextVisit || "—"}</span></div>
                <div>Last 📖 {rv.lastScripture || "—"}</div>
                <div>Next 📖 {rv.nextScripture || "(tap Suggest)"}</div>
              </div>
              <div className="text-xs opacity-60 mt-1">
                🕒 saved {prettyTime(rv.createdAt)}
                {rv.updatedAt && rv.updatedAt !== rv.createdAt ? ` • updated ${prettyTime(rv.updatedAt)}` : ""}
              </div>
              {rv.bestTime && <div className="text-sm opacity-80 mt-1">Best time: {rv.bestTime}</div>}
              {rv.notes && <div className="text-sm opacity-80 mt-1">Notes: {rv.notes}</div>}
            </div>
          ))}
        </div>
      </Section>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Return Visit">
        {editing && (
          <div className="space-y-2">
            <Input placeholder="Name" value={editing.personName} onChange={(e) => setEditing({ ...editing, personName: e.target.value })} />
            <Input placeholder="Address" value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} />
            <Input placeholder="Last scripture" value={editing.lastScripture || ""} onChange={(e) => setEditing({ ...editing, lastScripture: e.target.value })} />
            <Input placeholder="Next scripture" value={editing.nextScripture || ""} onChange={(e) => setEditing({ ...editing, nextScripture: e.target.value })} />
            <Input type="date" value={editing.nextVisit} onChange={(e) => setEditing({ ...editing, nextVisit: e.target.value })} />
            <Input placeholder="Best time" value={editing.bestTime || ""} onChange={(e) => setEditing({ ...editing, bestTime: e.target.value })} />
            <TextArea placeholder="Notes" value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            <div className="flex gap-2">
              <Button
                className="bg-blue-600 text-white"
                onClick={() => {
                  setState((s) => ({
                    ...s,
                    returnVisits: s.returnVisits.map((x) => (x.id === editing.id ? { ...editing, updatedAt: Date.now() } : x)),
                  }));
                  setEditing(null);
                }}
              >
                Save
              </Button>
              <Button onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!suggestFor} onClose={() => setSuggestFor(null)} title="Suggested next scriptures">
        {suggestFor && (
          <div className="space-y-2">
            {(() => {
              const rv = suggestFor.kind === "rv" ? suggestFor.data : suggestFor.data;
              const list = suggestions(rv);
              if (list.length === 0) {
                return (
                  <div className="opacity-70">
                    No suggestions found for <b>{rv.lastScripture || "(none)"}</b>. Try “Ps 83:18” vs “Psalm 83:18”, or
                    import more mappings in the Scripture Tool.
                  </div>
                );
              }
              return (
                <ul className="space-y-2">
                  {list.map((s, i) => (
                    <li key={i} className="border rounded-xl p-3 border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
                      <div>
                        <div className="font-medium">{s.ref}</div>
                        <div className="text-sm opacity-80">{s.why}</div>
                        {s.ask && <div className="text-sm mt-1">Q: {s.ask}</div>}
                      </div>
                      <Button
                        onClick={() => {
                          if (suggestFor.kind === "rv") {
                            const id = suggestFor.data.id;
                            setState((st) => ({
                              ...st,
                              returnVisits: st.returnVisits.map((x) =>
                                x.id === id ? { ...x, nextScripture: s.ref, updatedAt: Date.now() } : x
                              ),
                            }));
                          } else {
                            // form case
                            // eslint-disable-next-line no-unused-vars
                            setForm((f) => ({ ...f, nextScripture: s.ref }));
                          }
                          setSuggestFor(null);
                        }}
                      >
                        Use
                      </Button>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>
        )}
      </Modal>
    </div>
  );
}

function PageStudies({ state, setState }) {
  const [name, setName] = useState("");
  const [lesson, setLesson] = useState(1);
  const [nextDate, setNextDate] = useState("");
  const [notes, setNotes] = useState("");
  const [editing, setEditing] = useState(null);

  const add = () => {
    if (!name) return;
    setState((s) => ({
      ...s,
      studies: [
        {
          id: uid("S"),
          name,
          lesson: clamp(Number(lesson) || 1, 1, 60),
          nextDate,
          notes,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        ...s.studies,
      ],
    }));
    setName("");
    setLesson(1);
    setNextDate("");
    setNotes("");
  };

  const markDone = (id) =>
    setState((st) => ({
      ...st,
      studies: st.studies.map((x) => (x.id === id ? { ...x, lesson: clamp(Number(x.lesson) + 1, 1, 60), updatedAt: Date.now() } : x)),
    }));

  return (
    <div>
      <Section title="Add Study" right={<Button className="bg-blue-600 text-white" onClick={add}>Save</Button>}>
        <div className="grid md:grid-cols-2 gap-3">
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <div>
            <div className="text-xs mb-1 opacity-70">Lesson number</div>
            <Input type="number" min={1} max={60} value={lesson} onChange={(e) => setLesson(e.target.value)} />
          </div>
          <div>
            <div className="text-xs mb-1 opacity-70">Next visit date</div>
            <Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
          </div>
          <TextArea placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </Section>

      <Section title="All Studies">
        <div className="space-y-2">
          {state.studies.map((s) => (
            <div key={s.id} className="rounded-xl border p-3 border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center justify-between">
                <div className="font-semibold">{s.name}</div>
                <div className="flex gap-2">
                  <div className="text-sm opacity-75">Lesson {s.lesson}</div>
                  <Button className="text-xs" onClick={() => setEditing(s)}>
                    Edit
                  </Button>
                </div>
              </div>
              <div className="text-sm grid sm:grid-cols-3 gap-2 mt-1">
                <div>Next: {s.nextDate || "—"}</div>
                <div>Notes: {s.notes || "—"}</div>
                <div>
                  <Button onClick={() => markDone(s.id)} className="text-xs">
                    Mark Lesson Complete
                  </Button>
                </div>
              </div>
              <div className="text-xs opacity-60 mt-1">
                🕒 saved {prettyTime(s.createdAt)}
                {s.updatedAt && s.updatedAt !== s.createdAt ? ` • updated ${prettyTime(s.updatedAt)}` : ""}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Study">
        {editing && (
          <div className="space-y-2">
            <Input placeholder="Name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <div>
              <div className="text-xs mb-1 opacity-70">Lesson number</div>
              <Input type="number" min={1} max={60} value={editing.lesson} onChange={(e) => setEditing({ ...editing, lesson: clamp(Number(e.target.value) || 1, 1, 60) })} />
            </div>
            <Input type="date" value={editing.nextDate || ""} onChange={(e) => setEditing({ ...editing, nextDate: e.target.value })} />
            <TextArea placeholder="Notes" value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            <div className="flex gap-2">
              <Button
                className="bg-blue-600 text-white"
                onClick={() => {
                  setState((s) => ({
                    ...s,
                    studies: s.studies.map((x) => (x.id === editing.id ? { ...editing, updatedAt: Date.now() } : x)),
                  }));
                  setEditing(null);
                }}
              >
                Save
              </Button>
              <Button onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function PageScriptureTool({ state, setState }) {
  const MAX_INLINE = 5;
  const TYPEAHEAD_CAP = 12;
  const MIN_CHARS = 2;

  const [lastShared, setLastShared] = useState("Ps 83:18");
  const graph = state.scriptureSuggest || {};
  const recognizedKey = findRefKey(graph, normalizeDashes(lastShared));
  const nextSuggestions = recognizedKey ? graph[recognizedKey] || [] : [];
  const inlineSuggestions = nextSuggestions.slice(0, MAX_INLINE);
  const extraCount = Math.max(0, nextSuggestions.length - inlineSuggestions.length);

  const [q, setQ] = useState("");
  const dq = useDebounced(q, 200);
  const [submitted, setSubmitted] = useState(false);
  const [focus, setFocus] = useState(false);

  const keywordOptions = useMemo(() => {
    const topicNames = (state.topicLibrary || []).map((t) => t.topic);
    const scriptureKeys = Object.keys(graph);
    const all = Array.from(new Set([...topicNames, ...scriptureKeys]));
    const n = dq.toLowerCase();
    if (!n || !focus) return [];
    return all.filter((x) => x.toLowerCase().includes(n)).slice(0, TYPEAHEAD_CAP);
  }, [dq, state.topicLibrary, graph, focus]);

  const topics = useMemo(() => {
    const lib = state.topicLibrary || [];
    if (!submitted || dq.trim().length < MIN_CHARS) return [];
    const needle = dq.trim();
    const nNeedle = normRef(needle);
    const isScriptureLike = /\d?\s?[a-z]+\s?\d+(?::\d+)?/i.test(needle);
    return lib.filter((t) => {
      const titleHit = t.topic.toLowerCase().includes(needle.toLowerCase());
      if (titleHit) return true;
      if (!isScriptureLike) return false;
      const refs = Array.isArray(t.refs) ? t.refs : [];
      return refs.some((r) => {
        const nr = normRef(r);
        return nr === nNeedle || nr.startsWith(nNeedle);
      });
    });
  }, [submitted, dq, state.topicLibrary]);

  /* Click-away for typeahead */
  useEffect(() => {
    const onDoc = (e) => {
      const c = document.getElementById("topic-search-container");
      if (c && !c.contains(e.target)) setFocus(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div>
      <Section title="Auto-Suggest (based on last scripture)">
        <div className="grid md:grid-cols-3 gap-3 items-start">
          <Input value={lastShared} onChange={(e) => setLastShared(e.target.value)} placeholder="Last shared (e.g., Psalm 83:18 or Ps 83:18)" />
          <div className="md:col-span-2 space-y-2">
            {recognizedKey ? (
              <>
                {inlineSuggestions.length > 0 ? (
                  <ul className="list-disc ml-5">
                    {inlineSuggestions.map((s, i) => (
                      <li key={i}>
                        <span className="font-medium">{s.ref}</span> — {s.why}
                        {s.ask ? ` — Q: ${s.ask}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="opacity-70">No suggestions found.</div>
                )}
                {extraCount > 0 && <div className="text-sm opacity-70">+{extraCount} more (not shown here).</div>}
              </>
            ) : (
              <div className="opacity-70">
                Start typing a known scripture reference. Suggestions will appear once it’s recognized
                (e.g., “Ps 83:18”, “Matt 6:9-10”, “Rev 21:4”).
              </div>
            )}
          </div>
        </div>
      </Section>

      <Section title="Search by Concern or Topic">
        <form
          id="topic-search-container"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
            setFocus(false);
          }}
          className="relative"
        >
          <Input
            onFocus={() => setFocus(true)}
            placeholder="Type a keyword (e.g., anxiety, hope)… or a scripture (e.g., Rev 21:4); then press Enter"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSubmitted(false);
            }}
          />
          {keywordOptions.length > 0 && focus && (
            <div className="absolute z-10 mt-1 w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow max-h-64 overflow-auto">
              {keywordOptions.map((opt) => (
                <div
                  key={opt}
                  className="px-3 py-2 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  onClick={() => {
                    setQ(opt);
                    setSubmitted(true);
                    setFocus(false);
                  }}
                >
                  {opt}
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 text-xs opacity-70">Results are hidden until you search (min 2 characters or pick a suggestion).</div>
          <div className="mt-2">
            <Button type="submit" className="text-sm">
              Search
            </Button>
          </div>
        </form>

        {submitted && q.trim().length >= 2 && (
          <div className="grid md:grid-cols-2 gap-3 mt-3">
            {topics.length === 0 ? (
              <div className="opacity-70">No topics found for “{q}”.</div>
            ) : (
              topics.map((t) => (
                <div key={t.topic} className="rounded-xl border p-3 border-neutral-200 dark:border-neutral-800">
                  <div className="font-semibold mb-1">{t.topic}</div>
                  <div className="text-sm">
                    <span className="font-medium">Scriptures:</span> {Array.isArray(t.refs) ? t.refs.join(", ") : "—"}
                  </div>
                  {Array.isArray(t.questions) && t.questions.length > 0 && (
                    <div className="text-sm mt-1">
                      <span className="font-medium">Sample questions:</span>
                      <ul className="list-disc ml-5">{t.questions.map((qq, i) => <li key={i}>{qq}</li>)}</ul>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </Section>
    </div>
  );
}

/* =========================================================
   Stats + App + Settings
========================================================= */
function Stats({ state }) {
  const today = todayISO();
  const todays = (state.visits || []).filter((v) => v.date === today);
  const countBy = (k) => todays.filter((v) => v.status === k).length;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard label="Visits Today" value={todays.length} />
      <StatCard label="NH" value={countBy("NH")} />
      <StatCard label="RV Logged" value={countBy("RV")} />
      <StatCard label="NI/DNC" value={countBy("NI") + countBy("DNC")} />
    </div>
  );
}
const StatCard = ({ label, value }) => (
  <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 text-center bg-white/70 dark:bg-neutral-900">
    <div className="text-2xl font-bold">{value}</div>
    <div className="text-sm opacity-70">{label}</div>
  </div>
);

const TABS = ["Home", "Territory", "Return Visits", "Bible Studies", "Scripture Tool"];

export default function MinistryCompanion() {
  // Load + migrate once
  const [state, setStateRaw] = useState(() => loadAndMigrate(SEED));
  // Persist on every change
  useEffect(() => {
    localStorage.setItem(STORAGE_PRIMARY, JSON.stringify(state));
  }, [state]);
  const setState = (updater) => setStateRaw((s) => (typeof updater === "function" ? updater(s) : updater));

  const [tab, setTab] = useState("Home");
  const [showSplash, setShowSplash] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importText, setImportText] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 1000);
    return () => clearTimeout(t);
  }, []);

  // Backup / Restore helpers
  const exportAll = () => {
    copyToClipboard(JSON.stringify(state, null, 2));
    alert("All Ministry Companion data copied to clipboard.");
  };
  const importAll = () => {
    try {
      const obj = JSON.parse(importText);
      const merged = deepMergeDefaults(obj, SEED);
      setState(merged);
      localStorage.setItem(STORAGE_PRIMARY, JSON.stringify(merged));
      alert("Data imported.");
      setImportText("");
      setSettingsOpen(false);
    } catch {
      alert("Invalid JSON.");
    }
  };
  const clearWithBackup = () => {
    const ok = window.confirm("This will clear the app data after copying a backup to your clipboard. Continue?");
    if (!ok) return;
    exportAll();
    setState(SEED);
    localStorage.setItem(STORAGE_PRIMARY, JSON.stringify(SEED));
    alert("Data cleared. A backup JSON is in your clipboard.");
  };

  const renderPage = () => {
    switch (tab) {
      case "Home":
        return <PageHome state={state} setState={setState} openSettings={() => setSettingsOpen(true)} />;
      case "Territory":
        return <PageTerritory state={state} setState={setState} />;
      case "Return Visits":
        return <PageReturnVisits state={state} setState={setState} />;
      case "Bible Studies":
        return <PageStudies state={state} setState={setState} />;
      case "Scripture Tool":
        return <PageScriptureTool state={state} setState={setState} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      {showSplash && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white dark:bg-neutral-950">
          <div className="text-center">
            <div className="text-3xl font-extrabold tracking-tight">Ministry Companion</div>
            <div className="mt-2 opacity-70 text-sm">Field Service • Return Visits • Studies • Scriptures</div>
          </div>
        </div>
      )}

      {/* Mobile friendly header: title on its own row; scrollable tabs */}
      <header className="sticky top-0 z-40 backdrop-blur bg-white/70 dark:bg-neutral-950/70 border-b border-neutral-200/70 dark:border-neutral-800">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="text-center md:text-left font-semibold text-lg md:text-xl">Ministry Companion</div>
          <nav className="mt-2 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 whitespace-nowrap rounded-xl border text-sm ${
                  tab === t
                    ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                    : "border-neutral-300 dark:border-neutral-700"
                }`}
              >
                {t}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 space-y-6">
        <Stats state={state} />
        {renderPage()}
      </main>

      {/* Settings (Backup/Restore) */}
      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Settings • Backup & Restore">
        <div className="space-y-4">
          <Section title="Backup">
            <div className="flex flex-wrap gap-2">
              <Button onClick={exportAll} className="bg-blue-600 text-white">Copy All Data (JSON)</Button>
            </div>
          </Section>

          <Section title="Restore">
            <div className="text-sm opacity-75 mb-2">Paste data that was previously exported.</div>
            <TextArea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder='{"visits":[...],"returnVisits":[...],...}' />
            <div className="mt-2">
              <Button onClick={importAll}>Import</Button>
            </div>
          </Section>

          <Section title="Danger zone">
            <div className="text-sm opacity-75">Clears app data after copying a backup to your clipboard.</div>
            <Button onClick={clearWithBackup} className="mt-2 border-red-500 text-red-600">Clear data (with backup)</Button>
          </Section>
        </div>
      </Modal>
    </div>
  );
}

/* Optional: hide scrollbars for tab row (add in your CSS file)
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
*/
