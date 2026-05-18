(function () {
  'use strict';

  if (!requireAdminModule()) return;

  const modalEl = document.getElementById('ledgerModal');
  const modal = modalEl ? new bootstrap.Modal(modalEl) : null;
  const searchInput = document.getElementById('ledgerSearch');
  const statusFilter = document.getElementById('ledgerStatusFilter');
  const tableBody = document.getElementById('ledgerTableBody');
  const form = document.getElementById('ledgerForm');
  const saveBtn = document.getElementById('saveLedgerBtn');
  const saveText = document.getElementById('saveLedgerText');
  const saveSpinner = document.getElementById('saveLedgerSpinner');

  let ledgers = [];

  function setLoading(loading) {
    saveBtn.disabled = loading;
    saveText.textContent = loading ? 'Saving...' : 'Save Ledger';
    saveSpinner.classList.toggle('d-none', !loading);
  }

  function getField(id) {
    return document.getElementById(id);
  }

  function resetForm() {
    form.reset();
    getField('ledgerId').value = '';
    getField('ledgerIsActive').value = 'true';
    getField('ledgerModalTitle').textContent = 'Add Ledger';
  }

  function openForm(record = null) {
    resetForm();
    if (record) {
      getField('ledgerModalTitle').textContent = 'Edit Ledger';
      getField('ledgerId').value = record.LedgerId;
      getField('ledgerCode').value = record.LedgerCode || '';
      getField('ledgerName').value = record.Ledger || '';
      getField('displayName').value = record.DisplayName || '';
      getField('phoneNumber').value = record.PhoneNumber || '';
      getField('email').value = record.Email || '';
      getField('whatsapp').value = record.Whatsapp || '';
      getField('pan').value = record.Pan || '';
      getField('gst').value = record.Gst || '';
      getField('aadhaar').value = record.Aadhaar || '';
      getField('address1').value = record.Address1 || '';
      getField('address2').value = record.Address2 || '';
      getField('ledgerIsActive').value = String(!!record.IsActive);
    }
    modal.show();
  }

  function renderStats(items) {
    const total = items.length;
    const active = items.filter(item => item.IsActive !== false).length;
    document.getElementById('ledgerTotal').textContent = total;
    document.getElementById('ledgerActive').textContent = active;
    document.getElementById('ledgerInactive').textContent = total - active;
  }

  function renderRows(items) {
    if (!items.length) {
      tableBody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">No ledgers found</td></tr>';
      return;
    }

    tableBody.innerHTML = items.map(item => `
      <tr>
        <td class="fw-semibold">${item.LedgerCode || '--'}</td>
        <td>${item.Ledger || '--'}</td>
        <td>${item.DisplayName || '--'}</td>
        <td>${item.PhoneNumber || '--'}</td>
        <td>${item.Pan || '--'}</td>
        <td>${item.Aadhaar || '--'}</td>
        <td>${renderStatusToggle(item.IsActive !== false)}</td>
        <td style="font-size:12px;">${formatDateTime(item.UpdatedAt || item.CreatedAt)}</td>
        <td>
          <div class="d-flex gap-2 flex-wrap">
            <button class="btn btn-sm btn-outline-primary btn-rounded edit-ledger" data-id="${item.LedgerId}"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-${item.IsActive === false ? 'success' : 'danger'} btn-rounded toggle-ledger" data-id="${item.LedgerId}" data-active="${item.IsActive !== false}">
              <i class="bi ${item.IsActive === false ? 'bi-check-lg' : 'bi-slash-circle'}"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    tableBody.querySelectorAll('.edit-ledger').forEach(btn => {
      btn.addEventListener('click', () => {
        const record = ledgers.find(item => item.LedgerId === Number(btn.dataset.id));
        if (record) openForm(record);
      });
    });

    tableBody.querySelectorAll('.toggle-ledger').forEach(btn => {
      btn.addEventListener('click', async () => {
        const record = ledgers.find(item => item.LedgerId === Number(btn.dataset.id));
        if (!record) return;
        try {
          const data = await apiRequest(`/ledgers/${record.LedgerId}`, {
            method: 'PUT',
            body: { IsActive: !(record.IsActive !== false) }
          });
          if (data && data.success) {
            showToast(data.message || 'Ledger updated', 'success');
            loadLedgers();
          }
        } catch (err) {
          showToast(err.message || 'Failed to update ledger', 'error');
        }
      });
    });
  }

  async function loadLedgers() {
    try {
      const q = searchInput.value.trim();
      const active = statusFilter.value;
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (active !== '') params.set('active', active);
      const data = await apiRequest(`/ledgers${params.toString() ? `?${params.toString()}` : ''}`);
      ledgers = (data && data.ledgers) || [];
      const fullData = await apiRequest('/ledgers');
      renderStats((fullData && fullData.ledgers) || ledgers);
      renderRows(ledgers);
    } catch (err) {
      tableBody.innerHTML = '<tr><td colspan="9" class="text-center text-danger py-4">Failed to load ledgers</td></tr>';
      showToast('Failed to load ledgers', 'error');
    }
  }

  saveBtn.addEventListener('click', async () => {
    const payload = {
      LedgerCode: getField('ledgerCode').value.trim(),
      Ledger: getField('ledgerName').value.trim(),
      DisplayName: getField('displayName').value.trim(),
      PhoneNumber: getField('phoneNumber').value.trim(),
      Email: getField('email').value.trim(),
      Whatsapp: getField('whatsapp').value.trim(),
      Pan: getField('pan').value.trim(),
      Gst: getField('gst').value.trim(),
      Address1: getField('address1').value.trim(),
      Address2: getField('address2').value.trim(),
      Aadhaar: getField('aadhaar').value.trim(),
      IsActive: getField('ledgerIsActive').value === 'true'
    };

    if (!payload.LedgerCode || !payload.Ledger || !payload.DisplayName) {
      showToast('Ledger code, name, and display name are required', 'warning');
      return;
    }

    setLoading(true);
    try {
      const id = getField('ledgerId').value;
      const data = await apiRequest(id ? `/ledgers/${id}` : '/ledgers', {
        method: id ? 'PUT' : 'POST',
        body: payload
      });
      if (data && data.success) {
        showToast(data.message || 'Saved successfully', 'success');
        modal.hide();
        loadLedgers();
      }
    } catch (err) {
      showToast(err.message || 'Failed to save ledger', 'error');
    } finally {
      setLoading(false);
    }
  });

  document.getElementById('addLedgerBtn').addEventListener('click', () => openForm());
  document.getElementById('refreshLedgersBtn').addEventListener('click', loadLedgers);
  searchInput.addEventListener('input', () => {
    clearTimeout(window.__ledgerSearchTimer);
    window.__ledgerSearchTimer = setTimeout(loadLedgers, 250);
  });
  statusFilter.addEventListener('change', loadLedgers);

  loadLedgers();
})();
