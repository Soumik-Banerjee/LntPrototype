(function () {
  'use strict';

  requireAuth();

  const emp = getEmployee();
  if (!emp || emp.role !== 'Admin') {
    showToast('Admin access required', 'error');
    setTimeout(() => { window.location.href = '/dashboard.html'; }, 1000);
    return;
  }

  async function loadAdminDashboard() {
    try {
      const data = await apiRequest('/admin-summary');
      if (!data) return;

      updateStats(data);
      renderRecentAttendance(data.recentAttendance);
      renderPendingLeaves(data.recentLeaves);
      renderEmployeeList(data.employees);
    } catch (err) {
      showToast('Failed to load admin dashboard', 'error');
    }
  }

  function updateStats(data) {
    document.getElementById('totalEmployees').textContent = data.totalEmployees || 0;
    document.getElementById('presentToday').textContent = data.presentToday || 0;
    document.getElementById('absentToday').textContent = data.absentToday || 0;
    document.getElementById('pendingLeaves').textContent = data.pendingLeaves || 0;
    document.getElementById('leaveRequestCount').textContent = data.pendingLeaves || 0;
  }

  function renderRecentAttendance(attendance) {
    const tbody = document.getElementById('adminAttendanceBody');

    if (!attendance || attendance.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No attendance records</td></tr>';
      return;
    }

    let html = '';
    attendance.slice(0, 15).forEach(a => {
      const hours = a.workingHours ? formatHours(a.workingHours) : '--';
      html += `<tr>
        <td class="fw-semibold">${a.employeeName || 'Unknown'}</td>
        <td>${formatDate(a.date)}</td>
        <td>${formatTime(a.checkIn)}</td>
        <td>${formatTime(a.checkOut)}</td>
        <td>${hours}</td>
        <td>${getStatusBadge(a.status)}</td>
      </tr>`;
    });

    tbody.innerHTML = html;
  }

  function renderPendingLeaves(leaves) {
    const container = document.getElementById('pendingLeavesContainer');

    const pendingLeaves = leaves.filter(l => l.status === 'Pending');

    if (pendingLeaves.length === 0) {
      container.innerHTML = '<div class="text-center text-muted py-4"><i class="bi bi-check-circle me-2"></i>No pending leave requests</div>';
      return;
    }

    let html = '';
    pendingLeaves.forEach(leave => {
      html += `
        <div class="p-3 border-bottom">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <div>
              <strong>${leave.employeeName}</strong>
              <span class="badge bg-secondary ms-2">${leave.type}</span>
            </div>
            <small class="text-muted">${formatDate(leave.appliedOn)}</small>
          </div>
          <div class="mb-2" style="font-size:13px;">
            <i class="bi bi-calendar me-1"></i> ${formatDate(leave.startDate)} - ${formatDate(leave.endDate)}
            <span class="ms-2 badge bg-light text-dark">${leave.days} day(s)</span>
          </div>
          <div class="mb-2" style="font-size:13px;color:var(--gray-600);">
            <i class="bi bi-chat me-1"></i> ${leave.reason}
          </div>
          <div class="d-flex gap-2">
            <button class="btn btn-success btn-sm btn-rounded approve-btn" data-id="${leave.id}" data-name="${leave.employeeName}">
              <i class="bi bi-check-lg"></i> Approve
            </button>
            <button class="btn btn-danger btn-sm btn-rounded reject-btn" data-id="${leave.id}" data-name="${leave.employeeName}">
              <i class="bi bi-x-lg"></i> Reject
            </button>
          </div>
        </div>`;
    });

    container.innerHTML = html;

    container.querySelectorAll('.approve-btn').forEach(btn => {
      btn.addEventListener('click', () => handleLeaveAction(btn.dataset.id, 'Approved', btn.dataset.name));
    });

    container.querySelectorAll('.reject-btn').forEach(btn => {
      btn.addEventListener('click', () => handleLeaveAction(btn.dataset.id, 'Rejected', btn.dataset.name));
    });
  }

  async function handleLeaveAction(leaveId, status, employeeName) {
    const action = status === 'Approved' ? 'approve' : 'reject';
    const remarks = status === 'Approved' ? 'Approved by admin' : 'Rejected by admin';

    try {
      const data = await apiRequest(`/leaves/${leaveId}`, {
        method: 'PUT',
        body: { status, adminRemarks: remarks }
      });

      if (data && data.success) {
        showToast(`Leave ${status.toLowerCase()} for ${employeeName}`, 'success');
        loadAdminDashboard();
      }
    } catch (err) {
      showToast(err.message || `Failed to ${action} leave`, 'error');
    }
  }

  function renderEmployeeList(employees) {
    const tbody = document.getElementById('employeeListBody');

    if (!employees || employees.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-3">No employees</td></tr>';
      return;
    }

    let html = '';
    employees.forEach(emp => {
      html += `<tr>
        <td><span class="badge bg-secondary">${emp.employeeCode}</span></td>
        <td class="fw-semibold">${emp.name}</td>
        <td>${emp.department}</td>
      </tr>`;
    });

    tbody.innerHTML = html;
  }

  function formatHours(minutes) {
    if (!minutes) return '0h 0m';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  }

  loadAdminDashboard();
  setInterval(loadAdminDashboard, 60000);
})();
