import { resetPassword, updatePassword, signOut, supabase } from './scripts/auth/auth.js';
import { showToast } from './scripts/ui/toast.js';

const requestForm = document.getElementById('request-reset-form');
const updateForm = document.getElementById('update-password-form');
const resetEmail = document.getElementById('reset-email');
const newPassword = document.getElementById('new-password');
const confirmPassword = document.getElementById('confirm-password');
const pageTitle = document.getElementById('page-title');
const pageSubtitle = document.getElementById('page-subtitle');
const requestBtn = document.getElementById('request-btn');
const updateBtn = document.getElementById('update-btn');

// Check if user landed with recovery token/hash
async function checkRecoverySession() {
  const hash = window.location.hash || '';
  const search = window.location.search || '';
  const isRecovery = hash.includes('type=recovery') || search.includes('type=recovery');

  if (isRecovery) {
    switchToUpdateMode();
    return;
  }

  // Also check if supabase already set an active recovery session
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session && hash.includes('access_token')) {
      switchToUpdateMode();
    }
  } catch (_) {}
}

function switchToUpdateMode() {
  requestForm.style.display = 'none';
  updateForm.style.display = 'flex';
  pageTitle.textContent = 'Set New Password';
  pageSubtitle.textContent = 'Enter and confirm your new secure password.';
}

// 1. Request Reset Link Form Submit
requestForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = resetEmail.value.trim();

  if (!email) {
    showToast('warn', 'Please enter your email address.');
    return;
  }

  requestBtn.disabled = true;
  requestBtn.textContent = 'Sending link...';

  try {
    await resetPassword(email);
    showToast('success', 'Password reset link sent! Please check your inbox.');
    requestForm.reset();
  } catch (error) {
    showToast('error', error.message || 'Unable to send reset email.');
  } finally {
    requestBtn.disabled = false;
    requestBtn.textContent = 'Reset Password';
  }
});

// 2. Update New Password Form Submit
updateForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const password = newPassword.value;
  const confirm = confirmPassword.value;

  if (!password || !confirm) {
    showToast('warn', 'Please fill in both password fields.');
    return;
  }

  if (password !== confirm) {
    showToast('error', 'Passwords do not match.');
    return;
  }

  if (password.length < 6) {
    showToast('error', 'Password must be at least 6 characters long.');
    return;
  }

  updateBtn.disabled = true;
  updateBtn.textContent = 'Updating password...';

  try {
    await updatePassword(password);
    showToast('success', 'Password updated successfully! Redirecting to login...');

    // End temporary recovery session and clear tokens from address bar
    try {
      await signOut();
    } catch (_) {}

    if (window.location.hash) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    setTimeout(() => {
      window.location.href = 'login.html';
    }, 1200);

  } catch (error) {
    showToast('error', error.message || 'Unable to update password.');
    updateBtn.disabled = false;
    updateBtn.textContent = 'Update Password';
  }
});

// Initialize on page load
checkRecoverySession();