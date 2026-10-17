import { showLoading, showError, showEmpty } from "./scripts/ui/states.js";
import { requireAuth } from "./scripts/auth/session.js";
import { initShell, showGoogleResult } from "./scripts/ui/shell.js";
import { showToast, error as toastError } from "./scripts/ui/toast.js";
import { startGoogleConnection } from "./scripts/api/emailConnections.js";
import { loadProject, loadConnections, loadSchedules, changeStatus, updateSchedule, addSchedule } from "./scripts/data/source.js";

const projectId = new URLSearchParams(window.location.search).get("project");

if (!projectId) {
  window.location.href = "dashboard.html";
  throw new Error("No project selected.");
}

const jobs = document.getElementById("jobs-content");
const selbar = document.getElementById("selbar");
const selCount = document.getElementById("sel-count");
const banner = document.getElementById("sheet-banner");
const projectPanel = document.getElementById("project-panel");
const connPanel = document.getElementById("conn-panel");

let schedules = [];
const selected = new Set();

showLoading(jobs, "Loading emails");

const session = await requireAuth();
if (!session) throw new Error("Authentication required.");

initShell(session);
showGoogleResult();

/* Escapes text before it is placed inside an HTML string. */
const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

const formatDateTime = (iso) =>
  iso ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "None";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function renderProjectPanel(project) {
  document.getElementById("project-title").textContent = project.project_name;
  document.getElementById("project-sub").textContent = `${project.business_name}. Schedule emails to your customers and keep them reminded.`;
  document.title = `Bzade | ${project.project_name}`;

  projectPanel.innerHTML = "";
  projectPanel.append(el("h4", "", project.project_name), el("p", "", project.business_name));

  // Update mobile sidebar current project and sibling list
  const currentProjNameEl = document.getElementById("sidebar-current-project-name");
  if (currentProjNameEl) currentProjNameEl.textContent = project.project_name;

  try {
    const allProjects = await loadProjects();
    const siblingContainer = document.getElementById("sidebar-sibling-projects");
    if (siblingContainer) {
      siblingContainer.innerHTML = "";
      for (const p of allProjects) {
        const isCurrent = p.id === project.id;
        const item = el("a", `sidebar-nav-item ${isCurrent ? "active-project" : ""}`);
        item.href = `jobs.html?project=${encodeURIComponent(p.id)}`;
        
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("width", "14");
        svg.setAttribute("height", "14");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "2");
        svg.innerHTML = `<polyline points="9 18 15 12 9 6"></polyline>`;
        
        const span = el("span", "", p.project_name);
        item.append(svg, span);
        siblingContainer.append(item);
      }
    }
  } catch (e) {
    console.error("Could not load sibling projects for sidebar", e);
  }
}

function renderConnectionPanel(project, connections) {
  const active = connections.filter((item) => item.status === "active");
  const connection = active.find((item) => item.id === project.email_connection_id) || active[0];

  connPanel.innerHTML = "";

  if (connection) {
    const badge = el("span", "badge badge-green", "Active");
    badge.style.alignSelf = "flex-start";
    connPanel.append(
      el("h4", "", connection.provider === "google" ? "Gmail" : "SMTP"),
      el("p", "", connection.email_address),
      badge
    );
    return;
  }

  connPanel.append(el("p", "", "No mail account connected. Connect one to start sending."));

  const gmail = el("button", "btn btn-green", "Connect mail");
  gmail.type = "button";
  gmail.addEventListener("click", () => startGoogleConnection().catch((err) => toastError(err.message)));

  const smtp = el("a", "btn btn-dark-line", "Add SMTP account");
  smtp.href = "smtp.html";

  connPanel.append(gmail, smtp);
}

function statusBadge(status) {
  const kind = { active: "badge-green", paused: "badge-warn", failed: "badge-red" }[status] || "";
  return `<span class="badge ${kind}">${esc(status.charAt(0).toUpperCase() + status.slice(1))}</span>`;
}

function updateSelection() {
  selbar.hidden = selected.size === 0;
  selCount.textContent = `${selected.size} selected`;

  const all = jobs.querySelector("#check-all");
  if (all) {
    all.checked = selected.size === schedules.length && schedules.length > 0;
    all.indeterminate = selected.size > 0 && selected.size < schedules.length;
  }
}

