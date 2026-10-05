import { startPayment } from './scripts/payments/payment.js';

const upgradeButton =
  document.getElementById('upgrade-btn');

console.log("buttons loaded.")

upgradeButton?.addEventListener(
  'click',
  startPayment
);