(function () {
  'use strict';

  if (!requireAdminModule()) return;

  const modalEl = document.getElementById('caseModal');
  const modal = modalEl ? new bootstrap.Modal(modalEl) : null;
  const tableBody = document.getElementById('caseTableBody');
  const searchInput = document.getElementById('caseSearch');
  const statusFilter = document.getElementById('caseStatusFilter');
  const milestoneFilter = document.getElementById('caseMilestoneFilter');
  const priorityFilter = document.getElementById('casePriorityFilter');
  const saveBtn = document.getElementById('saveCaseBtn');
  const saveText = document.getElementById('saveCaseText');
  const saveSpinner = document.getElementById('saveCaseSpinner');

  let cases = [];
  let master = { ledgers: [], loanTypes: [], milestones: [], employees: [] };

  function field(id) {
    return document.getElementById(id);
  }

  function setLoading(loading) {
    saveBtn.disabled = loading;
    saveText.textContent = loading ? 'Saving...' : 'Save Case';
    saveSpinner.classList.toggle('d-none', !loading);
  }

  function populateFilters() {
    fillSelectOptions(milestoneFilter, master.milestones, 'LoanMilestoneId', item => item.MilestoneName, 'All Milestones');
    const statuses = [
      'Open',
      'Document in Office',
      'Document Submitted in Bank',
      'Query Raised',
      'Query Resolved',
      'Sanctioned',
      'Loan Disbursed',
      'Rejected'
    ];

    statusFilter.innerHTML = '<option value="">All Status</option>';
    statuses.forEach(status => {
      const opt = document.createElement('option');
      opt.value = status;
      opt.textContent = status;
      statusFilter.appendChild(opt);
    });
  }

  function populateCaseModal() {
    fillSelectOptions(field('ledgerId'), master.ledgers, 'LedgerId', item => `${item.LedgerCode} - ${item.DisplayName || item.Ledger}`, 'Select Ledger');
    fillSelectOptions(field('loanTypeId'), master.loanTypes, 'LoanTypeId', item => item.LoanTypeName, 'Select Loan Type');
    fillSelectOptions(field('assignedToEmployeeId'), master.employees.filter(item => item.role !== 'Admin'), 'id', item => `${item.employeeCode} - ${item.name}`, 'Unassigned');
    fillSelectOptions(field('currentMilestoneId'), master.milestones, 'LoanMilestoneId', item => `${item.MilestoneOrder}. ${item.MilestoneName}`, 'Select Initial Milestone');
  }

  function renderSummary(summary) {
    document.getElementById('caseTotal').textContent = summary.totalLoanCases || 0;
    document.getElementById('casePending').textContent = summary.pendingCases || 0;
    document.getElementById('caseSanctioned').textContent = summary.sanctionedCases || 0;
    document.getElementById('caseDisbursed').textContent = summary.disbursedCases || 0;
    document.getElementById('caseOverdue').textContent = summary.overdueFollowups || 0;
    document.getElementById('caseLedgers').textContent = summary.totalLedgers || 0;
  }

  function renderTable(rows) {
    if (!rows.length) {
      tableBody.innerHTML = '<tr><td colspan="11" class="text-center text-muted py-4">No loan cases found</td></tr>';
      return;
    }

    tableBody.innerHTML = rows.map(item => `
      <tr>
        <td class="fw-semibold">${item.FileNo || '--'}</td>
        <td>${item.CaseNo || '--'}</td>
        <td>
          <div class="fw-semibold">${item.DisplayName || item.Ledger || '--'}</div>
          <small class="text-muted">${item.LedgerCode || ''}</small>
        </td>
        <td>${item.LoanTypeName || '--'}</td>
        <td>${formatCurrency(item.LoanAmount)}</td>
        <td>${item.CurrentMilestoneName || '--'}</td>
        <td>${getStatusBadge(item.CurrentStatus || item.CurrentMilestoneName || 'Open')}</td>
        <td>${item.Priority || '--'}</td>
        <td>${item.AssignedToEmployeeName || '--'}</td>
        <td style="font-size:12px;">${formatDateTime(item.UpdatedAt || item.CreatedAt)}</td>
        <td>
          <div class="d-flex gap-2 flex-wrap">
            <a class="btn btn-sm btn-outline-primary btn-rounded" href="/loan-case-detail.html?id=${item.LoanCaseId}"><i class="bi bi-eye"></i></a>
            <a class="btn btn-sm btn-outline-secondary btn-rounded" href="/loan-case-detail.html?id=${item.LoanCaseId}&edit=1"><i class="bi bi-pencil"></i></a>
          </div>
        </td>
      </tr>
    `).join('');
  }

  async function loadSummary() {
    try {
      const data = await apiRequest('/loan-dashboard-summary');
      if (data && data.success) {
        renderSummary(data);
      }
    } catch (err) {
      // summary cards are helpful but not critical
    }
  }

  async function loadCases() {
    try {
      const params = new URLSearchParams();
      const q = searchInput.value.trim();
      if (q) params.set('q', q);
      if (statusFilter.value) params.set('status', statusFilter.value);
      if (milestoneFilter.value) params.set('milestoneId', milestoneFilter.value);
      if (priorityFilter.value) params.set('priority', priorityFilter.value);

      const data = await apiRequest(`/loan-cases${params.toString() ? `?${params.toString()}` : ''}`);
      cases = (data && data.loanCases) || [];
      renderTable(cases);
    } catch (err) {
      tableBody.innerHTML = '<tr><td colspan="11" class="text-center text-danger py-4">Failed to load loan cases</td></tr>';
      showToast('Failed to load loan cases', 'error');
    }
  }

  function resetForm() {
    field('caseForm').reset();
    field('caseId').value = '';
    field('caseModalTitle').textContent = 'New Loan Case';
    populateCaseModal();
    field('priority').value = 'Normal';
  }

  function openForm() {
    resetForm();
    modal.show();
  }

  saveBtn.addEventListener('click', async () => {
    const payload = {
      FileNo: field('fileNo').value.trim(),
      CaseNo: field('caseNo').value.trim(),
      LedgerId: field('ledgerId').value,
      LoanTypeId: field('loanTypeId').value,
      LoanAmount: field('loanAmount').value,
      SanctionAmount: field('sanctionAmount').value,
      Tenure: field('tenure').value,
      InterestRate: field('interestRate').value,
      AssignedToEmployeeId: field('assignedToEmployeeId').value,
      CurrentMilestoneId: field('currentMilestoneId').value,
      Priority: field('priority').value,
      Remarks: field('caseRemarks').value.trim()
    };

    if (!payload.FileNo || !payload.CaseNo || !payload.LedgerId || !payload.LoanTypeId || !payload.LoanAmount) {
      showToast('File no, case no, ledger, loan type, and loan amount are required', 'warning');
      return;
    }

    setLoading(true);
    try {
      const data = await apiRequest('/loan-cases', {
        method: 'POST',
        body: payload
      });
      if (data && data.success) {
        showToast(data.message || 'Loan case created successfully', 'success');
        modal.hide();
        loadSummary();
        loadCases();
      }
    } catch (err) {
      showToast(err.message || 'Failed to create loan case', 'error');
    } finally {
      setLoading(false);
    }
  });

  document.getElementById('addCaseBtn').addEventListener('click', openForm);
  document.getElementById('refreshCasesBtn').addEventListener('click', () => {
    loadSummary();
    loadCases();
  });
  [searchInput, statusFilter, milestoneFilter, priorityFilter].forEach(el => {
    el.addEventListener('input', loadCases);
    el.addEventListener('change', loadCases);
  });

  async function init() {
    master = await loadLoanReferenceData();
    populateFilters();
    populateCaseModal();
    await loadSummary();
    await loadCases();
  }

  init();
})();
