import { updatePassword, signOut } from './scripts/auth/auth.js';

const form = document.querySelector('#reset-password-form');
const newPassword = document.querySelector('#new-password');
const confirmPassword = document.querySelector('#confirm-password');
const message = document.querySelector('#reset-message');

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const password = newPassword.value;
  const confirm = confirmPassword.value;

  if (!password || !confirm) {
    message.textContent = 'Please fill in both password fields.';
    return;
  }

  if (password !== confirm) {
    message.textContent = 'Passwords do not match.';
    return;
  }

  try {
    message.textContent = 'Updating password...';

    await updatePassword(password);

    message.textContent = 'Password updated successfully.';

    // End the temporary recovery session.
    await signOut();

    // Remove the recovery tokens from the URL.
    window.history.replaceState(
      {},
      document.title,
      window.location.pathname
    );

    setTimeout(() => {
      window.location.href = 'login.html';
    }, 1000);

  } catch (error) {
    console.error('Password update failed:', error);

    message.textContent =
      error.message || 'Unable to update your password.';
  }
});