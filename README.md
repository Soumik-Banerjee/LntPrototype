# Employee Attendance Management System

## Lender's Title Pvt. Ltd.

A prototype Employee Attendance Management System built with Node.js, Express, and vanilla JavaScript. This system allows employees to check-in/out, apply for leaves, and view attendance history, while administrators can manage attendance and leave approvals.

---

## Tech Stack

- **Frontend:** HTML5, CSS3, Bootstrap 5.3, Vanilla JavaScript
- **Backend:** Node.js, Express.js
- **Database:** JSON Files (via fs-extra)

---

## Project Structure

```
attendance-system/
├── public/
│   ├── index.html          # Landing page
│   ├── login.html          # Login page
│   ├── dashboard.html      # Employee dashboard
│   ├── attendance.html     # Attendance records
│   ├── leave.html          # Leave management
│   ├── admin.html          # Admin panel
│   ├── css/
│   │   └── style.css       # Custom styles
│   └── js/
│       ├── app.js           # Shared utilities
│       ├── login.js         # Login logic
│       ├── dashboard.js     # Dashboard logic
│       ├── attendance.js    # Attendance logic
│       ├── leave.js         # Leave logic
│       └── admin.js         # Admin logic
├── data/
│   ├── employees.json      # Employee records
│   ├── attendance.json     # Attendance records
│   ├── leaves.json         # Leave records
│   ├── holidays.json       # Holiday list
│   └── shifts.json         # Shift definitions
├── server.js               # Express server
├── package.json            # Dependencies
└── README.md               # This file
```

---

## Setup Instructions

### Prerequisites

- **Node.js** v16 or higher
- **npm** (comes with Node.js)

### Step 1: Install Dependencies

```bash
cd attendance-system
npm install
```

### Step 2: Start the Server

```bash
npm start
```

The server will start at **http://localhost:3000**

---

## Login Credentials

| Role     | Email                    | Password  |
|----------|--------------------------|-----------|
| Admin    | admin@lenderstitle.com   | admin123  |
| Employee | soumik@gmail.com         | 123456    |
| Employee | priya@gmail.com          | 123456    |
| Employee | rahul@gmail.com          | 123456    |
| Employee | anita@gmail.com          | 123456    |
| Employee | vikram@gmail.com         | 123456    |

---

## Features

### Employee Features
- **Dashboard:** View today's attendance status, check-in/out, monthly stats, leave balance
- **Check-in/Check-out:** One-click attendance marking with automatic late detection
- **Attendance History:** Monthly attendance view with status, working hours, and filter by month/year
- **Leave Management:** Apply for Sick, Casual, or Annual leave with balance tracking
- **Live Clock:** Real-time clock display on dashboard

### Admin Features
- **Overview Dashboard:** Total employees, present/absent today, pending leaves
- **Attendance Monitoring:** View all employees' recent attendance records
- **Leave Approvals:** Approve or reject leave requests directly from the panel
- **Employee List:** Quick view of all employees

### Shift Management
- Multiple shifts with configurable start/end times
- Grace period for late mark calculation
- Automatic late marking when check-in exceeds grace period

---

## API Endpoints

| Method | Endpoint                           | Description                | Auth Required |
|--------|-------------------------------------|----------------------------|---------------|
| POST   | `/api/login`                       | Employee/Admin login       | No            |
| POST   | `/api/logout`                      | Logout                     | Yes           |
| POST   | `/api/checkin`                     | Mark check-in              | Yes           |
| POST   | `/api/checkout`                    | Mark check-out             | Yes           |
| GET    | `/api/attendance/:employeeId`      | Get attendance records     | Yes           |
| POST   | `/api/apply-leave`                 | Apply for leave            | Yes           |
| GET    | `/api/leaves`                      | Get leave records          | Yes           |
| PUT    | `/api/leaves/:id`                  | Approve/reject leave       | Admin         |
| GET    | `/api/dashboard-summary/:employeeId` | Employee dashboard data  | Yes           |
| GET    | `/api/admin-summary`               | Admin dashboard data       | Admin         |
| GET    | `/api/employees`                   | List all employees         | Admin         |
| GET    | `/api/shifts`                      | List all shifts            | Yes           |
| GET    | `/api/holidays`                    | List holidays              | Yes           |
| GET    | `/api/monthly-attendance/:employeeId` | Monthly attendance grid | Yes         |

---

## Future Scalability Suggestions

1. **Database Migration:** Replace JSON files with PostgreSQL/MySQL for better performance, concurrency, and data integrity.

2. **Authentication:** Implement JWT-based authentication with refresh tokens, password hashing (bcrypt), and OTP-based login.

3. **Real-time Updates:** Use WebSockets (Socket.io) for real-time attendance updates and notifications.

4. **Reporting:** Add export functionality (PDF, Excel) for attendance reports, payroll integration, and advanced analytics.

5. **Notifications:** Email/SMS notifications for leave approvals, reminders for check-in/out, and daily attendance summaries.

6. **Mobile App:** Build React Native or Flutter app for mobile attendance marking with geolocation and selfie verification.

7. **Multi-Company Support:** Add tenant-based architecture to support multiple organizations from a single deployment.

8. **Role-Based Access Control (RBAC):** Granular permissions for different roles (Manager, HR, Team Lead, Employee).

9. **Biometric Integration:** Support fingerprint, facial recognition, or RFID card-based attendance.

10. **Advanced Shift Management:** Rotating shifts, shift swapping, overtime calculation, and public holiday automation.

11. **Leave Policy Engine:** Configurable leave policies, carry-forward rules, leave encashment, and pro-rata calculations.

12. **Audit Trail:** Track all changes to attendance and leave records with timestamps and user information.

13. **Performance Dashboard:** Visual charts (Chart.js) for attendance trends, department-wise reports, and compliance metrics.

14. **CI/CD Pipeline:** Automated testing, deployment pipelines using GitHub Actions or Jenkins.

15. **Containerization:** Docker setup for consistent development and production environments.

---

## License

MIT
