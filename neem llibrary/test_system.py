import urllib.request
import urllib.error
import json
import time

BASE_URL = 'http://127.0.0.1:5000'

def request(path, method='GET', data=None):
    url = f"{BASE_URL}{path}"
    req = urllib.request.Request(url, method=method)
    req.add_header('Content-Type', 'application/json')
    if data:
        body = json.dumps(data).encode('utf-8')
        req.data = body
    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read().decode('utf-8')
            try:
                res = json.loads(content)
                if isinstance(res, dict):
                    res['http_code'] = resp.status
                return res
            except Exception:
                return content
    except urllib.error.HTTPError as e:
        content = e.read().decode('utf-8')
        try:
            res = json.loads(content)
            res['http_code'] = e.code
            return res
        except Exception:
            return {'http_code': e.code, 'error': content}

def run_tests():
    print("[1] Testing Server Home Page (GET /)...")
    html = request('/')
    assert '<title>Neem Library' in html, "Home page title missing"
    print("    -> Passed! HTML served correctly.")

    print("\n[2] Testing Settings API (GET /api/settings)...")
    settings = request('/api/settings')
    assert settings.get('helpline_phone') == '+91 98765 43210', "Default helpline mismatch"
    assert settings.get('upi_id') == 'neemlibrary@icici', "Default UPI ID mismatch"
    print(f"    -> Passed! Helpline: {settings['helpline_phone']}, UPI ID: {settings['upi_id']}")

    print("\n[3] Testing Desks API (GET /api/desks?shift=Night)...")
    desks_resp = request('/api/desks?shift=Night')
    assert desks_resp['total_desks'] == 33, f"Expected 33 desks, got {desks_resp['total_desks']}"
    assert len(desks_resp['desks']) == 33, "Desks list count is not 33"
    print(f"    -> Passed! Total Desks: {desks_resp['total_desks']}, Occupied: {desks_resp['occupied_count']}, Available: {desks_resp['available_count']}")

    print("\n[4] Testing New Student Registration with PENDING Verification & Admin Mobile Alert...")
    available_desks = [d['desk_id'] for d in desks_resp['desks'] if not d['is_occupied']]
    assert len(available_desks) >= 2, "Need at least 2 available desks for testing"
    test_desk_1 = available_desks[0]
    test_desk_2 = available_desks[1]

    test_phone = f"987{int(time.time() * 10) % 10000000:07d}"
    reg_payload = {
        'full_name': 'Kavita Sen',
        'phone': test_phone,
        'email': 'kavita.sen@example.com',
        'password': 'kavitapassword',
        'govt_id_type': 'Aadhaar Card',
        'govt_id_number': 'XXXX-XXXX-7788',
        'shift': 'Night',
        'desk_id': test_desk_1,
        'plan': '3 Months Saver',
        'locker_opted': True
    }
    reg_resp = request('/api/auth/register', method='POST', data=reg_payload)
    assert reg_resp['success'] is True, f"Registration failed: {reg_resp}"
    assert reg_resp.get('verification_status') == 'PENDING', "Verification status should be PENDING"
    assert 'admin_mobile_notified' in reg_resp, "Admin mobile notification missing in response"
    assert 'whatsapp_url' in reg_resp, "WhatsApp alert URL missing in response"
    student = reg_resp['student']
    student_id = student['student_id']
    print(f"    -> Passed! Registered student: {student['full_name']}, Generated ID: {student_id}, Desk: #{student['desk_number']} (Zone {student['zone']}), Verification Status: {student['verification_status']}")
    print(f"    -> Admin Mobile Alert Dispatched to: {reg_resp['admin_mobile_notified']}")
    print(f"    -> WhatsApp Direct Ping URL: {reg_resp['whatsapp_url'][:60]}...")

    print("\n[5] Testing Student Login Attempt while Verification is PENDING (should block login)...")
    login_attempt = request('/api/auth/login', method='POST', data={
        'role': 'student',
        'identifier': test_phone,
        'password': 'kavitapassword'
    })
    assert login_attempt.get('http_code') == 403, f"Expected 403 Forbidden for pending student, got {login_attempt.get('http_code')}"
    assert login_attempt.get('is_pending_verification') is True, "is_pending_verification flag missing"
    assert 'admin_phone' in login_attempt, "Admin phone missing from pending response"
    assert 'whatsapp_url' in login_attempt, "WhatsApp URL missing from pending response"
    print(f"    -> Passed! Student login correctly blocked with 403. Message: \"{login_attempt.get('message')}\"")

    print("\n[6] Testing Admin Notifications Audit Log (GET /api/notifications)...")
    notifs = request('/api/notifications')
    assert isinstance(notifs, list) and len(notifs) > 0, "No notifications returned"
    latest_notif = notifs[0]
    assert latest_notif['type'] == 'STUDENT_REGISTRATION', f"Expected STUDENT_REGISTRATION, got {latest_notif['type']}"
    assert student_id in latest_notif['message'], f"Student ID {student_id} missing in notification message"
    print(f"    -> Passed! Alert recorded: \"{latest_notif['title']}\" to Admin Mobile {latest_notif['recipient_phone']} via {latest_notif['channel']}")

    print("\n[7] Testing Admin Pending Verifications List API (GET /api/students/pending-verifications)...")
    pending_list = request('/api/students/pending-verifications')
    assert any(p['student_id'] == student_id for p in pending_list), f"Student {student_id} not found in pending verifications"
    pending_record = next(p for p in pending_list if p['student_id'] == student_id)
    assert pending_record['verification_status'] == 'PENDING'
    print(f"    -> Passed! Student {student_id} found in Admin Pending Verifications queue with Govt ID: {pending_record['govt_id_type']} ({pending_record['govt_id_number']})")

    print("\n[8] Testing Admin 1-Click Verification & Activation (POST /api/students/<id>/verify)...")
    verify_resp = request(f"/api/students/{student_id}/verify", method='POST', data={'action': 'approve'})
    assert verify_resp['success'] is True, f"Verification approval failed: {verify_resp}"
    assert verify_resp.get('verification_status') == 'VERIFIED'
    print(f"    -> Passed! Student {student_id} approved & activated. Message: {verify_resp['message']}")

    print("\n[9] Testing Student Login After Admin Verification (should succeed now)...")
    verified_login = request('/api/auth/login', method='POST', data={
        'role': 'student',
        'identifier': test_phone,
        'password': 'kavitapassword'
    })
    assert verified_login.get('success') is True, f"Login failed after verification: {verified_login}"
    assert verified_login['user']['student_id'] == student_id
    assert verified_login['user']['verification_status'] == 'VERIFIED'
    print(f"    -> Passed! Verified student {student_id} successfully logged in to Desk #{verified_login['user']['desk_id']}.")

    print("\n[10] Verifying Real-Time Desk Occupancy after verification...")
    updated_desks = request('/api/desks?shift=Night')
    d1 = next(d for d in updated_desks['desks'] if d['desk_id'] == test_desk_1)
    assert d1['is_occupied'] is True, f"Desk {test_desk_1} should be occupied"
    assert d1['occupant']['student_id'] == student_id, "Desk occupant mismatch"
    print(f"    -> Passed! Desk #{test_desk_1:02d} is confirmed occupied by {d1['occupant']['full_name']} in Night shift.")

    print("\n[11] Testing Fee Payment & UPI QR Receipt Workflow (POST /api/payments)...")
    pay_payload = {
        'student_id': student_id,
        'amount': student['plan_amount'],
        'payment_mode': 'UPI_QR',
        'transaction_ref': 'UPI/998877665544/GPay',
        'notes': f'3 Months Saver + Personal Locker L-{test_desk_1:02d}'
    }
    pay_resp = request('/api/payments', method='POST', data=pay_payload)
    assert pay_resp['success'] is True, "Payment failed"
    receipt = pay_resp['receipt']
    print(f"    -> Passed! Payment successful. Receipt No: {receipt['receipt_no']}, Amount: Rs.{receipt['amount']}, UTR: {receipt['transaction_ref']}")

    print("\n[12] Testing Seat Change Request Workflow...")
    change_payload = {
        'student_id': student_id,
        'requested_desk_id': test_desk_2,
        'reason': 'Closer to reference bookshelf in Zone A.'
    }
    req_resp = request('/api/seat-requests', method='POST', data=change_payload)
    assert req_resp['success'] is True, "Seat request failed"
    print("    -> Seat change request submitted by student.")

    requests_list = request('/api/seat-requests')
    pending_req = next(r for r in requests_list if r['student_id'] == student_id)
    assert pending_req['requested_desk_id'] == test_desk_2

    action_resp = request(f"/api/seat-requests/{pending_req['id']}/action", method='PUT', data={'action': 'approve', 'admin_remarks': 'Approved by Library Warden.'})
    assert action_resp['success'] is True, "Approve failed"
    
    desks_after_move = request('/api/desks?shift=Night')
    d2 = next(d for d in desks_after_move['desks'] if d['desk_id'] == test_desk_2)
    assert d2['is_occupied'] is True and d2['occupant']['student_id'] == student_id, f"Desk {test_desk_2} should be occupied by Kavita"
    print(f"    -> Passed! Seat change approved. Student {student_id} is now relocated to Desk #{test_desk_2:02d}.")

    print("\n[13] Testing Management Notice Board (POST & GET /api/notices)...")
    new_notice = {
        'title': 'New Ergonomic Lumbar Cushions Installed in Zone C',
        'content': 'We have added high-density memory foam lumbar cushions to all deep work cubicles.',
        'category': 'Facilities',
        'is_pinned': True,
        'author': 'Facility Manager'
    }
    notice_resp = request('/api/notices', method='POST', data=new_notice)
    assert notice_resp['success'] is True
    all_notices = request('/api/notices')
    assert any(n['title'] == new_notice['title'] for n in all_notices)
    print(f"    -> Passed! Notice created and verified in active feed.")

    print("\n[14] Testing Helpline Customization (GET & POST /api/settings)...")
    custom_phone = '+91 91234 56789'
    set_resp = request('/api/settings', method='POST', data={'helpline_phone': custom_phone})
    assert set_resp['success'] is True
    assert set_resp['settings']['helpline_phone'] == custom_phone
    print(f"    -> Passed! Admin modified helpline to: {custom_phone}")
    # Restore default
    request('/api/settings', method='POST', data={'helpline_phone': '+91 98765 43210'})
    print("    -> Helpline restored to default (+91 98765 43210).")

    print("\n[15] Testing Admin Student Deletion & Desk Vacate (DELETE /api/students/<id>)...")
    del_resp = request(f"/api/students/{student_id}", method='DELETE')
    assert del_resp['success'] is True, f"Failed to delete student: {del_resp}"
    desks_after_del = request('/api/desks?shift=Night')
    d2_after = next(d for d in desks_after_del['desks'] if d['desk_id'] == test_desk_2)
    assert d2_after['is_occupied'] is False, f"Desk {test_desk_2} should be vacant after student deletion"
    print(f"    -> Passed! Student {student_id} permanently deleted. Desk #{test_desk_2:02d} is now vacant and available.")

    print("\n[16] Testing Admin Shift Price Customization (GET & POST /api/shift-prices)...")
    initial_prices = request('/api/shift-prices')
    assert 'Night' in initial_prices, "Missing Night shift price"
    assert 'Morning' not in initial_prices, "Morning shift should be removed"
    assert 'Afternoon' not in initial_prices, "Afternoon shift should be removed"
    print(f"    -> Initial Shift Prices: Night=Rs.{initial_prices.get('Night')}, FullDay=Rs.{initial_prices.get('Full Day 24x7')}")

    # Admin changes Night shift price to Rs. 1350
    update_price_resp = request('/api/shift-prices', method='POST', data={
        'shift_prices': {
            'Night': 1350,
            'Full Day 24x7': 1950
        },
        'Daily Pass': 180,
        'Locker Addon': 350
    })
    assert update_price_resp['success'] is True
    assert update_price_resp['shift_prices']['Night'] == 1350
    assert 'Morning' not in update_price_resp['shift_prices']
    print("    -> Passed! Admin updated Night shift price to Rs. 1350.")

    # Register new student for 1 Month in Night shift to verify new price is billed
    test_phone_2 = f"986{int(time.time() * 10) % 10000000:07d}"
    reg2_resp = request('/api/auth/register', method='POST', data={
        'full_name': 'Dev Patel',
        'phone': test_phone_2,
        'email': 'dev.p@example.com',
        'password': 'password123',
        'govt_id_type': 'Aadhaar Card',
        'govt_id_number': 'XXXX-XXXX-9922',
        'shift': 'Night',
        'desk_id': test_desk_2,
        'plan': '1 Month',
        'locker_opted': False
    })
    assert reg2_resp['success'] is True
    assert reg2_resp['student']['plan_amount'] == 1350, f"Expected Rs.1350 for updated Night shift, got {reg2_resp['student']['plan_amount']}"
    print(f"    -> Passed! New student registered under updated Night shift with exact fee of Rs.{reg2_resp['student']['plan_amount']}.")

    # Clean up test student
    request(f"/api/students/{reg2_resp['student']['student_id']}", method='DELETE')

    # Restore default shift prices
    request('/api/shift-prices', method='POST', data={
        'shift_prices': {
            'Night': 1200,
            'Full Day 24x7': 1800
        },
        'Daily Pass': 150,
        'Locker Addon': 300
    })
    print("    -> Restored default shift prices (Night=Rs.1200, FullDay=Rs.1800).")

    print("\n[17] Testing Document Print Separation & Multi-Page Print Layout...")
    # Verify index.html contains print action buttons and print headers
    with open('templates/index.html', 'r', encoding='utf-8') as f:
        html_content = f.read()
    assert 'app.printIdCard()' in html_content, "printIdCard button call missing in index.html"
    assert 'app.printReceipt()' in html_content, "printReceipt button call missing in index.html"
    assert 'app.printAllDocuments()' in html_content, "printAllDocuments button call missing in index.html"
    assert 'PAGE 1' in html_content and 'PAGE 2' in html_content, "Print page headers missing"
    assert 'printable-id-card' in html_content and 'printable-receipt' in html_content, "Printable element IDs missing"
    print("    -> Passed! HTML contains isolated print buttons, page headers, and printable IDs.")

    # Verify styles.css contains strict page break separation
    with open('static/css/styles.css', 'r', encoding='utf-8') as f:
        css_content = f.read()
    assert 'data-print-mode="id-card"' in css_content, "CSS missing id-card print mode"
    assert 'data-print-mode="receipt"' in css_content, "CSS missing receipt print mode"
    assert 'data-print-mode="all"' in css_content, "CSS missing all-documents print mode"
    assert 'page-break-after: always' in css_content, "CSS missing page-break-after: always for page 1"
    assert 'page-break-before: always' in css_content, "CSS missing page-break-before: always for page 2"
    print("    -> Passed! CSS enforces strict page-break separation (Page 1 = ID Card, Page 2 = Fee Receipt).")

    # Verify app.js contains print controller methods
    with open('static/js/app.js', 'r', encoding='utf-8') as f:
        js_content = f.read()
    assert 'printIdCard()' in js_content, "printIdCard method missing in app.js"
    assert 'printReceipt()' in js_content, "printReceipt method missing in app.js"
    assert 'printAllDocuments()' in js_content, "printAllDocuments method missing in app.js"
    assert 'populateReceiptElements(' in js_content, "populateReceiptElements method missing in app.js"
    print("    -> Passed! JavaScript controller contains printIdCard, printReceipt, and printAllDocuments.")

    print("\n=======================================================")
    print(" ALL 17 END-TO-END AUTOMATED VERIFICATION TESTS PASSED!")
    print("=======================================================")

if __name__ == '__main__':
    run_tests()
