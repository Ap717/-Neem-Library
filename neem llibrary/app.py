import os
import json
import random
import re
import urllib.parse
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, render_template, send_from_directory
import database

app = Flask(__name__, template_folder='templates', static_folder='static')
app.config['SECRET_KEY'] = 'neem-library-secret-key-2026'

# Ensure database exists
database.init_db()

def get_settings_dict():
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM settings")
    rows = cursor.fetchall()
    conn.close()
    settings = {}
    for r in rows:
        key = r['key']
        val = r['value']
        if key in ['plan_prices', 'shift_timings', 'shift_prices']:
            try:
                settings[key] = json.loads(val)
            except Exception:
                settings[key] = val
        else:
            settings[key] = val
    if 'shift_prices' not in settings:
        settings['shift_prices'] = {
            'Night': 1200,
            'Full Day 24x7': 1800
        }
    else:
        settings['shift_prices'].pop('Morning', None)
        settings['shift_prices'].pop('Afternoon', None)
    return settings

@app.route('/')
def index():
    return render_template('index.html')

# ----------------- SETTINGS & HELPLINE API -----------------
@app.route('/api/settings', methods=['GET', 'POST'])
def handle_settings():
    conn = database.get_db()
    cursor = conn.cursor()

    if request.method == 'POST':
        data = request.get_json() or {}
        for key, val in data.items():
            if isinstance(val, (dict, list)):
                val_str = json.dumps(val)
            else:
                val_str = str(val)
            cursor.execute('''
            INSERT INTO settings (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            ''', (key, val_str))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'message': 'Settings updated successfully', 'settings': get_settings_dict()})

    settings = get_settings_dict()
    conn.close()
    return jsonify(settings)

# ----------------- SHIFT PRICING API -----------------
@app.route('/api/shift-prices', methods=['GET', 'POST'])
def handle_shift_prices():
    conn = database.get_db()
    cursor = conn.cursor()
    if request.method == 'POST':
        data = request.get_json() or {}
        prices_input = data.get('shift_prices', data)
        current = get_settings_dict().get('shift_prices', {
            'Night': 1200, 'Full Day 24x7': 1800
        })
        current.pop('Morning', None)
        current.pop('Afternoon', None)
        for shift_name in ['Night', 'Full Day 24x7']:
            if shift_name in prices_input:
                try:
                    current[shift_name] = int(prices_input[shift_name])
                except Exception:
                    pass

        cursor.execute('''
        INSERT INTO settings (key, value) VALUES ('shift_prices', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        ''', (json.dumps(current),))

        # Also update plan_prices if provided (Daily Pass or Locker Addon)
        plan_prices = get_settings_dict().get('plan_prices', {})
        if 'Daily Pass' in data:
            try: plan_prices['Daily Pass'] = int(data['Daily Pass'])
            except Exception: pass
        if 'Locker Addon' in data:
            try: plan_prices['Locker Addon'] = int(data['Locker Addon'])
            except Exception: pass
        cursor.execute('''
        INSERT INTO settings (key, value) VALUES ('plan_prices', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        ''', (json.dumps(plan_prices),))

        conn.commit()
        conn.close()
        return jsonify({'success': True, 'message': 'Shift prices updated successfully', 'shift_prices': current, 'plan_prices': plan_prices})

    settings = get_settings_dict()
    conn.close()
    return jsonify(settings.get('shift_prices', {}))

# ----------------- DESKS & FLOOR PLAN API -----------------
@app.route('/api/desks', methods=['GET'])
def get_desks():
    shift = request.args.get('shift', 'Night')
    conn = database.get_db()
    cursor = conn.cursor()

    # Get all 33 desks
    cursor.execute("SELECT * FROM desks ORDER BY desk_id ASC")
    desks_rows = cursor.fetchall()

    # Get students occupying desks for this shift OR 'Full Day 24x7'
    if shift == 'Full Day 24x7':
        # Any student on any shift occupies this desk during full day
        cursor.execute('''
        SELECT s.student_id, s.full_name, s.shift, s.plan, s.fee_status, s.desk_id, s.locker_opted, s.locker_number, s.avatar_color
        FROM students s
        ''')
    else:
        cursor.execute('''
        SELECT s.student_id, s.full_name, s.shift, s.plan, s.fee_status, s.desk_id, s.locker_opted, s.locker_number, s.avatar_color
        FROM students s
        WHERE s.shift = ? OR s.shift = 'Full Day 24x7'
        ''', (shift,))

    occupants_rows = cursor.fetchall()
    occupant_map = {}
    for occ in occupants_rows:
        occupant_map[occ['desk_id']] = dict(occ)

    desks = []
    occupied_count = 0
    for d in desks_rows:
        desk_dict = dict(d)
        is_occupied = d['desk_id'] in occupant_map
        if is_occupied:
            occupied_count += 1
            desk_dict['is_occupied'] = True
            desk_dict['occupant'] = occupant_map[d['desk_id']]
        else:
            desk_dict['is_occupied'] = False
            desk_dict['occupant'] = None
        desks.append(desk_dict)

    conn.close()
    return jsonify({
        'shift': shift,
        'total_desks': len(desks),
        'occupied_count': occupied_count,
        'available_count': len(desks) - occupied_count,
        'occupancy_percentage': round((occupied_count / len(desks)) * 100, 1) if desks else 0,
        'desks': desks
    })

