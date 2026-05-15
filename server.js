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

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Attendance Management System running on http://localhost:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
});
