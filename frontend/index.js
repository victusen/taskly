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
});