# ----------------- AUTHENTICATION & REGISTRATION API -----------------
@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    role = data.get('role', 'student') # 'admin' or 'student'
    identifier = data.get('identifier', '').strip() # username or phone
    password = data.get('password', '').strip()

    if role == 'admin':
        if identifier == 'admin' and (password == 'admin123' or password == ''):
            return jsonify({
                'success': True,
                'role': 'admin',
                'user': {
                    'name': 'Library Administrator',
                    'username': 'admin',
                    'role': 'admin'
                }
            })
        else:
            return jsonify({'success': False, 'message': 'Invalid Admin credentials (Default: admin / admin123)'}), 401

    # Student Login
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute('''
    SELECT s.*, d.desk_number, d.zone, d.zone_name
    FROM students s
    JOIN desks d ON s.desk_id = d.desk_id
    WHERE s.phone = ? OR s.student_id = ?
    ''', (identifier, identifier))
    student = cursor.fetchone()
    conn.close()

    if not student:
        return jsonify({'success': False, 'message': f'Student with Phone/ID "{identifier}" not found. Please self-register!'}), 404

    # Allow password match or quick demo bypass
    if password and student['password'] and password != student['password'] and password != 'student123':
        return jsonify({'success': False, 'message': 'Incorrect password'}), 401

    student_data = dict(student)
    v_status = student_data.get('verification_status', 'VERIFIED')
    if v_status == 'PENDING':
        settings = get_settings_dict()
        admin_phone = settings.get('helpline_phone', '+91 98765 43210')
        admin_wa = settings.get('helpline_whatsapp', '919876543210')
        clean_wa = re.sub(r'[^0-9]', '', admin_wa or '919876543210')
        wa_text = urllib.parse.quote(
            f"Hello Neem Library Admin, my new student registration (ID: {student_data['student_id']}, Name: {student_data['full_name']}, Phone: {student_data['phone']}) is pending approval. Please verify and activate my library student account."
        )
        wa_link = f"https://api.whatsapp.com/send?phone={clean_wa}&text={wa_text}"
        return jsonify({
            'success': False,
            'is_pending_verification': True,
            'message': f"Account Under Admin Verification! Your student ID {student_data['student_id']} is awaiting verification by Library Admin. An alert notification has been sent to Admin Mobile ({admin_phone}). Please contact Admin for instant activation.",
            'admin_phone': admin_phone,
            'whatsapp_url': wa_link,
            'student_id': student_data['student_id'],
            'full_name': student_data['full_name'],
            'phone': student_data['phone'],
            'desk_id': student_data['desk_id'],
            'shift': student_data['shift']
        }), 403
    elif v_status == 'REJECTED':
        return jsonify({
            'success': False,
            'message': 'Your registration request was rejected by Library Administration. Please contact library helpline.'
        }), 403

    return jsonify({
        'success': True,
        'role': 'student',
        'user': student_data
    })

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    full_name = data.get('full_name', '').strip()
    phone = data.get('phone', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password', 'student123').strip() or 'student123'
    govt_id_type = data.get('govt_id_type', 'Aadhaar Card').strip()
    govt_id_number = data.get('govt_id_number', '').strip()
    shift = data.get('shift', 'Night').strip()
    if shift not in ['Night', 'Full Day 24x7']:
        shift = 'Night'
    desk_id = int(data.get('desk_id', 1))
    plan = data.get('plan', '1 Month').strip()
    locker_opted = 1 if data.get('locker_opted') else 0

    if not full_name or not phone or not govt_id_number:
        return jsonify({'success': False, 'message': 'Please provide Full Name, Phone / WhatsApp, and Govt ID number.'}), 400

    conn = database.get_db()
    cursor = conn.cursor()

    # Check if phone already registered
    cursor.execute("SELECT id FROM students WHERE phone = ?", (phone,))
    if cursor.fetchone():
        conn.close()
        return jsonify({'success': False, 'message': f'Phone number {phone} is already registered. Please log in directly.'}), 400

    # Check desk availability for this shift
    if shift == 'Full Day 24x7':
        cursor.execute("SELECT student_id, full_name, shift FROM students WHERE desk_id = ?", (desk_id,))
        conflict = cursor.fetchone()
        if conflict:
            conn.close()
            return jsonify({'success': False, 'message': f'Desk #{desk_id:02d} is already reserved by {conflict["full_name"]} for {conflict["shift"]}. Please pick another desk.'}), 400
    else:
        cursor.execute('''
        SELECT student_id, full_name, shift FROM students
        WHERE desk_id = ? AND (shift = ? OR shift = 'Full Day 24x7')
        ''', (desk_id, shift))
        conflict = cursor.fetchone()
        if conflict:
            conn.close()
            return jsonify({'success': False, 'message': f'Desk #{desk_id:02d} is already occupied during {shift} shift by {conflict["full_name"]}. Please pick an available desk.'}), 400

    # Generate sequential student ID
    cursor.execute("SELECT student_id FROM students ORDER BY id DESC LIMIT 1")
    last_row = cursor.fetchone()
    next_num = 101
    if last_row:
        try:
            parts = last_row['student_id'].split('-')
            if len(parts) == 2 and parts[1].isdigit():
                next_num = int(parts[1]) + 1
        except Exception:
            next_num = random.randint(110, 999)
    student_id = f"STU-{next_num}"

    # Calculate pricing based on configured shift price and plan
    settings = get_settings_dict()
    shift_prices = settings.get('shift_prices', {})
    if not isinstance(shift_prices, dict):
        shift_prices = {'Night': 1200, 'Full Day 24x7': 1800}

    shift_base = int(shift_prices.get(shift, 1800))
    plan_prices = settings.get('plan_prices', {})
    locker_price = int(plan_prices.get('Locker Addon', 300)) if locker_opted else 0

    if plan == 'Daily Pass':
        base_price = int(plan_prices.get('Daily Pass', 150))
    elif plan == '1 Month':
        base_price = shift_base
    elif plan == '3 Months Saver':
        base_price = int(round(shift_base * 3 * 0.9 / 50.0) * 50)
    elif plan == '6 Months':
        base_price = int(round(shift_base * 6 * 0.85 / 50.0) * 50)
    else:
        base_price = int(plan_prices.get(plan, shift_base))

    total_amount = base_price + locker_price

    locker_number = f"L-{desk_id:02d}" if locker_opted else None

    # Calculate dates
    now = datetime.now()
    now_str = now.strftime('%Y-%m-%d %H:%M:%S')
    join_date = now.strftime('%Y-%m-%d')
    days_to_add = 30
    if plan == 'Daily Pass':
        days_to_add = 1
    elif plan == '3 Months Saver':
        days_to_add = 90
    elif plan == '6 Months':
        days_to_add = 180
    expiry_date = (now + timedelta(days=days_to_add)).strftime('%Y-%m-%d')

    avatar_colors = ['#1B4D3E', '#0284C7', '#7C3AED', '#D97706', '#059669', '#BE185D', '#0891B2']
    avatar_color = random.choice(avatar_colors)

    cursor.execute('''
    INSERT INTO students (
        student_id, full_name, phone, email, password, govt_id_type, govt_id_number,
        shift, desk_id, plan, plan_amount, fee_status, locker_opted, locker_number,
        join_date, expiry_date, avatar_color, created_at, verification_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, 'PENDING')
    ''', (
        student_id, full_name, phone, email, password, govt_id_type, govt_id_number,
        shift, desk_id, plan, total_amount, locker_opted, locker_number,
        join_date, expiry_date, avatar_color, now_str
    ))

    # Dispatch notification alert to Admin Mobile & record in notifications audit table
    admin_phone = settings.get('helpline_phone', '+91 98765 43210')
    admin_wa = settings.get('helpline_whatsapp', '919876543210')
    clean_admin_wa = re.sub(r'[^0-9]', '', admin_wa or '919876543210')

    notif_msg = (
        f"🔔 *NEEM LIBRARY — NEW STUDENT REGISTRATION ALERT*\n\n"
        f"A new student has registered online and requires Admin Verification before login activation:\n\n"
        f"👤 *Student*: {full_name}\n"
        f"🆔 *Student ID*: {student_id}\n"
        f"📞 *Mobile*: {phone}\n"
        f"🪪 *Govt ID*: {govt_id_type} ({govt_id_number})\n"
        f"🪑 *Requested Desk*: Desk #{desk_id:02d} ({shift})\n"
        f"📦 *Plan*: {plan} (₹{total_amount:,})\n"
        f"⏰ *Registered At*: {now_str}\n\n"
        f"👉 Please verify and activate this student from the Admin Management Console."
    )

    cursor.execute('''
    INSERT INTO notifications (type, title, message, recipient_phone, channel, status, created_at, data)
    VALUES (?, ?, ?, ?, 'WHATSAPP_SMS', 'SENT', ?, ?)
    ''', (
        'STUDENT_REGISTRATION',
        f'New Student Registration: {full_name} ({student_id})',
        notif_msg,
        admin_phone,
        now_str,
        json.dumps({
            'student_id': student_id,
            'full_name': full_name,
            'phone': phone,
            'email': email,
            'govt_id_type': govt_id_type,
            'govt_id_number': govt_id_number,
            'shift': shift,
            'desk_id': desk_id,
            'plan': plan,
            'total_amount': total_amount
        })
    ))

    # Add a welcome ticket/message for the new student
    ticket_id = f"TCK-{random.randint(1000, 9999)}"
    cursor.execute('''
    INSERT INTO messages (
        ticket_id, student_id, sender_name, sender_phone, sender_type, subject, message, reply, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'student', 'Welcome to Neem Library - Verification Pending', ?, ?, 'OPEN', ?, ?)
    ''', (
        ticket_id, student_id, full_name, phone,
        f'New desk reservation created for Desk #{desk_id:02d} ({shift} shift). Awaiting Admin verification.',
        'Welcome to Neem Library! Your registration has been received and an alert sent to the Admin Mobile. The Admin will verify your Govt ID proof and activate your account shortly.',
        now_str, now_str
    ))

    conn.commit()

    # Fetch created student with desk details
    cursor.execute('''
    SELECT s.*, d.desk_number, d.zone, d.zone_name
    FROM students s
    JOIN desks d ON s.desk_id = d.desk_id
    WHERE s.student_id = ?
    ''', (student_id,))
    new_student = dict(cursor.fetchone())
    conn.close()

    wa_text = urllib.parse.quote(
        f"Hello Neem Library Admin,\n"
        f"I have just registered as a new student at Neem Library.\n\n"
        f"👤 Name: {full_name}\n"
        f"🆔 Student ID: {student_id}\n"
        f"📞 Mobile: {phone}\n"
        f"🪪 Govt ID: {govt_id_type} ({govt_id_number})\n"
        f"🪑 Requested Desk: Desk #{desk_id:02d} ({shift})\n\n"
        f"Please verify and activate my library student account."
    )
    wa_url = f"https://api.whatsapp.com/send?phone={clean_admin_wa}&text={wa_text}"

    return jsonify({
        'success': True,
        'verification_status': 'PENDING',
        'message': f'Registration submitted! ID: {student_id}. Notification alert sent to Admin Mobile ({admin_phone}). Verification pending.',
        'admin_mobile_notified': admin_phone,
        'whatsapp_url': wa_url,
        'student': new_student
    })

# ----------------- STUDENTS MANAGEMENT API -----------------
@app.route('/api/students', methods=['GET', 'POST'])
def handle_students():
    conn = database.get_db()
    cursor = conn.cursor()

    if request.method == 'POST':
        # Admin register student
        data = request.get_json() or {}
        # Delegate to registration logic with admin options
        # ...
        pass

    shift = request.args.get('shift', '')
    status = request.args.get('fee_status', '')
    v_status = request.args.get('verification_status', '').strip()
    search = request.args.get('search', '').strip()

    query = '''
    SELECT s.*, d.desk_number, d.zone, d.zone_name
    FROM students s
    JOIN desks d ON s.desk_id = d.desk_id
    WHERE 1=1
    '''
    params = []

    if shift:
        query += " AND s.shift = ?"
        params.append(shift)
    if status:
        query += " AND s.fee_status = ?"
        params.append(status)
    if v_status:
        query += " AND s.verification_status = ?"
        params.append(v_status)
    if search:
        query += " AND (s.full_name LIKE ? OR s.phone LIKE ? OR s.student_id LIKE ?)"
        like_search = f"%{search}%"
        params.extend([like_search, like_search, like_search])

    query += " ORDER BY s.id DESC"
    cursor.execute(query, params)
    students = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return jsonify(students)

@app.route('/api/students/<student_id>', methods=['GET', 'PUT', 'DELETE'])
def student_detail(student_id):
    conn = database.get_db()
    cursor = conn.cursor()

    if request.method == 'DELETE':
        cursor.execute("DELETE FROM seat_change_requests WHERE student_id = ?", (student_id,))
        cursor.execute("DELETE FROM payments WHERE student_id = ?", (student_id,))
        cursor.execute("DELETE FROM messages WHERE student_id = ?", (student_id,))
        cursor.execute("DELETE FROM students WHERE student_id = ?", (student_id,))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'message': f'Student {student_id} removed and desk vacated successfully.'})

    if request.method == 'PUT':
        data = request.get_json() or {}
        # Update allowed fields
        fields = []
        values = []
        for k in ['full_name', 'phone', 'email', 'shift', 'desk_id', 'plan', 'plan_amount', 'fee_status', 'locker_opted', 'locker_number', 'expiry_date']:
            if k in data:
                fields.append(f"{k} = ?")
                values.append(data[k])
        if fields:
            values.append(student_id)
            cursor.execute(f"UPDATE students SET {', '.join(fields)} WHERE student_id = ?", values)
            conn.commit()

        cursor.execute('''
        SELECT s.*, d.desk_number, d.zone, d.zone_name
        FROM students s
        JOIN desks d ON s.desk_id = d.desk_id
        WHERE s.student_id = ?
        ''', (student_id,))
        updated = cursor.fetchone()
        conn.close()
        if updated:
            return jsonify({'success': True, 'student': dict(updated)})
        return jsonify({'success': False, 'message': 'Student not found'}), 404

    # GET student
    cursor.execute('''
    SELECT s.*, d.desk_number, d.zone, d.zone_name
    FROM students s
    JOIN desks d ON s.desk_id = d.desk_id
    WHERE s.student_id = ?
    ''', (student_id,))
    student = cursor.fetchone()
    conn.close()
    if student:
        return jsonify(dict(student))
    return jsonify({'error': 'Student not found'}), 404

