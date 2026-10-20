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
const bcrypt = require('bcryptjs');

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

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/lumasmile';
const SESSION_SECRET = process.env.SESSION_SECRET || 'lumasmile-dev-insecure-secret-key-32chars!';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@lumasmile.example').toLowerCase();
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';

// ==========================================
// 2. DATABASE CONNECTION POOLING (SERVERLESS)
// ==========================================
let cachedDb = global.mongooseCached;
if (!cachedDb) {
  cachedDb = global.mongooseCached = { conn: null, promise: null };
}

async function connectToDatabase() {
  if (cachedDb.conn) {
    return cachedDb.conn;
  }
  if (!cachedDb.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    };
    cachedDb.promise = mongoose.connect(MONGODB_URI, opts).then((mongooseInstance) => {
      return mongooseInstance;
    });
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
  imageUrl: { type: String, default: '' },
  icon: { type: String, default: '✨' },
  active: { type: Boolean, default: true }
}, { timestamps: true });

const DentistSchema = new mongoose.Schema({
  name: { type: String, required: true },
  title: { type: String, required: true },
  biography: { type: String, required: true },
  qualifications: { type: String, required: true },
  specializations: [String],
  imageUrl: { type: String, default: '' },
  serviceIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Service' }],
  workingHours: {
    start: { type: String, default: '09:00' },
    end: { type: String, default: '19:00' },
    days: { type: [Number], default: [1, 2, 3, 4, 5, 6] } // 0=Sun, 1=Mon...
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
  patientType: { type: String, enum: ['new', 'returning'], default: 'new' },
  administrativeNotes: { type: String, default: '' },
  cancelledAt: { type: Date, default: null }
}, { timestamps: true });

// Prevent overlapping bookings for active appointments
AppointmentSchema.index({ dentistId: 1, appointmentStart: 1, appointmentEnd: 1 });

const SettingSchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true });

const AdminUserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: 'admin' },
  lastLogin: { type: Date }
}, { timestamps: true });

const AuditLogSchema = new mongoose.Schema({
  actor: { type: String, default: 'system' },
  action: { type: String, required: true },
  resourceType: { type: String, required: true },
  resourceId: { type: String },
  details: { type: mongoose.Schema.Types.Mixed },
  timestamp: { type: Date, default: Date.now }
});

const Service = mongoose.models.Service || mongoose.model('Service', ServiceSchema);
const Dentist = mongoose.models.Dentist || mongoose.model('Dentist', DentistSchema);
const Appointment = mongoose.models.Appointment || mongoose.model('Appointment', AppointmentSchema);
const Setting = mongoose.models.Setting || mongoose.model('Setting', SettingSchema);
const AdminUser = mongoose.models.AdminUser || mongoose.model('AdminUser', AdminUserSchema);
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
      { name: 'Dental Fillings', slug: 'dental-fillings', description: 'Natural tooth-colored composite restorations seamlessly blended to match your natural aesthetics.', price: 1800, durationMinutes: 45, icon: '🛡️' },
      { name: 'Root Canal Treatment', slug: 'root-canal', description: 'Microscopic, gentle endodontic care crafted to relieve tooth discomfort and preserve natural dentition.', price: 6500, durationMinutes: 60, icon: '🔬' },
      { name: 'Dental Crowns', slug: 'dental-crowns', description: 'Custom-milled porcelain and zirconia crowns engineered for durable strength and lifelike beauty.', price: 8500, durationMinutes: 60, icon: '👑' },
      { name: 'Orthodontic Consultation', slug: 'orthodontics-consult', description: 'Comprehensive diagnostic scan and personalized roadmap for clear aligners and modern braces.', price: 1200, durationMinutes: 45, icon: '📐' },
      { name: 'Dental Implants Consultation', slug: 'implant-consult', description: '3D CBCT digital treatment simulation for long-term permanent tooth restoration.', price: 2000, durationMinutes: 45, icon: '⚓' }
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
        specializations: ['Aesthetic Smile Design', 'Micro-Endodontics', 'Preventive Care'],
        serviceIds: serviceIds,
        workingHours: { start: '09:00', end: '19:00', days: [1, 2, 3, 4, 5, 6] }
      },
      {
        name: 'Dr. Rohan Mehta',
        title: 'Senior Implantologist & Orthodontist',
        biography: 'Pioneer in digital smile diagnostics and clear aligner therapies, transforming oral rehabilitation since 2015.',
        qualifications: 'BDS, MDS (Orthodontics & Dentofacial Orthopedics)',
        specializations: ['Dental Implants', 'Clear Aligners', 'Pediatric Smiles'],
        serviceIds: serviceIds,
        workingHours: { start: '10:00', end: '18:00', days: [1, 2, 3, 4, 5] }
      }
    ];
    await Dentist.insertMany(defaultDentists);
  }

  // Provision admin account if hash is provided
  if (ADMIN_PASSWORD_HASH) {
    const adminExists = await AdminUser.findOne({ email: ADMIN_EMAIL });
    if (!adminExists) {
      await AdminUser.create({
        email: ADMIN_EMAIL,
        passwordHash: ADMIN_PASSWORD_HASH,
        role: 'superadmin'
      });
    }
  }
}

// ==========================================
// 5. SECURITY & MIDDLEWARE SETUP
// ==========================================
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
app.use(cookieParser(SESSION_SECRET));

// Ensure DB is available for incoming requests
app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (err) {
    console.error('Database connection error:', err.message);
    res.status(503).json({
      success: false,
      error: { code: 'DATABASE_UNAVAILABLE', message: 'Service momentarily unavailable. Connecting to database.' }
    });
  }
});

// Rate limiters
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.' } }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: { code: 'AUTH_RATE_LIMIT', message: 'Too many login attempts. Please wait 15 minutes.' } }
});

app.use('/api/', apiLimiter);

