const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = path.join(__dirname, 'data');
const EMPLOYEES_FILE = path.join(DATA_DIR, 'employees.json');
const ATTENDANCE_FILE = path.join(DATA_DIR, 'attendance.json');
const LEAVES_FILE = path.join(DATA_DIR, 'leaves.json');
const HOLIDAYS_FILE = path.join(DATA_DIR, 'holidays.json');
const SHIFTS_FILE = path.join(DATA_DIR, 'shifts.json');
const LEDGERS_FILE = path.join(DATA_DIR, 'ledgers.json');
const LOAN_TYPES_FILE = path.join(DATA_DIR, 'loanTypes.json');
const LOAN_MILESTONES_FILE = path.join(DATA_DIR, 'loanMilestones.json');
const LOAN_CASES_FILE = path.join(DATA_DIR, 'loanCases.json');
const LOAN_STATUS_HISTORY_FILE = path.join(DATA_DIR, 'loanStatusHistory.json');
const FOLLOWUPS_FILE = path.join(DATA_DIR, 'followups.json');

const sessions = new Map();

async function readJSON(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeJSON(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function addMinutes(timeStr, minutes) {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const nh = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(nh / 60)).padStart(2, '0')}:${String(nh % 60).padStart(2, '0')}`;
}

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function formatHours(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function getNextId(items, key) {
  if (!Array.isArray(items) || items.length === 0) return 1;
  return Math.max(...items.map(item => Number(item[key]) || 0)) + 1;
}

function normalizeValue(value) {
  return String(value ?? '').trim().toLowerCase();
}

function toBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1' || value === 'on';
}

function toNumber(value, fallback = null) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function formatCurrency(value) {
  const amount = Number(value) || 0;
  return `₹${amount.toLocaleString('en-IN')}`;
}

function getEmployeeNameById(employees, employeeId) {
  const emp = employees.find(e => e.id === employeeId);
  return emp ? emp.name : 'Unknown';
}

async function loadLoanMeta() {
  const [ledgers, loanTypes, milestones, employees] = await Promise.all([
    readJSON(LEDGERS_FILE),
    readJSON(LOAN_TYPES_FILE),
    readJSON(LOAN_MILESTONES_FILE),
    readJSON(EMPLOYEES_FILE)
  ]);

  return {
    ledgers,
    loanTypes,
    milestones,
    employees,
    ledgerById: new Map(ledgers.map(item => [item.LedgerId, item])),
    loanTypeById: new Map(loanTypes.map(item => [item.LoanTypeId, item])),
    milestoneById: new Map(milestones.map(item => [item.LoanMilestoneId, item])),
    employeeById: new Map(employees.map(item => [item.id, item]))
  };
}

function enrichLoanCaseItem(item, meta) {
  const ledger = meta.ledgerById.get(item.LedgerId) || null;
  const loanType = meta.loanTypeById.get(item.LoanTypeId) || null;
  const milestone = meta.milestoneById.get(item.CurrentMilestoneId) || null;
  const assignedTo = meta.employeeById.get(item.AssignedToEmployeeId) || null;

  return {
    ...item,
    LedgerCode: ledger ? ledger.LedgerCode : '',
    Ledger: ledger ? ledger.Ledger : '',
    DisplayName: ledger ? ledger.DisplayName : '',
    LoanTypeName: loanType ? loanType.LoanTypeName : '',
    CurrentMilestoneName: milestone ? milestone.MilestoneName : '',
    IsFinalStage: milestone ? !!milestone.IsFinalStage : false,
    AssignedToEmployeeName: assignedTo ? assignedTo.name : ''
  };
}

function enrichLoanHistoryItem(item, meta) {
  const loanCase = meta.caseById.get(item.LoanCaseId) || null;
  const milestone = meta.milestoneById.get(item.LoanMilestoneId) || null;
  const changedBy = meta.employeeById.get(item.ChangedByEmployeeId) || null;

  return {
    ...item,
    FileNo: loanCase ? loanCase.FileNo : '',
    CaseNo: loanCase ? loanCase.CaseNo : '',
    LedgerId: loanCase ? loanCase.LedgerId : null,
    LoanCaseDisplayName: loanCase ? `${loanCase.FileNo} / ${loanCase.CaseNo}` : '',
    LoanMilestoneName: milestone ? milestone.MilestoneName : '',
    ChangedByEmployeeName: changedBy ? changedBy.name : item.ChangedByEmployeeName || ''
  };
}

function enrichFollowupItem(item, meta) {
  const loanCase = meta.caseById.get(item.LoanCaseId) || null;
  const ledger = loanCase ? meta.ledgerById.get(loanCase.LedgerId) || null : null;
  const loanType = loanCase ? meta.loanTypeById.get(loanCase.LoanTypeId) || null : null;
  const createdBy = meta.employeeById.get(item.CreatedByEmployeeId) || null;

  return {
    ...item,
    FileNo: loanCase ? loanCase.FileNo : '',
    CaseNo: loanCase ? loanCase.CaseNo : '',
    LedgerName: ledger ? ledger.DisplayName || ledger.Ledger : '',
    LoanTypeName: loanType ? loanType.LoanTypeName : '',
    CreatedByName: createdBy ? createdBy.name : item.CreatedBy || ''
  };
}

function getActiveMilestone(milestones) {
  const active = milestones.filter(item => item.IsActive !== false);
  active.sort((a, b) => (Number(a.MilestoneOrder) || 0) - (Number(b.MilestoneOrder) || 0));
  return active[0] || null;
}

function isDuplicateValue(items, key, value, ignoreIdKey = 'LedgerId', ignoreId = null) {
  const normalized = normalizeValue(value);
  return items.some(item => {
    if (ignoreId !== null && item[ignoreIdKey] === ignoreId) return false;
    return normalizeValue(item[key]) === normalized;
  });
}

function validateRequiredFields(fields) {
  return fields.every(field => field !== undefined && field !== null && String(field).trim() !== '');
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function getCurrentTimeStr() {
  return new Date().toTimeString().split(' ')[0].substring(0, 5);
}

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  const token = authHeader.split(' ')[1];
  const session = sessions.get(token);
  if (!session) {
    return res.status(401).json({ success: false, message: 'Invalid or expired session' });
  }
  req.employee = session;
  next();
}

function requireAdmin(req, res, next) {
  if (req.employee.role !== 'Admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }
    const employees = await readJSON(EMPLOYEES_FILE);
    const emp = employees.find(e => e.email === email && e.password === password);
    if (!emp) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    const token = crypto.randomUUID();
    sessions.set(token, {
      id: emp.id,
      name: emp.name,
      email: emp.email,
      role: emp.role,
      employeeCode: emp.employeeCode,
      department: emp.department,
      shiftId: emp.shiftId
    });
    res.json({
      success: true,
      token,
      employee: {
        id: emp.id,
        name: emp.name,
        email: emp.email,
        role: emp.role,
        employeeCode: emp.employeeCode,
        department: emp.department,
        shiftId: emp.shiftId
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.post('/api/logout', authenticate, (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader.split(' ')[1];
  sessions.delete(token);
  res.json({ success: true, message: 'Logged out successfully' });
});

app.post('/api/checkin', authenticate, async (req, res) => {
  try {
    const { id: employeeId } = req.employee;
    const { notes } = req.body;
    let attendance = await readJSON(ATTENDANCE_FILE);
    const today = getTodayStr();

    const existing = attendance.find(a => a.employeeId === employeeId && a.date === today);
    if (existing) {
      return res.status(400).json({ success: false, message: 'You have already checked in today' });
    }

    const employees = await readJSON(EMPLOYEES_FILE);
    const shifts = await readJSON(SHIFTS_FILE);
    const employee = employees.find(e => e.id === employeeId);
    const shift = shifts.find(s => s.id === (employee ? employee.shiftId : 1));

    const timeStr = getCurrentTimeStr();
    const record = {
      id: attendance.length > 0 ? Math.max(...attendance.map(a => a.id)) + 1 : 1,
      employeeId,
      date: today,
      checkIn: timeStr,
      checkOut: null,
      workingHours: null,
      status: 'Present',
      isLate: false,
      notes: notes || '',
      createdAt: new Date().toISOString()
    };

    if (shift) {
      const graceEnd = addMinutes(shift.startTime, shift.graceMinutes);
      if (timeStr > graceEnd) {
        record.isLate = true;
        record.status = 'Late';
      }
    }

    attendance.push(record);
    await writeJSON(ATTENDANCE_FILE, attendance);
    res.json({ success: true, attendance: record, message: 'Check-in successful' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.post('/api/checkout', authenticate, async (req, res) => {
  try {
    const { id: employeeId } = req.employee;
    let attendance = await readJSON(ATTENDANCE_FILE);
    const today = getTodayStr();

    const record = attendance.find(a => a.employeeId === employeeId && a.date === today);
    if (!record) {
      return res.status(400).json({ success: false, message: 'You have not checked in today' });
    }
    if (record.checkOut) {
      return res.status(400).json({ success: false, message: 'You have already checked out today' });
    }

    const timeStr = getCurrentTimeStr();
    record.checkOut = timeStr;

    const checkInMinutes = timeToMinutes(record.checkIn);
    const checkOutMinutes = timeToMinutes(timeStr);
    let diffMinutes = checkOutMinutes - checkInMinutes;
    if (diffMinutes < 0) diffMinutes += 1440;
    record.workingHours = Math.round(diffMinutes);

    await writeJSON(ATTENDANCE_FILE, attendance);
    res.json({
      success: true,
      attendance: record,
      workingHours: formatHours(record.workingHours),
      message: 'Check-out successful'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.get('/api/attendance/:employeeId', authenticate, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const empId = parseInt(employeeId);
    const { month, year } = req.query;

    if (req.employee.id !== empId && req.employee.role !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    let attendance = await readJSON(ATTENDANCE_FILE);
    let records = attendance.filter(a => a.employeeId === empId);

    if (month && year) {
      const m = String(parseInt(month)).padStart(2, '0');
      records = records.filter(a => {
        const parts = a.date.split('-');
        return parts[1] === m && parts[0] === year;
      });
    }

    records.sort((a, b) => b.date.localeCompare(a.date));

    res.json({ success: true, attendance: records });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.post('/api/apply-leave', authenticate, async (req, res) => {
  try {
    const { id: employeeId, name: employeeName } = req.employee;
    const { startDate, endDate, reason, type } = req.body;

    if (!startDate || !endDate || !reason || !type) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({ success: false, message: 'Start date cannot be after end date' });
    }

    let leaves = await readJSON(LEAVES_FILE);

    const leaveDays = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const day = d.getDay();
      if (day !== 0) {
        leaveDays.push(d.toISOString().split('T')[0]);
      }
    }

    const record = {
      id: leaves.length > 0 ? Math.max(...leaves.map(l => l.id)) + 1 : 1,
      employeeId,
      employeeName,
      startDate,
      endDate,
      days: leaveDays.length,
      type,
      reason,
      status: 'Pending',
      adminRemarks: '',
      appliedOn: new Date().toISOString()
    };

    leaves.push(record);
    await writeJSON(LEAVES_FILE, leaves);
    res.json({ success: true, leave: record, message: 'Leave applied successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.get('/api/leaves', authenticate, async (req, res) => {
  try {
    const { employeeId } = req.query;
    let leaves = await readJSON(LEAVES_FILE);

    if (employeeId) {
      leaves = leaves.filter(l => l.employeeId === parseInt(employeeId));
    } else if (req.employee.role !== 'Admin') {
      leaves = leaves.filter(l => l.employeeId === req.employee.id);
    }

    leaves.sort((a, b) => new Date(b.appliedOn) - new Date(a.appliedOn));
    res.json({ success: true, leaves });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.put('/api/leaves/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminRemarks } = req.body;

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    let leaves = await readJSON(LEAVES_FILE);
    const index = leaves.findIndex(l => l.id === parseInt(id));
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Leave not found' });
    }

    leaves[index].status = status;
    leaves[index].adminRemarks = adminRemarks || '';

    await writeJSON(LEAVES_FILE, leaves);
    res.json({ success: true, leave: leaves[index], message: `Leave ${status.toLowerCase()} successfully` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.get('/api/dashboard-summary/:employeeId', authenticate, async (req, res) => {
  try {
    const empId = parseInt(req.params.employeeId);
    if (req.employee.id !== empId && req.employee.role !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const attendance = await readJSON(ATTENDANCE_FILE);
    const leaves = await readJSON(LEAVES_FILE);
    const shifts = await readJSON(SHIFTS_FILE);
    const employees = await readJSON(EMPLOYEES_FILE);

    const today = getTodayStr();
    const currentMonth = today.substring(0, 7);
    const currentYear = today.substring(0, 4);

    const todayAttendance = attendance.find(a => a.employeeId === empId && a.date === today) || null;

    const monthlyRecords = attendance.filter(a => {
      return a.employeeId === empId && a.date.startsWith(currentMonth);
    });

    const presentDays = monthlyRecords.filter(a => a.status === 'Present' || a.status === 'Late').length;
    const lateMarks = monthlyRecords.filter(a => a.isLate).length;
    const totalHours = monthlyRecords.reduce((sum, a) => sum + (a.workingHours || 0), 0);

    const employee = employees.find(e => e.id === empId);
    const shift = shifts.find(s => s.id === (employee ? employee.shiftId : 1));

    const employeeLeaves = leaves.filter(l => {
      return l.employeeId === empId && l.date && l.date.startsWith(currentYear);
    });

    const pendingLeaves = leaves.filter(l => l.employeeId === empId && l.status === 'Pending');
    const approvedLeaves = leaves.filter(l => l.employeeId === empId && l.status === 'Approved');

    const leaveBalance = {
      sick: 12 - approvedLeaves.filter(l => l.type === 'Sick').length,
      casual: 15 - approvedLeaves.filter(l => l.type === 'Casual').length,
      annual: 20 - approvedLeaves.filter(l => l.type === 'Annual').length
    };

    res.json({
      success: true,
      todayAttendance,
      monthlyStats: {
        presentDays,
        lateMarks,
        totalHours,
        totalHoursFormatted: formatHours(totalHours),
        totalDays: monthlyRecords.length
      },
      leaveBalance,
      pendingLeaves: pendingLeaves.length,
      shift: shift || null
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.get('/api/admin-summary', authenticate, requireAdmin, async (req, res) => {
  try {
    const employees = await readJSON(EMPLOYEES_FILE);
    const attendance = await readJSON(ATTENDANCE_FILE);
    const leaves = await readJSON(LEAVES_FILE);
    const today = getTodayStr();

    const todayRecords = attendance.filter(a => a.date === today);
    const presentToday = todayRecords.filter(a => a.checkIn).length;
    const totalEmployees = employees.filter(e => e.role !== 'Admin').length;
    const absentToday = totalEmployees - presentToday;
    const pendingLeaves = leaves.filter(l => l.status === 'Pending').length;

    const recentAttendance = attendance
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 20)
      .map(a => {
        const emp = employees.find(e => e.id === a.employeeId);
        return { ...a, employeeName: emp ? emp.name : 'Unknown', employeeCode: emp ? emp.employeeCode : '' };
      });

    const recentLeaves = leaves
      .sort((a, b) => new Date(b.appliedOn) - new Date(a.appliedOn))
      .slice(0, 10);

    res.json({
      success: true,
      totalEmployees,
      presentToday,
      absentToday,
      pendingLeaves,
      recentAttendance,
      recentLeaves,
      employees: employees.filter(e => e.role !== 'Admin')
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.get('/api/employees', authenticate, requireAdmin, async (req, res) => {
  try {
    const employees = await readJSON(EMPLOYEES_FILE);
    res.json({ success: true, employees });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.get('/api/shifts', authenticate, async (req, res) => {
  try {
    const shifts = await readJSON(SHIFTS_FILE);
    res.json({ success: true, shifts });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.get('/api/holidays', authenticate, async (req, res) => {
  try {
    const holidays = await readJSON(HOLIDAYS_FILE);
    res.json({ success: true, holidays });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.get('/api/monthly-attendance/:employeeId', authenticate, async (req, res) => {
  try {
    const empId = parseInt(req.params.employeeId);
    if (req.employee.id !== empId && req.employee.role !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ success: false, message: 'Month and year are required' });
    }

    const attendance = await readJSON(ATTENDANCE_FILE);
    const m = String(parseInt(month)).padStart(2, '0');
    const records = attendance.filter(a => {
      return a.employeeId === empId && a.date.startsWith(`${year}-${m}`);
    });

    const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
    const result = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${m}-${String(day).padStart(2, '0')}`;
      const dateObj = new Date(dateStr);
      const dayOfWeek = dateObj.getDay();

      const record = records.find(r => r.date === dateStr);
      const isWeekend = dayOfWeek === 0;

      result.push({
        date: dateStr,
        day: day,
        dayName: dateObj.toLocaleDateString('en-US', { weekday: 'short' }),
        isWeekend,
        record: record || null,
        status: record ? record.status : (isWeekend ? 'Weekend' : 'Absent')
      });
    }

    res.json({ success: true, attendance: result });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

