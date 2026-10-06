# Deploying AI Connect

AI Connect runs on the company server at **https://ai-connect.dev.appinfoinc.com**.

One Node.js process (`server/`) serves everything on one origin:

- the React app, built into `client/dist`
- the REST API under `/api`
- the chat WebSocket under `/socket.io`

A reverse proxy (nginx or IIS) in front of it terminates HTTPS. The database is MySQL, managed by the DB team.

```
browser ──HTTPS──▶ nginx / IIS (TLS) ──HTTP──▶ node server/src/server.js :5000 ──▶ MySQL
```

## Requirements

| What | Version / value |
|---|---|
| Node.js | 20 LTS or newer (developed on Node 24) |
| MySQL | 8.0.13+ (8.4 LTS preferred), utf8mb4, `max_allowed_packet` ≥ 64M, UTC. Provided by the DB team. |
| Reverse proxy | nginx (example in `deploy/nginx/`) or IIS with URL Rewrite + ARR + WebSocket Protocol |
| TLS certificate | for `ai-connect.dev.appinfoinc.com` |
| Outbound SMTP | for email notifications (optional; mails are only logged if SMTP is unset) |

## `server/.env` (production)

Copy `server/.env.example` to `server/.env` on the server and set:

```ini
NODE_ENV=production
PORT=5000
SERVE_CLIENT=true
CLIENT_ORIGIN=https://ai-connect.dev.appinfoinc.com
TRUST_PROXY=loopback            # proxy on the same host; else its IP/subnet

DATABASE_URL=mysql://appinfo_app:<password>@<mysql-host>:3306/appinfo?connection_limit=10
JWT_SECRET=<long random string>  # e.g. node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_EXPIRES_IN=8h

SMTP_HOST=...  SMTP_PORT=587  SMTP_SECURE=false  SMTP_USER=...  SMTP_PASS=...
SMTP_FROM_EMAIL=...  SMTP_FROM_NAME=Applied Information India

VAPID_PUBLIC_KEY=...  VAPID_PRIVATE_KEY=...  VAPID_SUBJECT=mailto:...   # browser push (optional)
```

- **`CLIENT_ORIGIN`** is also the base URL for links in notification emails.
- **`.env` and secrets stay on the server only.** Don't put them in git.
- **Don't set `VITE_API_URL` when building the client.** The production build calls `/api` on its own domain.
- **`MONGODB_URI`** is only needed for the one-off data copy at cutover (see below).

## First install

```bash
git clone <repo> /opt/ai-connect && cd /opt/ai-connect
npm install --prefix server
npm install --prefix client
npm run db:generate --prefix server    # Prisma client (npm blocks install scripts, so this is explicit)
npm run build                          # builds client/dist
# create server/.env as above
npm run db:migrate                     # creates/updates the MySQL tables (prisma migrate deploy)
```

Run `db:migrate` with an account that can create and alter tables. The running app only needs `SELECT, INSERT, UPDATE, DELETE`. If the DB team gives you two accounts, run this one command with the migration account's `DATABASE_URL`.

Then start the service and the proxy:

- **Linux:** follow the steps at the top of `deploy/systemd/ai-connect.service` and `deploy/nginx/ai-connect.conf`.
- **Windows Server:** run `node src/server.js` from `server/` as a service (NSSM, or pm2 with pm2-windows-service). In IIS, enable **WebSocket Protocol**, then add a reverse-proxy rule (URL Rewrite + ARR) from the site to `http://127.0.0.1:5000`. Set `maxAllowedContentLength` to at least 15 MB.

Check that it works:

```bash
curl -s https://ai-connect.dev.appinfoinc.com/api/health   # {"status":"ok"}
```

After that, log in as the superadmin. Open Messages to confirm chat connects, because that needs WebSocket proxying.

## Updating to a new version

```bash
cd /opt/ai-connect && git pull
npm install --prefix server && npm install --prefix client
npm run db:generate --prefix server
npm run build
npm run db:migrate          # applies any new migrations; safe to run when there are none
sudo systemctl restart ai-connect      # or restart the Windows service
```

## Operational notes

- **Run exactly one instance.** Scheduled jobs run inside the app process: birthdays at 08:00, event reminders at 09:00, the timer auto-stop every 15 minutes, and the holiday rollover on 1 December. A second instance would send duplicate notifications and emails.
- **Time zone.** The jobs fire at server-local time, so set the server's time zone to IST (`Asia/Kolkata`). Data is stored in UTC regardless.
- **Uploads live in MySQL**, as base64 inside rows. There is no upload folder to back up, but database backups grow with uploads.
- **Logs** go to stdout/stderr: use `journalctl -u ai-connect` on Linux, or the service manager's log on Windows.
- **Health check:** `GET /api/health`.

## One-time cutover from MongoDB

Use this only when moving the existing data across.

1. Stop the old app so nothing writes to MongoDB.
2. With `MONGODB_URI` and the new `DATABASE_URL` both in `server/.env`, run `npm run db:copy-from-mongo --prefix server`. It reads MongoDB without changing it and writes everything to MySQL in one transaction. It prints a count per table and every reference it had to drop. Run it against an empty database.
3. Check the counts, start AI Connect, then remove `MONGODB_URI` from `.env` once the move is signed off.
