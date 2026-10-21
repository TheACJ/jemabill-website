/**
 * JemaBill Official Website JavaScript
 * Handles interactive demo calculator, biller switching, FAQ accordion, and mobile drawer.
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Mobile Menu Toggle
  const mobileToggle = document.getElementById('mobileToggle');
  const mobileMenu = document.getElementById('mobileMenu');

  if (mobileToggle && mobileMenu) {
    mobileToggle.addEventListener('click', () => {
      mobileMenu.classList.toggle('open');
      const isOpen = mobileMenu.classList.contains('open');
      mobileToggle.innerHTML = isOpen
        ? `<span class="material-symbols-outlined">close</span>`
        : `<span class="material-symbols-outlined">menu</span>`;
    });
  }

  // 2. Interactive Biller Demo Widget
  const demoData = {
    electricity: {
      title: 'Electricity Token',
      billerLabel: 'Select Electricity DisCo',
      billers: ['Ikeja Electric (IKEDC)', 'Eko Electric (EKEDC)', 'Abuja Electric (AEDC)', 'Ibadan Electric (IBEDC)', 'Port Harcourt (PHED)'],
      accountLabel: 'Meter Number',
      accountPlaceholder: 'e.g. 45028491023',
      defaultAccount: '45028491023',
      amountPlaceholder: '5,000',
      defaultAmount: '5,000',
      customerName: 'Adekunle Olawale',
      address: 'Plot 12, Jabi Crescent, Ikeja, Lagos',
      receiptTitle: 'PREPAID ELECTRICITY TOKEN',
      tokenCode: '4820 - 9102 - 4719 - 3021',
      unitInfo: 'Units: 74.6 kWh',
    },
    airtime: {
      title: 'Airtime Recharge',
      billerLabel: 'Mobile Network',
      billers: ['MTN Nigeria', 'Airtel Nigeria', 'Globacom (Glo)', '9mobile'],
      accountLabel: 'Phone Number',
      accountPlaceholder: 'e.g. 0803 123 4567',
      defaultAccount: '0813 892 4102',
      amountPlaceholder: '2,000',
      defaultAmount: '2,000',
      customerName: 'Verified Line (MTN NG)',
      address: 'Lagos Zone 1',
      receiptTitle: 'AIRTIME TOP-UP SUCCESS',
      tokenCode: 'TX-MTN-994182941',
      unitInfo: 'Status: Delivered Instantly',
    },
    cable: {
      title: 'Cable TV Subscription',
      billerLabel: 'Cable TV Provider',
      billers: ['DSTV Nigeria', 'GOtv Nigeria', 'StarTimes', 'Showmax'],
      accountLabel: 'Smartcard / IUC Number',
      accountPlaceholder: 'e.g. 1029481920',
      defaultAccount: '1029481920',
      amountPlaceholder: '14,500',
      defaultAmount: '14,500',
      customerName: 'Chidinma Nwachukwu',
      address: 'Bouquet: Compact Plus (Active)',
      receiptTitle: 'CABLE TV RENEWAL',
      tokenCode: 'IUC-1029481920-OK',
      unitInfo: 'DueDate: 21 Nov 2026',
    },
  };

  let currentCategory = 'electricity';

  const demoTabBtns = document.querySelectorAll('.demo-tab-btn');
  const demoBillerSelect = document.getElementById('demoBillerSelect');
  const demoAccountLabel = document.getElementById('demoAccountLabel');
  const demoAccountInput = document.getElementById('demoAccountInput');
  const demoAmountInput = document.getElementById('demoAmountInput');
  const demoVerifiedName = document.getElementById('demoVerifiedName');
  const demoVerifiedSub = document.getElementById('demoVerifiedSub');
  const receiptBiller = document.getElementById('receiptBiller');
  const receiptAccount = document.getElementById('receiptAccount');
  const receiptAmount = document.getElementById('receiptAmount');
  const receiptTokenTitle = document.getElementById('receiptTokenTitle');
  const receiptTokenCode = document.getElementById('receiptTokenCode');

  function updateDemoUI(catKey) {
    const config = demoData[catKey];
    if (!config) return;

    currentCategory = catKey;

    // Update form elements
    if (demoBillerSelect) {
      demoBillerSelect.innerHTML = config.billers
        .map((b) => `<option value="${b}">${b}</option>`)
        .join('');
    }
    if (demoAccountLabel) demoAccountLabel.textContent = config.accountLabel;
    if (demoAccountInput) {
      demoAccountInput.placeholder = config.accountPlaceholder;
      demoAccountInput.value = config.defaultAccount;
    }
    if (demoAmountInput) {
      demoAmountInput.value = config.defaultAmount;
    }

    // Update verified badge
    if (demoVerifiedName) demoVerifiedName.textContent = config.customerName;
    if (demoVerifiedSub) demoVerifiedSub.textContent = config.address;

    // Update receipt preview
    if (receiptBiller) receiptBiller.textContent = config.billers[0];
    if (receiptAccount) receiptAccount.textContent = config.defaultAccount;
    if (receiptAmount) receiptAmount.textContent = `₦${config.defaultAmount}.00`;
    if (receiptTokenTitle) receiptTokenTitle.textContent = config.receiptTitle;
    if (receiptTokenCode) receiptTokenCode.textContent = config.tokenCode;
  }

  demoTabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      demoTabBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.getAttribute('data-target');
      if (target) updateDemoUI(target);
    });
  });

  if (demoBillerSelect) {
    demoBillerSelect.addEventListener('change', (e) => {
      if (receiptBiller) receiptBiller.textContent = e.target.value;
    });
  }

  if (demoAccountInput) {
    demoAccountInput.addEventListener('input', (e) => {
      if (receiptAccount) receiptAccount.textContent = e.target.value || '—';
    });
  }

  if (demoAmountInput) {
    demoAmountInput.addEventListener('input', (e) => {
      const val = e.target.value.replace(/[^0-9]/g, '');
      const num = Number(val) || 0;
      const formatted = num.toLocaleString('en-NG');
      if (receiptAmount) receiptAmount.textContent = num > 0 ? `₦${formatted}.00` : '₦0.00';
    });
  }

  // 3. FAQ Accordion
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach((item) => {
    const question = item.querySelector('.faq-question');
    if (question) {
      question.addEventListener('click', () => {
        const isActive = item.classList.contains('active');
        // Close others
        faqItems.forEach((other) => other.classList.remove('active'));
        if (!isActive) {
          item.classList.add('active');
        }
      });
    }
  });

  // Initialize with electricity
  updateDemoUI('electricity');
});
