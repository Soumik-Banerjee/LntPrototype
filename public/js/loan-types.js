(function () {
  'use strict';

  if (!requireAdminModule()) return;

  const modalEl = document.getElementById('loanTypeModal');
  const modal = modalEl ? new bootstrap.Modal(modalEl) : null;
  const searchInput = document.getElementById('loanTypeSearch');
  const statusFilter = document.getElementById('loanTypeStatusFilter');
  const tableBody = document.getElementById('loanTypeTableBody');
  const saveBtn = document.getElementById('saveLoanTypeBtn');
  const saveText = document.getElementById('saveLoanTypeText');
  const saveSpinner = document.getElementById('saveLoanTypeSpinner');

  let items = [];

  function field(id) {
    return document.getElementById(id);
  }

  function setLoading(loading) {
    saveBtn.disabled = loading;
    saveText.textContent = loading ? 'Saving...' : 'Save Type';
    saveSpinner.classList.toggle('d-none', !loading);
  }

  function resetForm() {
    field('loanTypeForm').reset();
    field('loanTypeId').value = '';
    field('loanTypeModalTitle').textContent = 'Add Loan Type';
    field('loanTypeIsActive').value = 'true';
  }

  function openForm(record = null) {
    resetForm();
    if (record) {
      field('loanTypeModalTitle').textContent = 'Edit Loan Type';
      field('loanTypeId').value = record.LoanTypeId;
      field('loanTypeName').value = record.LoanTypeName || '';
      field('loanTypeDescription').value = record.Description || '';
      field('loanTypeSortOrder').value = record.SortOrder || 1;
      field('loanTypeIsActive').value = String(!!record.IsActive);
    }
    modal.show();
  }

  function renderStats(rows) {
    const total = rows.length;
    const active = rows.filter(item => item.IsActive !== false).length;
    document.getElementById('loanTypeTotal').textContent = total;
    document.getElementById('loanTypeActive').textContent = active;
    document.getElementById('loanTypeInactive').textContent = total - active;
  }

  function renderTable(rows) {
    if (!rows.length) {
      tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No loan types found</td></tr>';
      return;
    }

    tableBody.innerHTML = rows.map(item => `
      <tr>
        <td class="fw-semibold">${item.SortOrder || '--'}</td>
        <td>${item.LoanTypeName || '--'}</td>
        <td>${item.Description || '--'}</td>
        <td>${renderStatusToggle(item.IsActive !== false)}</td>
        <td style="font-size:12px;">${formatDateTime(item.UpdatedAt || item.CreatedAt)}</td>
        <td>
          <div class="d-flex gap-2 flex-wrap">
            <button class="btn btn-sm btn-outline-primary btn-rounded edit-type" data-id="${item.LoanTypeId}"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-${item.IsActive === false ? 'success' : 'danger'} btn-rounded toggle-type" data-id="${item.LoanTypeId}">
              <i class="bi ${item.IsActive === false ? 'bi-check-lg' : 'bi-slash-circle'}"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    tableBody.querySelectorAll('.edit-type').forEach(btn => {
      btn.addEventListener('click', () => {
        const record = items.find(item => item.LoanTypeId === Number(btn.dataset.id));
        if (record) openForm(record);
      });
    });

    tableBody.querySelectorAll('.toggle-type').forEach(btn => {
      btn.addEventListener('click', async () => {
        const record = items.find(item => item.LoanTypeId === Number(btn.dataset.id));
        if (!record) return;
        try {
          const method = record.IsActive === false ? 'PUT' : 'DELETE';
          const body = method === 'PUT' ? { IsActive: true } : undefined;
          const data = await apiRequest(`/loan-types/${record.LoanTypeId}`, { method, body });
          if (data && data.success) {
            showToast(data.message || 'Updated successfully', 'success');
            loadLoanTypes();
          }
        } catch (err) {
          showToast(err.message || 'Failed to update loan type', 'error');
        }
      });
    });
  }

  async function loadLoanTypes() {
    try {
      const params = new URLSearchParams();
      const q = searchInput.value.trim();
      if (q) params.set('q', q);
      if (statusFilter.value !== '') params.set('active', statusFilter.value);
      const data = await apiRequest(`/loan-types${params.toString() ? `?${params.toString()}` : ''}`);
      items = (data && data.loanTypes) || [];
      const allData = await apiRequest('/loan-types');
      renderStats((allData && allData.loanTypes) || items);
      renderTable(items);
    } catch (err) {
      tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger py-4">Failed to load loan types</td></tr>';
      showToast('Failed to load loan types', 'error');
    }
  }

  saveBtn.addEventListener('click', async () => {
    const payload = {
      LoanTypeName: field('loanTypeName').value.trim(),
      Description: field('loanTypeDescription').value.trim(),
      SortOrder: field('loanTypeSortOrder').value,
      IsActive: field('loanTypeIsActive').value === 'true'
    };

    if (!payload.LoanTypeName) {
      showToast('Loan type name is required', 'warning');
      return;
    }

    setLoading(true);
    try {
      const id = field('loanTypeId').value;
      const data = await apiRequest(id ? `/loan-types/${id}` : '/loan-types', {
        method: id ? 'PUT' : 'POST',
        body: payload
      });
      if (data && data.success) {
        showToast(data.message || 'Saved successfully', 'success');
        modal.hide();
        loadLoanTypes();
      }
    } catch (err) {
      showToast(err.message || 'Failed to save loan type', 'error');
    } finally {
      setLoading(false);
    }
  });

  document.getElementById('addLoanTypeBtn').addEventListener('click', () => openForm());
  document.getElementById('refreshLoanTypesBtn').addEventListener('click', loadLoanTypes);
  searchInput.addEventListener('input', () => {
    clearTimeout(window.__loanTypeTimer);
    window.__loanTypeTimer = setTimeout(loadLoanTypes, 250);
  });
  statusFilter.addEventListener('change', loadLoanTypes);

  loadLoanTypes();
})();