function renderTable() {
  jobs.innerHTML = "";
  banner.hidden = false;

  if (schedules.length === 0) {
    showEmpty(jobs, "No emails scheduled yet", "Create your first email to start reaching your customers.");
    updateSelection();
    return;
  }

  const rows = schedules
    .map((row) => {
      const recipients = row.config?.recipients || [];
      const joined = recipients.join(", ");
      const name = row.name || row.config?.subject || "Untitled email";

      return `<tr data-id="${esc(row.id)}" class="${selected.has(row.id) ? "sel" : ""}">
        <td class="col-check"><input type="checkbox" class="row-check" data-id="${esc(row.id)}" aria-label="Select ${esc(name)}" ${selected.has(row.id) ? "checked" : ""}></td>
        <td class="col-name"><button class="cell-link" data-edit="${esc(row.id)}" type="button">${esc(name)}</button></td>
        <td>${formatDateTime(row.scheduled_for)}</td>
        <td>Email</td>
        <td><span class="badge">${row.schedule_type === "recurring" ? "Recurring" : "One-time"}</span></td>
        <td>${recipients.length}</td>
        <td><span class="recips" title="${esc(joined)}">${esc(joined)}</span></td>
        <td>${formatDateTime(row.next_run_at)}</td>
        <td>${formatDateTime(row.created_at)}</td>
        <td>${formatDateTime(row.updated_at)}</td>
        <td>${statusBadge(row.status)}</td>
        <td><button class="btn btn-outline btn-sm" data-edit="${esc(row.id)}" type="button">Edit template</button></td>
      </tr>`;
    })
    .join("");

  const wrap = el("div", "table-wrap");
  wrap.innerHTML = `<table>
    <thead><tr>
      <th class="col-check"><input type="checkbox" id="check-all" aria-label="Select all"></th>
      <th class="col-name">Email name</th>
      <th>Date and time</th>
      <th>Job type</th>
      <th>Type</th>
      <th>Emails</th>
      <th>Recipients</th>
      <th>Next run</th>
      <th>Created</th>
      <th>Last updated</th>
      <th>Status</th>
      <th>Template</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  jobs.append(wrap);
  updateSelection();
}

/* One listener for the whole table: checkboxes and Edit template buttons. */
jobs.addEventListener("change", (event) => {
  const box = event.target;

  if (box.id === "check-all") {
    selected.clear();
    if (box.checked) schedules.forEach((row) => selected.add(row.id));
    renderTable();
    return;
  }

  if (box.classList.contains("row-check")) {
    if (box.checked) selected.add(box.dataset.id);
    else selected.delete(box.dataset.id);
    box.closest("tr").classList.toggle("sel", box.checked);
    updateSelection();
  }
});

jobs.addEventListener("click", (event) => {
  if (event.target.closest("[data-edit]")) {
    showToast("info", "The template editor opens here in the next step.");
  }
});

document.getElementById("create-email").addEventListener("click", () => {
  showToast("info", "The email creator opens here in the next step.");
});

// Mobile Sidebar toggle wiring
const hamburgerBtn = document.getElementById("hamburger-btn");
const avatarBtn = document.getElementById("avatar-btn");
const sidebarOverlay = document.getElementById("mobile-sidebar-overlay");
const sidebarCloseBtn = document.getElementById("sidebar-close-btn");
const sidebarCard = document.querySelector(".left-sidebar-card");
const sidebarDesignDraft = document.getElementById("sidebar-design-draft");
const scheduleOverlay = document.getElementById("schedule-overlay");
const addScheduleBtn = document.getElementById("add-schedule");
const addTaskCta = document.getElementById("add-task-cta");
const closeScheduleBtn = document.getElementById("close-btn");
const connectGmailBtn = document.getElementById("connect-gmail-btn");

function toggleMobileSidebar(open) {
  if (open) {
    sidebarOverlay.classList.add("open");
    document.body.style.overflow = "hidden";
  } else {
    sidebarOverlay.classList.remove("open");
    document.body.style.overflow = "";
  }
}

hamburgerBtn?.addEventListener("click", () => {
  console.log("Hamburger menu button clicked");
  if (window.innerWidth <= 1024) {
    toggleMobileSidebar(true);
  } else {
    toggleDesktopSidebar();
  }
});

avatarBtn?.addEventListener("click", () => {
  console.log("Avatar icon clicked");
  showToast("info", "Avatar menu clicked");
});

sidebarCloseBtn?.addEventListener("click", () => toggleMobileSidebar(false));
sidebarOverlay?.addEventListener("click", (e) => {
  if (e.target === sidebarOverlay) toggleMobileSidebar(false);
});
sidebarDesignDraft?.addEventListener("click", (e) => {
  e.preventDefault();
  toggleMobileSidebar(false);
  showToast("info", "Design Draft Template editor opened.");
});

// Task creation modal triggers
function openScheduleModal() {
  console.log("Add a new task button clicked");
  scheduleOverlay?.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeScheduleModal() {
  scheduleOverlay?.classList.remove("open");
  document.body.style.overflow = "";
}

addScheduleBtn?.addEventListener("click", openScheduleModal);
addTaskCta?.addEventListener("click", openScheduleModal);
closeScheduleBtn?.addEventListener("click", closeScheduleModal);
scheduleOverlay?.addEventListener("click", (e) => {
  if (e.target === scheduleOverlay) closeScheduleModal();
});

connectGmailBtn?.addEventListener("click", () => {
  startGoogleConnection().catch((err) => toastError(err.message));
});

// Populate user details in sidebar
if (session && session.user) {
  const user = session.user;
  const meta = user.user_metadata || {};
  const email = user.email || "";
  const full = meta.full_name || meta.name || "";
  const name = meta.first_name || full.split(" ")[0] || email.split("@")[0] || "User";

  const nameEl = document.getElementById("sidebar-user-name");
  const emailEl = document.getElementById("sidebar-user-email");
  const avatarEl = document.getElementById("sidebar-user-avatar");

  if (nameEl) nameEl.textContent = full || name;
  if (emailEl) emailEl.textContent = email;
  if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();
}

document.getElementById("sidebar-logout-btn")?.addEventListener("click", async () => {
  try {
    await session.signOut?.();
  } catch (e) {
    console.error(e);
  }
  window.location.href = "index.html";
});

document.getElementById("sidebar-upgrade-btn")?.addEventListener("click", () => {
  toggleMobileSidebar(false);
  showToast("info", "Upgrade flow initiated.");
});

async function loadTable() {
  showLoading(jobs, "Loading emails");

  try {
    schedules = await loadSchedules(projectId);
    selected.clear();
    renderTable();
  } catch (err) {
    if (err.status === 401) {
      window.location.href = "login.html";
      return;
    }
    banner.hidden = true;
    showError(jobs, err.message || "Unable to load your emails.", loadTable);
  }
}

selbar.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-bulk]");
  if (!button) return;

  const action = button.dataset.bulk;

  if (action === "remove" && !window.confirm(`Delete ${selected.size} selected ${selected.size === 1 ? "email" : "emails"}?`)) {
    return;
  }

  const ids = [...selected];
  showLoading(jobs, "Updating");

  try {
    const failed = await changeStatus(action, ids);

    if (failed > 0) {
      showToast("warning", `${failed} could not be changed. Their current status does not allow it.`);
    } else {
      showToast("success", "Done.");
    }
  } catch (err) {
    toastError(err.message || "Could not update the selected emails.");
  }

  await loadTable();
});

async function init() {
  try {
    const [project, connections] = await Promise.all([loadProject(projectId), loadConnections()]);

    if (!project) {
      projectPanel.innerHTML = "";
      document.getElementById("project-title").textContent = "Project not found";
      showError(jobs, "This project does not exist or was removed.", () => (window.location.href = "dashboard.html"));
      return;
    }

    renderProjectPanel(project);
    renderConnectionPanel(project, connections);
  } catch (err) {
    if (err.status === 401) {
      window.location.href = "login.html";
      return;
    }
    showError(jobs, err.message || "Unable to load this project.", init);
    return;
  }

  await loadTable();
}

await init();

/* Saves from the composer. Create sends a new schedule, edit updates the one in the row. */
async function senderFor(draft) {
  const connections = (await loadConnections()).filter((item) => item.status === "active");
  const sender = connections.find((item) => item.email_address === draft.sender);

  if (!sender) {
    throw new Error(`Connect ${draft.sender} first, then try again.`);
  }

  return sender;
}

function payloadFor(draft, sender) {
  const payload = {
    project_id: projectId,
    email_connection_id: sender.id,
    name: draft.name,
    schedule_type: draft.schedule_type,
    timezone: TIMEZONE,
    config: {
      recipients: draft.recipients,
      subject: draft.subject,
      body: draft.body,
      body_type: "html",
    },
  };

  if (draft.scheduled_for) payload.scheduled_for = draft.scheduled_for;
  if (draft.schedule_rule) payload.schedule_rule = draft.schedule_rule;

  return payload;
}

window.bzComposer.onSubmit = async (draft) => {
  const sender = await senderFor(draft);
  await addSchedule(payloadFor(draft, sender));
  await loadRows();
};

window.bzComposer.onUpdate = async (id, draft) => {
  const sender = await senderFor(draft);
  await updateSchedule(id, payloadFor(draft, sender));
  await loadRows();
};