// frontend/scripts/ui/connectModal.js
import { startGoogleConnection } from "../api/emailConnections.js";
import { showToast } from "./toast.js";

const ROOT_ID = "connect-mail-modal";
const STYLE_ID = "connect-mail-modal-style";
const PROJECT_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
const DATABASE_OPTIONS = [
  {
    id: "google-sheets",
    name: "Google Sheets",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 9v12m5-12v12"/></svg>',
  },
  {
    id: "excel",
    name: "Excel",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M13 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/><path d="M3 7l10-3v16L3 17V7Z"/><path d="m6 9 4 6m0-6-4 6"/></svg>',
  },
  {
    id: "supabase",
    name: "Supabase",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M13 3 4 14h7l-1 7 10-12h-7l1-6Z"/></svg>',
  },
  {
    id: "firebase",
    name: "Firebase",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 19 2-14 4 7 3-9 4 16-7-4-6 4Z"/></svg>',
  },
  {
    id: "mongodb",
    name: "MongoDB",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2c-3 5-6 8-5 13 .5 3 2.5 5 5 7 2.5-2 4.5-4 5-7 1-5-2-8-5-13Z"/><path d="M12 9v13"/></svg>',
  },
  {
    id: "postgresql",
    name: "PostgreSQL",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 6c0-2 3-3 7-3s7 1 7 3v7c0 2-3 3-7 3s-7-1-7-3V6Z"/><path d="M5 6c0 2 3 3 7 3s7-1 7-3M5 10c0 2 3 3 7 3 1 0 2-.1 3-.3"/></svg>',
  },
];

