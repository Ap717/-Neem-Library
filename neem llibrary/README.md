# 🌿 Neem Library — Reading Hall & Study Lounge System

> **Knowledge • Growth • Community**

A modern, full-featured web application designed specifically for **Reading Libraries / Self-Study Halls / Study Lounges** (not a traditional book-lending library). Students book dedicated, quiet study desks equipped with charging sockets, reading lamps, ergonomic chairs, and optional personal lockers across flexible shifts.

---

## 🚀 Quick Start

The application runs using Python and Flask with an embedded SQLite database (`neem_library.db`).

### 1. Run the Application
```bash
python app.py
```
Open your browser and navigate to:
```
http://127.0.0.1:5000
```

### 2. Default Login Credentials
- **Admin Portal**:
  - Role: **Administrator**
  - Username: `admin`
  - Password: `admin123`
- **Student Portal**:
  - Role: **Student**
  - Phone: `9876500001` (or click *"✨ New Student? Create New ID"* to register yourself)
  - Password: `student123`

### 3. Run Automated End-to-End Tests
```bash
python test_system.py
```

---

## 🌟 Key Features

### 1. 🪑 Interactive 33-Seat Floor Plan & Zones
- **Exactly 33 Dedicated Desks** organized into 3 realistic study zones:
  - **Zone A: Window Quiet Bay (Desks 01 – 11)**: Natural sunlight, garden view, premium silence.
  - **Zone B: Focus Central Pods (Desks 12 – 22)**: Dual Type-C PD power charging docks, dual-level soft LED lamps, ergonomic mesh chairs.
  - **Zone C: Deep Work Cubicles (Desks 23 – 33)**: Acoustic sound-dampened partitions, personal cork pin-board, extra legroom.
- **Flexible Shifts with Real-Time Occupancy**:
  - 🌅 **Morning Shift**: 06:00 AM – 12:00 PM
  - ☀️ **Afternoon Shift**: 12:00 PM – 06:00 PM
  - 🌙 **Night Shift**: 06:00 PM – 12:00 AM
  - 🌟 **Full Day Pass (24x7)**: 06:00 AM – 11:00 PM
- Amenity badges on every desk: Power Socket 🔌, Reading Lamp 💡, Ergonomic Mesh 🪑, Pin-board 📌.

### 2. 🆔 New Student Self-Registration & Digital ID Card
- **Self-Registration on Student Portal**:
  - Prospective and new students click **"✨ New Student? Create New ID"**.
  - Choose preferred shift and membership plan (1 Month, 3 Months Saver, 6 Months, Daily Pass).
  - Select an available desk directly from the **33 study desks in real-time** (dynamically filters out desks occupied in that shift).
  - Optional personal locker allotment add-on.
  - Generates sequential clean ID (e.g. `STU-107`).
- **Official Digital Student ID Card**:
  - Designed with physical smart card aesthetics: photo avatar, badge ID, allocated desk #, shift timings, barcode graphic, authorized stamp, and helpline.
  - Includes **"Print ID Card"** (with dedicated `@media print` layout) and **"Log In to My Desk Now →"** 1-click access.

### 3. 📞 Official Management Mobile Helpline & Inquiries
- **Helpline**: Default `+91 98765 43210` displayed prominently on navigation bar, login screen, student portal sub-bar, chat tab, and digital ID cards.
- **Direct Action Buttons**:
  - 📞 **Direct Call**: 1-click phone dialer launch (`tel:`).
  - 💬 **WhatsApp Us**: 1-click chat on WhatsApp with prefilled inquiry message.
  - ✉️ **Send Message to Management**: Prospective and new students can submit inquiry messages directly into the Management Inbox!
- **Admin Mobile Customization**:
  - Library administrators can click **"Helpline: +91 98765 43210 [✏️]"** in the top navigation bar to update their official mobile number anytime with automatic SQLite database persistence.

### 4. 💳 Student Payment Option & UPI QR Code System
- **Direct Fee Payment for Students**:
  - Top navigation bar features a direct **"Pay Fee (UPI/QR)"** button.
  - Live fee status badge (`PENDING`, `OVERDUE`, `PAID`).
  - If pending: **"Pay Fee (₹Amount)"** opens payment modal immediately.
  - If already paid: Students can click **"View Receipt"** to print their official stamped invoice or **"Renew"** to extend their seat plan.
  - Payment records automatically post a confirmation message to the support chat thread.
- **Admin QR Code Upload System**:
  - Custom Library UPI QR Code: Upload official payment QR image (GPay, PhonePe, Paytm, BHIM, Bank QR) via file upload or drag & drop.
  - Configurable **Library UPI ID** (`neemlibrary@icici`) with a 1-click "Copy" button for students.
  - Configurable **Payee / Beneficiary Name** (`Neem Library Study Lounge`).

### 5. 🔄 Change Seat Workflow (Role-Aware)
- **Student View**: Students can submit a **Seat Change Request** ticket directly to management explaining their preferred desk and reason.
- **Admin View**: Management can review pending requests, approve/reject them in 1-click, and dynamically update seat assignments.

### 6. 💬 Management ↔ Student Messaging & Notice Board
- **Notice Board / Broadcasts**: Categorized announcements (Rules, Facilities, Timings, Exam Alerts) with pin options.
- **Two-Way Helpdesk & Direct Chat**: Students message management directly (AC adjustment, Wi-Fi speed, seat shift inquiries). Management replies in real time and tracks tickets as `Open` or `Resolved`.

---

## 🗄️ Database Architecture (`neem_library.db`)
- `settings`: helpline number, WhatsApp, library info, UPI ID, payee name, QR image data, plan prices, shift timings.
- `desks`: 33 desks with zones, amenities, and status.
- `students`: student ID, credentials, shift, desk assignment, plan, fee status, locker allotment.
- `payments`: transaction history, payment mode, UTR number, receipt number, timestamps.
- `seat_change_requests`: student requests, current desk, requested desk, reason, admin remarks, approval status.
- `notices`: announcements, categories, pin status.
- `messages`: support tickets, inquiries, management replies, open/resolved state.
