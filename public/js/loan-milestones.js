(function () {
  'use strict';

  if (!requireAdminModule()) return;

  const modalEl = document.getElementById('milestoneModal');
  const modal = modalEl ? new bootstrap.Modal(modalEl) : null;
  const searchInput = document.getElementById('milestoneSearch');
  const statusFilter = document.getElementById('milestoneStatusFilter');
  const tableBody = document.getElementById('milestoneTableBody');
  const saveBtn = document.getElementById('saveMilestoneBtn');
  const saveText = document.getElementById('saveMilestoneText');
  const saveSpinner = document.getElementById('saveMilestoneSpinner');

  let items = [];

  function field(id) {
    return document.getElementById(id);
  }

  function setLoading(loading) {
    saveBtn.disabled = loading;
    saveText.textContent = loading ? 'Saving...' : 'Save Milestone';
    saveSpinner.classList.toggle('d-none', !loading);
  }

  function resetForm() {
    field('milestoneForm').reset();
    field('milestoneId').value = '';
    field('milestoneModalTitle').textContent = 'Add Milestone';
    field('milestoneIsActive').value = 'true';
    field('milestoneIsFinal').value = 'false';
    field('milestoneRequiresRemark').value = 'false';
    field('milestoneRequiresDoc').value = 'false';
  }

  function openForm(record = null) {
    resetForm();
    if (record) {
      field('milestoneModalTitle').textContent = 'Edit Milestone';
      field('milestoneId').value = record.LoanMilestoneId;
      field('milestoneName').value = record.MilestoneName || '';
      field('milestoneOrder').value = record.MilestoneOrder || 1;
      field('milestoneSlaDays').value = record.DefaultSlaDays || 0;
      field('milestoneIsActive').value = String(!!record.IsActive);
      field('milestoneIsFinal').value = String(!!record.IsFinalStage);
      field('milestoneRequiresRemark').value = String(!!record.RequiresRemark);
      field('milestoneRequiresDoc').value = String(!!record.RequiresDocumentUpload);
    }
    modal.show();
  }

  function renderStats(rows) {
    const total = rows.length;
    const active = rows.filter(item => item.IsActive !== false).length;
    const final = rows.filter(item => item.IsFinalStage).length;
    const slaTotal = rows.reduce((sum, item) => sum + (Number(item.DefaultSlaDays) || 0), 0);
    document.getElementById('milestoneTotal').textContent = total;
    document.getElementById('milestoneActive').textContent = active;
    document.getElementById('milestoneFinal').textContent = final;
    document.getElementById('milestoneSla').textContent = total ? Math.round(slaTotal / total) : 0;
  }

  function renderTable(rows) {
    if (!rows.length) {
      tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No milestones found</td></tr>';
      return;
    }

    tableBody.innerHTML = rows.map((item, index) => `
      <tr>
        <td class="fw-semibold">${item.MilestoneOrder || '--'}</td>
        <td>${item.MilestoneName || '--'}</td>
        <td>${item.DefaultSlaDays || 0} day(s)</td>
        <td>
          <div class="d-flex gap-2 flex-wrap">
            ${item.RequiresRemark ? '<span class="badge bg-light text-dark">Remark</span>' : ''}
            ${item.RequiresDocumentUpload ? '<span class="badge bg-light text-dark">Document</span>' : ''}
            ${item.IsFinalStage ? '<span class="badge bg-light text-dark">Final</span>' : ''}
          </div>
        </td>
        <td>${renderStatusToggle(item.IsActive !== false)}</td>
        <td style="font-size:12px;">${formatDateTime(item.UpdatedAt || item.CreatedAt)}</td>
        <td>
          <div class="d-flex gap-2 flex-wrap">
            <button class="btn btn-sm btn-outline-secondary btn-rounded move-up" data-id="${item.LoanMilestoneId}" ${index === 0 ? 'disabled' : ''}><i class="bi bi-arrow-up"></i></button>
            <button class="btn btn-sm btn-outline-secondary btn-rounded move-down" data-id="${item.LoanMilestoneId}" ${index === rows.length - 1 ? 'disabled' : ''}><i class="bi bi-arrow-down"></i></button>
            <button class="btn btn-sm btn-outline-primary btn-rounded edit-mile" data-id="${item.LoanMilestoneId}"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-${item.IsActive === false ? 'success' : 'danger'} btn-rounded toggle-mile" data-id="${item.LoanMilestoneId}">
              <i class="bi ${item.IsActive === false ? 'bi-check-lg' : 'bi-slash-circle'}"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    tableBody.querySelectorAll('.edit-mile').forEach(btn => {
      btn.addEventListener('click', () => {
        const record = items.find(item => item.LoanMilestoneId === Number(btn.dataset.id));
        if (record) openForm(record);
      });
    });

    tableBody.querySelectorAll('.toggle-mile').forEach(btn => {
      btn.addEventListener('click', async () => {
        const record = items.find(item => item.LoanMilestoneId === Number(btn.dataset.id));
        if (!record) return;
        try {
          const method = record.IsActive === false ? 'PUT' : 'DELETE';
          const body = method === 'PUT' ? { IsActive: true } : undefined;
          const data = await apiRequest(`/loan-milestones/${record.LoanMilestoneId}`, { method, body });
          if (data && data.success) {
            showToast(data.message || 'Updated successfully', 'success');
            loadMilestones();
          }
        } catch (err) {
          showToast(err.message || 'Failed to update milestone', 'error');
        }
      });
    });

    tableBody.querySelectorAll('.move-up').forEach(btn => {
      btn.addEventListener('click', () => moveMilestone(Number(btn.dataset.id), -1));
    });
    tableBody.querySelectorAll('.move-down').forEach(btn => {
      btn.addEventListener('click', () => moveMilestone(Number(btn.dataset.id), 1));
    });
  }

  async function moveMilestone(id, direction) {
    const sorted = [...items].sort((a, b) => (Number(a.MilestoneOrder) || 0) - (Number(b.MilestoneOrder) || 0));
    const index = sorted.findIndex(item => item.LoanMilestoneId === id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= sorted.length) return;

    const current = sorted[index];
    const other = sorted[targetIndex];
    try {
      await Promise.all([
        apiRequest(`/loan-milestones/${current.LoanMilestoneId}`, { method: 'PUT', body: { MilestoneOrder: other.MilestoneOrder } }),
        apiRequest(`/loan-milestones/${other.LoanMilestoneId}`, { method: 'PUT', body: { MilestoneOrder: current.MilestoneOrder } })
      ]);
      showToast('Milestone order updated', 'success');
      loadMilestones();
    } catch (err) {
      showToast(err.message || 'Failed to reorder milestones', 'error');
    }
  }

  async function loadMilestones() {
    try {
      const params = new URLSearchParams();
      const q = searchInput.value.trim();
      if (q) params.set('q', q);
      if (statusFilter.value !== '') params.set('active', statusFilter.value);
      const data = await apiRequest(`/loan-milestones${params.toString() ? `?${params.toString()}` : ''}`);
      items = (data && data.loanMilestones) || [];
      const allData = await apiRequest('/loan-milestones');
      renderStats((allData && allData.loanMilestones) || items);
      renderTable(items);
    } catch (err) {
      tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-danger py-4">Failed to load milestones</td></tr>';
      showToast('Failed to load milestones', 'error');
    }
  }

  saveBtn.addEventListener('click', async () => {
    const payload = {
      MilestoneName: field('milestoneName').value.trim(),
      MilestoneOrder: field('milestoneOrder').value,
      DefaultSlaDays: field('milestoneSlaDays').value,
      IsActive: field('milestoneIsActive').value === 'true',
      IsFinalStage: field('milestoneIsFinal').value === 'true',
      RequiresRemark: field('milestoneRequiresRemark').value === 'true',
      RequiresDocumentUpload: field('milestoneRequiresDoc').value === 'true'
    };

    if (!payload.MilestoneName) {
      showToast('Milestone name is required', 'warning');
      return;
    }

    setLoading(true);
    try {
      const id = field('milestoneId').value;
      const data = await apiRequest(id ? `/loan-milestones/${id}` : '/loan-milestones', {
        method: id ? 'PUT' : 'POST',
        body: payload
      });
      if (data && data.success) {
        showToast(data.message || 'Saved successfully', 'success');
        modal.hide();
        loadMilestones();
      }
    } catch (err) {
      showToast(err.message || 'Failed to save milestone', 'error');
    } finally {
      setLoading(false);
    }
  });

  document.getElementById('addMilestoneBtn').addEventListener('click', () => openForm());
  document.getElementById('refreshMilestonesBtn').addEventListener('click', loadMilestones);
  searchInput.addEventListener('input', () => {
    clearTimeout(window.__milestoneTimer);
    window.__milestoneTimer = setTimeout(loadMilestones, 250);
  });
  statusFilter.addEventListener('change', loadMilestones);

  loadMilestones();
})();