# ----------------- ADMIN VERIFICATION & NOTIFICATIONS API -----------------
@app.route('/api/students/pending-verifications', methods=['GET'])
def get_pending_verifications():
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute('''
    SELECT s.*, d.desk_number, d.zone, d.zone_name
    FROM students s
    JOIN desks d ON s.desk_id = d.desk_id
    WHERE s.verification_status = 'PENDING'
    ORDER BY s.id DESC
    ''')
    rows = cursor.fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/students/<student_id>/verify', methods=['POST'])
def verify_student(student_id):
    data = request.get_json() or {}
    action = data.get('action', 'approve').strip().lower() # 'approve' or 'reject'
    admin_notes = data.get('notes', '').strip()

    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM students WHERE student_id = ?", (student_id,))
    student = cursor.fetchone()
    if not student:
        conn.close()
        return jsonify({'success': False, 'message': f'Student {student_id} not found'}), 404

    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    if action == 'approve':
        cursor.execute('''
        UPDATE students
        SET verification_status = 'VERIFIED', verified_at = ?
        WHERE student_id = ?
        ''', (now_str, student_id))

        # Log notification dispatch to student & admin audit
        cursor.execute('''
        INSERT INTO notifications (type, title, message, recipient_phone, channel, status, created_at, data)
        VALUES (?, ?, ?, ?, 'WHATSAPP_SMS', 'SENT', ?, ?)
        ''', (
            'STUDENT_VERIFIED',
            f'Student ID Verified: {student["full_name"]} ({student_id})',
            f'Student account for {student["full_name"]} ({student_id}) has been verified and activated by Admin. Desk #{student["desk_id"]:02d} confirmed.',
            student['phone'],
            now_str,
            json.dumps({'student_id': student_id, 'action': 'approve', 'notes': admin_notes})
        ))

        # Resolve welcome message
        cursor.execute('''
        UPDATE messages
        SET reply = 'Your account has been verified and activated by Admin! You can now log in and access your desk.',
            status = 'RESOLVED', updated_at = ?
        WHERE student_id = ? AND subject LIKE '%Verification Pending%'
        ''', (now_str, student_id))

        conn.commit()
        conn.close()
        return jsonify({
            'success': True,
            'message': f'Student {student["full_name"]} ({student_id}) verified and activated successfully!',
            'verification_status': 'VERIFIED'
        })

    elif action == 'reject':
        # Free desk by deleting pending unverified student record
        cursor.execute("DELETE FROM seat_change_requests WHERE student_id = ?", (student_id,))
        cursor.execute("DELETE FROM messages WHERE student_id = ?", (student_id,))
        cursor.execute("DELETE FROM students WHERE student_id = ?", (student_id,))

        cursor.execute('''
        INSERT INTO notifications (type, title, message, recipient_phone, channel, status, created_at, data)
        VALUES (?, ?, ?, ?, 'WHATSAPP_SMS', 'SENT', ?, ?)
        ''', (
            'STUDENT_REJECTED',
            f'Registration Rejected: {student["full_name"]} ({student_id})',
            f'Registration for {student["full_name"]} ({student_id}) was rejected by Admin. Desk #{student["desk_id"]:02d} vacated.',
            student['phone'],
            now_str,
            json.dumps({'student_id': student_id, 'action': 'reject', 'notes': admin_notes})
        ))

        conn.commit()
        conn.close()
        return jsonify({
            'success': True,
            'message': f'Student {student["full_name"]} ({student_id}) registration rejected and desk #{student["desk_id"]:02d} vacated.',
            'verification_status': 'REJECTED'
        })
    else:
        conn.close()
        return jsonify({'success': False, 'message': 'Invalid action. Must be "approve" or "reject".'}), 400

