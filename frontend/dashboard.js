/* import {
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
}); */

import { showLoading, showEmpty, showError } from "./scripts/ui/states.js";
import { requireAuth } from "./scripts/auth/session.js";
import { signOut } from "./scripts/auth/auth.js";
import { startGoogleConnection } from "./scripts/api/emailConnections.js";
import { getProjects } from "./scripts/api/projects.js";
import { error } from "./scripts/ui/toast.js";

showLoading(projectList, "Loading your projects...");

const session = await requireAuth();

if (!session) {
  throw new Error("Authentication required.");
}

const projectList = document.getElementById("project-list");
const emptyState = document.getElementById("project-empty");
const connectButton = document.getElementById("connect-google");
const logoutButton = document.getElementById("logout-btn");

function renderProjects(projects) {
  projectList.innerHTML = "";
  emptyState.hidden = projects.length > 0;

  for (const project of projects) {
    const link = document.createElement("a");
    link.className = "project-card";
    link.href = `jobs.html?project=${encodeURIComponent(project.id)}`;

    const title = document.createElement("h3");
    title.textContent = project.name;

    const meta = document.createElement("p");
    meta.textContent = `Created ${new Date(project.created_at).toLocaleDateString()}`;

    link.append(title, meta);
    projectList.appendChild(link);
  }
}

async function loadProjects() {
  try {
    const result = await getProjects();
    renderProjects(result.data);
  } catch (err) {
    console.error("[LOAD PROJECTS]", err);

    if (err.status === 401) {
      window.location.href = "index.html";
      return;
    }

    error(err.message || "Unable to load projects.");
  }
}

connectButton?.addEventListener("click", async () => {
  try {
    await startGoogleConnection();
  } catch (err) {
    error(err.message);
  }
});

logoutButton?.addEventListener("click", async () => {
  await signOut();
  window.location.href = "login.html";
});

await loadProjects();