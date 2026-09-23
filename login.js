// console.log(window.supabase.createClient);

import { signIn, signUp, signOut, signInWithGoogle, signInWithGithub, signInWithFacebook, signInWithX, resetPassword } from './scripts/auth/auth.js';

const form = document.querySelector('form');
const forgotPassword = document.querySelector('.forgot-password')
const facebookButton = document.querySelector('#facebook')
const googleButton = document.querySelector('#google')
const xButton = document.querySelector('#X')


googleButton.addEventListener("click", async (event) => {
  event.preventDefault()
  try {
    await signInWithGoogle();
  } catch (error) {
    console.error(error.message);
    alert(error.message);
  }
  
})
facebookButton.addEventListener("click", async (event) => {
  event.preventDefault();

  try {
    await signInWithFacebook();
  } catch (error) {
    console.error(error.message);
    alert(error.message);
  }
});
xButton.addEventListener('click', async (event) => {
  event.preventDefault();
  try {
    await signInWithX();
  } catch (error) {
    console.error(error.message);
    alert(error.message);
  }
})

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const email = form.querySelector('input[type="email"]').value;
  const password = form.querySelector('input[type="password"]').value;

  try {
    await signIn(email, password);

    window.location.href = 'dashboard.html';
  } catch (error) {
    console.error(error.message);
    alert(error.message);
  }
});
forgotPassword.addEventListener('click', async (event) => {
  event.preventDefault();

  await resetPassword();
})