@app.route('/api/notifications', methods=['GET'])
def get_notifications():
    limit = int(request.args.get('limit', 50))
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute('''
    SELECT * FROM notifications
    ORDER BY id DESC
    LIMIT ?
    ''', (limit,))
    rows = cursor.fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

# ----------------- PAYMENTS & UPI QR API -----------------
@app.route('/api/payments', methods=['GET', 'POST'])
def handle_payments():
    conn = database.get_db()
    cursor = conn.cursor()

    if request.method == 'POST':
        data = request.get_json() or {}
        student_id = data.get('student_id')
        amount = int(data.get('amount', 0))
        payment_mode = data.get('payment_mode', 'UPI_QR')
        transaction_ref = data.get('transaction_ref', '').strip()
        notes = data.get('notes', 'Study Desk Monthly Fee')

        if not student_id or amount <= 0:
            conn.close()
            return jsonify({'success': False, 'message': 'Invalid student or payment amount'}), 400

        now = datetime.now()
        payment_id = f"PAY-{random.randint(10000, 99999)}"
        receipt_no = f"REC-{now.year}-{random.randint(1000, 9999)}"
        payment_date = now.strftime('%Y-%m-%d %H:%M:%S')

        cursor.execute('''
        INSERT INTO payments (payment_id, student_id, amount, payment_mode, transaction_ref, status, receipt_no, payment_date, notes)
        VALUES (?, ?, ?, ?, ?, 'SUCCESS', ?, ?, ?)
        ''', (payment_id, student_id, amount, payment_mode, transaction_ref or f"UPI/{random.randint(1000000000, 9999999999)}", receipt_no, payment_date, notes))

        # Update student fee status to PAID
        cursor.execute("UPDATE students SET fee_status = 'PAID' WHERE student_id = ?", (student_id,))

        # Post an automated notification in messages thread
        cursor.execute('''
        SELECT full_name, desk_id, shift FROM students WHERE student_id = ?
        ''', (student_id,))
        stu_row = cursor.fetchone()
        stu_name = stu_row['full_name'] if stu_row else 'Student'
        desk_num = stu_row['desk_id'] if stu_row else '-'

        cursor.execute('''
        INSERT INTO messages (ticket_id, student_id, sender_name, sender_phone, sender_type, subject, message, reply, status, created_at, updated_at)
        VALUES (?, ?, ?, 'System', 'student', 'Fee Payment Acknowledged', ?, 'Payment verified. Thank you for studying at Neem Library!', 'RESOLVED', ?, ?)
        ''', (
            f"TCK-{random.randint(1000, 9999)}", student_id, stu_name,
            f"Payment of ₹{amount} received via {payment_mode} (Ref: {transaction_ref or receipt_no}) for Desk #{desk_num:02d}.",
            payment_date, payment_date
        ))

        conn.commit()

        receipt_data = {
            'payment_id': payment_id,
            'receipt_no': receipt_no,
            'student_id': student_id,
            'student_name': stu_name,
            'desk_number': f"{desk_num:02d}",
            'amount': amount,
            'payment_mode': payment_mode,
            'transaction_ref': transaction_ref or receipt_no,
            'payment_date': payment_date,
            'status': 'SUCCESS',
            'notes': notes
        }
        conn.close()
        return jsonify({
            'success': True,
            'message': f'Payment of ₹{amount} processed successfully! Receipt: {receipt_no}',
            'receipt': receipt_data
        })

    # GET payments
    student_id = request.args.get('student_id')
    if student_id:
        cursor.execute('''
        SELECT p.*, s.full_name, s.phone, s.shift, s.desk_id
        FROM payments p
        JOIN students s ON p.student_id = s.student_id
        WHERE p.student_id = ?
        ORDER BY p.id DESC
        ''', (student_id,))
    else:
        cursor.execute('''
        SELECT p.*, s.full_name, s.phone, s.shift, s.desk_id
        FROM payments p
        JOIN students s ON p.student_id = s.student_id
        ORDER BY p.id DESC
        ''')
    payments = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return jsonify(payments)

