import { startPayment } from './scripts/payments/payment.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Text Flipper in Hero
  const flipWords = ['close', 'reminded', 'notified', 'updated'];
  const flipElement = document.getElementById('hero-flip-word');
  let currentWordIndex = 0;

  if (flipElement) {
    setInterval(() => {
      flipElement.style.opacity = '0';
      flipElement.style.transform = 'translateY(8px)';
      flipElement.style.transition = 'opacity 0.2s ease, transform 0.2s ease';

      setTimeout(() => {
        currentWordIndex = (currentWordIndex + 1) % flipWords.length;
        flipElement.textContent = flipWords[currentWordIndex];
        flipElement.style.opacity = '1';
        flipElement.style.transform = 'translateY(0)';
      }, 200);
    }, 2400);
  }

  // 2. Billing Toggle (Monthly vs Yearly with 2 Months Free)
  const monthlyBtn = document.getElementById('billing-monthly');
  const yearlyBtn = document.getElementById('billing-yearly');
  const pricePaid = document.getElementById('price-paid');
  const priceBusiness = document.getElementById('price-business');
  const intervalPaid = document.getElementById('interval-paid');
  const intervalBusiness = document.getElementById('interval-business');

  function setBilling(isYearly) {
    if (!monthlyBtn || !yearlyBtn) return;
    if (isYearly) {
      yearlyBtn.classList.add('active');
      monthlyBtn.classList.remove('active');
      if (pricePaid) pricePaid.textContent = '2.49';
      if (intervalPaid) intervalPaid.textContent = '/ month ($29.90 billed yearly)';
      if (priceBusiness) priceBusiness.textContent = '4.15';
      if (intervalBusiness) intervalBusiness.textContent = '/ month ($49.90 billed yearly)';
    } else {
      monthlyBtn.classList.add('active');
      yearlyBtn.classList.remove('active');
      if (pricePaid) pricePaid.textContent = '2.99';
      if (intervalPaid) intervalPaid.textContent = '/ month';
      if (priceBusiness) priceBusiness.textContent = '4.99';
      if (intervalBusiness) intervalBusiness.textContent = '/ month';
    }
  }

  monthlyBtn?.addEventListener('click', () => setBilling(false));
  yearlyBtn?.addEventListener('click', () => setBilling(true));

  // 3. FAQ Accordion
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach((item) => {
    const questionBtn = item.querySelector('.faq-question');
    questionBtn?.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      faqItems.forEach((other) => other.classList.remove('open'));
      if (!isOpen) {
        item.classList.add('open');
      }
    });
  });

  // 4. Upgrade Buttons to initiate Paystack checkout
  document.querySelectorAll('[data-paystack-btn]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      startPayment();
    });
  });

  // 5. Mobile Nav Toggle
  const mobileToggle = document.getElementById('mobile-nav-toggle');
  const mobileDrawer = document.getElementById('mobile-nav-drawer');
  const closeDrawer = document.getElementById('close-mobile-drawer');

  mobileToggle?.addEventListener('click', () => {
    if (mobileDrawer) mobileDrawer.style.display = 'flex';
  });

  closeDrawer?.addEventListener('click', () => {
    if (mobileDrawer) mobileDrawer.style.display = 'none';
  });

  // 6. Careers Viewport Mega Dropdown Toggle & Hover Logic
  const careersTrigger = document.getElementById('careers-nav-trigger');
  const careersDropdown = document.getElementById('careers-mega-dropdown');
  const closeCareersBtn = document.getElementById('close-careers-mega');
  const mobileCareersLink = document.getElementById('mobile-careers-link');
  let closeTimeout = null;

  function openCareersMega() {
    clearTimeout(closeTimeout);
    if (!careersDropdown) return;
    careersDropdown.classList.add('is-open');
    careersTrigger?.setAttribute('aria-expanded', 'true');
    const arrow = careersTrigger?.querySelector('.nav-drop-arrow');
    if (arrow) arrow.style.transform = 'rotate(180deg)';
  }

  function closeCareersMega() {
    closeTimeout = setTimeout(() => {
      if (!careersDropdown) return;
      careersDropdown.classList.remove('is-open');
      careersTrigger?.setAttribute('aria-expanded', 'false');
      const arrow = careersTrigger?.querySelector('.nav-drop-arrow');
      if (arrow) arrow.style.transform = 'rotate(0deg)';
    }, 180);
  }

  if (careersTrigger && careersDropdown) {
    // Click toggle
    careersTrigger.addEventListener('click', (e) => {
      e.preventDefault();
      const isOpen = careersDropdown.classList.contains('is-open');
      if (isOpen) {
        closeCareersMega();
      } else {
        openCareersMega();
      }
    });

    // Hover intent on desktop
    careersTrigger.addEventListener('mouseenter', openCareersMega);
    careersTrigger.addEventListener('mouseleave', closeCareersMega);

    careersDropdown.addEventListener('mouseenter', () => {
      clearTimeout(closeTimeout);
    });
    careersDropdown.addEventListener('mouseleave', closeCareersMega);

    // Close button
    closeCareersBtn?.addEventListener('click', () => {
      clearTimeout(closeTimeout);
      careersDropdown.classList.remove('is-open');
      careersTrigger.setAttribute('aria-expanded', 'false');
      const arrow = careersTrigger.querySelector('.nav-drop-arrow');
      if (arrow) arrow.style.transform = 'rotate(0deg)';
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && careersDropdown.classList.contains('is-open')) {
        clearTimeout(closeTimeout);
        careersDropdown.classList.remove('is-open');
        careersTrigger.setAttribute('aria-expanded', 'false');
        const arrow = careersTrigger.querySelector('.nav-drop-arrow');
        if (arrow) arrow.style.transform = 'rotate(0deg)';
      }
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (
        careersDropdown.classList.contains('is-open') &&
        !careersDropdown.contains(e.target) &&
        !careersTrigger.contains(e.target)
      ) {
        clearTimeout(closeTimeout);
        careersDropdown.classList.remove('is-open');
        careersTrigger.setAttribute('aria-expanded', 'false');
        const arrow = careersTrigger.querySelector('.nav-drop-arrow');
        if (arrow) arrow.style.transform = 'rotate(0deg)';
      }
    });
  }

  mobileCareersLink?.addEventListener('click', (e) => {
    e.preventDefault();
    if (mobileDrawer) mobileDrawer.style.display = 'none';
    openCareersMega();
    careersDropdown?.scrollIntoView({ behavior: 'smooth' });
  });
});