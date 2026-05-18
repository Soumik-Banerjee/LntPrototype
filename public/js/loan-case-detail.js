(function () {
  'use strict';

  if (!requireAdminModule()) return;

  const caseId = Number(getQueryParam('id'));
  const autoEdit = getQueryParam('edit') === '1';
  const editModalEl = document.getElementById('editCaseModal');
  const followupModalEl = document.getElementById('followupModal');
  const editModal = editModalEl ? new bootstrap.Modal(editModalEl) : null;
  const followupModal = followupModalEl ? new bootstrap.Modal(followupModalEl) : null;

  let master = { ledgers: [], loanTypes: [], milestones: [], employees: [] };
  let currentCase = null;
  let historyRows = [];
  let followupRows = [];

  function field(id) {
    return document.getElementById(id);
  }

  function populateSelects() {
    fillSelectOptions(field('statusMilestoneSelect'), master.milestones, 'LoanMilestoneId', item => `${item.MilestoneOrder}. ${item.MilestoneName}`, 'Select Milestone');
    fillSelectOptions(field('editLedgerId'), master.ledgers, 'LedgerId', item => `${item.LedgerCode} - ${item.DisplayName || item.Ledger}`, 'Select Ledger');
    fillSelectOptions(field('editLoanTypeId'), master.loanTypes, 'LoanTypeId', item => item.LoanTypeName, 'Select Loan Type');
    fillSelectOptions(field('editAssignedToEmployeeId'), master.employees.filter(item => item.role !== 'Admin'), 'id', item => `${item.employeeCode} - ${item.name}`, 'Unassigned');
  }

  function fillCaseForm() {
    if (!currentCase) return;
    field('editFileNo').value = currentCase.FileNo || '';
    field('editCaseNo').value = currentCase.CaseNo || '';
    field('editLedgerId').value = currentCase.LedgerId || '';
    field('editLoanTypeId').value = currentCase.LoanTypeId || '';
    field('editLoanAmount').value = currentCase.LoanAmount || '';
    field('editSanctionAmount').value = currentCase.SanctionAmount || '';
    field('editTenure').value = currentCase.Tenure || '';
    field('editInterestRate').value = currentCase.InterestRate || '';
    field('editAssignedToEmployeeId').value = currentCase.AssignedToEmployeeId || '';
    field('editPriority').value = currentCase.Priority || 'Normal';
    field('editCaseRemarks').value = currentCase.Remarks || '';
    field('statusMilestoneSelect').value = currentCase.CurrentMilestoneId || '';
    field('statusRemark').value = '';
    field('statusNextFollowUpDate').value = '';
  }

  function renderCaseSummary() {
    if (!currentCase) return;
    document.getElementById('caseTitle').textContent = `${currentCase.DisplayName || currentCase.Ledger || 'Loan Case'} - ${currentCase.FileNo || ''}`;
    document.getElementById('caseSubtitle').textContent = `${currentCase.CaseNo || ''} | ${currentCase.LoanTypeName || ''}`;
    document.getElementById('caseAmount').textContent = formatCurrency(currentCase.LoanAmount);
    document.getElementById('caseMilestoneSummary').textContent = currentCase.CurrentMilestoneName || '--';
    document.getElementById('caseStatusSummary').innerHTML = getStatusBadge(currentCase.CurrentStatus || currentCase.CurrentMilestoneName || 'Open');
    document.getElementById('followupCountSummary').textContent = followupRows.length;

    document.getElementById('caseFileNo').textContent = currentCase.FileNo || '--';
    document.getElementById('caseCaseNo').textContent = currentCase.CaseNo || '--';
    document.getElementById('caseLedger').textContent = `${currentCase.DisplayName || currentCase.Ledger || '--'} (${currentCase.LedgerCode || ''})`;
    document.getElementById('caseLoanType').textContent = currentCase.LoanTypeName || '--';
    document.getElementById('caseAssignedTo').textContent = currentCase.AssignedToEmployeeName || '--';
    document.getElementById('casePriority').textContent = currentCase.Priority || '--';
    document.getElementById('caseSanctionAmount').textContent = formatCurrency(currentCase.SanctionAmount);
    document.getElementById('caseTenure').textContent = currentCase.Tenure ? `${currentCase.Tenure} months` : '--';
    document.getElementById('caseRemarks').textContent = currentCase.Remarks || '--';
    document.getElementById('caseCreatedAt').textContent = formatDateTime(currentCase.CreatedAt);
    document.getElementById('caseUpdatedAt').textContent = formatDateTime(currentCase.UpdatedAt);
    document.getElementById('caseFollowupBadge').textContent = followupRows.length;
  }

  function renderTimeline(rows) {
    const container = document.getElementById('timelineContainer');
    if (!rows.length) {
      container.innerHTML = `
        <div class="empty-state py-4">
          <i class="bi bi-inbox"></i>
          <h6>No History Yet</h6>
          <p>Status updates will appear here</p>
        </div>`;
      return;
    }

    container.innerHTML = rows.map(row => `
      <div class="loan-timeline-item">
        <div class="loan-timeline-dot"></div>
        <div class="loan-timeline-card">
          <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
            <div>
              <div class="fw-semibold">${row.LoanMilestoneName || row.Status || '--'}</div>
              <div class="loan-timeline-meta">${formatDateTime(row.ChangedAt)} by ${row.ChangedByEmployeeName || '--'}</div>
            </div>
            <div>${getStatusBadge(row.Status || row.LoanMilestoneName || 'Open')}</div>
          </div>
          <div class="mb-2">${row.Remark || '--'}</div>
          ${row.NextFollowUpDate ? `<div class="loan-timeline-meta">Next follow-up: ${formatDate(row.NextFollowUpDate)}</div>` : ''}
        </div>
      </div>
    `).join('');
  }

  function renderFollowups(rows) {
    const container = document.getElementById('followupContainer');
    if (!rows.length) {
      container.innerHTML = `
        <div class="empty-state py-4">
          <i class="bi bi-inbox"></i>
          <h6>No Follow-ups</h6>
          <p>Create follow-ups to track next actions</p>
        </div>`;
      return;
    }

    container.innerHTML = rows.map(row => `
      <div class="p-3 border-bottom">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <div>
            <strong>${row.FollowUpType}</strong>
            <span class="badge ${row.IsCompleted ? 'bg-success' : 'bg-warning text-dark'} ms-2">${row.IsCompleted ? 'Completed' : 'Pending'}</span>
          </div>
          <small class="text-muted">${formatDateTime(row.CreatedAt)}</small>
        </div>
        <div class="mb-2" style="font-size:13px;">
          <i class="bi bi-calendar me-1"></i> ${formatDate(row.FollowUpDate)}
        </div>
        <div class="mb-2">${row.Remark || '--'}</div>
        <small class="text-muted">Created by ${row.CreatedByName || '--'}</small>
      </div>
    `).join('');
  }

  function openFollowupModal() {
    field('followupForm').reset();
    field('followupDate').value = new Date().toISOString().split('T')[0];
    followupModal.show();
  }

  function openEditModal() {
    fillCaseForm();
    editModal.show();
  }

  async function loadDetail() {
    if (!caseId) {
      document.getElementById('caseTitle').textContent = 'Loan Case Detail';
      document.getElementById('caseSubtitle').textContent = 'Missing case id';
      showToast('Missing case id', 'warning');
      return;
    }

    const [masterData, caseData, historyData, followupData] = await Promise.all([
      loadLoanReferenceData(),
      apiRequest(`/loan-cases/${caseId}`),
      apiRequest(`/loan-cases/${caseId}/history`),
      apiRequest(`/followups?loanCaseId=${caseId}`).catch(() => null)
    ]);

    master = masterData;
    populateSelects();

    if (!caseData || !caseData.loanCase) {
      showToast('Loan case not found', 'error');
      return;
    }

    currentCase = caseData.loanCase;
    historyRows = (historyData && historyData.history) || [];
    followupRows = (followupData && followupData.followups) || [];

    renderCaseSummary();
    renderTimeline(historyRows);
    renderFollowups(followupRows);
    fillCaseForm();

    if (autoEdit) {
      openEditModal();
    }
  }

  document.getElementById('editCaseBtn').addEventListener('click', openEditModal);
  document.getElementById('addFollowupBtnTop').addEventListener('click', openFollowupModal);
  document.getElementById('updateStatusBtn').addEventListener('click', async () => {
    const milestoneId = field('statusMilestoneSelect').value;
    const remark = field('statusRemark').value.trim();
    const nextFollowUpDate = field('statusNextFollowUpDate').value;

    if (!milestoneId) {
      showToast('Please select a milestone', 'warning');
      return;
    }

    const milestone = master.milestones.find(item => item.LoanMilestoneId === Number(milestoneId));
    const btn = document.getElementById('updateStatusBtn');
    const text = document.getElementById('updateStatusText');
    const spinner = document.getElementById('updateStatusSpinner');

    btn.disabled = true;
    text.textContent = 'Updating...';
    spinner.classList.remove('d-none');

    try {
      const data = await apiRequest(`/loan-cases/${caseId}/status`, {
        method: 'POST',
        body: {
          LoanMilestoneId: milestoneId,
          Status: milestone ? milestone.MilestoneName : '',
          Remark: remark,
          NextFollowUpDate: nextFollowUpDate
        }
      });
      if (data && data.success) {
        showToast(data.message || 'Status updated successfully', 'success');
        await loadDetail();
      }
    } catch (err) {
      showToast(err.message || 'Failed to update status', 'error');
    } finally {
      btn.disabled = false;
      text.textContent = 'Update Status';
      spinner.classList.add('d-none');
    }
  });

  document.getElementById('saveEditCaseBtn').addEventListener('click', async () => {
    const payload = {
      FileNo: field('editFileNo').value.trim(),
      CaseNo: field('editCaseNo').value.trim(),
      LedgerId: field('editLedgerId').value,
      LoanTypeId: field('editLoanTypeId').value,
      LoanAmount: field('editLoanAmount').value,
      SanctionAmount: field('editSanctionAmount').value,
      Tenure: field('editTenure').value,
      InterestRate: field('editInterestRate').value,
      AssignedToEmployeeId: field('editAssignedToEmployeeId').value,
      Priority: field('editPriority').value,
      Remarks: field('editCaseRemarks').value.trim()
    };

    const btn = document.getElementById('saveEditCaseBtn');
    const text = document.getElementById('saveEditCaseText');
    const spinner = document.getElementById('saveEditCaseSpinner');
    btn.disabled = true;
    text.textContent = 'Saving...';
    spinner.classList.remove('d-none');

    try {
      const data = await apiRequest(`/loan-cases/${caseId}`, {
        method: 'PUT',
        body: payload
      });
      if (data && data.success) {
        showToast(data.message || 'Case updated successfully', 'success');
        editModal.hide();
        await loadDetail();
      }
    } catch (err) {
      showToast(err.message || 'Failed to save case', 'error');
    } finally {
      btn.disabled = false;
      text.textContent = 'Save Changes';
      spinner.classList.add('d-none');
    }
  });

  function submitFollowup() {
    const payload = {
      LoanCaseId: caseId,
      FollowUpDate: field('followupDate').value,
      FollowUpType: field('followupType').value,
      Remark: field('followupRemark').value.trim(),
      IsCompleted: false
    };

    if (!payload.FollowUpDate || !payload.FollowUpType || !payload.Remark) {
      showToast('Please fill all follow-up fields', 'warning');
      return;
    }

    const btn = document.getElementById('saveFollowupBtn');
    const text = document.getElementById('saveFollowupText');
    const spinner = document.getElementById('saveFollowupSpinner');
    btn.disabled = true;
    text.textContent = 'Saving...';
    spinner.classList.remove('d-none');

    apiRequest('/followups', {
      method: 'POST',
      body: payload
    }).then(async data => {
      if (data && data.success) {
        showToast(data.message || 'Follow-up created successfully', 'success');
        followupModal.hide();
        await loadDetail();
      }
    }).catch(err => {
      showToast(err.message || 'Failed to save follow-up', 'error');
    }).finally(() => {
      btn.disabled = false;
      text.textContent = 'Save Follow-up';
      spinner.classList.add('d-none');
    });
  }

  document.getElementById('saveFollowupBtn').addEventListener('click', submitFollowup);
  document.getElementById('addFollowupBtn').addEventListener('click', openFollowupModal);

  loadDetail();
})();
