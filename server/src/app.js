const express = require('express');
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

const app = express();

app.use(helmet());
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

app.use(notFound);
app.use(errorHandler);

module.exports = app;
module.exports.corsOrigin = corsOrigin;
