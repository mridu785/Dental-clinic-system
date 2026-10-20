/**
 * LumaSmile Dental Studio - Backend Engine & Public Presentation Layer
 * Node.js 24.x Serverless Architecture
 */

const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

const { renderAdminApp } = require('./admin');

const app = express();

// ==========================================
// 1. CONFIGURATION & CONSTANTS
// ==========================================
const CLINIC_CONFIG = {
  name: 'LumaSmile Dental Studio',
  tagline: 'A brighter smile starts with exceptional care.',
  secondaryTagline: 'Gentle dentistry. Confident smiles.',
  address: '24 Orchid Avenue, Downtown, Guwahati, Assam, India — 781001',
  phone: '+91 98765 43210',
  whatsapp: '+91 98765 43210',
  email: 'hello@lumasmile.example',
  timezone: 'Asia/Kolkata',
  currency: 'INR (₹)',
  hours: {
    weekday: '9:00 AM – 7:00 PM',
    saturday: '9:00 AM – 4:00 PM',
    sunday: 'Closed'
  }
};

// Only exactly 3 required environment variables
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/lumasmile';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'localdevpassword';

// ==========================================
// 2. DATABASE CONNECTION POOLING (SERVERLESS)
// ==========================================
let cachedDb = global.mongooseCached;
if (!cachedDb) {
  cachedDb = global.mongooseCached = { conn: null, promise: null };
}

async function connectToDatabase() {
  if (cachedDb.conn) return cachedDb.conn;
  if (!cachedDb.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    };
    cachedDb.promise = mongoose.connect(MONGODB_URI, opts).then(mongooseInstance => mongooseInstance);
  }
  try {
    cachedDb.conn = await cachedDb.promise;
    await ensureSeedData();
  } catch (e) {
    cachedDb.promise = null;
    throw e;
  }
  return cachedDb.conn;
}

// ==========================================
// 3. MONGOOSE SCHEMAS & MODELS
// ==========================================
const ServiceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  durationMinutes: { type: Number, required: true, default: 45 },
  bufferMinutes: { type: Number, default: 15 },
  icon: { type: String, default: '✨' },
  active: { type: Boolean, default: true }
}, { timestamps: true });

const DentistSchema = new mongoose.Schema({
  name: { type: String, required: true },
  title: { type: String, required: true },
  biography: { type: String, required: true },
  qualifications: { type: String, required: true },
  serviceIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Service' }],
  workingHours: {
    start: { type: String, default: '09:00' },
    end: { type: String, default: '19:00' },
    days: { type: [Number], default: [1, 2, 3, 4, 5, 6] } 
  },
  active: { type: Boolean, default: true }
}, { timestamps: true });

const AppointmentSchema = new mongoose.Schema({
  reference: { type: String, required: true, unique: true, index: true },
  patientName: { type: String, required: true, trim: true },
  patientPhone: { type: String, required: true, trim: true },
  patientEmail: { type: String, trim: true, lowercase: true },
  serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
  dentistId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dentist', required: true },
  appointmentStart: { type: Date, required: true, index: true },
  appointmentEnd: { type: Date, required: true, index: true },
  timezone: { type: String, default: 'Asia/Kolkata' },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'completed', 'cancelled'],
    default: 'confirmed',
    index: true
  },
  reason: { type: String, default: '' },
  administrativeNotes: { type: String, default: '' },
  cancelledAt: { type: Date, default: null }
}, { timestamps: true });

// Prevent overlapping bookings atomically
AppointmentSchema.index({ dentistId: 1, appointmentStart: 1, appointmentEnd: 1 });

const AuditLogSchema = new mongoose.Schema({
  actor: { type: String, default: 'system' },
  action: { type: String, required: true },
  resourceType: { type: String, required: true },
  resourceId: { type: String },
  timestamp: { type: Date, default: Date.now }
});

const Service = mongoose.models.Service || mongoose.model('Service', ServiceSchema);
const Dentist = mongoose.models.Dentist || mongoose.model('Dentist', DentistSchema);
const Appointment = mongoose.models.Appointment || mongoose.model('Appointment', AppointmentSchema);
const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);

