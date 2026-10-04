// ---------- Pure logic (all calculations in minutes) ----------
const NORMAL = 420, MIN = 240, KEY = 'attendance_v1', SKEY = 'attendance_weekend';

const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const round15 = m => Math.ceil(m / 15) * 15;                 // fingerprint rounds UP to quarter
const hhmm = m => { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const dur = m => (m < 0 ? '-' : '') + Math.floor(Math.abs(m) / 60) + 'h ' + String(Math.abs(m) % 60).padStart(2, '0') + 'm';
const bal = m => (m > 0 ? '+' : '') + dur(m);
const pad = n => String(n).padStart(2, '0');
const fmt = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayStr = () => fmt(new Date());

function worked(r) {                                          // minutes worked, or null if incomplete/day off
  if (!r || r.off || !r.entry || !r.exit) return null;
  const t = round15(toMin(r.exit)) - round15(toMin(r.entry));
  return t > 0 ? t : null;
}
function periodOf(dateStr) {                                  // 16th -> 15th of next month
  const d = parse(dateStr);
  const s = d.getDate() >= 16 ? new Date(d.getFullYear(), d.getMonth(), 16) : new Date(d.getFullYear(), d.getMonth() - 1, 16);
  const e = new Date(s.getFullYear(), s.getMonth() + 1, 15);
  return { start: fmt(s), end: fmt(e) };
}
function shiftPeriod(p, n) { const s = parse(p.start); return periodOf(fmt(new Date(s.getFullYear(), s.getMonth() + n, 16))); }
function summary(records, p, weekend) {
  const recs = records.filter(r => r.date >= p.start && r.date <= p.end);
  const done = recs.filter(r => worked(r) !== null);
  const total = done.reduce((a, r) => a + worked(r), 0);
  const expected = done.length * NORMAL;
  let planned = 0;                                            // full-period target: working days minus days off
  for (let d = parse(p.start); fmt(d) <= p.end; d.setDate(d.getDate() + 1)) {
    const off = recs.some(r => r.date === fmt(d) && r.off);
    if (!weekend.includes(d.getDay()) && !off) planned++;
  }
  return { recs, days: done.length, total, expected, balance: total - expected, planned: planned * NORMAL, offs: recs.filter(r => r.off).length };
}
if (typeof module !== 'undefined') module.exports = { round15, worked, hhmm, dur, bal, periodOf, summary };

// ---------- UI ----------
if (typeof document !== 'undefined') {
  const $ = id => document.getElementById(id);
  let data = [], weekend = [0, 6], view = periodOf(todayStr());
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (Array.isArray(d)) data = d; } catch (e) {}
  try { const w = localStorage.getItem(SKEY); if (w) weekend = w.split(',').map(Number); } catch (e) {}
  const save = () => localStorage.setItem(KEY, JSON.stringify(data));
  const cls = n => n > 0 ? 'pos' : n < 0 ? 'neg' : '';

  function upsert(rec) {
    data = data.filter(r => r.date !== rec.date); data.push(rec);
    data.sort((a, b) => a.date.localeCompare(b.date)); save();
  }

  function preview() {
    const en = $('entry').value, ex = $('exit').value, el = $('preview'); let h = '';
    if (en) {
      const e = round15(toMin(en));
      h += `<div>Entry counted as <b>${hhmm(e)}</b></div>
        <div><b>4h target → ${hhmm(e + MIN)}</b></div><div><b>7h target → ${hhmm(e + NORMAL)}</b></div>`;
    }
    if (en && ex) {
      const t = worked({ entry: en, exit: ex });
      if (t === null) h += '<div class="neg">Exit must be after entry.</div>';
      else h += `<div>Exit counted as <b>${hhmm(round15(toMin(ex)))}</b></div>
        <div>Today's total: <b>${dur(t)}</b></div>
        <div>Today's balance: <b class="${cls(t - NORMAL)}">${bal(t - NORMAL)}</b></div>
        <div class="${t >= MIN ? 'pos' : 'neg'}">${t >= MIN ? '✓ 4h minimum met' : '✗ Below 4h minimum'}</div>`;
    }
    el.innerHTML = h;
  }

  function render() {
    $('period').textContent = view.start + ' → ' + view.end;
    const s = summary(data, view, weekend), rec = data.find(r => r.date === todayStr());
    const tw = worked(rec);
    $('dash').innerHTML = `
      <div class="stat big"><span>Current balance</span><b class="${cls(s.balance)}">${bal(s.balance)}</b></div>
      <div class="stat"><span>Total worked</span><b>${dur(s.total)}</b></div>
      <div class="stat"><span>Expected</span><b>${dur(s.expected)}</b></div>
      <div class="stat"><span>Workdays</span><b>${s.days}</b></div>
      <div class="stat"><span>Today's hours</span><b>${tw === null ? '—' : dur(tw)}</b></div>
      <div class="stat"><span>Days off</span><b>${s.offs}</b></div>
      <div class="stat"><span>Full period target</span><b>${dur(s.planned)}</b></div>`;
    let st = '';
    if (rec && rec.off) st = 'Today is a day off.';
    else if (tw !== null) st = tw >= MIN ? '<span class="pos">✓ Today: 4h minimum met</span>' : '<span class="neg">✗ Today: below 4h minimum</span>';
    else if (rec && rec.entry) { const e = round15(toMin(rec.entry)); st = `Today in progress — 4h at ${hhmm(e + MIN)}, 7h at ${hhmm(e + NORMAL)}`; }
    else st = 'No entry for today yet.';
    $('todayStatus').innerHTML = st;

    const rows = s.recs.slice().reverse().map(r => {
      const t = worked(r);
      const total = r.off ? '<span class="tag">Day off</span>' : t === null ? '—' : dur(t) + (t < MIN ? ' <span class="tag bad">Below 4h minimum</span>' : '');
      const b = t === null ? '—' : `<span class="${cls(t - NORMAL)}">${bal(t - NORMAL)}</span>`;
      return `<tr><td>${r.date}</td><td>${r.entry || '—'}</td><td>${r.exit || '—'}</td><td>${total}</td><td>${b}</td>
        <td><button data-e="${r.date}">Edit</button> <button data-d="${r.date}">Delete</button></td></tr>`;
    }).join('');
    $('rows').innerHTML = rows || '<tr><td colspan="6" class="empty">No records in this period yet.</td></tr>';
    $('weekend').value = weekend.join(',');
  }

  const fill = r => { $('date').value = r.date; $('entry').value = r.entry || ''; $('exit').value = r.exit || ''; $('formTitle').textContent = 'Edit day'; preview(); };
  const resetForm = () => { $('date').value = todayStr(); $('entry').value = ''; $('exit').value = ''; $('formTitle').textContent = 'Add day'; preview(); };

  $('entry').oninput = $('exit').oninput = preview;
  $('date').onchange = () => {
    const r = data.find(x => x.date === $('date').value);
    if (r) fill(r); else { $('entry').value = ''; $('exit').value = ''; $('formTitle').textContent = 'Add day'; preview(); }
  };
  $('save').onclick = () => {
    const date = $('date').value, entry = $('entry').value, exit = $('exit').value;
    if (!date || !entry) return alert('Enter a date and an entry time.');
    if (exit && worked({ entry, exit }) === null) return alert('Exit must be after entry.');
    upsert({ date, entry, exit: exit || '' }); view = periodOf(date); resetForm(); render();
  };
  $('dayoff').onclick = () => {
    const date = $('date').value; if (!date) return alert('Pick a date first.');
    upsert({ date, off: true }); view = periodOf(date); resetForm(); render();
  };
  $('reset').onclick = resetForm;
  $('rows').onclick = e => {
    const ed = e.target.dataset.e, de = e.target.dataset.d;
    if (ed) { fill(data.find(r => r.date === ed)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    if (de && confirm('Delete ' + de + '?')) { data = data.filter(r => r.date !== de); save(); render(); }
  };
  $('prev').onclick = () => { view = shiftPeriod(view, -1); render(); };
  $('next').onclick = () => { view = shiftPeriod(view, 1); render(); };
  $('weekend').onchange = e => { weekend = e.target.value.split(',').map(Number); localStorage.setItem(SKEY, e.target.value); render(); };

  $('export').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = 'attendance-' + todayStr() + '.json'; a.click(); URL.revokeObjectURL(a.href);
  };
  $('importBtn').onclick = () => $('importFile').click();
  $('importFile').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        if (!Array.isArray(d) || !d.every(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date))) throw 0;
        if (!confirm('Replace current data with ' + d.length + ' imported records?')) return;
        data = d.sort((a, b) => a.date.localeCompare(b.date)); save(); render();
      } catch (err) { alert('Invalid backup file.'); }
    };
    rd.readAsText(f); e.target.value = '';
  };
  $('clear').onclick = () => { if (confirm('Delete ALL records? This cannot be undone.')) { data = []; save(); render(); } };

  resetForm(); render();
}
