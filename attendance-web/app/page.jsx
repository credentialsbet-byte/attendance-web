'use client';
import { useEffect, useRef, useState } from 'react';

const fmt = (t) => {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
const fmtWin = (s, e) => (s && e ? `${fmt(s + ':00')} – ${fmt(e + ':00')}` : '— not set —');

export default function Home() {
  const [me, setMe] = useState(undefined);
  useEffect(() => { fetch('/api/auth').then((r) => r.json()).then(setMe); }, []);
  const logout = async () => { await fetch('/api/auth', { method: 'DELETE' }); setMe(null); };

  if (me === undefined) return <div className="wrap"><div className="card">Loading…</div></div>;
  if (!me) return <Login onDone={setMe} />;
  return me.role === 'admin' ? <Admin onLogout={logout} /> : <EmployeeView me={me} onLogout={logout} />;
}

/* ---------------- LOGIN ---------------- */
function Login({ onDone }) {
  const [role, setRole] = useState('employee');
  const [emps, setEmps] = useState([]);
  const [empId, setEmpId] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { fetch('/api/auth?list=1').then((r) => r.json()).then((l) => { setEmps(l); if (l[0]) setEmpId(l[0].id); }); }, []);

  const login = async () => {
    setErr('');
    const r = await fetch('/api/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(role === 'admin' ? { role, password: pw } : { role, empId: Number(empId), password: pw }),
    });
    const j = await r.json();
    if (!r.ok) return setErr(j.error || 'Login failed');
    onDone(j);
  };

  return (
    <div className="wrap" style={{ maxWidth: 460 }}>
      <header className="bar"><h1>🏢 Office Attendance</h1></header>
      <div className="card">
        <div className="tabs" style={{ marginBottom: 14 }}>
          <button className={role === 'employee' ? 'active' : ''} onClick={() => setRole('employee')}>👤 Employee</button>
          <button className={role === 'admin' ? 'active' : ''} onClick={() => setRole('admin')}>🔑 Admin</button>
        </div>
        {role === 'employee' && (
          <select style={{ width: '100%', marginBottom: 10 }} value={empId} onChange={(e) => setEmpId(e.target.value)}>
            {emps.length === 0 && <option value="">No employees yet — admin must add you</option>}
            {emps.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )}
        <input style={{ width: '100%', marginBottom: 12 }} type="password" placeholder="Password"
          value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && login()} />
        <button className="btn btn-blue" style={{ width: '100%', padding: 12 }} onClick={login}>Login</button>
        {err && <div className="error">{err}</div>}
      </div>
    </div>
  );
}

/* ---------------- SHARED: header + camera ---------------- */
function Header({ title, onLogout }) {
  const [now, setNow] = useState('');
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleString('en-GB', {
      timeZone: 'Asia/Dhaka', weekday: 'short', day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id);
  }, []);
  return (
    <header className="bar">
      <h1>{title}</h1>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span className="date">BDT: {now}</span>
        <button className="btn btn-ghost" onClick={onLogout}>Logout</button>
      </div>
    </header>
  );
}

function CameraModal({ info, onCancel, onConfirm }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [shot, setShot] = useState(null);
  const [camErr, setCamErr] = useState('');
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { width: 640 }, audio: false })
      .then((s) => { streamRef.current = s; if (videoRef.current) videoRef.current.srcObject = s; })
      .catch(() => setCamErr('Camera not available or permission denied.'));
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);
  const snap = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = 480; c.height = (v.videoHeight / v.videoWidth) * 480;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    setShot(c.toDataURL('image/jpeg', 0.6));
  };
  return (
    <div className="modal-bg">
      <div className="modal">
        <h3>{info.action === 'in' ? '✅ Check-In' : '🔴 Check-Out'}: {info.name}</h3>
        {!shot ? <video ref={videoRef} autoPlay playsInline muted /> : <img src={shot} alt="snapshot" />}
        {camErr && <div className="error">{camErr}</div>}
        <div className="actions">
          {!shot ? (
            <>
              <button className="btn btn-blue" onClick={snap} disabled={!!camErr}>📷 Take Photo</button>
              {camErr && <button className="btn btn-ghost" onClick={() => onConfirm(null)}>Confirm without photo</button>}
            </>
          ) : (
            <>
              <button className="btn btn-in" onClick={() => onConfirm(shot)}>Confirm & Stamp Time</button>
              <button className="btn btn-ghost" onClick={() => setShot(null)}>Retake</button>
            </>
          )}
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

async function stampApi(empId, action, photo) {
  const r = await fetch('/api/attendance', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ empId, action, photo }),
  });
  const j = await r.json();
  return r.ok ? null : j.error || 'Failed';
}