// ==========================================
// 4. DATABASE SEED LOGIC
// ==========================================
async function ensureSeedData() {
  const serviceCount = await Service.countDocuments();
  if (serviceCount === 0) {
    const defaultServices = [
      { name: 'General Dental Checkup', slug: 'general-checkup', description: 'Comprehensive oral examination, digital low-radiation diagnostics, and gum health evaluation.', price: 800, durationMinutes: 30, icon: '🦷' },
      { name: 'Professional Teeth Cleaning', slug: 'teeth-cleaning', description: 'Gentle ultrasonic scaling to eradicate stubborn plaque, tartar, and surface coffee stains.', price: 1500, durationMinutes: 45, icon: '✨' },
      { name: 'Teeth Whitening', slug: 'teeth-whitening', description: 'Advanced light-activated safe clinical bleaching for up to 6 shades brighter enamel.', price: 7000, durationMinutes: 60, icon: '💎' },
      { name: 'Root Canal Treatment', slug: 'root-canal', description: 'Microscopic, gentle endodontic care crafted to relieve tooth discomfort and preserve natural dentition.', price: 6500, durationMinutes: 60, icon: '🔬' }
    ];
    await Service.insertMany(defaultServices);
  }

  const dentistCount = await Dentist.countDocuments();
  if (dentistCount === 0) {
    const allServices = await Service.find().select('_id');
    const serviceIds = allServices.map(s => s._id);

    const defaultDentists = [
      {
        name: 'Dr. Ananya Sharma',
        title: 'Lead Cosmetic Dentist & Endodontist',
        biography: 'Devoted to patient comfort and minimally invasive micro-dentistry with over 11 years of clinical excellence.',
        qualifications: 'BDS, MDS (Conservative Dentistry & Endodontics)',
        serviceIds: serviceIds,
        workingHours: { start: '09:00', end: '19:00', days: [1, 2, 3, 4, 5, 6] }
      }
    ];
    await Dentist.insertMany(defaultDentists);
  }
}

// ==========================================
// 5. SECURITY, DERIVED KEYS & MIDDLEWARE
// ==========================================
// Derive a stable signing key from the admin password to sign session cookies
// without needing a 4th environment variable.
let derivedSigningKey = null;
function getSessionSecret() {
  if (derivedSigningKey) return derivedSigningKey;
  // Use scrypt to safely derive a 32-byte key from the password
  derivedSigningKey = crypto.scryptSync(ADMIN_PASSWORD, 'LumaSmile_V1_ContextSalt', 32);
  return derivedSigningKey;
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://images.unsplash.com"],
      connectSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '500kb' }));
app.use(express.urlencoded({ extended: true, limit: '500kb' }));

// Use a fallback transient secret for standard cookie parsing, but we manually verify the auth cookie
app.use(cookieParser(crypto.randomBytes(16).toString('hex')));

app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (err) {
    res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Service momentarily unavailable.' } });
  }
});

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many attempts.' } } });
app.use('/api/', apiLimiter);

// ==========================================
// 6. AUTHENTICATION HELPERS
// ==========================================
function secureCredentialCheck(inputUser, inputPass) {
  // Hash inputs and env variables to uniform length buffers to prevent timing side-channel attacks
  const hashInputUser = crypto.createHash('sha256').update(inputUser || '').digest();
  const hashEnvUser = crypto.createHash('sha256').update(ADMIN_USERNAME).digest();
  
  const hashInputPass = crypto.createHash('sha256').update(inputPass || '').digest();
  const hashEnvPass = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();

  const userMatch = crypto.timingSafeEqual(hashInputUser, hashEnvUser);
  const passMatch = crypto.timingSafeEqual(hashInputPass, hashEnvPass);

  return userMatch && passMatch;
}

function generateAuthToken(username) {
  const expires = Date.now() + (24 * 60 * 60 * 1000); // 24H
  const payload = `${username}:${expires}`;
  const hmac = crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64');
}

function verifyAuthToken(token) {
  if (!token) return null;
  try {
    const raw = Buffer.from(token, 'base64').toString('utf-8');
    const [username, expires, signature] = raw.split(':');
    if (!username || !expires || !signature) return null;
    
    if (Date.now() > Number(expires)) return null;

    const payload = `${username}:${expires}`;
    const expectedSig = crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('hex');
    
    if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return { username };
    }
    return null;
  } catch {
    return null;
  }
}

function requireAdminAuth(req, res, next) {
  const token = req.cookies.lumasmile_admin_token || req.headers['x-admin-token'];
  const verified = verifyAuthToken(token);
  if (!verified || verified.username !== ADMIN_USERNAME) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Valid administrator authorization required.' } });
  }
  req.adminUser = verified;
  next();
}

