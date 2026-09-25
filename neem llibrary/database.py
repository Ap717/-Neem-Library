import sqlite3
import os
import json
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'neem_library.db')

def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # Settings table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    ''')

    # Desks table (Exactly 33 desks)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS desks (
        desk_id INTEGER PRIMARY KEY,
        desk_number TEXT NOT NULL UNIQUE,
        zone TEXT NOT NULL,
        zone_name TEXT NOT NULL,
        has_socket INTEGER DEFAULT 1,
        has_lamp INTEGER DEFAULT 1,
        has_ergonomic_chair INTEGER DEFAULT 1,
        has_pin_board INTEGER DEFAULT 0,
        notes TEXT
    );
    ''')

    # Students table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        phone TEXT NOT NULL UNIQUE,
        email TEXT,
        password TEXT NOT NULL DEFAULT 'student123',
        govt_id_type TEXT NOT NULL,
        govt_id_number TEXT NOT NULL,
        shift TEXT NOT NULL,
        desk_id INTEGER NOT NULL,
        plan TEXT NOT NULL,
        plan_amount INTEGER NOT NULL,
        fee_status TEXT NOT NULL DEFAULT 'PENDING',
        locker_opted INTEGER DEFAULT 0,
        locker_number TEXT,
        join_date TEXT NOT NULL,
        expiry_date TEXT NOT NULL,
        avatar_color TEXT DEFAULT '#1B4D3E',
        created_at TEXT NOT NULL,
        verification_status TEXT NOT NULL DEFAULT 'VERIFIED',
        verified_at TEXT,
        FOREIGN KEY (desk_id) REFERENCES desks(desk_id)
    );
    ''')

    # Payments table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payment_id TEXT NOT NULL UNIQUE,
        student_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        payment_mode TEXT NOT NULL,
        transaction_ref TEXT,
        status TEXT NOT NULL DEFAULT 'SUCCESS',
        receipt_no TEXT NOT NULL UNIQUE,
        payment_date TEXT NOT NULL,
        notes TEXT,
        FOREIGN KEY (student_id) REFERENCES students(student_id)
    );
    ''')

    # Seat change requests table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS seat_change_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT NOT NULL,
        current_desk_id INTEGER NOT NULL,
        requested_desk_id INTEGER NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        admin_remarks TEXT,
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        FOREIGN KEY (student_id) REFERENCES students(student_id),
        FOREIGN KEY (current_desk_id) REFERENCES desks(desk_id),
        FOREIGN KEY (requested_desk_id) REFERENCES desks(desk_id)
    );
    ''')

    # Notices table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS notices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT NOT NULL,
        is_pinned INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        author TEXT NOT NULL DEFAULT 'Library Administration'
    );
    ''')

    # Messages & Helpdesk Tickets table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id TEXT NOT NULL UNIQUE,
        student_id TEXT,
        sender_name TEXT NOT NULL,
        sender_phone TEXT NOT NULL,
        sender_type TEXT NOT NULL,
        subject TEXT NOT NULL,
        message TEXT NOT NULL,
        reply TEXT,
        status TEXT NOT NULL DEFAULT 'OPEN',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    ''')

    # Admin Mobile Notifications table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        recipient_phone TEXT NOT NULL,
        channel TEXT NOT NULL DEFAULT 'WHATSAPP_SMS',
        status TEXT NOT NULL DEFAULT 'SENT',
        created_at TEXT NOT NULL,
        data TEXT
    );
    ''')

    # Migration: Ensure verification_status and verified_at columns exist in students table
    try:
        cursor.execute("ALTER TABLE students ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'VERIFIED'")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE students ADD COLUMN verified_at TEXT")
    except Exception:
        pass

    try:
        cursor.execute("UPDATE students SET verification_status = 'VERIFIED' WHERE verification_status IS NULL OR verification_status = ''")
    except Exception:
        pass

    conn.commit()

    # Seed Default Settings if empty
    default_settings = {
        'helpline_phone': '+91 98765 43210',
        'helpline_whatsapp': '919876543210',
        'library_name': 'Neem Library',
        'library_tagline': 'Reading Hall & Study Lounge System',
        'library_motto': 'Knowledge • Growth • Community',
        'library_address': 'Plot 42, Green Avenue, Near University North Gate',
        'upi_id': 'neemlibrary@icici',
        'payee_name': 'Neem Library Study Lounge',
        'custom_qr_image': '',
        'plan_prices': json.dumps({
            'Daily Pass': 150,
            '1 Month': 1800,
            '3 Months Saver': 4800,
            '6 Months': 9000,
            'Locker Addon': 300
        }),
        'shift_prices': json.dumps({
            'Night': 1200,
            'Full Day 24x7': 1800
        }),
        'shift_timings': json.dumps({
            'Night': '06:00 PM – 12:00 AM',
            'Full Day 24x7': '06:00 AM – 11:00 PM'
        })
    }

    for key, val in default_settings.items():
        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (key, val))

    # Update shift_prices and shift_timings to remove Morning & Afternoon shifts
    cursor.execute("UPDATE settings SET value = ? WHERE key = 'shift_prices'", (
        json.dumps({'Night': 1200, 'Full Day 24x7': 1800}),
    ))
    cursor.execute("UPDATE settings SET value = ? WHERE key = 'shift_timings'", (
        json.dumps({'Night': '06:00 PM – 12:00 AM', 'Full Day 24x7': '06:00 AM – 11:00 PM'}),
    ))
    # Migrate any existing students in Morning/Afternoon shifts to Night shift
    cursor.execute("UPDATE students SET shift = 'Night' WHERE shift IN ('Morning', 'Afternoon')")

    # Seed 33 Desks if table is empty
    cursor.execute("SELECT COUNT(*) FROM desks")
    desk_count = cursor.fetchone()[0]
    if desk_count == 0:
        desks_data = []
        # Zone A: Window Quiet Bay (Desks 01 – 11)
        for i in range(1, 12):
            desk_num = f"{i:02d}"
            desks_data.append((
                i, desk_num, 'A', 'Window Quiet Bay', 1, 1, 1, 1,
                'Natural light, garden view, premium silence, 20W USB-C PD socket'
            ))
        # Zone B: Focus Central Pods (Desks 12 – 22)
        for i in range(12, 23):
            desk_num = f"{i:02d}"
            desks_data.append((
                i, desk_num, 'B', 'Focus Central Pods', 1, 1, 1, 0,
                'Power charging docks, dual-level soft LED lamp, ergonomic mesh chair'
            ))
        # Zone C: Deep Work Cubicles (Desks 23 – 33)
        for i in range(23, 34):
            desk_num = f"{i:02d}"
            desks_data.append((
                i, desk_num, 'C', 'Deep Work Cubicles', 1, 1, 1, 1,
                'Acoustic sound-dampening partitions, personal cork pin-board, extra legroom'
            ))

        cursor.executemany('''
        INSERT INTO desks (desk_id, desk_number, zone, zone_name, has_socket, has_lamp, has_ergonomic_chair, has_pin_board, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', desks_data)

    # Seed Sample Students if empty
    cursor.execute("SELECT COUNT(*) FROM students")
    student_count = cursor.fetchone()[0]
    now = datetime.now()
    now_str = now.strftime('%Y-%m-%d %H:%M:%S')
    join_date = (now - timedelta(days=15)).strftime('%Y-%m-%d')
    expiry_date = (now + timedelta(days=75)).strftime('%Y-%m-%d')

    if student_count == 0:
        sample_students = [
            (
                'STU-101', 'Aarav Sharma', '9876500001', 'aarav.sharma@example.com', 'student123',
                'Aadhaar Card', 'XXXX-XXXX-4512', 'Night', 3, '3 Months Saver', 4800, 'PAID',
                1, 'L-03', join_date, expiry_date, '#1B4D3E', now_str
            ),
            (
                'STU-102', 'Priya Patel', '9876500002', 'priya.p@example.com', 'student123',
                'Student ID', 'UNI-2024-889', 'Night', 7, '1 Month', 1800, 'PAID',
                0, None, join_date, expiry_date, '#0284C7', now_str
            ),
            (
                'STU-103', 'Rohan Verma', '9876500003', 'rohan.v@example.com', 'student123',
                'Driving License', 'DL-042019003', 'Night', 14, '1 Month', 2100, 'PENDING',
                1, 'L-14', join_date, expiry_date, '#D97706', now_str
            ),
            (
                'STU-104', 'Ananya Gupta', '9876500004', 'ananya.g@example.com', 'student123',
                'Aadhaar Card', 'XXXX-XXXX-9901', 'Night', 25, '3 Months Saver', 4800, 'PAID',
                0, None, join_date, expiry_date, '#7C3AED', now_str
            ),
            (
                'STU-105', 'Vikramaditya Rao', '9876500005', 'vikram.rao@example.com', 'student123',
                'Passport', 'Z-5829104', 'Full Day 24x7', 18, '6 Months', 9300, 'OVERDUE',
                1, 'L-18', (now - timedelta(days=45)).strftime('%Y-%m-%d'), (now - timedelta(days=2)).strftime('%Y-%m-%d'), '#DC2626', now_str
            ),
            (
                'STU-106', 'Sneha Kulkarni', '9876500006', 'sneha.k@example.com', 'student123',
                'Aadhaar Card', 'XXXX-XXXX-1123', 'Night', 28, '1 Month', 1800, 'PAID',
                0, None, join_date, expiry_date, '#059669', now_str
            ),
        ]

        cursor.executemany('''
        INSERT OR IGNORE INTO students (
            student_id, full_name, phone, email, password, govt_id_type, govt_id_number,
            shift, desk_id, plan, plan_amount, fee_status, locker_opted, locker_number,
            join_date, expiry_date, avatar_color, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', sample_students)

        # Sample Payments
        sample_payments = [
            ('PAY-8801', 'STU-101', 4800, 'UPI_QR', 'UPI/428901928371/GPay', 'SUCCESS', 'REC-2026-001', (now - timedelta(days=15)).strftime('%Y-%m-%d %H:%M:%S'), '3 Months Saver + Locker'),
            ('PAY-8802', 'STU-102', 1800, 'UPI_QR', 'UPI/428919002231/PhonePe', 'SUCCESS', 'REC-2026-002', (now - timedelta(days=14)).strftime('%Y-%m-%d %H:%M:%S'), '1 Month Plan (Night)'),
            ('PAY-8804', 'STU-104', 4800, 'UPI_QR', 'UPI/428989912044/Paytm', 'SUCCESS', 'REC-2026-003', (now - timedelta(days=12)).strftime('%Y-%m-%d %H:%M:%S'), '3 Months Saver (Night)'),
            ('PAY-8806', 'STU-106', 1800, 'CASH', 'CASH/ADMIN/COUNTER', 'SUCCESS', 'REC-2026-004', (now - timedelta(days=10)).strftime('%Y-%m-%d %H:%M:%S'), '1 Month Desk 28'),
        ]
        cursor.executemany('''
        INSERT OR IGNORE INTO payments (payment_id, student_id, amount, payment_mode, transaction_ref, status, receipt_no, payment_date, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', sample_payments)

        # Sample Notices
        sample_notices = [
            (
                'Quiet Hours & Phone Policy Inside Reading Hall',
                'Kindly ensure all mobile phones are strictly on silent / vibration mode. Attend incoming calls outside in the refreshment terrace. Maintain 100% pin-drop silence in Zone A and Zone C.',
                'Rules', 1, (now - timedelta(days=5)).strftime('%Y-%m-%d %H:%M:%S'), 'Chief Warden'
            ),
            (
                'High-Speed Wi-Fi 6 Upgrade & New Power Strip Testing',
                'We have upgraded our secondary fiber uplink to 500 Mbps with automatic failover. All desks in Zone B (Pods 12-22) now feature dual type-C PD charging ports.',
                'Facilities', 1, (now - timedelta(days=3)).strftime('%Y-%m-%d %H:%M:%S'), 'Facilities Team'
            ),
            (
                'UPSC Prelims & State PSC Extended Night Hall Access',
                'For students preparing for upcoming competitive exams, the reading hall air-conditioning and silent lounge will remain fully operational 24x7. Coffee machine is available in the pantry.',
                'Exam Alerts', 0, (now - timedelta(days=1)).strftime('%Y-%m-%d %H:%M:%S'), 'Management'
            ),
            (
                'Library Timing & Sunday Deep-Sanitization Schedule',
                'Reading Hall is open 7 days a week from 06:00 AM to 12:00 Midnight. A gentle 15-minute sanitization is conducted every Sunday 02:00 PM – 02:15 PM without disturbing desk setups.',
                'Timings', 0, (now - timedelta(days=7)).strftime('%Y-%m-%d %H:%M:%S'), 'Library Admin'
            ),
        ]
        cursor.executemany('''
        INSERT OR IGNORE INTO notices (title, content, category, is_pinned, created_at, author)
        VALUES (?, ?, ?, ?, ?, ?)
        ''', sample_notices)

        # Sample Seat Change Requests
        sample_requests = [
            (
                'STU-103', 14, 5, 'Prefer morning sunlight near the garden window in Zone A for better reading concentration.',
                'PENDING', None, (now - timedelta(hours=6)).strftime('%Y-%m-%d %H:%M:%S'), None
            ),
        ]
        cursor.executemany('''
        INSERT OR IGNORE INTO seat_change_requests (student_id, current_desk_id, requested_desk_id, reason, status, admin_remarks, created_at, resolved_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', sample_requests)

        # Sample Messages / Helpdesk Tickets
        sample_messages = [
            (
                'TCK-701', 'STU-101', 'Aarav Sharma', '9876500001', 'student',
                'Air Conditioning Temperature in Zone A',
                'Hi Management, could we please set the AC temperature in Zone A around 24°C? It is currently a bit too cold near Desk 03.',
                'Noted Aarav! The temperature has been adjusted to 24.5°C and swing fixed. Happy studying!',
                'RESOLVED', (now - timedelta(days=2)).strftime('%Y-%m-%d %H:%M:%S'), (now - timedelta(days=2, hours=-1)).strftime('%Y-%m-%d %H:%M:%S')
            ),
            (
                'TCK-702', 'STU-104', 'Ananya Gupta', '9876500004', 'student',
                'Personal Locker Key Replacement',
                'Hello sir, I would like to opt for locker L-25 if it is available for night shift.',
                'Hello Ananya, yes Locker L-25 is available and has been reserved for your night shift plan.',
                'OPEN', (now - timedelta(hours=3)).strftime('%Y-%m-%d %H:%M:%S'), (now - timedelta(hours=2)).strftime('%Y-%m-%d %H:%M:%S')
            ),
            (
                'TCK-703', None, 'Kabir Mehta', '9811223344', 'inquiry',
                'Inquiry: Full Day Pass with Locker for UPSC prep',
                'Greetings Neem Library, do you have any cubicle in Zone C available for a 6-month full day reservation starting next week?',
                None, 'OPEN', (now - timedelta(hours=1)).strftime('%Y-%m-%d %H:%M:%S'), (now - timedelta(hours=1)).strftime('%Y-%m-%d %H:%M:%S')
            )
        ]
        cursor.executemany('''
        INSERT OR IGNORE INTO messages (ticket_id, student_id, sender_name, sender_phone, sender_type, subject, message, reply, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', sample_messages)

    conn.commit()
    conn.close()

if __name__ == '__main__':
    init_db()
    print("Database initialized successfully at", DB_PATH)