function requireLoanAdmin(req, res, next) {
  return requireAdmin(req, res, next);
}

app.get('/api/ledgers', authenticate, requireLoanAdmin, async (req, res) => {
  try {
    let ledgers = await readJSON(LEDGERS_FILE);
    const { q, active } = req.query;

    if (typeof active !== 'undefined') {
      const activeFlag = toBoolean(active);
      ledgers = ledgers.filter(item => !!item.IsActive === activeFlag);
    }

    if (q) {
      const term = normalizeValue(q);
      ledgers = ledgers.filter(item => [
        item.LedgerCode,
        item.Ledger,
        item.DisplayName,
        item.PhoneNumber,
        item.Email,
        item.Whatsapp,
        item.Pan,
        item.Gst,
        item.Aadhaar
      ].some(value => normalizeValue(value).includes(term)));
    }

    ledgers.sort((a, b) => (b.UpdatedAt || b.CreatedAt || '').localeCompare(a.UpdatedAt || a.CreatedAt || ''));
    res.json({ success: true, ledgers });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.post('/api/ledgers', authenticate, requireLoanAdmin, async (req, res) => {
  try {
    const {
      LedgerCode,
      Ledger,
      DisplayName,
      PhoneNumber,
      Email,
      Whatsapp,
      Pan,
      Gst,
      Address1,
      Address2,
      Aadhaar,
      IsActive
    } = req.body;

    if (!validateRequiredFields([LedgerCode, Ledger, DisplayName])) {
      return res.status(400).json({ success: false, message: 'LedgerCode, Ledger, and DisplayName are required' });
    }

    const ledgers = await readJSON(LEDGERS_FILE);
    const newId = getNextId(ledgers, 'LedgerId');

    if (isDuplicateValue(ledgers, 'LedgerCode', LedgerCode)) {
      return res.status(400).json({ success: false, message: 'Ledger code already exists' });
    }
    if (PhoneNumber && isDuplicateValue(ledgers, 'PhoneNumber', PhoneNumber)) {
      return res.status(400).json({ success: false, message: 'Phone number already exists' });
    }
    if (Email && isDuplicateValue(ledgers, 'Email', Email)) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }
    if (Pan && isDuplicateValue(ledgers, 'Pan', Pan)) {
      return res.status(400).json({ success: false, message: 'PAN already exists' });
    }
    if (Aadhaar && isDuplicateValue(ledgers, 'Aadhaar', Aadhaar)) {
      return res.status(400).json({ success: false, message: 'Aadhaar already exists' });
    }

    const record = {
      LedgerId: newId,
      LedgerCode: String(LedgerCode).trim(),
      Ledger: String(Ledger).trim(),
      DisplayName: String(DisplayName).trim(),
      PhoneNumber: String(PhoneNumber || '').trim(),
      Email: String(Email || '').trim(),
      Whatsapp: String(Whatsapp || '').trim(),
      Pan: String(Pan || '').trim(),
      Gst: String(Gst || '').trim(),
      Address1: String(Address1 || '').trim(),
      Address2: String(Address2 || '').trim(),
      Aadhaar: String(Aadhaar || '').trim(),
      IsActive: typeof IsActive === 'undefined' ? true : toBoolean(IsActive),
      CreatedAt: new Date().toISOString(),
      UpdatedAt: new Date().toISOString()
    };

    ledgers.push(record);
    await writeJSON(LEDGERS_FILE, ledgers);
    res.json({ success: true, ledger: record, message: 'Ledger created successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.put('/api/ledgers/:id', authenticate, requireLoanAdmin, async (req, res) => {
  try {
    const ledgerId = parseInt(req.params.id);
    const ledgers = await readJSON(LEDGERS_FILE);
    const index = ledgers.findIndex(item => item.LedgerId === ledgerId);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Ledger not found' });
    }

    const payload = req.body;
    const current = ledgers[index];

    if (payload.LedgerCode && isDuplicateValue(ledgers, 'LedgerCode', payload.LedgerCode, 'LedgerId', ledgerId)) {
      return res.status(400).json({ success: false, message: 'Ledger code already exists' });
    }
    if (payload.PhoneNumber && isDuplicateValue(ledgers, 'PhoneNumber', payload.PhoneNumber, 'LedgerId', ledgerId)) {
      return res.status(400).json({ success: false, message: 'Phone number already exists' });
    }
    if (payload.Email && isDuplicateValue(ledgers, 'Email', payload.Email, 'LedgerId', ledgerId)) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }
    if (payload.Pan && isDuplicateValue(ledgers, 'Pan', payload.Pan, 'LedgerId', ledgerId)) {
      return res.status(400).json({ success: false, message: 'PAN already exists' });
    }
    if (payload.Aadhaar && isDuplicateValue(ledgers, 'Aadhaar', payload.Aadhaar, 'LedgerId', ledgerId)) {
      return res.status(400).json({ success: false, message: 'Aadhaar already exists' });
    }

    ledgers[index] = {
      ...current,
      LedgerCode: payload.LedgerCode !== undefined ? String(payload.LedgerCode).trim() : current.LedgerCode,
      Ledger: payload.Ledger !== undefined ? String(payload.Ledger).trim() : current.Ledger,
      DisplayName: payload.DisplayName !== undefined ? String(payload.DisplayName).trim() : current.DisplayName,
      PhoneNumber: payload.PhoneNumber !== undefined ? String(payload.PhoneNumber || '').trim() : current.PhoneNumber,
      Email: payload.Email !== undefined ? String(payload.Email || '').trim() : current.Email,
      Whatsapp: payload.Whatsapp !== undefined ? String(payload.Whatsapp || '').trim() : current.Whatsapp,
      Pan: payload.Pan !== undefined ? String(payload.Pan || '').trim() : current.Pan,
      Gst: payload.Gst !== undefined ? String(payload.Gst || '').trim() : current.Gst,
      Address1: payload.Address1 !== undefined ? String(payload.Address1 || '').trim() : current.Address1,
      Address2: payload.Address2 !== undefined ? String(payload.Address2 || '').trim() : current.Address2,
      Aadhaar: payload.Aadhaar !== undefined ? String(payload.Aadhaar || '').trim() : current.Aadhaar,
      IsActive: payload.IsActive !== undefined ? toBoolean(payload.IsActive) : current.IsActive,
      UpdatedAt: new Date().toISOString()
    };

    await writeJSON(LEDGERS_FILE, ledgers);
    res.json({ success: true, ledger: ledgers[index], message: 'Ledger updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.delete('/api/ledgers/:id', authenticate, requireLoanAdmin, async (req, res) => {
  try {
    const ledgerId = parseInt(req.params.id);
    const ledgers = await readJSON(LEDGERS_FILE);
    const index = ledgers.findIndex(item => item.LedgerId === ledgerId);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Ledger not found' });
    }

    ledgers[index].IsActive = false;
    ledgers[index].UpdatedAt = new Date().toISOString();
    await writeJSON(LEDGERS_FILE, ledgers);
    res.json({ success: true, message: 'Ledger disabled successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.get('/api/loan-types', authenticate, requireLoanAdmin, async (req, res) => {
  try {
    let loanTypes = await readJSON(LOAN_TYPES_FILE);
    const { q, active } = req.query;

    if (typeof active !== 'undefined') {
      const activeFlag = toBoolean(active);
      loanTypes = loanTypes.filter(item => !!item.IsActive === activeFlag);
    }

    if (q) {
      const term = normalizeValue(q);
      loanTypes = loanTypes.filter(item => [
        item.LoanTypeName,
        item.Description
      ].some(value => normalizeValue(value).includes(term)));
    }

    loanTypes.sort((a, b) => (Number(a.SortOrder) || 0) - (Number(b.SortOrder) || 0));
    res.json({ success: true, loanTypes });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.post('/api/loan-types', authenticate, requireLoanAdmin, async (req, res) => {
  try {
    const { LoanTypeName, Description, IsActive, SortOrder } = req.body;
    if (!validateRequiredFields([LoanTypeName])) {
      return res.status(400).json({ success: false, message: 'LoanTypeName is required' });
    }

    const loanTypes = await readJSON(LOAN_TYPES_FILE);
    if (isDuplicateValue(loanTypes, 'LoanTypeName', LoanTypeName)) {
      return res.status(400).json({ success: false, message: 'Loan type already exists' });
    }

    const record = {
      LoanTypeId: getNextId(loanTypes, 'LoanTypeId'),
      LoanTypeName: String(LoanTypeName).trim(),
      Description: String(Description || '').trim(),
      IsActive: typeof IsActive === 'undefined' ? true : toBoolean(IsActive),
      SortOrder: toNumber(SortOrder, loanTypes.length + 1) || loanTypes.length + 1,
      CreatedAt: new Date().toISOString(),
      UpdatedAt: new Date().toISOString()
    };

    loanTypes.push(record);
    await writeJSON(LOAN_TYPES_FILE, loanTypes);
    res.json({ success: true, loanType: record, message: 'Loan type created successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.put('/api/loan-types/:id', authenticate, requireLoanAdmin, async (req, res) => {
  try {
    const loanTypeId = parseInt(req.params.id);
    const loanTypes = await readJSON(LOAN_TYPES_FILE);
    const index = loanTypes.findIndex(item => item.LoanTypeId === loanTypeId);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Loan type not found' });
    }

    const payload = req.body;
    if (payload.LoanTypeName && isDuplicateValue(loanTypes, 'LoanTypeName', payload.LoanTypeName, 'LoanTypeId', loanTypeId)) {
      return res.status(400).json({ success: false, message: 'Loan type already exists' });
    }

    loanTypes[index] = {
      ...loanTypes[index],
      LoanTypeName: payload.LoanTypeName !== undefined ? String(payload.LoanTypeName).trim() : loanTypes[index].LoanTypeName,
      Description: payload.Description !== undefined ? String(payload.Description || '').trim() : loanTypes[index].Description,
      IsActive: payload.IsActive !== undefined ? toBoolean(payload.IsActive) : loanTypes[index].IsActive,
      SortOrder: payload.SortOrder !== undefined ? toNumber(payload.SortOrder, loanTypes[index].SortOrder) : loanTypes[index].SortOrder,
      UpdatedAt: new Date().toISOString()
    };

    await writeJSON(LOAN_TYPES_FILE, loanTypes);
    res.json({ success: true, loanType: loanTypes[index], message: 'Loan type updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.delete('/api/loan-types/:id', authenticate, requireLoanAdmin, async (req, res) => {
  try {
    const loanTypeId = parseInt(req.params.id);
    const loanTypes = await readJSON(LOAN_TYPES_FILE);
    const index = loanTypes.findIndex(item => item.LoanTypeId === loanTypeId);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Loan type not found' });
    }

    loanTypes[index].IsActive = false;
    loanTypes[index].UpdatedAt = new Date().toISOString();
    await writeJSON(LOAN_TYPES_FILE, loanTypes);
    res.json({ success: true, message: 'Loan type deactivated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.get('/api/loan-milestones', authenticate, requireLoanAdmin, async (req, res) => {
  try {
    let milestones = await readJSON(LOAN_MILESTONES_FILE);
    const { q, active } = req.query;

    if (typeof active !== 'undefined') {
      const activeFlag = toBoolean(active);
      milestones = milestones.filter(item => !!item.IsActive === activeFlag);
    }

    if (q) {
      const term = normalizeValue(q);
      milestones = milestones.filter(item => normalizeValue(item.MilestoneName).includes(term));
    }

    milestones.sort((a, b) => (Number(a.MilestoneOrder) || 0) - (Number(b.MilestoneOrder) || 0));
    res.json({ success: true, loanMilestones: milestones });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.post('/api/loan-milestones', authenticate, requireLoanAdmin, async (req, res) => {
  try {
    const {
      MilestoneName,
      MilestoneOrder,
      IsActive,
      IsFinalStage,
      RequiresRemark,
      RequiresDocumentUpload,
      DefaultSlaDays
    } = req.body;

    if (!validateRequiredFields([MilestoneName])) {
      return res.status(400).json({ success: false, message: 'MilestoneName is required' });
    }

    const milestones = await readJSON(LOAN_MILESTONES_FILE);
    if (isDuplicateValue(milestones, 'MilestoneName', MilestoneName)) {
      return res.status(400).json({ success: false, message: 'Milestone already exists' });
    }

    const record = {
      LoanMilestoneId: getNextId(milestones, 'LoanMilestoneId'),
      MilestoneName: String(MilestoneName).trim(),
      MilestoneOrder: toNumber(MilestoneOrder, milestones.length + 1) || milestones.length + 1,
      IsActive: typeof IsActive === 'undefined' ? true : toBoolean(IsActive),
      IsFinalStage: toBoolean(IsFinalStage),
      RequiresRemark: toBoolean(RequiresRemark),
      RequiresDocumentUpload: toBoolean(RequiresDocumentUpload),
      DefaultSlaDays: toNumber(DefaultSlaDays, 0) || 0,
      CreatedAt: new Date().toISOString(),
      UpdatedAt: new Date().toISOString()
    };

    milestones.push(record);
    await writeJSON(LOAN_MILESTONES_FILE, milestones);
    res.json({ success: true, loanMilestone: record, message: 'Milestone created successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.put('/api/loan-milestones/:id', authenticate, requireLoanAdmin, async (req, res) => {
  try {
    const milestoneId = parseInt(req.params.id);
    const milestones = await readJSON(LOAN_MILESTONES_FILE);
    const index = milestones.findIndex(item => item.LoanMilestoneId === milestoneId);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Milestone not found' });
    }

    const payload = req.body;
    if (payload.MilestoneName && isDuplicateValue(milestones, 'MilestoneName', payload.MilestoneName, 'LoanMilestoneId', milestoneId)) {
      return res.status(400).json({ success: false, message: 'Milestone already exists' });
    }

    milestones[index] = {
      ...milestones[index],
      MilestoneName: payload.MilestoneName !== undefined ? String(payload.MilestoneName).trim() : milestones[index].MilestoneName,
      MilestoneOrder: payload.MilestoneOrder !== undefined ? toNumber(payload.MilestoneOrder, milestones[index].MilestoneOrder) : milestones[index].MilestoneOrder,
      IsActive: payload.IsActive !== undefined ? toBoolean(payload.IsActive) : milestones[index].IsActive,
      IsFinalStage: payload.IsFinalStage !== undefined ? toBoolean(payload.IsFinalStage) : milestones[index].IsFinalStage,
      RequiresRemark: payload.RequiresRemark !== undefined ? toBoolean(payload.RequiresRemark) : milestones[index].RequiresRemark,
      RequiresDocumentUpload: payload.RequiresDocumentUpload !== undefined ? toBoolean(payload.RequiresDocumentUpload) : milestones[index].RequiresDocumentUpload,
      DefaultSlaDays: payload.DefaultSlaDays !== undefined ? toNumber(payload.DefaultSlaDays, milestones[index].DefaultSlaDays) : milestones[index].DefaultSlaDays,
      UpdatedAt: new Date().toISOString()
    };

    await writeJSON(LOAN_MILESTONES_FILE, milestones);
    res.json({ success: true, loanMilestone: milestones[index], message: 'Milestone updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.delete('/api/loan-milestones/:id', authenticate, requireLoanAdmin, async (req, res) => {
  try {
    const milestoneId = parseInt(req.params.id);
    const milestones = await readJSON(LOAN_MILESTONES_FILE);
    const index = milestones.findIndex(item => item.LoanMilestoneId === milestoneId);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Milestone not found' });
    }

    milestones[index].IsActive = false;
    milestones[index].UpdatedAt = new Date().toISOString();
    await writeJSON(LOAN_MILESTONES_FILE, milestones);
    res.json({ success: true, message: 'Milestone deactivated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.get('/api/loan-cases', authenticate, requireLoanAdmin, async (req, res) => {
  try {
    const meta = await loadLoanMeta();
    let loanCases = await readJSON(LOAN_CASES_FILE);
    const { q, ledgerId, loanTypeId, status, milestoneId, priority } = req.query;

    if (ledgerId) {
      loanCases = loanCases.filter(item => item.LedgerId === parseInt(ledgerId));
    }
    if (loanTypeId) {
      loanCases = loanCases.filter(item => item.LoanTypeId === parseInt(loanTypeId));
    }
    if (status) {
      const statusTerm = normalizeValue(status);
      loanCases = loanCases.filter(item => normalizeValue(item.CurrentStatus).includes(statusTerm));
    }
    if (milestoneId) {
      loanCases = loanCases.filter(item => item.CurrentMilestoneId === parseInt(milestoneId));
    }
    if (priority) {
      const priorityTerm = normalizeValue(priority);
      loanCases = loanCases.filter(item => normalizeValue(item.Priority) === priorityTerm);
    }
    if (q) {
      const term = normalizeValue(q);
      loanCases = loanCases.filter(item => {
        const ledger = meta.ledgerById.get(item.LedgerId);
        const loanType = meta.loanTypeById.get(item.LoanTypeId);
        const milestone = meta.milestoneById.get(item.CurrentMilestoneId);
        return [
          item.FileNo,
          item.CaseNo,
          item.CurrentStatus,
          item.Priority,
          ledger ? ledger.LedgerCode : '',
          ledger ? ledger.Ledger : '',
          ledger ? ledger.DisplayName : '',
          loanType ? loanType.LoanTypeName : '',
          milestone ? milestone.MilestoneName : ''
        ].some(value => normalizeValue(value).includes(term));
      });
    }

    const enriched = loanCases
      .map(item => enrichLoanCaseItem(item, meta))
      .sort((a, b) => (b.UpdatedAt || b.CreatedAt || '').localeCompare(a.UpdatedAt || a.CreatedAt || ''));

    res.json({ success: true, loanCases: enriched });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.post('/api/loan-cases', authenticate, requireLoanAdmin, async (req, res) => {
  try {
    const {
      FileNo,
      CaseNo,
      LedgerId,
      LoanTypeId,
      LoanAmount,
      SanctionAmount,
      Tenure,
      InterestRate,
      AssignedToEmployeeId,
      CurrentMilestoneId,
      CurrentStatus,
      Priority,
      Remarks
    } = req.body;

    if (!validateRequiredFields([FileNo, CaseNo, LedgerId, LoanTypeId, LoanAmount])) {
      return res.status(400).json({ success: false, message: 'FileNo, CaseNo, LedgerId, LoanTypeId, and LoanAmount are required' });
    }

    const meta = await loadLoanMeta();
    const loanCases = await readJSON(LOAN_CASES_FILE);

    if (isDuplicateValue(loanCases, 'FileNo', FileNo)) {
      return res.status(400).json({ success: false, message: 'File number already exists' });
    }
    if (isDuplicateValue(loanCases, 'CaseNo', CaseNo)) {
      return res.status(400).json({ success: false, message: 'Case number already exists' });
    }

    const ledgerId = parseInt(LedgerId);
    const loanTypeId = parseInt(LoanTypeId);
    const milestone = meta.milestoneById.get(parseInt(CurrentMilestoneId)) || getActiveMilestone(meta.milestones);
    const initialStatus = String(CurrentStatus || (milestone ? milestone.MilestoneName : 'Open')).trim();

    if (!meta.ledgerById.get(ledgerId)) {
      return res.status(400).json({ success: false, message: 'Invalid ledger selected' });
    }
    if (!meta.loanTypeById.get(loanTypeId)) {
      return res.status(400).json({ success: false, message: 'Invalid loan type selected' });
    }
    if (AssignedToEmployeeId && !meta.employeeById.get(parseInt(AssignedToEmployeeId))) {
      return res.status(400).json({ success: false, message: 'Invalid assigned employee' });
    }

    const record = {
      LoanCaseId: getNextId(loanCases, 'LoanCaseId'),
      FileNo: String(FileNo).trim(),
      CaseNo: String(CaseNo).trim(),
      LedgerId: ledgerId,
      LoanTypeId: loanTypeId,
      LoanAmount: toNumber(LoanAmount, 0) || 0,
      SanctionAmount: toNumber(SanctionAmount, 0) || 0,
      Tenure: toNumber(Tenure, 0) || 0,
      InterestRate: toNumber(InterestRate, 0) || 0,
      AssignedToEmployeeId: AssignedToEmployeeId ? parseInt(AssignedToEmployeeId) : null,
      CurrentMilestoneId: milestone ? milestone.LoanMilestoneId : null,
      CurrentStatus: initialStatus,
      Priority: String(Priority || 'Normal').trim(),
      Remarks: String(Remarks || '').trim(),
      CreatedAt: new Date().toISOString(),
      UpdatedAt: new Date().toISOString()
    };

    loanCases.push(record);
    await writeJSON(LOAN_CASES_FILE, loanCases);

    const history = await readJSON(LOAN_STATUS_HISTORY_FILE);
    history.push({
      LoanStatusHistoryId: getNextId(history, 'LoanStatusHistoryId'),
      LoanCaseId: record.LoanCaseId,
      LoanMilestoneId: record.CurrentMilestoneId,
      Status: record.CurrentStatus,
      Remark: record.Remarks,
      ChangedByEmployeeId: req.employee.id,
      ChangedByEmployeeName: req.employee.name,
      ChangedAt: new Date().toISOString(),
      NextFollowUpDate: '',
      IsCurrent: true
    });
    await writeJSON(LOAN_STATUS_HISTORY_FILE, history);

    res.json({ success: true, loanCase: enrichLoanCaseItem(record, meta), message: 'Loan case created successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.get('/api/loan-cases/:id', authenticate, requireLoanAdmin, async (req, res) => {
  try {
    const loanCaseId = parseInt(req.params.id);
    const meta = await loadLoanMeta();
    const loanCases = await readJSON(LOAN_CASES_FILE);
    const loanCase = loanCases.find(item => item.LoanCaseId === loanCaseId);

    if (!loanCase) {
      return res.status(404).json({ success: false, message: 'Loan case not found' });
    }

    res.json({ success: true, loanCase: enrichLoanCaseItem(loanCase, meta) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.put('/api/loan-cases/:id', authenticate, requireLoanAdmin, async (req, res) => {
  try {
    const loanCaseId = parseInt(req.params.id);
    const loanCases = await readJSON(LOAN_CASES_FILE);
    const index = loanCases.findIndex(item => item.LoanCaseId === loanCaseId);

    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Loan case not found' });
    }

    const meta = await loadLoanMeta();
    const payload = req.body;

    if (payload.FileNo && isDuplicateValue(loanCases, 'FileNo', payload.FileNo, 'LoanCaseId', loanCaseId)) {
      return res.status(400).json({ success: false, message: 'File number already exists' });
    }
    if (payload.CaseNo && isDuplicateValue(loanCases, 'CaseNo', payload.CaseNo, 'LoanCaseId', loanCaseId)) {
      return res.status(400).json({ success: false, message: 'Case number already exists' });
    }
    if (payload.LedgerId && !meta.ledgerById.get(parseInt(payload.LedgerId))) {
      return res.status(400).json({ success: false, message: 'Invalid ledger selected' });
    }
    if (payload.LoanTypeId && !meta.loanTypeById.get(parseInt(payload.LoanTypeId))) {
      return res.status(400).json({ success: false, message: 'Invalid loan type selected' });
    }
    if (payload.AssignedToEmployeeId && !meta.employeeById.get(parseInt(payload.AssignedToEmployeeId))) {
      return res.status(400).json({ success: false, message: 'Invalid assigned employee' });
    }

    loanCases[index] = {
      ...loanCases[index],
      FileNo: payload.FileNo !== undefined ? String(payload.FileNo).trim() : loanCases[index].FileNo,
      CaseNo: payload.CaseNo !== undefined ? String(payload.CaseNo).trim() : loanCases[index].CaseNo,
      LedgerId: payload.LedgerId !== undefined ? parseInt(payload.LedgerId) : loanCases[index].LedgerId,
      LoanTypeId: payload.LoanTypeId !== undefined ? parseInt(payload.LoanTypeId) : loanCases[index].LoanTypeId,
      LoanAmount: payload.LoanAmount !== undefined ? toNumber(payload.LoanAmount, loanCases[index].LoanAmount) : loanCases[index].LoanAmount,
      SanctionAmount: payload.SanctionAmount !== undefined ? toNumber(payload.SanctionAmount, loanCases[index].SanctionAmount) : loanCases[index].SanctionAmount,
      Tenure: payload.Tenure !== undefined ? toNumber(payload.Tenure, loanCases[index].Tenure) : loanCases[index].Tenure,
      InterestRate: payload.InterestRate !== undefined ? toNumber(payload.InterestRate, loanCases[index].InterestRate) : loanCases[index].InterestRate,
      AssignedToEmployeeId: payload.AssignedToEmployeeId !== undefined ? (payload.AssignedToEmployeeId ? parseInt(payload.AssignedToEmployeeId) : null) : loanCases[index].AssignedToEmployeeId,
      Priority: payload.Priority !== undefined ? String(payload.Priority).trim() : loanCases[index].Priority,
      Remarks: payload.Remarks !== undefined ? String(payload.Remarks || '').trim() : loanCases[index].Remarks,
      UpdatedAt: new Date().toISOString()
    };

    await writeJSON(LOAN_CASES_FILE, loanCases);
    res.json({ success: true, loanCase: enrichLoanCaseItem(loanCases[index], meta), message: 'Loan case updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.post('/api/loan-cases/:id/status', authenticate, requireLoanAdmin, async (req, res) => {
  try {
    const loanCaseId = parseInt(req.params.id);
    const { LoanMilestoneId, Status, Remark, NextFollowUpDate } = req.body;

    const meta = await loadLoanMeta();
    const loanCases = await readJSON(LOAN_CASES_FILE);
    const caseIndex = loanCases.findIndex(item => item.LoanCaseId === loanCaseId);
    if (caseIndex === -1) {
      return res.status(404).json({ success: false, message: 'Loan case not found' });
    }

    const milestoneId = parseInt(LoanMilestoneId);
    const milestone = meta.milestoneById.get(milestoneId);
    if (!milestone) {
      return res.status(400).json({ success: false, message: 'Invalid milestone selected' });
    }

    loanCases[caseIndex].CurrentMilestoneId = milestone.LoanMilestoneId;
    loanCases[caseIndex].CurrentStatus = String(Status || milestone.MilestoneName).trim();
    loanCases[caseIndex].Remarks = Remark !== undefined ? String(Remark || '').trim() : loanCases[caseIndex].Remarks;
    loanCases[caseIndex].UpdatedAt = new Date().toISOString();

    await writeJSON(LOAN_CASES_FILE, loanCases);

    const history = await readJSON(LOAN_STATUS_HISTORY_FILE);
    history.forEach(item => {
      if (item.LoanCaseId === loanCaseId) {
        item.IsCurrent = false;
      }
    });

    const historyRecord = {
      LoanStatusHistoryId: getNextId(history, 'LoanStatusHistoryId'),
      LoanCaseId: loanCaseId,
      LoanMilestoneId: milestone.LoanMilestoneId,
      Status: loanCases[caseIndex].CurrentStatus,
      Remark: String(Remark || '').trim(),
      ChangedByEmployeeId: req.employee.id,
      ChangedByEmployeeName: req.employee.name,
      ChangedAt: new Date().toISOString(),
      NextFollowUpDate: String(NextFollowUpDate || '').trim(),
      IsCurrent: true
    };

    history.push(historyRecord);
    await writeJSON(LOAN_STATUS_HISTORY_FILE, history);

    res.json({
      success: true,
      loanCase: enrichLoanCaseItem(loanCases[caseIndex], meta),
      history: enrichLoanHistoryItem(historyRecord, { ...meta, caseById: new Map(loanCases.map(item => [item.LoanCaseId, item])) }),
      message: 'Loan status updated successfully'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.get('/api/loan-cases/:id/history', authenticate, requireLoanAdmin, async (req, res) => {
  try {
    const loanCaseId = parseInt(req.params.id);
    const meta = await loadLoanMeta();
    const loanCases = await readJSON(LOAN_CASES_FILE);
    const caseById = new Map(loanCases.map(item => [item.LoanCaseId, item]));
    const history = await readJSON(LOAN_STATUS_HISTORY_FILE);

    const records = history
      .filter(item => item.LoanCaseId === loanCaseId)
      .map(item => enrichLoanHistoryItem(item, { ...meta, caseById }))
      .sort((a, b) => (a.ChangedAt || '').localeCompare(b.ChangedAt || ''));

    res.json({ success: true, history: records });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.get('/api/followups', authenticate, requireLoanAdmin, async (req, res) => {
  try {
    const meta = await loadLoanMeta();
    const loanCases = await readJSON(LOAN_CASES_FILE);
    const caseById = new Map(loanCases.map(item => [item.LoanCaseId, item]));
    let followups = await readJSON(FOLLOWUPS_FILE);
    const { loanCaseId, status, q } = req.query;

    if (loanCaseId) {
      followups = followups.filter(item => item.LoanCaseId === parseInt(loanCaseId));
    }
    if (typeof status !== 'undefined') {
      const completed = normalizeValue(status) === 'completed';
      followups = followups.filter(item => !!item.IsCompleted === completed);
    }
    if (q) {
      const term = normalizeValue(q);
      followups = followups.filter(item => {
        const loanCase = caseById.get(item.LoanCaseId);
        const ledger = loanCase ? meta.ledgerById.get(loanCase.LedgerId) : null;
        return [
          item.FollowUpType,
          item.Remark,
          item.FollowUpDate,
          loanCase ? loanCase.FileNo : '',
          loanCase ? loanCase.CaseNo : '',
          ledger ? ledger.DisplayName : '',
          ledger ? ledger.Ledger : ''
        ].some(value => normalizeValue(value).includes(term));
      });
    }

    const records = followups
      .map(item => enrichFollowupItem(item, { ...meta, caseById }))
      .sort((a, b) => (b.CreatedAt || '').localeCompare(a.CreatedAt || ''));

    res.json({ success: true, followups: records });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.post('/api/followups', authenticate, requireLoanAdmin, async (req, res) => {
  try {
    const { LoanCaseId, FollowUpDate, FollowUpType, Remark, IsCompleted } = req.body;
    if (!validateRequiredFields([LoanCaseId, FollowUpDate, FollowUpType, Remark])) {
      return res.status(400).json({ success: false, message: 'LoanCaseId, FollowUpDate, FollowUpType, and Remark are required' });
    }

    const loanCaseId = parseInt(LoanCaseId);
    const loanCases = await readJSON(LOAN_CASES_FILE);
    const caseItem = loanCases.find(item => item.LoanCaseId === loanCaseId);
    if (!caseItem) {
      return res.status(400).json({ success: false, message: 'Invalid loan case selected' });
    }

    const followups = await readJSON(FOLLOWUPS_FILE);
    const record = {
      FollowUpId: getNextId(followups, 'FollowUpId'),
      LoanCaseId: loanCaseId,
      FollowUpDate: String(FollowUpDate).trim(),
      FollowUpType: String(FollowUpType).trim(),
      Remark: String(Remark).trim(),
      CreatedByEmployeeId: req.employee.id,
      CreatedBy: req.employee.name,
      CreatedAt: new Date().toISOString(),
      IsCompleted: typeof IsCompleted === 'undefined' ? false : toBoolean(IsCompleted)
    };

    followups.push(record);
    await writeJSON(FOLLOWUPS_FILE, followups);

    const meta = await loadLoanMeta();
    const caseById = new Map(loanCases.map(item => [item.LoanCaseId, item]));
    res.json({ success: true, followup: enrichFollowupItem(record, { ...meta, caseById }), message: 'Follow-up created successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.put('/api/followups/:id', authenticate, requireLoanAdmin, async (req, res) => {
  try {
    const followupId = parseInt(req.params.id);
    const followups = await readJSON(FOLLOWUPS_FILE);
    const index = followups.findIndex(item => item.FollowUpId === followupId);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Follow-up not found' });
    }

    const payload = req.body;
    followups[index] = {
      ...followups[index],
      FollowUpDate: payload.FollowUpDate !== undefined ? String(payload.FollowUpDate).trim() : followups[index].FollowUpDate,
      FollowUpType: payload.FollowUpType !== undefined ? String(payload.FollowUpType).trim() : followups[index].FollowUpType,
      Remark: payload.Remark !== undefined ? String(payload.Remark || '').trim() : followups[index].Remark,
      IsCompleted: payload.IsCompleted !== undefined ? toBoolean(payload.IsCompleted) : followups[index].IsCompleted,
      UpdatedAt: new Date().toISOString()
    };

    await writeJSON(FOLLOWUPS_FILE, followups);
    const meta = await loadLoanMeta();
    const loanCases = await readJSON(LOAN_CASES_FILE);
    const caseById = new Map(loanCases.map(item => [item.LoanCaseId, item]));
    res.json({ success: true, followup: enrichFollowupItem(followups[index], { ...meta, caseById }), message: 'Follow-up updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.get('/api/loan-dashboard-summary', authenticate, requireLoanAdmin, async (req, res) => {
  try {
    const meta = await loadLoanMeta();
    const [loanCases, statusHistory, followups] = await Promise.all([
      readJSON(LOAN_CASES_FILE),
      readJSON(LOAN_STATUS_HISTORY_FILE),
      readJSON(FOLLOWUPS_FILE)
    ]);

    const caseById = new Map(loanCases.map(item => [item.LoanCaseId, item]));
    const activeLedgers = meta.ledgers.filter(item => item.IsActive !== false).length;
    const totalLedgers = meta.ledgers.length;
    const totalLoanCases = loanCases.length;
    const sanctionedCases = loanCases.filter(item => normalizeValue(item.CurrentStatus) === 'sanctioned').length;
    const disbursedCases = loanCases.filter(item => normalizeValue(item.CurrentStatus) === 'loan disbursed').length;
    const pendingCases = loanCases.filter(item => {
      const milestone = meta.milestoneById.get(item.CurrentMilestoneId);
      const status = normalizeValue(item.CurrentStatus);
      return !milestone || (!milestone.IsFinalStage && status !== 'loan disbursed' && status !== 'rejected');
    }).length;

    const today = getTodayStr();
    const overdueFollowups = followups.filter(item => !item.IsCompleted && item.FollowUpDate && item.FollowUpDate < today).length;

    const recentStatusChanges = statusHistory
      .map(item => enrichLoanHistoryItem(item, { ...meta, caseById }))
      .sort((a, b) => (b.ChangedAt || '').localeCompare(a.ChangedAt || ''))
      .slice(0, 10);

    const recentFollowups = followups
      .map(item => enrichFollowupItem(item, { ...meta, caseById }))
      .sort((a, b) => (b.CreatedAt || '').localeCompare(a.CreatedAt || ''))
      .slice(0, 10);

    res.json({
      success: true,
      totalLedgers,
      activeLedgers,
      totalLoanCases,
      pendingCases,
      sanctionedCases,
      disbursedCases,
      overdueFollowups,
      recentStatusChanges,
      recentFollowups,
      currencyLabel: formatCurrency(0)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Attendance Management System running on http://localhost:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
});