/* ---------------- EMPLOYEE VIEW ---------------- */
function EmployeeView({ me, onLogout }) {
  const [data, setData] = useState(null);
  const [hist, setHist] = useState(null);
  const [cam, setCam] = useState(null);
  const [err, setErr] = useState('');
  const now = new Date();

  const load = () => {
    fetch('/api/attendance').then((r) => r.json()).then(setData);
    fetch(`/api/log?month=${now.getMonth() + 1}&year=${now.getFullYear()}`).then((r) => r.json()).then(setHist);
  };
  useEffect(() => { load(); }, []);

  const my = data?.rows?.[0];
  const mySum = hist?.summary?.[0];

  const confirm = async (photo) => {
    const e = await stampApi(me.empId, cam.action, photo);
    if (e) setErr(e);
    setCam(null); load();
  };

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <Header title={`👤 ${me.name}`} onLogout={onLogout} />
      <div className="card">
        <h2>Today — {data?.date}</h2>
        {my ? (
          <>
            <p style={{ marginBottom: 6 }}>Department: <b>{my.dept || '—'}</b> · Shift: <b>{my.shift || '—'}</b> ({fmtWin(my.start_t, my.end_t)})</p>
            <p style={{ marginBottom: 14 }}>
              Check-In: <b>{fmt(my.check_in)}</b> {my.has_photo_in && '📷'} · Check-Out: <b>{fmt(my.check_out)}</b> {my.has_photo_out && '📷'} ·{' '}
              <span className={`pill ${my.status || 'ABSENT'}`}>{my.status || 'NOT CHECKED IN'}</span>
              {my.late_min > 0 && ` (${my.late_min} min late)`}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-in" style={{ padding: '14px 26px', fontSize: 15 }} disabled={!!my.check_in}
                onClick={() => setCam({ action: 'in', name: me.name })}>✅ CHECK IN</button>
              <button className="btn btn-out" style={{ padding: '14px 26px', fontSize: 15 }} disabled={!my.check_in || !!my.check_out}
                onClick={() => setCam({ action: 'out', name: me.name })}>🔴 CHECK OUT</button>
            </div>
            {err && <div className="error">{err}</div>}
            <div className="note">A webcam photo is taken as proof of presence. Times are Bangladesh time.</div>
          </>
        ) : <p>Loading…</p>}
      </div>

      <div className="card">
        <h2>📊 My month so far</h2>
        {mySum && (
          <p style={{ marginBottom: 12 }}>
            Present: <b>{mySum.present}</b> · Late: <b>{mySum.late}</b> · Absent: <b>{mySum.absent}</b> · Attendance: <b>{mySum.attendPct}%</b> · Avg hours: <b>{mySum.avgHrs ?? '—'}</b>
          </p>
        )}
        <table>
          <thead><tr><th>Date</th><th>In</th><th>Out</th><th>Status</th><th>Late (min)</th></tr></thead>
          <tbody>
            {hist?.rows?.map((r) => (
              <tr key={r.id}>
                <td>{String(r.day).slice(0, 10)}</td><td>{fmt(r.check_in)}</td><td>{fmt(r.check_out)}</td>
                <td><span className={`pill ${r.status}`}>{r.status}</span></td><td>{r.late_min || ''}</td>
              </tr>
            ))}
            {hist?.rows?.length === 0 && <tr><td colSpan={5} className="muted">No records yet this month.</td></tr>}
          </tbody>
        </table>
      </div>
      {cam && <CameraModal info={cam} onCancel={() => setCam(null)} onConfirm={confirm} />}
    </div>
  );
}

