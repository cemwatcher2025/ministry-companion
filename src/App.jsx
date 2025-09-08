
import React, { useEffect, useMemo, useState } from "react";

// -------------------- Utilities --------------------
const uid = (p = "id") => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const todayISO = () => new Date().toISOString().slice(0, 10);
const ym = (d) => (d || todayISO()).slice(0, 7);

function useLocalState(key, fallback) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  });
  useEffect(() => localStorage.setItem(key, JSON.stringify(value)), [key, value]);
  return [value, setValue];
}

function copyToClipboard(text) {
  try { navigator.clipboard.writeText(text); } catch (e) { console.warn(e); }
}

function useDebounced(value, delay = 200) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return v;
}

// Scripture normalization & matching
const BOOK_ALIASES = {
  'psalm': 'ps', 'psalms': 'ps', 'ps': 'ps',
  'isaiah': 'isa', 'isa': 'isa',
  'revelation': 'rev', 'rev': 'rev',
  'matthew': 'matt', 'matt': 'matt',
  'daniel': 'dan', 'dan': 'dan',
  'john': 'john', '1 john': '1 john', 'i john': '1 john', '2 john': '2 john', '3 john': '3 john',
  'philippians': 'phil', 'phil': 'phil',
  'corinthians': 'cor', '1 corinthians': '1 cor', '2 corinthians': '2 cor', '1 cor': '1 cor', '2 cor': '2 cor',
  'peter': 'pet', '1 peter': '1 pet', '2 peter': '2 pet',
  'ecclesiastes': 'eccl', 'eccl': 'eccl',
  'proverbs': 'prov', 'prov': 'prov',
  'genesis': 'gen', 'exodus': 'ex', 'ex': 'ex',
  'romans': 'rom', 'rom': 'rom', 'james': 'jas', '1 timothy': '1 tim', '2 timothy': '2 tim',
};
function normRef(s) {
  if (!s) return '';
  let x = s.toLowerCase().trim().replace(/\./g, '');
  x = x.replace(/\s+/g, ' ').replace(/—|–/g, '-');
  for (const k of Object.keys(BOOK_ALIASES).sort((a,b)=>b.length-a.length)) {
    const re = new RegExp('^' + k + '\\b');
    if (re.test(x)) { x = x.replace(re, BOOK_ALIASES[k]); break; }
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

// Build NH text (today-only)
function buildNHText(state, nhOnly) {
  const today = todayISO();
  const items = (state.visits || [])
    .filter(v => v.date === today)
    .filter(v => (nhOnly ? v.status === 'NH' : v.status !== 'RV'))
    .map(v => {
      const addr = state.households[v.householdId]?.address || '(unknown)';
      const who = v.personName ? ' — ' + v.personName : '';
      const parts = [addr + who, v.status];
      if (v.scripture) parts.push('📖 ' + v.scripture);
      if (v.literature) parts.push('📘 ' + v.literature);
      if (v.notes) parts.push('📝 ' + v.notes);
      return '• ' + parts.join(' — ');
    });
  const header = `NH List for ${state.territoryNumber || '(no territory)'} — ${today}\n(Export includes ${nhOnly ? 'NH only' : 'all except RV'}; scope: today only)`;
  return [header, '', ...items].join('\\n');
}

// -------------------- Initial Data --------------------
const TABS = ['Home','Territory','Return Visits','Bible Studies','Scripture Tool'];

const SCRIPTURE_SUGGEST_STARTER = {
  'Ps 83:18': [
    { ref: 'Rev 21:3-4', why: 'Comfort — God’s care for mankind' },
    { ref: 'Matt 6:9-10', why: 'Kingdom — God’s name made holy' },
  ],
  'Rev 21:3-4': [
    { ref: 'Ps 37:10-11,29', why: 'Hope — righteous will inherit the earth' },
  ],
  'Matt 6:9-10': [
    { ref: 'Dan 2:44', why: 'What the Kingdom will do' },
  ],
  'Ps 37:29': [
    { ref: 'Isa 35:5-6', why: 'Future blessings made real' },
  ],
  '1 John 5:19': [
    { ref: 'Rev 12:9', why: 'Who controls the world now?' },
    { ref: 'Rev 21:4', why: 'Why better days are coming' },
  ],
};

const TOPIC_LIBRARY_STARTER = [
  { topic: 'Suffering & Loss', refs: ['Rev 21:3-4','Ps 34:18','2 Cor 1:3-4'], questions: [
    'How would life feel if tears and pain truly ended?',
    'Which loss weighs on you most right now?',
  ]},
  { topic: 'God’s Name & Identity', refs: ['Ps 83:18','Ex 3:15','Matt 6:9'], questions: [
    'Have you ever seen God’s personal name in your Bible?',
    'Why might God want us to know and use his name?',
  ]},
  { topic: 'Kingdom & Future', refs: ['Matt 6:9-10','Dan 2:44','Ps 37:10-11,29'], questions: [
    'What would you want fixed first if God ruled the earth?',
    'Do you think world governments can solve our biggest problems?',
  ]},
];

const SEED = {
  territoryNumber: '',
  dailyThoughts: [],
  serviceLogs: [],
  households: [{ id: uid('H'), address: '1410 Amherst', notes: 'Fred; left invitation', dnc: false }],
  visits: [],
  returnVisits: [],
  studies: [],
  scriptureSuggest: SCRIPTURE_SUGGEST_STARTER,
  topicLibrary: TOPIC_LIBRARY_STARTER,
};

// -------------------- UI Primitives --------------------
const Button = ({ children, className = '', ...props }) => (
  <button className={'px-3 py-2 rounded-xl shadow-sm border border-neutral-300 dark:border-neutral-700 hover:shadow transition active:scale-[.98] '+className} {...props}>{children}</button>
);
const Input = (props) => (<input {...props} className={(props.className||'') + ' w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900'} />);
const Select = ({ options = [], value, onChange, className = '' }) => (
  <select value={value} onChange={(e)=>onChange(e.target.value)} className={'w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 '+className}>
    {options.map(o => <option key={o} value={o}>{o}</option>)}
  </select>
);
const TextArea = (props) => (<textarea {...props} className={(props.className||'') + ' w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 min-h-[80px]'} />);
const Section = ({ title, children, right }) => (
  <div className="mb-5">
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-lg font-semibold">{title}</h3>{right}
    </div>
    <div className="bg-white/70 dark:bg-neutral-900 p-4 rounded-2xl shadow-sm border border-neutral-200/60 dark:border-neutral-800">{children}</div>
  </div>
);

// Modal
function Modal({ open, onClose, title, children, footer }) {
  useEffect(()=>{
    function onEsc(e){ if(e.key==='Escape') onClose?.(); }
    if(open) window.addEventListener('keydown', onEsc);
    return ()=>window.removeEventListener('keydown', onEsc);
  },[open,onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}></div>
      <div className="relative bg-white dark:bg-neutral-900 rounded-2xl shadow-xl max-w-3xl w-[92vw] max-h-[80vh] overflow-hidden border border-neutral-200 dark:border-neutral-800">
        <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <div className="font-semibold">{title}</div>
          <button className="text-sm px-2 py-1 border rounded-lg" onClick={onClose}>Close</button>
        </div>
        <div className="p-4 overflow-auto" style={{maxHeight:'calc(80vh - 110px)'}}>{children}</div>
        {footer && <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800">{footer}</div>}
      </div>
    </div>
  );
}

// -------------------- Mutations --------------------
const addDailyThought = (text, setState) => {
  if (!text?.trim()) return;
  setState(s => ({ ...s, dailyThoughts: [{ id: uid('DT'), date: todayISO(), text }, ...s.dailyThoughts ] }));
};

const addDoorLog = ({ address, status, scripture, literature, notes, personName }, state, setState) => {
  if (!address?.trim()) return; // require address
  let idx = state.households.findIndex(h => h.address === address);
  let households = [...state.households];
  if (idx === -1) { households = [...households, { id: uid('H'), address, notes: '', dnc: status === 'DNC' }]; idx = households.length - 1; }
  const visit = { id: uid('V'), date: todayISO(), householdId: idx, personId: null, status, scripture, literature, notes, personName };
  const visits = [...state.visits, visit];
  let returnVisits = state.returnVisits;
  if (status === 'RV') {
    returnVisits = [{ id: uid('RV'), personName: personName || '(unknown)', address, lastScripture: scripture, nextScripture: '', nextVisit: todayISO(), bestTime: '', priority: 'Medium', notes }, ...returnVisits];
  }
  setState(s => ({ ...s, households, visits, returnVisits }));
};

// -------------------- Pages --------------------
function PageHome({ state, setState, setTab }) {
  const [thought, setThought] = useState('');
  const [hours, setHours] = useState('');
  const [hNotes, setHNotes] = useState('');

  const todays = state.dailyThoughts?.filter(d => d.date === todayISO()) || [];
  const thisMonth = ym(todayISO());
  const monthLogs = (state.serviceLogs||[]).filter(l => ym(l.date) === thisMonth);
  const monthHours = monthLogs.reduce((a,b)=> a + (Number(b.hours)||0), 0);

  const addHours = () => {
    if (!hours) return;
    setState(s => ({ ...s, serviceLogs: [...(s.serviceLogs||[]), { id: uid('HRS'), date: todayISO(), hours: Number(hours), notes: hNotes }] }));
    setHours(''); setHNotes('');
  };

  const exportMonth = () => {
    const lines = [
      `Territory #: ${state.territoryNumber||'—'}`,
      `Month: ${thisMonth}`,
      `Total Hours: ${monthHours}`,
      '',
      ...monthLogs.map(l => `${l.date} — ${l.hours}h${l.notes ? ' — ' + l.notes : ''}`)
    ];
    copyToClipboard(lines.join('\\n'));
    alert('Monthly log copied to clipboard.');
  };

  return (
    <div className='p-4'>
      <h1 className='text-2xl font-bold mb-4'>Home</h1>

      <Section title='Territory & Links' right={<div className='flex gap-2'>
        <a className='px-3 py-2 rounded-xl border' href='https://www.jw.org' target='_blank' rel='noreferrer'>jw.org ↗</a>
        <a className='px-3 py-2 rounded-xl border' href='https://www.jw.org/en/library/jw-library/' target='_blank' rel='noreferrer'>JW Library ↗</a>
      </div>}>
        <div className='grid md:grid-cols-2 gap-3'>
          <Input placeholder='Territory Number (e.g., T-12)' value={state.territoryNumber||''} onChange={e=>setState(s=>({...s, territoryNumber: e.target.value}))} />
          <div className='text-sm opacity-75'>Used in NH export & monthly report.</div>
        </div>
      </Section>

      <Section title='Daily Thought from Conductor' right={<Button onClick={()=>{addDailyThought(thought,setState); setThought('');}}>Save</Button>}>
        <Input placeholder='Main point or scripture (e.g., Be warm & empathetic – Rev 21:4)' value={thought} onChange={e=>setThought(e.target.value)} />
        {todays.length>0 && <div className='mt-3 text-sm opacity-80'><div className='font-medium mb-1'>Today’s note</div><ul className='list-disc ml-6'>{todays.map(t => <li key={t.id}>{t.text}</li>)}</ul></div>}
      </Section>

      <div className='grid md:grid-cols-2 gap-4'>
        <Section title='Log Service Hours' right={<Button className='bg-blue-600 text-white' onClick={addHours}>Add</Button>}>
          <div className='grid grid-cols-3 gap-2 items-center'>
            <div className='col-span-1'><Input type='number' min='0' step='0.25' placeholder='Hours' value={hours} onChange={e=>setHours(e.target.value)} /></div>
            <div className='col-span-2'><Input placeholder='Notes (optional)' value={hNotes} onChange={e=>setHNotes(e.target.value)} /></div>
          </div>
          <div className='mt-2 text-sm opacity-75'>This month: <span className='font-semibold'>{monthHours.toFixed(2)}</span> hours</div>
          <div className='mt-2'><Button onClick={exportMonth}>Copy Monthly Log</Button></div>
        </Section>

        <Section title='Quick Links'><div className='flex flex-wrap gap-2'>{TABS.filter(x=>x!=='Home').map(x => (<Button key={x} onClick={()=>setTab(x)} className='bg-neutral-50 dark:bg-neutral-800'>{x}</Button>))}</div></Section>
      </div>
    </div>
  );
}

function PageTerritory({ state, setState }) {
  const [address, setAddress] = useState('');
  const [personName, setPersonName] = useState('');
  const [status, setStatus] = useState('NH');
  const [scripture, setScripture] = useState('');
  const [literature, setLiterature] = useState('');
  const [notes, setNotes] = useState('');
  const [nhOnly, setNhOnly] = useState(false);

  const recent = [...(state.visits||[])].reverse().slice(0,12);

  const exportNH = () => {
    const text = buildNHText(state, nhOnly);
    copyToClipboard(text);
    alert('NH list copied to clipboard.');
  };

  return (
    <div className='p-4'>
      <h1 className='text-2xl font-bold mb-4'>Territory</h1>
      <Section title='Log a Door'>
        <div className='grid md:grid-cols-2 gap-3'>
          <Input placeholder='Address (e.g., 1410 Amherst)' value={address} onChange={e=>setAddress(e.target.value)} />
          <Input placeholder='Person’s name' value={personName} onChange={e=>setPersonName(e.target.value)} />
          <Select options={['NH','RV','NI','DNC','Vacant','Empty','No Trespassing']} value={status} onChange={setStatus} />
          <Input placeholder='Scripture shared' value={scripture} onChange={e=>setScripture(e.target.value)} />
          <Input placeholder='Literature left (Invitation, Tract, Watchtower, ELF)' value={literature} onChange={e=>setLiterature(e.target.value)} />
          <TextArea placeholder='Notes…' value={notes} onChange={e=>setNotes(e.target.value)} />
        </div>
        <div className='mt-3 flex gap-2'>
          <Button className='bg-blue-600 text-white' onClick={()=>{ addDoorLog({ address, status, scripture, literature, notes, personName }, state, setState); setAddress(''); setPersonName(''); setScripture(''); setLiterature(''); setNotes(''); }}>Save Entry</Button>
          <Button onClick={()=>{ setAddress(''); setPersonName(''); setScripture(''); setLiterature(''); setNotes(''); }}>Clear</Button>
        </div>
      </Section>

      <Section title='Export NH / Follow-up List' right={<div className='flex items-center gap-2'><label className='text-sm flex items-center gap-2'><input type='checkbox' checked={nhOnly} onChange={e=>setNhOnly(e.target.checked)} /> NH only</label><Button onClick={exportNH}>Copy List</Button></div>}>
        <div className='text-sm opacity-75'>Copies a bullet list of today’s doors (default: everything except RV). Share with the territory holder.</div>
      </Section>

      <Section title='Recent Activity'><div className='space-y-2'>{recent.map(v => (<div key={v.id} className='rounded-xl border p-3 border-neutral-200 dark:border-neutral-800'><div className='text-sm opacity-70'>{v.date}</div><div className='font-medium'>{state.households[v.householdId]?.address || '(unknown)'} — <span className='px-2 py-0.5 rounded-full text-xs border'>{v.status}</span></div>{v.personName && <div className='text-sm'>👤 {v.personName}</div>}{(v.scripture||v.literature||v.notes)&&(<div className='text-sm mt-1 opacity-90'>{v.scripture&&<div>📖 {v.scripture}</div>}{v.literature&&<div>📘 {v.literature}</div>}{v.notes&&<div>📝 {v.notes}</div>}</div>)}</div>))}</div></Section>
    </div>
  );
}

function PageReturnVisits({ state, setState }) {
  const [form, setForm] = useState({ personName: '', address: '', lastScripture: '', nextScripture: '', nextVisit: todayISO(), bestTime: '', priority: 'Medium', notes: '' });
  const sorted = [...state.returnVisits].sort((a,b)=> (a.nextVisit||'').localeCompare(b.nextVisit||''));
  const save = () => { if (!form.personName || !form.address) return; setState(s => ({ ...s, returnVisits: [{ id: uid('RV'), ...form }, ...s.returnVisits ] })); setForm({ personName: '', address: '', lastScripture: '', nextScripture: '', nextVisit: todayISO(), bestTime: '', priority: 'Medium', notes: '' }); };
  return (
    <div className='p-4'>
      <h1 className='text-2xl font-bold mb-4'>Return Visits</h1>
      <Section title='Add Return Visit' right={<Button className='bg-blue-600 text-white' onClick={save}>Save</Button>}>
        <div className='grid md:grid-cols-2 gap-3'>
          <Input placeholder='Name' value={form.personName} onChange={e=>setForm(f=>({...f, personName: e.target.value}))} />
          <Input placeholder='Address' value={form.address} onChange={e=>setForm(f=>({...f, address: e.target.value}))} />
          <Input placeholder='Scripture shared last time' value={form.lastScripture} onChange={e=>setForm(f=>({...f, lastScripture: e.target.value}))} />
          <Input placeholder='Next scripture (auto-suggest in Scripture Tool)' value={form.nextScripture} onChange={e=>setForm(f=>({...f, nextScripture: e.target.value}))} />
          <Input type='date' value={form.nextVisit} onChange={e=>setForm(f=>({...f, nextVisit: e.target.value}))} />
          <Input placeholder='Best time (e.g., Weekend mornings)' value={form.bestTime} onChange={e=>setForm(f=>({...f, bestTime: e.target.value}))} />
          <Select options={['High','Medium','Low']} value={form.priority} onChange={v=>setForm(f=>({...f, priority: v}))} />
          <TextArea placeholder='Notes' value={form.notes} onChange={e=>setForm(f=>({...f, notes: e.target.value}))} />
        </div>
      </Section>
      <Section title='Queue (by date)'><div className='space-y-2'>{sorted.map(rv => (<div key={rv.id} className='rounded-xl border p-3 border-neutral-200 dark:border-neutral-800'><div className='flex items-center justify-between'><div className='font-semibold'>{rv.personName} — <span className='opacity-70 font-normal'>{rv.address}</span></div><div className={`text-xs px-2 py-0.5 rounded-full border ${rv.priority==='High'?'border-red-500 text-red-600':rv.priority==='Low'?'border-neutral-400 text-neutral-600':'border-amber-500 text-amber-600'}`}>{rv.priority}</div></div><div className='text-sm mt-1 grid sm:grid-cols-3 gap-2'><div>Next: <span className='font-medium'>{rv.nextVisit || '—'}</span></div><div>Last 📖 {rv.lastScripture || '—'}</div><div>Next 📖 {rv.nextScripture || '(use tool)'}</div></div>{rv.bestTime && <div className='text-sm opacity-80 mt-1'>Best time: {rv.bestTime}</div>}{rv.notes && <div className='text-sm opacity-80 mt-1'>Notes: {rv.notes}</div>}</div>))}</div></Section>
    </div>
  );
}

function PageStudies({ state, setState }) {
  const [name, setName] = useState('');
  const [lesson, setLesson] = useState(1);
  const [nextDate, setNextDate] = useState('');
  const [notes, setNotes] = useState('');
  const add = () => { if (!name) return; setState(s => ({ ...s, studies: [{ id: uid('S'), name, lesson: Number(lesson)||1, nextDate, notes }, ...s.studies ] })); setName(''); setLesson(1); setNextDate(''); setNotes(''); };
  const markDone = (id) => setState(st => ({...st, studies: st.studies.map(x => x.id===id ? {...x, lesson: Number(x.lesson)+1} : x)}));
  return (
    <div className='p-4'>
      <h1 className='text-2xl font-bold mb-4'>Bible Studies</h1>
      <Section title='Add Study' right={<Button className='bg-blue-600 text-white' onClick={add}>Save</Button>}>
        <div className='grid md:grid-cols-2 gap-3'>
          <Input placeholder='Name' value={name} onChange={e=>setName(e.target.value)} />
          <Input type='number' min={1} max={60} value={lesson} onChange={e=>setLesson(e.target.value)} />
          <Input type='date' value={nextDate} onChange={e=>setNextDate(e.target.value)} />
          <TextArea placeholder='Notes' value={notes} onChange={e=>setNotes(e.target.value)} />
        </div>
      </Section>
      <Section title='All Studies'>
        <div className='space-y-2'>
          {state.studies.map(s => (
            <div key={s.id} className='rounded-xl border p-3 border-neutral-200 dark:border-neutral-800'>
              <div className='flex items-center justify-between'>
                <div className='font-semibold'>{s.name}</div>
                <div className='text-sm opacity-75'>Lesson {s.lesson}</div>
              </div>
              <div className='text-sm grid sm:grid-cols-3 gap-2 mt-1'>
                <div>Next: {s.nextDate || '—'}</div>
                <div>Notes: {s.notes || '—'}</div>
                <div><Button onClick={()=>markDone(s.id)} className='text-xs'>Mark Lesson Complete</Button></div>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function PageScriptureTool({ state, setState }) {
  // Defaults / controls
  const MAX_INLINE = 5; // inline suggestions
  const PAGE_SIZE = 25; // modal page size
  const TYPEAHEAD_CAP = 12; // keyword dropdown
  const MIN_CHARS = 2; // search threshold

  // Suggestion graph
  const [lastShared, setLastShared] = useState('Ps 83:18');
  const graph = state.scriptureSuggest || {};
  const key = findRefKey(graph, lastShared);
  const nextSuggestions = key ? (graph[key] || []) : [];

  // Inline + modal handling
  const inlineSuggestions = nextSuggestions.slice(0, MAX_INLINE);
  const extraCount = Math.max(0, nextSuggestions.length - inlineSuggestions.length);
  const [showSugModal, setShowSugModal] = useState(false);
  const [page, setPage] = useState(0);
  const paged = (arr) => arr.slice(page*PAGE_SIZE, page*PAGE_SIZE + PAGE_SIZE);
  useEffect(()=>{ setPage(0); }, [showSugModal, key]);

  // Topic search (quiet until submit)
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 200);
  const [submitted, setSubmitted] = useState(false);

  // Typeahead: combine topic names + scripture keys (no content)
  const keywordOptions = useMemo(() => {
    const topicNames = (state.topicLibrary||[]).map(t=>t.topic);
    const scriptureKeys = Object.keys(graph);
    const all = Array.from(new Set([...topicNames, ...scriptureKeys]));
    const n = dq.toLowerCase();
    if (!n) return [];
    return all.filter(x => x.toLowerCase().includes(n)).slice(0, TYPEAHEAD_CAP);
  }, [dq, state.topicLibrary, graph]);

  // Topic results include: (a) topic title matches, (b) scripture cross-link matches refs
  const topics = useMemo(() => {
    const lib = state.topicLibrary || [];
    if (!submitted || dq.trim().length < MIN_CHARS) return [];

    const needle = dq.trim();
    const nNeedle = normRef(needle);

    const isScriptureLike = /\d?\s?[a-z]+\s?\d+(?::\d+)?/i.test(needle);

    return lib.filter(t => {
      const titleHit = t.topic.toLowerCase().includes(needle.toLowerCase());
      if (titleHit) return true;
      if (!isScriptureLike) return false;
      // scripture-like: try cross-linking via refs
      const refs = Array.isArray(t.refs) ? t.refs : [];
      return refs.some(r => {
        const nr = normRef(r);
        // Accept full match or prefix (book+chapter, chapter:verse prefix)
        return nr === nNeedle || nr.startsWith(nNeedle);
      });
    });
  }, [submitted, dq, state.topicLibrary]);

  const [jsonText, setJsonText] = useState('');
  const importGraph = () => {
    try {
      const data = JSON.parse(jsonText);
      const sug = data.scriptureSuggest || data;
      const lib = data.topicLibrary || state.topicLibrary;
      setState(s=>({ ...s, scriptureSuggest: sug, topicLibrary: lib }));
      setJsonText('');
      alert('Imported. Suggestions updated.');
    } catch {
      alert('Invalid JSON. Expect {scriptureSuggest:{}, topicLibrary: []}');
    }
  };

  return (
    <div className='p-4'>
      <h1 className='text-2xl font-bold mb-4'>Scripture Tool</h1>

      <Section title='Auto-Suggest (based on last scripture)'>
        <div className='grid md:grid-cols-3 gap-3 items-start'>
          <Input value={lastShared} onChange={e=>setLastShared(e.target.value)} placeholder='Last shared (e.g., Psalm 83:18 or Ps 83:18)' />
          <div className='md:col-span-2 space-y-2'>
            {inlineSuggestions.length === 0 ? (
              <div className='opacity-70'>No suggestions found for “{lastShared}”. Try Ps ↔ Psalm, or import a larger graph below.</div>
            ) : (
              <ul className='list-disc ml-5'>
                {inlineSuggestions.map((s,i) => <li key={i}><span className='font-medium'>{s.ref}</span> — {s.why}{s.ask ? ` — Q: ${s.ask}` : ''}</li>)}
              </ul>
            )}
            {extraCount>0 && <Button className='text-sm' onClick={()=>setShowSugModal(true)}>View {extraCount} more…</Button>}
          </div>
        </div>
      </Section>

      <Section title='Search by Concern or Topic'>
        <form onSubmit={(e)=>{ e.preventDefault(); setSubmitted(true); }} className="relative">
          <Input placeholder='Type a keyword (e.g., anxiety, hope)… or a scripture (e.g., Rev 21:4); then press Enter' value={q} onChange={e=>{ setQ(e.target.value); setSubmitted(false); }} />
          {keywordOptions.length>0 && (
            <div className="absolute z-10 mt-1 w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow max-h-64 overflow-auto">
              {keywordOptions.map(opt => (
                <div key={opt} className="px-3 py-2 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800" onClick={()=>{ setQ(opt); setSubmitted(true); }}>
                  {opt}
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 text-xs opacity-70">Results are hidden until you search (min 2 characters or pick a suggestion).</div>
          <div className="mt-2"><Button type="submit" className="text-sm">Search</Button></div>
        </form>

        {submitted && q.trim().length>=2 && (
          <div className='grid md:grid-cols-2 gap-3 mt-3'>
            {topics.length===0 ? <div className="opacity-70">No topics found for “{q}”.</div> : topics.map(t => (
              <div key={t.topic} className='rounded-xl border p-3 border-neutral-200 dark:border-neutral-800'>
                <div className='font-semibold mb-1'>{t.topic}</div>
                <div className='text-sm'><span className='font-medium'>Scriptures:</span> {Array.isArray(t.refs)?t.refs.join(', '):'—'}</div>
                {Array.isArray(t.questions) && t.questions.length>0 && (
                  <div className='text-sm mt-1'><span className='font-medium'>Sample questions:</span>
                    <ul className='list-disc ml-5'>{t.questions.map((qq,i)=>(<li key={i}>{qq}</li>))}</ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title='Import Recommendations (JSON)'>
        <div className='text-sm opacity-75 mb-2'>Paste a JSON object with <code>scriptureSuggest</code> and/or <code>topicLibrary</code>. Large libraries are merged into your local data.</div>
        <TextArea placeholder='{"scriptureSuggest": {"Ps 83:18": [{"ref":"Rev 21:3-4","why":"...","ask":"..."}]}, "topicLibrary": [{"topic":"...","refs":["..."],"questions":["..."]}]}' value={jsonText} onChange={e=>setJsonText(e.target.value)} />
        <div className='mt-2'><Button onClick={importGraph}>Import</Button></div>
      </Section>

      <Modal open={showSugModal} onClose={()=>setShowSugModal(false)} title={`Suggestions for ${key || lastShared}`}
        footer={nextSuggestions.length>PAGE_SIZE && (
          <div className="flex items-center justify-between text-sm">
            <div>Showing {Math.min(page*PAGE_SIZE+1, nextSuggestions.length)}–{Math.min((page+1)*PAGE_SIZE, nextSuggestions.length)} of {nextSuggestions.length}</div>
            <div className="flex gap-2">
              <Button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0}>Prev</Button>
              <Button onClick={()=>setPage(p=>((p+1)*PAGE_SIZE<nextSuggestions.length)?p+1:p)} disabled={(page+1)*PAGE_SIZE >= nextSuggestions.length}>Next</Button>
            </div>
          </div>
        )}
      >
        {nextSuggestions.length===0 ? <div className="opacity-70">No suggestions.</div> : (
          <ul className="space-y-2">
            {paged(nextSuggestions).map((s,i)=>(
              <li key={i} className="border rounded-xl p-3 border-neutral-200 dark:border-neutral-800">
                <div className="font-medium">{s.ref}</div>
                <div className="text-sm opacity-80">{s.why}</div>
                {s.ask && <div className="text-sm mt-1">Q: {s.ask}</div>}
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}

// -------------------- Stats --------------------
function Stats({ state }) {
  const today = todayISO();
  const todays = (state.visits||[]).filter(v => v.date === today);
  const countBy = (k) => todays.filter(v => v.status === k).length;
  return (
    <div className='grid grid-cols-2 md:grid-cols-4 gap-3'>
      <StatCard label='Visits Today' value={todays.length} />
      <StatCard label='NH' value={countBy('NH')} />
      <StatCard label='RV Logged' value={countBy('RV')} />
      <StatCard label='NI/DNC' value={countBy('NI') + countBy('DNC')} />
    </div>
  );
}
const StatCard = ({ label, value }) => (
  <div className='rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 text-center bg-white/70 dark:bg-neutral-900'>
    <div className='text-2xl font-bold'>{value}</div>
    <div className='text-sm opacity-70'>{label}</div>
  </div>
);

// -------------------- App --------------------
export default function App() {
  const [state, setState] = useLocalState('fsapp_state_v3', SEED);
  const [tab, setTab] = useLocalState('fsapp_tab', 'Home');

  // Auto-load large suggestions JSON if available
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/data/suggestions.json", { cache: "no-cache" });
        if (!res.ok) return;
        const data = await res.json();
        const sug = data.scriptureSuggest || {};
        const lib = data.topicLibrary || [];
        setState(s => ({
          ...s,
          scriptureSuggest: { ...(s.scriptureSuggest||{}), ...sug },
          topicLibrary: [ ...(s.topicLibrary||[]), ...lib ],
        }));
      } catch (e) {
        console.warn("Could not load suggestions.json", e);
      }
    })();
  }, [setState]);

  return (
    <div className="min-h-[100vh] bg-neutral-100 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      <div className="max-w-5xl mx-auto">
        <nav className="sticky top-0 z-10 backdrop-blur bg-neutral-100/70 dark:bg-neutral-950/70 border-b border-neutral-200/60 dark:border-neutral-800">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="text-xl font-bold">Field Service — App</div>
            <div className="flex gap-1 overflow-x-auto">
              {TABS.map(t => (
                <Button key={t} onClick={()=>setTab(t)} className={`text-sm ${tab===t?'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900':'bg-neutral-50 dark:bg-neutral-800'}`}>{t}</Button>
              ))}
            </div>
          </div>
        </nav>

        {tab==='Home' && <PageHome state={state} setState={setState} setTab={setTab} />}
        {tab==='Territory' && <PageTerritory state={state} setState={setState} />}
        {tab==='Return Visits' && <PageReturnVisits state={state} setState={setState} />}
        {tab==='Bible Studies' && <PageStudies state={state} setState={setState} />}
        {tab==='Scripture Tool' && <PageScriptureTool state={state} setState={setState} />}

        <footer className="px-4 py-10 text-center opacity-60 text-sm">Local-only demo. Your entries persist in this browser.</footer>
      </div>
    </div>
  );
}
