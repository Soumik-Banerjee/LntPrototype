(function () {
  'use strict';

  if (isLoggedIn()) {
    const emp = getEmployee();
    window.location.href = emp.role === 'Admin' ? '/admin.html' : '/dashboard.html';
    return;
  }

  const form = document.getElementById('loginForm');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const loginBtn = document.getElementById('loginBtn');
  const loginBtnText = document.getElementById('loginBtnText');
  const loginBtnSpinner = document.getElementById('loginBtnSpinner');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
      showToast('Please enter email and password', 'warning');
      return;
    }

    loginBtn.disabled = true;
    loginBtnText.textContent = 'Signing in...';
    loginBtnSpinner.classList.remove('d-none');

    try {
      const data = await apiRequest('/login', {
        method: 'POST',
        body: { email, password }
      });

      if (data.success) {
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('employee_data', JSON.stringify(data.employee));
        showToast('Login successful! Redirecting...', 'success');
        setTimeout(() => {
          if (data.employee.role === 'Admin') {
            window.location.href = '/admin.html';
          } else {
            window.location.href = '/dashboard.html';
          }
        }, 500);
      }
    } catch (err) {
      showToast(err.message || 'Login failed. Please check your credentials.', 'error');
    } finally {
      loginBtn.disabled = false;
      loginBtnText.textContent = 'Sign In';
      loginBtnSpinner.classList.add('d-none');
    }
  });
})();
