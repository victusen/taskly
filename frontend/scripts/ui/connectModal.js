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
    icon: new URL("../../icon-gsheet.png", import.meta.url).href,
  },
  {
    id: "supabase",
    name: "Supabase",
    icon: new URL("../../icon-supabase.png", import.meta.url).href,
  },
  {
    id: "excel",
    name: "Excel",
    icon: new URL("../../icon-excel.png", import.meta.url).href,
  },
  {
    id: "firebase",
    name: "Firebase",
    icon: new URL("../../icon-firebase.png", import.meta.url).href,
  },
  {
    id: "mongodb",
    name: "MongoDB",
    icon: new URL("../../icon-mongodb.png", import.meta.url).href,
  },
  {
    id: "postgresql",
    name: "PostgreSQL",
    icon: new URL("../../icon-postgresql.png", import.meta.url).href,
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
    .cm-option.cm-db-option:hover { border-color: #16a34a; background: #f0fdf4; }
    .cm-option:disabled { opacity: 0.5; cursor: not-allowed; }
    .cm-option-icon { width: 22px; height: 22px; object-fit: contain; margin-left: auto; flex-shrink: 0; }
    .cm-project { margin: 4px 0 0; padding-top: 14px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #6b7280; }
    .cm-database-backdrop .cm-card { max-height: calc(100vh - 32px); overflow-y: auto; }
    .cm-database-card { max-width: 540px; padding: 24px; gap: 14px; }
    .cm-db-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .cm-db-option { min-height: 58px; flex-direction: row; justify-content: flex-start; gap: 10px; padding: 10px 12px; border-radius: 7px; font-size: 12px; text-align: left; }
    .cm-db-icon { display: grid; place-items: center; flex: 0 0 24px; width: 24px; height: 24px; color: #16803c; }
    .cm-db-icon svg { width: 22px; height: 22px; }
    .cm-db-icon img { display: block; width: 24px; height: 24px; object-fit: contain; }
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
        <img class="cm-option-icon" src="/gmail-btn.png" alt="" aria-hidden="true">
      </button>
      <button type="button" class="cm-option" data-cm-choice="yahoo">
        <span>Connect Yahoo</span>
        <img class="cm-option-icon" src="/Yahoo-icon.png" alt="" aria-hidden="true">
      </button>
      <button type="button" class="cm-option" data-cm-choice="custom">
        <span>Connect custom domain</span>
        <img class="cm-option-icon" src="/Custom-email.png" alt="" aria-hidden="true">
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
      window.location.href = `/smtp?project=${encodeURIComponent(projectId)}`;
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
    <div class="cm-card cm-database-card">
      <div class="cm-head">
        <h3 class="cm-title" id="cm-database-title">Connect a database</h3>
        <button type="button" class="cm-close" data-db-close aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <p class="cm-sub">Choose a data source for this schedule.</p>
      <div class="cm-db-grid">
        ${DATABASE_OPTIONS.map((option) => `
          <button type="button" class="cm-option cm-db-option" data-db-choice="${option.id}">
            <span class="cm-db-icon" aria-hidden="true"><img src="${option.icon}" alt="" loading="eager" decoding="async" fetchpriority="high"></span>
            <span>${option.name}</span>
          </button>
        `).join("")}
      </div>
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