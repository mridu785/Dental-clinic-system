/**
 * LumaSmile Dental Studio - Administrator Dashboard (Claymorphism UI Engine)
 */

function renderAdminApp(config) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Area — ${config.name}</title>
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary-lavender: #A78BFA;
      --deep-violet: #6D5BD0;
      --warm-cream: #FFF8F1;
      --main-text: #302A42;
      --secondary-text: #77718B;
      --clay-shadow-raised: 8px 10px 24px rgba(109, 91, 208, 0.10), -8px -8px 20px rgba(255, 255, 255, 0.95);
      --clay-shadow-button: 6px 8px 18px rgba(109, 91, 208, 0.22), -5px -5px 14px rgba(255, 255, 255, 0.9);
      --clay-shadow-inset: inset 4px 4px 8px rgba(109, 91, 208, 0.08), inset -4px -4px 8px rgba(255, 255, 255, 0.9);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Nunito', sans-serif; background: var(--warm-cream); color: var(--main-text); display: flex; min-height: 100vh; }
    
    #authOverlay { position: fixed; inset: 0; background: rgba(48, 42, 66, 0.6); backdrop-filter: blur(8px); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .auth-box { background: white; border-radius: 24px; box-shadow: var(--clay-shadow-raised); padding: 40px; width: 100%; max-width: 420px; text-align: center; }
    
    .sidebar { width: 260px; background: white; padding: 28px 20px; display: flex; flex-direction: column; gap: 32px; border-right: 1px solid rgba(0,0,0,0.05); }
    .main-content { flex: 1; padding: 32px 40px; overflow-y: auto; }
    .nav-btn { width: 100%; text-align: left; padding: 12px 18px; border-radius: 14px; border: none; background: transparent; color: var(--secondary-text); font-weight: 800; cursor: pointer; transition: all 0.2s ease; margin-bottom: 8px;}
    .nav-btn:hover, .nav-btn.active { background: #EDE9FE; color: var(--deep-violet); box-shadow: var(--clay-shadow-raised); }
    
    .btn { padding: 10px 20px; border-radius: 14px; font-weight: 800; border: none; cursor: pointer; font-family: inherit; }
    .btn-primary { background: linear-gradient(135deg, var(--primary-lavender), var(--deep-violet)); color: white; box-shadow: var(--clay-shadow-button); }
    .btn-secondary { background: white; color: var(--main-text); box-shadow: var(--clay-shadow-raised); }
    
    .clay-card { background: white; border-radius: 24px; padding: 24px; box-shadow: var(--clay-shadow-raised); margin-bottom: 24px; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 28px; }
    
    table { width: 100%; border-collapse: collapse; margin-top: 14px; }
    th { text-align: left; padding: 12px; font-size: 0.85rem; color: var(--secondary-text); border-bottom: 1px solid #F3F4F6; }
    td { padding: 14px 12px; font-size: 0.9rem; border-bottom: 1px solid #F8FAFC; }
    .form-control { width: 100%; padding: 12px; border-radius: 14px; border: 1px solid #E5E7EB; background: #F8FAFC; box-shadow: var(--clay-shadow-inset); font-family: inherit; margin-bottom: 14px; outline: none; }
  </style>
</head>
<body>

  <div id="authOverlay">
    <div class="auth-box">
      <div style="font-size: 2.5rem; margin-bottom: 12px;">🔐</div>
      <h2 style="margin-bottom: 6px;">Staff Portal</h2>
      <p style="color: var(--secondary-text); font-size: 0.9rem; margin-bottom: 24px;">LumaSmile Administration Engine</p>
      <form onsubmit="handleAdminLogin(event)">
        <input type="text" id="loginUsername" class="form-control" placeholder="Admin Username" required>
        <input type="password" id="loginPassword" class="form-control" placeholder="Password" required>
        <button type="submit" class="btn btn-primary" style="width: 100%;">Authenticate</button>
      </form>
    </div>
  </div>

  <aside class="sidebar">
    <div style="font-weight: 900; font-size: 1.15rem;">🦷 LumaSmile Studio</div>
    <div>
      <button class="nav-btn active" onclick="switchTab('dashboard')">📊 Overview</button>
      <button class="nav-btn" onclick="switchTab('appointments')">📅 Appointments</button>
    </div>
    <div style="margin-top: auto;">
      <button class="btn btn-secondary" style="width: 100%;" onclick="handleAdminLogout()">Log Out 🚪</button>
    </div>
  </aside>

  <main class="main-content">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px;">
      <h1>Administrative Control</h1>
      <a href="/api/admin/export/appointments.csv" class="btn btn-secondary">Export CSV 📥</a>
    </div>

    <!-- TAB 1: OVERVIEW -->
    <div id="tabDashboard">
      <div class="stats-grid">
        <div class="clay-card">
          <div style="font-size: 0.85rem; font-weight: 700; color: var(--secondary-text);">TOTAL BOOKINGS</div>
          <div style="font-size: 2.2rem; font-weight: 900; color: var(--deep-violet);" id="statTotal">0</div>
        </div>
        <div class="clay-card">
          <div style="font-size: 0.85rem; font-weight: 700; color: var(--secondary-text);">TODAY'S PATIENTS</div>
          <div style="font-size: 2.2rem; font-weight: 900; color: #FF8A80;" id="statToday">0</div>
        </div>
      </div>

      <div class="clay-card">
        <h3>Recent Bookings</h3>
        <table>
          <thead><tr><th>REF</th><th>Patient</th><th>Service</th><th>Date</th><th>Status</th></tr></thead>
          <tbody id="recentTableBody"></tbody>
        </table>
      </div>
    </div>

    <!-- TAB 2: APPOINTMENTS -->
    <div id="tabAppointments" style="display: none;">
      <div class="clay-card">
        <input type="text" id="searchApt" class="form-control" style="max-width: 300px;" placeholder="Search by name / reference..." oninput="loadAppointments()">
        <table>
          <thead><tr><th>Ref</th><th>Patient</th><th>Contact</th><th>Start Time</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody id="allAppointmentsBody"></tbody>
        </table>
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
        } else document.getElementById('authOverlay').style.display = 'flex';
      } catch { document.getElementById('authOverlay').style.display = 'flex'; }
    }

    async function handleAdminLogin(e) {
      e.preventDefault();
      const username = document.getElementById('loginUsername').value;
      const password = document.getElementById('loginPassword').value;
      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const json = await res.json();
        if (json.success) {
          document.getElementById('authOverlay').style.display = 'none';
          loadDashboardData();
        } else alert('Login rejected: ' + (json.error ? json.error.message : 'Invalid credentials.'));
      } catch { alert('Server network error.'); }
    }

    async function handleAdminLogout() {
      await fetch('/api/admin/logout', { method: 'POST' });
      window.location.reload();
    }

    function switchTab(tab) {
      document.getElementById('tabDashboard').style.display = tab === 'dashboard' ? 'block' : 'none';
      document.getElementById('tabAppointments').style.display = tab === 'appointments' ? 'block' : 'none';
      document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
      event.target.classList.add('active');
      if (tab === 'dashboard') loadDashboardData();
      if (tab === 'appointments') loadAppointments();
    }

    async function loadDashboardData() {
      const res = await fetch('/api/admin/dashboard');
      const json = await res.json();
      if (json.success) {
        document.getElementById('statTotal').textContent = json.data.stats.total;
        document.getElementById('statToday').textContent = json.data.stats.today;
        document.getElementById('recentTableBody').innerHTML = json.data.recentAppointments.map(a => \`<tr><td><strong>\${a.reference}</strong></td><td>\${a.patientName}</td><td>\${a.serviceId?.name}</td><td>\${new Date(a.appointmentStart).toLocaleString()}</td><td>\${a.status}</td></tr>\`).join('');
      }
    }

    async function loadAppointments() {
      const search = encodeURIComponent(document.getElementById('searchApt').value);
      const res = await fetch(\`/api/admin/appointments?search=\${search}\`);
      const json = await res.json();
      if (json.success) {
        document.getElementById('allAppointmentsBody').innerHTML = json.data.appointments.map(a => \`<tr><td><strong>\${a.reference}</strong></td><td>\${a.patientName}</td><td>\${a.patientPhone}</td><td>\${new Date(a.appointmentStart).toLocaleString()}</td><td>\${a.status}</td><td><select onchange="updateAppointmentStatus('\${a._id}', this.value)" style="padding: 4px; border-radius: 8px;"><option value="">Update...</option><option value="confirmed">Confirm</option><option value="completed">Complete</option><option value="cancelled">Cancel</option></select></td></tr>\`).join('');
      }
    }

    async function updateAppointmentStatus(id, status) {
      if (!status) return;
      const res = await fetch(\`/api/admin/appointments/\${id}/status\`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const json = await res.json();
      if (json.success) loadAppointments();
      else alert('Update failed: ' + json.error.message);
    }

    document.addEventListener('DOMContentLoaded', checkAuthSession);
  </script>
</body>
</html>`;
}

module.exports = { renderAdminApp };
