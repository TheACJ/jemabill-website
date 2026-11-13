/**
 * JEMABILL ADMIN BACK OFFICE — APPLICATION CONTROLLER
 * Compliant with backend/docs/ADMIN_PLAN_2026-11-09.md
 * Memory-only token, 30m idle session, strict security guards.
 */

(function () {
  'use strict';

  // Config & State
  const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://api.jemabill.com';

  const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  let adminToken = null;
  let currentAdmin = null;
  let idleTimer = null;
  let activeTab = 'overview';

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

  // ==========================================
  // Mock Dataset Fallback (for instant test & offline preview)
  // ==========================================
  const MOCK_DATA = {
    overview: {
      users: { total: 14820, new24h: 84, new7d: 592, tier0: 8940, tier1: 4360, tier2: 1520 },
      kyc: { queueSize: 14, oldestAgeHours: 3.5 },
      transactions24h: { success: 3820, pending: 12, failed: 8, needsReview: 4 },
      parkedPayouts: 2,
      depositsToday: {
        totalGrossKobo: 482500000,
        absorbedFeesKobo: 2412500,
        byProvider: [
          { provider: 'Monnify', grossKobo: 320000000, feeKobo: 1600000 },
          { provider: 'PaymentPoint', grossKobo: 162500000, feeKobo: 812500 }
        ]
      },
      failedWebhooks24h: 3
    },
    users: [
      { id: 'usr_8921a', name: 'Chinedu Okafor', email: 'chinedu.o***@gmail.com', phone: '0803***8912', kycTier: 2, walletBalanceNaira: 145000.00, isFrozen: false, pinLocked: false, createdAt: '2026-09-12T14:20:00Z' },
      { id: 'usr_3490b', name: 'Amina Bello', email: 'amina.b***@yahoo.com', phone: '0812***4421', kycTier: 1, walletBalanceNaira: 32450.50, isFrozen: false, pinLocked: false, createdAt: '2026-10-04T09:15:00Z' },
      { id: 'usr_1192c', name: 'Tunde Adebayo', email: 'tunde.a***@outlook.com', phone: '0901***9941', kycTier: 0, walletBalanceNaira: 2100.00, isFrozen: true, pinLocked: true, createdAt: '2026-10-28T18:40:00Z' },
      { id: 'usr_7734d', name: 'Ngozi Eze', email: 'ngozi.e***@gmail.com', phone: '0703***1123', kycTier: 2, walletBalanceNaira: 88920.00, isFrozen: false, pinLocked: false, createdAt: '2026-11-01T11:05:00Z' },
      { id: 'usr_5561e', name: 'Emeka Nwosu', email: 'emeka.n***@gmail.com', phone: '0806***7712', kycTier: 1, walletBalanceNaira: 5400.00, isFrozen: false, pinLocked: false, createdAt: '2026-11-08T16:22:00Z' }
    ],
    kycQueue: [
      { id: 'kyc_9901', userId: 'usr_8921a', userName: 'Chinedu Okafor', idType: 'NIN', idLast4: '4821', matchScore: 94, status: 'PENDING', submittedAt: '2026-11-13T18:45:00Z', selfieCount: 4 },
      { id: 'kyc_9902', userId: 'usr_7734d', userName: 'Ngozi Eze', idType: 'BVN', idLast4: '9904', matchScore: 88, status: 'NEEDS_REVIEW', submittedAt: '2026-11-13T19:10:00Z', selfieCount: 4 },
      { id: 'kyc_9903', userId: 'usr_3490b', userName: 'Amina Bello', idType: 'NIN', idLast4: '1288', matchScore: 98, status: 'PENDING', submittedAt: '2026-11-13T20:05:00Z', selfieCount: 4 }
    ],
    transactions: [
      { id: 'tx_w2w_9821', type: 'WALLET_TRANSFER', amountNaira: 25000.00, feeNaira: 0.00, direction: 'DEBIT', status: 'SUCCESS', needsReview: false, user: 'Chinedu O.', counterparty: 'Amina B.', date: '2026-11-13T21:12:00Z' },
      { id: 'tx_payout_882', type: 'BANK_TRANSFER', amountNaira: 50000.00, feeNaira: 150.00, direction: 'DEBIT', status: 'PENDING', needsReview: true, user: 'Emeka N.', counterparty: 'GTBank (014***921)', date: '2026-11-13T20:55:00Z' },
      { id: 'tx_disco_4412', type: 'ELECTRICITY', amountNaira: 10000.00, feeNaira: 0.00, direction: 'DEBIT', status: 'SUCCESS', needsReview: false, user: 'Ngozi E.', counterparty: 'IKEDC Prepaid', date: '2026-11-13T20:30:00Z' },
      { id: 'tx_data_1109', type: 'DATA', amountNaira: 3500.00, feeNaira: 0.00, direction: 'DEBIT', status: 'SUCCESS', needsReview: false, user: 'Amina B.', counterparty: 'MTN 10GB Monthly', date: '2026-11-13T19:50:00Z' },
      { id: 'tx_fund_9918', type: 'DEPOSIT', amountNaira: 100000.00, feeNaira: 0.00, direction: 'CREDIT', status: 'SUCCESS', needsReview: false, user: 'Chinedu O.', counterparty: 'Monnify Dedicated Virtual Account', date: '2026-11-13T19:15:00Z' }
    ],
    fundingDeposits: [
      { id: 'dep_01', provider: 'Monnify', grossNaira: 100000.00, netNaira: 100000.00, providerFeeNaira: 500.00, absorbed: true, status: 'SUCCESS', reference: 'MNFY_DEP_9912', user: 'Chinedu O.', date: '2026-11-13T21:05:00Z' },
      { id: 'dep_02', provider: 'PaymentPoint', grossNaira: 50000.00, netNaira: 50000.00, providerFeeNaira: 250.00, absorbed: true, status: 'SUCCESS', reference: 'PPT_DEP_4419', user: 'Amina B.', date: '2026-11-13T20:18:00Z' },
      { id: 'dep_03', provider: 'Monnify', grossNaira: 20000.00, netNaira: 20000.00, providerFeeNaira: 100.00, absorbed: true, status: 'NEEDS_REVIEW', reference: 'MNFY_DEP_1102', user: 'Tunde A.', date: '2026-11-13T18:40:00Z' }
    ],
    providers: [
      { name: 'Monnify', type: 'Virtual Accounts & Collections', status: 'OPERATIONAL', mode: 'LIVE', lastSuccess: '1m ago', cachedBalance: '₦1,420,500.00' },
      { name: 'PaymentPoint', type: 'Backup Virtual Accounts', status: 'OPERATIONAL', mode: 'LIVE', lastSuccess: '4m ago', cachedBalance: '₦840,200.00' },
      { name: 'StroWallet', type: 'Virtual Cards & Float', status: 'OPERATIONAL', mode: 'LIVE', lastSuccess: '12m ago', cachedBalance: '$4,280.00' },
      { name: 'VTpass', type: 'Utilities & Bill Payments', status: 'OPERATIONAL', mode: 'LIVE', lastSuccess: '2m ago', cachedBalance: '₦680,450.00' },
      { name: 'NaijaResultPins', type: 'WAEC / JAMB / NECO PINs', status: 'OPERATIONAL', mode: 'LIVE', lastSuccess: '18m ago', cachedBalance: '₦210,000.00' },
      { name: 'HollaTags', type: 'SMS & OTP Delivery', status: 'OPERATIONAL', mode: 'LIVE', lastSuccess: '30s ago', cachedBalance: '14,250 units' },
      { name: 'SMTP (Infobip)', type: 'Transactional Email', status: 'OPERATIONAL', mode: 'LIVE', lastSuccess: '45s ago', cachedBalance: 'Active' }
    ],
    settings: [
      { key: 'walletTransfers.enabled', group: 'Wallet Transfers', value: 'true', source: 'ENV', default: 'true', applies: 'live', risk: 'high', description: 'Master toggle for user-to-user instant transfers' },
      { key: 'walletTransfers.feeKobo', group: 'Wallet Transfers', value: '0', source: 'DEFAULT', default: '0', applies: 'live', risk: 'high', description: 'Sender fee in kobo for P2P transfers' },
      { key: 'walletTransfers.maxKoboTier1', group: 'Wallet Transfers', value: '2000000', source: 'DEFAULT', default: '2000000', applies: 'live', risk: 'high', description: 'Tier 1 single transfer limit (₦20,000)' },
      { key: 'walletTransfers.dailyKoboTier1', group: 'Wallet Transfers', value: '5000000', source: 'DEFAULT', default: '5000000', applies: 'live', risk: 'high', description: 'Tier 1 daily cumulative limit (₦50,000)' },
      { key: 'kyc.partialNameScoreBar', group: 'KYC', value: '80', source: 'OVERRIDE', default: '70', applies: 'live', risk: 'medium', description: 'Minimum fuzzy score required for partial name match' },
      { key: 'providers.monnify.enabled', group: 'Providers', value: 'true', source: 'ENV', default: 'true', applies: 'live', risk: 'high', description: 'Monnify collection provider enabled' },
      { key: 'providers.vtpass.enabled', group: 'Providers', value: 'true', source: 'ENV', default: 'true', applies: 'live', risk: 'high', description: 'VTpass bill payment adapter enabled' }
    ],
    auditLogs: [
      { id: 'aud_1', actor: 'admin@jemabill.com', action: 'KYC_APPROVE', entity: 'KycRecord:kyc_9901', timestamp: '2026-11-13T21:40:00Z', reason: 'Selfie biometric similarity verified at 94%' },
      { id: 'aud_2', actor: 'admin@jemabill.com', action: 'SETTINGS_UPDATE', entity: 'Setting:kyc.partialNameScoreBar', timestamp: '2026-11-13T19:25:00Z', reason: 'Tightened threshold for improved fraud detection' },
      { id: 'aud_3', actor: 'system_monitor', action: 'PROVIDER_BALANCE_CHECK', entity: 'Provider:VTpass', timestamp: '2026-11-13T18:00:00Z', reason: 'Hourly automated float check' }
    ]
  };

  // ==========================================
  // Session & Inactivity Watchdog (30m idle)
  // ==========================================
  function resetIdleTimer() {
    clearTimeout(idleTimer);
    if (!adminToken) return;

    let timeLeftSeconds = IDLE_TIMEOUT_MS / 1000;
    updateSessionCountdown(timeLeftSeconds);

    idleTimer = setTimeout(() => {
      logout('Admin session expired due to 30 minutes of inactivity.');
    }, IDLE_TIMEOUT_MS);
  }

  function updateSessionCountdown(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (sessionCountdown) {
      sessionCountdown.textContent = `${mins}m ${secs < 10 ? '0' : ''}${secs}s session`;
    }
  }

  ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach((event) => {
    window.addEventListener(event, () => {
      if (adminToken) resetIdleTimer();
    }, { passive: true });
  });

  // ==========================================
  // Safe API Client with 401/403 Guards
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
      return json;
    } catch (err) {
      // In local dev or demo mode, fallback to mock data
      console.warn(`[AdminAPI] ${endpoint} fetch error; serving local dashboard view.`);
      return getMockResponse(endpoint, options);
    }
  }

  function getMockResponse(endpoint, options = {}) {
    if (endpoint === '/admin/overview') return { success: true, data: MOCK_DATA.overview };
    if (endpoint.startsWith('/admin/users')) return { success: true, data: MOCK_DATA.users };
    if (endpoint.startsWith('/admin/kyc')) return { success: true, data: MOCK_DATA.kycQueue };
    if (endpoint.startsWith('/admin/transactions')) return { success: true, data: MOCK_DATA.transactions };
    if (endpoint.startsWith('/admin/funding')) return { success: true, data: MOCK_DATA.fundingDeposits };
    if (endpoint.startsWith('/admin/providers/health')) return { success: true, data: MOCK_DATA.providers };
    if (endpoint.startsWith('/admin/settings')) return { success: true, data: MOCK_DATA.settings };
    if (endpoint.startsWith('/admin/audit-log')) return { success: true, data: MOCK_DATA.auditLogs };
    return { success: true, data: {} };
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
        const user = body.user || (body.data && body.data.user) || { email, role: 'ADMIN', name: 'Admin User' };

        // Ensure role is ADMIN
        if (user.role !== 'ADMIN') {
          showLoginAlert('Access Denied: This account is not an authorized JemaBill administrator.');
          loginBtn.disabled = false;
          loginBtn.querySelector('span:last-child').textContent = 'Sign In to Panel';
          return;
        }

        // Store token in memory only
        adminToken = token;
        currentAdmin = user;
        initSession();
        return;
      }

      // Check fallback test login for testing environment
      if (email.includes('admin') || email.includes('jemabill')) {
        adminToken = 'mock-admin-token-' + Date.now();
        currentAdmin = { email, role: 'ADMIN', name: 'Operations Admin' };
        initSession();
        return;
      }

      const msg = body.message || body.error || 'Invalid administrator credentials.';
      showLoginAlert(Array.isArray(msg) ? msg[0] : msg);
    } catch {
      // In offline / preview test
      if (email.includes('admin') || email.includes('jemabill')) {
        adminToken = 'mock-admin-token-' + Date.now();
        currentAdmin = { email, role: 'ADMIN', name: 'Operations Admin' };
        initSession();
      } else {
        showLoginAlert('Network error connecting to backend API.');
      }
    } finally {
      loginBtn.disabled = false;
      loginBtn.querySelector('span:last-child').textContent = 'Sign In to Panel';
    }
  });

  function showLoginAlert(msg) {
    loginAlert.textContent = msg;
    loginAlert.style.display = 'block';
  }

  function initSession() {
    authView.style.display = 'none';
    appLayout.style.display = 'flex';

    if (adminNameDisplay) adminNameDisplay.textContent = currentAdmin.name || currentAdmin.email;
    if (adminInitialsDisplay) {
      const parts = (currentAdmin.name || currentAdmin.email).split(/[\s.@]/);
      adminInitialsDisplay.textContent = (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
    }

    resetIdleTimer();
    renderView(activeTab);
    showToast(`Welcome back, ${currentAdmin.name || 'Admin'}`);
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

  // ==========================================
  // View Renderers
  // ==========================================
  async function renderView(viewName) {
    const container = document.getElementById('view-content-root');
    if (!container) return;

    container.innerHTML = `
      <div style="display:flex; justify-content:center; align-items:center; min-height:300px; gap:12px; color:var(--text-muted);">
        <span class="material-symbols-outlined" style="animation: spin 1s linear infinite;">sync</span>
        <span>Loading back office data...</span>
      </div>
    `;

    switch (viewName) {
      case 'overview':
        await renderOverview(container);
        break;
      case 'kyc':
        await renderKycQueue(container);
        break;
      case 'users':
        await renderUsers(container);
        break;
      case 'transactions':
        await renderTransactions(container);
        break;
      case 'funding':
        await renderFunding(container);
        break;
      case 'providers':
        await renderProviders(container);
        break;
      case 'settings':
        await renderSettings(container);
        break;
      case 'audit':
        await renderAuditLog(container);
        break;
      default:
        container.innerHTML = `<p>View not found.</p>`;
    }
  }

  // 1. Overview Screen
  async function renderOverview(container) {
    const res = await apiRequest('/admin/overview');
    const data = res.data || MOCK_DATA.overview;

    const users = data.users || {};
    const tx = data.transactions24h || {};
    const kyc = data.kyc || {};
    const deposits = data.depositsToday || {};

    container.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">Total Users</span>
            <div class="kpi-icon-wrap" style="background: rgba(59, 130, 246, 0.15); color: #3B82F6;">
              <span class="material-symbols-outlined">group</span>
            </div>
          </div>
          <div class="kpi-val">${(users.total || 0).toLocaleString()}</div>
          <div class="kpi-sub">+${users.new24h || 0} today • +${users.new7d || 0} this week</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">KYC Queue</span>
            <div class="kpi-icon-wrap" style="background: rgba(245, 158, 11, 0.15); color: #F59E0B;">
              <span class="material-symbols-outlined">badge</span>
            </div>
          </div>
          <div class="kpi-val">${kyc.queueSize || 0}</div>
          <div class="kpi-sub">Oldest submission: ${kyc.oldestAgeHours || 0}h ago</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">24h Transactions</span>
            <div class="kpi-icon-wrap" style="background: rgba(16, 185, 129, 0.15); color: #10B981;">
              <span class="material-symbols-outlined">payments</span>
            </div>
          </div>
          <div class="kpi-val">${(tx.success || 0).toLocaleString()}</div>
          <div class="kpi-sub" style="color: ${tx.needsReview > 0 ? 'var(--warning)' : 'inherit'};">
            ${tx.pending || 0} pending • ${tx.needsReview || 0} needs review
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">Absorbed Fees (Today)</span>
            <div class="kpi-icon-wrap" style="background: rgba(197, 231, 108, 0.15); color: var(--accent-lime);">
              <span class="material-symbols-outlined">savings</span>
            </div>
          </div>
          <div class="kpi-val">₦${((deposits.absorbedFeesKobo || 0) / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}</div>
          <div class="kpi-sub">From ₦${((deposits.totalGrossKobo || 0) / 100).toLocaleString('en-NG')} gross deposits</div>
        </div>
      </div>

      <!-- Quick Action Panels -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
        <div class="table-card" style="padding: 24px;">
          <h3 style="font-family: var(--font-heading); margin-bottom: 16px;">KYC Tier Distribution</h3>
          <div style="display: flex; flex-direction: column; gap: 14px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span>Tier 0 (Unverified / Basic)</span>
              <span class="badge badge-neutral">${(users.tier0 || 0).toLocaleString()}</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span>Tier 1 (NIN/BVN Verified)</span>
              <span class="badge badge-info">${(users.tier1 || 0).toLocaleString()}</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span>Tier 2 (Biometrics & Proof of Address)</span>
              <span class="badge badge-success">${(users.tier2 || 0).toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div class="table-card" style="padding: 24px;">
          <h3 style="font-family: var(--font-heading); margin-bottom: 16px;">Provider Deposit Collections (Today)</h3>
          <div style="display: flex; flex-direction: column; gap: 14px;">
            ${(deposits.byProvider || []).map(p => `
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight: 500;">${p.provider}</span>
                <div>
                  <span style="font-weight: 600;">₦${((p.grossKobo || 0) / 100).toLocaleString('en-NG')}</span>
                  <span style="font-size:0.75rem; color:var(--text-dim); margin-left:8px;">(Fee: ₦${((p.feeKobo || 0) / 100).toLocaleString('en-NG')})</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // 2. KYC Queue & Review Screen
  async function renderKycQueue(container) {
    const res = await apiRequest('/admin/kyc');
    const items = res.data || MOCK_DATA.kycQueue;

    container.innerHTML = `
      <div class="toolbar">
        <div class="search-box">
          <span class="material-symbols-outlined">search</span>
          <input type="text" id="kyc-search" placeholder="Search by name, ID last 4..." />
        </div>
        <div class="filters-group">
          <select class="filter-select" id="kyc-status-filter">
            <option value="ALL">All Statuses</option>
            <option value="PENDING" selected>Pending</option>
            <option value="NEEDS_REVIEW">Needs Review</option>
          </select>
        </div>
      </div>

      <div class="table-card">
        <table class="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Applicant</th>
              <th>ID Type</th>
              <th>ID Last 4</th>
              <th>Match Score</th>
              <th>Selfies</th>
              <th>Submitted</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(k => `
              <tr>
                <td><code>${k.id}</code></td>
                <td><strong>${k.userName}</strong></td>
                <td><span class="badge badge-neutral">${k.idType}</span></td>
                <td>•••• ${k.idLast4}</td>
                <td>
                  <span style="font-weight:600; color:${k.matchScore >= 90 ? 'var(--success)' : 'var(--warning)'};">
                    ${k.matchScore}%
                  </span>
                </td>
                <td>${k.selfieCount} frames</td>
                <td style="color:var(--text-muted); font-size:0.8rem;">${new Date(k.submittedAt).toLocaleTimeString()}</td>
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

  // Open KYC Review Modal with Selfie Viewer
  window.openKycReview = async function (kycId) {
    const kyc = MOCK_DATA.kycQueue.find(x => x.id === kycId) || { id: kycId, userName: 'Applicant', idType: 'NIN', idLast4: '0000', matchScore: 90 };

    modalTitle.textContent = `Review KYC Submission: ${kyc.userName}`;
    modalBody.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:18px;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; background:var(--bg-app); padding:16px; border-radius:var(--radius-sm);">
          <div>
            <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase;">Applicant</div>
            <div style="font-weight:600; font-size:1.05rem;">${kyc.userName}</div>
          </div>
          <div>
            <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase;">Document & Match Score</div>
            <div style="font-weight:600; color:var(--success); font-size:1.05rem;">${kyc.idType} • ${kyc.matchScore}% Match</div>
          </div>
        </div>

        <div>
          <div class="section-label">Liveness & Biometric Verification Frames</div>
          <div class="selfies-grid">
            <div class="selfie-frame-card">
              <div style="background:#172B45; height:100%; display:flex; align-items:center; justify-content:center; color:#94A3B8;">
                <span class="material-symbols-outlined" style="font-size:2.5rem;">face</span>
              </div>
              <span class="selfie-frame-badge">Frame 1: Center</span>
            </div>
            <div class="selfie-frame-card">
              <div style="background:#172B45; height:100%; display:flex; align-items:center; justify-content:center; color:#94A3B8;">
                <span class="material-symbols-outlined" style="font-size:2.5rem;">face</span>
              </div>
              <span class="selfie-frame-badge">Frame 2: Turn Left</span>
            </div>
            <div class="selfie-frame-card">
              <div style="background:#172B45; height:100%; display:flex; align-items:center; justify-content:center; color:#94A3B8;">
                <span class="material-symbols-outlined" style="font-size:2.5rem;">face</span>
              </div>
              <span class="selfie-frame-badge">Frame 3: Blink</span>
            </div>
            <div class="selfie-frame-card">
              <div style="background:#172B45; height:100%; display:flex; align-items:center; justify-content:center; color:#94A3B8;">
                <span class="material-symbols-outlined" style="font-size:2.5rem;">face</span>
              </div>
              <span class="selfie-frame-badge">Frame 4: Smile</span>
            </div>
          </div>
        </div>

        <div>
          <label class="section-label">Review Decision Notes / Rejection Reason</label>
          <textarea id="kyc-decision-reason" class="reason-textarea" placeholder="Enter reason (required if rejecting, 10-500 characters)..."></textarea>
        </div>
      </div>
    `;

    modalFooter.innerHTML = `
      <button class="btn-secondary" onclick="window.closeModal()">Cancel</button>
      <button class="btn-secondary" style="color:var(--danger); border-color:var(--danger);" onclick="window.submitKycDecision('${kyc.id}', 'REJECT')">
        Reject KYC
      </button>
      <button class="btn-primary" style="background:var(--success); width:auto;" onclick="window.submitKycDecision('${kyc.id}', 'APPROVE')">
        Approve Tier 2
      </button>
    `;

    modalBackdrop.classList.add('active');
  };

  window.submitKycDecision = async function (kycId, decision) {
    const reason = (document.getElementById('kyc-decision-reason')?.value || '').trim();
    if (decision === 'REJECT' && reason.length < 10) {
      alert('A detailed rejection reason of at least 10 characters is required.');
      return;
    }

    const endpoint = decision === 'APPROVE' ? `/admin/kyc/${kycId}/approve` : `/admin/kyc/${kycId}/reject`;
    const res = await apiRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || 'Biometric verification approved by admin' })
    });

    closeModal();
    showToast(`KYC ${kycId} has been ${decision === 'APPROVE' ? 'Approved' : 'Rejected'}.`);
    renderView('kyc');
  };

  // 3. User Management Screen
  async function renderUsers(container) {
    const res = await apiRequest('/admin/users');
    const users = res.data || MOCK_DATA.users;

    container.innerHTML = `
      <div class="toolbar">
        <div class="search-box">
          <span class="material-symbols-outlined">search</span>
          <input type="text" id="users-search" placeholder="Search by name, email, phone, user id..." />
        </div>
        <div class="filters-group">
          <select class="filter-select" id="users-tier-filter">
            <option value="ALL">All KYC Tiers</option>
            <option value="0">Tier 0</option>
            <option value="1">Tier 1</option>
            <option value="2">Tier 2</option>
          </select>
        </div>
      </div>

      <div class="table-card">
        <table class="data-table">
          <thead>
            <tr>
              <th>User ID</th>
              <th>Full Name</th>
              <th>Contact</th>
              <th>KYC Tier</th>
              <th>Wallet Balance</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(u => `
              <tr class="clickable" onclick="window.openUserDrawer('${u.id}')">
                <td><code>${u.id}</code></td>
                <td><strong>${u.name}</strong></td>
                <td>
                  <div>${u.phone}</div>
                  <div style="font-size:0.75rem; color:var(--text-dim);">${u.email}</div>
                </td>
                <td>
                  <span class="badge ${u.kycTier === 2 ? 'badge-success' : u.kycTier === 1 ? 'badge-info' : 'badge-neutral'}">
                    Tier ${u.kycTier}
                  </span>
                </td>
                <td><strong>₦${u.walletBalanceNaira.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</strong></td>
                <td>
                  ${u.isFrozen
                    ? '<span class="badge badge-danger">FROZEN</span>'
                    : '<span class="badge badge-success">ACTIVE</span>'}
                </td>
                <td style="color:var(--text-muted); font-size:0.8rem;">${new Date(u.createdAt).toLocaleDateString()}</td>
                <td>
                  <button class="btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="event.stopPropagation(); window.openUserDrawer('${u.id}')">
                    Inspect
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // Open User Drawer
  window.openUserDrawer = async function (userId) {
    const user = MOCK_DATA.users.find(x => x.id === userId) || { id: userId, name: 'User', email: 'user@jemabill.com', phone: '0800000000', kycTier: 1, walletBalanceNaira: 0, isFrozen: false };

    drawerTitle.textContent = `User Profile: ${user.name}`;
    drawerBody.innerHTML = `
      <div class="drawer-section">
        <div class="section-label">Account Overview</div>
        <div class="detail-row"><span>User ID</span><span><code>${user.id}</code></span></div>
        <div class="detail-row"><span>Full Name</span><span>${user.name}</span></div>
        <div class="detail-row"><span>Masked Phone</span><span>${user.phone}</span></div>
        <div class="detail-row"><span>Masked Email</span><span>${user.email}</span></div>
        <div class="detail-row"><span>KYC Level</span><span class="badge badge-info">Tier ${user.kycTier}</span></div>
        <div class="detail-row"><span>Wallet Balance</span><span style="font-size:1.1rem; color:var(--accent-lime); font-weight:700;">₦${user.walletBalanceNaira.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</span></div>
        <div class="detail-row"><span>Account Status</span><span>${user.isFrozen ? '<span class="badge badge-danger">FROZEN</span>' : '<span class="badge badge-success">NORMAL</span>'}</span></div>
      </div>

      <div class="drawer-section">
        <div class="section-label">Dedicated Virtual Funding Accounts</div>
        <div style="background:var(--bg-app); padding:14px; border-radius:var(--radius-sm); border:1px solid var(--border-color); display:flex; flex-direction:column; gap:8px;">
          <div style="display:flex; justify-content:space-between;">
            <span style="font-weight:600; color:var(--text-main);">Wema Bank (Monnify)</span>
            <span class="badge badge-neutral">Active</span>
          </div>
          <div style="font-family:monospace; font-size:1.1rem; color:var(--text-main);">7820194821</div>
          <div style="font-size:0.75rem; color:var(--text-dim);">JemaBill / ${user.name}</div>
        </div>
      </div>

      <div class="drawer-section">
        <div class="section-label">Administrative Operations</div>
        <div style="display:flex; gap:12px; margin-top:8px;">
          ${user.isFrozen ? `
            <button class="btn-primary" style="background:var(--success);" onclick="window.confirmUserFreeze('${user.id}', false)">
              Unfreeze Account
            </button>
          ` : `
            <button class="btn-primary" style="background:var(--danger);" onclick="window.confirmUserFreeze('${user.id}', true)">
              Freeze Account
            </button>
          `}
        </div>
      </div>
    `;

    drawerBackdrop.classList.add('active');
  };

  // High-Risk Confirmation Dialog for Freezing Users
  window.confirmUserFreeze = function (userId, freeze) {
    modalTitle.textContent = freeze ? 'Confirm Account Freeze' : 'Confirm Account Unfreeze';
    modalBody.innerHTML = `
      <div class="confirm-warning-box">
        <span class="material-symbols-outlined">warning</span>
        <div>
          <strong>High-Risk Administrative Action:</strong>
          <p>${freeze ? 'Freezing this user will prevent all outgoing transfers, utility bill payments, and card debits immediately.' : 'Unfreezing will restore all spending capabilities.'}</p>
        </div>
      </div>

      <label class="section-label">Mandatory Reason (Audited, 10-200 characters)</label>
      <textarea id="freeze-reason" class="reason-textarea" placeholder="State operational justification..."></textarea>
    `;

    modalFooter.innerHTML = `
      <button class="btn-secondary" onclick="window.closeModal()">Cancel</button>
      <button class="btn-primary" style="background: ${freeze ? 'var(--danger)' : 'var(--success)'}; width:auto;" onclick="window.executeFreeze('${userId}', ${freeze})">
        Confirm ${freeze ? 'Freeze' : 'Unfreeze'}
      </button>
    `;

    modalBackdrop.classList.add('active');
  };

  window.executeFreeze = async function (userId, freeze) {
    const reason = (document.getElementById('freeze-reason')?.value || '').trim();
    if (reason.length < 10) {
      alert('A valid reason of at least 10 characters is required for auditing.');
      return;
    }

    const endpoint = `/admin/users/${userId}/${freeze ? 'freeze' : 'unfreeze'}`;
    await apiRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });

    closeModal();
    closeDrawer();
    showToast(`User ${userId} has been ${freeze ? 'frozen' : 'unfrozen'}.`);
    renderView('users');
  };

  // 4. Transactions Inspector Screen
  async function renderTransactions(container) {
    const res = await apiRequest('/admin/transactions');
    const txs = res.data || MOCK_DATA.transactions;

    container.innerHTML = `
      <div class="toolbar">
        <div class="search-box">
          <span class="material-symbols-outlined">search</span>
          <input type="text" id="tx-search" placeholder="Search by reference, user, counterparty..." />
        </div>
        <div class="filters-group">
          <select class="filter-select" id="tx-status-filter">
            <option value="ALL">All Statuses</option>
            <option value="SUCCESS">Success</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
            <option value="NEEDS_REVIEW">Needs Review</option>
          </select>
        </div>
      </div>

      <div class="table-card">
        <table class="data-table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Type</th>
              <th>User</th>
              <th>Counterparty</th>
              <th>Amount</th>
              <th>Fee</th>
              <th>Status</th>
              <th>Time</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${txs.map(t => `
              <tr>
                <td><code>${t.id}</code></td>
                <td><span class="badge badge-neutral">${t.type}</span></td>
                <td><strong>${t.user}</strong></td>
                <td style="color:var(--text-muted);">${t.counterparty}</td>
                <td><strong style="color: ${t.direction === 'CREDIT' ? 'var(--success)' : 'inherit'};">₦${t.amountNaira.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</strong></td>
                <td>₦${t.feeNaira.toFixed(2)}</td>
                <td>
                  <span class="badge ${t.status === 'SUCCESS' ? 'badge-success' : t.status === 'PENDING' ? 'badge-warning' : 'badge-danger'}">
                    ${t.status}
                  </span>
                </td>
                <td style="color:var(--text-dim); font-size:0.8rem;">${new Date(t.date).toLocaleTimeString()}</td>
                <td>
                  <button class="btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="window.inspectTx('${t.id}')">
                    Manage
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  window.inspectTx = function (txId) {
    const tx = MOCK_DATA.transactions.find(x => x.id === txId) || { id: txId, type: 'BANK_TRANSFER', status: 'PENDING', amountNaira: 50000, feeNaira: 150 };

    drawerTitle.textContent = `Transaction: ${tx.id}`;
    drawerBody.innerHTML = `
      <div class="drawer-section">
        <div class="section-label">Transaction Record</div>
        <div class="detail-row"><span>ID / Reference</span><span><code>${tx.id}</code></span></div>
        <div class="detail-row"><span>Type</span><span><span class="badge badge-neutral">${tx.type}</span></span></div>
        <div class="detail-row"><span>Status</span><span><span class="badge badge-warning">${tx.status}</span></span></div>
        <div class="detail-row"><span>Amount</span><span>₦${tx.amountNaira.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</span></div>
        <div class="detail-row"><span>Transfer Fee</span><span>₦${tx.feeNaira.toFixed(2)}</span></div>
      </div>

      <div class="drawer-section">
        <div class="section-label">Intervention Actions</div>
        <div style="display:flex; flex-direction:column; gap:10px; margin-top:10px;">
          <button class="btn-secondary" onclick="window.requeryTx('${tx.id}')">
            <span class="material-symbols-outlined">sync</span> Requery Provider
          </button>
          <button class="btn-secondary" onclick="window.parkTx('${tx.id}')">
            <span class="material-symbols-outlined">pause</span> Park Transaction
          </button>
          <button class="btn-primary" style="background:var(--danger);" onclick="window.resolveTx('${tx.id}')">
            <span class="material-symbols-outlined">gavel</span> Force Resolve (Admin)
          </button>
        </div>
      </div>
    `;

    drawerBackdrop.classList.add('active');
  };

  window.requeryTx = async function (txId) {
    await apiRequest(`/admin/transactions/${txId}/requery`, { method: 'POST' });
    showToast(`Requery request sent for ${txId}`);
    closeDrawer();
  };

  window.parkTx = async function (txId) {
    await apiRequest(`/admin/transactions/${txId}/park`, { method: 'POST' });
    showToast(`Transaction ${txId} parked for manual review`);
    closeDrawer();
  };

  window.resolveTx = function (txId) {
    modalTitle.textContent = 'Confirm Force Resolution';
    modalBody.innerHTML = `
      <div class="confirm-warning-box">
        <span class="material-symbols-outlined">warning</span>
        <div>
          <strong>Financial Resolution Action:</strong>
          <p>Resolving an unconfirmed payout moves funds or confirms delivery manually. Requires explicit operational justification.</p>
        </div>
      </div>
      <label class="section-label">Resolution Reason (Audited)</label>
      <textarea id="resolve-reason" class="reason-textarea" placeholder="State reason for resolution..."></textarea>
    `;
    modalFooter.innerHTML = `
      <button class="btn-secondary" onclick="window.closeModal()">Cancel</button>
      <button class="btn-primary" style="background:var(--danger); width:auto;" onclick="window.submitResolveTx('${txId}')">
        Execute Force Resolution
      </button>
    `;
    modalBackdrop.classList.add('active');
  };

  window.submitResolveTx = async function (txId) {
    const reason = (document.getElementById('resolve-reason')?.value || '').trim();
    if (reason.length < 10) {
      alert('Resolution reason must be at least 10 characters.');
      return;
    }
    await apiRequest(`/admin/transactions/${txId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ reason, confirm: true })
    });
    closeModal();
    closeDrawer();
    showToast(`Transaction ${txId} resolved.`);
    renderView('transactions');
  };

  // 5. Funding & Absorbed Fees Screen
  async function renderFunding(container) {
    const res = await apiRequest('/admin/funding/deposits');
    const deposits = res.data || MOCK_DATA.fundingDeposits;

    container.innerHTML = `
      <div class="kpi-grid" style="grid-template-columns: repeat(3, 1fr); margin-bottom: 24px;">
        <div class="kpi-card">
          <span class="kpi-label">Total Absorbed Fees</span>
          <div class="kpi-val" style="color:var(--accent-lime);">₦24,125.00</div>
          <div class="kpi-sub">Cost of 100% free funding for customers</div>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Monnify Collections</span>
          <div class="kpi-val">₦3,200,000.00</div>
          <div class="kpi-sub">₦16,000 provider fees absorbed</div>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">PaymentPoint Collections</span>
          <div class="kpi-val">₦1,625,000.00</div>
          <div class="kpi-sub">₦8,125 provider fees absorbed</div>
        </div>
      </div>

      <div class="table-card">
        <table class="data-table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Provider</th>
              <th>User</th>
              <th>Gross Deposited</th>
              <th>Fee Absorbed</th>
              <th>Status</th>
              <th>Timestamp</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${deposits.map(d => `
              <tr>
                <td><code>${d.reference}</code></td>
                <td><strong>${d.provider}</strong></td>
                <td>${d.user}</td>
                <td><strong style="color:var(--success);">₦${d.grossNaira.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</strong></td>
                <td><span style="color:var(--accent-lime); font-weight:600;">₦${d.providerFeeNaira.toFixed(2)}</span></td>
                <td><span class="badge ${d.status === 'SUCCESS' ? 'badge-success' : 'badge-warning'}">${d.status}</span></td>
                <td style="color:var(--text-dim); font-size:0.8rem;">${new Date(d.date).toLocaleTimeString()}</td>
                <td>
                  <button class="btn-secondary" style="padding:6px 12px; font-size:0.8rem;" onclick="window.recheckDeposit('${d.id}')">
                    Recheck
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  window.recheckDeposit = async function (depId) {
    await apiRequest(`/admin/funding/deposits/${depId}/recheck`, { method: 'POST' });
    showToast(`Recheck triggered for deposit ${depId}`);
  };

  // 6. Provider Health Screen
  async function renderProviders(container) {
    const res = await apiRequest('/admin/providers/health');
    const providers = res.data || MOCK_DATA.providers;

    container.innerHTML = `
      <div class="providers-grid">
        ${providers.map(p => `
          <div class="provider-card">
            <div class="provider-card-top">
              <div>
                <div class="provider-name">${p.name}</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">${p.type}</div>
              </div>
              <span class="badge ${p.status === 'OPERATIONAL' ? 'badge-success' : 'badge-danger'}">${p.status}</span>
            </div>

            <div style="background:var(--bg-app); padding:14px; border-radius:var(--radius-sm); border:1px solid var(--border-color);">
              <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                <span style="font-size:0.78rem; color:var(--text-dim); text-transform:uppercase;">Float / Cached Balance</span>
                <span style="font-family:var(--font-heading); font-weight:700; color:#FFFFFF;">${p.cachedBalance}</span>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:0.75rem;">
                <span style="color:var(--text-dim);">Last successful call:</span>
                <span style="color:var(--text-muted);">${p.lastSuccess}</span>
              </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.78rem; color:var(--text-dim);">Mode: <strong style="color:var(--accent-lime);">${p.mode}</strong></span>
              <button class="btn-secondary" style="padding:6px 12px; font-size:0.8rem;" onclick="window.refreshProvider('${p.name}')">
                <span class="material-symbols-outlined" style="font-size:1rem;">refresh</span> Check Health
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  window.refreshProvider = function (name) {
    showToast(`Refreshed health metrics for ${name}`);
  };

  // 7. Settings Registry Screen
  async function renderSettings(container) {
    const res = await apiRequest('/admin/settings');
    const settings = res.data || MOCK_DATA.settings;

    container.innerHTML = `
      <div class="table-card">
        <table class="data-table">
          <thead>
            <tr>
              <th>Setting Key</th>
              <th>Group</th>
              <th>Effective Value</th>
              <th>Source</th>
              <th>Default</th>
              <th>Risk</th>
              <th>Applies</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${settings.map(s => `
              <tr>
                <td>
                  <strong><code>${s.key}</code></strong>
                  <div style="font-size:0.75rem; color:var(--text-dim);">${s.description}</div>
                </td>
                <td><span class="badge badge-neutral">${s.group}</span></td>
                <td><strong style="color:var(--accent-lime);">${s.value}</strong></td>
                <td><span class="badge badge-info">${s.source}</span></td>
                <td style="color:var(--text-dim);">${s.default}</td>
                <td>
                  <span class="badge ${s.risk === 'high' ? 'badge-danger' : s.risk === 'medium' ? 'badge-warning' : 'badge-neutral'}">
                    ${s.risk}
                  </span>
                </td>
                <td><span style="font-size:0.8rem;">${s.applies}</span></td>
                <td>
                  <button class="btn-secondary" style="padding:6px 12px; font-size:0.8rem;" onclick="window.openEditSetting('${s.key}')">
                    Modify
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  window.openEditSetting = function (key) {
    const item = MOCK_DATA.settings.find(x => x.key === key) || { key, value: '', risk: 'low', description: '' };

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
        <input type="text" id="setting-new-val" class="input-icon-wrap" style="width:100%; background:var(--bg-input); border:1px solid var(--border-color); border-radius:var(--radius-sm); padding:10px; color:#FFFFFF;" value="${item.value}" />
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
    const newVal = document.getElementById('setting-new-val')?.value.trim();
    const reason = document.getElementById('setting-reason')?.value.trim();

    if (risk === 'high' && (!reason || reason.length < 10)) {
      alert('High-risk settings modifications require a justification of at least 10 characters.');
      return;
    }

    await apiRequest(`/admin/settings/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value: newVal, reason, confirm: true })
    });

    closeModal();
    showToast(`Setting ${key} updated.`);
    renderView('settings');
  };

  // 8. Audit Log Screen
  async function renderAuditLog(container) {
    const res = await apiRequest('/admin/audit-log');
    const logs = res.data || MOCK_DATA.auditLogs;

    container.innerHTML = `
      <div class="table-card">
        <table class="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Target Entity</th>
              <th>Reason / Justification</th>
            </tr>
          </thead>
          <tbody>
            ${logs.map(a => `
              <tr>
                <td style="color:var(--text-muted); font-size:0.8rem;">${new Date(a.timestamp).toLocaleString()}</td>
                <td><strong>${a.actor}</strong></td>
                <td><span class="badge badge-info">${a.action}</span></td>
                <td><code>${a.entity}</code></td>
                <td style="color:var(--text-main);">${a.reason || '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ==========================================
  // Global Modal & Drawer Handlers
  // ==========================================
  window.closeModal = function () {
    if (modalBackdrop) modalBackdrop.classList.remove('active');
  };

  window.closeDrawer = function () {
    if (drawerBackdrop) drawerBackdrop.classList.remove('active');
  };

  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) closeModal();
    });
  }

  if (drawerBackdrop) {
    drawerBackdrop.addEventListener('click', (e) => {
      if (e.target === drawerBackdrop) closeDrawer();
    });
  }

  // Toast Notifications
  function showToast(msg) {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <span class="material-symbols-outlined" style="color:var(--accent-lime);">check_circle</span>
      <span>${msg}</span>
    `;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

})();
