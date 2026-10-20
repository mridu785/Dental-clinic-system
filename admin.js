/**
 * LumaSmile Dental Studio - Administrator Dashboard (Claymorphism UI Engine)
 */

function renderAdminApp(config) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Clinic Management — ${config.name}</title>
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
      --warning: #FBBF24;
      --error: #F87171;
      --clay-shadow-raised: 8px 10px 24px rgba(109, 91, 208, 0.10), -8px -8px 20px rgba(255, 255, 255, 0.95);
      --clay-shadow-button: 6px 8px 18px rgba(109, 91, 208, 0.22), -5px -5px 14px rgba(255, 255, 255, 0.9);
      --clay-shadow-inset: inset 4px 4px 8px rgba(109, 91, 208, 0.08), inset -4px -4px 8px rgba(255, 255, 255, 0.9);
      --radius-large: 24px;
      --radius-small: 14px;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Nunito', sans-serif;
      background-color: var(--warm-cream);
      color: var(--main-text);
      display: flex;
      min-height: 100vh;
    }

    /* Auth Overlay Modal */
    #authOverlay {
      position: fixed;
      inset: 0;
      background: rgba(48, 42, 66, 0.6);
      backdrop-filter: blur(8px);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .auth-box {
      background: white;
      border-radius: var(--radius-large);
      box-shadow: var(--clay-shadow-raised);
      padding: 40px;
      width: 100%;
      max-width: 420px;
      text-align: center;
    }

    /* Layout */
    .sidebar {
      width: 260px;
      background: white;
      border-right: 1px solid rgba(109, 91, 208, 0.08);
      padding: 28px 20px;
      display: flex;
      flex-direction: column;
      gap: 32px;
    }
    .main-content {
      flex: 1;
      padding: 32px 40px;
      overflow-y: auto;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 900;
      font-size: 1.15rem;
      color: var(--main-text);
    }
    .brand-icon {
      background: linear-gradient(135deg, var(--primary-lavender), var(--deep-violet));
      color: white;
      width: 38px;
      height: 38px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .nav-menu { list-style: none; display: flex; flex-direction: column; gap: 8px; }
    .nav-btn {
      width: 100%;
      text-align: left;
      padding: 12px 18px;
      border-radius: var(--radius-small);
      border: none;
      background: transparent;
      color: var(--secondary-text);
      font-weight: 800;
      font-size: 0.95rem;
      font-family: inherit;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 12px;
      transition: all 0.2s ease;
    }
    .nav-btn:hover, .nav-btn.active {
      background: #EDE9FE;
      color: var(--deep-violet);
      box-shadow: var(--clay-shadow-raised);
    }

    /* Buttons */
    .btn {
      padding: 10px 20px;
      border-radius: var(--radius-small);
      font-weight: 800;
      border: none;
      cursor: pointer;
      font-family: inherit;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .btn-primary {
      background: linear-gradient(135deg, var(--primary-lavender), var(--deep-violet));
      color: white;
      box-shadow: var(--clay-shadow-button);
    }
    .btn-secondary {
      background: white;
      color: var(--main-text);
      box-shadow: var(--clay-shadow-raised);
    }

    /* Clay Cards */
    .clay-card {
      background: white;
      border-radius: var(--radius-large);
      padding: 24px;
      box-shadow: var(--clay-shadow-raised);
      margin-bottom: 24px;
    }

    /* Top Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 28px;
    }
    .stat-val { font-size: 2.2rem; font-weight: 900; color: var(--deep-violet); }
    .stat-label { font-size: 0.85rem; font-weight: 700; color: var(--secondary-text); }

    /* Tables */
    .table-responsive { width: 100%; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; margin-top: 14px; }
    th { text-align: left; padding: 12px 14px; font-size: 0.85rem; color: var(--secondary-text); border-bottom: 1px solid #F3F4F6; }
    td { padding: 14px; font-size: 0.9rem; border-bottom: 1px solid #F8FAFC; }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 800;
    }
    .badge-confirmed { background: #D1FAE5; color: #065F46; }
    .badge-completed { background: #EDE9FE; color: #5B21B6; }
    .badge-cancelled { background: #FEE2E2; color: #991B1B; }

    .form-control {
      width: 100%;
      padding: 12px 14px;
      border-radius: var(--radius-small);
      border: 1px solid #E5E7EB;
      background: #F8FAFC;
      box-shadow: var(--clay-shadow-inset);
      outline: none;
      font-family: inherit;
      margin-bottom: 14px;
    }

    @media (max-width: 768px) {
      body { flex-direction: column; }
      .sidebar { width: 100%; border-right: none; }
      .main-content { padding: 20px; }
    }
  </style>
</head>
<body>

  <!-- Auth Protection Modal -->
  <div id="authOverlay">
    <div class="auth-box">
      <div style="font-size: 2.5rem; margin-bottom: 12px;">🔐</div>
      <h2 style="margin-bottom: 6px;">Staff Authentication</h2>
      <p style="color: var(--secondary-text); font-size: 0.9rem; margin-bottom: 24px;">LumaSmile Administration Engine</p>
      <form onsubmit="handleAdminLogin(event)">
        <input type="email" id="loginEmail" class="form-control" placeholder="Admin Email" required>
        <input type="password" id="loginPassword" class="form-control" placeholder="Password" required>
        <button type="submit" class="btn btn-primary" style="width: 100%; justify-content: center;">Authenticate</button>
      </form>
    </div>
  </div>

  <!-- Main Administrative Shell -->
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-icon">🦷</div>
      <span>LumaSmile Studio</span>
    </div>
    <ul class="nav-menu">
      <li><button class="nav-btn active" onclick="switchTab('dashboard')">📊 Overview</button></li>
      <li><button class="nav-btn" onclick="switchTab('appointments')">📅 Appointments</button></li>
      <li><button class="nav-btn" onclick="switchTab('services')">✨ Services</button></li>
      <li><button class="nav-btn" onclick="switchTab('dentists')">👨‍⚕️ Doctors</button></li>
      <li><button class="nav-btn" onclick="switchTab('settings')">⚙️ Settings</button></li>
    </ul>
    <div style="margin-top: auto;">
      <button class="btn btn-secondary" style="width: 100%;" onclick="handleAdminLogout()">Log Out 🚪</button>
    </div>
  </aside>

  <main class="main-content">
    <!-- Header -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px;">
      <div>
        <h1 id="tabTitle">Overview Dashboard</h1>
        <p style="color: var(--secondary-text); font-size: 0.9rem;">Authenticated Administrative Control</p>
      </div>
      <div>
        <a href="/api/admin/export/appointments.csv" class="btn btn-secondary">Export Appointments (CSV) 📥</a>
      </div>
    </div>

    <!-- TAB 1: OVERVIEW -->
    <div id="tabDashboard">
      <div class="stats-grid">
        <div class="clay-card">
          <div class="stat-label">TOTAL BOOKINGS</div>
          <div class="stat-val" id="statTotal">0</div>
        </div>
        <div class="clay-card">
          <div class="stat-label">TODAY'S PATIENTS</div>
          <div class="stat-val" id="statToday" style="color: var(--coral);">0</div>
        </div>
        <div class="clay-card">
          <div class="stat-label">CONFIRMED</div>
          <div class="stat-val" id="statConfirmed" style="color: var(--success);">0</div>
        </div>
        <div class="clay-card">
          <div class="stat-label">CANCELLED</div>
          <div class="stat-val" id="statCancelled" style="color: var(--error);">0</div>
        </div>
      </div>

      <div class="clay-card">
        <h3>Recent Bookings</h3>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>REF</th>
                <th>Patient</th>
                <th>Service</th>
                <th>Doctor</th>
                <th>Date / Time</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="recentTableBody"></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 2: APPOINTMENTS -->
    <div id="tabAppointments" style="display: none;">
      <div class="clay-card">
        <div style="display: flex; gap: 14px; margin-bottom: 16px; flex-wrap: wrap;">
          <input type="text" id="searchApt" class="form-control" style="max-width: 260px; margin-bottom: 0;" placeholder="Search by name / reference..." oninput="loadAppointments()">
          <select id="filterStatus" class="form-control" style="max-width: 180px; margin-bottom: 0;" onchange="loadAppointments()">
            <option value="all">All Statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Ref</th>
                <th>Patient</th>
                <th>Contact</th>
                <th>Service</th>
                <th>Doctor</th>
                <th>Start Time</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="allAppointmentsBody"></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 3: SERVICES -->
    <div id="tabServices" style="display: none;">
      <div class="clay-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h3>Clinical Services Catalog</h3>
        </div>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Icon</th>
                <th>Service Title</th>
                <th>Est. Price</th>
                <th>Duration</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="servicesTableBody"></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 4: DENTISTS -->
    <div id="tabDentists" style="display: none;">
      <div class="clay-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h3>Doctor Rosters</h3>
        </div>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Doctor</th>
                <th>Title</th>
                <th>Qualifications</th>
                <th>Working Hours</th>
              </tr>
            </thead>
            <tbody id="dentistsTableBody"></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 5: SETTINGS -->
    <div id="tabSettings" style="display: none;">
      <div class="clay-card" style="max-width: 600px;">
        <h3 style="margin-bottom: 18px;">Clinic Configuration</h3>
        <p><strong>Clinic Name:</strong> ${config.name}</p>
        <p><strong>Downtown Address:</strong> ${config.address}</p>
        <p><strong>Direct Helpline:</strong> ${config.phone}</p>
        <p><strong>Clinic Timezone:</strong> ${config.timezone}</p>
        <p><strong>Active Currency:</strong> ${config.currency}</p>
      </div>
    </div>
  </main>

  <script>
    async function checkAuthSession() {
      try {
        const res = await fetch('/api/admin/me');
        const json = await res.json();
        if (json.success) {
          document.getElementById('authOverlay').style.display = 'none';
          loadDashboardData();
        } else {
          document.getElementById('authOverlay').style.display = 'flex';
        }
      } catch {
        document.getElementById('authOverlay').style.display = 'flex';
      }
    }

    async function handleAdminLogin(e) {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value;
      const password = document.getElementById('loginPassword').value;

      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const json = await res.json();
        if (json.success) {
          document.getElementById('authOverlay').style.display = 'none';
          loadDashboardData();
        } else {
          alert('Login failed: ' + (json.error ? json.error.message : 'Invalid credentials'));
        }
      } catch {
        alert('Server unreachable');
      }
    }

    async function handleAdminLogout() {
      await fetch('/api/admin/logout', { method: 'POST' });
      window.location.reload();
    }

    function switchTab(tab) {
      ['dashboard', 'appointments', 'services', 'dentists', 'settings'].forEach(t => {
        const el = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1));
        if (el) el.style.display = (t === tab) ? 'block' : 'none';
      });
      document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
      event.target.classList.add('active');

      if (tab === 'dashboard') loadDashboardData();
      if (tab === 'appointments') loadAppointments();
      if (tab === 'services') loadServices();
      if (tab === 'dentists') loadDentists();
    }

    async function loadDashboardData() {
      try {
        const res = await fetch('/api/admin/dashboard');
        const json = await res.json();
        if (json.success) {
          const { stats, recentAppointments } = json.data;
          document.getElementById('statTotal').textContent = stats.total;
          document.getElementById('statToday').textContent = stats.today;
          document.getElementById('statConfirmed').textContent = stats.confirmed;
          document.getElementById('statCancelled').textContent = stats.cancelled;

          const tbody = document.getElementById('recentTableBody');
          tbody.innerHTML = recentAppointments.map(a => \`
            <tr>
              <td><strong>\${a.reference}</strong></td>
              <td>\${a.patientName}</td>
              <td>\${a.serviceId ? a.serviceId.name : 'N/A'}</td>
              <td>\${a.dentistId ? a.dentistId.name : 'N/A'}</td>
              <td>\${new Date(a.appointmentStart).toLocaleString()}</td>
              <td><span class="badge badge-\${a.status}">\${a.status}</span></td>
            </tr>
          \`).join('');
        }
      } catch (err) {
        console.error(err);
      }
    }

    async function loadAppointments() {
      const search = document.getElementById('searchApt').value;
      const status = document.getElementById('filterStatus').value;
      try {
        const res = await fetch(\`/api/admin/appointments?search=\${encodeURIComponent(search)}&status=\${status}\`);
        const json = await res.json();
        if (json.success) {
          const tbody = document.getElementById('allAppointmentsBody');
          tbody.innerHTML = json.data.appointments.map(a => \`
            <tr>
              <td><strong>\${a.reference}</strong></td>
              <td>\${a.patientName}</td>
              <td>\${a.patientPhone}</td>
              <td>\${a.serviceId ? a.serviceId.name : 'N/A'}</td>
              <td>\${a.dentistId ? a.dentistId.name : 'N/A'}</td>
              <td>\${new Date(a.appointmentStart).toLocaleString()}</td>
              <td><span class="badge badge-\${a.status}">\${a.status}</span></td>
              <td>
                <select onchange="updateAppointmentStatus('\${a._id}', this.value)" style="padding: 4px; border-radius: 8px;">
                  <option value="">Update...</option>
                  <option value="confirmed">Confirm</option>
                  <option value="completed">Complete</option>
                  <option value="cancelled">Cancel</option>
                </select>
              </td>
            </tr>
          \`).join('');
        }
      } catch (err) {
        console.error(err);
      }
    }

    async function updateAppointmentStatus(id, status) {
      if (!status) return;
      try {
        const res = await fetch(\`/api/admin/appointments/\${id}/status\`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
        const json = await res.json();
        if (json.success) loadAppointments();
        else alert('Update rejected: ' + json.error.message);
      } catch {
        alert('Server connection error.');
      }
    }

    async function loadServices() {
      const res = await fetch('/api/services');
      const json = await res.json();
      if (json.success) {
        document.getElementById('servicesTableBody').innerHTML = json.data.map(s => \`
          <tr>
            <td style="font-size: 1.5rem;">\${s.icon || '🦷'}</td>
            <td><strong>\${s.name}</strong><br><small style="color: var(--secondary-text)">\${s.description}</small></td>
            <td>₹\${s.price.toLocaleString()}</td>
            <td>\${s.durationMinutes} mins</td>
            <td><span class="badge badge-confirmed">Active</span></td>
          </tr>
        \`).join('');
      }
    }

    async function loadDentists() {
      const res = await fetch('/api/dentists');
      const json = await res.json();
      if (json.success) {
        document.getElementById('dentistsTableBody').innerHTML = json.data.map(d => \`
          <tr>
            <td><strong>\${d.name}</strong></td>
            <td>\${d.title}</td>
            <td>\${d.qualifications}</td>
            <td>\${d.workingHours.start} - \${d.workingHours.end}</td>
          </tr>
        \`).join('');
      }
    }

    document.addEventListener('DOMContentLoaded', checkAuthSession);
  </script>
</body>
</html>`;
}

module.exports = { renderAdminApp };