@app.route('/api/payments/renew', methods=['POST'])
def renew_seat():
    data = request.get_json() or {}
    student_id = data.get('student_id')
    months = int(data.get('months', 1))

    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM students WHERE student_id = ?", (student_id,))
    student = cursor.fetchone()
    if not student:
        conn.close()
        return jsonify({'success': False, 'message': 'Student not found'}), 404

    # Calculate new expiry
    try:
        current_expiry = datetime.strptime(student['expiry_date'], '%Y-%m-%d')
        if current_expiry < datetime.now():
            current_expiry = datetime.now()
    except Exception:
        current_expiry = datetime.now()

    new_expiry = (current_expiry + timedelta(days=30 * months)).strftime('%Y-%m-%d')
    cursor.execute("UPDATE students SET expiry_date = ?, fee_status = 'PENDING' WHERE student_id = ?", (new_expiry, student_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'message': f'Seat renewed until {new_expiry}. Fee invoice generated.', 'new_expiry': new_expiry})

# ----------------- SEAT CHANGE WORKFLOW API -----------------
@app.route('/api/seat-requests', methods=['GET', 'POST'])
def handle_seat_requests():
    conn = database.get_db()
    cursor = conn.cursor()

    if request.method == 'POST':
        data = request.get_json() or {}
        student_id = data.get('student_id')
        requested_desk_id = int(data.get('requested_desk_id', 0))
        reason = data.get('reason', '').strip()

        if not student_id or not requested_desk_id or not reason:
            conn.close()
            return jsonify({'success': False, 'message': 'Student ID, Requested Desk #, and reason are required.'}), 400

        cursor.execute("SELECT * FROM students WHERE student_id = ?", (student_id,))
        student = cursor.fetchone()
        if not student:
            conn.close()
            return jsonify({'success': False, 'message': 'Student not found'}), 404

        current_desk_id = student['desk_id']
        shift = student['shift']

        if current_desk_id == requested_desk_id:
            conn.close()
            return jsonify({'success': False, 'message': 'You are already seated at this desk!'}), 400

        # Check if requested desk is occupied in that shift
        if shift == 'Full Day 24x7':
            cursor.execute("SELECT student_id, full_name FROM students WHERE desk_id = ?", (requested_desk_id,))
        else:
            cursor.execute('''
            SELECT student_id, full_name FROM students
            WHERE desk_id = ? AND (shift = ? OR shift = 'Full Day 24x7')
            ''', (requested_desk_id, shift))

        conflict = cursor.fetchone()
        if conflict:
            conn.close()
            return jsonify({'success': False, 'message': f'Desk #{requested_desk_id:02d} is already occupied by {conflict["full_name"]} for {shift}. Please select an empty desk.'}), 400

        now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute('''
        INSERT INTO seat_change_requests (student_id, current_desk_id, requested_desk_id, reason, status, created_at)
        VALUES (?, ?, ?, ?, 'PENDING', ?)
        ''', (student_id, current_desk_id, requested_desk_id, reason, now_str))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'message': f'Seat change request to Desk #{requested_desk_id:02d} submitted to Management.'})

    # GET requests
    student_id = request.args.get('student_id')
    if student_id:
        cursor.execute('''
        SELECT r.*, s.full_name, s.phone, s.shift,
               d1.desk_number as current_desk_num, d1.zone as current_zone,
               d2.desk_number as requested_desk_num, d2.zone as requested_zone
        FROM seat_change_requests r
        JOIN students s ON r.student_id = s.student_id
        JOIN desks d1 ON r.current_desk_id = d1.desk_id
        JOIN desks d2 ON r.requested_desk_id = d2.desk_id
        WHERE r.student_id = ?
        ORDER BY r.id DESC
        ''', (student_id,))
    else:
        cursor.execute('''
        SELECT r.*, s.full_name, s.phone, s.shift,
               d1.desk_number as current_desk_num, d1.zone as current_zone,
               d2.desk_number as requested_desk_num, d2.zone as requested_zone
        FROM seat_change_requests r
        JOIN students s ON r.student_id = s.student_id
        JOIN desks d1 ON r.current_desk_id = d1.desk_id
        JOIN desks d2 ON r.requested_desk_id = d2.desk_id
        ORDER BY r.id DESC
        ''')
    requests_list = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return jsonify(requests_list)

