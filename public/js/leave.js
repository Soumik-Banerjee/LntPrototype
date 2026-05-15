(function () {
  'use strict';

  requireAuth();

  const emp = getEmployee();
  if (!emp) return;

  const modalEl = document.getElementById('applyLeaveModal');
  let leaveModal = null;
  if (modalEl && typeof bootstrap !== 'undefined') {
    leaveModal = new bootstrap.Modal(modalEl);
  }

  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = emp.role === 'Admin' ? '' : 'none';
  });

  const startDateInput = document.getElementById('startDate');
  const endDateInput = document.getElementById('endDate');
  const leaveDaysInfo = document.getElementById('leaveDaysInfo');
  const leaveDayCount = document.getElementById('leaveDayCount');

  function calcLeaveDays() {
    const start = startDateInput.value;
    const end = endDateInput.value;
    if (start && end) {
      const s = new Date(start);
      const e = new Date(end);
      if (s <= e) {
        let count = 0;
        for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
          if (d.getDay() !== 0) count++;
        }
        leaveDayCount.textContent = count;
        leaveDaysInfo.classList.remove('d-none');
      } else {
        leaveDaysInfo.classList.add('d-none');
      }
    } else {
      leaveDaysInfo.classList.add('d-none');
    }
  }

  startDateInput.addEventListener('change', calcLeaveDays);
  endDateInput.addEventListener('change', calcLeaveDays);

  async function loadLeaveHistory() {
    const tableBody = document.getElementById('leaveTableBody');

    try {
      const data = await apiRequest(`/leaves?employeeId=${emp.id}`);
      if (!data) return;

      if (!data.leaves || data.leaves.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4"><i class="bi bi-inbox me-2"></i>No leave records found</td></tr>';
        return;
      }

      let html = '';
      data.leaves.forEach(leave => {
        html += `<tr>
          <td><span class="badge bg-secondary">${leave.type}</span></td>
          <td>${formatDate(leave.startDate)}</td>
          <td>${formatDate(leave.endDate)}</td>
          <td class="fw-semibold">${leave.days}</td>
          <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${leave.reason}">${leave.reason}</td>
          <td>${getStatusBadge(leave.status)}</td>
          <td style="font-size:12px;">${formatDate(leave.appliedOn)}</td>
          <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${leave.adminRemarks || ''}">${leave.adminRemarks || '--'}</td>
        </tr>`;
      });

      tableBody.innerHTML = html;
    } catch (err) {
      tableBody.innerHTML = '<tr><td colspan="8" class="text-center text-danger py-4">Failed to load leave history</td></tr>';
      showToast('Failed to load leave records', 'error');
    }
  }

  async function loadLeaveBalance() {
    try {
      const data = await apiRequest(`/dashboard-summary/${emp.id}`);
      if (!data) return;

      const balance = data.leaveBalance || { sick: 12, casual: 15, annual: 20 };
      document.getElementById('sickLeave').textContent = balance.sick;
      document.getElementById('casualLeave').textContent = balance.casual;
      document.getElementById('annualLeave').textContent = balance.annual;

      document.getElementById('sickUsed').textContent = `${12 - balance.sick} used`;
      document.getElementById('casualUsed').textContent = `${15 - balance.casual} used`;
      document.getElementById('annualUsed').textContent = `${20 - balance.annual} used`;
    } catch (err) {
      // silent
    }
  }

  document.getElementById('submitLeaveBtn').addEventListener('click', async () => {
    const type = document.getElementById('leaveType').value;
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const reason = document.getElementById('leaveReason').value.trim();

    if (!type || !startDate || !endDate || !reason) {
      showToast('Please fill all fields', 'warning');
      return;
    }

    const s = new Date(startDate);
    const e = new Date(endDate);
    if (s > e) {
      showToast('End date must be after start date', 'warning');
      return;
    }

    const btn = document.getElementById('submitLeaveBtn');
    const btnText = document.getElementById('submitLeaveText');
    const btnSpinner = document.getElementById('submitLeaveSpinner');

    btn.disabled = true;
    btnText.textContent = 'Submitting...';
    btnSpinner.classList.remove('d-none');

    try {
      const data = await apiRequest('/apply-leave', {
        method: 'POST',
        body: { startDate, endDate, reason, type }
      });

      if (data && data.success) {
        showToast(data.message || 'Leave applied successfully', 'success');
        if (leaveModal) leaveModal.hide();
        document.getElementById('applyLeaveForm').reset();
        leaveDaysInfo.classList.add('d-none');
        loadLeaveHistory();
        loadLeaveBalance();
      }
    } catch (err) {
      showToast(err.message || 'Failed to apply leave', 'error');
    } finally {
      btn.disabled = false;
      btnText.textContent = 'Submit Request';
      btnSpinner.classList.add('d-none');
    }
  });

  loadLeaveBalance();
  loadLeaveHistory();
})();