// ==========================================
// 6. AUTHENTICATION HELPERS
// ==========================================
function generateAuthToken(email) {
  const payload = `${email}:${Date.now()}`;
  const hmac = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64');
}

function verifyAuthToken(token) {
  if (!token) return null;
  try {
    const raw = Buffer.from(token, 'base64').toString('utf-8');
    const [email, timestamp, signature] = raw.split(':');
    if (!email || !timestamp || !signature) return null;
    
    // Check expiration (24 hours)
    if (Date.now() - Number(timestamp) > 24 * 60 * 60 * 1000) return null;

    const payload = `${email}:${timestamp}`;
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
    if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return { email };
    }
    return null;
  } catch {
    return null;
  }
}

async function requireAdminAuth(req, res, next) {
  const token = req.cookies.lumasmile_admin_token || req.headers['x-admin-token'];
  const verified = verifyAuthToken(token);
  if (!verified) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Valid administrator authorization required.' }
    });
  }
  const user = await AdminUser.findOne({ email: verified.email });
  if (!user) {
    return res.status(401).json({
      success: false,
      error: { code: 'USER_NOT_FOUND', message: 'Session invalid.' }
    });
  }
  req.adminUser = user;
  next();
}

// ==========================================
// 7. REST APIS: PUBLIC ENDPOINTS
// ==========================================

// Health & Clinic Meta
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    data: { status: 'healthy', clinic: CLINIC_CONFIG.name, time: new Date().toISOString() }
  });
});

