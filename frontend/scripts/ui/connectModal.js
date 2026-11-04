// frontend/scripts/ui/connectModal.js
import { startGoogleConnection } from "../api/emailConnections.js";
import { showToast } from "./toast.js";

const ROOT_ID = "connect-mail-modal";
const STYLE_ID = "connect-mail-modal-style";
const PROJECT_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

let root = null;
let activeProject = null;
let busy = false;

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .cm-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: none; align-items: center; justify-content: center; padding: 16px; z-index: 4000; }
    .cm-backdrop.open { display: flex; }
    .cm-card { background: #fff; border-radius: 8px; width: 100%; max-width: 420px; padding: 24px; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.15); }
    .cm-head { display: flex; justify-content: space-between; align-items: center; }
    .cm-title { font-size: 20px; margin: 0; }
    .cm-close { width: 35px; height: 35px; padding: 4px; border-radius: 50px; border: 0; background: lightgray; display: flex; align-items: center; justify-content: center; cursor: pointer; }
    .cm-sub { font-size: 14px; color: #4b5563; margin: 0; }
    .cm-option { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; font: inherit; font-weight: 500; color: #111; text-align: left; cursor: pointer; }
    .cm-option:hover { border-color: #111; }
    .cm-option:disabled { opacity: 0.5; cursor: not-allowed; }
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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
        </button>
      </div>
      <p class="cm-sub" id="cm-sub"></p>
      <button type="button" class="cm-option" data-cm-choice="gmail">Connect Gmail</button>
      <button type="button" class="cm-option" data-cm-choice="yahoo">Connect Yahoo</button>
      <button type="button" class="cm-option" data-cm-choice="custom">Connect custom domain</button>
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
      window.location.href = `smtp.html?project=${encodeURIComponent(projectId)}&provider=yahoo`;
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
  root.querySelector("#cm-sub").textContent = `For project: ${projectName || "this project"}`;
  root.classList.add("open");
  root.querySelector('[data-cm-choice="gmail"]').focus();
}