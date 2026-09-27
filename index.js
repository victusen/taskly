import { startPayment } from './scripts/payments/payment.js';

const upgradeButton =
  document.getElementById('upgrade-btn');

console.log("UpgradeButton loaded. time for paystaxk inj.")

upgradeButton?.addEventListener(
  'click',
  startPayment
);