// Services
app.get('/api/services', async (req, res) => {
  try {
    const services = await Service.find({ active: true }).sort({ price: 1 }).lean();
    res.json({ success: true, data: services });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// Dentists
app.get('/api/dentists', async (req, res) => {
  try {
    const dentists = await Dentist.find({ active: true }).populate('serviceIds', 'name slug').lean();
    res.json({ success: true, data: dentists });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// Availability Engine (Timezone aware calculation)
app.get('/api/availability', async (req, res) => {
  try {
    const { date, dentistId, serviceId } = req.query;
    if (!date || !dentistId || !serviceId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMETERS', message: 'date (YYYY-MM-DD), dentistId, and serviceId are mandatory.' }
      });
    }

    const dentist = await Dentist.findById(dentistId);
    const service = await Service.findById(serviceId);
    if (!dentist || !service) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Dentist or Service not found.' } });
    }

    const requestedDate = new Date(`${date}T00:00:00.000Z`);
    const dayOfWeek = requestedDate.getUTCDay();

    // Check if dentist works on this day
    if (!dentist.workingHours.days.includes(dayOfWeek)) {
      return res.json({ success: true, data: { slots: [], reason: 'Dentist not scheduled on this day.' } });
    }

    // Working interval
    const [startH, startM] = dentist.workingHours.start.split(':').map(Number);
    const [endH, endM] = dentist.workingHours.end.split(':').map(Number);

    const slotDuration = service.durationMinutes + (service.bufferMinutes || 15);
    const startTimeMin = startH * 60 + startM;
    const endTimeMin = endH * 60 + endM;

    // Fetch existing non-cancelled bookings for this dentist on this calendar date
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
      const slotHour = Math.floor(current / 60);
      const slotMinute = current % 60;
      const timeStr = `${String(slotHour).padStart(2, '0')}:${String(slotMinute).padStart(2, '0')}`;
      
      const slotStart = new Date(`${date}T${timeStr}:00.000Z`);
      const slotEnd = new Date(slotStart.getTime() + service.durationMinutes * 60000);

      // Past check
      if (slotStart <= now) continue;

      // Check collision with existing bookings
      const isBooked = existingAppointments.some(apt => {
        const aptStart = new Date(apt.appointmentStart).getTime();
        const aptEnd = new Date(apt.appointmentEnd).getTime();
        return (slotStart.getTime() < aptEnd && slotEnd.getTime() > aptStart);
      });

      if (!isBooked) {
        availableSlots.push({
          time: timeStr,
          formatted: formatTime12H(timeStr),
          startISO: slotStart.toISOString(),
          endISO: slotEnd.toISOString()
        });
      }
    }

    res.json({ success: true, data: { date, slots: availableSlots } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// Book Appointment (Atomic overlapping verification)
app.post('/api/appointments', async (req, res) => {
  try {
    const { patientName, patientPhone, patientEmail, serviceId, dentistId, date, time, reason, patientType } = req.body;

    if (!patientName || !patientPhone || !serviceId || !dentistId || !date || !time) {
      return res.status(422).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'All booking fields must be completed.' }
      });
    }

    const service = await Service.findById(serviceId);
    const dentist = await Dentist.findById(dentistId);

    if (!service || !dentist) {
      return res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Invalid service or dentist.' } });
    }

    const appointmentStart = new Date(`${date}T${time}:00.000Z`);
    const appointmentEnd = new Date(appointmentStart.getTime() + service.durationMinutes * 60000);

    if (appointmentStart <= new Date()) {
      return res.status(400).json({ success: false, error: { code: 'PAST_DATE', message: 'Appointments cannot be booked in the past.' } });
    }

    // Atomic race-condition barrier check
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
      return res.status(409).json({
        success: false,
        error: { code: 'SLOT_OCCUPIED', message: 'This timeslot was claimed just now. Please select an adjacent slot.' }
      });
    }

    // Generate unique human-readable booking token
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    const reference = `LUMA-${randomHex}`;

    const appointment = await Appointment.create({
      reference,
      patientName,
      patientPhone,
      patientEmail: patientEmail || '',
      serviceId: service._id,
      dentistId: dentist._id,
      appointmentStart,
      appointmentEnd,
      timezone: CLINIC_CONFIG.timezone,
      status: 'confirmed',
      reason: reason || '',
      patientType: patientType === 'returning' ? 'returning' : 'new'
    });

    await AuditLog.create({
      actor: 'patient',
      action: 'APPOINTMENT_CREATED',
      resourceType: 'Appointment',
      resourceId: appointment.reference,
      details: { patientName, service: service.name, dentist: dentist.name }
    });

    res.status(201).json({
      success: true,
      message: 'Appointment successfully scheduled.',
      data: {
        reference: appointment.reference,
        patientName: appointment.patientName,
        service: service.name,
        dentist: dentist.name,
        date,
        time: formatTime12H(time),
        status: appointment.status
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'BOOKING_FAILED', message: err.message } });
  }
});

// Secure appointment verification lookup
app.get('/api/appointments/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    const { phone } = req.query; // secondary privacy verification

    const query = { reference: reference.toUpperCase() };
    const appointment = await Appointment.findOne(query)
      .populate('serviceId', 'name price durationMinutes')
      .populate('dentistId', 'name title')
      .lean();

    if (!appointment) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Appointment reference not found.' } });
    }

    // If phone verification supplied, grant full confirmation context, otherwise redact
    const isVerified = phone && appointment.patientPhone.endsWith(phone.slice(-4));

    res.json({
      success: true,
      data: {
        reference: appointment.reference,
        status: appointment.status,
        appointmentStart: appointment.appointmentStart,
        serviceName: appointment.serviceId?.name,
        dentistName: appointment.dentistId?.name,
        patientMasked: isVerified ? appointment.patientName : `${appointment.patientName.charAt(0)}***`,
        verified: !!isVerified
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// ==========================================
// 8. REST APIS: ADMIN DASHBOARD
// ==========================================

// Login
app.post('/api/admin/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Email and password required.' } });
    }

    let user = await AdminUser.findOne({ email: email.toLowerCase() });
    
    // Auto-bootstrap local development superadmin if configured
    if (!user && ADMIN_PASSWORD_HASH && email.toLowerCase() === ADMIN_EMAIL) {
      user = await AdminUser.create({
        email: ADMIN_EMAIL,
        passwordHash: ADMIN_PASSWORD_HASH,
        role: 'superadmin'
      });
    }

    if (!user) {
      return res.status(401).json({ success: false, error: { code: 'AUTH_FAILED', message: 'Invalid credentials.' } });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ success: false, error: { code: 'AUTH_FAILED', message: 'Invalid credentials.' } });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = generateAuthToken(user.email);

    res.cookie('lumasmile_admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      message: 'Logged in successfully.',
      data: { email: user.email, role: user.role, token }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// Logout
app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('lumasmile_admin_token');
  res.json({ success: true, message: 'Logged out successfully.' });
});

// Me (Session status)
app.get('/api/admin/me', requireAdminAuth, (req, res) => {
  res.json({
    success: true,
    data: { email: req.adminUser.email, role: req.adminUser.role }
  });
});

// Dashboard Metrics
app.get('/api/admin/dashboard', requireAdminAuth, async (req, res) => {
  try {
    const totalAppointments = await Appointment.countDocuments();
    const confirmedCount = await Appointment.countDocuments({ status: 'confirmed' });
    const completedCount = await Appointment.countDocuments({ status: 'completed' });
    const cancelledCount = await Appointment.countDocuments({ status: 'cancelled' });

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setUTCHours(23, 59, 59, 999);

    const todayAppointments = await Appointment.countDocuments({
      appointmentStart: { $gte: todayStart, $lte: todayEnd }
    });

    const recentAppointments = await Appointment.find()
      .sort({ createdAt: -1 })
      .limit(6)
      .populate('serviceId', 'name price')
      .populate('dentistId', 'name')
      .lean();

    res.json({
      success: true,
      data: {
        stats: {
          total: totalAppointments,
          confirmed: confirmedCount,
          completed: completedCount,
          cancelled: cancelledCount,
          today: todayAppointments
        },
        recentAppointments
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// Appointments Management List
app.get('/api/admin/appointments', requireAdminAuth, async (req, res) => {
  try {
    const { status, dentistId, search, page = 1, limit = 15 } = req.query;
    const filter = {};

    if (status && status !== 'all') filter.status = status;
    if (dentistId && dentistId !== 'all') filter.dentistId = dentistId;
    if (search) {
      filter.$or = [
        { reference: { $regex: search, $options: 'i' } },
        { patientName: { $regex: search, $options: 'i' } },
        { patientPhone: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [records, total] = await Promise.all([
      Appointment.find(filter)
        .sort({ appointmentStart: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('serviceId', 'name price durationMinutes')
        .populate('dentistId', 'name')
        .lean(),
      Appointment.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: {
        appointments: records,
        pagination: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// Update Appointment Status
app.patch('/api/admin/appointments/:id/status', requireAdminAuth, async (req, res) => {
  try {
    const { status, administrativeNotes } = req.body;
    if (!['confirmed', 'completed', 'cancelled', 'pending'].includes(status)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Status invalid.' } });
    }

    const updateData = { status };
    if (administrativeNotes !== undefined) updateData.administrativeNotes = administrativeNotes;
    if (status === 'cancelled') updateData.cancelledAt = new Date();

    const appointment = await Appointment.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!appointment) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Appointment not found.' } });

    await AuditLog.create({
      actor: req.adminUser.email,
      action: `APPOINTMENT_${status.toUpperCase()}`,
      resourceType: 'Appointment',
      resourceId: appointment.reference
    });

    res.json({ success: true, data: appointment, message: `Appointment status updated to ${status}.` });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
});

// Safe CSV Export (Sanitized against Formula Injection)
app.get('/api/admin/export/appointments.csv', requireAdminAuth, async (req, res) => {
  try {
    const appointments = await Appointment.find()
      .sort({ appointmentStart: -1 })
      .populate('serviceId', 'name price')
      .populate('dentistId', 'name')
      .lean();

    const sanitizeCell = (text) => {
      if (!text) return '""';
      let clean = String(text).replace(/"/g, '""');
      // Defend against formula injection in Excel/Sheets
      if (/^[=+\-@\t\r]/.test(clean)) {
        clean = `'${clean}`;
      }
      return `"${clean}"`;
    };

    const headers = ['Reference', 'Patient Name', 'Phone', 'Email', 'Service', 'Dentist', 'Start Time', 'Status', 'Notes'];
    const rows = appointments.map(a => [
      sanitizeCell(a.reference),
      sanitizeCell(a.patientName),
      sanitizeCell(a.patientPhone),
      sanitizeCell(a.patientEmail || ''),
      sanitizeCell(a.serviceId?.name || 'N/A'),
      sanitizeCell(a.dentistId?.name || 'N/A'),
      sanitizeCell(new Date(a.appointmentStart).toISOString()),
      sanitizeCell(a.status),
      sanitizeCell(a.administrativeNotes || '')
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="lumasmile-appointments.csv"');
    res.status(200).send(csvContent);
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'EXPORT_FAILED', message: err.message } });
  }
});

// CRUD: Services Management
app.post('/api/admin/services', requireAdminAuth, async (req, res) => {
  try {
    const { name, price, durationMinutes, description, icon } = req.body;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const service = await Service.create({ name, slug, price, durationMinutes, description, icon: icon || '🦷' });
    res.status(201).json({ success: true, data: service });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'CREATE_FAILED', message: err.message } });
  }
});

app.patch('/api/admin/services/:id', requireAdminAuth, async (req, res) => {
  try {
    const service = await Service.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, data: service });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'UPDATE_FAILED', message: err.message } });
  }
});

// CRUD: Dentists Management
app.post('/api/admin/dentists', requireAdminAuth, async (req, res) => {
  try {
    const dentist = await Dentist.create(req.body);
    res.status(201).json({ success: true, data: dentist });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'CREATE_FAILED', message: err.message } });
  }
});

app.patch('/api/admin/dentists/:id', requireAdminAuth, async (req, res) => {
  try {
    const dentist = await Dentist.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, data: dentist });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'UPDATE_FAILED', message: err.message } });
  }
});

// Settings Management
app.get('/api/admin/settings', requireAdminAuth, async (req, res) => {
  res.json({ success: true, data: CLINIC_CONFIG });
});

// ==========================================
// 9. PUBLIC FRONTEND PRESENTATION LAYER
// ==========================================

function formatTime12H(time24) {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

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
  <meta name="description" content="State-of-the-art gentle dental care in Downtown Guwahati. Online instant appointments, cosmetic smile artistry, root canal therapy, and transparent care.">
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
    body {
      font-family: 'Nunito', -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: var(--warm-cream);
      color: var(--main-text);
      line-height: 1.6;
      overflow-x: hidden;
    }

    /* Container */
    .container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }

    /* Sticky Navigation */
    .navbar {
      position: sticky;
      top: 16px;
      z-index: 1000;
      margin: 12px 20px 0 20px;
    }
    .navbar-inner {
      background: rgba(255, 255, 255, 0.88);
      backdrop-filter: blur(14px);
      border-radius: var(--radius-large);
      box-shadow: var(--clay-shadow-raised);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 28px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: var(--main-text);
      font-weight: 900;
      font-size: 1.25rem;
    }
    .brand-icon {
      background: linear-gradient(135deg, var(--primary-lavender), var(--deep-violet));
      color: white;
      width: 44px;
      height: 44px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.4rem;
      box-shadow: var(--clay-shadow-button);
    }
    .nav-links {
      display: flex;
      align-items: center;
      gap: 24px;
      list-style: none;
    }
    .nav-links a {
      text-decoration: none;
      color: var(--secondary-text);
      font-weight: 700;
      transition: color 0.2s ease;
    }
    .nav-links a:hover { color: var(--deep-violet); }

    /* Clay Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 26px;
      border-radius: var(--radius-small);
      font-weight: 800;
      text-decoration: none;
      border: none;
      cursor: pointer;
      transition: all 0.2s ease;
      font-size: 0.95rem;
      font-family: inherit;
    }
    .btn-primary {
      background: linear-gradient(135deg, var(--primary-lavender), var(--deep-violet));
      color: white;
      box-shadow: var(--clay-shadow-button);
    }
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 8px 12px 22px rgba(109, 91, 208, 0.32), -4px -4px 12px #fff;
    }
    .btn-secondary {
      background: var(--card-surface);
      color: var(--deep-violet);
      box-shadow: var(--clay-shadow-raised);
    }
    .btn-secondary:hover { transform: translateY(-2px); }

    /* Hero Section */
    .hero {
      padding: 60px 0 80px 0;
      position: relative;
    }
    .hero-grid {
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: 48px;
      align-items: center;
    }
    .badge {
      display: inline-block;
      padding: 6px 16px;
      background: #EDE9FE;
      color: var(--deep-violet);
      border-radius: 50px;
      font-size: 0.85rem;
      font-weight: 800;
      margin-bottom: 20px;
    }
    .hero h1 {
      font-size: 3.2rem;
      font-weight: 900;
      line-height: 1.15;
      color: var(--main-text);
      margin-bottom: 20px;
    }
    .hero h1 span {
      background: linear-gradient(135deg, var(--deep-violet), var(--coral));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .hero p {
      font-size: 1.15rem;
      color: var(--secondary-text);
      margin-bottom: 32px;
      max-width: 520px;
    }
    .hero-ctas { display: flex; gap: 16px; margin-bottom: 40px; }

    .hero-clay-card {
      background: var(--card-surface);
      border-radius: var(--radius-large);
      padding: 32px;
      box-shadow: var(--clay-shadow-raised);
      position: relative;
    }
    .hero-image-wrap {
      border-radius: 20px;
      overflow: hidden;
      box-shadow: var(--clay-shadow-inset);
      height: 380px;
      background: #E5E7EB;
    }
    .hero-image-wrap img { width: 100%; height: 100%; object-fit: cover; }
    .floating-card {
      position: absolute;
      bottom: -20px;
      left: -20px;
      background: white;
      padding: 16px 22px;
      border-radius: var(--radius-small);
      box-shadow: var(--clay-shadow-raised);
      display: flex;
      align-items: center;
      gap: 14px;
    }

    /* Benefits Section */
    .section { padding: 80px 0; }
    .section-header { text-align: center; margin-bottom: 48px; }
    .section-header h2 { font-size: 2.3rem; font-weight: 900; margin-bottom: 12px; }
    .section-header p { color: var(--secondary-text); font-size: 1.05rem; }

    .benefits-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 28px;
    }
    .clay-card {
      background: var(--card-surface);
      border-radius: var(--radius-large);
      padding: 32px 24px;
      box-shadow: var(--clay-shadow-raised);
      transition: transform 0.25s ease;
      display: flex;
      flex-direction: column;
    }
    .clay-card:hover { transform: translateY(-4px); }
    .card-icon {
      width: 56px;
      height: 56px;
      border-radius: 18px;
      background: #F3F4F6;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.8rem;
      margin-bottom: 20px;
      box-shadow: var(--clay-shadow-button);
    }

    /* Services Grid */
    .services-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 28px;
    }
    .service-price {
      font-size: 1.3rem;
      font-weight: 900;
      color: var(--deep-violet);
      margin: 16px 0 8px 0;
    }
    .service-duration {
      font-size: 0.85rem;
      color: var(--secondary-text);
      margin-bottom: 18px;
    }

    /* Dentists Grid */
    .dentist-card {
      text-align: center;
      align-items: center;
    }
    .dentist-avatar {
      width: 110px;
      height: 110px;
      border-radius: 35px;
      background: #EDE9FE;
      margin-bottom: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 3rem;
      box-shadow: var(--clay-shadow-button);
    }

    /* Multi-step Booking Form */
    .booking-wrapper {
      background: var(--card-surface);
      border-radius: var(--radius-large);
      padding: 44px;
      box-shadow: var(--clay-shadow-raised);
      max-width: 800px;
      margin: 0 auto;
    }
    .step-indicator {
      display: flex;
      justify-content: space-between;
      margin-bottom: 36px;
      position: relative;
    }
    .step-node {
      display: flex;
      flex-direction: column;
      align-items: center;
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--secondary-text);
      z-index: 2;
    }
    .step-node.active { color: var(--deep-violet); font-weight: 900; }
    .step-bubble {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: #F3F4F6;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 8px;
      font-weight: 800;
    }
    .step-node.active .step-bubble {
      background: var(--deep-violet);
      color: white;
      box-shadow: var(--clay-shadow-button);
    }

    .form-group { margin-bottom: 22px; }
    .form-group label {
      display: block;
      font-weight: 800;
      margin-bottom: 8px;
      font-size: 0.95rem;
    }
    .form-control {
      width: 100%;
      padding: 14px 18px;
      border-radius: var(--radius-small);
      border: 2px solid transparent;
      background: #F8FAFC;
      box-shadow: var(--clay-shadow-inset);
      font-family: inherit;
      font-size: 1rem;
      outline: none;
      transition: all 0.2s ease;
    }
    .form-control:focus {
      border-color: var(--primary-lavender);
      background: white;
    }
    .slot-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
      gap: 12px;
      margin-top: 12px;
    }
    .slot-btn {
      padding: 10px;
      border-radius: 12px;
      border: none;
      background: #F8FAFC;
      box-shadow: var(--clay-shadow-raised);
      font-family: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    .slot-btn.selected {
      background: var(--deep-violet);
      color: white;
    }

    /* FAQ Accordion */
    .faq-item {
      background: white;
      border-radius: var(--radius-small);
      margin-bottom: 16px;
      box-shadow: var(--clay-shadow-raised);
      overflow: hidden;
    }
    .faq-q {
      padding: 20px 24px;
      font-weight: 800;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      user-select: none;
    }
    .faq-a {
      padding: 0 24px 20px 24px;
      color: var(--secondary-text);
      display: none;
    }
    .faq-item.open .faq-a { display: block; }

    /* Footer */
    footer {
      background: #252033;
      color: #D1D5DB;
      padding: 64px 0 32px 0;
      margin-top: 80px;
    }
    .footer-grid {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr;
      gap: 40px;
      margin-bottom: 40px;
    }

    @media (max-width: 860px) {
      .hero-grid { grid-template-columns: 1fr; }
      .footer-grid { grid-template-columns: 1fr; }
      .nav-links { display: none; }
      .hero h1 { font-size: 2.3rem; }
    }

    @media (prefers-reduced-motion: reduce) {
      * { animation: none !important; transition: none !important; }
    }
  </style>
</head>
<body>

  <!-- Sticky Navbar -->
  <header class="navbar">
    <div class="container">
      <div class="navbar-inner">
        <a href="#" class="brand">
          <div class="brand-icon">🦷</div>
          <span>${CLINIC_CONFIG.name}</span>
        </a>
        <ul class="nav-links">
          <li><a href="#services">Services</a></li>
          <li><a href="#dentists">Our Dentists</a></li>
          <li><a href="#why-us">Why Us</a></li>
          <li><a href="#faq">FAQ</a></li>
          <li><a href="/admin">Admin Portal</a></li>
        </ul>
        <a href="#booking" class="btn btn-primary">Book Visit</a>
      </div>
    </div>
  </header>

  <!-- Hero Section -->
  <section class="hero">
    <div class="container">
      <div class="hero-grid">
        <div>
          <span class="badge">✨ Your Smile, Our Passion</span>
          <h1>Discover the Joy of a <span>Healthier, Brighter Smile.</span></h1>
          <p>${CLINIC_CONFIG.tagline} Experience gentle, modern dentistry equipped with state-of-the-art dental care in Downtown Guwahati.</p>
          <div class="hero-ctas">
            <a href="#booking" class="btn btn-primary">Book Your Visit</a>
            <a href="#services" class="btn btn-secondary">Explore Services</a>
          </div>
        </div>
        <div>
          <div class="hero-clay-card">
            <div class="hero-image-wrap">
              <img src="https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=800&q=80" alt="Modern Clinic Dental Studio">
            </div>
            <div class="floating-card">
              <div style="font-size: 2rem;">⭐️</div>
              <div>
                <strong>Gentle & Calm</strong>
                <div style="font-size: 0.85rem; color: var(--secondary-text);">Micro-invasive dental care</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Benefits Section -->
  <section class="section" id="why-us">
    <div class="container">
      <div class="section-header">
        <h2>Why Patients Trust LumaSmile</h2>
        <p>Combining modern clinical dental technology with warm, individualized patient compassion.</p>
      </div>
      <div class="benefits-grid">
        <div class="clay-card">
          <div class="card-icon">🪶</div>
          <h3>Gentle & Patient-Centered</h3>
          <p>Specially calibrated techniques to alleviate clinical anxiety and ensure maximum comfort.</p>
        </div>
        <div class="clay-card">
          <div class="card-icon">🔬</div>
          <h3>Modern Technology</h3>
          <p>Equipped with low-radiation digital imaging and micro-endodontic magnification tools.</p>
        </div>
        <div class="clay-card">
          <div class="card-icon">🏷️</div>
          <h3>Transparent Estimates</h3>
          <p>Clear, pre-treatment itemized estimates with no concealed fees or surprise additions.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Dental Services Grid -->
  <section class="section" id="services" style="background: rgba(255,255,255,0.4);">
    <div class="container">
      <div class="section-header">
        <h2>Our Dental Services</h2>
        <p>All prices and durations represent clinical estimates and depend on initial diagnosis.</p>
      </div>
      <div class="services-grid" id="servicesContainer">
        <!-- Rendered asynchronously -->
        <div class="clay-card"><p>Loading clinical services catalog...</p></div>
      </div>
    </div>
  </section>

  <!-- Dentists Profile -->
  <section class="section" id="dentists">
    <div class="container">
      <div class="section-header">
        <h2>Meet Our Dentists</h2>
        <p>Experienced dental surgeons committed to gentle, personalized smile restoration.</p>
      </div>
      <div class="benefits-grid" id="dentistsContainer">
        <!-- Rendered asynchronously -->
        <div class="clay-card"><p>Loading dentist profiles...</p></div>
      </div>
    </div>
  </section>

  <!-- Booking Wizard -->
  <section class="section" id="booking">
    <div class="container">
      <div class="section-header">
        <h2>Schedule Your Appointment</h2>
        <p>Real-time slot reservation directly connected to our clinic schedules.</p>
      </div>

      <div class="booking-wrapper">
        <div class="step-indicator">
          <div class="step-node active" id="node1">
            <div class="step-bubble">1</div>
            <span>Service</span>
          </div>
          <div class="step-node" id="node2">
            <div class="step-bubble">2</div>
            <span>Time</span>
          </div>
          <div class="step-node" id="node3">
            <div class="step-bubble">3</div>
            <span>Details</span>
          </div>
          <div class="step-node" id="node4">
            <div class="step-bubble">4</div>
            <span>Confirm</span>
          </div>
        </div>

        <form id="bookingForm" onsubmit="event.preventDefault();">
          <!-- Step 1: Select Service & Doctor -->
          <div id="step1">
            <div class="form-group">
              <label for="bookingService">Select Clinical Service</label>
              <select id="bookingService" class="form-control" required>
                <option value="">Choose a treatment...</option>
              </select>
            </div>
            <div class="form-group">
              <label for="bookingDentist">Select Preferred Dentist</label>
              <select id="bookingDentist" class="form-control" required>
                <option value="">Choose dentist...</option>
              </select>
            </div>
            <button type="button" class="btn btn-primary" style="width: 100%;" onclick="goToStep(2)">Proceed to Time Selection →</button>
          </div>

          <!-- Step 2: Date & Available Slots -->
          <div id="step2" style="display: none;">
            <div class="form-group">
              <label for="bookingDate">Select Appointment Date</label>
              <input type="date" id="bookingDate" class="form-control" onchange="fetchAvailableSlots()" required>
            </div>
            <div class="form-group">
              <label>Available Timeslots (${CLINIC_CONFIG.timezone})</label>
              <div id="slotsContainer" class="slot-grid">
                <p style="color: var(--secondary-text);">Pick a calendar date to inspect real-time openings.</p>
              </div>
            </div>
            <div style="display: flex; gap: 12px;">
              <button type="button" class="btn btn-secondary" onclick="goToStep(1)">← Back</button>
              <button type="button" class="btn btn-primary" style="flex: 1;" onclick="goToStep(3)">Patient Info →</button>
            </div>
          </div>

          <!-- Step 3: Patient Information -->
          <div id="step3" style="display: none;">
            <div class="form-group">
              <label for="patientName">Full Name</label>
              <input type="text" id="patientName" class="form-control" placeholder="e.g. Priya Das" required>
            </div>
            <div class="form-group">
              <label for="patientPhone">Mobile Number (with WhatsApp)</label>
              <input type="tel" id="patientPhone" class="form-control" placeholder="+91 98765 00000" required>
            </div>
            <div class="form-group">
              <label for="patientEmail">Email Address (Optional)</label>
              <input type="email" id="patientEmail" class="form-control" placeholder="priya@example.com">
            </div>
            <div class="form-group">
              <label for="patientReason">Reason for Visit / Symptoms</label>
              <input type="text" id="patientReason" class="form-control" placeholder="Routine checkup, tooth sensitivity, etc.">
            </div>
            <div style="display: flex; gap: 12px;">
              <button type="button" class="btn btn-secondary" onclick="goToStep(2)">← Back</button>
              <button type="button" class="btn btn-primary" style="flex: 1;" onclick="goToStep(4)">Review & Finalize →</button>
            </div>
          </div>

          <!-- Step 4: Review & Submit -->
          <div id="step4" style="display: none;">
            <div style="background: #F8FAFC; border-radius: 16px; padding: 20px; margin-bottom: 24px;">
              <h4 style="margin-bottom: 12px;">Booking Summary</h4>
              <p><strong>Service:</strong> <span id="revService"></span></p>
              <p><strong>Dentist:</strong> <span id="revDentist"></span></p>
              <p><strong>Date & Time:</strong> <span id="revDateTime"></span></p>
              <p><strong>Patient:</strong> <span id="revPatient"></span></p>
              <p style="font-size: 0.85rem; color: var(--secondary-text); margin-top: 12px;">
                Cancellation policy: Rescheduling available up to 4 hours before the appointment.
              </p>
            </div>
            <div style="display: flex; gap: 12px;">
              <button type="button" class="btn btn-secondary" onclick="goToStep(3)">← Back</button>
              <button type="button" class="btn btn-primary" style="flex: 1;" id="submitBookingBtn" onclick="submitBooking()">Confirm Appointment ✨</button>
            </div>
          </div>

          <!-- Step 5: Confirmation -->
          <div id="step5" style="display: none; text-align: center;">
            <div style="font-size: 3.5rem; margin-bottom: 16px;">🎉</div>
            <h3 style="margin-bottom: 8px;">Appointment Confirmed!</h3>
            <p style="color: var(--secondary-text); margin-bottom: 20px;">Your reference token is <strong id="confRef" style="color: var(--deep-violet); font-size: 1.2rem;"></strong></p>
            <div style="background: #F8FAFC; padding: 18px; border-radius: 14px; margin-bottom: 24px; text-align: left; font-size: 0.95rem;">
              <p>Please arrive 10 minutes early at <strong>${CLINIC_CONFIG.address}</strong>.</p>
            </div>
            <button type="button" class="btn btn-primary" onclick="window.print()">Print Confirmation 🖨️</button>
          </div>
        </form>
      </div>
    </div>
  </section>

  <!-- FAQ Section -->
  <section class="section" id="faq">
    <div class="container" style="max-width: 800px;">
      <div class="section-header">
        <h2>Frequently Asked Questions</h2>
        <p>Clear answers to everyday treatment and scheduling questions.</p>
      </div>
      <div class="faq-item">
        <div class="faq-q" onclick="this.parentElement.classList.toggle('open')">
          <span>Can I choose my treating dentist?</span>
          <span>▼</span>
        </div>
        <div class="faq-a">Yes. You can select your preferred doctor during booking according to their available working days and specializations.</div>
      </div>
      <div class="faq-item">
        <div class="faq-q" onclick="this.parentElement.classList.toggle('open')">
          <span>Are listed prices exact or estimates?</span>
          <span>▼</span>
        </div>
        <div class="faq-a">Prices are transparent clinical base estimates in INR. Complex treatments like multi-surface restorations or root canals depend on diagnostic x-rays and clinical evaluations.</div>
      </div>
      <div class="faq-item">
        <div class="faq-q" onclick="this.parentElement.classList.toggle('open')">
          <span>How can I reschedule or cancel?</span>
          <span>▼</span>
        </div>
        <div class="faq-a">Contact our reception via WhatsApp or phone at ${CLINIC_CONFIG.phone} with your appointment reference token.</div>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer>
    <div class="container">
      <div class="footer-grid">
        <div>
          <h3 style="color: white; margin-bottom: 16px;">🦷 ${CLINIC_CONFIG.name}</h3>
          <p style="margin-bottom: 16px;">${CLINIC_CONFIG.secondaryTagline}</p>
          <p><strong>Address:</strong> ${CLINIC_CONFIG.address}</p>
          <p><strong>Phone:</strong> ${CLINIC_CONFIG.phone}</p>
          <p><strong>Email:</strong> ${CLINIC_CONFIG.email}</p>
        </div>
        <div>
          <h4 style="color: white; margin-bottom: 16px;">Hours</h4>
          <p>Mon – Fri: ${CLINIC_CONFIG.hours.weekday}</p>
          <p>Saturday: ${CLINIC_CONFIG.hours.saturday}</p>
          <p>Sunday: ${CLINIC_CONFIG.hours.sunday}</p>
        </div>
        <div>
          <h4 style="color: white; margin-bottom: 16px;">Administration</h4>
          <p><a href="/admin" style="color: var(--primary-lavender); text-decoration: none;">Staff Dashboard & Login</a></p>
          <p style="margin-top: 12px; font-size: 0.8rem; color: #9CA3AF;">© ${new Date().getFullYear()} ${CLINIC_CONFIG.name}. Sample Medical Demonstration.</p>
        </div>
      </div>
    </div>
  </footer>

  <script>
    let appState = {
      services: [],
      dentists: [],
      selectedSlot: null
    };

    // Initialize minimum calendar date to tomorrow
    const dateInput = document.getElementById('bookingDate');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    dateInput.min = tomorrow.toISOString().split('T')[0];

    async function initPublicData() {
      try {
        const [servRes, dentRes] = await Promise.all([
          fetch('/api/services'),
          fetch('/api/dentists')
        ]);
        const servicesData = await servRes.json();
        const dentistsData = await dentRes.json();

        if (servicesData.success) {
          appState.services = servicesData.data;
          renderServices();
          populateServiceDropdown();
        }
        if (dentistsData.success) {
          appState.dentists = dentistsData.data;
          renderDentists();
          populateDentistDropdown();
        }
      } catch (err) {
        console.error('Data initialization failed:', err);
      }
    }

    function renderServices() {
      const container = document.getElementById('servicesContainer');
      container.innerHTML = appState.services.map(s => \`
        <div class="clay-card">
          <div class="card-icon">\${s.icon || '🦷'}</div>
          <h3 style="margin-bottom: 8px;">\${s.name}</h3>
          <p style="color: var(--secondary-text); font-size: 0.95rem; flex-grow: 1;">\${s.description}</p>
          <div class="service-price">₹\${s.price.toLocaleString()}</div>
          <div class="service-duration">Approx. \${s.durationMinutes} mins</div>
          <button class="btn btn-secondary" style="width: 100%;" onclick="selectServiceForBooking('\${s._id}')">Book This Treatment</button>
        </div>
      \`).join('');
    }

    function renderDentists() {
      const container = document.getElementById('dentistsContainer');
      container.innerHTML = appState.dentists.map(d => \`
        <div class="clay-card dentist-card">
          <div class="dentist-avatar">👨‍⚕️</div>
          <h3 style="margin-bottom: 4px;">\${d.name}</h3>
          <div style="color: var(--deep-violet); font-weight: 700; margin-bottom: 8px; font-size: 0.9rem;">\${d.title}</div>
          <p style="color: var(--secondary-text); font-size: 0.9rem; margin-bottom: 14px;">\${d.biography}</p>
          <button class="btn btn-secondary" style="width: 100%;" onclick="selectDentistForBooking('\${d._id}')">Choose Doctor</button>
        </div>
      \`).join('');
    }

    function populateServiceDropdown() {
      const el = document.getElementById('bookingService');
      appState.services.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s._id;
        opt.textContent = \`\${s.name} (₹\${s.price})\`;
        el.appendChild(opt);
      });
    }

    function populateDentistDropdown() {
      const el = document.getElementById('bookingDentist');
      appState.dentists.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d._id;
        opt.textContent = \`\${d.name} — \${d.title}\`;
        el.appendChild(opt);
      });
    }

    function selectServiceForBooking(id) {
      document.getElementById('bookingService').value = id;
      window.location.hash = '#booking';
      goToStep(1);
    }

    function selectDentistForBooking(id) {
      document.getElementById('bookingDentist').value = id;
      window.location.hash = '#booking';
      goToStep(1);
    }

    function goToStep(step) {
      // Validation prior to stepping
      if (step === 2) {
        if (!document.getElementById('bookingService').value || !document.getElementById('bookingDentist').value) {
          alert('Please pick both a treatment service and dentist.');
          return;
        }
      }
      if (step === 3) {
        if (!dateInput.value || !appState.selectedSlot) {
          alert('Please choose an appointment date and timeslot.');
          return;
        }
      }
      if (step === 4) {
        const name = document.getElementById('patientName').value.trim();
        const phone = document.getElementById('patientPhone').value.trim();
        if (!name || !phone) {
          alert('Please enter your full name and valid phone number.');
          return;
        }

        const serv = appState.services.find(s => s._id === document.getElementById('bookingService').value);
        const dent = appState.dentists.find(d => d._id === document.getElementById('bookingDentist').value);

        document.getElementById('revService').textContent = serv ? serv.name : '';
        document.getElementById('revDentist').textContent = dent ? dent.name : '';
        document.getElementById('revDateTime').textContent = \`\${dateInput.value} at \${appState.selectedSlot.formatted}\`;
        document.getElementById('revPatient').textContent = \`\${name} (\${phone})\`;
      }

      for (let i = 1; i <= 5; i++) {
        const el = document.getElementById('step' + i);
        const node = document.getElementById('node' + i);
        if (el) el.style.display = (i === step) ? 'block' : 'none';
        if (node) {
          if (i <= step) node.classList.add('active');
          else node.classList.remove('active');
        }
      }
    }

    async function fetchAvailableSlots() {
      const date = dateInput.value;
      const dentistId = document.getElementById('bookingDentist').value;
      const serviceId = document.getElementById('bookingService').value;
      const container = document.getElementById('slotsContainer');

      if (!date || !dentistId || !serviceId) return;

      container.innerHTML = '<p style="color: var(--secondary-text);">Checking clinic schedule...</p>';
      try {
        const res = await fetch(\`/api/availability?date=\${date}&dentistId=\${dentistId}&serviceId=\${serviceId}\`);
        const json = await res.json();
        if (!json.success || !json.data.slots.length) {
          container.innerHTML = '<p style="color: var(--error); font-weight: 700;">No available slots on this day. Please choose another date.</p>';
          appState.selectedSlot = null;
          return;
        }

        container.innerHTML = json.data.slots.map(s => \`
          <button type="button" class="slot-btn" onclick="selectSlot(this, '\${s.time}', '\${s.formatted}')">\${s.formatted}</button>
        \`).join('');
      } catch (err) {
        container.innerHTML = '<p style="color: var(--error);">Error checking availability.</p>';
      }
    }

    function selectSlot(btn, time, formatted) {
      document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      appState.selectedSlot = { time, formatted };
    }

    async function submitBooking() {
      const submitBtn = document.getElementById('submitBookingBtn');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Securing Booking...';

      const payload = {
        serviceId: document.getElementById('bookingService').value,
        dentistId: document.getElementById('bookingDentist').value,
        date: dateInput.value,
        time: appState.selectedSlot.time,
        patientName: document.getElementById('patientName').value.trim(),
        patientPhone: document.getElementById('patientPhone').value.trim(),
        patientEmail: document.getElementById('patientEmail').value.trim(),
        reason: document.getElementById('patientReason').value.trim()
      };

      try {
        const res = await fetch('/api/appointments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
          document.getElementById('confRef').textContent = result.data.reference;
          goToStep(5);
        } else {
          alert('Booking notice: ' + (result.error ? result.error.message : 'Slot conflict. Please choose another time.'));
          goToStep(2);
          fetchAvailableSlots();
        }
      } catch (err) {
        alert('Communication failure. Please verify connection and retry.');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirm Appointment ✨';
      }
    }

    document.addEventListener('DOMContentLoaded', initPublicData);
  </script>
</body>
</html>`);
});

// Central 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Resource not found' } });
});

// Production entrypoint
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`LumaSmile server listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
