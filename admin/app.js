/**
 * JEMABILL ADMIN BACK OFFICE — APPLICATION CONTROLLER
 * Production Version: Connected to live https://api.jemabill.com
 * Memory-only token, 30m idle session, zero mock datasets.
 */

(function () {
  'use strict';

  // Config & State
  const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : '/api';

  const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  let adminToken = null;
  let currentAdmin = null;
  let idleTimer = null;
  let activeTab = 'overview';
  let cachedSettings = [];

  // DOM Elements
  const authView = document.getElementById('auth-view');
  const appLayout = document.getElementById('app-layout');
  const loginForm = document.getElementById('login-form');
  const loginAlert = document.getElementById('login-alert');
  const loginBtn = document.getElementById('login-btn');
  const sessionCountdown = document.getElementById('session-countdown');
  const adminNameDisplay = document.getElementById('admin-name-display');
  const adminInitialsDisplay = document.getElementById('admin-initials-display');
  const toastContainer = document.getElementById('toast-container');

  // Drawers & Modals
  const drawerBackdrop = document.getElementById('drawer-backdrop');
  const drawerTitle = document.getElementById('drawer-title');
  const drawerBody = document.getElementById('drawer-body');
  const modalBackdrop = document.getElementById('modal-backdrop');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalFooter = document.getElementById('modal-footer');

  // Provider Metadata
  const PROVIDER_METADATA = {
    monnify: { name: 'Monnify', type: 'Virtual Accounts & Collections', icon: 'account_balance' },
    paymentpoint: { name: 'PaymentPoint', type: 'Primary & Backup Virtual Accounts', icon: 'hub' },
    strowallet: { name: 'StroWallet', type: 'Bank Transfers, Cards & Float', icon: 'credit_card' },
    vtpass: { name: 'VTpass', type: 'Utilities & Bill Payments', icon: 'bolt' },
    naijaresultpins: { name: 'NaijaResultPins', type: 'WAEC / JAMB / NECO PINs', icon: 'school' },
    hollatags: { name: 'HollaTags', type: 'SMS & OTP Delivery', icon: 'sms' },
    smtp: { name: 'SMTP (Infobip)', type: 'Transactional Email', icon: 'mail' },
  };

  // 14 Cashback Services
  const CASHBACK_SERVICES = [
    { type: 'AIRTIME', name: 'Airtime Top-up', icon: 'phone_android', defaultBps: 100 },
    { type: 'DATA', name: 'Data Bundles', icon: 'wifi', defaultBps: 100 },
    { type: 'ELECTRICITY', name: 'Electricity DisCo', icon: 'bolt', defaultBps: 50 },
    { type: 'CABLE_TV', name: 'Cable TV Renewal', icon: 'tv', defaultBps: 50 },
    { type: 'EXAM_PIN', name: 'Exam PINs (WAEC/NECO/NABTEB)', icon: 'school', defaultBps: 100 },
    { type: 'JAMB', name: 'JAMB UTME / DE PINs', icon: 'menu_book', defaultBps: 100 },
    { type: 'BETTING_FUNDING', name: 'Betting Wallet Funding', icon: 'sports_soccer', defaultBps: 50 },
    { type: 'TELECOM_SMILE', name: 'Smile Internet', icon: 'router', defaultBps: 50 },
    { type: 'TELECOM_SPECTRANET', name: 'Spectranet 4G', icon: 'cell_tower', defaultBps: 50 },
    { type: 'EDUCATION_DATA', name: 'Education Data', icon: 'local_library', defaultBps: 50 },
    { type: 'BULK_SMS', name: 'Bulk SMS Messaging', icon: 'sms', defaultBps: 50 },
    { type: 'RECHARGE_CARD_PRINT', name: 'Recharge Card Printing', icon: 'print', defaultBps: 50 },
    { type: 'VEHICLE_INSURANCE', name: 'Vehicle Insurance', icon: 'directions_car', defaultBps: 50 },
    { type: 'COUPON', name: 'Coupon Generation', icon: 'confirmation_number', defaultBps: 50 }
  ];

  // ==========================================
  // Production API Client with 401/403 Guards
  // ==========================================
  async function apiRequest(endpoint, options = {}) {
    if (!adminToken) {
      logout('Authentication required.');
      return { success: false, error: 'NO_TOKEN' };
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
      ...(options.headers || {})
    };

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
      });

      // Strict security invariant: 403 or 401 forces immediate logout
      if (res.status === 401 || res.status === 403) {
        logout('Admin permissions revoked or session expired. Signed out.');
        return { success: false, error: 'FORBIDDEN' };
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errorMsg = json.message || (json.error && json.error.message) || json.error || `HTTP ${res.status}`;
        return { success: false, error: errorMsg };
      }
      return json;
    } catch (err) {
      console.error(`[AdminAPI] ${endpoint} fetch error:`, err);
      return { success: false, error: 'Network error connecting to backend API.' };
    }
  }

  // ==========================================
  // Authentication & Login
  // ==========================================
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginAlert.style.display = 'none';

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
      showLoginAlert('Please enter both email and password.');
      return;
    }

    loginBtn.disabled = true;
    loginBtn.querySelector('span:last-child').textContent = 'Authenticating...';

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const body = await res.json().catch(() => ({}));

      // Check success
      if (res.ok && (body.accessToken || body.token || (body.data && body.data.accessToken))) {
        const token = body.accessToken || body.token || body.data.accessToken;
        const rawUser = body.user || (body.data && body.data.user) || {};

        // Verify with backend that this token has ADMIN role
        const verifyRes = await fetch(`${API_BASE}/admin/overview`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }).catch(() => null);

        if (verifyRes && verifyRes.status === 403) {
          showLoginAlert('Access Denied: This account is not an authorized JemaBill administrator.');
          loginBtn.disabled = false;
          loginBtn.querySelector('span:last-child').textContent = 'Sign In to Panel';
          return;
        }

        const adminName = (rawUser.firstName && rawUser.lastName)
          ? `${rawUser.firstName} ${rawUser.lastName}`
          : (rawUser.firstName || 'Operations Admin');

        // Store token in memory only
        adminToken = token;
        currentAdmin = {
          ...rawUser,
          email: rawUser.email || email,
          role: 'ADMIN',
          name: adminName
        };
        initSession();
        return;
      }

      const msg = body.message || (body.error && body.error.message) || body.error || 'Invalid administrator credentials.';
      showLoginAlert(Array.isArray(msg) ? msg[0] : msg);
    } catch {
      showLoginAlert('Network error connecting to backend API.');
    } finally {
      loginBtn.disabled = false;
      loginBtn.querySelector('span:last-child').textContent = 'Sign In to Panel';
    }
  });

  function showLoginAlert(msg) {
    loginAlert.textContent = msg;
    loginAlert.style.display = 'block';
  }

  // ==========================================
  // Session Lifetime & Idle Timeout
  // ==========================================
  function initSession() {
    authView.style.display = 'none';
    appLayout.style.display = 'flex';

    adminNameDisplay.textContent = currentAdmin.name || currentAdmin.email;
    adminInitialsDisplay.textContent = (currentAdmin.name || 'AD')
      .split(' ')
      .map(x => x[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    resetIdleTimer();
    ['click', 'keydown', 'mousemove', 'scroll'].forEach(evt => {
      window.addEventListener(evt, resetIdleTimer, { passive: true });
    });

    renderView(activeTab);
  }

  function resetIdleTimer() {
    clearTimeout(idleTimer);
    let timeLeftMs = IDLE_TIMEOUT_MS;

    idleTimer = setInterval(() => {
      timeLeftMs -= 1000;
      if (timeLeftMs <= 0) {
        clearTimeout(idleTimer);
        logout('Session timed out after 30 minutes of inactivity.');
      } else {
        const mins = Math.floor(timeLeftMs / 60000);
        const secs = Math.floor((timeLeftMs % 60000) / 1000);
        sessionCountdown.textContent = `${mins}m ${secs < 10 ? '0' : ''}${secs}s session`;
      }
    }, 1000);
  }

  function logout(reason) {
    adminToken = null;
    currentAdmin = null;
    clearTimeout(idleTimer);
    appLayout.style.display = 'none';
    authView.style.display = 'flex';
    loginForm.reset();
    if (reason) {
      showLoginAlert(reason);
    }
  }

  window.logoutAdmin = () => logout('Logged out successfully.');

  // ==========================================
  // Navigation & View Routing
  // ==========================================
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.view;
      if (!target) return;

      navItems.forEach((x) => x.classList.remove('active'));
      btn.classList.add('active');

      activeTab = target;
      const titleEl = document.getElementById('current-page-title');
      if (titleEl) {
        titleEl.textContent = btn.querySelector('.nav-item-left span:last-child').textContent;
      }
      renderView(target);
    });
  });

  async function renderView(view) {
    const container = document.getElementById('view-content-root');
    container.innerHTML = `
      <div style="padding: 48px 24px; text-align: center; color: var(--text-dim);">
        <span class="material-symbols-outlined" style="font-size: 2.2rem; animation: spin 1s linear infinite; display: inline-block;">sync</span>
        <p style="margin-top: 10px; font-size: 0.9rem;">Loading live operational data...</p>
      </div>
    `;

    switch (view) {
      case 'overview':
        await renderOverview(container);
        break;
      case 'kyc':
        await renderKycQueue(container);
        break;
      case 'users':
        await renderUsers(container);
        break;
      case 'messaging':
        await renderMessaging(container);
        break;
      case 'transactions':
        await renderTransactions(container);
        break;
      case 'virtual-cards':
        await renderVirtualCards(container);
        break;
      case 'funding':
        await renderFunding(container);
        break;
      case 'cashback':
        await renderCashback(container);
        break;
      case 'providers':
        await renderProviders(container);
        break;
      case 'settings':
        await renderSettings(container);
        break;
      case 'banners':
        await renderBanners(container);
        break;
      case 'audit':
        await renderAuditLog(container);
        break;
      default:
        container.innerHTML = `<p>View not found.</p>`;
    }
  }

  // ==========================================
  // 1. Overview Screen
  // ==========================================
  async function renderOverview(container) {
    const res = await apiRequest('/admin/overview');
    if (!res.success) {
      container.innerHTML = renderErrorAlert(res.error, () => renderOverview(container));
      return;
    }

    const data = res.data || {};
    const users = data.users || {};
    const tx = data.transactionsLast24h || {};
    const byStatus = tx.byStatus || {};
    const kyc = data.kyc || {};
    const deposits = data.depositsToday || {};
    const needsReview = data.needsReview || {};
    const payouts = data.payouts || {};

    // Update navigation badges with live counts
    updateNavBadges(kyc.queueSize || 0, needsReview.total || 0);

    const kycOldestText = kyc.oldestQueuedAgeMinutes != null
      ? `${Math.round(kyc.oldestQueuedAgeMinutes / 60)}h ${kyc.oldestQueuedAgeMinutes % 60}m ago`
      : 'Queue clear';

    container.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">Total Users</span>
            <div class="kpi-icon-wrap" style="background: rgba(59, 130, 246, 0.12); color: #2563EB;">
              <span class="material-symbols-outlined">group</span>
            </div>
          </div>
          <div class="kpi-val">${(users.total || 0).toLocaleString()}</div>
          <div class="kpi-sub">+${users.new24h || 0} today • +${users.new7d || 0} this week</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">KYC Queue</span>
            <div class="kpi-icon-wrap" style="background: rgba(245, 158, 11, 0.12); color: #D97706;">
              <span class="material-symbols-outlined">badge</span>
            </div>
          </div>
          <div class="kpi-val">${kyc.queueSize || 0}</div>
          <div class="kpi-sub">Oldest: ${kycOldestText}</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">24h Transactions</span>
            <div class="kpi-icon-wrap" style="background: rgba(21, 140, 138, 0.12); color: var(--primary);">
              <span class="material-symbols-outlined">payments</span>
            </div>
          </div>
          <div class="kpi-val">${(tx.total || 0).toLocaleString()}</div>
          <div class="kpi-sub" style="color: ${needsReview.total > 0 ? 'var(--warning)' : 'inherit'};">
            ${byStatus.SUCCESS || 0} success • ${byStatus.PENDING || 0} pending • ${needsReview.total || 0} review
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">Absorbed Fees (Today)</span>
            <div class="kpi-icon-wrap" style="background: rgba(197, 231, 108, 0.2); color: var(--navy);">
              <span class="material-symbols-outlined">savings</span>
            </div>
          </div>
          <div class="kpi-val">₦${((deposits.totalAbsorbedFeeKobo || 0) / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}</div>
          <div class="kpi-sub">₦${((deposits.totalCreditedKobo || 0) / 100).toLocaleString('en-NG')} credited to wallets</div>
        </div>
      </div>

      <!-- Quick Action Panels -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
        <div class="table-card" style="padding: 24px;">
          <h3 style="font-family: var(--font-heading); margin-bottom: 16px; color: var(--navy);">KYC Tier Distribution</h3>
          <div style="display: flex; flex-direction: column; gap: 14px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.9rem;">Tier 0 (Unverified / Basic)</span>
              <span class="badge badge-neutral">${(users.kycTier?.tier0 || 0).toLocaleString()}</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.9rem;">Tier 1 (NIN/BVN Verified)</span>
              <span class="badge badge-info">${(users.kycTier?.tier1 || 0).toLocaleString()}</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.9rem;">Tier 2 (Biometrics & Address)</span>
              <span class="badge badge-success">${(users.kycTier?.tier2 || 0).toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div class="table-card" style="padding: 24px;">
          <h3 style="font-family: var(--font-heading); margin-bottom: 16px; color: var(--navy);">Pending Operations & Review</h3>
          <div style="display: flex; flex-direction: column; gap: 14px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.9rem;">Transactions Needing Review</span>
              <span class="badge ${needsReview.total > 0 ? 'badge-warning' : 'badge-neutral'}">${needsReview.total || 0}</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.9rem;">Parked Payouts</span>
              <span class="badge ${payouts.parked > 0 ? 'badge-danger' : 'badge-neutral'}">${payouts.parked || 0}</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.9rem;">Failed Webhooks (24h)</span>
              <span class="badge badge-neutral">${data.failedWebhooks?.total || 0}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function updateNavBadges(kycCount, reviewCount) {
    const kycBadge = document.querySelector('.nav-item[data-view="kyc"] .nav-badge');
    if (kycBadge) {
      kycBadge.textContent = kycCount;
      kycBadge.style.display = kycCount > 0 ? 'inline-block' : 'none';
    }

    const txBadge = document.querySelector('.nav-item[data-view="transactions"] .nav-badge');
    if (txBadge) {
      txBadge.textContent = reviewCount;
      txBadge.style.display = reviewCount > 0 ? 'inline-block' : 'none';
    }
  }

  // ==========================================
  // 2. KYC Queue & Review Screen
  // ==========================================
  async function renderKycQueue(container) {
    const res = await apiRequest('/admin/kyc');
    if (!res.success) {
      container.innerHTML = renderErrorAlert(res.error, () => renderKycQueue(container));
      return;
    }

    const items = (res.data && res.data.items) || [];

    container.innerHTML = `
      <div class="toolbar">
        <div class="search-box">
          <span class="material-symbols-outlined">search</span>
          <input type="text" id="kyc-search" placeholder="Search by name, ID number..." oninput="window.filterKycTable()" />
        </div>
        <div class="filters-group">
          <select class="filter-select" id="kyc-status-filter" onchange="window.filterKycTable()">
            <option value="ALL">All Statuses</option>
            <option value="PENDING" selected>Pending</option>
            <option value="NEEDS_REVIEW">Needs Review</option>
          </select>
        </div>
      </div>

      <div class="table-card">
        <table class="data-table" id="kyc-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Applicant</th>
              <th>ID Type</th>
              <th>ID Last 4</th>
              <th>Match Score</th>
              <th>Submitted</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${items.length === 0 ? `
              <tr>
                <td colspan="8" style="text-align: center; padding: 48px 20px; color: var(--text-dim);">
                  <span class="material-symbols-outlined" style="font-size: 2.5rem; display: block; margin-bottom: 8px; color: var(--primary);">verified</span>
                  <strong style="color: var(--navy); font-size: 1rem;">KYC Queue is Clear</strong>
                  <p style="font-size: 0.85rem; margin-top: 4px;">There are no pending identity verifications awaiting manual review.</p>
                </td>
              </tr>
            ` : items.map(k => `
              <tr data-status="${k.status}" data-search="${(k.userName || '') + ' ' + (k.idLast4 || '')}">
                <td><code>${k.id.slice(0, 8)}...</code></td>
                <td>
                  <strong>${k.userName || 'Applicant'}</strong>
                  ${k.userEmail ? `<div style="font-size:0.75rem; color:var(--text-dim);">${k.userEmail}</div>` : (k.userEmailMasked ? `<div style="font-size:0.75rem; color:var(--text-dim);">${k.userEmailMasked}</div>` : '')}
                  ${k.userPhone ? `<div style="font-size:0.75rem; color:var(--text-dim);">${k.userPhone}</div>` : ''}
                </td>
                <td><span class="badge badge-neutral">${k.idType || 'NIN'}</span></td>
                <td>•••• ${k.idLast4 || '****'}</td>
                <td>
                  <span style="font-weight:600; color:${(k.matchScore || 0) >= 90 ? 'var(--success)' : 'var(--warning)'};">
                    ${k.matchScore != null ? k.matchScore + '%' : '—'}
                  </span>
                </td>
                <td style="color:var(--text-muted); font-size:0.8rem;">${k.submittedAt ? new Date(k.submittedAt).toLocaleTimeString() : '—'}</td>
                <td>
                  <span class="badge ${k.status === 'PENDING' ? 'badge-warning' : 'badge-danger'}">
                    ${k.status}
                  </span>
                </td>
                <td>
                  <button class="btn-primary" style="padding: 6px 14px; font-size: 0.8rem;" onclick="window.openKycReview('${k.id}')">
                    Review
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  window.filterKycTable = function () {
    const search = document.getElementById('kyc-search')?.value.toLowerCase().trim() || '';
    const status = document.getElementById('kyc-status-filter')?.value || 'ALL';
    const rows = document.querySelectorAll('#kyc-table tbody tr');

    rows.forEach(r => {
      const rowStatus = r.getAttribute('data-status');
      const rowSearch = (r.getAttribute('data-search') || '').toLowerCase();
      const matchesStatus = status === 'ALL' || rowStatus === status;
      const matchesSearch = !search || rowSearch.includes(search);
      r.style.display = matchesStatus && matchesSearch ? '' : 'none';
    });
  };

  // Open KYC Review Dialog with Real Biometric Selfies
  window.openKycReview = async function (kycId) {
    modalTitle.textContent = 'KYC Biometric Verification';
    modalBody.innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--text-dim);">
        <span class="material-symbols-outlined" style="animation: spin 1s linear infinite;">sync</span>
        <p style="margin-top: 8px;">Fetching encrypted biometric frames...</p>
      </div>
    `;
    modalFooter.innerHTML = '';
    modalBackdrop.classList.add('active');

    const res = await apiRequest(`/admin/kyc/${kycId}/selfies`);
    const selfieData = res.data || {};
    const frames = selfieData.frames || [];

    modalBody.innerHTML = `
      <div class="drawer-section">
        <div class="section-label">Applicant Verification</div>
        <div class="detail-row"><span>KYC ID</span><span><code>${kycId}</code></span></div>
        <div class="detail-row"><span>Match Score</span><span style="font-weight:700; color:var(--primary);">${selfieData.matchScore != null ? selfieData.matchScore + '%' : 'Awaiting'}</span></div>
      </div>

      <div style="margin-top: 16px;">
        <div class="section-label">Liveness & Biometric Verification Frames</div>
        <div class="selfies-grid">
          ${frames.length === 0 ? `
            <div style="grid-column: 1 / -1; padding: 24px; text-align: center; color: var(--text-dim); background: var(--bg-app); border-radius: var(--radius-sm);">
              No biometric selfie frames attached to this record.
            </div>
          ` : frames.map((f, i) => `
            <div class="selfie-frame-card">
              <img src="${f.url}" alt="Frame ${i + 1}" />
              <span class="selfie-frame-badge">Frame ${i + 1}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="form-field" style="margin-top: 16px;">
        <label>Decision Reason (Mandatory for Audit)</label>
        <textarea id="kyc-review-reason" class="reason-textarea" placeholder="State operational verification reasoning..."></textarea>
      </div>
    `;

    modalFooter.innerHTML = `
      <button class="btn-secondary" onclick="window.closeModal()">Cancel</button>
      <button class="btn-primary" style="background:var(--danger); width:auto;" onclick="window.submitKycDecision('${kycId}', 'reject')">
        Reject
      </button>
      <button class="btn-primary" style="width:auto;" onclick="window.submitKycDecision('${kycId}', 'approve')">
        Approve Verification
      </button>
    `;
  };

  window.submitKycDecision = async function (kycId, outcome) {
    const reason = document.getElementById('kyc-review-reason')?.value.trim();
    if (!reason || reason.length < 8) {
      alert('A clear audit justification of at least 8 characters is required.');
      return;
    }

    const res = await apiRequest(`/admin/kyc/${kycId}/${outcome}`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });

    if (!res.success) {
      alert(`Decision failed: ${res.error}`);
      return;
    }

    closeModal();
    showToast(`KYC verification marked as ${outcome.toUpperCase()}`);
    renderView('kyc');
  };

  // ==========================================
  // 3. User Management, User Activities, Messaging & PDF Exports
  // ==========================================
  let cachedUsersList = [];
  let cachedAllTransactions = [];
  let currentDrawerUserData = null;

  let cachedLogoDataUrl = null;
  async function loadLogoDataUrl() {
    if (cachedLogoDataUrl) return cachedLogoDataUrl;
    try {
      const blob = await (await fetch('/assets/images/logo.png')).blob();
      cachedLogoDataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
    } catch (e) {
      cachedLogoDataUrl = null;
    }
    return cachedLogoDataUrl;
  }

  window.downloadTransactionsPdf = async function (txList, reportTitle = 'JemaBill Transactions Report', reportSubtitle = '') {
    if (!Array.isArray(txList) || txList.length === 0) {
      alert('No transactions available to export in this selection.');
      return;
    }

    const totalKobo = txList.reduce((acc, t) => acc + (Number(t.amountKobo) || 0), 0);
    const totalFeeKobo = txList.reduce((acc, t) => acc + (Number(t.feeKobo) || 0), 0);
    const successCount = txList.filter(t => t.status === 'SUCCESS').length;
    const pendingCount = txList.filter(t => t.status === 'PENDING').length;
    const failedCount = txList.filter(t => t.status === 'FAILED').length;

    const totalNairaStr = 'NGN ' + (totalKobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 });
    const totalFeeStr = 'NGN ' + (totalFeeKobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 });
    const generatedAt = new Date().toLocaleString();

    const logo = await loadLogoDataUrl();
    const jspdfNs = window.jspdf;
    if (jspdfNs && jspdfNs.jsPDF) {
      const doc = new jspdfNs.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const addWatermark = () => {
        if (!logo) return;
        try {
          const size = 300;
          doc.saveGraphicsState();
          doc.setGState(new doc.GState({ opacity: 0.07 }));
          doc.addImage(logo, 'PNG', (pageW - size) / 2, (pageH - size) / 2, size, size);
          doc.restoreGraphicsState();
        } catch (e) { /* watermark is cosmetic */ }
      };
      if (logo) {
        try { doc.addImage(logo, 'PNG', 40, 20, 34, 34); } catch (e) { /* ignore */ }
      }
      doc.setFontSize(16);
      doc.setTextColor(13, 31, 34);
      doc.text('JEMABILL — OFFICIAL TRANSACTION REPORT', logo ? 84 : 40, 42);

      doc.setFontSize(11);
      doc.setTextColor(50, 65, 70);
      doc.text(String(reportTitle), 40, 60);
      if (reportSubtitle) {
        doc.setFontSize(9.5);
        doc.text(String(reportSubtitle), 40, 75);
      }

      doc.setFontSize(9);
      doc.setTextColor(90, 100, 105);
      doc.text(
        `Generated: ${generatedAt}   |   Records: ${txList.length} (Success: ${successCount}, Pending: ${pendingCount}, Failed: ${failedCount})   |   Total Volume: ${totalNairaStr}   |   Total Fees: ${totalFeeStr}`,
        40,
        reportSubtitle ? 92 : 78
      );

      const tableRows = txList.map((t, idx) => {
        const dt = new Date(t.createdAt || t.updatedAt || Date.now()).toLocaleString();
        const customer = [t.userName, t.userEmail || t.userEmailMasked, t.userPhone].filter(Boolean).join(' / ') || t.userId || '—';
        const amt = 'NGN ' + ((Number(t.amountKobo) || 0) / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 });
        const fee = 'NGN ' + ((Number(t.feeKobo) || 0) / 100).toFixed(2);
        return [
          String(idx + 1),
          String(t.id || '').slice(0, 13),
          dt,
          customer,
          String(t.type || '—'),
          String(t.direction || 'DEBIT'),
          String(t.provider || 'wallet'),
          amt,
          fee,
          String(t.status || '—') + (t.needsReview ? ' (REVIEW)' : ''),
          String(t.failureReason || t.externalReference || t.providerReference || '—').slice(0, 40),
        ];
      });

      if (typeof doc.autoTable === 'function') {
        doc.autoTable({
          startY: reportSubtitle ? 105 : 92,
          head: [['#', 'Tx ID', 'Date / Time', 'Customer (Name / Email / Phone)', 'Type', 'Dir', 'Provider', 'Amount', 'Fee', 'Status', 'Reference / Note']],
          body: tableRows,
          styles: { fontSize: 7.5, cellPadding: 4 },
          headStyles: { fillColor: [13, 31, 34], textColor: [255, 255, 255] },
          alternateRowStyles: { fillColor: [247, 250, 248] },
          didDrawPage: addWatermark,
        });
      }

      const safeSlug = String(reportTitle).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'transactions';
      doc.save(`${safeSlug}_${Date.now()}.pdf`);
      showToast(`Downloaded PDF (${txList.length} transactions).`);
      return;
    }

    // Fallback printable PDF window if CDN is blocked
    const win = window.open('', '_blank');
    if (!win) {
      alert('Please allow popups to download the PDF statement.');
      return;
    }
    win.document.write(`
      <html>
        <head>
          <title>${reportTitle}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #0D1F22; }
            h1 { font-size: 18px; margin-bottom: 4px; }
            p { font-size: 12px; color: #555; margin: 2px 0 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
            th { background: #0D1F22; color: #fff; }
            .wm { position: fixed; top: 50%; left: 50%; width: 380px; height: 380px; margin: -190px 0 0 -190px; opacity: 0.07; z-index: -1; }
            .hdr { display: flex; align-items: center; gap: 10px; }
            .hdr img { width: 40px; height: 40px; }
          </style>
        </head>
        <body>
          ${logo ? `<img class="wm" src="${logo}" alt="">` : ''}
          <div class="hdr">${logo ? `<img src="${logo}" alt="JemaBill">` : ''}<h1>JEMABILL — ${reportTitle}</h1></div>
          <p>${reportSubtitle || ''}</p>
          <p><strong>Records:</strong> ${txList.length} | <strong>Total Volume:</strong> ${totalNairaStr} | <strong>Total Fees:</strong> ${totalFeeStr} | <strong>Generated:</strong> ${generatedAt}</p>
          <table>
            <thead>
              <tr><th>#</th><th>Transaction ID</th><th>Date</th><th>Customer</th><th>Type</th><th>Provider</th><th>Amount</th><th>Fee</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${txList.map((t, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>${t.id}</td>
                  <td>${new Date(t.createdAt || t.updatedAt || Date.now()).toLocaleString()}</td>
                  <td>${[t.userName, t.userEmail || t.userEmailMasked, t.userPhone].filter(Boolean).join(' • ') || t.userId || '—'}</td>
                  <td>${t.type}</td>
                  <td>${t.provider || 'wallet'}</td>
                  <td>₦${((Number(t.amountKobo) || 0) / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}</td>
                  <td>₦${((Number(t.feeKobo) || 0) / 100).toFixed(2)}</td>
                  <td>${t.status}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <script>window.onload = () => { window.print(); };<\/script>
        </body>
      </html>
    `);
    win.document.close();
  };

  window.downloadUserTransactionsPdf = async function (userId, userName, userEmail, userPhone) {
    showToast('Fetching all transactions for user PDF export...');
    const res = await apiRequest(`/admin/transactions?all=true&userId=${encodeURIComponent(userId)}&limit=500`);
    let items = (res.success && res.data && res.data.items) || [];

    if (items.length === 0) {
      const uRes = await apiRequest(`/admin/users/${encodeURIComponent(userId)}`);
      if (uRes.success && uRes.data && Array.isArray(uRes.data.recentTransactions)) {
        items = uRes.data.recentTransactions.map(t => ({
          ...t,
          userName,
          userEmail,
          userPhone,
        }));
      }
    } else {
      items = items.map(t => ({
        ...t,
        userName: t.userName || userName,
        userEmail: t.userEmail || userEmail,
        userPhone: t.userPhone || userPhone,
      }));
    }

    if (items.length === 0) {
      alert(`No transactions found for ${userName || userEmail || userId}.`);
      return;
    }

    window.downloadTransactionsPdf(
      items,
      `Customer Transactions Statement — ${userName || 'Customer'}`,
      `Email: ${userEmail || '—'}   |   Phone: ${userPhone || '—'}   |   User ID: ${userId}`
    );
  };

  async function renderUsers(container) {
    const res = await apiRequest('/admin/users?limit=100');
    if (!res.success) {
      container.innerHTML = renderErrorAlert(res.error, () => renderUsers(container));
      return;
    }

    const users = (res.data && res.data.items) || [];
    cachedUsersList = users;

    container.innerHTML = `
      <div class="toolbar" style="flex-wrap:wrap; gap:12px;">
        <div class="search-box">
          <span class="material-symbols-outlined">search</span>
          <input type="text" id="users-search" placeholder="Search by name, email, phone..." oninput="window.filterUsersTable()" />
        </div>
        <div class="filters-group" style="display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
          <select class="filter-select" id="users-role-filter" onchange="window.filterUsersTable()">
            <option value="ALL">All Roles</option>
            <option value="USER">Regular Users</option>
            <option value="ADMIN">Administrators</option>
          </select>
          <select class="filter-select" id="users-kyc-filter" onchange="window.filterUsersTable()">
            <option value="ALL">All KYC Statuses</option>
            <option value="APPROVED">KYC Approved</option>
            <option value="PENDING">KYC Pending</option>
            <option value="NEEDS_REVIEW">KYC Needs Review</option>
            <option value="UNVERIFIED">KYC Unverified</option>
            <option value="REJECTED">KYC Rejected</option>
          </select>
          <button class="btn-secondary" style="width:auto; padding:8px 14px; font-size:0.82rem;" onclick="window.openSelectedUsersMessageModal()">
            <span class="material-symbols-outlined" style="font-size:1.05rem;">forward_to_inbox</span>
            <span>Email / SMS Selected Users</span>
          </button>
          <button class="btn-primary" style="width:auto; padding:8px 16px; font-size:0.82rem;" onclick="window.openCommunicationModal({ targetType: 'all' })">
            <span class="material-symbols-outlined" style="font-size:1.05rem;">campaign</span>
            <span>Broadcast to All / Group</span>
          </button>
        </div>
      </div>

      <div class="table-card">
        <table class="data-table" id="users-table">
          <thead>
            <tr>
              <th style="width:36px;">
                <input type="checkbox" id="select-all-users-cb" onchange="window.toggleSelectAllUsers(this.checked)" />
              </th>
              <th>Full Name</th>
              <th>Full Email &amp; Phone (Unredacted)</th>
              <th>Role</th>
              <th>KYC Status</th>
              <th>Verification</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${users.length === 0 ? `
              <tr>
                <td colspan="8" style="text-align: center; padding: 48px; color: var(--text-dim);">
                  No user accounts found.
                </td>
              </tr>
            ` : users.map(u => {
              const fullName = `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'User';
              const fullEmail = u.email || u.emailMasked || '—';
              const fullPhone = u.phone || u.phoneMasked || 'No phone';
              const safeNameAttr = fullName.replace(/'/g, "\\'");
              const safeEmailAttr = fullEmail.replace(/'/g, "\\'");
              const safePhoneAttr = fullPhone.replace(/'/g, "\\'");

              return `
                <tr class="clickable" data-role="${u.role}" data-kyc="${u.kycStatus || 'UNVERIFIED'}" data-search="${fullName + ' ' + fullEmail + ' ' + fullPhone + ' ' + u.id}" onclick="window.openUserDrawer('${u.id}')">
                  <td onclick="event.stopPropagation();">
                    <input type="checkbox" class="user-select-cb" value="${u.id}" data-name="${fullName}" />
                  </td>
                  <td>
                    <strong>${fullName}</strong>
                    <div style="font-size:0.75rem; color:var(--text-dim);"><code>${u.id}</code></div>
                  </td>
                  <td>
                    <div style="font-weight:600; color:var(--navy);">${fullEmail}</div>
                    <div style="font-size:0.82rem; color:var(--text-main); font-family:monospace;">${fullPhone}</div>
                  </td>
                  <td>
                    <span class="badge ${u.role === 'ADMIN' ? 'badge-warning' : 'badge-neutral'}">${u.role}</span>
                  </td>
                  <td>
                    <span class="badge ${u.kycStatus === 'APPROVED' ? 'badge-success' : u.kycStatus === 'REJECTED' ? 'badge-danger' : 'badge-neutral'}">
                      ${u.kycStatus || 'UNVERIFIED'}
                    </span>
                  </td>
                  <td>
                    <div style="font-size:0.78rem; color:${u.emailVerified ? 'var(--success)' : 'var(--text-dim)'};">
                      ${u.emailVerified ? '✓ Email Verified' : '✗ Email Unverified'}
                    </div>
                    <div style="font-size:0.78rem; color:${u.phoneVerified ? 'var(--success)' : 'var(--text-dim)'};">
                      ${u.phoneVerified ? '✓ Phone Verified' : '✗ Phone Unverified'}
                    </div>
                  </td>
                  <td style="color:var(--text-muted); font-size:0.8rem;">${new Date(u.createdAt).toLocaleDateString()}</td>
                  <td onclick="event.stopPropagation();">
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                      <button class="btn-secondary" style="padding: 5px 10px; font-size: 0.76rem;" title="Inspect Profile & Activities" onclick="window.openUserDrawer('${u.id}')">
                        Activities
                      </button>
                      <button class="btn-secondary" style="padding: 5px 10px; font-size: 0.76rem;" title="Send Email or SMS" onclick="window.openCommunicationModal({ targetType: 'single', userIds: ['${u.id}'], userLabel: '${safeNameAttr} (${safeEmailAttr} / ${safePhoneAttr})' })">
                        Email/SMS
                      </button>
                      <button class="btn-secondary" style="padding: 5px 10px; font-size: 0.76rem;" title="Download All User Transactions as PDF" onclick="window.downloadUserTransactionsPdf('${u.id}', '${safeNameAttr}', '${safeEmailAttr}', '${safePhoneAttr}')">
                        PDF
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  window.toggleSelectAllUsers = function (checked) {
    document.querySelectorAll('.user-select-cb').forEach(cb => {
      const row = cb.closest('tr');
      if (!row || row.style.display !== 'none') {
        cb.checked = checked;
      }
    });
  };

  window.openSelectedUsersMessageModal = function () {
    const selected = Array.from(document.querySelectorAll('.user-select-cb:checked'));
    if (selected.length === 0) {
      alert('Tick one or more users in the table first, or click "Broadcast to All / Group".');
      return;
    }
    const ids = selected.map(cb => cb.value);
    const names = selected.map(cb => cb.getAttribute('data-name')).slice(0, 5).join(', ') + (selected.length > 5 ? ` +${selected.length - 5} more` : '');
    window.openCommunicationModal({
      targetType: ids.length === 1 ? 'single' : 'group',
      userIds: ids,
      userLabel: `${ids.length} Selected User(s): ${names}`,
    });
  };

  window.filterUsersTable = function () {
    const search = document.getElementById('users-search')?.value.toLowerCase().trim() || '';
    const role = document.getElementById('users-role-filter')?.value || 'ALL';
    const kyc = document.getElementById('users-kyc-filter')?.value || 'ALL';
    const rows = document.querySelectorAll('#users-table tbody tr');

    rows.forEach(r => {
      const rowRole = r.getAttribute('data-role');
      const rowKyc = r.getAttribute('data-kyc');
      const rowSearch = (r.getAttribute('data-search') || '').toLowerCase();
      const matchesRole = role === 'ALL' || rowRole === role;
      const matchesKyc = kyc === 'ALL' || rowKyc === kyc;
      const matchesSearch = !search || rowSearch.includes(search);
      r.style.display = matchesRole && matchesKyc && matchesSearch ? '' : 'none';
    });
  };

  // Open User Drawer with Real Live Profile, Activities Timeline, Grouped Transactions & PDF Export
  window.openUserDrawer = async function (userId) {
    drawerTitle.textContent = `User Profile & Activities`;
    drawerBody.innerHTML = `
      <div style="padding: 32px; text-align: center; color: var(--text-dim);">
        <span class="material-symbols-outlined" style="animation: spin 1s linear infinite;">sync</span>
        <p style="margin-top: 8px;">Fetching customer profile, activities &amp; transactions...</p>
      </div>
    `;
    drawerBackdrop.classList.add('active');

    const res = await apiRequest(`/admin/users/${userId}`);
    if (!res.success) {
      drawerBody.innerHTML = `<div class="alert-box alert-error" style="display:block;">${res.error}</div>`;
      return;
    }

    const d = res.data || {};
    currentDrawerUserData = d;
    const fullName = `${d.firstName || ''} ${d.lastName || ''}`.trim() || 'User';
    const fullEmail = d.contact?.email || d.contact?.emailMasked || '—';
    const fullPhone = d.contact?.phone || d.contact?.phoneMasked || '—';
    const walletKobo = d.wallet?.balanceKobo ?? 0;
    const balanceNaira = (walletKobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 });
    const fundingAccounts = d.fundingAccounts || [];
    const recentTx = d.recentTransactions || [];
    const activities = d.activities || [];

    // Group user's transactions by category/type
    const txByType = {};
    recentTx.forEach(t => {
      const k = t.type || 'OTHER';
      if (!txByType[k]) txByType[k] = { count: 0, totalKobo: 0 };
      txByType[k].count++;
      txByType[k].totalKobo += Number(t.amountKobo) || 0;
    });

    const safeNameAttr = fullName.replace(/'/g, "\\'");
    const safeEmailAttr = fullEmail.replace(/'/g, "\\'");
    const safePhoneAttr = fullPhone.replace(/'/g, "\\'");

    drawerTitle.textContent = fullName;
    drawerBody.innerHTML = `
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px;">
        <button class="btn-primary" style="width:auto; flex:1; padding:9px 14px; font-size:0.82rem;" onclick="window.openCommunicationModal({ targetType: 'single', userIds: ['${d.id}'], userLabel: '${safeNameAttr} (${safeEmailAttr} / ${safePhoneAttr})' })">
          <span class="material-symbols-outlined" style="font-size:1.05rem;">send</span>
          <span>Send Email / SMS</span>
        </button>
        <button class="btn-secondary" style="width:auto; flex:1; padding:9px 14px; font-size:0.82rem;" onclick="window.downloadUserTransactionsPdf('${d.id}', '${safeNameAttr}', '${safeEmailAttr}', '${safePhoneAttr}')">
          <span class="material-symbols-outlined" style="font-size:1.05rem;">picture_as_pdf</span>
          <span>Download All Tx (PDF)</span>
        </button>
      </div>

      <div class="drawer-section">
        <div class="section-label">Customer Identity &amp; Contact (Unredacted)</div>
        <div class="detail-row"><span>User ID</span><span><code>${d.id}</code></span></div>
        <div class="detail-row"><span>Full Name</span><span><strong>${fullName}</strong></span></div>
        <div class="detail-row"><span>Email Address</span><span style="font-weight:600; color:var(--navy);">${fullEmail} (${d.contact?.emailVerified ? 'Verified' : 'Unverified'})</span></div>
        <div class="detail-row"><span>Phone Number</span><span style="font-weight:600; font-family:monospace; color:var(--navy);">${fullPhone} (${d.contact?.phoneVerified ? 'Verified' : 'Unverified'})</span></div>
        <div class="detail-row"><span>KYC Status</span><span class="badge ${d.kyc?.status === 'APPROVED' ? 'badge-success' : 'badge-neutral'}">${d.kyc?.status || 'NONE'} (Tier ${d.kyc?.tier || 0})</span></div>
        <div class="detail-row"><span>Wallet Balance</span><span style="font-size:1.15rem; color:var(--navy); font-weight:700;">₦${balanceNaira}</span></div>
        <div class="detail-row"><span>Security Flags</span><span>${d.flags?.pinSet ? 'PIN Active' : 'No PIN'} • ${d.flags?.pinLocked ? '<strong style="color:var(--danger);">LOCKED</strong>' : 'Unlocked'}</span></div>
        <div class="detail-row"><span>Joined Date</span><span>${new Date(d.createdAt).toLocaleString()}</span></div>
      </div>

      <div class="drawer-section">
        <div class="section-label">Dedicated Virtual Funding Accounts</div>
        ${fundingAccounts.length === 0 ? `
          <div style="font-size: 0.85rem; color: var(--text-dim); background: var(--bg-app); padding: 12px; border-radius: var(--radius-sm);">
            No dedicated virtual accounts assigned yet.
          </div>
        ` : fundingAccounts.map(fa => `
          <div style="background:var(--bg-app); padding:14px; border-radius:var(--radius-sm); border:1px solid var(--border-color); display:flex; flex-direction:column; gap:6px; margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-weight:600; color:var(--navy);">${fa.bankName} (${fa.provider})</span>
              <span class="badge badge-success">Active</span>
            </div>
            <div style="font-family:monospace; font-size:1.1rem; color:var(--navy); font-weight:700;">${fa.accountNumber}</div>
            <div style="font-size:0.75rem; color:var(--text-dim);">${fa.accountName}</div>
          </div>
        `).join('')}
      </div>

      <div class="drawer-section">
        <div class="section-label">User Activity Summary by Service Group</div>
        ${Object.keys(txByType).length === 0 ? `
          <div style="font-size:0.84rem; color:var(--text-dim);">No service activity yet.</div>
        ` : `
          <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:8px;">
            ${Object.entries(txByType).map(([type, info]) => `
              <div style="background:var(--bg-app); padding:10px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <div style="font-weight:700; font-size:0.78rem; color:var(--navy);">${type}</div>
                  <div style="font-size:0.72rem; color:var(--text-dim);">${info.count} tx(s)</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-weight:700; font-size:0.84rem; color:var(--primary);">₦${(info.totalKobo / 100).toLocaleString('en-NG')}</div>
                  <button class="btn-secondary" style="padding:2px 6px; font-size:0.68rem; margin-top:3px;" onclick="window.downloadCurrentDrawerUserGroupPdf('${type}')">PDF</button>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <div class="drawer-section">
        <div class="section-label">Chronological User Activity Timeline (${activities.length})</div>
        ${activities.length === 0 ? `
          <div style="font-size: 0.85rem; color: var(--text-dim); background: var(--bg-app); padding: 12px; border-radius: var(--radius-sm);">
            No activity events recorded.
          </div>
        ` : `
          <div style="max-height: 260px; overflow-y: auto; display:flex; flex-direction:column; gap:8px; padding-right:4px;">
            ${activities.map(act => `
              <div style="background:var(--bg-app); padding:10px 12px; border-radius:var(--radius-sm); border-left:3px solid ${act.status === 'SUCCESS' || act.status === 'COMPLETED' || act.status === 'APPROVED' ? 'var(--primary)' : act.status === 'FAILED' || act.status === 'REJECTED' ? 'var(--danger)' : 'var(--warning)'};">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-weight:700; font-size:0.78rem; color:var(--navy);">${act.type} • ${act.action}</span>
                  <span class="badge ${act.status === 'SUCCESS' || act.status === 'COMPLETED' || act.status === 'APPROVED' ? 'badge-success' : act.status === 'FAILED' || act.status === 'REJECTED' ? 'badge-danger' : 'badge-warning'}" style="font-size:0.68rem;">${act.status}</span>
                </div>
                <div style="font-size:0.8rem; color:var(--text-main); margin-top:3px;">${act.description}</div>
                <div style="font-size:0.72rem; color:var(--text-dim); margin-top:2px;">${new Date(act.createdAt).toLocaleString()}</div>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <div class="drawer-section">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div class="section-label" style="margin-bottom:0;">Customer Transactions (${recentTx.length})</div>
          <button class="btn-secondary" style="padding:4px 10px; font-size:0.75rem;" onclick="window.downloadUserTransactionsPdf('${d.id}', '${safeNameAttr}', '${safeEmailAttr}', '${safePhoneAttr}')">
            Export All (PDF)
          </button>
        </div>
        ${recentTx.length === 0 ? `
          <div style="font-size: 0.85rem; color: var(--text-dim); background: var(--bg-app); padding: 12px; border-radius: var(--radius-sm);">
            No transaction records.
          </div>
        ` : `
          <table class="data-table" style="font-size:0.8rem;">
            <thead>
              <tr>
                <th>Type</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              ${recentTx.map(t => `
                <tr class="clickable" onclick="window.inspectTx('${t.id}')">
                  <td><strong>${t.type}</strong><div style="font-size:0.7rem; color:var(--text-dim);">${t.provider || 'wallet'}</div></td>
                  <td>₦${((t.amountKobo || 0) / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}</td>
                  <td><span class="badge ${t.status === 'SUCCESS' ? 'badge-success' : t.status === 'FAILED' ? 'badge-danger' : 'badge-warning'}">${t.status}</span></td>
                  <td style="color:var(--text-dim);">${new Date(t.createdAt).toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </div>
    `;
  };

  window.downloadCurrentDrawerUserGroupPdf = function (type) {
    if (!currentDrawerUserData) return;
    const d = currentDrawerUserData;
    const fullName = `${d.firstName || ''} ${d.lastName || ''}`.trim() || 'Customer';
    const fullEmail = d.contact?.email || d.contact?.emailMasked || '—';
    const fullPhone = d.contact?.phone || d.contact?.phoneMasked || '—';
    const list = (d.recentTransactions || [])
      .filter(t => t.type === type)
      .map(t => ({ ...t, userName: fullName, userEmail: fullEmail, userPhone: fullPhone }));
    window.downloadTransactionsPdf(
      list,
      `${fullName} — ${type} Transactions`,
      `Email: ${fullEmail} | Phone: ${fullPhone}`
    );
  };

  // ==========================================
  // 3B. Admin Email & SMS Broadcast Center
  // ==========================================
  async function renderMessaging(container) {
    const res = await apiRequest('/admin/users?limit=100');
    const users = (res.success && res.data && res.data.items) || cachedUsersList || [];
    cachedUsersList = users;

    container.innerHTML = `
      <div class="table-card" style="padding: 24px; margin-bottom: 24px;">
        <div style="margin-bottom: 20px;">
          <h3 style="font-family:var(--font-heading); font-size:1.2rem; color:var(--navy);">
            Send Email &amp; SMS Notifications (Single User, Group of Users, or All Users)
          </h3>
          <p style="font-size:0.84rem; color:var(--text-dim); margin-top:4px;">
            Deliver transactional or operational messages via SMTP Email and/or Hollatags SMS. You can use <code>{firstName}</code> or <code>{name}</code> in your message to personalize emails.
          </p>
        </div>

        <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:18px; margin-bottom:18px;">
          <div class="form-field" style="margin-bottom:0;">
            <label>Delivery Channels</label>
            <div style="display:flex; gap:18px; padding:10px 14px; background:var(--bg-input); border:1.5px solid var(--border-color); border-radius:var(--radius-sm);">
              <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:600; color:var(--navy);">
                <input type="checkbox" id="comm-ch-email" checked />
                <span>Email (SMTP)</span>
              </label>
              <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:600; color:var(--navy);">
                <input type="checkbox" id="comm-ch-sms" checked />
                <span>SMS (Hollatags)</span>
              </label>
            </div>
          </div>

          <div class="form-field" style="margin-bottom:0;">
            <label>Recipient Target Audience</label>
            <select id="comm-target-type" class="filter-select" style="width:100%; height:42px;" onchange="window.toggleCommTargetMode()">
              <option value="single">Single User</option>
              <option value="group">Group of Users (by Filter or Multi-Select)</option>
              <option value="all">All Registered Users (${users.length})</option>
            </select>
          </div>
        </div>

        <!-- Single User Selector -->
        <div id="comm-single-box" class="form-field">
          <label>Select User</label>
          <select id="comm-single-user" class="filter-select" style="width:100%; height:42px;">
            ${users.map(u => {
              const name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'User';
              const email = u.email || u.emailMasked || '—';
              const phone = u.phone || u.phoneMasked || 'No phone';
              return `<option value="${u.id}">${name} — ${email} (${phone})</option>`;
            }).join('')}
          </select>
        </div>

        <!-- Group Selector -->
        <div id="comm-group-box" class="form-field" style="display:none;">
          <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:16px; margin-bottom:12px;">
            <div>
              <label>Filter Group by KYC Status</label>
              <select id="comm-group-kyc" class="filter-select" style="width:100%; height:42px;">
                <option value="ALL">Any KYC Status</option>
                <option value="APPROVED">KYC Approved Users</option>
                <option value="PENDING">KYC Pending Users</option>
                <option value="NEEDS_REVIEW">KYC Needs Review Users</option>
                <option value="UNVERIFIED">Unverified KYC Users</option>
                <option value="REJECTED">Rejected KYC Users</option>
              </select>
            </div>
            <div>
              <label>Filter Group by Account Role</label>
              <select id="comm-group-role" class="filter-select" style="width:100%; height:42px;">
                <option value="ALL">Any Role</option>
                <option value="USER">Regular Customers (USER)</option>
                <option value="ADMIN">Administrators (ADMIN)</option>
              </select>
            </div>
          </div>
          <label>Or Hand-Pick Specific Users in Group (Optional — leave unchecked to use the filters above)</label>
          <div style="max-height:180px; overflow-y:auto; border:1.5px solid var(--border-color); border-radius:var(--radius-sm); padding:10px; background:var(--bg-input); display:grid; grid-template-columns: repeat(2, 1fr); gap:8px;">
            ${users.map(u => {
              const name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'User';
              const email = u.email || u.emailMasked || '—';
              const phone = u.phone || u.phoneMasked || '';
              return `
                <label style="display:flex; align-items:center; gap:6px; font-size:0.8rem; cursor:pointer;">
                  <input type="checkbox" class="comm-group-user-cb" value="${u.id}" />
                  <span><strong>${name}</strong> (${email}${phone ? ' • ' + phone : ''})</span>
                </label>
              `;
            }).join('')}
          </div>
        </div>

        <div class="form-field">
          <label>Email Subject (used when Email channel is active)</label>
          <input type="text" id="comm-subject" value="Important Update from JemaBill" placeholder="Enter email subject..." style="width:100%; background:var(--bg-input); border:1.5px solid var(--border-color); border-radius:var(--radius-sm); padding:10px 12px; color:var(--text-main);" />
        </div>

        <div class="form-field">
          <label>Message Body (Sent via selected channels)</label>
          <textarea id="comm-message" class="reason-textarea" style="min-height:120px;" placeholder="Hello {firstName}, write your email / SMS message here..."></textarea>
        </div>

        <div style="display:flex; justify-content:flex-end;">
          <button class="btn-primary" id="comm-send-btn" style="width:auto; padding:12px 28px;" onclick="window.submitCommunicationForm()">
            <span class="material-symbols-outlined">send</span>
            <span>Dispatch Message Now</span>
          </button>
        </div>
      </div>
    `;
  }

  window.toggleCommTargetMode = function () {
    const mode = document.getElementById('comm-target-type')?.value || 'single';
    const singleBox = document.getElementById('comm-single-box');
    const groupBox = document.getElementById('comm-group-box');
    if (singleBox) singleBox.style.display = mode === 'single' ? '' : 'none';
    if (groupBox) groupBox.style.display = mode === 'group' ? '' : 'none';
  };

  window.submitCommunicationForm = async function () {
    const emailChecked = document.getElementById('comm-ch-email')?.checked;
    const smsChecked = document.getElementById('comm-ch-sms')?.checked;
    const channels = [];
    if (emailChecked) channels.push('email');
    if (smsChecked) channels.push('sms');

    if (channels.length === 0) {
      alert('Please select at least one delivery channel (Email or SMS).');
      return;
    }

    const targetType = document.getElementById('comm-target-type')?.value || 'single';
    const subject = document.getElementById('comm-subject')?.value?.trim() || 'Important Update from JemaBill';
    const message = document.getElementById('comm-message')?.value?.trim() || '';

    if (!message) {
      alert('Please enter a message body.');
      return;
    }

    let userIds = [];
    let kycStatus = undefined;
    let role = undefined;

    if (targetType === 'single') {
      const uid = document.getElementById('comm-single-user')?.value;
      if (!uid) {
        alert('Please select a user.');
        return;
      }
      userIds = [uid];
    } else if (targetType === 'group') {
      userIds = Array.from(document.querySelectorAll('.comm-group-user-cb:checked')).map(cb => cb.value);
      kycStatus = document.getElementById('comm-group-kyc')?.value;
      role = document.getElementById('comm-group-role')?.value;
    }

    const btn = document.getElementById('comm-send-btn');
    if (btn) btn.disabled = true;

    const res = await apiRequest('/admin/communications/send', {
      method: 'POST',
      body: JSON.stringify({ channels, targetType, userIds, kycStatus, role, subject, message }),
    });

    if (btn) btn.disabled = false;

    if (!res.success) {
      alert(`Failed to send communication: ${res.error}`);
      return;
    }

    const d = res.data || {};
    showToast(`Sent to ${d.totalRecipients || 0} recipient(s) — Emails: ${d.sentEmails || 0}, SMS: ${d.sentSms || 0}`);
    const msgInput = document.getElementById('comm-message');
    if (msgInput) msgInput.value = '';
  };

  window.openCommunicationModal = function (preset = {}) {
    const targetType = preset.targetType || 'single';
    const userIds = preset.userIds || [];
    const userLabel = preset.userLabel || (targetType === 'all' ? 'All Registered Users' : 'Selected Group');

    modalTitle.textContent = `Send Email & SMS Notification`;
    modalBody.innerHTML = `
      <div style="background:var(--bg-app); padding:12px 14px; border-radius:var(--radius-sm); border:1px solid var(--border-color); margin-bottom:14px;">
        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:700;">Target Audience (${targetType.toUpperCase()})</div>
        <div style="font-size:0.9rem; font-weight:600; color:var(--navy); margin-top:2px;">${userLabel}</div>
      </div>

      <div class="form-field">
        <label>Channels</label>
        <div style="display:flex; gap:16px;">
          <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:600;">
            <input type="checkbox" id="modal-comm-email" checked /> Email (SMTP)
          </label>
          <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:600;">
            <input type="checkbox" id="modal-comm-sms" checked /> SMS (Hollatags)
          </label>
        </div>
      </div>

      ${userIds.length === 0 ? `
        <div class="form-field">
          <label>Target Group Filter</label>
          <select id="modal-comm-kyc" class="filter-select" style="width:100%; height:40px;">
            <option value="ALL">All Users (Any KYC Status)</option>
            <option value="APPROVED">Only KYC Approved Users</option>
            <option value="UNVERIFIED">Only Unverified KYC Users</option>
            <option value="PENDING">Only KYC Pending Users</option>
          </select>
        </div>
      ` : ''}

      <div class="form-field">
        <label>Email Subject</label>
        <input type="text" id="modal-comm-subject" value="Important Update from JemaBill" style="width:100%; background:var(--bg-input); border:1.5px solid var(--border-color); border-radius:var(--radius-sm); padding:10px; color:var(--text-main);" />
      </div>

      <div class="form-field">
        <label>Message Body (Supports <code>{firstName}</code> placeholder)</label>
        <textarea id="modal-comm-message" class="reason-textarea" style="min-height:110px;" placeholder="Type your email and/or SMS message here..."></textarea>
      </div>
    `;

    window._pendingModalComm = { targetType, userIds };

    modalFooter.innerHTML = `
      <button class="btn-secondary" onclick="window.closeModal()">Cancel</button>
      <button class="btn-primary" style="width:auto;" onclick="window.sendModalCommunication()">
        <span class="material-symbols-outlined">send</span>
        <span>Send Message</span>
      </button>
    `;
    modalBackdrop.classList.add('active');
  };

  window.sendModalCommunication = async function () {
    const pending = window._pendingModalComm || { targetType: 'all', userIds: [] };
    const emailChecked = document.getElementById('modal-comm-email')?.checked;
    const smsChecked = document.getElementById('modal-comm-sms')?.checked;
    const channels = [];
    if (emailChecked) channels.push('email');
    if (smsChecked) channels.push('sms');
    if (channels.length === 0) {
      alert('Select at least one channel (Email or SMS).');
      return;
    }

    const subject = document.getElementById('modal-comm-subject')?.value?.trim() || 'Important Update from JemaBill';
    const message = document.getElementById('modal-comm-message')?.value?.trim() || '';
    if (!message) {
      alert('Enter a message body.');
      return;
    }

    const kycEl = document.getElementById('modal-comm-kyc');
    const kycStatus = kycEl ? kycEl.value : undefined;
    const effectiveTarget = pending.userIds.length > 0
      ? pending.targetType
      : (kycStatus && kycStatus !== 'ALL' ? 'group' : 'all');

    const res = await apiRequest('/admin/communications/send', {
      method: 'POST',
      body: JSON.stringify({
        channels,
        targetType: effectiveTarget,
        userIds: pending.userIds,
        kycStatus,
        subject,
        message,
      }),
    });

    if (!res.success) {
      alert(`Failed to send: ${res.error}`);
      return;
    }

    closeModal();
    const d = res.data || {};
    showToast(`Dispatched to ${d.totalRecipients || 0} user(s) — Emails: ${d.sentEmails || 0}, SMS: ${d.sentSms || 0}`);
  };

  // ==========================================
  // 4. Transactions Screen (With Grouping & PDF Download)
  // ==========================================
  async function renderTransactions(container) {
    const res = await apiRequest('/admin/transactions?all=true&limit=300');
    if (!res.success) {
      container.innerHTML = renderErrorAlert(res.error, () => renderTransactions(container));
      return;
    }

    const txs = (res.data && res.data.items) || [];
    cachedAllTransactions = txs;

    container.innerHTML = `
      <div class="toolbar" style="flex-wrap:wrap; gap:12px;">
        <div class="search-box">
          <span class="material-symbols-outlined">search</span>
          <input type="text" id="tx-search" placeholder="Search by ID, email, phone, name, provider..." oninput="window.refreshTransactionsView()" />
        </div>
        <div class="filters-group" style="display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
          <select class="filter-select" id="tx-group-by" onchange="window.refreshTransactionsView()">
            <option value="NONE">Group By: None (All List)</option>
            <option value="TYPE">Group By: Service / Type</option>
            <option value="USER">Group By: Customer / User</option>
            <option value="STATUS">Group By: Status</option>
            <option value="PROVIDER">Group By: Provider</option>
            <option value="DATE">Group By: Date</option>
          </select>

          <select class="filter-select" id="tx-status-filter" onchange="window.refreshTransactionsView()">
            <option value="ALL">All Statuses</option>
            <option value="SUCCESS">Success</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
            <option value="REVIEW">Needs Review</option>
          </select>

          <select class="filter-select" id="tx-type-filter" onchange="window.refreshTransactionsView()">
            <option value="ALL">All Categories</option>
            <option value="ELECTRICITY">Electricity</option>
            <option value="DATA">Data Bundle</option>
            <option value="AIRTIME">Airtime</option>
            <option value="CABLE_TV">Cable TV</option>
            <option value="EXAM_PIN">Exam PIN</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
            <option value="WALLET_FUNDING">Wallet Funding</option>
            <option value="BETTING_FUNDING">Betting Funding</option>
            <option value="BULK_SMS">Bulk SMS</option>
          </select>

          <button class="btn-secondary" style="width:auto; padding:8px 14px; font-size:0.8rem;" onclick="window.downloadSelectedTxPdf()">
            <span class="material-symbols-outlined" style="font-size:1.05rem;">checklist</span>
            <span>Download Selected (PDF)</span>
          </button>

          <button class="btn-primary" style="width:auto; padding:8px 16px; font-size:0.8rem;" onclick="window.downloadFilteredTxPdf()">
            <span class="material-symbols-outlined" style="font-size:1.05rem;">picture_as_pdf</span>
            <span>Download Filtered Group (PDF)</span>
          </button>
        </div>
      </div>

      <div id="tx-groups-container"></div>
    `;

    window.refreshTransactionsView();
  }

  function getFilteredTransactions() {
    const search = document.getElementById('tx-search')?.value.toLowerCase().trim() || '';
    const status = document.getElementById('tx-status-filter')?.value || 'ALL';
    const type = document.getElementById('tx-type-filter')?.value || 'ALL';

    return cachedAllTransactions.filter(t => {
      const matchesStatus =
        status === 'ALL' ||
        (status === 'REVIEW' ? Boolean(t.needsReview) : t.status === status);
      const matchesType = type === 'ALL' || t.type === type;
      const haystack = [
        t.id,
        t.type,
        t.userName,
        t.userEmail,
        t.userEmailMasked,
        t.userPhone,
        t.provider,
        t.externalReference,
        t.providerReference,
        t.failureReason,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const matchesSearch = !search || haystack.includes(search);
      return matchesStatus && matchesType && matchesSearch;
    });
  }

  window.refreshTransactionsView = function () {
    const holder = document.getElementById('tx-groups-container');
    if (!holder) return;

    const groupBy = document.getElementById('tx-group-by')?.value || 'NONE';
    const filtered = getFilteredTransactions();

    if (filtered.length === 0) {
      holder.innerHTML = `
        <div class="table-card" style="padding: 48px; text-align: center; color: var(--text-dim);">
          No transactions match your current filter criteria.
        </div>
      `;
      return;
    }

    const groupsMap = new Map();
    filtered.forEach(t => {
      let key = 'All Transactions';
      let label = 'All Matching Transactions';
      if (groupBy === 'TYPE') {
        key = t.type || 'OTHER';
        label = `Service Category: ${key}`;
      } else if (groupBy === 'USER') {
        key = t.userId || t.userEmail || 'Unknown';
        const customerDesc = [t.userName, t.userEmail || t.userEmailMasked, t.userPhone].filter(Boolean).join(' • ') || key;
        label = `Customer: ${customerDesc}`;
      } else if (groupBy === 'STATUS') {
        key = t.status + (t.needsReview ? '_REVIEW' : '');
        label = `Status: ${t.status}${t.needsReview ? ' (Needs Review)' : ''}`;
      } else if (groupBy === 'PROVIDER') {
        key = t.provider || 'internal';
        label = `Provider: ${key.toUpperCase()}`;
      } else if (groupBy === 'DATE') {
        key = new Date(t.createdAt || t.updatedAt || Date.now()).toLocaleDateString();
        label = `Date: ${key}`;
      }
      if (!groupsMap.has(key)) {
        groupsMap.set(key, { key, label, items: [], totalKobo: 0 });
      }
      const g = groupsMap.get(key);
      g.items.push(t);
      g.totalKobo += Number(t.amountKobo) || 0;
    });

    window._currentTxGroups = Object.fromEntries(groupsMap.entries());

    holder.innerHTML = Array.from(groupsMap.values())
      .map((g, gIdx) => {
        const totalNaira = (g.totalKobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 });
        const safeKeyAttr = String(g.key).replace(/'/g, "\\'");
        return `
          <div class="table-card" style="margin-bottom: 20px;">
            <div style="padding: 14px 20px; background: #FAFBFA; border-bottom: 1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
              <div>
                <h3 style="font-family:var(--font-heading); font-size:1.02rem; color:var(--navy);">${g.label}</h3>
                <span style="font-size:0.78rem; color:var(--text-dim);">
                  <strong>${g.items.length}</strong> transaction(s) • Total Volume: <strong style="color:var(--primary);">₦${totalNaira}</strong>
                </span>
              </div>
              <button class="btn-secondary" style="padding: 6px 14px; font-size: 0.78rem;" onclick="window.downloadTxGroupKeyPdf('${safeKeyAttr}')">
                <span class="material-symbols-outlined" style="font-size:1rem;">picture_as_pdf</span>
                <span>Download Group PDF (${g.items.length})</span>
              </button>
            </div>
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width:34px;">
                    <input type="checkbox" onchange="window.toggleTxGroupCheckboxes(${gIdx}, this.checked)" />
                  </th>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Customer (Email &amp; Phone)</th>
                  <th>Amount</th>
                  <th>Fee</th>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${g.items.map(t => {
                  const email = t.userEmail || t.userEmailMasked || '—';
                  const phone = t.userPhone || '';
                  const name = t.userName || '';
                  return `
                    <tr class="clickable" onclick="window.inspectTx('${t.id}')">
                      <td onclick="event.stopPropagation();">
                        <input type="checkbox" class="tx-select-cb tx-group-cb-${gIdx}" value="${t.id}" />
                      </td>
                      <td><code>${t.id.slice(0, 8)}...</code></td>
                      <td><strong>${t.type}</strong></td>
                      <td>
                        ${name ? `<div style="font-weight:600; color:var(--navy);">${name}</div>` : ''}
                        <div style="font-size:0.82rem; color:var(--navy);">${email}</div>
                        ${phone ? `<div style="font-size:0.76rem; color:var(--text-dim); font-family:monospace;">${phone}</div>` : ''}
                      </td>
                      <td><strong style="color:var(--navy);">₦${((t.amountKobo || 0) / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}</strong></td>
                      <td>₦${((t.feeKobo || 0) / 100).toFixed(2)}</td>
                      <td><span class="badge badge-neutral">${t.provider || 'internal'}</span></td>
                      <td>
                        <span class="badge ${t.status === 'SUCCESS' ? 'badge-success' : t.status === 'FAILED' ? 'badge-danger' : 'badge-warning'}">
                          ${t.status}
                        </span>
                        ${t.needsReview ? '<span class="badge badge-danger" style="margin-left:4px;">REVIEW</span>' : ''}
                      </td>
                      <td style="color:var(--text-muted); font-size:0.8rem;">${new Date(t.createdAt || t.updatedAt).toLocaleString()}</td>
                      <td onclick="event.stopPropagation();">
                        <button class="btn-secondary" style="padding: 5px 10px; font-size: 0.76rem;" onclick="window.inspectTx('${t.id}')">
                          Inspect
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;
      })
      .join('');
  };

  window.toggleTxGroupCheckboxes = function (groupIdx, checked) {
    document.querySelectorAll(`.tx-group-cb-${groupIdx}`).forEach(cb => {
      cb.checked = checked;
    });
  };

  window.downloadTxGroupKeyPdf = function (key) {
    const g = window._currentTxGroups && window._currentTxGroups[key];
    if (!g || !g.items.length) return;
    window.downloadTransactionsPdf(g.items, `Transaction Group Report — ${g.label}`, `Group Key: ${key} | Total Records: ${g.items.length}`);
  };

  window.downloadFilteredTxPdf = function () {
    const filtered = getFilteredTransactions();
    const groupBy = document.getElementById('tx-group-by')?.value || 'NONE';
    const status = document.getElementById('tx-status-filter')?.value || 'ALL';
    const type = document.getElementById('tx-type-filter')?.value || 'ALL';
    window.downloadTransactionsPdf(
      filtered,
      `JemaBill Filtered Transactions Report`,
      `Status Filter: ${status} | Category Filter: ${type} | Grouped By: ${groupBy}`
    );
  };

  window.downloadSelectedTxPdf = function () {
    const checkedIds = new Set(Array.from(document.querySelectorAll('.tx-select-cb:checked')).map(cb => cb.value));
    if (checkedIds.size === 0) {
      alert('Tick one or more transactions in the table first, or click "Download Filtered Group (PDF)".');
      return;
    }
    const selected = cachedAllTransactions.filter(t => checkedIds.has(t.id));
    window.downloadTransactionsPdf(selected, `JemaBill Selected Transactions Report (${selected.length} items)`);
  };

  window.filterTxTable = window.refreshTransactionsView;

  // Inspect Transaction Details with Live History Audit Trail
  window.inspectTx = async function (txId) {
    drawerTitle.textContent = `Transaction Inspection`;
    drawerBody.innerHTML = `
      <div style="padding: 32px; text-align: center; color: var(--text-dim);">
        <span class="material-symbols-outlined" style="animation: spin 1s linear infinite;">sync</span>
        <p style="margin-top: 8px;">Fetching transaction history & provider data...</p>
      </div>
    `;
    drawerBackdrop.classList.add('active');

    const res = await apiRequest(`/admin/transactions/${txId}`);
    if (!res.success) {
      drawerBody.innerHTML = `<div class="alert-box alert-error" style="display:block;">${res.error}</div>`;
      return;
    }

    const tx = res.data || {};
    const history = tx.history || [];

    drawerTitle.textContent = `Transaction: ${tx.id.slice(0, 8)}...`;
    drawerBody.innerHTML = `
      <div class="drawer-section">
        <div class="section-label">Transaction Details</div>
        <div class="detail-row"><span>ID / UUID</span><span><code>${tx.id}</code></span></div>
        <div class="detail-row"><span>Customer</span><span>${tx.userEmail || tx.userEmailMasked || '—'}</span></div>
        <div class="detail-row"><span>Type</span><span><span class="badge badge-neutral">${tx.type}</span></span></div>
        <div class="detail-row"><span>Status</span><span><span class="badge ${tx.status === 'SUCCESS' ? 'badge-success' : 'badge-warning'}">${tx.status}</span></span></div>
        <div class="detail-row"><span>Amount</span><span style="font-size:1.1rem; color:var(--navy); font-weight:700;">₦${((tx.amountKobo || 0) / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}</span></div>
        <div class="detail-row"><span>Fee</span><span>₦${((tx.feeKobo || 0) / 100).toFixed(2)}</span></div>
        <div class="detail-row"><span>Provider</span><span>${tx.provider || 'internal'}</span></div>
        <div class="detail-row"><span>External Reference</span><span><code>${tx.externalReference || tx.providerReference || '—'}</code></span></div>
        <div class="detail-row"><span>Requery Attempts</span><span>${tx.requeryAttempts || 0}</span></div>
      </div>

      ${tx.metadata && Object.keys(tx.metadata).length > 0 ? `
        <div class="drawer-section">
          <div class="section-label">Observability & Metadata</div>
          <div style="background:var(--bg-app); padding:12px; border-radius:var(--radius-sm); border:1px solid var(--border-color); font-size:0.85rem; display:flex; flex-direction:column; gap:6px;">
            ${Object.entries(tx.metadata).map(([k, v]) => `
              <div style="display:flex; justify-content:space-between; gap:12px; word-break:break-all;">
                <span style="color:var(--text-dim); font-weight:500;">${k}</span>
                <span style="font-weight:600; color:var(--navy); text-align:right;">${typeof v === 'object' && v !== null ? JSON.stringify(v) : v}</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <div class="drawer-section">
        <div class="section-label">Audit & Lifecycle History</div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${history.length === 0 ? `
            <div style="font-size:0.85rem; color:var(--text-dim);">No state transitions recorded.</div>
          ` : history.map(h => `
            <div style="background:var(--bg-app); padding:10px 14px; border-radius:var(--radius-sm); border:1px solid var(--border-color); font-size:0.82rem;">
              <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span class="badge badge-info">${h.action}</span>
                <span style="color:var(--text-dim);">${new Date(h.createdAt).toLocaleTimeString()}</span>
              </div>
              <div style="color:var(--text-main); font-weight:500;">${h.after?.reason || h.actorId}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="drawer-section">
        <div class="section-label">Operational Interventions</div>
        <div style="display:flex; flex-direction:column; gap:10px; margin-top:8px;">
          <button class="btn-secondary" onclick="window.requeryTx('${tx.id}')">
            <span class="material-symbols-outlined">sync</span> Requery Provider
          </button>
          <button class="btn-secondary" onclick="window.parkTx('${tx.id}')">
            <span class="material-symbols-outlined">pause</span> Park for Review
          </button>
        </div>
      </div>
    `;
  };

  window.requeryTx = async function (txId) {
    const res = await apiRequest(`/admin/transactions/${txId}/requery`, { method: 'POST' });
    if (!res.success) {
      alert(`Requery failed: ${res.error}`);
      return;
    }
    showToast(`Requery dispatched for ${txId.slice(0, 8)}`);
    closeDrawer();
    renderView('transactions');
  };

  window.parkTx = async function (txId) {
    const reason = prompt('State reason for parking transaction (min 5 chars):', 'Awaiting provider confirmation');
    if (!reason || reason.trim().length < 5) return;

    const res = await apiRequest(`/admin/transactions/${txId}/park`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
    if (!res.success) {
      alert(`Park failed: ${res.error}`);
      return;
    }
    showToast(`Transaction parked for manual review`);
    closeDrawer();
    renderView('transactions');
  };

  // ==========================================
  // 5. Funding & Absorbed Fees Screen
  // ==========================================
  async function renderFunding(container) {
    const [depRes, summaryRes, settingsRes] = await Promise.all([
      apiRequest('/admin/funding/deposits'),
      apiRequest('/admin/funding/fees-summary'),
      apiRequest('/admin/settings')
    ]);

    if (!depRes.success) {
      container.innerHTML = renderErrorAlert(depRes.error, () => renderFunding(container));
      return;
    }

    if (settingsRes && settingsRes.success) {
      cachedSettings = normalizeSettingsData(settingsRes.data);
    }

    const deposits = (depRes.data && depRes.data.items) || [];
    const summary = summaryRes.data || {};
    const totalAbsorbedNaira = ((summary.totalAbsorbedFeeKobo || 0) / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 });
    const totalDeposits = summary.totalDepositCount || deposits.length;

    container.innerHTML = `
      ${renderBillFeesConfiguratorHtml(cachedSettings, 'funding')}

      <div class="kpi-grid" style="grid-template-columns: repeat(3, 1fr); margin-bottom: 24px;">
        <div class="kpi-card">
          <span class="kpi-label">Total Absorbed Fees</span>
          <div class="kpi-val" style="color:var(--primary);">₦${totalAbsorbedNaira}</div>
          <div class="kpi-sub">Cost of 100% free deposit funding for customers</div>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Recorded Inbound Deposits</span>
          <div class="kpi-val">${totalDeposits.toLocaleString()}</div>
          <div class="kpi-sub">Across Monnify & PaymentPoint</div>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Active Funding Providers</span>
          <div class="kpi-val">${(summary.perProvider || []).length}</div>
          <div class="kpi-sub">Automated sweep & real-time webhook routing</div>
        </div>
      </div>

      <div class="table-card">
        <table class="data-table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Provider</th>
              <th>Customer</th>
              <th>Gross Sent</th>
              <th>Fee Absorbed</th>
              <th>Status</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            ${deposits.length === 0 ? `
              <tr>
                <td colspan="7" style="text-align: center; padding: 48px; color: var(--text-dim);">
                  No deposit records found in this window.
                </td>
              </tr>
            ` : deposits.map(d => `
              <tr>
                <td><code>${d.externalReference || d.id.slice(0, 12)}</code></td>
                <td><strong>${d.provider}</strong></td>
                <td>${d.userEmail || d.userEmailMasked || '—'}</td>
                <td><strong style="color:var(--navy);">₦${((d.grossKobo || 0) / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}</strong></td>
                <td><span style="color:var(--primary); font-weight:600;">₦${((d.providerFeeKobo || 0) / 100).toFixed(2)}</span></td>
                <td><span class="badge ${d.status === 'SUCCESS' ? 'badge-success' : 'badge-warning'}">${d.status}</span></td>
                <td style="color:var(--text-dim); font-size:0.8rem;">${new Date(d.createdAt).toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ==========================================
  // 6. Provider Health Screen
  // ==========================================
  async function renderProviders(container) {
    const res = await apiRequest('/admin/providers/health');
    if (!res.success) {
      container.innerHTML = renderErrorAlert(res.error, () => renderProviders(container));
      return;
    }

    const data = res.data || {};
    const providers = data.providers || [];

    container.innerHTML = `
      <div class="providers-grid">
        ${providers.map(p => {
          const meta = PROVIDER_METADATA[p.provider] || { name: p.provider, type: 'Integration', icon: 'dns' };
          const isOperational = p.enabled && (p.balance != null || p.balanceUnavailableReason === 'no_balance_endpoint' || p.balanceUnavailableReason === 'no_reading_yet');
          const lastSuccess = p.lastSuccessfulTransactionAt
            ? new Date(p.lastSuccessfulTransactionAt).toLocaleString()
            : 'No transactions yet';

          let balanceDisplay = '—';
          if (p.balance && p.balance.kobo != null) {
            balanceDisplay = `₦${(p.balance.kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
          } else if (p.balanceUnavailableReason === 'no_balance_endpoint') {
            balanceDisplay = 'Third-party API';
          } else if (p.balanceUnavailableReason === 'no_reading_yet') {
            balanceDisplay = 'Connecting...';
          }

          return `
            <div class="provider-card">
              <div class="provider-card-top">
                <div style="display:flex; align-items:center; gap:12px;">
                  <div class="kpi-icon-wrap" style="background:var(--primary-subtle); color:var(--primary);">
                    <span class="material-symbols-outlined">${meta.icon}</span>
                  </div>
                  <div>
                    <div class="provider-name">${meta.name}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${meta.type}</div>
                  </div>
                </div>
                <span class="badge ${p.enabled ? 'badge-success' : 'badge-neutral'}">
                  ${p.enabled ? 'ENABLED' : 'DISABLED'}
                </span>
              </div>

              <div style="background:var(--bg-app); padding:14px; border-radius:var(--radius-sm); border:1px solid var(--border-color);">
                <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                  <span style="font-size:0.78rem; color:var(--text-dim); text-transform:uppercase;">Float / Cached Balance</span>
                  <span style="font-family:var(--font-heading); font-weight:700; color:var(--navy); font-size:1.05rem;">${balanceDisplay}</span>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:0.75rem;">
                  <span style="color:var(--text-dim);">Last success:</span>
                  <span style="color:var(--text-muted);">${lastSuccess}</span>
                </div>
              </div>

              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:0.78rem; color:var(--text-dim);">Mode: <strong style="color:var(--navy); text-transform:uppercase;">${p.mode || 'LIVE'}</strong></span>
                <span class="badge ${isOperational ? 'badge-info' : 'badge-warning'}">
                  ${isOperational ? 'OPERATIONAL' : 'DEGRADED'}
                </span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // ==========================================
  // 7. Runtime Settings Registry
  // ==========================================
  function normalizeSettingsData(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.groups)) {
      return data.groups.flatMap(g => g.settings || []);
    }
    if (data && Array.isArray(data.settings)) {
      return data.settings;
    }
    return [];
  }

  function renderBillFeesConfiguratorHtml(settingsList, viewName = 'settings') {
    const getSettingVal = (key, fallback = null) => {
      const found = (settingsList || []).find(s => s.key === key);
      return found && found.value !== null && found.value !== undefined ? found.value : fallback;
    };

    const currentPct = parseFloat(getSettingVal('fees.bills.percent', 0)) || 0;
    const currentMaxKobo = parseInt(getSettingVal('fees.bills.maxKobo', 10000), 10) || 10000;
    const currentMinKobo = parseInt(getSettingVal('fees.bills.minKobo', 0), 10) || 0;

    const currentMaxNaira = (currentMaxKobo / 100).toFixed(0);
    const currentMinNaira = currentMinKobo > 0 ? (currentMinKobo / 100).toFixed(0) : '0';

    const sampleAmount = 5000;
    const rawSampleFee = currentPct > 0 ? (sampleAmount * currentPct) / 100 : 0;
    const sampleFee = currentPct > 0
      ? Math.min(Math.max(rawSampleFee, currentMinKobo / 100), currentMaxKobo / 100)
      : 0;

    return `
      <div class="table-card" style="margin-bottom: 24px; padding: 20px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
          <div>
            <h3 style="font-family:var(--font-heading); font-size:1.15rem; color:var(--navy);">
              Bill Payment Rate &amp; Ceiling (All Bills Except Data &amp; Airtime)
            </h3>
            <p style="font-size:0.82rem; color:var(--text-dim); margin-top:4px;">
              Set the percentage surcharge and maximum fee ceiling applied to Electricity, Cable TV, Exam PINs (WAEC/NECO/NABTEB), JAMB, Betting, Insurance, and other bills. <strong>Data &amp; Airtime remain 0% exempt.</strong>
            </p>
          </div>
          <span class="badge ${currentPct > 0 ? 'badge-info' : 'badge-neutral'}">
            ${currentPct > 0 ? `Active: ${currentPct}% (Cap ₦${Number(currentMaxNaira).toLocaleString()})` : '0% (No Bill Fee)'}
          </span>
        </div>

        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:16px; margin-bottom:16px;">
          <div>
            <label style="font-size:0.8rem; color:var(--navy); font-weight:600; display:block; margin-bottom:6px;">
              Bill Rate Percentage (%) <span style="color:var(--text-dim); font-weight:400;">(0 – 10%)</span>
            </label>
            <input
              type="number"
              id="bills-fee-percent"
              step="0.05"
              min="0"
              max="10"
              value="${currentPct}"
              oninput="window.updateBillFeePreview()"
              style="width:100%; background:var(--bg-input); border:1.5px solid var(--border-color); border-radius:var(--radius-sm); padding:10px; color:var(--text-main); font-weight:600;"
            />
          </div>
          <div>
            <label style="font-size:0.8rem; color:var(--navy); font-weight:600; display:block; margin-bottom:6px;">
              Fee Ceiling / Maximum Cap (₦)
            </label>
            <input
              type="number"
              id="bills-fee-max-naira"
              step="10"
              min="1"
              value="${currentMaxNaira}"
              oninput="window.updateBillFeePreview()"
              style="width:100%; background:var(--bg-input); border:1.5px solid var(--border-color); border-radius:var(--radius-sm); padding:10px; color:var(--text-main); font-weight:600;"
            />
          </div>
          <div>
            <label style="font-size:0.8rem; color:var(--navy); font-weight:600; display:block; margin-bottom:6px;">
              Minimum Fee Floor (₦) <span style="color:var(--text-dim); font-weight:400;">(0 = None)</span>
            </label>
            <input
              type="number"
              id="bills-fee-min-naira"
              step="5"
              min="0"
              value="${currentMinNaira}"
              oninput="window.updateBillFeePreview()"
              style="width:100%; background:var(--bg-input); border:1.5px solid var(--border-color); border-radius:var(--radius-sm); padding:10px; color:var(--text-main);"
            />
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; padding-top:12px; border-top:1px solid var(--border-color);">
          <div id="bills-fee-preview" style="font-size:0.82rem; color:var(--text-muted);">
            Sample ₦5,000 Electricity/TV bill → Fee: <strong style="color:var(--navy);">₦${sampleFee.toFixed(2)}</strong> (Total charged: <strong>₦${(sampleAmount + sampleFee).toLocaleString('en-NG', { minimumFractionDigits: 2 })}</strong>)
          </div>
          <button class="btn-primary" style="width:auto; padding:10px 22px;" onclick="window.saveBillFeesConfig('${viewName}')">
            <span class="material-symbols-outlined" style="font-size:1.1rem;">save</span>
            <span>Save Bill Rate &amp; Ceiling</span>
          </button>
        </div>
      </div>
    `;
  }

  window.updateBillFeePreview = function () {
    const pct = parseFloat(document.getElementById('bills-fee-percent')?.value) || 0;
    const maxNaira = parseFloat(document.getElementById('bills-fee-max-naira')?.value) || 0;
    const minNaira = parseFloat(document.getElementById('bills-fee-min-naira')?.value) || 0;
    const previewEl = document.getElementById('bills-fee-preview');
    if (!previewEl) return;

    const sampleAmount = 5000;
    let fee = 0;
    if (pct > 0 && maxNaira > 0) {
      const raw = (sampleAmount * pct) / 100;
      fee = Math.min(Math.max(raw, minNaira), maxNaira);
    }
    previewEl.innerHTML = `Sample ₦5,000 Electricity/TV bill → Fee: <strong style="color:var(--navy);">₦${fee.toFixed(2)}</strong> (Total charged: <strong>₦${(sampleAmount + fee).toLocaleString('en-NG', { minimumFractionDigits: 2 })}</strong>)`;
  };

  window.saveBillFeesConfig = async function (viewName = 'settings') {
    const pctRaw = document.getElementById('bills-fee-percent')?.value;
    const maxNairaRaw = document.getElementById('bills-fee-max-naira')?.value;
    const minNairaRaw = document.getElementById('bills-fee-min-naira')?.value;

    const pct = Math.round((parseFloat(pctRaw) || 0) * 100) / 100;
    const maxNaira = parseFloat(maxNairaRaw) || 0;
    const minNaira = parseFloat(minNairaRaw) || 0;

    if (pct < 0 || pct > 10) {
      alert('Bill fee percentage must be between 0% and 10%.');
      return;
    }
    if (pct > 0 && maxNaira < 1) {
      alert('A fee ceiling of at least ₦1 is required whenever the percentage is above 0%.');
      return;
    }
    if (minNaira > 0 && maxNaira > 0 && minNaira > maxNaira) {
      alert('Minimum fee floor cannot exceed the maximum fee ceiling.');
      return;
    }

    const reason = prompt(
      'Operational justification for bill fee modification (min 8 chars):',
      'Updated bill payment fee percentage and ceiling via Admin Panel'
    );
    if (!reason || reason.trim().length < 8) {
      alert('Updating financial settings requires an operational audit reason of at least 8 characters.');
      return;
    }

    const maxKobo = Math.round(maxNaira * 100);
    const minKobo = Math.round(minNaira * 100);

    // Order matters: maxKobo must be set before percent > 0
    if (maxKobo >= 100) {
      const resMax = await apiRequest('/admin/settings/fees.bills.maxKobo', {
        method: 'PUT',
        body: JSON.stringify({ value: maxKobo, reason: reason.trim(), confirm: true })
      });
      if (!resMax.success) {
        alert(`Failed to update fee ceiling: ${resMax.error}`);
        return;
      }
    }

    if (minKobo >= 100) {
      const resMin = await apiRequest('/admin/settings/fees.bills.minKobo', {
        method: 'PUT',
        body: JSON.stringify({ value: minKobo, reason: reason.trim(), confirm: true })
      });
      if (!resMin.success) {
        alert(`Failed to update fee floor: ${resMin.error}`);
        return;
      }
    } else {
      await apiRequest(`/admin/settings/fees.bills.minKobo?confirm=true&reason=${encodeURIComponent(reason.trim())}`, {
        method: 'DELETE'
      });
    }

    const resPct = await apiRequest('/admin/settings/fees.bills.percent', {
      method: 'PUT',
      body: JSON.stringify({ value: pct, reason: reason.trim(), confirm: true })
    });
    if (!resPct.success) {
      alert(`Failed to update bill rate percentage: ${resPct.error}`);
      return;
    }

    showToast(`Bill fee updated: ${pct}% capped at ₦${maxNaira.toLocaleString()}`);
    renderView(viewName);
  };

  async function renderSettings(container) {
    const res = await apiRequest('/admin/settings');
    if (!res.success) {
      container.innerHTML = renderErrorAlert(res.error, () => renderSettings(container));
      return;
    }

    const groups = (res.data && res.data.groups) || [];
    cachedSettings = normalizeSettingsData(res.data);

    container.innerHTML = `
      ${renderBillFeesConfiguratorHtml(cachedSettings, 'settings')}

      <div class="toolbar">
        <div class="search-box">
          <span class="material-symbols-outlined">search</span>
          <input type="text" id="settings-search" placeholder="Search settings key, description..." oninput="window.filterSettings()" />
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 24px;">
        ${groups.map(g => `
          <div class="table-card settings-group-card">
            <div style="padding: 16px 20px; background: #FAFBFA; border-bottom: 1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
              <h3 style="font-family: var(--font-heading); font-size: 1.05rem; color: var(--navy);">${g.label || g.id}</h3>
              <span class="badge badge-neutral">${(g.settings || []).length} settings</span>
            </div>
            <table class="data-table">
              <thead>
                <tr>
                  <th>Key / Description</th>
                  <th>Current Value</th>
                  <th>Default</th>
                  <th>Risk Level</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${(g.settings || []).map(s => `
                  <tr class="setting-row" data-search="${s.key + ' ' + (s.description || '')}">
                    <td>
                      <div><code>${s.key}</code></div>
                      <div style="font-size:0.75rem; color:var(--text-muted); margin-top:3px;">${s.description || '—'}</div>
                    </td>
                    <td><strong style="color:var(--navy); font-family:monospace; font-size:0.9rem;">${formatSettingValue(s.value)}</strong></td>
                    <td style="color:var(--text-dim); font-size:0.8rem; font-family:monospace;">${formatSettingValue(s.default)}</td>
                    <td>
                      <span class="badge ${s.risk === 'high' ? 'badge-danger' : 'badge-neutral'}">
                        ${s.risk || 'low'}
                      </span>
                    </td>
                    <td>
                      <button class="btn-secondary" style="padding: 5px 12px; font-size: 0.8rem;" onclick="window.openEditSetting('${s.key}')">
                        Edit
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `).join('')}
      </div>
    `;
  }

  function formatSettingValue(val) {
    if (val === null || val === undefined) return 'null';
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (Array.isArray(val)) return val.join(', ') || '[]';
    return String(val);
  }

  window.filterSettings = function () {
    const q = document.getElementById('settings-search')?.value.toLowerCase().trim() || '';
    const rows = document.querySelectorAll('.setting-row');
    rows.forEach(r => {
      const text = (r.getAttribute('data-search') || '').toLowerCase();
      r.style.display = !q || text.includes(q) ? '' : 'none';
    });
  };

  window.openEditSetting = function (key) {
    const item = cachedSettings.find(x => x.key === key) || { key, value: '', risk: 'low', description: '' };

    modalTitle.textContent = `Modify Setting: ${item.key}`;
    modalBody.innerHTML = `
      ${item.risk === 'high' ? `
        <div class="confirm-warning-box">
          <span class="material-symbols-outlined">warning</span>
          <div>
            <strong>High-Risk Runtime Setting:</strong>
            <p>Modifying this setting directly impacts financial rules or feature availability across the live platform.</p>
          </div>
        </div>
      ` : ''}

      <div class="form-field">
        <label>Current Value</label>
        <input type="text" id="setting-new-val" class="input-icon-wrap" style="width:100%; background:var(--bg-input); border:1.5px solid var(--border-color); border-radius:var(--radius-sm); padding:10px; color:var(--text-main);" value="${item.value !== null && item.value !== undefined ? item.value : ''}" />
      </div>

      <div class="form-field">
        <label>Reason for Modification (Mandatory for High-Risk)</label>
        <textarea id="setting-reason" class="reason-textarea" placeholder="State operational reason..."></textarea>
      </div>
    `;

    modalFooter.innerHTML = `
      <button class="btn-secondary" onclick="window.closeModal()">Cancel</button>
      <button class="btn-primary" style="width:auto;" onclick="window.saveSetting('${item.key}', '${item.risk}')">
        Save Setting
      </button>
    `;

    modalBackdrop.classList.add('active');
  };

  window.saveSetting = async function (key, risk) {
    let newVal = document.getElementById('setting-new-val')?.value.trim();
    const reason = document.getElementById('setting-reason')?.value.trim();

    if (risk === 'high' && (!reason || reason.length < 8)) {
      alert('High-risk settings modifications require a justification of at least 8 characters.');
      return;
    }

    // Auto-parse boolean if string is true/false
    if (newVal === 'true') newVal = true;
    else if (newVal === 'false') newVal = false;
    else if (/^\d+(\.\d+)?$/.test(newVal)) newVal = parseFloat(newVal);

    const res = await apiRequest(`/admin/settings/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value: newVal, reason, confirm: true })
    });

    if (!res.success) {
      alert(`Save failed: ${res.error}`);
      return;
    }

    closeModal();
    showToast(`Setting ${key} updated successfully.`);
    renderView('settings');
  };

  // ==========================================
  // 8. Cashback Rates & Manager Screen
  // ==========================================
  async function renderCashback(container) {
    const res = await apiRequest('/admin/settings');
    if (!res.success) {
      container.innerHTML = renderErrorAlert(res.error, () => renderCashback(container));
      return;
    }

    cachedSettings = normalizeSettingsData(res.data);
    const getVal = (key, fallback = '') => {
      const found = cachedSettings.find(s => s.key === key);
      return found && found.value !== null && found.value !== undefined ? found.value : fallback;
    };

    const isEnabled = Boolean(getVal('cashback.enabled', false));
    const earnRatesRaw = getVal('cashback.earnRatesBps', []);
    const spendTypesRaw = getVal('cashback.spendTypes', ['AIRTIME', 'DATA']);
    const maxEarnTxKobo = parseInt(getVal('cashback.maxEarnPerTxKobo', '50000'), 10) || 50000;
    const maxEarnMonthKobo = parseInt(getVal('cashback.maxEarnPerUserPerMonthKobo', '500000'), 10) || 500000;
    const dailyBudgetKeyKobo = parseInt(getVal('cashback.platformDailyBudgetKobo', '100000000'), 10) || 100000000;

    // Parse existing rates array ['AIRTIME:100', ...]
    const earnRateMap = {};
    const rateList = Array.isArray(earnRatesRaw) ? earnRatesRaw : String(earnRatesRaw).split(',');
    rateList.forEach(item => {
      const parts = String(item).trim().split(':');
      if (parts.length === 2) {
        earnRateMap[parts[0].toUpperCase()] = parseInt(parts[1], 10) || 0;
      }
    });

    const spendSet = new Set(
      (Array.isArray(spendTypesRaw) ? spendTypesRaw : String(spendTypesRaw).split(','))
        .map(x => String(x).trim().toUpperCase())
    );

    container.innerHTML = `
      <div class="table-card" style="margin-bottom: 24px;">
        <div style="padding: 20px; border-bottom: 1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3 style="font-family:var(--font-heading); font-size:1.15rem; color:var(--navy);">Service Cashback Rates & Spend Rules</h3>
            <p style="font-size:0.8rem; color:var(--text-dim); margin-top:2px;">
              Configure basis points per service (100 bps = 1.00%) and toggle which services allow cashback redemption.
            </p>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.88rem; color:var(--navy); font-weight:600; cursor:pointer;">
              <input type="checkbox" id="cb-master-switch" ${isEnabled ? 'checked' : ''} style="margin-right:6px;" />
              Enable Cashback System
            </label>
          </div>
        </div>

        <table class="data-table">
          <thead>
            <tr>
              <th>Service Category</th>
              <th>Service Code</th>
              <th>Earning Status</th>
              <th>Earn Rate (%)</th>
              <th>Basis Points (BPS)</th>
              <th>Allow Spend (Redeem)</th>
            </tr>
          </thead>
          <tbody>
            ${CASHBACK_SERVICES.map(svc => {
              const currentBps = earnRateMap[svc.type] !== undefined ? earnRateMap[svc.type] : svc.defaultBps;
              const isEarning = currentBps > 0;
              const isSpending = spendSet.has(svc.type);
              const currentPct = (currentBps / 100).toFixed(2);

              return `
                <tr>
                  <td>
                    <div style="display:flex; align-items:center; gap:10px;">
                      <span class="material-symbols-outlined" style="color:var(--primary); font-size:1.3rem;">${svc.icon}</span>
                      <strong>${svc.name}</strong>
                    </div>
                  </td>
                  <td><code>${svc.type}</code></td>
                  <td>
                    <label style="cursor:pointer; display:flex; align-items:center; gap:6px;">
                      <input type="checkbox" id="cb-earn-active-${svc.type}" ${isEarning ? 'checked' : ''} onchange="window.toggleServiceEarn('${svc.type}', this.checked)" />
                      <span id="cb-earn-badge-${svc.type}" class="badge ${isEarning ? 'badge-info' : 'badge-neutral'}">
                        ${isEarning ? 'Earning' : 'Off'}
                      </span>
                    </label>
                  </td>
                  <td>
                    <div style="display:flex; align-items:center; gap:6px;">
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        max="20"
                        id="cb-rate-pct-${svc.type}"
                        value="${currentPct}"
                        style="width:80px; background:var(--bg-input); border:1.5px solid var(--border-color); border-radius:var(--radius-sm); padding:6px 8px; color:var(--text-main); font-weight:600; text-align:right;"
                        oninput="window.updateRateBpsFromPct('${svc.type}', this.value)"
                      />
                      <span style="font-size:0.85rem; color:var(--text-dim);">%</span>
                    </div>
                  </td>
                  <td>
                    <span id="cb-rate-bps-${svc.type}" style="font-family:monospace; font-weight:600; color:var(--navy);">
                      ${currentBps} bps
                    </span>
                  </td>
                  <td>
                    <label style="cursor:pointer; display:flex; align-items:center; gap:6px;">
                      <input type="checkbox" id="cb-spend-active-${svc.type}" ${isSpending ? 'checked' : ''} />
                      <span class="badge ${isSpending ? 'badge-success' : 'badge-neutral'}">
                        ${isSpending ? 'Allowed' : 'Disabled'}
                      </span>
                    </label>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <!-- Financial Caps Card -->
      <div class="table-card" style="padding: 24px; margin-bottom: 24px;">
        <h3 style="font-family:var(--font-heading); font-size:1.15rem; color:var(--navy); margin-bottom: 4px;">Financial Guardrails & Risk Caps</h3>
        <p style="font-size:0.8rem; color:var(--text-dim); margin-bottom: 20px;">Safety ceilings required when cashback is enabled.</p>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;">
          <div>
            <label style="font-size:0.8rem; color:var(--navy); font-weight:600; display:block; margin-bottom:6px;">Max Earn per Purchase (₦)</label>
            <input
              type="number"
              id="cb-cap-tx"
              value="${maxEarnTxKobo / 100}"
              style="width:100%; background:var(--bg-input); border:1.5px solid var(--border-color); border-radius:var(--radius-sm); padding:10px; color:var(--text-main);"
            />
          </div>
          <div>
            <label style="font-size:0.8rem; color:var(--navy); font-weight:600; display:block; margin-bottom:6px;">Monthly User Cap (₦)</label>
            <input
              type="number"
              id="cb-cap-month"
              value="${maxEarnMonthKobo / 100}"
              style="width:100%; background:var(--bg-input); border:1.5px solid var(--border-color); border-radius:var(--radius-sm); padding:10px; color:var(--text-main);"
            />
          </div>
          <div>
            <label style="font-size:0.8rem; color:var(--navy); font-weight:600; display:block; margin-bottom:6px;">Platform Daily Budget (₦)</label>
            <input
              type="number"
              id="cb-cap-budget"
              value="${dailyBudgetKeyKobo / 100}"
              style="width:100%; background:var(--bg-input); border:1.5px solid var(--border-color); border-radius:var(--radius-sm); padding:10px; color:var(--text-main);"
            />
          </div>
        </div>
      </div>

      <div style="display:flex; justify-content:flex-end;">
        <button class="btn-primary" style="width:auto; padding:12px 28px;" onclick="window.saveCashbackManagerConfig()">
          <span class="material-symbols-outlined">save</span>
          <span>Save Cashback Configuration</span>
        </button>
      </div>
    `;
  }

  window.toggleServiceEarn = function (type, isChecked) {
    const inputPct = document.getElementById(`cb-rate-pct-${type}`);
    const badge = document.getElementById(`cb-earn-badge-${type}`);
    if (isChecked) {
      if (inputPct && parseFloat(inputPct.value) <= 0) {
        inputPct.value = '1.00';
        window.updateRateBpsFromPct(type, '1.00');
      }
      if (badge) {
        badge.className = 'badge badge-info';
        badge.textContent = 'Earning';
      }
    } else {
      if (inputPct) {
        inputPct.value = '0.00';
        window.updateRateBpsFromPct(type, '0.00');
      }
      if (badge) {
        badge.className = 'badge badge-neutral';
        badge.textContent = 'Off';
      }
    }
  };

  window.updateRateBpsFromPct = function (type, pctVal) {
    const pct = parseFloat(pctVal) || 0;
    const bps = Math.round(pct * 100);
    const bpsSpan = document.getElementById(`cb-rate-bps-${type}`);
    if (bpsSpan) {
      bpsSpan.textContent = `${bps} bps`;
    }
  };

  window.saveCashbackManagerConfig = async function () {
    const enabled = document.getElementById('cb-master-switch')?.checked ?? true;

    const earnItems = [];
    CASHBACK_SERVICES.forEach(svc => {
      const active = document.getElementById(`cb-earn-active-${svc.type}`)?.checked;
      const pct = parseFloat(document.getElementById(`cb-rate-pct-${svc.type}`)?.value) || 0;
      const bps = Math.round(pct * 100);
      if (active && bps > 0) {
        earnItems.push(`${svc.type}:${bps}`);
      }
    });

    const spendItems = [];
    CASHBACK_SERVICES.forEach(svc => {
      if (document.getElementById(`cb-spend-active-${svc.type}`)?.checked) {
        spendItems.push(svc.type);
      }
    });

    const maxTxNaira = parseFloat(document.getElementById('cb-cap-tx')?.value) || 500;
    const maxMonthNaira = parseFloat(document.getElementById('cb-cap-month')?.value) || 5000;
    const budgetDailyNaira = parseFloat(document.getElementById('cb-cap-budget')?.value) || 1000000;

    const maxEarnPerTxKobo = Math.round(maxTxNaira * 100);
    const maxEarnPerUserPerMonthKobo = Math.round(maxMonthNaira * 100);
    const platformDailyBudgetKobo = Math.round(budgetDailyNaira * 100);

    const reason = prompt('Operational justification for cashback modification (min 8 chars):', 'Updated production cashback earn rates and spend types');
    if (!reason || reason.trim().length < 8) {
      alert('Updating financial settings requires an operational audit reason of at least 8 characters.');
      return;
    }

    // Set caps first (required by validation before enabling)
    const caps = [
      { key: 'cashback.maxEarnPerTxKobo', value: maxEarnPerTxKobo },
      { key: 'cashback.maxEarnPerUserPerMonthKobo', value: maxEarnPerUserPerMonthKobo },
      { key: 'cashback.platformDailyBudgetKobo', value: platformDailyBudgetKobo },
      { key: 'cashback.earnRatesBps', value: earnItems },
      { key: 'cashback.spendTypes', value: spendItems.length > 0 ? spendItems : ['AIRTIME', 'DATA'] },
      { key: 'cashback.enabled', value: Boolean(enabled) },
    ];

    for (const u of caps) {
      const res = await apiRequest(`/admin/settings/${u.key}`, {
        method: 'PUT',
        body: JSON.stringify({ value: u.value, reason: reason.trim(), confirm: true })
      });
      if (!res.success) {
        alert(`Failed to save ${u.key}: ${res.error}`);
        return;
      }
    }

    showToast('Cashback rules and rates saved to production successfully!');
    renderView('cashback');
  };

  // ==========================================
  // 9. Audit Log Screen
  // ==========================================
  async function renderAuditLog(container) {
    const res = await apiRequest('/admin/audit-log');
    if (!res.success) {
      container.innerHTML = renderErrorAlert(res.error, () => renderAuditLog(container));
      return;
    }

    const logs = (res.data && res.data.items) || [];

    container.innerHTML = `
      <div class="table-card">
        <table class="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Actor ID</th>
              <th>Action</th>
              <th>Target Entity</th>
              <th>Context / Details</th>
            </tr>
          </thead>
          <tbody>
            ${logs.length === 0 ? `
              <tr>
                <td colspan="5" style="text-align: center; padding: 48px; color: var(--text-dim);">
                  No audit log entries recorded.
                </td>
              </tr>
            ` : logs.map(a => `
              <tr>
                <td style="color:var(--text-muted); font-size:0.8rem;">${new Date(a.createdAt).toLocaleString()}</td>
                <td><code>${a.actorId ? a.actorId.slice(0, 12) + '...' : 'system'}</code></td>
                <td><span class="badge badge-info">${a.action}</span></td>
                <td><code>${a.entity || ''} ${a.entityId ? '#' + a.entityId.slice(0, 8) : ''}</code></td>
                <td style="color:var(--text-main); font-size:0.82rem;">${a.after?.reason || JSON.stringify(a.after || a.before || '—').slice(0, 80)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ==========================================
  // 10. Virtual Cards & StroWallet Claims
  // ==========================================
  async function renderVirtualCards(container) {
    const res = await apiRequest('/admin/strowallet-claims');
    const claims = (res.data && res.data.items) || [];

    container.innerHTML = `
      <div class="kpi-grid" style="grid-template-columns: repeat(3, 1fr); margin-bottom: 24px;">
        <div class="kpi-card">
          <span class="kpi-label">Provider Integration</span>
          <div class="kpi-val" style="color:var(--primary); font-size:1.6rem;">StroWallet Live</div>
          <div class="kpi-sub">USD MasterCard Virtual Float</div>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Pending Card Claims</span>
          <div class="kpi-val">${claims.length}</div>
          <div class="kpi-sub">Claims awaiting reverification</div>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Issuance Policy</span>
          <div class="kpi-val" style="font-size:1.4rem;">Tier 1+ Verified</div>
          <div class="kpi-sub">Mandatory KYC & transaction PIN protection</div>
        </div>
      </div>

      <div class="table-card">
        <div style="padding: 16px 20px; background: #FAFBFA; border-bottom: 1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
          <h3 style="font-family: var(--font-heading); font-size: 1.05rem; color: var(--navy);">StroWallet Virtual Card Claims & Disputes</h3>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Claim ID</th>
              <th>Customer</th>
              <th>Card Reference</th>
              <th>Disputed Amount</th>
              <th>Status</th>
              <th>Timestamp</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${claims.length === 0 ? `
              <tr>
                <td colspan="7" style="text-align: center; padding: 48px; color: var(--text-dim);">
                  <span class="material-symbols-outlined" style="font-size: 2.2rem; display: block; margin-bottom: 8px; color: var(--primary);">credit_card</span>
                  <strong style="color: var(--navy); font-size: 1rem;">No Active Card Claims</strong>
                  <p style="font-size: 0.85rem; margin-top: 4px;">All virtual card issuance and funding transactions are operating normally.</p>
                </td>
              </tr>
            ` : claims.map(c => `
              <tr>
                <td><code>${c.id.slice(0, 8)}...</code></td>
                <td>${c.userEmail || c.userEmailMasked || '—'}</td>
                <td><code>${c.accountNumber || c.cardReference || c.accountNumberMasked || '—'}</code></td>
                <td><strong>$${(c.amountUsd || 0).toFixed(2)}</strong></td>
                <td><span class="badge badge-warning">${c.status}</span></td>
                <td style="color:var(--text-dim);">${new Date(c.createdAt).toLocaleDateString()}</td>
                <td>
                  <button class="btn-primary" style="padding: 5px 12px; font-size: 0.8rem;" onclick="window.reverifyClaim('${c.id}')">
                    Reverify
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ==========================================
  // 11. Promotional Banners Screen
  // ==========================================
  let cachedBanners = [];
  let previewBannerIdx = 0;
  let bannerTimer = null;

  async function renderBanners(container) {
    clearInterval(bannerTimer);
    const res = await apiRequest('/admin/banners');
    if (!res.success) {
      container.innerHTML = renderErrorAlert(res.error, () => renderBanners(container));
      return;
    }

    cachedBanners = Array.isArray(res.data)
      ? res.data
      : (res.data && Array.isArray(res.data.data) ? res.data.data : []);
    const activeBanners = cachedBanners.filter(b => b.isActive);
    if (activeBanners.length === 0 && cachedBanners.length > 0) {
      activeBanners.push(cachedBanners[0]);
    }

    // Auto-advance preview every 4s
    if (activeBanners.length > 1) {
      bannerTimer = setInterval(() => {
        previewBannerIdx = (previewBannerIdx + 1) % activeBanners.length;
        updateLiveBannerPreview();
      }, 4000);
    }

    const cur = activeBanners[previewBannerIdx] || {
      tag: 'AIRTIME CASHBACK',
      title: 'Get instant cashback rewards on your next airtime top-up!',
      subtitle: 'Save more every time you recharge.',
      buttonText: 'Buy now',
      actionUrl: '/airtime',
      bgColor: '#C5E76C',
      textColor: '#000000',
      tagColor: '#17324F',
      imageUrl: 'gift-box'
    };

    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 24px; flex-wrap:wrap; gap:12px;">
        <div>
          <h2 style="font-family:var(--font-heading); font-size:1.35rem; color:var(--navy);">App Promotional Banners</h2>
          <p style="font-size:0.85rem; color:var(--text-dim); margin-top:3px;">
            Dynamic carousel banners displayed on the mobile app home screen below the services card.
          </p>
        </div>
        <button class="btn-primary" style="width:auto; padding: 10px 20px;" onclick="window.openBannerModal(null)">
          <span class="material-symbols-outlined">add_photo_alternate</span>
          <span>Add New Banner</span>
        </button>
      </div>

      <!-- Live App Carousel Preview Card -->
      <div class="table-card" style="margin-bottom: 24px; padding: 22px; background: #FAFDF5; border: 1.5px dashed var(--accent-lime-dark);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 14px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="material-symbols-outlined" style="color:var(--primary); font-size:1.3rem;">smartphone</span>
            <strong style="color:var(--navy); font-size:0.92rem;">Mobile App Live Preview (Auto-Rotating)</strong>
          </div>
          <span style="font-size:0.75rem; color:var(--text-dim); background:#FFFFFF; padding:4px 10px; border-radius:20px; border:1px solid var(--border-color);">
            ${activeBanners.length} active banner${activeBanners.length === 1 ? '' : 's'}
          </span>
        </div>

        <div style="max-width: 480px; margin: 0 auto;">
          <div id="live-banner-preview-card" style="
            background: ${cur.bgColor || '#C5E76C'};
            color: ${cur.textColor || '#000000'};
            border-radius: 16px;
            padding: 16px 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            min-height: 130px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.06);
            transition: all 0.4s ease;
          ">
            <div style="flex:1; padding-right:12px;">
              <span id="prev-tag" style="
                display:inline-block;
                font-size:11px;
                font-weight:700;
                letter-spacing:0.04em;
                color:${cur.tagColor || '#17324F'};
                margin-bottom:4px;
                text-transform:uppercase;
              ">${cur.tag || 'PROMO'}</span>
              <h4 id="prev-title" style="font-size:14px; font-weight:700; line-height:1.3; margin:0 0 4px 0; color:${cur.textColor || '#000000'};">
                ${cur.title || 'Special Promotion'}
              </h4>
              <p id="prev-sub" style="font-size:11px; opacity:0.85; margin:0 0 10px 0; color:${cur.textColor || '#000000'};">
                ${cur.subtitle || ''}
              </p>
              <div id="prev-btn" style="
                display:inline-block;
                background:${cur.tagColor || '#17324F'};
                color:#FFFFFF;
                font-size:11px;
                font-weight:600;
                padding:5px 14px;
                border-radius:20px;
              ">${cur.buttonText || 'Explore'}</div>
            </div>
            <div id="prev-img-wrap" style="width:72px; height:72px; display:flex; align-items:center; justify-content:center;">
              ${renderBannerImageHtml(cur.imageUrl)}
            </div>
          </div>

          <!-- Carousel Dots Indicator -->
          <div style="display:flex; justify-content:center; gap:8px; margin-top:14px;">
            ${activeBanners.map((_, i) => `
              <div onclick="window.selectPreviewBanner(${i})" style="
                width: ${i === previewBannerIdx ? '22px' : '7px'};
                height: 7px;
                border-radius: 4px;
                background: ${i === previewBannerIdx ? 'var(--primary)' : '#CBD5E1'};
                cursor: pointer;
                transition: all 0.3s ease;
              "></div>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Banners List Table -->
      <div class="table-card">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:60px;">Order</th>
              <th>Banner Style</th>
              <th>Tag & Title</th>
              <th>Action Route</th>
              <th>Image Preset</th>
              <th>Status</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${cachedBanners.length === 0 ? `
              <tr>
                <td colspan="7" style="text-align: center; padding: 48px; color: var(--text-dim);">
                  <span class="material-symbols-outlined" style="font-size: 2.2rem; display: block; margin-bottom: 8px; color: var(--primary);">view_carousel</span>
                  <strong style="color: var(--navy); font-size: 1rem;">No Banners Configured</strong>
                  <p style="font-size: 0.85rem; margin-top: 4px;">Click "Add New Banner" to create your first promotional banner.</p>
                </td>
              </tr>
            ` : cachedBanners.map(b => `
              <tr>
                <td><strong>#${b.displayOrder}</strong></td>
                <td>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <div style="width:28px; height:28px; border-radius:6px; background:${b.bgColor}; border:1px solid rgba(0,0,0,0.1); display:flex; align-items:center; justify-content:center;">
                      <div style="width:8px; height:8px; border-radius:50%; background:${b.textColor};"></div>
                    </div>
                    <code style="font-size:0.75rem;">${b.bgColor}</code>
                  </div>
                </td>
                <td>
                  <strong style="font-size:0.78rem; text-transform:uppercase; color:${b.tagColor || 'var(--primary)'}; display:block;">${b.tag}</strong>
                  <span style="font-size:0.88rem; color:var(--navy); font-weight:600;">${b.title}</span>
                  ${b.subtitle ? `<div style="font-size:0.78rem; color:var(--text-dim); margin-top:1px;">${b.subtitle}</div>` : ''}
                </td>
                <td>
                  <code style="background:#F1F5F9; padding:3px 8px; border-radius:4px; font-size:0.78rem;">${b.actionUrl}</code>
                  <div style="font-size:0.74rem; color:var(--text-dim); margin-top:2px;">Btn: "${b.buttonText}"</div>
                </td>
                <td>
                  <span class="badge badge-info" style="text-transform:capitalize;">${b.imageUrl || 'gift-box'}</span>
                </td>
                <td>
                  <label style="display:inline-flex; align-items:center; gap:6px; cursor:pointer;">
                    <input type="checkbox" ${b.isActive ? 'checked' : ''} onchange="window.toggleBannerActive('${b.id}', ${b.isActive})" />
                    <span style="font-size:0.82rem; font-weight:600; color:${b.isActive ? 'var(--success)' : 'var(--text-dim)'};">
                      ${b.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </label>
                </td>
                <td style="text-align:right;">
                  <div style="display:inline-flex; gap:8px;">
                    <button class="btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="window.openBannerModal('${b.id}')">
                      <span class="material-symbols-outlined" style="font-size:1rem;">edit</span>
                      <span>Edit</span>
                    </button>
                    <button class="btn-secondary" style="padding: 6px 10px; font-size: 0.8rem; color:var(--danger); border-color:rgba(239,68,68,0.3);" onclick="window.deleteBanner('${b.id}')">
                      <span class="material-symbols-outlined" style="font-size:1rem;">delete</span>
                    </button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderBannerImageHtml(key) {
    if (!key || key === 'gift-box') {
      return `
        <div style="width:60px; height:60px; border-radius:12px; background:rgba(255,255,255,0.35); display:flex; align-items:center; justify-content:center; font-size:32px;">
          🎁
        </div>
      `;
    }
    if (key === 'phone-shield') {
      return `
        <div style="width:60px; height:60px; border-radius:12px; background:rgba(255,255,255,0.35); display:flex; align-items:center; justify-content:center; font-size:32px;">
          🛡️
        </div>
      `;
    }
    if (key === 'kyc-seal') {
      return `
        <div style="width:60px; height:60px; border-radius:12px; background:rgba(255,255,255,0.35); display:flex; align-items:center; justify-content:center; font-size:32px;">
          🏅
        </div>
      `;
    }
    if (key === 'credit-card') {
      return `
        <div style="width:60px; height:60px; border-radius:12px; background:rgba(255,255,255,0.35); display:flex; align-items:center; justify-content:center; font-size:32px;">
          💳
        </div>
      `;
    }
    if (key.startsWith('http://') || key.startsWith('https://')) {
      return `<img src="${key}" style="width:60px; height:60px; object-fit:contain; border-radius:8px;" alt="Banner icon" />`;
    }
    return `
      <div style="width:60px; height:60px; border-radius:12px; background:rgba(255,255,255,0.35); display:flex; align-items:center; justify-content:center; font-size:32px;">
        ✨
      </div>
    `;
  }

  function updateLiveBannerPreview() {
    const activeBanners = cachedBanners.filter(b => b.isActive);
    if (activeBanners.length === 0) return;
    const b = activeBanners[previewBannerIdx % activeBanners.length];
    if (!b) return;

    const card = document.getElementById('live-banner-preview-card');
    if (!card) return;

    card.style.background = b.bgColor || '#C5E76C';
    card.style.color = b.textColor || '#000000';

    const tag = document.getElementById('prev-tag');
    if (tag) {
      tag.textContent = b.tag || 'PROMO';
      tag.style.color = b.tagColor || '#17324F';
    }
    const title = document.getElementById('prev-title');
    if (title) {
      title.textContent = b.title || '';
      title.style.color = b.textColor || '#000000';
    }
    const sub = document.getElementById('prev-sub');
    if (sub) {
      sub.textContent = b.subtitle || '';
      sub.style.color = b.textColor || '#000000';
    }
    const btn = document.getElementById('prev-btn');
    if (btn) {
      btn.textContent = b.buttonText || 'Explore';
      btn.style.background = b.tagColor || '#17324F';
    }
    const imgWrap = document.getElementById('prev-img-wrap');
    if (imgWrap) {
      imgWrap.innerHTML = renderBannerImageHtml(b.imageUrl);
    }
  }

  window.selectPreviewBanner = function(idx) {
    previewBannerIdx = idx;
    updateLiveBannerPreview();
  };

  window.openBannerModal = function(id) {
    const isEdit = Boolean(id);
    const item = isEdit
      ? (cachedBanners.find(x => x.id === id) || {})
      : {
          tag: 'FAST BILL PAYMENTS',
          title: 'Instant payments for bills and subscriptions',
          subtitle: 'Zero delays, 100% automated delivery.',
          buttonText: 'Explore',
          actionUrl: '/(tabs)/services',
          bgColor: '#C5E76C',
          textColor: '#000000',
          tagColor: '#17324F',
          imageUrl: 'gift-box',
          isActive: true,
          displayOrder: cachedBanners.length
        };

    modalTitle.textContent = isEdit ? 'Edit Promotional Banner' : 'Create New Promotional Banner';
    modalBody.innerHTML = `
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
        <div class="form-field" style="grid-column: span 2;">
          <label>Banner Tag / Category Badge</label>
          <input type="text" id="banner-input-tag" class="input-icon-wrap" style="width:100%; background:var(--bg-input); border:1.5px solid var(--border-color); border-radius:var(--radius-sm); padding:9px 12px; color:var(--text-main);" value="${item.tag || ''}" placeholder="e.g. AIRTIME CASHBACK, FAST BILL PAYMENTS" />
        </div>

        <div class="form-field" style="grid-column: span 2;">
          <label>Headline / Main Title</label>
          <input type="text" id="banner-input-title" class="input-icon-wrap" style="width:100%; background:var(--bg-input); border:1.5px solid var(--border-color); border-radius:var(--radius-sm); padding:9px 12px; color:var(--text-main);" value="${item.title || ''}" placeholder="e.g. Get instant cashback rewards on your next top-up!" />
        </div>

        <div class="form-field" style="grid-column: span 2;">
          <label>Subtitle / Description (Optional)</label>
          <input type="text" id="banner-input-subtitle" class="input-icon-wrap" style="width:100%; background:var(--bg-input); border:1.5px solid var(--border-color); border-radius:var(--radius-sm); padding:9px 12px; color:var(--text-main);" value="${item.subtitle || ''}" placeholder="e.g. Save more every time you recharge." />
        </div>

        <div class="form-field">
          <label>Button Text</label>
          <input type="text" id="banner-input-btn" class="input-icon-wrap" style="width:100%; background:var(--bg-input); border:1.5px solid var(--border-color); border-radius:var(--radius-sm); padding:9px 12px; color:var(--text-main);" value="${item.buttonText || 'Explore'}" placeholder="Buy now, Explore, Get Card" />
        </div>

        <div class="form-field">
          <label>Action Route (In-App Destination)</label>
          <input type="text" id="banner-input-route" class="input-icon-wrap" style="width:100%; background:var(--bg-input); border:1.5px solid var(--border-color); border-radius:var(--radius-sm); padding:9px 12px; color:var(--text-main);" value="${item.actionUrl || '/(tabs)/services'}" placeholder="/airtime, /data, /electricity, /(tabs)/cards" />
        </div>

        <!-- Preset Image Selector -->
        <div class="form-field" style="grid-column: span 2;">
          <label>Banner Image / Icon</label>
          <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:10px; margin-top:6px;">
            ${[
              { id: 'gift-box', label: 'Gift Box', icon: '🎁' },
              { id: 'phone-shield', label: 'Shield', icon: '🛡️' },
              { id: 'kyc-seal', label: 'Reward Seal', icon: '🏅' },
              { id: 'credit-card', label: 'Dollar Card', icon: '💳' }
            ].map(p => `
              <div onclick="window.selectModalBannerImage('${p.id}')" id="img-choice-${p.id}" style="
                border: 2px solid ${item.imageUrl === p.id ? 'var(--primary)' : 'var(--border-color)'};
                border-radius: 10px;
                padding: 10px 6px;
                text-align: center;
                cursor: pointer;
                background: ${item.imageUrl === p.id ? 'var(--bg-body)' : '#FFFFFF'};
              ">
                <div style="font-size:26px;">${p.icon}</div>
                <div style="font-size:11px; font-weight:600; color:var(--navy); margin-top:4px;">${p.label}</div>
              </div>
            `).join('')}
          </div>
          <input type="hidden" id="banner-input-image" value="${item.imageUrl || 'gift-box'}" />
          <div style="margin-top:8px;">
            <input type="text" id="banner-custom-image-url" class="input-icon-wrap" style="width:100%; background:var(--bg-input); border:1.5px solid var(--border-color); border-radius:var(--radius-sm); padding:7px 10px; color:var(--text-main); font-size:0.8rem;" placeholder="Or paste custom image HTTPS URL..." value="${(item.imageUrl && item.imageUrl.startsWith('http')) ? item.imageUrl : ''}" oninput="window.setCustomBannerImageUrl(this.value)" />
          </div>
        </div>

        <!-- Color Palette Quick Swatches -->
        <div class="form-field" style="grid-column: span 2;">
          <label>Color Theme Presets</label>
          <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:6px;">
            ${[
              { name: 'Lime Fresh', bg: '#C5E76C', text: '#000000', tag: '#17324F' },
              { name: 'Sky Blue', bg: '#D9F2FF', text: '#0B3B60', tag: '#0077B6' },
              { name: 'Warm Amber', bg: '#FFECC8', text: '#4A2800', tag: '#9A5800' },
              { name: 'Mint Green', bg: '#DCFCE7', text: '#14532D', tag: '#15803D' },
              { name: 'Soft Purple', bg: '#F3E8FF', text: '#3B0764', tag: '#7E22CE' },
              { name: 'Midnight Navy', bg: '#17324F', text: '#FFFFFF', tag: '#C5E76C' }
            ].map(col => `
              <div onclick="window.applyBannerPalette('${col.bg}', '${col.text}', '${col.tag}')" style="
                cursor:pointer;
                display:flex;
                align-items:center;
                gap:6px;
                border:1px solid var(--border-color);
                border-radius:20px;
                padding:4px 10px;
                background:#FFFFFF;
              ">
                <span style="width:16px; height:16px; border-radius:50%; background:${col.bg}; border:1px solid rgba(0,0,0,0.15);"></span>
                <span style="font-size:12px; font-weight:600; color:var(--navy);">${col.name}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Custom Color Inputs -->
        <div class="form-field">
          <label>Background Color</label>
          <div style="display:flex; gap:8px; align-items:center;">
            <input type="color" id="banner-color-bg" value="${item.bgColor || '#C5E76C'}" style="width:40px; height:36px; border:none; border-radius:6px; cursor:pointer;" oninput="document.getElementById('banner-input-bg').value=this.value; window.refreshModalPreview();" />
            <input type="text" id="banner-input-bg" class="input-icon-wrap" style="flex:1; background:var(--bg-input); border:1.5px solid var(--border-color); border-radius:var(--radius-sm); padding:7px 10px; color:var(--text-main);" value="${item.bgColor || '#C5E76C'}" oninput="document.getElementById('banner-color-bg').value=this.value; window.refreshModalPreview();" />
          </div>
        </div>

        <div class="form-field">
          <label>Text Color</label>
          <div style="display:flex; gap:8px; align-items:center;">
            <input type="color" id="banner-color-text" value="${item.textColor || '#000000'}" style="width:40px; height:36px; border:none; border-radius:6px; cursor:pointer;" oninput="document.getElementById('banner-input-text').value=this.value; window.refreshModalPreview();" />
            <input type="text" id="banner-input-text" class="input-icon-wrap" style="flex:1; background:var(--bg-input); border:1.5px solid var(--border-color); border-radius:var(--radius-sm); padding:7px 10px; color:var(--text-main);" value="${item.textColor || '#000000'}" oninput="document.getElementById('banner-color-text').value=this.value; window.refreshModalPreview();" />
          </div>
        </div>

        <div class="form-field">
          <label>Tag & Button Color</label>
          <div style="display:flex; gap:8px; align-items:center;">
            <input type="color" id="banner-color-tag" value="${item.tagColor || '#17324F'}" style="width:40px; height:36px; border:none; border-radius:6px; cursor:pointer;" oninput="document.getElementById('banner-input-tag-color').value=this.value; window.refreshModalPreview();" />
            <input type="text" id="banner-input-tag-color" class="input-icon-wrap" style="flex:1; background:var(--bg-input); border:1.5px solid var(--border-color); border-radius:var(--radius-sm); padding:7px 10px; color:var(--text-main);" value="${item.tagColor || '#17324F'}" oninput="document.getElementById('banner-color-tag').value=this.value; window.refreshModalPreview();" />
          </div>
        </div>

        <div class="form-field">
          <label>Display Order (0, 1, 2...)</label>
          <input type="number" id="banner-input-order" class="input-icon-wrap" style="width:100%; background:var(--bg-input); border:1.5px solid var(--border-color); border-radius:var(--radius-sm); padding:7px 10px; color:var(--text-main);" value="${item.displayOrder !== undefined ? item.displayOrder : 0}" />
        </div>

        <div class="form-field" style="grid-column: span 2;">
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
            <input type="checkbox" id="banner-input-active" ${item.isActive !== false ? 'checked' : ''} style="width:18px; height:18px;" />
            <span style="font-weight:600; color:var(--navy);">Active (Include in mobile app banner rotation)</span>
          </label>
        </div>

        <!-- Modal Live Preview -->
        <div style="grid-column: span 2; margin-top:8px;">
          <label style="font-size:12px; font-weight:700; color:var(--text-dim); text-transform:uppercase; margin-bottom:6px; display:block;">Live Preview</label>
          <div id="modal-card-preview" style="
            background: ${item.bgColor || '#C5E76C'};
            color: ${item.textColor || '#000000'};
            border-radius: 14px;
            padding: 16px 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            min-height: 110px;
          ">
            <div style="flex:1; padding-right:10px;">
              <span id="mprev-tag" style="display:inline-block; font-size:11px; font-weight:700; color:${item.tagColor || '#17324F'}; text-transform:uppercase; margin-bottom:4px;">
                ${item.tag || 'AIRTIME CASHBACK'}
              </span>
              <h4 id="mprev-title" style="font-size:14px; font-weight:700; margin:0 0 4px 0; color:${item.textColor || '#000000'};">
                ${item.title || 'Get instant rewards!'}
              </h4>
              <p id="mprev-sub" style="font-size:11px; opacity:0.85; margin:0 0 8px 0; color:${item.textColor || '#000000'};">
                ${item.subtitle || ''}
              </p>
              <div id="mprev-btn" style="display:inline-block; background:${item.tagColor || '#17324F'}; color:#FFFFFF; font-size:11px; font-weight:600; padding:4px 12px; border-radius:16px;">
                ${item.buttonText || 'Explore'}
              </div>
            </div>
            <div id="mprev-img" style="font-size:32px;">
              ${renderBannerImageHtml(item.imageUrl)}
            </div>
          </div>
        </div>
      </div>
    `;

    // Hook reactive inputs
    ['banner-input-tag', 'banner-input-title', 'banner-input-subtitle', 'banner-input-btn'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', window.refreshModalPreview);
    });

    modalFooter.innerHTML = `
      <button class="btn-secondary" onclick="window.closeModal()">Cancel</button>
      <button class="btn-primary" style="width:auto; padding: 10px 24px;" onclick="window.saveBanner('${item.id || ''}')">
        <span class="material-symbols-outlined">save</span>
        <span>${isEdit ? 'Save Changes' : 'Create Banner'}</span>
      </button>
    `;

    modalBackdrop.classList.add('active');
  };

  window.selectModalBannerImage = function(imgKey) {
    document.getElementById('banner-input-image').value = imgKey;
    document.querySelectorAll('[id^="img-choice-"]').forEach(el => {
      el.style.border = '2px solid var(--border-color)';
      el.style.background = '#FFFFFF';
    });
    const selected = document.getElementById(`img-choice-${imgKey}`);
    if (selected) {
      selected.style.border = '2px solid var(--primary)';
      selected.style.background = 'var(--bg-body)';
    }
    const customInput = document.getElementById('banner-custom-image-url');
    if (customInput) customInput.value = '';
    window.refreshModalPreview();
  };

  window.setCustomBannerImageUrl = function(url) {
    if (url && url.trim().length > 0) {
      document.getElementById('banner-input-image').value = url.trim();
      document.querySelectorAll('[id^="img-choice-"]').forEach(el => {
        el.style.border = '2px solid var(--border-color)';
        el.style.background = '#FFFFFF';
      });
      window.refreshModalPreview();
    }
  };

  window.applyBannerPalette = function(bg, text, tag) {
    document.getElementById('banner-color-bg').value = bg;
    document.getElementById('banner-input-bg').value = bg;
    document.getElementById('banner-color-text').value = text;
    document.getElementById('banner-input-text').value = text;
    document.getElementById('banner-color-tag').value = tag;
    document.getElementById('banner-input-tag-color').value = tag;
    window.refreshModalPreview();
  };

  window.refreshModalPreview = function() {
    const bg = document.getElementById('banner-input-bg')?.value || '#C5E76C';
    const text = document.getElementById('banner-input-text')?.value || '#000000';
    const tagColor = document.getElementById('banner-input-tag-color')?.value || '#17324F';
    const tag = document.getElementById('banner-input-tag')?.value || 'PROMO';
    const title = document.getElementById('banner-input-title')?.value || 'Title';
    const sub = document.getElementById('banner-input-subtitle')?.value || '';
    const btn = document.getElementById('banner-input-btn')?.value || 'Explore';
    const img = document.getElementById('banner-input-image')?.value || 'gift-box';

    const card = document.getElementById('modal-card-preview');
    if (card) {
      card.style.background = bg;
      card.style.color = text;
    }
    const tEl = document.getElementById('mprev-tag');
    if (tEl) {
      tEl.textContent = tag;
      tEl.style.color = tagColor;
    }
    const tiEl = document.getElementById('mprev-title');
    if (tiEl) {
      tiEl.textContent = title;
      tiEl.style.color = text;
    }
    const sEl = document.getElementById('mprev-sub');
    if (sEl) {
      sEl.textContent = sub;
      sEl.style.color = text;
    }
    const bEl = document.getElementById('mprev-btn');
    if (bEl) {
      bEl.textContent = btn;
      bEl.style.background = tagColor;
    }
    const iEl = document.getElementById('mprev-img');
    if (iEl) {
      iEl.innerHTML = renderBannerImageHtml(img);
    }
  };

  window.saveBanner = async function(id) {
    const tag = document.getElementById('banner-input-tag')?.value.trim();
    const title = document.getElementById('banner-input-title')?.value.trim();
    const subtitle = document.getElementById('banner-input-subtitle')?.value.trim();
    const buttonText = document.getElementById('banner-input-btn')?.value.trim() || 'Explore';
    const actionUrl = document.getElementById('banner-input-route')?.value.trim() || '/(tabs)/services';
    const imageUrl = document.getElementById('banner-input-image')?.value.trim() || 'gift-box';
    const bgColor = document.getElementById('banner-input-bg')?.value.trim() || '#C5E76C';
    const textColor = document.getElementById('banner-input-text')?.value.trim() || '#000000';
    const tagColor = document.getElementById('banner-input-tag-color')?.value.trim() || '#17324F';
    const displayOrder = parseInt(document.getElementById('banner-input-order')?.value, 10) || 0;
    const isActive = document.getElementById('banner-input-active')?.checked;

    if (!tag || !title) {
      alert('Please provide both a tag and a title for the banner.');
      return;
    }

    const payload = {
      tag,
      title,
      subtitle: subtitle || null,
      buttonText,
      actionUrl,
      imageUrl,
      bgColor,
      textColor,
      tagColor,
      displayOrder,
      isActive: Boolean(isActive)
    };

    const isEdit = Boolean(id);
    const endpoint = isEdit ? `/admin/banners/${id}` : '/admin/banners';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await apiRequest(endpoint, {
      method,
      body: JSON.stringify(payload)
    });

    if (!res.success) {
      alert(`Failed to save banner: ${res.error}`);
      return;
    }

    closeModal();
    showToast(`Banner "${title}" saved successfully!`);
    renderBanners(document.getElementById('view-content-root'));
  };

  window.toggleBannerActive = async function(id, currentActive) {
    const res = await apiRequest(`/admin/banners/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ isActive: !currentActive })
    });
    if (!res.success) {
      alert(`Failed to update banner status: ${res.error}`);
      return;
    }
    showToast('Banner visibility updated.');
    renderBanners(document.getElementById('view-content-root'));
  };

  window.deleteBanner = async function(id) {
    if (!confirm('Are you sure you want to delete this promotional banner?')) return;
    const res = await apiRequest(`/admin/banners/${id}`, { method: 'DELETE' });
    if (!res.success) {
      alert(`Failed to delete banner: ${res.error}`);
      return;
    }
    showToast('Banner deleted successfully.');
    renderBanners(document.getElementById('view-content-root'));
  };

  // Helper UI
  function renderErrorAlert(msg, retryFn) {
    return `
      <div style="padding: 40px; text-align: center; background: #FFFFFF; border: 1px solid var(--border-color); border-radius: var(--radius-md);">
        <span class="material-symbols-outlined" style="font-size: 2.5rem; color: var(--danger); margin-bottom: 12px; display: block;">error</span>
        <h3 style="font-family: var(--font-heading); color: var(--navy); margin-bottom: 6px;">Failed to Load Operational Data</h3>
        <p style="color: var(--text-muted); font-size: 0.88rem; margin-bottom: 20px;">${msg || 'Backend API unreachable or request failed.'}</p>
        <button class="btn-primary" style="display: inline-flex; width: auto; padding: 10px 24px;" onclick="window.retryCurrentView()">
          <span class="material-symbols-outlined">refresh</span>
          <span>Retry</span>
        </button>
      </div>
    `;
  }

  window.retryCurrentView = () => renderView(activeTab);

  window.closeDrawer = () => drawerBackdrop.classList.remove('active');
  window.closeModal = () => modalBackdrop.classList.remove('active');

  function showToast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `
      <span class="material-symbols-outlined" style="color:var(--primary);">check_circle</span>
      <span>${msg}</span>
    `;
    toastContainer.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
      el.style.transition = 'all 0.3s ease';
      setTimeout(() => el.remove(), 300);
    }, 3500);
  }

  // Backdrop click dismiss
  drawerBackdrop.addEventListener('click', (e) => {
    if (e.target === drawerBackdrop) closeDrawer();
  });
  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeModal();
  });

})();
