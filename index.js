import { startPayment } from './scripts/payments/payment.js';

const upgradeButton =
  document.getElementById('upgrade-btn');

upgradeButton?.addEventListener(
  'click',
  startPayment
);