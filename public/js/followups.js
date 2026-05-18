(function () {
  'use strict';

  if (!requireAdminModule()) return;

  const modalEl = document.getElementById('followupModal');
  const modal = modalEl ? new bootstrap.Modal(modalEl) : null;
  const tableBody = document.getElementById('followupTableBody');
  const searchInput = document.getElementById('followupSearch');
  const statusFilter = document.getElementById('followupStatusFilter');
  const saveBtn = document.getElementById('saveFollowupBtn');
  const saveText = document.getElementById('saveFollowupText');
  const saveSpinner = document.getElementById('saveFollowupSpinner');

  let rows = [];
  let cases = [];

  function field(id) {
    return document.getElementById(id);
  }

  function setLoading(loading) {
    saveBtn.disabled = loading;
    saveText.textContent = loading ? 'Saving...' : 'Save Follow-up';
    saveSpinner.classList.toggle('d-none', !loading);
  }

  function populateCaseSelect() {
    fillSelectOptions(field('followupLoanCaseId'), cases, 'LoanCaseId', item => `${item.FileNo} / ${item.CaseNo} - ${item.DisplayName || item.Ledger || ''}`, 'Select Loan Case');
  }

  function renderStats(summary) {
    const total = rows.length;
    const completed = rows.filter(item => item.IsCompleted).length;
    const pending = total - completed;
    document.getElementById('followupTotal').textContent = total;
    document.getElementById('followupPending').textContent = pending;
    document.getElementById('followupCompleted').textContent = completed;
    const overdue = rows.filter(item => !item.IsCompleted && item.FollowUpDate && item.FollowUpDate < new Date().toISOString().split('T')[0]).length;
    document.getElementById('followupOverdue').textContent = overdue;
  }

  function renderTable(items) {
    if (!items.length) {
      tableBody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">No follow-ups found</td></tr>';
      return;
    }

    tableBody.innerHTML = items.map(item => `
      <tr>
        <td>
          <div class="fw-semibold">${item.FileNo || '--'} / ${item.CaseNo || '--'}</div>
          <small class="text-muted">${item.LedgerName || ''}</small>
        </td>
        <td>${item.LedgerName || '--'}</td>
        <td>${item.FollowUpType || '--'}</td>
        <td>${formatDate(item.FollowUpDate)}</td>
        <td title="${item.Remark || ''}" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.Remark || '--'}</td>
        <td>${getStatusBadge(item.IsCompleted ? 'Follow-up Completed' : 'Follow-up Pending')}</td>
        <td>${item.CreatedByName || '--'}</td>
        <td>
          <div class="d-flex gap-2 flex-wrap">
            <a class="btn btn-sm btn-outline-primary btn-rounded" href="/loan-case-detail.html?id=${item.LoanCaseId}"><i class="bi bi-eye"></i></a>
            <button class="btn btn-sm btn-outline-secondary btn-rounded edit-followup" data-id="${item.FollowUpId}"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-${item.IsCompleted ? 'warning' : 'success'} btn-rounded toggle-followup" data-id="${item.FollowUpId}">
              <i class="bi ${item.IsCompleted ? 'bi-arrow-counterclockwise' : 'bi-check-lg'}"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    tableBody.querySelectorAll('.edit-followup').forEach(btn => {
      btn.addEventListener('click', () => {
        const record = rows.find(item => item.FollowUpId === Number(btn.dataset.id));
        if (!record) return;
        field('followupModalTitle').textContent = 'Edit Follow-up';
        field('followupId').value = record.FollowUpId;
        field('followupLoanCaseId').value = record.LoanCaseId;
        field('followupDate').value = record.FollowUpDate || '';
        field('followupType').value = record.FollowUpType || '';
        field('followupRemark').value = record.Remark || '';
        field('followupCompleted').value = String(!!record.IsCompleted);
        modal.show();
      });
    });

    tableBody.querySelectorAll('.toggle-followup').forEach(btn => {
      btn.addEventListener('click', async () => {
        const record = rows.find(item => item.FollowUpId === Number(btn.dataset.id));
        if (!record) return;
        try {
          const data = await apiRequest(`/followups/${record.FollowUpId}`, {
            method: 'PUT',
            body: { IsCompleted: !record.IsCompleted }
          });
          if (data && data.success) {
            showToast(data.message || 'Follow-up updated', 'success');
            loadFollowups();
          }
        } catch (err) {
          showToast(err.message || 'Failed to update follow-up', 'error');
        }
      });
    });
  }

  async function loadFollowups() {
    try {
      const params = new URLSearchParams();
      const q = searchInput.value.trim();
      if (q) params.set('q', q);
      if (statusFilter.value === 'pending') params.set('status', 'pending');
      if (statusFilter.value === 'completed') params.set('status', 'completed');
      const data = await apiRequest(`/followups${params.toString() ? `?${params.toString()}` : ''}`);
      rows = (data && data.followups) || [];
      renderTable(rows);
      const summary = await apiRequest('/loan-dashboard-summary').catch(() => null);
      renderStats(summary || {});
    } catch (err) {
      tableBody.innerHTML = '<tr><td colspan="8" class="text-center text-danger py-4">Failed to load follow-ups</td></tr>';
      showToast('Failed to load follow-ups', 'error');
    }
  }

  async function loadCases() {
    const data = await apiRequest('/loan-cases');
    cases = (data && data.loanCases) || [];
    populateCaseSelect();
  }

  function resetForm() {
    field('followupForm').reset();
    field('followupId').value = '';
    field('followupModalTitle').textContent = 'Add Follow-up';
    field('followupCompleted').value = 'false';
    populateCaseSelect();
  }

  function openForm() {
    resetForm();
    field('followupDate').value = new Date().toISOString().split('T')[0];
    modal.show();
  }

  saveBtn.addEventListener('click', async () => {
    const payload = {
      LoanCaseId: field('followupLoanCaseId').value,
      FollowUpDate: field('followupDate').value,
      FollowUpType: field('followupType').value,
      Remark: field('followupRemark').value.trim(),
      IsCompleted: field('followupCompleted').value === 'true'
    };

    if (!payload.LoanCaseId || !payload.FollowUpDate || !payload.FollowUpType || !payload.Remark) {
      showToast('Please fill all follow-up fields', 'warning');
      return;
    }

    setLoading(true);
    try {
      const id = field('followupId').value;
      const data = await apiRequest(id ? `/followups/${id}` : '/followups', {
        method: id ? 'PUT' : 'POST',
        body: payload
      });
      if (data && data.success) {
        showToast(data.message || 'Saved successfully', 'success');
        modal.hide();
        loadFollowups();
      }
    } catch (err) {
      showToast(err.message || 'Failed to save follow-up', 'error');
    } finally {
      setLoading(false);
    }
  });

  document.getElementById('addFollowupBtn').addEventListener('click', openForm);
  document.getElementById('refreshFollowupsBtn').addEventListener('click', loadFollowups);
  searchInput.addEventListener('input', () => {
    clearTimeout(window.__followupTimer);
    window.__followupTimer = setTimeout(loadFollowups, 250);
  });
  statusFilter.addEventListener('change', loadFollowups);

  (async function init() {
    await loadCases();
    await loadFollowups();
  })();
})();