/* ---------------- ADMIN ---------------- */
function Admin({ onLogout }) {
  const [tab, setTab] = useState('today');
  return (
    <div className="wrap">
      <Header title="🔑 Admin — Office Attendance" onLogout={onLogout} />
      <div className="tabs">
        <button className={tab === 'today' ? 'active' : ''} onClick={() => setTab('today')}>📋 Today</button>
        <button className={tab === 'emp' ? 'active' : ''} onClick={() => setTab('emp')}>👥 Employees</button>
        <button className={tab === 'dept' ? 'active' : ''} onClick={() => setTab('dept')}>🏷 Departments & Time Windows</button>
        <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>📊 Log & Summary</button>
      </div>
      {tab === 'today' && <AdminToday />}
      {tab === 'emp' && <AdminEmployees />}
      {tab === 'dept' && <AdminDepts />}
      {tab === 'log' && <AdminLog />}
    </div>
  );
}

function AdminToday() {
  const [data, setData] = useState(null);
  const [cam, setCam] = useState(null);
  const [err, setErr] = useState('');
  const load = () => fetch('/api/attendance').then((r) => r.json()).then(setData);
  useEffect(() => { load(); }, []);
  const confirm = async (photo) => {
    const e = await stampApi(cam.empId, cam.action, photo);
    if (e) setErr(e);
    setCam(null); load();
  };
  return (
    <div className="card">
      <h2>Daily Attendance — {data?.date}</h2>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Employee</th><th>Dept</th><th>Shift / Window</th><th>In</th><th>Out</th><th>Status</th><th>Late</th><th>Action</th></tr></thead>
          <tbody>
            {data?.rows?.map((r) => (
              <tr key={r.id}>
                <td><b>{r.name}</b></td>
                <td>{r.dept || '—'}</td>
                <td>{r.shift || '—'}<div className="muted" style={{ fontSize: 12 }}>{fmtWin(r.start_t, r.end_t)}</div></td>
                <td>{fmt(r.check_in)} {r.has_photo_in && '📷'}</td>
                <td>{fmt(r.check_out)} {r.has_photo_out && '📷'}</td>
                <td><span className={`pill ${r.status || 'ABSENT'}`}>{r.status || 'ABSENT'}</span></td>
                <td>{r.late_min || ''}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn btn-in" disabled={!!r.check_in} onClick={() => setCam({ empId: r.id, name: r.name, action: 'in' })}>IN</button>{' '}
                  <button className="btn btn-out" disabled={!r.check_in || !!r.check_out} onClick={() => setCam({ empId: r.id, name: r.name, action: 'out' })}>OUT</button>
                </td>
              </tr>
            ))}
            {data?.rows?.length === 0 && <tr><td colSpan={8} className="muted">No employees yet — add them in the Employees tab.</td></tr>}
          </tbody>
        </table>
      </div>
      {err && <div className="error">{err}</div>}
      <div className="note">Employees can also log in themselves and check in from their own account — they only see and stamp their own row.</div>
      {cam && <CameraModal info={cam} onCancel={() => setCam(null)} onConfirm={confirm} />}
    </div>
  );
}

