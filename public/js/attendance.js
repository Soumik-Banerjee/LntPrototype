(function () {
  'use strict';

  requireAuth();

  const emp = getEmployee();
  if (!emp) return;

  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = emp.role === 'Admin' ? '' : 'none';
  });

  const monthSelect = document.getElementById('monthSelect');
  const yearSelect = document.getElementById('yearSelect');
  const refreshBtn = document.getElementById('refreshBtn');
  const tableBody = document.getElementById('attendanceTableBody');

  async function loadAttendance() {
    const month = monthSelect.value;
    const year = yearSelect.value;

    if (!month || !year) return;

    tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4"><div class="spinner-border spinner-border-sm me-2"></div>Loading...</td></tr>';

    try {
      const data = await apiRequest(`/monthly-attendance/${emp.id}?month=${month}&year=${year}`);
      if (!data) return;

      renderTable(data.attendance);
      updateStats(data.attendance);
    } catch (err) {
      tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger py-4">Failed to load attendance data</td></tr>';
      showToast('Failed to load attendance records', 'error');
    }
  }

  function renderTable(attendance) {
    if (!attendance || attendance.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4"><i class="bi bi-inbox me-2"></i>No attendance records found</td></tr>';
      return;
    }

    let html = '';
    attendance.forEach(day => {
      const record = day.record;
      const checkIn = record ? formatTime(record.checkIn) : '--';
      const checkOut = record ? formatTime(record.checkOut) : '--';
      const hours = record && record.workingHours ? formatHours(record.workingHours) : '--';
      const status = day.isWeekend ? 'Weekend' : (record ? record.status : 'Absent');
      const statusHtml = getStatusBadge(status);

      const today = new Date().toISOString().split('T')[0];
      const isToday = day.date === today;

      html += `<tr${isToday ? ' style="background:#f0f7ff;"' : ''}>
        <td class="fw-semibold">${formatDate(day.date)}</td>
        <td>${day.dayName}</td>
        <td>${checkIn}</td>
        <td>${checkOut}</td>
        <td>${hours}</td>
        <td>${statusHtml}</td>
      </tr>`;
    });

    tableBody.innerHTML = html;
  }

  function updateStats(attendance) {
    if (!attendance || attendance.length === 0) {
      document.getElementById('statPresent').textContent = '0';
      document.getElementById('statLate').textContent = '0';
      document.getElementById('statAbsent').textContent = '0';
      return;
    }

    const present = attendance.filter(d => d.status === 'Present' || d.status === 'Late').length;
    const late = attendance.filter(d => d.status === 'Late').length;
    const absent = attendance.filter(d => d.status === 'Absent').length;

    document.getElementById('statPresent').textContent = present;
    document.getElementById('statLate').textContent = late;
    document.getElementById('statAbsent').textContent = absent;
  }

  function formatHours(minutes) {
    if (!minutes) return '0h 0m';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  }

  monthSelect.addEventListener('change', loadAttendance);
  yearSelect.addEventListener('change', loadAttendance);
  refreshBtn.addEventListener('click', loadAttendance);

  loadAttendance();
})();
