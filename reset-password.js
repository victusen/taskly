import { updatePassword } from './scripts/auth/auth.js';

const form = document.querySelector('#reset-password-form');
const newPassword = document.querySelector('#new-password');
const confirmPassword = document.querySelector('#confirm-password');
const message = document.querySelector('#reset-message');

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const password = newPassword.value;
  const confirm = confirmPassword.value;

  if (password !== confirm) {
    message.textContent = 'Passwords do not match.';
    return;
  }

  try {
    await updatePassword(password);

    message.textContent = 'Password updated successfully.';

    setTimeout(() => {
      window.location.href = 'login.html';
    }, 1500);

  } catch (error) {
    message.textContent = error.message;
  }
});