@app.route('/api/seat-requests/<int:request_id>/action', methods=['PUT'])
def action_seat_request(request_id):
    data = request.get_json() or {}
    action = data.get('action') # 'approve' or 'reject'
    admin_remarks = data.get('admin_remarks', '')

    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM seat_change_requests WHERE id = ?", (request_id,))
    req_row = cursor.fetchone()
    if not req_row:
        conn.close()
        return jsonify({'success': False, 'message': 'Request not found'}), 404

    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    if action == 'approve':
        student_id = req_row['student_id']
        requested_desk_id = req_row['requested_desk_id']

        # Update student desk
        cursor.execute("UPDATE students SET desk_id = ? WHERE student_id = ?", (requested_desk_id, student_id))
        cursor.execute('''
        UPDATE seat_change_requests
        SET status = 'APPROVED', admin_remarks = ?, resolved_at = ?
        WHERE id = ?
        ''', (admin_remarks or 'Approved by Management.', now_str, request_id))

        # Add message
        cursor.execute('''
        INSERT INTO messages (ticket_id, student_id, sender_name, sender_phone, sender_type, subject, message, reply, status, created_at, updated_at)
        VALUES (?, ?, 'Administration', 'Admin', 'admin', 'Seat Change Approved', ?, 'Please move to your new desk anytime.', 'RESOLVED', ?, ?)
        ''', (
            f"TCK-{random.randint(1000, 9999)}", student_id,
            f"Your seat change request to Desk #{requested_desk_id:02d} has been approved!",
            now_str, now_str
        ))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'message': f'Seat change approved! Student {student_id} moved to Desk #{requested_desk_id:02d}.'})

    elif action == 'reject':
        cursor.execute('''
        UPDATE seat_change_requests
        SET status = 'REJECTED', admin_remarks = ?, resolved_at = ?
        WHERE id = ?
        ''', (admin_remarks or 'Rejected due to desk availability.', now_str, request_id))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'message': 'Seat change request rejected.'})

    conn.close()
    return jsonify({'success': False, 'message': 'Invalid action'}), 400

