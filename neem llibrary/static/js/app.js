/* ========================================================
   🌿 NEEM LIBRARY — CLIENT CONTROLLER & UI APPLICATION
   ======================================================== */

const app = {
  currentUser: null,
  activeAuthTab: 'student', // 'student' or 'management'
  activeDashboardTab: 'overview',
  activeFloorPlanShift: 'Night',
  settings: {
    helpline_phone: '+91 TEST',
    helpline_whatsapp: '919876543210',
    library_name: 'Neem Library',
    upi_id: 'neemlibrary@icici',
    payee_name: 'Neem Library Study Lounge',
    custom_qr_image: ''
  },
  desks: [],
  members: [],
  payments: [],
  tickets: [],
  notices: [],
  lastRegisteredStudent: null,
  currentViewingStudent: null,
  currentViewingReceipt: null,
  isNightMode: false,

  init() {
    this.updateGreetingText();
    this.initTheme();
    this.restoreUserSession();
    this.loadSettings();
    this.loadFloorPlan(this.activeFloorPlanShift);
    this.loadTickets();
    this.loadStats();
  },

  // ---------------- TIME-OF-DAY GREETING ----------------
  getTimeGreeting() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return 'Good morning';
    } else if (hour >= 12 && hour < 17) {
      return 'Good afternoon';
    } else if (hour >= 17 && hour < 21) {
      return 'Good evening';
    } else {
      return 'Good night';
    }
  },

  updateGreetingText() {
    const greeting = this.getTimeGreeting();
    const welcomeTitle = document.getElementById('console-welcome-title');
    if (welcomeTitle) {
      welcomeTitle.textContent = `${greeting}, Admin.`;
    }
    const studentGreeting = document.getElementById('student-banner-greeting');
    if (studentGreeting) {
      studentGreeting.textContent = `${greeting},`;
    }
  },

  // ---------------- THEME / NIGHT MODE ----------------
  initTheme() {
    const saved = localStorage.getItem('neem_theme');
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      this.isNightMode = true;
      document.documentElement.classList.add('dark');
    } else {
      this.isNightMode = false;
      document.documentElement.classList.remove('dark');
    }
    this.updateThemeButton();
  },

  toggleNightMode() {
    this.isNightMode = !this.isNightMode;
    if (this.isNightMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('neem_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('neem_theme', 'light');
    }
    this.updateThemeButton();
  },

  updateThemeButton() {
    const icon = document.getElementById('theme-toggle-icon');
    const label = document.getElementById('theme-toggle-label');
    if (icon) icon.textContent = this.isNightMode ? '☀️' : '🌙';
    if (label) label.textContent = this.isNightMode ? 'Day mode' : 'Night mode';
  },

  // ---------------- NOTIFICATIONS ----------------
  showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const bgColors = {
      success: 'bg-emerald-800 text-white border-emerald-600',
      error: 'bg-rose-800 text-white border-rose-600',
      info: 'bg-slate-800 text-white border-slate-600',
      warning: 'bg-amber-800 text-white border-amber-600'
    };

    toast.className = `pointer-events-auto flex items-center justify-between p-3.5 rounded-2xl shadow-xl border text-xs font-semibold ${bgColors[type] || bgColors.info} animate-fadeIn`;
    toast.innerHTML = `
      <span>${message}</span>
      <button onclick="this.parentElement.remove()" class="ml-3 text-white/60 hover:text-white">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 4000);
  },

  // ---------------- SETTINGS & HELPLINE ----------------
  async loadSettings() {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data && data.helpline_phone) {
        this.settings = Object.assign(this.settings, data);
        this.applySettingsToUI();
      }
    } catch (err) {
      console.warn('Using default settings');
    }
  },

  applySettingsToUI() {
    const s = this.settings;
    const phone = s.helpline_phone || '+91 TEST';
    const cleanPhone = phone.replace(/\s+/g, '');

    const landingHelpline = document.getElementById('landing-helpline-link');
    if (landingHelpline) {
      landingHelpline.textContent = phone;
      landingHelpline.href = `tel:${cleanPhone}`;
    }

    const headerHelpline = document.getElementById('header-helpline-link');
    if (headerHelpline) {
      headerHelpline.textContent = phone;
      headerHelpline.href = `tel:${cleanPhone}`;
    }

    const idHelpline = document.getElementById('idcard-helpline');
    if (idHelpline) idHelpline.textContent = phone;

    // Admin settings inputs
    const setPhone = document.getElementById('setting-phone');
    if (setPhone) setPhone.value = phone;

    const setUpi = document.getElementById('setting-upi');
    if (setUpi) setUpi.value = s.upi_id || 'neemlibrary@icici';

    const setPayee = document.getElementById('setting-payee');
    if (setPayee) setPayee.value = s.payee_name || 'Neem Library Study Lounge';

    // Populate Shift Prices Inputs (Night and Full Day 24x7)
    const shiftPrices = s.shift_prices || {
      'Night': 1200,
      'Full Day 24x7': 1800
    };

    const pNight = document.getElementById('price-shift-night');
    if (pNight) pNight.value = shiftPrices['Night'] ?? 1200;

    const pFullDay = document.getElementById('price-shift-fullday');
    if (pFullDay) pFullDay.value = shiftPrices['Full Day 24x7'] ?? 1800;

    const planPrices = s.plan_prices || { 'Daily Pass': 150, 'Locker Addon': 300 };
    const pDaily = document.getElementById('price-daily-pass');
    if (pDaily) pDaily.value = planPrices['Daily Pass'] ?? 150;

    const pLocker = document.getElementById('price-locker-addon');
    if (pLocker) pLocker.value = planPrices['Locker Addon'] ?? 300;

    const qrPreview = document.getElementById('qr-preview-img');
    const qrCont = document.getElementById('qr-preview-container');
    if (qrPreview && qrCont && s.custom_qr_image) {
      qrPreview.src = s.custom_qr_image;
      qrCont.classList.remove('hidden');
    }

    this.updateRegisterPricing();
  },

  // ---------------- AUTHENTICATION & LOGIN TABS ----------------
  setAuthTab(tab) {
    this.activeAuthTab = tab;
    const tabStudent = document.getElementById('auth-tab-student');
    const tabMgmt = document.getElementById('auth-tab-management');
    const eyebrow = document.getElementById('auth-eyebrow');
    const title = document.getElementById('auth-title');
    const subtitle = document.getElementById('auth-subtitle');
    const idLabel = document.getElementById('auth-identifier-label');
    const idInput = document.getElementById('auth-identifier');
    const submitText = document.getElementById('auth-submit-text');
    const newStudentBtn = document.getElementById('auth-new-student-container');

    if (tab === 'management') {
      tabMgmt.className = 'auth-tab pb-3 text-sm font-bold text-brand-700 dark:text-brand-400 border-b-2 border-brand-700 dark:border-brand-400 transition';
      tabStudent.className = 'auth-tab pb-3 text-sm font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 border-b-2 border-transparent transition';
      
      eyebrow.textContent = 'MANAGEMENT CONSOLE';
      title.textContent = 'Admin Sign In';
      subtitle.textContent = 'Access live control room, desk occupancy, and payments.';
      idLabel.textContent = 'Admin Username';
      idInput.placeholder = 'admin';
      idInput.value = 'admin';
      submitText.textContent = 'Log in as Manager';
      if (newStudentBtn) newStudentBtn.classList.add('hidden');
    } else {
      tabStudent.className = 'auth-tab pb-3 text-sm font-bold text-brand-700 dark:text-brand-400 border-b-2 border-brand-700 dark:border-brand-400 transition';
      tabMgmt.className = 'auth-tab pb-3 text-sm font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 border-b-2 border-transparent transition';
      
      eyebrow.textContent = 'WELCOME BACK';
      title.textContent = 'Good to see you again';
      subtitle.textContent = 'Your desk is ready when you are.';
      idLabel.textContent = 'Phone / WhatsApp';
      idInput.placeholder = '98765 43210';
      idInput.value = '9876500001';
      submitText.textContent = 'Log in to my desk';
      if (newStudentBtn) newStudentBtn.classList.remove('hidden');
    }
  },

  async handleAuthSubmit(e) {
    e.preventDefault();
    const identifier = document.getElementById('auth-identifier').value.trim();
    const password = document.getElementById('auth-password').value.trim();

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: this.activeAuthTab === 'management' ? 'admin' : 'student',
          identifier: identifier,
          password: password
        })
      });

      const data = await res.json();
      if (!data.success) {
        if (data.is_pending_verification) {
          this.showToast(data.message, 'warning');
          this.showVerificationPendingModal(data, data.admin_phone, data.whatsapp_url);
          return;
        }
        this.showToast(data.message || 'Login failed', 'error');
        return;
      }

      this.currentUser = { role: data.role, user: data.user };
      localStorage.setItem('neem_user', JSON.stringify(this.currentUser));
      this.applyUserSession();
      this.showToast(`Signed in successfully!`, 'success');

    } catch (err) {
      console.error('Login error:', err);
      this.showToast('Network error during login', 'error');
    }
  },

  restoreUserSession() {
    const saved = localStorage.getItem('neem_user');
    if (saved) {
      try {
        this.currentUser = JSON.parse(saved);
        this.applyUserSession();
      } catch (e) {
        localStorage.removeItem('neem_user');
      }
    } else {
      this.applyUserSession();
    }
  },

  applyUserSession() {
    const splitAuthView = document.getElementById('view-split-auth');
    const dashboardView = document.getElementById('view-dashboard');
    const mgmtBanner = document.getElementById('management-header-banner');
    const studentBanner = document.getElementById('student-header-banner');
    const tabsBar = document.getElementById('console-tabs-bar');

    if (!this.currentUser) {
      splitAuthView.classList.remove('hidden');
      dashboardView.classList.add('hidden');
      return;
    }

    splitAuthView.classList.add('hidden');
    dashboardView.classList.remove('hidden');
    this.updateGreetingText();

    const u = this.currentUser.user;
    const helplineEditBtn = document.getElementById('header-helpline-edit-btn');

    if (this.currentUser.role === 'admin') {
      if (helplineEditBtn) helplineEditBtn.classList.remove('hidden');
      mgmtBanner.classList.remove('hidden');
      studentBanner.classList.add('hidden');
      tabsBar.classList.remove('hidden');
      this.setDashboardTab('overview');
      this.loadAdminData();
    } else {
      // Student mode: strictly remove/hide phone number edit option
      if (helplineEditBtn) helplineEditBtn.classList.add('hidden');
      mgmtBanner.classList.add('hidden');
      studentBanner.classList.remove('hidden');
      tabsBar.classList.add('hidden');

      // Populate student banner
      document.getElementById('student-banner-name').textContent = u.full_name;
      document.getElementById('student-banner-id').textContent = u.student_id;
      document.getElementById('student-banner-desk').textContent = `Desk #${String(u.desk_id).padStart(2, '0')} · Zone ${u.zone || 'A'}`;
      document.getElementById('student-banner-shift').textContent = `${u.shift} Shift`;
      
      const lockerEl = document.getElementById('student-banner-locker');
      if (u.locker_opted) {
        lockerEl.textContent = `• 🔒 ${u.locker_number || `Locker L-${String(u.desk_id).padStart(2, '0')}`}`;
      } else {
        lockerEl.textContent = '';
      }

      const feeBadge = document.getElementById('student-banner-fee-badge');
      const feeActions = document.getElementById('student-banner-fee-actions');
      feeBadge.textContent = u.fee_status;

      if (u.fee_status === 'PAID') {
        feeBadge.className = 'px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
        feeActions.innerHTML = `
          <button onclick="app.viewLatestReceipt()" class="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-200 transition">
            <i class="fa-solid fa-receipt mr-1"></i> Receipt
          </button>
        `;
      } else {
        feeBadge.className = 'px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
        feeActions.innerHTML = `
          <button onclick="app.openPaymentModal()" class="px-3.5 py-1.5 rounded-xl bg-brand-800 hover:bg-brand-700 text-white text-xs font-bold transition shadow-sm">
            <i class="fa-solid fa-credit-card mr-1"></i> Pay Fee (₹${(u.plan_amount || 1800).toLocaleString()})
          </button>
        `;
      }

      // In student mode, show overview floor plan
      this.setDashboardTab('overview');
    }
  },

  logout() {
    this.currentUser = null;
    localStorage.removeItem('neem_user');
    this.applyUserSession();
    this.showToast('Logged out of session', 'info');
  },

  loadAdminData() {
    this.loadStats();
    this.loadFloorPlan(this.activeFloorPlanShift || 'Night');
    this.loadTickets();
    this.loadPendingVerifications();
  },

  // ---------------- DASHBOARD TAB SWITCHER ----------------
  setDashboardTab(tab) {
    this.activeDashboardTab = tab;
    document.querySelectorAll('.console-tab').forEach(btn => {
      btn.className = 'console-tab pb-3 text-xs sm:text-sm font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 border-b-2 border-transparent transition flex items-center whitespace-nowrap';
    });

    const activeBtn = document.getElementById(`tab-btn-${tab}`);
    if (activeBtn) {
      activeBtn.className = 'console-tab active pb-3 text-xs sm:text-sm font-bold text-brand-700 dark:text-brand-400 border-b-2 border-brand-700 dark:border-brand-400 transition flex items-center whitespace-nowrap';
    }

    document.querySelectorAll('.dashboard-tab-panel').forEach(p => p.classList.add('hidden'));
    const panel = document.getElementById(`tab-content-${tab}`);
    if (panel) panel.classList.remove('hidden');

    if (tab === 'students' || tab === 'members') this.loadStudents();
    else if (tab === 'verifications') {
      this.loadPendingVerifications();
      this.loadNotificationsLog();
    }
    else if (tab === 'payments') this.loadPayments();
    else if (tab === 'notices') this.loadNotices();
  },

  showOverviewTab() {
    this.setDashboardTab('overview');
  },

  // ---------------- 33-DESK FLOOR PLAN (IMAGE 4 EXACT MATCH) ----------------
  async loadFloorPlan(shift = 'Night') {
    this.activeFloorPlanShift = shift;
    try {
      const res = await fetch(`/api/desks?shift=${encodeURIComponent(shift)}`);
      const data = await res.json();
      this.desks = data.desks || [];

      // Update occupied count text
      const elCount = document.getElementById('floorplan-occupied-count');
      if (elCount) {
        elCount.textContent = `${data.occupied_count} occupied`;
      }

      const elAvail = document.getElementById('fp-summary-available');
      if (elAvail) elAvail.textContent = `${data.available_count} Available`;

      const elOcc = document.getElementById('fp-summary-occupied');
      if (elOcc) elOcc.textContent = `${data.occupied_count} In use`;

      this.renderFloorPlan(this.desks);
    } catch (err) {
      console.error('Error loading floor plan:', err);
    }
  },

  changeFloorPlanShift(shift) {
    this.loadFloorPlan(shift);
  },

  renderFloorPlan(desks) {
    // Map zones
    const zoneARow1 = document.getElementById('zone-a-row1');
    const zoneARow2 = document.getElementById('zone-a-row2');
    const zoneBRow1 = document.getElementById('zone-b-row1');
    const zoneBRow2 = document.getElementById('zone-b-row2');
    const zoneCRow1 = document.getElementById('zone-c-row1');
    const zoneCRow2 = document.getElementById('zone-c-row2');

    if (!zoneARow1) return;

    zoneARow1.innerHTML = '';
    zoneARow2.innerHTML = '';
    zoneBRow1.innerHTML = '';
    zoneBRow2.innerHTML = '';
    zoneCRow1.innerHTML = '';
    zoneCRow2.innerHTML = '';

    const myDeskId = this.currentUser && this.currentUser.role === 'student' ? Number(this.currentUser.user.desk_id) : null;

    desks.forEach(desk => {
      const num = desk.desk_id;
      const isOccupied = desk.is_occupied;
      const isMyDesk = myDeskId === desk.desk_id;

      const btn = document.createElement('div');
      let statusClass = isOccupied ? 'in-use' : 'open';
      if (isMyDesk) statusClass += ' my-desk';

      btn.className = `desk-btn ${statusClass}`;
      btn.innerHTML = `
        <span class="text-sm font-black font-mono desk-number">${desk.desk_number}</span>
        <span class="text-[10px] desk-status flex items-center justify-center space-x-1">
          <span class="w-1.5 h-1.5 rounded-full ${isMyDesk ? 'bg-brand-700' : (isOccupied ? 'bg-slate-400' : 'bg-emerald-500')} inline-block"></span>
          <span>${isMyDesk ? '★ Mine' : (isOccupied ? 'In use' : 'Open')}</span>
        </span>
      `;

      btn.onclick = () => this.handleDeskClick(desk);

      // Distribute exactly according to Image 4:
      // Zone A (01 to 06, 07 to 11)
      if (num >= 1 && num <= 6) zoneARow1.appendChild(btn);
      else if (num >= 7 && num <= 11) zoneARow2.appendChild(btn);
      // Zone B (12 to 17, 18 to 22)
      else if (num >= 12 && num <= 17) zoneBRow1.appendChild(btn);
      else if (num >= 18 && num <= 22) zoneBRow2.appendChild(btn);
      // Zone C (23 to 28, 29 to 33)
      else if (num >= 23 && num <= 28) zoneCRow1.appendChild(btn);
      else if (num >= 29 && num <= 33) zoneCRow2.appendChild(btn);
    });
  },

  handleDeskClick(desk) {
    if (desk.is_occupied) {
      const occ = desk.occupant;
      if (this.currentUser && this.currentUser.role === 'admin' && occ) {
        // Open Occupied Desk Action Modal for Admin
        const titleTag = document.getElementById('desk-action-title-tag');
        if (titleTag) titleTag.textContent = `DESK #${desk.desk_number} (${desk.zone_name})`;

        const nameEl = document.getElementById('desk-action-occupant-name');
        if (nameEl) nameEl.textContent = occ.full_name;

        const idEl = document.getElementById('desk-action-occupant-id');
        if (idEl) idEl.textContent = occ.student_id;

        const phoneEl = document.getElementById('desk-action-phone');
        if (phoneEl) phoneEl.textContent = occ.phone || '-';

        const shiftEl = document.getElementById('desk-action-shift');
        if (shiftEl) shiftEl.textContent = `${occ.shift || this.activeFloorPlanShift} Shift`;

        const feeEl = document.getElementById('desk-action-fee');
        if (feeEl) {
          feeEl.textContent = occ.fee_status || 'PAID';
          feeEl.className = `font-black uppercase ${occ.fee_status === 'PAID' ? 'text-emerald-600' : 'text-amber-600'}`;
        }

        const planEl = document.getElementById('desk-action-plan');
        if (planEl) planEl.textContent = occ.plan || '1 Month Standard';

        const viewIdBtn = document.getElementById('desk-action-view-id-btn');
        if (viewIdBtn) {
          viewIdBtn.onclick = () => {
            this.closeModal('modal-desk-action');
            this.showDigitalIdCard(occ);
          };
        }

        const delBtn = document.getElementById('desk-action-delete-btn');
        if (delBtn) {
          delBtn.onclick = () => {
            this.adminDeleteStudent(occ.student_id, occ.full_name);
          };
        }

        this.openModal('modal-desk-action');
      } else {
        const name = occ ? occ.full_name : 'Reserved';
        const stuId = occ ? occ.student_id : '';
        this.showToast(`Desk #${desk.desk_number} is in use by ${name} (${stuId})`, 'info');
      }
    } else {
      if (this.currentUser && this.currentUser.role === 'student') {
        this.openSeatChangeModal(desk.desk_id);
      } else {
        this.openRegisterModal(desk.desk_id);
      }
    }
  },

  // ---------------- LATEST CONVERSATIONS (IMAGE 4 MATCH WITH DAY HIGHLIGHTS) ----------------
  async loadTickets() {
    try {
      const res = await fetch('/api/messages');
      this.tickets = await res.json();
      this.renderLatestConversations(this.tickets);
    } catch (err) {
      console.error('Error loading tickets:', err);
    }
  },

  renderLatestConversations(tickets) {
    const container = document.getElementById('latest-conversations-list');
    if (!container) return;
    container.innerHTML = '';

    if (tickets.length === 0) {
      container.innerHTML = '<div class="text-xs text-slate-400 py-6 text-center">No open conversations.</div>';
      return;
    }

    tickets.slice(0, 6).forEach((t, idx) => {
      const item = document.createElement('div');
      item.className = 'flex items-center justify-between p-3 rounded-xl bg-slate-50/80 hover:bg-emerald-50/60 dark:bg-slate-800/60 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700 transition cursor-pointer shadow-xs';

      // Pick an initial or number badge like Image 4
      const badgeChar = (t.sender_name && t.sender_name.length > 0) ? t.sender_name[0].toUpperCase() : String(idx + 1);

      item.innerHTML = `
        <div class="flex items-center space-x-3 overflow-hidden pr-2">
          <div class="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-300 font-black text-xs flex items-center justify-center shrink-0 border border-emerald-300 dark:border-emerald-800">
            ${badgeChar}
          </div>
          <div class="truncate">
            <h5 class="text-xs font-black text-slate-900 dark:text-white truncate">${t.subject || 'Student help'}</h5>
            <p class="text-[11px] text-slate-600 dark:text-slate-400 truncate">${t.message}</p>
          </div>
        </div>
        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[#FEF3C7] text-[#92400E] border border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800 shrink-0">
          ${t.status === 'OPEN' ? 'Open' : 'Done'}
        </span>
      `;

      item.onclick = () => this.openInquiryModal();
      container.appendChild(item);
    });
  },

  // ---------------- STATS DASHBOARD ----------------
  async loadStats() {
    try {
      const res = await fetch('/api/stats');
      const s = await res.json();

      const elMembers = document.getElementById('metric-active-members');
      if (elMembers) elMembers.textContent = s.total_students || 4;

      const elReview = document.getElementById('metric-payments-review');
      if (elReview) elReview.textContent = s.pending_students || 3;

      const elOpenConv = document.getElementById('metric-open-conversations');
      if (elOpenConv) elOpenConv.textContent = s.open_tickets || 5;

      // Pending Student Verifications Count
      const pendingCount = s.pending_verifications_count || 0;
      const tabBadge = document.getElementById('tab-verifications-count');
      if (tabBadge) {
        if (pendingCount > 0) {
          tabBadge.textContent = pendingCount;
          tabBadge.classList.remove('hidden');
        } else {
          tabBadge.classList.add('hidden');
        }
      }

      const badgeCount = document.getElementById('verifications-badge-count');
      if (badgeCount) badgeCount.textContent = `${pendingCount} Pending`;

      const banner = document.getElementById('pending-verifications-banner');
      const bannerCount = document.getElementById('pending-verifications-banner-count');
      if (banner) {
        if (pendingCount > 0) {
          if (bannerCount) bannerCount.textContent = pendingCount;
          banner.classList.remove('hidden');
        } else {
          banner.classList.add('hidden');
        }
      }

      if (s.admin_helpline) {
        const mobLabel = document.getElementById('admin-mobile-number-label');
        if (mobLabel) mobLabel.textContent = s.admin_helpline;
      }

    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  },

  // ---------------- STUDENTS MANAGEMENT & DELETION ----------------
  async loadStudents() {
    try {
      const res = await fetch('/api/students');
      this.students = await res.json();
      this.members = this.students;
      this.renderStudentsTable(this.students);
    } catch (err) {
      console.error('Error loading students:', err);
    }
  },

  loadMembers() {
    this.loadStudents();
  },

  renderStudentsTable(list) {
    const tbody = document.getElementById('students-table-body') || document.getElementById('members-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!list || list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-slate-400">No students found.</td></tr>';
      return;
    }

    list.forEach(s => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50 dark:hover:bg-slate-800/50 transition';
      tr.innerHTML = `
        <td class="py-2.5 px-3 font-mono font-black text-slate-900 dark:text-white">${s.student_id}</td>
        <td class="py-2.5 px-3">
          <div class="font-extrabold text-slate-900 dark:text-slate-100">${s.full_name}</div>
          <div class="text-[10px] text-slate-500 font-mono font-bold">${s.phone}</div>
        </td>
        <td class="py-2.5 px-3">
          <span class="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800 font-mono font-black">
            Desk #${String(s.desk_id).padStart(2, '0')} (${s.zone})
          </span>
        </td>
        <td class="py-2.5 px-3 text-slate-700 dark:text-slate-300">
          <div class="font-bold">${s.shift}</div>
          <div class="text-[10px] text-slate-500 font-medium">${s.plan}</div>
        </td>
        <td class="py-2.5 px-3 font-mono text-[11px]">
          ${s.locker_opted ? `<span class="px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-bold">${s.locker_number || 'Locker Assigned'}</span>` : '<span class="text-slate-400 font-medium">None</span>'}
        </td>
        <td class="py-2.5 px-3">
          <div class="flex flex-col gap-1">
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
              s.fee_status === 'PAID' ? 'badge-paid' : (s.fee_status === 'OVERDUE' ? 'badge-overdue' : 'badge-pending')
            }">
              ${s.fee_status}
            </span>
            ${s.verification_status === 'PENDING' ? `
              <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-100 text-amber-900 border border-amber-300">
                ⏳ Unverified
              </span>
            ` : `
              <span class="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                ✓ Verified
              </span>
            `}
          </div>
        </td>
        <td class="py-2.5 px-3 text-right space-x-1.5 flex items-center justify-end">
          ${s.verification_status === 'PENDING' ? `
            <button onclick="app.verifyStudent('${s.student_id}', 'approve')" title="Verify & Activate Student" class="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition flex items-center space-x-1 shadow-xs">
              <i class="fa-solid fa-user-check"></i>
              <span>Verify</span>
            </button>
          ` : ''}
          <button onclick="app.showDigitalIdCard(${JSON.stringify(s).replace(/"/g, '&quot;')})" title="View Digital ID Card" class="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 text-xs font-bold transition flex items-center space-x-1">
            <i class="fa-solid fa-id-card"></i>
            <span>ID</span>
          </button>
          <button onclick="app.adminDeleteStudent('${s.student_id}', '${s.full_name}')" title="Delete Student & Vacate Desk" class="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold transition flex items-center space-x-1">
            <i class="fa-solid fa-trash-can text-xs"></i>
            <span>Delete</span>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  },

  renderMembersTable(list) {
    this.renderStudentsTable(list);
  },

  filterStudents() {
    const q = (document.getElementById('student-search-input') || document.getElementById('member-search-input')).value.toLowerCase();
    const filtered = (this.students || this.members || []).filter(s => 
      s.full_name.toLowerCase().includes(q) ||
      s.phone.includes(q) ||
      s.student_id.toLowerCase().includes(q)
    );
    this.renderStudentsTable(filtered);
  },

  filterMembers() {
    this.filterStudents();
  },

  async adminDeleteStudent(studentId, studentName = 'Student') {
    if (!confirm(`Are you sure you want to permanently delete student ${studentName} (${studentId}) and vacate their desk?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/students/${studentId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        this.showToast(data.message || `Student ${studentId} deleted and desk vacated successfully`, 'success');
        this.closeModal('modal-desk-action');
        this.loadStudents();
        this.loadFloorPlan(this.activeFloorPlanShift);
        this.loadStats();
      } else {
        this.showToast(data.message || 'Error deleting student', 'error');
      }
    } catch (err) {
      this.showToast('Network error deleting student', 'error');
    }
  },

  // ---------------- PAYMENTS ----------------
  async loadPayments() {
    try {
      const res = await fetch('/api/payments');
      this.payments = await res.json();
      const tbody = document.getElementById('payments-table-body');
      if (!tbody) return;
      tbody.innerHTML = '';

      this.payments.forEach(p => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 dark:hover:bg-slate-800/50';
        tr.innerHTML = `
          <td class="py-2.5 px-3 font-mono font-bold">${p.receipt_no}</td>
          <td class="py-2.5 px-3 font-bold">${p.full_name} (${p.student_id})</td>
          <td class="py-2.5 px-3 font-mono font-extrabold text-emerald-700">₹${p.amount.toLocaleString()}</td>
          <td class="py-2.5 px-3 text-slate-600">${p.payment_mode}</td>
          <td class="py-2.5 px-3 font-mono text-[11px] text-slate-400">${p.transaction_ref || '-'}</td>
          <td class="py-2.5 px-3 text-slate-400">${p.payment_date.split(' ')[0]}</td>
          <td class="py-2.5 px-3 text-right">
            <button onclick="app.showReceiptModal(${JSON.stringify({
              receipt_no: p.receipt_no,
              student_name: p.full_name,
              student_id: p.student_id,
              desk_number: String(p.desk_id).padStart(2, '0'),
              shift_plan: `${p.shift || 'Night'} Shift · ${p.plan || '1 Month'}`,
              payment_date: p.payment_date ? p.payment_date.split(' ')[0] : new Date().toISOString().split('T')[0],
              amount: p.amount,
              transaction_ref: p.transaction_ref
            }).replace(/"/g, '&quot;')})" class="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-bold">
              View
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (err) {
      console.error('Error loading payments:', err);
    }
  },

  // ---------------- NOTICES ----------------
  async loadNotices() {
    try {
      const res = await fetch('/api/notices');
      this.notices = await res.json();
      const container = document.getElementById('notices-table-container');
      if (!container) return;
      container.innerHTML = '';

      this.notices.forEach(n => {
        const item = document.createElement('div');
        item.className = 'p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between';
        item.innerHTML = `
          <div>
            <div class="flex items-center space-x-2">
              <span class="px-2 py-0.2 rounded text-[9px] font-bold uppercase bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-300">${n.category}</span>
              <h4 class="font-bold text-xs text-slate-900 dark:text-white">${n.title}</h4>
            </div>
            <p class="text-xs text-slate-500 mt-1">${n.content}</p>
          </div>
          <button onclick="app.deleteNotice(${n.id})" class="text-slate-400 hover:text-rose-600 p-1">
            <i class="fa-solid fa-trash-can text-xs"></i>
          </button>
        `;
        container.appendChild(item);
      });
    } catch (err) {
      console.error('Error loading notices:', err);
    }
  },

  openCreateNoticeModal() {
    this.openModal('modal-create-notice');
  },

  async handleCreateNoticeSubmit(e) {
    e.preventDefault();
    const title = document.getElementById('notice-title').value.trim();
    const content = document.getElementById('notice-content').value.trim();
    const category = document.getElementById('notice-category').value;

    try {
      const res = await fetch('/api/notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, category, is_pinned: 1 })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast('Notice published', 'success');
        this.closeModal('modal-create-notice');
        this.loadNotices();
      }
    } catch (err) {
      this.showToast('Error publishing notice', 'error');
    }
  },

  async deleteNotice(id) {
    if (!confirm('Delete notice?')) return;
    try {
      await fetch(`/api/notices/${id}`, { method: 'DELETE' });
      this.showToast('Notice removed', 'info');
      this.loadNotices();
    } catch (err) {
      this.showToast('Error deleting notice', 'error');
    }
  },

  loadAdminData() {
    this.loadMembers();
    this.loadPayments();
    this.loadNotices();
    this.loadTickets();
  },

  // ---------------- NEW STUDENT REGISTRATION & DESK PICKER ----------------
  openRegisterModal(preselectedDeskId = null) {
    this.registerDeskFilter = 'empty';
    this.openModal('modal-register');
    this.updateRegisterDeskPicker(preselectedDeskId);
    this.updateRegisterPricing();
  },

  onRegisterShiftChange() {
    this.updateRegisterDeskPicker();
    this.updateRegisterPricing();
  },

  updateRegisterPricing() {
    const s = this.settings;
    const shiftPrices = s.shift_prices || {
      'Night': 1200,
      'Full Day 24x7': 1800
    };
    const planPrices = s.plan_prices || { 'Daily Pass': 150, 'Locker Addon': 300 };

    const shiftSelect = document.getElementById('reg-shift');
    const planSelect = document.getElementById('reg-plan');
    const lockerCheck = document.getElementById('reg-locker-opted');
    if (!shiftSelect || !planSelect) return;

    const shift = shiftSelect.value || 'Night';
    const shiftBase = Number(shiftPrices[shift] ?? 1000);
    const dailyPass = Number(planPrices['Daily Pass'] ?? 150);
    const lockerFee = Number(planPrices['Locker Addon'] ?? 300);

    const price1m = shiftBase;
    const price3m = Math.round(shiftBase * 3 * 0.9 / 50) * 50;
    const price6m = Math.round(shiftBase * 6 * 0.85 / 50) * 50;

    const currentPlan = planSelect.value || '3 Months Saver';
    planSelect.innerHTML = `
      <option value="1 Month">1 Month — ₹${price1m.toLocaleString('en-IN')}</option>
      <option value="3 Months Saver">3 Months Saver — ₹${price3m.toLocaleString('en-IN')} (Save 10%)</option>
      <option value="6 Months">6 Months — ₹${price6m.toLocaleString('en-IN')} (Save 15%)</option>
      <option value="Daily Pass">Daily Pass — ₹${dailyPass.toLocaleString('en-IN')}</option>
    `;
    planSelect.value = currentPlan;
    if (!planSelect.value) planSelect.value = '3 Months Saver';

    const lockerLabel = document.getElementById('reg-locker-label');
    if (lockerLabel) {
      lockerLabel.textContent = `Opt for Personal Locker (+₹${lockerFee.toLocaleString('en-IN')})`;
    }

    let base = price3m;
    if (planSelect.value === '1 Month') base = price1m;
    else if (planSelect.value === '3 Months Saver') base = price3m;
    else if (planSelect.value === '6 Months') base = price6m;
    else if (planSelect.value === 'Daily Pass') base = dailyPass;

    const isLocker = lockerCheck && lockerCheck.checked;
    const total = base + (isLocker ? lockerFee : 0);

    const summaryText = document.getElementById('reg-fee-summary-text');
    if (summaryText) {
      summaryText.textContent = `${shift} Shift · ${planSelect.value}${isLocker ? ` + Locker (₹${lockerFee})` : ''}`;
    }

    const summaryAmount = document.getElementById('reg-fee-summary-amount');
    if (summaryAmount) {
      summaryAmount.textContent = `₹${total.toLocaleString('en-IN')}`;
    }
  },

  setRegisterDeskFilter(filter) {
    this.registerDeskFilter = filter;
    const btnEmpty = document.getElementById('reg-filter-empty-btn');
    const btnAll = document.getElementById('reg-filter-all-btn');
    if (filter === 'empty') {
      if (btnEmpty) btnEmpty.className = 'px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-sm border border-emerald-300 dark:border-emerald-700';
      if (btnAll) btnAll.className = 'px-2.5 py-1 rounded-lg text-[10px] font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition';
    } else {
      if (btnEmpty) btnEmpty.className = 'px-2.5 py-1 rounded-lg text-[10px] font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition';
      if (btnAll) btnAll.className = 'px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition bg-white dark:bg-slate-900 text-slate-800 dark:text-white shadow-sm border border-slate-300 dark:border-slate-600';
    }
    this.updateRegisterDeskPicker();
  },

  async updateRegisterDeskPicker(preselectedDeskId = null) {
    const shiftSelect = document.getElementById('reg-shift');
    if (!shiftSelect) return;
    const shift = shiftSelect.value || 'Night';
    const grid = document.getElementById('reg-desk-picker-grid');
    if (!grid) return;

    if (!this.registerDeskFilter) this.registerDeskFilter = 'empty';

    try {
      const res = await fetch(`/api/desks?shift=${encodeURIComponent(shift)}`);
      const data = await res.json();
      const desks = data.desks || [];
      const emptyDesks = desks.filter(d => !d.is_occupied);
      const emptyCount = emptyDesks.length;

      // Update empty count badge and banner
      const countEl = document.getElementById('reg-empty-count');
      if (countEl) countEl.textContent = emptyCount;

      const bannerEl = document.getElementById('reg-empty-seats-banner');
      if (bannerEl) {
        if (emptyCount > 0) {
          bannerEl.innerHTML = `🟢 <strong class="text-emerald-800 dark:text-emerald-300">${emptyCount} Empty Desks</strong> available for ${shift} shift`;
        } else {
          bannerEl.innerHTML = `🔴 <strong class="text-rose-600">No empty desks</strong> available for ${shift} shift. Please select another shift.`;
        }
      }

      grid.innerHTML = '';
      let currentSelectedId = preselectedDeskId || Number(document.getElementById('reg-selected-desk-id')?.value) || null;

      // Ensure chosen desk is actually empty
      let chosen = desks.find(d => d.desk_id === currentSelectedId && !d.is_occupied);
      if (!chosen && emptyCount > 0) {
        chosen = emptyDesks[0];
        currentSelectedId = chosen.desk_id;
      }

      if (chosen) {
        document.getElementById('reg-selected-desk-id').value = chosen.desk_id;
        document.getElementById('reg-selected-desk-label').textContent = `Selected: Desk #${chosen.desk_number} · Zone ${chosen.zone} (${chosen.zone_name})`;
      } else if (emptyCount === 0) {
        document.getElementById('reg-selected-desk-id').value = '';
        document.getElementById('reg-selected-desk-label').textContent = `No empty desk available in this shift`;
      }

      const displayList = this.registerDeskFilter === 'empty' ? emptyDesks : desks;

      if (displayList.length === 0) {
        grid.innerHTML = `
          <div class="col-span-full text-center py-6 text-slate-500 dark:text-slate-400">
            <i class="fa-solid fa-chair text-2xl text-amber-500 mb-1.5 block"></i>
            <p class="font-bold text-xs">No empty desks in ${shift} shift.</p>
            <p class="text-[11px] text-slate-400 mt-0.5">Please try switching to another study shift above.</p>
          </div>
        `;
        return;
      }

      displayList.forEach(d => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isSelected = d.desk_id === currentSelectedId;
        const isOcc = d.is_occupied;

        if (isOcc) {
          btn.className = 'p-2 rounded-xl text-center border bg-slate-100 dark:bg-slate-800/40 text-slate-400 border-slate-200 dark:border-slate-800 cursor-not-allowed opacity-50 flex flex-col items-center justify-center';
          btn.innerHTML = `
            <span class="font-mono text-sm font-bold text-slate-400">${d.desk_number}</span>
            <span class="text-[9px] font-semibold text-slate-400">✕ Taken</span>
            <span class="text-[8px] text-slate-400">Zone ${d.zone}</span>
          `;
        } else {
          btn.className = `p-2 rounded-xl text-center border transition flex flex-col items-center justify-center cursor-pointer ${
            isSelected 
              ? 'bg-brand-800 text-white border-brand-900 shadow-md ring-2 ring-brand-500 scale-[1.03]' 
              : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-white border-emerald-300 dark:border-emerald-700/60 hover:border-brand-600 hover:bg-emerald-50/60'
          }`;
          btn.innerHTML = `
            <span class="font-mono text-sm font-black ${isSelected ? 'text-white' : 'text-slate-900 dark:text-white'}">${d.desk_number}</span>
            <span class="text-[9px] font-bold ${isSelected ? 'text-brand-200' : 'text-emerald-600 dark:text-emerald-400'} uppercase">● Empty</span>
            <span class="text-[8px] ${isSelected ? 'text-white/80' : 'text-slate-400'}">Zone ${d.zone}</span>
          `;
          btn.onclick = () => {
            document.getElementById('reg-selected-desk-id').value = d.desk_id;
            document.getElementById('reg-selected-desk-label').textContent = `Selected: Desk #${d.desk_number} · Zone ${d.zone} (${d.zone_name})`;
            this.updateRegisterDeskPicker(d.desk_id);
          };
        }

        grid.appendChild(btn);
      });
    } catch (err) {
      console.error(err);
    }
  },

  async handleRegisterSubmit(e) {
    e.preventDefault();
    const fullName = document.getElementById('reg-full-name').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const shift = document.getElementById('reg-shift').value;
    const deskId = Number(document.getElementById('reg-selected-desk-id')?.value);
    const plan = document.getElementById('reg-plan').value;
    const lockerOpted = document.getElementById('reg-locker-opted').checked;

    if (!deskId || isNaN(deskId)) {
      this.showToast('Please pick an available empty desk to proceed.', 'warning');
      return;
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          phone: phone,
          shift: shift,
          desk_id: deskId,
          plan: plan,
          locker_opted: lockerOpted,
          govt_id_type: 'Aadhaar Card',
          govt_id_number: 'XXXX-1234',
          password: 'student123'
        })
      });

      const data = await res.json();
      if (!data.success) {
        this.showToast(data.message || 'Error registering', 'error');
        return;
      }

      this.showToast(data.message, 'success');
      this.closeModal('modal-register');

      this.lastRegisteredStudent = data.student;
      this.loadFloorPlan(this.activeFloorPlanShift);
      this.loadStats();

      // Show Official Digital Student ID Card
      this.showDigitalIdCard(data.student);

      // Show Verification Status Modal with Admin Mobile Notification confirmation & direct WhatsApp link
      if (data.verification_status === 'PENDING') {
        this.showVerificationPendingModal(data.student, data.admin_mobile_notified, data.whatsapp_url);
      }

    } catch (err) {
      this.showToast('Registration network error', 'error');
    }
  },

  // ---------------- DIGITAL ID CARD ----------------
  showDigitalIdCard(student) {
    if (!student) return;
    this.currentViewingStudent = student;
    this.openModal('modal-id-card');

    document.getElementById('idcard-name').textContent = student.full_name;
    document.getElementById('idcard-phone').textContent = student.phone.startsWith('+') ? student.phone : `+91 ${student.phone}`;
    document.getElementById('idcard-student-id').textContent = student.student_id;
    document.getElementById('idcard-fee-status').textContent = student.fee_status;
    document.getElementById('idcard-desk').textContent = `DESK #${String(student.desk_id).padStart(2, '0')}`;
    document.getElementById('idcard-zone').textContent = student.zone_name || `Zone ${student.zone || 'A'}`;
    document.getElementById('idcard-shift').textContent = `${student.shift} Shift`;
    document.getElementById('idcard-helpline').textContent = this.settings?.helpline_phone || '+91 98765 43210';

    const initials = student.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    document.getElementById('idcard-avatar').textContent = initials;

    // Check verification status
    const isPending = student.verification_status === 'PENDING';
    const verifBadge = document.getElementById('idcard-verif-badge');
    const pendingNotice = document.getElementById('idcard-pending-notice');
    const adminPhoneEl = document.getElementById('idcard-admin-phone');
    const waBtn = document.getElementById('idcard-wa-btn');
    const loginBtn = document.getElementById('idcard-login-btn');

    if (isPending) {
      if (verifBadge) verifBadge.classList.remove('hidden');
      if (pendingNotice) pendingNotice.classList.remove('hidden');
      if (adminPhoneEl) adminPhoneEl.textContent = this.settings?.helpline_phone || '+91 98765 43210';
      if (waBtn) {
        const cleanWa = (this.settings?.helpline_whatsapp || '919876543210').replace(/[^0-9]/g, '');
        const waMsg = encodeURIComponent(`Hello Admin, my new ID ${student.student_id} (${student.full_name}) is awaiting verification. Please activate my account.`);
        waBtn.href = `https://api.whatsapp.com/send?phone=${cleanWa}&text=${waMsg}`;
      }
      if (loginBtn) {
        loginBtn.textContent = 'Check Verification Status';
        loginBtn.onclick = () => {
          this.closeModal('modal-id-card');
          this.showVerificationPendingModal(student, this.settings?.helpline_phone, waBtn ? waBtn.href : '');
        };
      }
    } else {
      if (verifBadge) verifBadge.classList.add('hidden');
      if (pendingNotice) pendingNotice.classList.add('hidden');
      if (loginBtn) {
        loginBtn.textContent = 'Log In to My Desk Now →';
        loginBtn.onclick = () => this.loginFromIdCard();
      }
    }
  },

  showVerificationPendingModal(student, adminPhone, whatsappUrl) {
    if (!student) return;
    this.openModal('modal-verification-status');

    const sId = document.getElementById('verif-modal-stu-id');
    if (sId) sId.textContent = student.student_id;

    const sName = document.getElementById('verif-modal-name');
    if (sName) sName.textContent = student.full_name;

    const sDesk = document.getElementById('verif-modal-desk');
    if (sDesk) sDesk.textContent = `Desk #${String(student.desk_id).padStart(2, '0')} (${student.shift || 'Study Desk'})`;

    const sAdminPhone = document.getElementById('verif-modal-admin-phone');
    if (sAdminPhone) sAdminPhone.textContent = adminPhone || this.settings?.helpline_phone || '+91 98765 43210';

    const waBtn = document.getElementById('verif-modal-wa-btn');
    if (waBtn) {
      if (whatsappUrl) {
        waBtn.href = whatsappUrl;
      } else {
        const cleanWa = (this.settings?.helpline_whatsapp || '919876543210').replace(/[^0-9]/g, '');
        const waMsg = encodeURIComponent(`Hello Admin, my new student ID ${student.student_id} (${student.full_name}) is awaiting verification. Please activate my account.`);
        waBtn.href = `https://api.whatsapp.com/send?phone=${cleanWa}&text=${waMsg}`;
      }
    }
  },

  showMyIdCard() {
    if (this.currentUser && this.currentUser.role === 'student') {
      this.showDigitalIdCard(this.currentUser.user);
    } else if (this.lastRegisteredStudent) {
      this.showDigitalIdCard(this.lastRegisteredStudent);
    }
  },

  loginFromIdCard() {
    if (this.lastRegisteredStudent) {
      if (this.lastRegisteredStudent.verification_status === 'PENDING') {
        this.showToast('Account is under Admin verification. Notification sent to Admin Mobile.', 'warning');
        this.closeModal('modal-id-card');
        this.showVerificationPendingModal(this.lastRegisteredStudent, this.settings?.helpline_phone);
        return;
      }
      this.currentUser = { role: 'student', user: this.lastRegisteredStudent };
      localStorage.setItem('neem_user', JSON.stringify(this.currentUser));
      this.applyUserSession();
      this.closeModal('modal-id-card');
      this.showToast(`Logged in to Desk #${this.lastRegisteredStudent.desk_id}`, 'success');
    }
  },

  // ---------------- UPI QR PAYMENT ----------------
  openPaymentModal(student = null) {
    const s = student || (this.currentUser && this.currentUser.role === 'student' ? this.currentUser.user : null);
    this.openModal('modal-payment');

    const upiId = this.settings.upi_id || 'neemlibrary@icici';
    const payee = this.settings.payee_name || 'Neem Library Study Lounge';
    const amount = s ? (s.plan_amount || 1800) : 1800;

    document.getElementById('pay-modal-title').textContent = s ? `Desk #${s.desk_id} (${s.plan})` : 'Study Desk Fee';
    document.getElementById('pay-modal-amount').textContent = `₹${amount.toLocaleString()}`;
    document.getElementById('pay-modal-upi').textContent = upiId;

    const customImg = document.getElementById('custom-qr-img');
    const qrContainer = document.getElementById('qrcode-container');

    if (this.settings.custom_qr_image) {
      customImg.src = this.settings.custom_qr_image;
      customImg.classList.remove('hidden');
      qrContainer.classList.add('hidden');
    } else {
      customImg.classList.add('hidden');
      qrContainer.classList.remove('hidden');
      qrContainer.innerHTML = '';
      const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payee)}&am=${amount}&cu=INR`;
      new QRCode(qrContainer, {
        text: upiUrl,
        width: 150,
        height: 150,
        colorDark: "#0B4A28",
        colorLight: "#FFFFFF",
        correctLevel: QRCode.CorrectLevel.M
      });
    }
  },

  copyUpiId() {
    const upiId = this.settings.upi_id || 'neemlibrary@icici';
    navigator.clipboard.writeText(upiId).then(() => {
      this.showToast(`Copied ${upiId}`, 'success');
    });
  },

  async handlePaymentSubmit(e) {
    e.preventDefault();
    const txnRef = document.getElementById('pay-txn-ref').value.trim();
    const studentId = (this.currentUser && this.currentUser.user) ? this.currentUser.user.student_id : (this.lastRegisteredStudent ? this.lastRegisteredStudent.student_id : 'STU-101');
    const amount = (this.currentUser && this.currentUser.user) ? (this.currentUser.user.plan_amount || 1800) : 1800;

    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          amount: amount,
          payment_mode: 'UPI_QR',
          transaction_ref: txnRef
        })
      });

      const data = await res.json();
      if (!data.success) {
        this.showToast(data.message, 'error');
        return;
      }

      this.closeModal('modal-payment');
      if (this.currentUser && this.currentUser.role === 'student') {
        this.currentUser.user.fee_status = 'PAID';
        localStorage.setItem('neem_user', JSON.stringify(this.currentUser));
        this.applyUserSession();
      }

      this.showToast('Payment verified successfully!', 'success');
      this.showReceiptModal(data.receipt);
      this.loadStats();

    } catch (err) {
      this.showToast('Payment error', 'error');
    }
  },

  showReceiptModal(receipt) {
    if (!receipt) return;
    this.populateReceiptElements(receipt);
    this.openModal('modal-receipt');
  },

  populateReceiptElements(receipt) {
    if (!receipt) return;
    this.currentViewingReceipt = receipt;
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined && val !== null) el.textContent = val;
    };
    setVal('receipt-no', receipt.receipt_no || 'REC-2026-001');
    setVal('receipt-student-name', receipt.student_name || 'Student');
    setVal('receipt-student-id', receipt.student_id || (this.currentViewingStudent ? this.currentViewingStudent.student_id : (this.currentUser?.user?.student_id || 'STU-101')));
    
    let deskTxt = receipt.desk_number ? String(receipt.desk_number) : '01';
    if (!deskTxt.startsWith('Desk')) {
      deskTxt = `Desk #${deskTxt.padStart(2, '0')}`;
    }
    setVal('receipt-desk', deskTxt);
    setVal('receipt-shift-plan', receipt.shift_plan || `${receipt.shift || 'Night'} Shift · ${receipt.plan || '1 Month'}`);
    setVal('receipt-date', receipt.payment_date || new Date().toISOString().split('T')[0]);
    setVal('receipt-utr', receipt.transaction_ref || '-');
    if (receipt.amount !== undefined && receipt.amount !== null) {
      setVal('receipt-amount', `₹${Number(receipt.amount).toLocaleString('en-IN')}`);
    }
  },

  async viewLatestReceipt() {
    if (!this.currentUser || !this.currentUser.user) return;
    try {
      const u = this.currentUser.user;
      const res = await fetch(`/api/payments?student_id=${encodeURIComponent(u.student_id)}`);
      const list = await res.json();
      if (list && list.length > 0) {
        const p = list[0];
        this.showReceiptModal({
          receipt_no: p.receipt_no,
          student_name: p.full_name || u.full_name,
          student_id: p.student_id || u.student_id,
          desk_number: String(p.desk_id || u.desk_id).padStart(2, '0'),
          shift_plan: `${p.shift || u.shift || 'Night'} Shift · ${p.plan || u.plan || '1 Month'}`,
          payment_date: p.payment_date ? p.payment_date.split(' ')[0] : new Date().toISOString().split('T')[0],
          transaction_ref: p.transaction_ref,
          amount: p.amount
        });
      } else {
        this.showReceiptModal({
          receipt_no: `REC-${new Date().getFullYear()}-${u.student_id.replace(/\D/g, '') || '101'}`,
          student_name: u.full_name,
          student_id: u.student_id,
          desk_number: String(u.desk_id).padStart(2, '0'),
          shift_plan: `${u.shift || 'Night'} Shift · ${u.plan || '1 Month'}`,
          payment_date: new Date().toISOString().split('T')[0],
          transaction_ref: 'ALLOTMENT-CONFIRMED',
          amount: u.plan_amount || 1800
        });
      }
    } catch (err) {
      console.error(err);
    }
  },

  // ---------------- DOCUMENT PRINTING (ISOLATED & STRICTLY SEPARATED) ----------------
  printIdCard() {
    // Mode 1: Prints ONLY the ID Card cleanly on a single page
    document.body.setAttribute('data-print-mode', 'id-card');
    const modal = document.getElementById('modal-id-card');
    const wasHidden = modal && modal.classList.contains('hidden');
    if (wasHidden) modal.classList.remove('hidden');

    window.print();

    const cleanup = () => {
      document.body.removeAttribute('data-print-mode');
      if (wasHidden && modal) modal.classList.add('hidden');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(cleanup, 1200);
  },

  printReceipt() {
    // Mode 2: Prints ONLY the Fee Receipt cleanly on a single page
    document.body.setAttribute('data-print-mode', 'receipt');
    const modal = document.getElementById('modal-receipt');
    const wasHidden = modal && modal.classList.contains('hidden');
    if (wasHidden) modal.classList.remove('hidden');

    window.print();

    const cleanup = () => {
      document.body.removeAttribute('data-print-mode');
      if (wasHidden && modal) modal.classList.add('hidden');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(cleanup, 1200);
  },

  async printAllDocuments() {
    // Mode 3: Prints ID Card on Page 1 and Receipt on Page 2 strictly separated
    const student = this.currentViewingStudent || 
      (this.currentUser && this.currentUser.role === 'student' ? this.currentUser.user : this.lastRegisteredStudent);

    if (!student) {
      this.showToast('Please open or select a student profile before printing documents.', 'info');
      return;
    }

    // Populate ID card
    this.showDigitalIdCard(student);

    // Fetch and populate receipt
    try {
      const res = await fetch(`/api/payments?student_id=${encodeURIComponent(student.student_id)}`);
      const list = await res.json();
      if (list && list.length > 0) {
        const p = list[0];
        this.populateReceiptElements({
          receipt_no: p.receipt_no,
          student_name: p.full_name || student.full_name,
          student_id: student.student_id,
          desk_number: String(p.desk_id || student.desk_id).padStart(2, '0'),
          shift_plan: `${p.shift || student.shift || 'Night'} Shift · ${p.plan || student.plan || '1 Month'}`,
          payment_date: p.payment_date ? p.payment_date.split(' ')[0] : new Date().toISOString().split('T')[0],
          transaction_ref: p.transaction_ref || 'UPI/VERIFIED',
          amount: p.amount || student.plan_amount || 1800
        });
      } else {
        this.populateReceiptElements({
          receipt_no: `REC-${new Date().getFullYear()}-${student.student_id.replace(/\D/g, '') || '101'}`,
          student_name: student.full_name,
          student_id: student.student_id,
          desk_number: String(student.desk_id).padStart(2, '0'),
          shift_plan: `${student.shift || 'Night'} Shift · ${student.plan || '1 Month Standard'}`,
          payment_date: new Date().toISOString().split('T')[0],
          transaction_ref: 'ALLOTMENT-VERIFIED',
          amount: student.plan_amount || 1800
        });
      }
    } catch (e) {
      console.warn('Error fetching payment for print:', e);
      this.populateReceiptElements({
        receipt_no: `REC-${new Date().getFullYear()}-${student.student_id.replace(/\D/g, '') || '101'}`,
        student_name: student.full_name,
        student_id: student.student_id,
        desk_number: String(student.desk_id).padStart(2, '0'),
        shift_plan: `${student.shift || 'Night'} Shift · ${student.plan || '1 Month Standard'}`,
        payment_date: new Date().toISOString().split('T')[0],
        transaction_ref: 'ALLOTMENT-VERIFIED',
        amount: student.plan_amount || 1800
      });
    }

    const idModal = document.getElementById('modal-id-card');
    const receiptModal = document.getElementById('modal-receipt');
    const idWasHidden = idModal && idModal.classList.contains('hidden');
    const receiptWasHidden = receiptModal && receiptModal.classList.contains('hidden');

    if (idModal) idModal.classList.remove('hidden');
    if (receiptModal) receiptModal.classList.remove('hidden');

    document.body.setAttribute('data-print-mode', 'all');

    window.print();

    const cleanup = () => {
      document.body.removeAttribute('data-print-mode');
      if (idWasHidden && idModal) idModal.classList.add('hidden');
      if (receiptWasHidden && receiptModal) receiptModal.classList.add('hidden');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(cleanup, 1200);
  },

  // ---------------- SEAT RELOCATION ----------------
  openSeatChangeModal(targetDeskId = null) {
    if (!this.currentUser || this.currentUser.role !== 'student') {
      this.showToast('Sign in as student to request seat relocation', 'info');
      return;
    }
    this.openModal('modal-seat-change');
    const u = this.currentUser.user;
    document.getElementById('change-current-desk').value = `Current: Desk #${String(u.desk_id).padStart(2, '0')} (${u.shift})`;

    const select = document.getElementById('change-requested-desk');
    select.innerHTML = '';
    fetch(`/api/desks?shift=${encodeURIComponent(u.shift)}`)
      .then(r => r.json())
      .then(d => {
        const open = (d.desks || []).filter(dk => !dk.is_occupied);
        open.forEach(dk => {
          const opt = document.createElement('option');
          opt.value = dk.desk_id;
          opt.textContent = `Desk #${dk.desk_number} (${dk.zone_name})`;
          if (targetDeskId && dk.desk_id === targetDeskId) opt.selected = true;
          select.appendChild(opt);
        });
      });
  },

  async handleSeatChangeSubmit(e) {
    e.preventDefault();
    const reqDeskId = Number(document.getElementById('change-requested-desk').value);
    const reason = document.getElementById('change-reason').value.trim();

    try {
      const res = await fetch('/api/seat-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: this.currentUser.user.student_id,
          requested_desk_id: reqDeskId,
          reason: reason
        })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast('Seat change request sent to Management', 'success');
        this.closeModal('modal-seat-change');
      } else {
        this.showToast(data.message, 'error');
      }
    } catch (err) {
      this.showToast('Error requesting seat change', 'error');
    }
  },

  // ---------------- HELPLINE EDIT (ADMIN ONLY) ----------------
  openHelplineModal() {
    if (!this.currentUser || this.currentUser.role !== 'admin') {
      this.showToast('Only library management can edit the helpline phone number', 'error');
      return;
    }
    this.openModal('modal-helpline-edit');
    document.getElementById('edit-helpline-input').value = this.settings.helpline_phone || '+91 98765 43210';
  },

  async handleHelplineUpdateSubmit(e) {
    e.preventDefault();
    const phone = document.getElementById('edit-helpline-input').value.trim();
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ helpline_phone: phone, helpline_whatsapp: phone.replace(/\D/g, '') })
      });
      const data = await res.json();
      if (data.success) {
        this.settings = Object.assign(this.settings, data.settings);
        this.applySettingsToUI();
        this.closeModal('modal-helpline-edit');
        this.showToast('Helpline number updated!', 'success');
      }
    } catch (err) {
      this.showToast('Error updating helpline', 'error');
    }
  },

  // ---------------- INQUIRY / HELPDESK ----------------
  openInquiryModal() {
    this.openModal('modal-inquiry');
  },

  async handleInquirySubmit(e) {
    e.preventDefault();
    const name = document.getElementById('inquiry-sender-name').value.trim();
    const phone = document.getElementById('inquiry-sender-phone').value.trim();
    const subject = document.getElementById('inquiry-subject').value.trim();
    const message = document.getElementById('inquiry-message').value.trim();

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_name: name,
          sender_phone: phone,
          sender_type: this.currentUser ? 'student' : 'inquiry',
          student_id: (this.currentUser && this.currentUser.user) ? this.currentUser.user.student_id : null,
          subject: subject,
          message: message
        })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast('Message sent to Management Desk!', 'success');
        this.closeModal('modal-inquiry');
        this.loadTickets();
        this.loadStats();
      }
    } catch (err) {
      this.showToast('Error sending message', 'error');
    }
  },

  // ---------------- QR FILE UPLOAD ----------------
  handleQrFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      this.settings.custom_qr_image = evt.target.result;
      const preview = document.getElementById('qr-preview-img');
      const container = document.getElementById('qr-preview-container');
      if (preview && container) {
        preview.src = evt.target.result;
        container.classList.remove('hidden');
      }
      this.showToast('QR code loaded. Save settings to persist.', 'info');
    };
    reader.readAsDataURL(file);
  },

  async saveShiftPrices() {
    const night = Number(document.getElementById('price-shift-night')?.value) || 1200;
    const fullday = Number(document.getElementById('price-shift-fullday')?.value) || 1800;
    const daily = Number(document.getElementById('price-daily-pass')?.value) || 150;
    const locker = Number(document.getElementById('price-locker-addon')?.value) || 300;

    const payload = {
      shift_prices: {
        'Night': night,
        'Full Day 24x7': fullday
      },
      'Daily Pass': daily,
      'Locker Addon': locker
    };

    try {
      const res = await fetch('/api/shift-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        if (!this.settings.shift_prices) this.settings.shift_prices = {};
        Object.assign(this.settings.shift_prices, data.shift_prices);
        if (data.plan_prices) {
          if (!this.settings.plan_prices) this.settings.plan_prices = {};
          Object.assign(this.settings.plan_prices, data.plan_prices);
        }
        this.applySettingsToUI();
        this.showToast('✓ Shift prices updated successfully! New rates are now active.', 'success');
      } else {
        this.showToast(data.message || 'Error updating shift prices', 'error');
      }
    } catch (err) {
      this.showToast('Network error updating shift prices', 'error');
    }
  },

  async saveAdminSettings() {
    const phone = document.getElementById('setting-phone').value.trim();
    const upi = document.getElementById('setting-upi').value.trim();
    const payee = document.getElementById('setting-payee').value.trim();

    const night = Number(document.getElementById('price-shift-night')?.value) || 1200;
    const fullday = Number(document.getElementById('price-shift-fullday')?.value) || 1800;
    const daily = Number(document.getElementById('price-daily-pass')?.value) || 150;
    const locker = Number(document.getElementById('price-locker-addon')?.value) || 300;

    const shiftPrices = {
      'Night': night,
      'Full Day 24x7': fullday
    };

    const planPrices = Object.assign({}, this.settings.plan_prices || {}, {
      'Daily Pass': daily,
      'Locker Addon': locker
    });

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          helpline_phone: phone,
          helpline_whatsapp: phone.replace(/\D/g, ''),
          upi_id: upi,
          payee_name: payee,
          custom_qr_image: this.settings.custom_qr_image || '',
          shift_prices: shiftPrices,
          plan_prices: planPrices
        })
      });
      const data = await res.json();
      if (data.success) {
        this.settings = Object.assign(this.settings, data.settings);
        this.applySettingsToUI();
        this.showToast('Settings & shift prices saved successfully!', 'success');
      }
    } catch (err) {
      this.showToast('Error saving settings', 'error');
    }
  },

  // ---------------- ADMIN VERIFICATIONS & MOBILE NOTIFICATIONS ----------------
  async loadPendingVerifications() {
    try {
      const res = await fetch('/api/students/pending-verifications');
      const list = await res.json();
      this.pendingVerifications = list;
      this.renderPendingVerifications(list);

      // Update badge
      const badge = document.getElementById('verifications-badge-count');
      if (badge) badge.textContent = `${list.length} Pending`;

      const tabBadge = document.getElementById('tab-verifications-count');
      if (tabBadge) {
        if (list.length > 0) {
          tabBadge.textContent = list.length;
          tabBadge.classList.remove('hidden');
        } else {
          tabBadge.classList.add('hidden');
        }
      }

      const banner = document.getElementById('pending-verifications-banner');
      const bannerCount = document.getElementById('pending-verifications-banner-count');
      if (banner) {
        if (list.length > 0) {
          if (bannerCount) bannerCount.textContent = list.length;
          banner.classList.remove('hidden');
        } else {
          banner.classList.add('hidden');
        }
      }
    } catch (err) {
      console.error('Error loading pending verifications:', err);
    }
  },

  renderPendingVerifications(list) {
    const tbody = document.getElementById('verifications-table-body');
    const emptyState = document.getElementById('verifications-empty-state');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!list || list.length === 0) {
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }
    if (emptyState) emptyState.classList.add('hidden');

    list.forEach(s => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50 dark:hover:bg-slate-800/50 transition';
      
      const cleanWa = (s.phone || '').replace(/[^0-9]/g, '');
      const waUrl = `https://api.whatsapp.com/send?phone=91${cleanWa.slice(-10)}&text=${encodeURIComponent(`Hello ${s.full_name}, regarding your Neem Library registration (ID: ${s.student_id}).`)}`;

      tr.innerHTML = `
        <td class="py-3 px-3">
          <div class="font-mono font-black text-slate-900 dark:text-white text-xs">${s.student_id}</div>
          <div class="font-bold text-slate-900 dark:text-slate-100 text-sm">${s.full_name}</div>
          <div class="text-[10px] text-slate-400 font-mono">Reg: ${s.created_at || 'Just now'}</div>
        </td>
        <td class="py-3 px-3">
          <div class="font-mono font-bold text-slate-800 dark:text-slate-200 text-xs">${s.phone}</div>
          <a href="${waUrl}" target="_blank" class="mt-1 inline-flex items-center text-[11px] font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 gap-1">
            <i class="fa-brands fa-whatsapp"></i> Chat on WhatsApp
          </a>
        </td>
        <td class="py-3 px-3">
          <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800/60 font-semibold text-[11px]">
            <i class="fa-solid fa-id-card text-indigo-600"></i>
            <span>${s.govt_id_type || 'Govt ID'}: <strong>${s.govt_id_number || 'Provided'}</strong></span>
          </div>
        </td>
        <td class="py-3 px-3">
          <span class="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800 font-mono font-black text-xs">
            Desk #${String(s.desk_id).padStart(2, '0')} (${s.zone || 'A'})
          </span>
          <div class="text-[10px] text-slate-500 mt-0.5">${s.shift} Shift</div>
        </td>
        <td class="py-3 px-3">
          <div class="font-bold text-slate-800 dark:text-slate-200 text-xs">${s.plan}</div>
          <div class="font-mono text-[11px] text-emerald-700 dark:text-emerald-400 font-extrabold">₹${(s.plan_amount || 0).toLocaleString()}</div>
        </td>
        <td class="py-3 px-3">
          <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10px] font-black uppercase tracking-wider border border-emerald-300 dark:border-emerald-800">
            <i class="fa-solid fa-check"></i>
            <span>Sent to Admin Mobile</span>
          </div>
          <div class="text-[10px] text-slate-400 mt-1 font-mono">${this.settings?.helpline_phone || '+91 98765 43210'}</div>
        </td>
        <td class="py-3 px-3 text-right">
          <div class="flex items-center justify-end space-x-1.5">
            <button onclick="app.verifyStudent('${s.student_id}', 'approve')" class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-xs transition flex items-center gap-1">
              <i class="fa-solid fa-check"></i>
              <span>Verify & Activate</span>
            </button>
            <button onclick="app.verifyStudent('${s.student_id}', 'reject')" class="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-bold text-xs transition flex items-center gap-1" title="Reject registration">
              <i class="fa-solid fa-xmark"></i>
              <span>Reject</span>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  },

  async verifyStudent(studentId, action) {
    if (action === 'reject') {
      const ok = confirm(`Are you sure you want to reject registration for student ${studentId}? The reserved desk will be vacated.`);
      if (!ok) return;
    }

    try {
      const res = await fetch(`/api/students/${encodeURIComponent(studentId)}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: action })
      });
      const data = await res.json();
      if (!data.success) {
        this.showToast(data.message || 'Verification failed', 'error');
        return;
      }

      this.showToast(data.message, 'success');
      this.loadPendingVerifications();
      this.loadNotificationsLog();
      this.loadStats();
      this.loadStudents();
      this.loadFloorPlan(this.activeFloorPlanShift);
    } catch (err) {
      console.error(err);
      this.showToast('Network error during verification', 'error');
    }
  },

  async loadNotificationsLog() {
    const container = document.getElementById('notifications-log-container');
    if (!container) return;
    try {
      const res = await fetch('/api/notifications?limit=20');
      const list = await res.json();
      container.innerHTML = '';

      if (!list || list.length === 0) {
        container.innerHTML = '<div class="text-xs text-slate-400 py-4 text-center">No notifications dispatched yet.</div>';
        return;
      }

      list.forEach(n => {
        const item = document.createElement('div');
        item.className = 'p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-start justify-between gap-3 text-xs';
        
        let typeBadge = 'bg-blue-100 text-blue-900 border-blue-300';
        let icon = 'fa-bell';
        if (n.type === 'STUDENT_REGISTRATION') {
          typeBadge = 'bg-amber-100 text-amber-900 border-amber-300';
          icon = 'fa-user-plus';
        } else if (n.type === 'STUDENT_VERIFIED') {
          typeBadge = 'bg-emerald-100 text-emerald-900 border-emerald-300';
          icon = 'fa-circle-check';
        } else if (n.type === 'STUDENT_REJECTED') {
          typeBadge = 'bg-rose-100 text-rose-900 border-rose-300';
          icon = 'fa-ban';
        }

        item.innerHTML = `
          <div class="flex items-start space-x-2.5">
            <div class="w-7 h-7 rounded-lg ${typeBadge} flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 border">
              <i class="fa-solid ${icon}"></i>
            </div>
            <div>
              <div class="font-extrabold text-slate-900 dark:text-white">${n.title}</div>
              <div class="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">${n.message.replace(/\n/g, ' ')}</div>
              <div class="text-[10px] text-slate-400 font-mono mt-1">Dispatched to: <strong>${n.recipient_phone}</strong> (${n.channel})</div>
            </div>
          </div>
          <div class="text-right shrink-0">
            <span class="text-[9px] font-mono text-slate-400">${n.created_at}</span>
            <div class="mt-1">
              <span class="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                ${n.status}
              </span>
            </div>
          </div>
        `;
        container.appendChild(item);
      });
    } catch (err) {
      console.error('Error loading notifications log:', err);
    }
  },

  // ---------------- MODAL UTILS ----------------
  openModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('hidden');
  },

  closeModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.add('hidden');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  app.init();

  const dropzone = document.getElementById('qr-dropzone');
  const fileInput = document.getElementById('qr-file-input');
  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());
  }
});