let root = null;
let databaseRoot = null;
let activeProject = null;
let onDatabaseChoice = null;
let busy = false;

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .cm-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: none; align-items: center; justify-content: center; padding: 16px; z-index: 5000; }
    .cm-backdrop.open { display: flex; }
    .cm-card { background: #fff; border-radius: 12px; width: 100%; max-width: 440px; padding: 24px; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 20px 45px rgba(0,0,0,0.2); }
    .cm-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .cm-title { font-size: 20px; margin: 0; line-height: 1.3; }
    .cm-close { background: transparent; border: none; width: 32px; height: 32px; padding: 0; border-radius: 50%; color: #4b5563; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; margin-left: 12px; transition: background 0.15s ease, color 0.15s ease; }
    .cm-close:hover { background: #f3f4f6; color: #111827; }
    .cm-sub { font-size: 13px; line-height: 1.55; color: #4b5563; margin: 0 0 2px; }
    .cm-option { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; font: inherit; font-weight: 500; color: #111; text-align: left; cursor: pointer; transition: border-color 0.15s ease, background 0.15s ease; }
    .cm-option:hover { border-color: #111; background: #fafafa; }
    .cm-option:disabled { opacity: 0.5; cursor: not-allowed; }
    .cm-option-icon { width: 22px; height: 22px; object-fit: contain; margin-left: auto; flex-shrink: 0; }
    .cm-project { margin: 4px 0 0; padding-top: 14px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #6b7280; }
    .cm-database-backdrop .cm-card { max-height: calc(100vh - 32px); overflow-y: auto; }
    .cm-db-option { min-height: 48px; }
    .cm-db-icon { display: grid; place-items: center; flex: 0 0 24px; width: 24px; height: 24px; color: #16803c; }
    .cm-db-icon svg { width: 22px; height: 22px; }
    .cm-db-soon { margin-left: auto; color: #6b7280; font-size: 11px; font-weight: 500; white-space: nowrap; }
  `;
  document.head.appendChild(style);
}

function close() {
  root?.classList.remove("open");
}

async function connectGmail(projectId) {
  if (busy) return;
  busy = true;
  try {
    showToast("info", "Opening Google to connect your Gmail.");
    await startGoogleConnection(projectId);
  } catch (err) {
    showToast("error", err.message || "Could not start the Gmail connection.");
    busy = false;
  }
}

function ensureMarkup() {
  if (root) return;
  injectStyles();

  root = document.createElement("div");
  root.id = ROOT_ID;
  root.className = "cm-backdrop";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "cm-title");
  root.innerHTML = `
    <div class="cm-card">
      <div class="cm-head">
        <h3 class="cm-title" id="cm-title">Connect a mail account</h3>
        <button type="button" class="cm-close" data-cm-close aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <p class="cm-sub" id="cm-sub">Connect your business mail for this project. All schedules on this business will go through this account.</p>
      <button type="button" class="cm-option" data-cm-choice="gmail">
        <span>Connect Gmail</span>
        <img class="cm-option-icon" src="gmail-btn.png" alt="" aria-hidden="true">
      </button>
      <button type="button" class="cm-option" data-cm-choice="yahoo">
        <span>Connect Yahoo</span>
        <img class="cm-option-icon" src="Yahoo-icon.png" alt="" aria-hidden="true">
      </button>
      <button type="button" class="cm-option" data-cm-choice="custom">
        <span>Connect custom domain</span>
        <img class="cm-option-icon" src="Custom-email.png" alt="" aria-hidden="true">
      </button>
      <p class="cm-project" id="cm-project"></p>
    </div>
  `;
  document.body.appendChild(root);

  root.addEventListener("click", (event) => {
    if (event.target === root || event.target.closest("[data-cm-close]")) {
      close();
      return;
    }

    const choice = event.target.closest("[data-cm-choice]")?.dataset.cmChoice;
    if (!choice || !activeProject) return;

    const projectId = activeProject.id;
    close();

    if (choice === "gmail") {
      connectGmail(projectId);
      return;
    }
    if (choice === "yahoo") {
      showToast("info", "Yahoo Mail connection is coming soon.");
      return;
    }
    if (choice === "custom") {
      window.location.href = `smtp.html?project=${encodeURIComponent(projectId)}`;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
}

/**
 * Opens the modal for one project.
 * The project ID travels with every choice, so the right project is always used.
 */
export function openConnectModal({ projectId, projectName = "" } = {}) {
  if (!PROJECT_ID_PATTERN.test(String(projectId ?? ""))) {
    showToast("error", "Open a project first, then connect a mail account.");
    return;
  }

  ensureMarkup();
  busy = false;
  activeProject = { id: String(projectId), name: projectName };
  root.querySelector("#cm-sub").textContent =
    "Connect your business mail for this project. All schedules on this business will go through this account.";
  root.querySelector("#cm-project").textContent = `For project: ${projectName || "this project"}`;
  root.classList.add("open");
  root.querySelector('[data-cm-choice="gmail"]').focus();
}

function closeDatabaseModal() {
  databaseRoot?.classList.remove("open");
  onDatabaseChoice = null;
}

function ensureDatabaseMarkup() {
  if (databaseRoot) return;
  injectStyles();
  databaseRoot = document.createElement("div");
  databaseRoot.id = "connect-database-modal";
  databaseRoot.className = "cm-backdrop cm-database-backdrop";
  databaseRoot.setAttribute("role", "dialog");
  databaseRoot.setAttribute("aria-modal", "true");
  databaseRoot.setAttribute("aria-labelledby", "cm-database-title");
  databaseRoot.innerHTML = `
    <div class="cm-card">
      <div class="cm-head">
        <h3 class="cm-title" id="cm-database-title">Connect a database</h3>
        <button type="button" class="cm-close" data-db-close aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <p class="cm-sub">Choose a data source for this schedule.</p>
      ${DATABASE_OPTIONS.map((option) => `
        <button type="button" class="cm-option cm-db-option" data-db-choice="${option.id}">
          <span class="cm-db-icon" aria-hidden="true">${option.icon}</span>
          <span>${option.name}</span>
          ${option.id === "google-sheets" ? "" : '<span class="cm-db-soon">Coming soon</span>'}
        </button>
      `).join("")}
    </div>
  `;
  document.body.appendChild(databaseRoot);

  databaseRoot.addEventListener("click", (event) => {
    if (event.target === databaseRoot || event.target.closest("[data-db-close]")) {
      closeDatabaseModal();
      return;
    }

    const choice = event.target.closest("[data-db-choice]")?.dataset.dbChoice;
    if (!choice) return;
    const callback = onDatabaseChoice;
    closeDatabaseModal();
    callback?.(choice);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDatabaseModal();
  });
}

export function openDatabaseConnectModal({ onSelect } = {}) {
  ensureDatabaseMarkup();
  onDatabaseChoice = typeof onSelect === "function" ? onSelect : null;
  databaseRoot.classList.add("open");
  databaseRoot.querySelector('[data-db-choice="google-sheets"]').focus();
}