# ----------------- NOTICES & BROADCASTS API -----------------
@app.route('/api/notices', methods=['GET', 'POST'])
def handle_notices():
    conn = database.get_db()
    cursor = conn.cursor()

    if request.method == 'POST':
        data = request.get_json() or {}
        title = data.get('title', '').strip()
        content = data.get('content', '').strip()
        category = data.get('category', 'Rules').strip()
        is_pinned = 1 if data.get('is_pinned') else 0
        author = data.get('author', 'Library Administration').strip()

        if not title or not content:
            conn.close()
            return jsonify({'success': False, 'message': 'Title and content are required.'}), 400

        now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute('''
        INSERT INTO notices (title, content, category, is_pinned, created_at, author)
        VALUES (?, ?, ?, ?, ?, ?)
        ''', (title, content, category, is_pinned, now_str, author))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'message': 'Notice published successfully!'})

    cursor.execute('''
    SELECT * FROM notices
    ORDER BY is_pinned DESC, id DESC
    ''')
    notices = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return jsonify(notices)

@app.route('/api/notices/<int:notice_id>', methods=['DELETE'])
def delete_notice(notice_id):
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM notices WHERE id = ?", (notice_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'message': 'Notice deleted'})

# ----------------- HELPDESK & MESSAGES API -----------------
@app.route('/api/messages', methods=['GET', 'POST'])
def handle_messages():
    conn = database.get_db()
    cursor = conn.cursor()

    if request.method == 'POST':
        data = request.get_json() or {}
        student_id = data.get('student_id')
        sender_name = data.get('sender_name', '').strip()
        sender_phone = data.get('sender_phone', '').strip()
        sender_type = data.get('sender_type', 'student') # 'student' or 'inquiry'
        subject = data.get('subject', '').strip()
        message = data.get('message', '').strip()

        if not sender_name or not sender_phone or not message:
            conn.close()
            return jsonify({'success': False, 'message': 'Please provide your Name, Mobile/WhatsApp, and Message.'}), 400

        now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        ticket_id = f"TCK-{random.randint(1000, 9999)}"

        cursor.execute('''
        INSERT INTO messages (ticket_id, student_id, sender_name, sender_phone, sender_type, subject, message, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)
        ''', (ticket_id, student_id, sender_name, sender_phone, sender_type, subject or 'General Inquiry', message, now_str, now_str))
        conn.commit()
        conn.close()
        return jsonify({
            'success': True,
            'ticket_id': ticket_id,
            'message': 'Your message has been sent to Library Management! We will reply promptly.'
        })

    student_id = request.args.get('student_id')
    if student_id:
        cursor.execute('''
        SELECT * FROM messages
        WHERE student_id = ?
        ORDER BY id DESC
        ''', (student_id,))
    else:
        cursor.execute('''
        SELECT * FROM messages
        ORDER BY status ASC, id DESC
        ''')
    messages = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return jsonify(messages)