function AdminEmployees() {
  const [list, setList] = useState([]);
  const [depts, setDepts] = useState([]);
  const [form, setForm] = useState({ name: '', deptId: '', shiftId: '', password: '' });
  const [err, setErr] = useState('');

  const load = () => {
    fetch('/api/employees').then((r) => r.json()).then(setList);
    fetch('/api/departments').then((r) => r.json()).then(setDepts);
  };
  useEffect(() => { load(); }, []);

  const shiftsOf = (deptId) => depts.find((d) => d.id === Number(deptId))?.shifts || [];

  const add = async () => {
    setErr('');
    const r = await fetch('/api/employees', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, deptId: Number(form.deptId) || null, shiftId: Number(form.shiftId) || null }),
    });
    const j = await r.json();
    if (!r.ok) return setErr(j.error);
    setForm({ name: '', deptId: '', shiftId: '', password: '' });
    load();
  };

  const patch = async (id, body) => {
    const r = await fetch('/api/employees', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...body }),
    });
    const j = await r.json();
    if (!r.ok) alert(j.error);
    load();
  };

  const rename = (e) => {
    const name = prompt('New name for ' + e.name + ':', e.name);
    if (name && name.trim()) patch(e.id, { name });
  };
  const resetPw = (e) => {
    const password = prompt('New password for ' + e.name + ' (min 4 chars):');
    if (password) patch(e.id, { password });
  };
  const remove = async (e) => {
    if (!confirm(`Remove ${e.name}? Their history stays in the log.`)) return;
    await fetch('/api/employees', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: e.id }) });
    load();
  };

  return (
    <div className="card">
      <h2>👥 Employees</h2>
      <div className="row-form" style={{ marginBottom: 16 }}>
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <select value={form.deptId} onChange={(e) => setForm({ ...form, deptId: e.target.value, shiftId: '' })}>
          <option value="">Department…</option>
          {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={form.shiftId} onChange={(e) => setForm({ ...form, shiftId: e.target.value })}>
          <option value="">Time window…</option>
          {shiftsOf(form.deptId).map((s) => <option key={s.id} value={s.id}>{s.name} ({s.start_t}–{s.end_t})</option>)}
        </select>
        <input placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <button className="btn btn-blue" onClick={add}>➕ Add</button>
      </div>
      {err && <div className="error" style={{ marginBottom: 10 }}>{err}</div>}
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Name</th><th>Department</th><th>Time Window</th><th>Actions</th></tr></thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id}>
                <td><b>{e.name}</b></td>
                <td>
                  <select value={e.dept_id || ''} onChange={(ev) => patch(e.id, { deptId: Number(ev.target.value) || null, shiftId: null })}>
                    <option value="">—</option>
                    {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </td>
                <td>
                  <select value={e.shift_id || ''} onChange={(ev) => patch(e.id, { shiftId: Number(ev.target.value) || null })}>
                    <option value="">—</option>
                    {shiftsOf(e.dept_id).map((s) => <option key={s.id} value={s.id}>{s.name} ({s.start_t}–{s.end_t})</option>)}
                  </select>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn btn-ghost" onClick={() => rename(e)}>✏️ Rename</button>{' '}
                  <button className="btn btn-ghost" onClick={() => resetPw(e)}>🔑 Password</button>{' '}
                  <button className="btn btn-ghost" onClick={() => remove(e)}>🗑 Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="note">Give each employee their password — they use it to log in and check themselves in/out (only their own row).</div>
    </div>
  );
}

