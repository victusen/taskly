import {
  getSession,
  getUserProfile,
  getCurrentUser,
  signOut
} from './scripts/auth/auth.js';

import { 
  requireAuth
} from './scripts/auth/session.js'; 

import { showToast } from './scripts/ui/toast.js';

import { startGoogleConnection } from './scripts/api/emailConnections.js';

const session = await requireAuth();

if (!session) {
  // redirect already handled
}

const logoutButton = document.querySelector('#logout-btn');

async function protectDashboard() {
  try {
    const session = await getSession();

    if (!session) {
      window.location.href = 'login.html';
      return;
    }

    const user = await getCurrentUser();
    const profile = await getUserProfile(user.id);

  } catch (error) {
    console.error('Authentication error:', error);
    window.location.href = 'login.html';
  }
}

logoutButton?.addEventListener('click', async () => {
  try {
    await signOut();

    window.location.href = 'home.html';

  } catch (error) {
    console.error('Logout failed:', error);
  }
});

protectDashboard();

const GOOGLE_RESULTS = {
  connected: ['success', 'Gmail connected.'],
  cancelled: ['warning', 'Gmail connection cancelled.'],
  missing_scope: ['warning', 'Gmail needs the send permission. Connect again and keep it ticked.'],
  failed: ['error', 'Could not connect Gmail. Try again.'],
};

const googleResult = new URLSearchParams(window.location.search).get('google');

if (googleResult && GOOGLE_RESULTS[googleResult]) {
  showToast(...GOOGLE_RESULTS[googleResult]);
  window.history.replaceState({}, document.title, window.location.pathname);
}

document.getElementById('connect-google')?.addEventListener('click', () => {
  startGoogleConnection().catch((err) => showToast('error', err.message));
});