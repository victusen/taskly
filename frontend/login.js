import { getCurrentSession } from "./scripts/auth/session.js";
import { showToast } from "./scripts/ui/toast.js";
import {
  signIn,
  signInWithGoogle,
  signInWithFacebook,
  signInWithX,
  resetPassword
} from './scripts/auth/auth.js';

const form = document.querySelector('form');
const forgotPassword = document.querySelector('.forgot-password')
const facebookButton = document.querySelector('#facebook')
const googleButton = document.querySelector('#google')
const xButton = document.querySelector('#X')

// Password visibility eye toggle
document.querySelectorAll('.eye-toggle').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const targetId = btn.getAttribute('data-target');
    const input = document.getElementById(targetId);
    if (!input) return;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    const eyeShow = btn.querySelector('.eye-show');
    const eyeHide = btn.querySelector('.eye-hide');
    if (eyeShow && eyeHide) {
      eyeShow.style.display = isPassword ? 'none' : 'block';
      eyeHide.style.display = isPassword ? 'block' : 'none';
    }
  });
});

googleButton.addEventListener("click", async (event) => {
  event.preventDefault()
  try {
    await signInWithGoogle();
  } catch (error) {
    showToast('error', error.message || 'Google sign-in failed.');
  }
})

facebookButton.addEventListener("click", async (event) => {
  event.preventDefault();
  try {
    await signInWithFacebook();
  } catch (error) {
    showToast('error', error.message || 'Facebook sign-in failed.');
  }
});

xButton.addEventListener('click', async (event) => {
  event.preventDefault();
  try {
    await signInWithX();
  } catch (error) {
    showToast('error', error.message || 'X sign-in failed.');
  }
})

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const email = form.querySelector('input[type="email"]').value;
  const password = form.querySelector('input[type="password"]').value;

  try {
    await signIn(email, password);
    showToast('success', 'Signed in successfully. Redirecting...');
    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 400);
  } catch (error) {
    showToast('error', error.message || 'Invalid email or password.');
  }
});

forgotPassword.addEventListener('click', async (event) => {
  event.preventDefault();

  const email = form.querySelector('input[type="email"]').value;

  if (!email) {
    showToast('warn', 'Enter your email address in the field above first.');
    return;
  }

  try {
    await resetPassword(email);
    showToast('success', 'Password reset email sent. Check your inbox.');
  } catch (error) {
    showToast('error', error.message || 'Could not send reset email.');
  }
});