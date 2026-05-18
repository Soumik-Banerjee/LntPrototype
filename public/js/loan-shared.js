function requireAdminModule() {
  requireAuth();
  const emp = getEmployee();
  if (!emp || emp.role !== 'Admin') {
    showToast('Admin access required', 'error');
    setTimeout(() => {
      window.location.href = '/admin.html';
    }, 900);
    return null;
  }
  return emp;
}

async function loadLoanReferenceData() {
  const [ledgersData, loanTypesData, milestonesData, employeesData] = await Promise.all([
    apiRequest('/ledgers?active=true'),
    apiRequest('/loan-types?active=true'),
    apiRequest('/loan-milestones?active=true'),
    apiRequest('/employees')
  ]);

  return {
    ledgers: (ledgersData && ledgersData.ledgers) || [],
    loanTypes: (loanTypesData && loanTypesData.loanTypes) || [],
    milestones: (milestonesData && milestonesData.loanMilestones) || [],
    employees: (employeesData && employeesData.employees) || []
  };
}

function fillSelectOptions(selectEl, items, valueKey, labelFn, placeholder = 'Select') {
  if (!selectEl) return;
  selectEl.innerHTML = `<option value="">${placeholder}</option>`;
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item[valueKey];
    opt.textContent = labelFn(item);
    selectEl.appendChild(opt);
  });
}

function renderStatusToggle(isActive) {
  return isActive
    ? '<span class="badge-status badge-approved">Active</span>'
    : '<span class="badge-status badge-absent">Inactive</span>';
}

function formatDateTime(value) {
  if (!value) return '--';
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