// ==========================================
// 7. REST APIS: PUBLIC ENDPOINTS
// ==========================================
app.get('/api/health', (req, res) => res.json({ success: true, data: { status: 'healthy', clinic: CLINIC_CONFIG.name } }));

app.get('/api/services', async (req, res) => {
  try {
    const services = await Service.find({ active: true }).sort({ price: 1 }).lean();
    res.json({ success: true, data: services });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

app.get('/api/dentists', async (req, res) => {
  try {
    const dentists = await Dentist.find({ active: true }).populate('serviceIds', 'name slug').lean();
    res.json({ success: true, data: dentists });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// Availability Engine (Timezone aware)
app.get('/api/availability', async (req, res) => {
  try {
    const { date, dentistId, serviceId } = req.query;
    if (!date || !dentistId || !serviceId) return res.status(400).json({ success: false, error: { message: 'Missing parameters.' } });

    const dentist = await Dentist.findById(dentistId);
    const service = await Service.findById(serviceId);
    if (!dentist || !service) return res.status(404).json({ success: false, error: { message: 'Resource not found.' } });

    const requestedDate = new Date(`${date}T00:00:00.000Z`);
    const dayOfWeek = requestedDate.getUTCDay();

    if (!dentist.workingHours.days.includes(dayOfWeek)) {
      return res.json({ success: true, data: { slots: [] } });
    }

    const [startH, startM] = dentist.workingHours.start.split(':').map(Number);
    const [endH, endM] = dentist.workingHours.end.split(':').map(Number);
    const startTimeMin = startH * 60 + startM;
    const endTimeMin = endH * 60 + endM;

    const startOfDay = new Date(`${date}T00:00:00.000Z`);
    const endOfDay = new Date(`${date}T23:59:59.999Z`);

    const existingAppointments = await Appointment.find({
      dentistId: dentist._id,
      status: { $ne: 'cancelled' },
      appointmentStart: { $gte: startOfDay, $lte: endOfDay }
    }).lean();

    const availableSlots = [];
    const now = new Date();

    for (let current = startTimeMin; current + service.durationMinutes <= endTimeMin; current += 30) {
      const timeStr = `${String(Math.floor(current / 60)).padStart(2, '0')}:${String(current % 60).padStart(2, '0')}`;
      const slotStart = new Date(`${date}T${timeStr}:00.000Z`);
      const slotEnd = new Date(slotStart.getTime() + service.durationMinutes * 60000);

      if (slotStart <= now) continue;

      const isBooked = existingAppointments.some(apt => {
        const aptStart = new Date(apt.appointmentStart).getTime();
        const aptEnd = new Date(apt.appointmentEnd).getTime();
        return (slotStart.getTime() < aptEnd && slotEnd.getTime() > aptStart);
      });

      if (!isBooked) {
        availableSlots.push({
          time: timeStr,
          formatted: formatTime12H(timeStr)
        });
      }
    }

    res.json({ success: true, data: { date, slots: availableSlots } });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

function formatTime12H(time24) {
  const [h, m] = time24.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

// Book Appointment (Atomic overlaps verified)
app.post('/api/appointments', async (req, res) => {
  try {
    const { patientName, patientPhone, patientEmail, serviceId, dentistId, date, time, reason } = req.body;

    if (!patientName || !patientPhone || !serviceId || !dentistId || !date || !time) {
      return res.status(422).json({ success: false, error: { message: 'Incomplete fields.' } });
    }

    const service = await Service.findById(serviceId);
    const dentist = await Dentist.findById(dentistId);
    if (!service || !dentist) return res.status(404).json({ success: false, error: { message: 'Invalid references.' } });

    const appointmentStart = new Date(`${date}T${time}:00.000Z`);
    const appointmentEnd = new Date(appointmentStart.getTime() + service.durationMinutes * 60000);

    if (appointmentStart <= new Date()) return res.status(400).json({ success: false, error: { message: 'Cannot book in past.' } });

    const conflict = await Appointment.findOne({
      dentistId: dentist._id,
      status: { $ne: 'cancelled' },
      $or: [
        { appointmentStart: { $lt: appointmentEnd, $gte: appointmentStart } },
        { appointmentEnd: { $gt: appointmentStart, $lte: appointmentEnd } },
        { appointmentStart: { $lte: appointmentStart }, appointmentEnd: { $gte: appointmentEnd } }
      ]
    });

    if (conflict) {
      return res.status(409).json({ success: false, error: { code: 'SLOT_OCCUPIED', message: 'Slot claimed moments ago. Please reselect.' } });
    }

    const reference = `LUMA-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const appointment = await Appointment.create({
      reference, patientName, patientPhone, patientEmail: patientEmail || '',
      serviceId, dentistId, appointmentStart, appointmentEnd,
      timezone: CLINIC_CONFIG.timezone, status: 'confirmed', reason: reason || ''
    });

    await AuditLog.create({
      actor: 'patient', action: 'APPOINTMENT_CREATED', resourceType: 'Appointment', resourceId: appointment.reference
    });

    res.status(201).json({
      success: true,
      data: { reference, patientName, date, time: formatTime12H(time) }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

app.get('/api/appointments/:reference', async (req, res) => {
  try {
    const query = { reference: req.params.reference.toUpperCase() };
    const appointment = await Appointment.findOne(query).populate('serviceId', 'name').populate('dentistId', 'name').lean();
    
    if (!appointment) return res.status(404).json({ success: false, error: { message: 'Not found.' } });

    const isVerified = req.query.phone && appointment.patientPhone.endsWith(req.query.phone.slice(-4));
    res.json({
      success: true,
      data: {
        reference: appointment.reference,
        status: appointment.status,
        appointmentStart: appointment.appointmentStart,
        serviceName: appointment.serviceId?.name,
        patientMasked: isVerified ? appointment.patientName : `${appointment.patientName.charAt(0)}***`,
        verified: !!isVerified
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// ==========================================
// 8. REST APIS: ADMIN DASHBOARD
// ==========================================

// Login Route
app.post('/api/admin/login', authLimiter, (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: { code: 'INVALID', message: 'Username and password required.' } });
    }

    const isValid = secureCredentialCheck(username, password);
    if (!isValid) {
      // Generic authentication error to prevent credential enumeration
      return res.status(401).json({ success: false, error: { code: 'AUTH_FAILED', message: 'Invalid credentials.' } });
    }

    const token = generateAuthToken(ADMIN_USERNAME);

    res.cookie('lumasmile_admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });

    res.json({ success: true, message: 'Logged in successfully.', data: { username: ADMIN_USERNAME } });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: 'Authentication error occurred.' } });
  }
});

// Logout Route
app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('lumasmile_admin_token');
  res.json({ success: true, message: 'Logged out successfully.' });
});

// Me Validation
app.get('/api/admin/me', requireAdminAuth, (req, res) => {
  res.json({ success: true, data: { username: req.adminUser.username } });
});

// Dashboard Metrics
app.get('/api/admin/dashboard', requireAdminAuth, async (req, res) => {
  try {
    const totalAppointments = await Appointment.countDocuments();
    const confirmedCount = await Appointment.countDocuments({ status: 'confirmed' });
    const completedCount = await Appointment.countDocuments({ status: 'completed' });
    const cancelledCount = await Appointment.countDocuments({ status: 'cancelled' });

    const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setUTCHours(23, 59, 59, 999);
    const todayAppointments = await Appointment.countDocuments({ appointmentStart: { $gte: todayStart, $lte: todayEnd } });

    const recentAppointments = await Appointment.find().sort({ createdAt: -1 }).limit(6).populate('serviceId', 'name').populate('dentistId', 'name').lean();

    res.json({
      success: true,
      data: {
        stats: { total: totalAppointments, confirmed: confirmedCount, completed: completedCount, cancelled: cancelledCount, today: todayAppointments },
        recentAppointments
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// Appointment Management
app.get('/api/admin/appointments', requireAdminAuth, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 15 } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (search) {
      filter.$or = [
        { reference: { $regex: search, $options: 'i' } },
        { patientName: { $regex: search, $options: 'i' } }
      ];
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [records, total] = await Promise.all([
      Appointment.find(filter).sort({ appointmentStart: -1 }).skip(skip).limit(Number(limit)).populate('serviceId', 'name').populate('dentistId', 'name').lean(),
      Appointment.countDocuments(filter)
    ]);
    res.json({ success: true, data: { appointments: records, pagination: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) } } });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

app.patch('/api/admin/appointments/:id/status', requireAdminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['confirmed', 'completed', 'cancelled', 'pending'].includes(status)) return res.status(400).json({ success: false, error: { message: 'Invalid status.' } });
    
    const updateData = { status };
    if (status === 'cancelled') updateData.cancelledAt = new Date();
    
    const appointment = await Appointment.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!appointment) return res.status(404).json({ success: false, error: { message: 'Not found.' } });

    await AuditLog.create({ actor: req.adminUser.username, action: `APPOINTMENT_${status.toUpperCase()}`, resourceType: 'Appointment', resourceId: appointment.reference });
    res.json({ success: true, data: appointment });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// Safe CSV Export
app.get('/api/admin/export/appointments.csv', requireAdminAuth, async (req, res) => {
  try {
    const appointments = await Appointment.find().sort({ appointmentStart: -1 }).populate('serviceId', 'name').populate('dentistId', 'name').lean();
    const sanitize = text => {
      if (!text) return '""';
      let clean = String(text).replace(/"/g, '""');
      if (/^[=+\-@\t\r]/.test(clean)) clean = `'${clean}`;
      return `"${clean}"`;
    };
    const headers = ['Reference', 'Patient Name', 'Phone', 'Service', 'Dentist', 'Start Time', 'Status'];
    const rows = appointments.map(a => [sanitize(a.reference), sanitize(a.patientName), sanitize(a.patientPhone), sanitize(a.serviceId?.name), sanitize(a.dentistId?.name), sanitize(new Date(a.appointmentStart).toISOString()), sanitize(a.status)].join(','));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="lumasmile-appointments.csv"');
    res.status(200).send([headers.join(','), ...rows].join('\r\n'));
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// Settings Endpoint
app.get('/api/admin/settings', requireAdminAuth, (req, res) => res.json({ success: true, data: CLINIC_CONFIG }));

// ==========================================
// 9. PUBLIC FRONTEND PRESENTATION LAYER
// ==========================================
app.get('/admin', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderAdminApp(CLINIC_CONFIG));
});

app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${CLINIC_CONFIG.name} — ${CLINIC_CONFIG.secondaryTagline}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary-lavender: #A78BFA;
      --deep-violet: #6D5BD0;
      --soft-peach: #FFBFA3;
      --coral: #FF8A80;
      --mint: #A7E8D0;
      --sky-blue: #A9D8FF;
      --warm-cream: #FFF8F1;
      --card-surface: #FFFFFF;
      --main-text: #302A42;
      --secondary-text: #77718B;
      --success: #34D399;
      --error: #F87171;
      --clay-shadow-raised: 8px 10px 24px rgba(109, 91, 208, 0.12), -8px -8px 20px rgba(255, 255, 255, 0.95);
      --clay-shadow-button: 6px 8px 18px rgba(109, 91, 208, 0.22), -5px -5px 14px rgba(255, 255, 255, 0.9);
      --clay-shadow-inset: inset 4px 4px 8px rgba(109, 91, 208, 0.1), inset -4px -4px 8px rgba(255, 255, 255, 0.9);
      --radius-large: 28px;
      --radius-small: 16px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body { font-family: 'Nunito', sans-serif; background-color: var(--warm-cream); color: var(--main-text); line-height: 1.6; overflow-x: hidden; }
    .container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
    .navbar { position: sticky; top: 16px; z-index: 1000; margin: 12px 20px 0 20px; }
    .navbar-inner { background: rgba(255, 255, 255, 0.88); backdrop-filter: blur(14px); border-radius: var(--radius-large); box-shadow: var(--clay-shadow-raised); display: flex; align-items: center; justify-content: space-between; padding: 14px 28px; }
    .brand { display: flex; align-items: center; gap: 12px; text-decoration: none; color: var(--main-text); font-weight: 900; font-size: 1.25rem; }
    .brand-icon { background: linear-gradient(135deg, var(--primary-lavender), var(--deep-violet)); color: white; width: 44px; height: 44px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.4rem; box-shadow: var(--clay-shadow-button); }
    .nav-links { display: flex; gap: 24px; list-style: none; }
    .nav-links a { text-decoration: none; color: var(--secondary-text); font-weight: 700; }
    .nav-links a:hover { color: var(--deep-violet); }
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 26px; border-radius: var(--radius-small); font-weight: 800; text-decoration: none; border: none; cursor: pointer; transition: all 0.2s ease; font-size: 0.95rem; font-family: inherit; }
    .btn-primary { background: linear-gradient(135deg, var(--primary-lavender), var(--deep-violet)); color: white; box-shadow: var(--clay-shadow-button); }
    .btn-primary:hover { transform: translateY(-2px); }
    .btn-secondary { background: var(--card-surface); color: var(--deep-violet); box-shadow: var(--clay-shadow-raised); }
    .hero { padding: 60px 0 80px 0; }
    .hero-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 48px; align-items: center; }
    .hero h1 { font-size: 3.2rem; font-weight: 900; line-height: 1.15; margin-bottom: 20px; }
    .hero h1 span { background: linear-gradient(135deg, var(--deep-violet), var(--coral)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .clay-card { background: var(--card-surface); border-radius: var(--radius-large); padding: 32px 24px; box-shadow: var(--clay-shadow-raised); display: flex; flex-direction: column; }
    .services-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 28px; }
    .booking-wrapper { background: var(--card-surface); border-radius: var(--radius-large); padding: 44px; box-shadow: var(--clay-shadow-raised); max-width: 800px; margin: 0 auto; }
    .form-control { width: 100%; padding: 14px 18px; border-radius: var(--radius-small); border: 2px solid transparent; background: #F8FAFC; box-shadow: var(--clay-shadow-inset); font-family: inherit; font-size: 1rem; outline: none; margin-bottom: 22px; }
    .slot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 12px; margin-bottom: 22px; }
    .slot-btn { padding: 10px; border-radius: 12px; border: none; background: #F8FAFC; box-shadow: var(--clay-shadow-raised); font-family: inherit; font-weight: 700; cursor: pointer; }
    .slot-btn.selected { background: var(--deep-violet); color: white; }
    footer { background: #252033; color: #D1D5DB; padding: 64px 0 32px 0; margin-top: 80px; }
    @media (max-width: 860px) { .hero-grid { grid-template-columns: 1fr; } .nav-links { display: none; } }
  </style>
</head>
<body>
  <header class="navbar">
    <div class="container">
      <div class="navbar-inner">
        <a href="#" class="brand"><div class="brand-icon">🦷</div><span>${CLINIC_CONFIG.name}</span></a>
        <ul class="nav-links">
          <li><a href="#services">Services</a></li>
          <li><a href="#booking">Book Now</a></li>
          <li><a href="/admin">Admin Login</a></li>
        </ul>
      </div>
    </div>
  </header>

  <section class="hero">
    <div class="container">
      <div class="hero-grid">
        <div>
          <h1>Discover the Joy of a <span>Healthier, Brighter Smile.</span></h1>
          <p style="color: var(--secondary-text); margin-bottom: 32px;">${CLINIC_CONFIG.tagline} Experience gentle, modern dentistry equipped with state-of-the-art dental care.</p>
          <a href="#booking" class="btn btn-primary">Book Your Visit</a>
        </div>
        <div>
          <div class="clay-card" style="height: 380px; background: url('https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=800&q=80') center/cover; padding:0;"></div>
        </div>
      </div>
    </div>
  </section>

  <section class="hero" id="services" style="background: rgba(255,255,255,0.4);">
    <div class="container">
      <h2 style="text-align: center; margin-bottom: 48px; font-size: 2.3rem; font-weight: 900;">Our Dental Services</h2>
      <div class="services-grid" id="servicesContainer"><p>Loading catalog...</p></div>
    </div>
  </section>

  <section class="hero" id="booking">
    <div class="container">
      <h2 style="text-align: center; margin-bottom: 48px; font-size: 2.3rem; font-weight: 900;">Schedule Appointment</h2>
      <div class="booking-wrapper">
        <form id="bookingForm" onsubmit="event.preventDefault();">
          <label style="font-weight: 800;">1. Select Treatment & Doctor</label>
          <select id="bookingService" class="form-control" required><option value="">Choose treatment...</option></select>
          <select id="bookingDentist" class="form-control" required><option value="">Choose doctor...</option></select>

          <label style="font-weight: 800;">2. Select Date & Time</label>
          <input type="date" id="bookingDate" class="form-control" onchange="fetchAvailableSlots()" required>
          <div id="slotsContainer" class="slot-grid"></div>

          <label style="font-weight: 800;">3. Patient Details</label>
          <input type="text" id="patientName" class="form-control" placeholder="Full Name" required>
          <input type="tel" id="patientPhone" class="form-control" placeholder="Mobile Number" required>
          
          <button type="button" class="btn btn-primary" style="width: 100%;" id="submitBookingBtn" onclick="submitBooking()">Confirm Appointment ✨</button>
          <div id="bookingResult" style="margin-top: 16px; font-weight: 800; text-align: center; color: var(--deep-violet);"></div>
        </form>
      </div>
    </div>
  </section>

  <footer>
    <div class="container">
      <h3 style="color: white; margin-bottom: 16px;">🦷 ${CLINIC_CONFIG.name}</h3>
      <p>Address: ${CLINIC_CONFIG.address}</p>
      <p>Phone: ${CLINIC_CONFIG.phone}</p>
      <p style="margin-top:20px; font-size:0.85rem;"><a href="/admin" style="color:var(--primary-lavender)">Staff Portal Login</a></p>
    </div>
  </footer>

  <script>
    let appState = { services: [], dentists: [], selectedSlot: null };
    const dateInput = document.getElementById('bookingDate');
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    dateInput.min = tomorrow.toISOString().split('T')[0];

    async function initData() {
      const [sRes, dRes] = await Promise.all([fetch('/api/services'), fetch('/api/dentists')]);
      const sJson = await sRes.json();
      const dJson = await dRes.json();
      if (sJson.success) {
        appState.services = sJson.data;
        document.getElementById('servicesContainer').innerHTML = sJson.data.map(s => \`<div class="clay-card"><h3>\${s.icon} \${s.name}</h3><p style="margin: 12px 0; color: var(--secondary-text);">\${s.description}</p><strong style="color: var(--deep-violet); font-size: 1.2rem;">₹\${s.price.toLocaleString()}</strong></div>\`).join('');
        document.getElementById('bookingService').innerHTML = '<option value="">Choose treatment...</option>' + sJson.data.map(s => \`<option value="\${s._id}">\${s.name}</option>\`).join('');
      }
      if (dJson.success) {
        appState.dentists = dJson.data;
        document.getElementById('bookingDentist').innerHTML = '<option value="">Choose doctor...</option>' + dJson.data.map(d => \`<option value="\${d._id}">\${d.name}</option>\`).join('');
      }
    }

    async function fetchAvailableSlots() {
      const d = dateInput.value, s = document.getElementById('bookingService').value, dt = document.getElementById('bookingDentist').value;
      if (!d || !s || !dt) return;
      document.getElementById('slotsContainer').innerHTML = 'Checking schedule...';
      const res = await fetch(\`/api/availability?date=\${d}&dentistId=\${dt}&serviceId=\${s}\`);
      const json = await res.json();
      if (json.success && json.data.slots.length) {
        document.getElementById('slotsContainer').innerHTML = json.data.slots.map(sl => \`<button type="button" class="slot-btn" onclick="selectSlot(this, '\${sl.time}')">\${sl.formatted}</button>\`).join('');
      } else {
        document.getElementById('slotsContainer').innerHTML = '<span style="color:var(--error)">No slots available on this date.</span>';
      }
    }

    function selectSlot(btn, time) {
      document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      appState.selectedSlot = time;
    }

    async function submitBooking() {
      if (!appState.selectedSlot) return alert("Please select a time slot.");
      const btn = document.getElementById('submitBookingBtn');
      btn.disabled = true; btn.textContent = 'Processing...';
      try {
        const payload = {
          serviceId: document.getElementById('bookingService').value,
          dentistId: document.getElementById('bookingDentist').value,
          date: dateInput.value,
          time: appState.selectedSlot,
          patientName: document.getElementById('patientName').value,
          patientPhone: document.getElementById('patientPhone').value
        };
        const res = await fetch('/api/appointments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (data.success) {
          document.getElementById('bookingResult').innerHTML = \`Success! Token: \${data.data.reference}\`;
          document.getElementById('bookingForm').reset();
          document.getElementById('slotsContainer').innerHTML = '';
        } else {
          alert('Booking failed: ' + data.error.message);
        }
      } finally {
        btn.disabled = false; btn.textContent = 'Confirm Appointment ✨';
      }
    }
    document.addEventListener('DOMContentLoaded', initData);
  </script>
</body>
</html>`);
});

app.use((req, res) => res.status(404).json({ success: false, error: { message: 'Not found' } }));
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}
module.exports = app;
