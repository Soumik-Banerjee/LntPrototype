const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('auth_token');
}

function getEmployee() {
  const data = localStorage.getItem('employee_data');
  return data ? JSON.parse(data) : null;
}

function isLoggedIn() {
  return !!getToken() && !!getEmployee();
}

function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = '/login.html';
  }
}

function isAdmin() {
  const emp = getEmployee();
  return emp && emp.role === 'Admin';
}

function logout() {
  const token = getToken();
  if (token) {
    fetch(`${API_BASE}/logout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }).catch(() => {});
  }
  localStorage.removeItem('auth_token');
  localStorage.removeItem('employee_data');
  window.location.href = '/login.html';
}

async function apiRequest(url, options = {}) {
  const token = getToken();
  const headers = { ...options.headers };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  try {
    const res = await fetch(`${API_BASE}${url}`, {
      ...options,
      headers
    });

    const data = await res.json();

    if (!res.ok) {
      if (res.status === 401) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('employee_data');
        window.location.href = '/login.html';
        return null;
      }
      throw new Error(data.message || 'Request failed');
    }

    return data;
  } catch (err) {
    if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
      showToast('Network error. Please check if the server is running.', 'error');
      throw err;
    }
    throw err;
  }
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) {
    const div = document.createElement('div');
    div.id = 'toast-container';
    div.className = 'toast-container';
    document.body.appendChild(div);
  }

  const icons = {
    success: 'bi-check-circle-fill',
    error: 'bi-x-circle-fill',
    warning: 'bi-exclamation-triangle-fill'
  };

  const toast = document.createElement('div');
  toast.className = `toast-custom toast-${type}`;
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `
    <div class="toast-body">
      <i class="bi ${icons[type] || icons.success}"></i>
      <span>${message}</span>
    </div>
  `;

  const containerEl = document.getElementById('toast-container');
  containerEl.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(timeStr) {
  if (!timeStr) return '--';
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m} ${ampm}`;
}

function getStatusBadge(status) {
  const map = {
    'Present': 'badge-present',
    'Late': 'badge-late',
    'Absent': 'badge-absent',
    'Pending': 'badge-pending',
    'Approved': 'badge-approved',
    'Rejected': 'badge-rejected',
    'Weekend': 'badge-weekend',
    'Open': 'badge-open',
    'In Progress': 'badge-in-progress',
    'Document in Office': 'badge-open',
    'Document Submitted in Bank': 'badge-pending',
    'Query Raised': 'badge-late',
    'Query Resolved': 'badge-approved',
    'Sanctioned': 'badge-approved',
    'Loan Disbursed': 'badge-approved',
    'Follow-up Pending': 'badge-late',
    'Follow-up Completed': 'badge-approved'
  };
  const cls = map[status] || 'badge-present';
  return `<span class="badge-status ${cls}">${status}</span>`;
}

function formatCurrency(value) {
  const amount = Number(value) || 0;
  return `₹${amount.toLocaleString('en-IN')}`;
}

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function renderSidebar() {
  const nav = document.querySelector('.sidebar-nav');
  if (!nav) return;

  const menuItems = [
    { label: 'Dashboard', icon: 'bi-grid-1x2-fill', href: '/dashboard.html' },
    { label: 'Attendance', icon: 'bi-clock-history', href: '/attendance.html' },
    { label: 'Leave', icon: 'bi-calendar-plus', href: '/leave.html' },
    { label: 'Ledger Master', icon: 'bi-people-fill', href: '/ledger.html', adminOnly: true },
    { label: 'Loan Types', icon: 'bi-tags-fill', href: '/loan-types.html', adminOnly: true },
    { label: 'Milestones', icon: 'bi-list-check', href: '/loan-milestones.html', adminOnly: true },
    { label: 'Loan Cases', icon: 'bi-folder2-open', href: '/loan-cases.html', adminOnly: true },
    { label: 'Follow-ups', icon: 'bi-chat-dots', href: '/followups.html', adminOnly: true },
    { label: 'Admin Panel', icon: 'bi-shield-lock-fill', href: '/admin.html', adminOnly: true },
    { label: 'Logout', icon: 'bi-box-arrow-left', href: '#', isLogout: true }
  ];

  const currentPage = window.location.pathname.split('/').pop();
  const activeAliases = { 'loan-case-detail.html': 'loan-cases.html' };
  const activePage = activeAliases[currentPage] || currentPage;

  nav.innerHTML = menuItems.map(item => {
    const isActive = item.href === '/' + activePage;
    const cls = ['nav-link', isActive ? 'active' : '', item.isLogout ? 'logout-link' : ''].filter(Boolean).join(' ');
    const isVisible = !item.adminOnly || isAdmin();
    const itemClass = item.adminOnly ? 'nav-item admin-only' : 'nav-item';
    return `<div class="${itemClass}"${isVisible ? '' : ' style="display:none;"'}><a class="${cls}" href="${item.href}"><i class="bi ${item.icon}"></i>${item.label}</a></div>`;
  }).join('');

  nav.querySelectorAll('.logout-link').forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); logout(); });
  });
}

function setupSidebar() {
  renderSidebar();

  const toggleBtn = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('show');
      if (overlay) overlay.classList.toggle('show');
    });
  }

  if (overlay) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('show');
      overlay.classList.remove('show');
    });
  }

  const emp = getEmployee();
  if (emp) {
    const topbarName = document.getElementById('topbarEmployeeName');
    const topbarRole = document.getElementById('topbarEmployeeRole');
    const avatarText = document.getElementById('avatarText');

    if (topbarName) topbarName.textContent = emp.name;
    if (topbarRole) topbarRole.textContent = emp.department;
    if (avatarText) avatarText.textContent = emp.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  }
}

function populateMonthYearSelects() {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  document.querySelectorAll('select.month-select').forEach(sel => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    months.forEach((m, i) => {
      const opt = document.createElement('option');
      opt.value = i + 1;
      opt.textContent = m;
      sel.appendChild(opt);
    });
    sel.value = currentMonth;
  });

  document.querySelectorAll('select.year-select').forEach(sel => {
    for (let y = currentYear - 2; y <= currentYear + 1; y++) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      sel.appendChild(opt);
    }
    sel.value = currentYear;
  });
}

function updateClock() {
  const el = document.getElementById('liveClock');
  if (!el) return;
  const now = new Date();
  const time = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const date = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  el.innerHTML = `${time}<br><small>${date}</small>`;
}

document.addEventListener('DOMContentLoaded', () => {
  const toastContainer = document.getElementById('toast-container');
  if (!toastContainer && (window.location.pathname !== '/login.html' && window.location.pathname !== '/' && window.location.pathname !== '/index.html')) {
    const div = document.createElement('div');
    div.id = 'toast-container';
    div.className = 'toast-container';
    document.body.appendChild(div);
  }

  if (document.getElementById('sidebar')) {
    setupSidebar();
  }

  if (document.getElementById('liveClock')) {
    updateClock();
    setInterval(updateClock, 1000);
  }

  populateMonthYearSelects();
});