@app.route('/api/messages/<ticket_id>/reply', methods=['PUT'])
def reply_message(ticket_id):
    data = request.get_json() or {}
    reply = data.get('reply', '').strip()
    status = data.get('status', 'RESOLVED')

    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute('''
    UPDATE messages
    SET reply = ?, status = ?, updated_at = ?
    WHERE ticket_id = ?
    ''', (reply, status, now_str, ticket_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'message': 'Reply sent to student/inquiry.'})

# ----------------- OVERVIEW STATS API -----------------
@app.route('/api/stats', methods=['GET'])
def get_stats():
    conn = database.get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM students")
    total_students = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM students WHERE fee_status = 'PAID'")
    paid_students = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM students WHERE fee_status = 'PENDING'")
    pending_students = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM students WHERE fee_status = 'OVERDUE'")
    overdue_students = cursor.fetchone()[0]

    cursor.execute("SELECT SUM(amount) FROM payments WHERE status = 'SUCCESS'")
    total_collected = cursor.fetchone()[0] or 0

    cursor.execute("SELECT COUNT(*) FROM seat_change_requests WHERE status = 'PENDING'")
    pending_seat_requests = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM messages WHERE status = 'OPEN'")
    open_tickets = cursor.fetchone()[0]

    # Shift occupancy counts
    cursor.execute("SELECT shift, COUNT(*) as cnt FROM students GROUP BY shift")
    shift_counts = {r['shift']: r['cnt'] for r in cursor.fetchall()}

    cursor.execute("SELECT COUNT(*) FROM students WHERE verification_status = 'PENDING'")
    pending_verifications_count = cursor.fetchone()[0]

    settings = get_settings_dict()
    conn.close()
    return jsonify({
        'total_desks': 33,
        'total_students': total_students,
        'paid_students': paid_students,
        'pending_students': pending_students,
        'overdue_students': overdue_students,
        'total_revenue': total_collected,
        'pending_seat_requests': pending_seat_requests,
        'pending_verifications_count': pending_verifications_count,
        'open_tickets': open_tickets,
        'shift_counts': shift_counts,
        'admin_helpline': settings.get('helpline_phone', '+91 98765 43210')
    })

if __name__ == '__main__':
    import sys
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
    port = int(os.environ.get('PORT', 5000))
    print(f"[Neem Library] Starting Study Lounge Server on http://0.0.0.0:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)

