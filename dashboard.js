import {
  getSession,
  getUserProfile,
  getCurrentUser,
  signOut
} from './scripts/auth/auth.js';
import { 
  requireAuth
} from './scripts/auth/session.js'

const session = await requireAuth();

if (!session) {
  // redirect already handled
}

const logoutButton = document.querySelector('#logout-btn');

async function protectDashboard() {
  try {
    const session = await getSession();

    if (!session) {
      window.location.href = 'index.html';
      return;
    }

    const user = await getCurrentUser();
    const profile = await getUserProfile(user.id);

console.log(profile);

    console.log('Authenticated user:', user);

  } catch (error) {
    console.error('Authentication error:', error);
    window.location.href = 'index.html';
  }
}

logoutButton?.addEventListener('click', async () => {
  try {
    await signOut();

    window.location.href = 'index.html';

  } catch (error) {
    console.error('Logout failed:', error);
  }
});

protectDashboard();