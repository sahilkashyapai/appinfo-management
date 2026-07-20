# AII Celebrations Platform — MERN

Full-stack MongoDB/Express/React/Node rebuild of the original static `AII_Celebrations_Platform.html` mock. Every page and interaction from the original file (auth, dashboard, employees, birthdays, anniversaries, events + RSVP, celebration wall, calendar, announcements, departments, holidays, reports, audit logs, settings, profile) is now backed by a real MongoDB database instead of hardcoded JS arrays.

`AII_Celebrations_Platform.html` is left untouched in the repo root as a reference for the original design.

## Stack

- **Backend** (`server/`): Express, Mongoose, JWT auth (bcrypt-hashed passwords), TOTP 2FA (otplib), Nodemailer, node-cron.
- **Frontend** (`client/`): React 18 + Vite, react-router-dom, @tanstack/react-query, axios. The original CSS was ported verbatim so the UI is pixel-identical.
- **Database**: MongoDB Atlas (cloud) — bring your own connection string.

## 1. Install dependencies

```bash
npm run install:all
```

(equivalent to `npm install` in both `server/` and `client/`)

## 2. Configure environment variables

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Edit `server/.env`:

- `MONGODB_URI` — your MongoDB Atlas connection string (Atlas dashboard → Connect → Drivers). Any free-tier cluster works.
- `JWT_SECRET` — any long random string.
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM_EMAIL` / `SMTP_FROM_NAME` — real SMTP credentials (e.g. a Gmail address + [app password](https://myaccount.google.com/apppasswords)) so birthday/anniversary/event emails actually send. If left blank, emails are logged to the server console instead of sent — everything else still works.
- `SEED_SUPERADMIN_EMAIL` / `SEED_SUPERADMIN_PASSWORD` — only used by the seed script; defaults to `superadmin@aii.in` / `Admin@123`.

`client/.env` just needs `VITE_API_URL` (defaults to `http://localhost:5000/api`, fine for local dev).

## 3. Seed the database

```bash
npm run seed
```

This **wipes and repopulates** every collection with demo data: 8 departments, 12 named employees (ported from the original mock) + 40 generated ones spread across departments, 6 events with realistic RSVPs, sample wall posts/comments/reactions, notifications, 4 announcements, 10 holidays, a few audit log entries, and default settings.

It also prints the seeded login credentials:

- **Super Admin**: `superadmin@aii.in` / `Admin@123` (or whatever you set in `.env`)
- **HR** (Priya Nair): `priya.nair@aii.in` / `Welcome@123`
- **Manager** (Vijay Kumar): `vijay.kumar@aii.in` / `Welcome@123`
- **Employee** (Rahul Sharma): `rahul.sharma@aii.in` / `Welcome@123`

Rahul Sharma's birthday and Rohit Mehta's join-anniversary are rewritten to *today's* month/day at seed time, so "Today's Birthdays" / "Today's Anniversaries" have something to show immediately, regardless of when you run the seed.

Re-running `npm run seed` at any time fully resets the data.

## 4. Run the app

```bash
npm run dev
```

Runs both servers concurrently: API on `http://localhost:5000`, client on `http://localhost:5173`.

Or separately: `npm run dev:server` / `npm run dev:client`.

## Notes on scope decisions

- **Real counts, not marketing copy.** The original mock hardcoded numbers like "248 employees" that never matched what was actually rendered. Every count in this app (employee totals, department headcounts, RSVP tallies, notification counts, etc.) is a live aggregate from MongoDB.
- **CSRF toggle is informational.** Auth uses a Bearer JWT (`Authorization` header), not cookies, so the classic double-submit-cookie CSRF defense the Settings page advertises isn't an applicable attack vector here. The toggle is stored and shown for parity with the original mock's Settings page but doesn't gate any middleware.
- **2FA is real.** Enabling it from the Profile page actually requires a TOTP code (Google Authenticator, Authy, etc.) on every subsequent login.
- **Account lockout** (5 failed attempts → 30 min) and **audit logging** are both real and toggleable from Settings.
- **Cron jobs** run daily at 08:00 (birthdays/anniversaries → notification + optional email) and 09:00 (event D-7/D-1 reminders → notification).

## Project structure

```
server/src/
  models/        11 Mongoose schemas (User, Employee, Department, Event, Rsvp, WallPost, Notification, Announcement, Holiday, AuditLog, Settings)
  controllers/    one per resource
  routes/         one per resource, mounted under /api
  middleware/     JWT auth + role guard, error handler
  services/       Nodemailer email service, node-cron jobs
  seed/           demo data + seed script
client/src/
  pages/          one per sidebar page (14 total) + Login
  components/     Sidebar, Header, drawers/modals shared across pages
  context/        Auth, Theme (dark mode), Toast, Drawer (employee/RSVP overlays)
  styles/         global.css — ported verbatim from the original mock
```