function AdminDepts() {
  const [depts, setDepts] = useState([]);
  const [newDept, setNewDept] = useState('');
  const [err, setErr] = useState('');
  const load = () => fetch('/api/departments').then((r) => r.json()).then(setDepts);
  useEffect(() => { load(); }, []);

  const act = async (body) => {
    setErr('');
    const r = await fetch('/api/departments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) setErr(j.error);
    load();
  };

  return (
    <>
      <div className="card">
        <h2>🏷 Departments</h2>
        <div className="row-form">
          <input placeholder="New department (e.g. Marketing)" value={newDept} onChange={(e) => setNewDept(e.target.value)} />
          <button className="btn btn-blue" onClick={() => { if (newDept.trim()) { act({ action: 'dept-add', name: newDept }); setNewDept(''); } }}>➕ Add Department</button>
        </div>
        {err && <div className="error">{err}</div>}
      </div>
      {depts.map((d) => <DeptCard key={d.id} d={d} act={act} />)}
    </>
  );
}

function DeptCard({ d, act }) {
  const [f, setF] = useState({ name: '', start: '', end: '', grace: 15 });
  return (
    <div className="card">
      <h2>
        {d.name}{' '}
        <button className="btn btn-ghost" onClick={() => { const n = prompt('Rename department:', d.name); if (n?.trim()) act({ action: 'dept-rename', id: d.id, name: n }); }}>✏️</button>{' '}
        <button className="btn btn-ghost" onClick={() => { if (confirm(`Delete department "${d.name}"?`)) act({ action: 'dept-delete', id: d.id }); }}>🗑</button>
      </h2>
      <table>
        <thead><tr><th>Window Name</th><th>Start</th><th>End</th><th>Grace (min)</th><th></th></tr></thead>
        <tbody>
          {d.shifts.map((s) => <ShiftRow key={s.id} s={s} act={act} />)}
          <tr>
            <td><input style={{ width: 130 }} placeholder="e.g. Morning" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></td>
            <td><input style={{ width: 90 }} placeholder="07:00" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></td>
            <td><input style={{ width: 90 }} placeholder="15:30" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></td>
            <td><input style={{ width: 70 }} type="number" value={f.grace} onChange={(e) => setF({ ...f, grace: Number(e.target.value) })} /></td>
            <td><button className="btn btn-blue" onClick={() => { act({ action: 'shift-add', deptId: d.id, ...f }); setF({ name: '', start: '', end: '', grace: 15 }); }}>➕ Add window</button></td>
          </tr>
        </tbody>
      </table>
      <div className="note">Times are 24-hour HH:MM (BDT). A night window like 23:00 → 07:00 wraps midnight automatically.</div>
    </div>
  );
}

function ShiftRow({ s, act }) {
  const [f, setF] = useState({ name: s.name, start: s.start_t, end: s.end_t, grace: s.grace });
  const dirty = f.name !== s.name || f.start !== s.start_t || f.end !== s.end_t || Number(f.grace) !== s.grace;
  return (
    <tr>
      <td><input style={{ width: 130 }} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></td>
      <td><input style={{ width: 90 }} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></td>
      <td><input style={{ width: 90 }} value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></td>
      <td><input style={{ width: 70 }} type="number" value={f.grace} onChange={(e) => setF({ ...f, grace: Number(e.target.value) })} /></td>
      <td style={{ whiteSpace: 'nowrap' }}>
        {dirty && <button className="btn btn-in" onClick={() => act({ action: 'shift-update', id: s.id, ...f })}>💾 Save</button>}{' '}
        <button className="btn btn-ghost" onClick={() => { if (confirm('Delete this time window?')) act({ action: 'shift-delete', id: s.id }); }}>🗑</button>
      </td>
    </tr>
  );
}

function AdminLog() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState(null);
  const [photo, setPhoto] = useState(null);
  useEffect(() => {
    fetch(`/api/log?month=${month}&year=${year}`).then((r) => r.json()).then(setData);
  }, [month, year]);
  const viewPhoto = async (id, which) => {
    const j = await fetch(`/api/log?photo=${id}&which=${which}`).then((r) => r.json());
    if (j.photo) setPhoto(j.photo);
  };
  return (
    <>
      <div className="card">
        <h2>📊 Monthly Summary</h2>
        <div className="row-form" style={{ marginBottom: 14 }}>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(2000, i).toLocaleString('en', { month: 'long' })}</option>)}
          </select>
          <input type="number" style={{ width: 100 }} value={year} onChange={(e) => setYear(Number(e.target.value))} />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Employee</th><th>Dept</th><th>Shift</th><th>Work Days</th><th>Present</th><th>Late</th><th>Absent</th><th>Late %</th><th>Attend %</th><th>Avg Hrs</th></tr></thead>
            <tbody>
              {data?.summary?.map((s) => (
                <tr key={s.name}>
                  <td><b>{s.name}</b></td><td>{s.dept || '—'}</td><td>{s.shift || '—'}</td><td>{s.workDays}</td>
                  <td>{s.present}</td><td>{s.late}</td><td>{s.absent}</td>
                  <td>{s.latePct}%</td><td>{s.attendPct}%</td><td>{s.avgHrs ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <h2>🗂 Attendance Log</h2>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Date</th><th>Employee</th><th>Dept</th><th>In</th><th>Out</th><th>Status</th><th>Late</th><th>Photos</th></tr></thead>
            <tbody>
              {data?.rows?.map((r) => (
                <tr key={r.id}>
                  <td>{String(r.day).slice(0, 10)}</td><td><b>{r.name}</b></td><td>{r.dept || '—'}</td>
                  <td>{fmt(r.check_in)}</td><td>{fmt(r.check_out)}</td>
                  <td><span className={`pill ${r.status}`}>{r.status}</span></td><td>{r.late_min || ''}</td>
                  <td>
                    {r.has_photo_in && <button className="btn btn-ghost" onClick={() => viewPhoto(r.id, 'in')}>IN 📷</button>}{' '}
                    {r.has_photo_out && <button className="btn btn-ghost" onClick={() => viewPhoto(r.id, 'out')}>OUT 📷</button>}
                  </td>
                </tr>
              ))}
              {data?.rows?.length === 0 && <tr><td colSpan={8} className="muted">No records this month.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {photo && (
        <div className="modal-bg" onClick={() => setPhoto(null)}>
          <div className="modal"><img src={photo} alt="attendance proof" />
            <div className="actions"><button className="btn btn-ghost" onClick={() => setPhoto(null)}>Close</button></div>
          </div>
        </div>
      )}
    </>
  );
}
