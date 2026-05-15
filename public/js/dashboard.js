(function () {
  'use strict';

  requireAuth();

  const emp = getEmployee();
  if (!emp) return;

  document.getElementById('welcomeName').textContent = emp.name;
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = emp.role === 'Admin' ? '' : 'none';
  });

  const todayDate = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const todayEl = document.getElementById('todayDate');
  if (todayEl) todayEl.textContent = todayDate;

  async function loadDashboard() {
    try {
      const data = await apiRequest(`/dashboard-summary/${emp.id}`);
      if (!data) return;

      updateStats(data);
      updateCheckinSection(data);
      updateLeaveBalance(data);
      updatePendingLeaves(data);
    } catch (err) {
      showToast('Failed to load dashboard data', 'error');
    }
  }

  function updateStats(data) {
    const stats = data.monthlyStats;
    document.getElementById('daysPresent').textContent = stats.presentDays || 0;
    document.getElementById('lateMarks').textContent = stats.lateMarks || 0;
    document.getElementById('totalHours').textContent = stats.totalHoursFormatted || '0h';
    document.getElementById('totalDays').textContent = stats.totalDays || 0;
  }

  function updateCheckinSection(data) {
    const statusEl = document.getElementById('checkinStatus');
    const actionsEl = document.getElementById('checkinActions');
    const infoEl = document.getElementById('checkinInfo');

    const today = data.todayAttendance;

    if (today && today.checkIn && today.checkOut) {
      statusEl.innerHTML = `<span class="status-badge badge-approved"><i class="bi bi-check-circle"></i> Checked Out</span>`;
      actionsEl.innerHTML = '';
      infoEl.innerHTML = `
        <div class="checked-in-status">
          <div class="status-row">
            <span class="label">Check In</span>
            <span class="value">${formatTime(today.checkIn)}</span>
          </div>
          <div class="status-row">
            <span class="label">Check Out</span>
            <span class="value">${formatTime(today.checkOut)}</span>
          </div>
          <div class="status-row">
            <span class="label">Working Hours</span>
            <span class="value">${today.workingHours ? formatHours(today.workingHours) : '--'}</span>
          </div>
          <div class="status-row">
            <span class="label">Status</span>
            <span class="value">${getStatusBadge(today.status)}</span>
          </div>
        </div>`;
      return;
    }

    if (today && today.checkIn && !today.checkOut) {
      statusEl.innerHTML = `<span class="status-badge badge-approved"><i class="bi bi-check-circle"></i> Checked In</span>`;
      actionsEl.innerHTML = `
        <button class="btn btn-warning btn-checkin" onclick="window.checkOut()">
          <i class="bi bi-box-arrow-right me-2"></i>Check Out
        </button>`;
      infoEl.innerHTML = `
        <div class="checked-in-status">
          <div class="status-row">
            <span class="label">Check In</span>
            <span class="value">${formatTime(today.checkIn)}</span>
          </div>
          <div class="status-row">
            <span class="label">Status</span>
            <span class="value">${getStatusBadge(today.status)}</span>
          </div>
        </div>`;
      return;
    }

    statusEl.innerHTML = `<span class="status-badge badge-absent"><i class="bi bi-x-circle"></i> Not Checked In</span>`;
    actionsEl.innerHTML = `
      <button class="btn btn-success btn-checkin" onclick="window.checkIn()">
        <i class="bi bi-box-arrow-in-right me-2"></i>Check In
      </button>`;
    infoEl.innerHTML = '';
  }

  function updateLeaveBalance(data) {
    const balance = data.leaveBalance || { sick: 12, casual: 15, annual: 20 };
    document.getElementById('sickLeave').textContent = balance.sick;
    document.getElementById('casualLeave').textContent = balance.casual;
    document.getElementById('annualLeave').textContent = balance.annual;
  }

  function updatePendingLeaves(data) {
    const count = data.pendingLeaves || 0;
    const countEl = document.getElementById('pendingLeaveCount');
    const listEl = document.getElementById('pendingLeaveList');

    countEl.textContent = count;

    if (count === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <i class="bi bi-check-circle"></i>
          <h6>No Pending Leaves</h6>
          <p>You have no leave requests pending approval</p>
        </div>`;
    } else {
      listEl.innerHTML = `<p class="text-muted mb-0">${count} leave request(s) pending approval</p>`;
    }
  }

  window.checkIn = async function () {
    try {
      const data = await apiRequest('/checkin', {
        method: 'POST',
        body: { notes: '' }
      });
      if (data && data.success) {
        showToast(data.message || 'Check-in successful!', 'success');
        loadDashboard();
      }
    } catch (err) {
      showToast(err.message || 'Check-in failed', 'error');
    }
  };

  window.checkOut = async function () {
    try {
      const data = await apiRequest('/checkout', {
        method: 'POST',
        body: {}
      });
      if (data && data.success) {
        showToast(data.message || 'Check-out successful!', 'success');
        loadDashboard();
      }
    } catch (err) {
      showToast(err.message || 'Check-out failed', 'error');
    }
  };

  function formatHours(minutes) {
    if (!minutes) return '0h 0m';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  }

  loadDashboard();
  setInterval(loadDashboard, 30000);
})();
