# 🏢 Office Attendance Tracker v2 (Web)

Attendance system with **two roles**, **departments with their own time windows**, and **webcam photo proof**.

## 🔐 Roles
- **Admin** — full control: add/rename/remove employees, set/reset their passwords, manage departments & time windows, stamp anyone, see the full log + photos + monthly summary.
- **Employee** — logs in with their own password, sees ONLY their own row, can only check **themselves** in/out (with webcam photo), and view their own history. They cannot add, rename, or see other people's records.

## 🏷 Departments & time windows
Departments (Sales, Developers, Graphics Design, …) each have their **own** time windows. Defaults seeded on first run — change anything in the admin UI (Departments tab):

| Department | Windows |
|---|---|
| Sales | Morning 07:00–15:30 · Afternoon 14:30–23:00 · Night 23:00–07:00 |
| Developers | General 10:00–19:00 |
| Graphics Design | General 10:00–19:00 |

Each window has its own grace period (default 15 min). LATE/PRESENT is judged against the **employee's assigned window**. Night windows wrap midnight correctly.

---

## 🚀 Deploy to Vercel

1. Upload this folder to a GitHub repo (or use `npx vercel` from the folder — no GitHub needed).
2. Vercel → Add New → Project → import → Deploy.
3. Project → **Storage** → Create Database → **Postgres (Neon)** → connect.
4. **Settings → Environment Variables**, add:
   - `ADMIN_PASSWORD` = your admin password  *(default if unset: `admin123` — change it!)*
   - `AUTH_SECRET` = any long random text (signs the login cookies)
   - `OFFICE_IPS` = your office public IP — leave unset while testing, set before real use
5. Redeploy, then visit `https://your-app.vercel.app/api/init` once.
6. Open the site → login as **Admin** → Departments tab (adjust windows) → Employees tab (add people with passwords) → done.

### Local testing
```bash
npm install
npx vercel env pull .env.local
npm run dev   # visit http://localhost:3000/api/init once, then login (admin123)
```

---

## ✅ Testing checklist
- [ ] `/api/init` returns ok
- [ ] Admin login works; wrong password rejected
- [ ] Add a department + a custom time window (e.g. Developers 10:00–19:00)
- [ ] Add an employee with a password, assigned to that window
- [ ] Logout → login as that employee → they see ONLY themselves, no admin tabs
- [ ] Employee checks in within grace → PRESENT; after grace → LATE with minutes
- [ ] Employee CANNOT open admin data (try /api/employees while logged in as employee → 403)
- [ ] Rename an employee (Employees tab → ✏️) → name updates everywhere, history intact
- [ ] Reset an employee's password → old password stops working
- [ ] Night window: in at night, out next morning → hours wrap correctly
- [ ] Photos open from the Log tab (admin only)
- [ ] Set `OFFICE_IPS` → site blocked from mobile data, works from office Wi-Fi

## 📝 Notes
- Sessions last 12 hours, stored as signed httpOnly cookies.
- Employee passwords are stored hashed, never in plain text. If someone forgets one, admin resets it (there's no "view password").
- Removing an employee is a soft delete — history stays in the log.
- Photos live in the database (fine for testing/small teams); move to Vercel Blob if it grows.
