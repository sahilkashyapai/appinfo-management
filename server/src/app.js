const fs = require('fs');
const path = require('path');
const express = require('express');
require('./middleware/asyncErrors'); // must load before any route handles a request
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { notFound, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const eventRoutes = require('./routes/eventRoutes');
const wallRoutes = require('./routes/wallRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const announcementRoutes = require('./routes/announcementRoutes');
const holidayRoutes = require('./routes/holidayRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const reportRoutes = require('./routes/reportRoutes');
const auditRoutes = require('./routes/auditRoutes');
const searchRoutes = require('./routes/searchRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const profileRoutes = require('./routes/profileRoutes');
const registrationRoutes = require('./routes/registrationRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const chatRoutes = require('./routes/chatRoutes');
const timeTrackingRoutes = require('./routes/timeTrackingRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const pushRoutes = require('./routes/pushRoutes');
const documentRoutes = require('./routes/documentRoutes');
const assetRoutes = require('./routes/assetRoutes');
const adminRoutes = require('./routes/adminRoutes');
const jobApplicationRoutes = require('./routes/jobApplicationRoutes');
const demoDataRoutes = require('./routes/demoDataRoutes');
const payrollRoutes = require('./routes/payrollRoutes');
const salaryQueryRoutes = require('./routes/salaryQueryRoutes');
const bankDetailRequestRoutes = require('./routes/bankDetailRequestRoutes');

const app = express();

// Behind the company reverse proxy (nginx/IIS), so req.ip, req.protocol and
// secure cookies come from X-Forwarded-*. 'loopback' trusts a proxy on the same
// host; set TRUST_PROXY to the proxy's IP/subnet if it runs elsewhere.
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback');

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        // Avatars, logos and uploaded files are base64 data: URLs; exports and
        // previews use blob: URLs; PDFs are previewed in an iframe.
        'img-src': ["'self'", 'data:', 'blob:'],
        'frame-src': ["'self'", 'data:', 'blob:'],
      },
    },
  })
);
// In development, allow any localhost port (Vite may fall back to 5174, 5175, ... if 5173 is busy).
const corsOrigin =
  process.env.NODE_ENV === 'production' ? process.env.CLIENT_ORIGIN : [process.env.CLIENT_ORIGIN, /^http:\/\/localhost:\d+$/].filter(Boolean);
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '10mb' })); // raised from the 100kb default for base64 profile photos + chat attachments
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/wall', wallRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/registrations', registrationRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/time-tracking', timeTrackingRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/admins', adminRoutes);
app.use('/api/job-applications', jobApplicationRoutes);
app.use('/api/demo-data', demoDataRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/salary-queries', salaryQueryRoutes);
app.use('/api/bank-detail-requests', bankDetailRequestRoutes);

// Production: the built React app (client/dist) is served by this same
// process, so the UI, /api and the chat socket share one origin
// (e.g. https://ai-connect.dev.appinfoinc.com) and no CORS is involved.
const clientDist = process.env.CLIENT_DIST || path.join(__dirname, '../../client/dist');
if (process.env.SERVE_CLIENT === 'true') {
  if (!fs.existsSync(path.join(clientDist, 'index.html'))) {
    throw new Error(`SERVE_CLIENT=true but ${clientDist}/index.html is missing - run \`npm run build\` in client/ first.`);
  }
  app.use(
    express.static(clientDist, {
      index: false,
      // Vite's output folder is dist/assets, which shares its name with the
      // /assets page; without this, loading /assets redirects to /assets/.
      redirect: false,
      setHeaders(res, filePath) {
        // Vite fingerprints everything under assets/, so it can be cached for good;
        // everything else (index.html, sw.js, manifest) must be revalidated.
        const immutable = filePath.includes(`${path.sep}assets${path.sep}`);
        res.setHeader('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    })
  );
  // Client-side routes (/employees, /leave, ...) all load the SPA shell.
  app.get(/^\/(?!api\/|socket\.io\/).*/, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;
module.exports.corsOrigin = corsOrigin;
