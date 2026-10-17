import { showToast, error as toastError } from "./scripts/ui/toast.js";
import { requireAuth } from "./scripts/auth/session.js";
import { initShell, showGoogleResult } from "./scripts/ui/shell.js";
import { startGoogleConnection } from "./scripts/api/emailConnections.js";
import {
  loadProject,
  loadProjects,
  loadConnections,
  loadSchedules,
  changeStatus,
  updateSchedule,
  addSchedule,
} from "./scripts/data/source.js";

const urlParams = new URLSearchParams(window.location.search);
const projectId = urlParams.get("project") || "mock-1";

// DOM references
const taskList = document.getElementById("task-list");
const taskLoader = document.getElementById("task-loader");
const noJobState = document.getElementById("no-job-state");
const addTaskCta = document.getElementById("add-task-cta");
const jobRows = document.getElementById("job-rows");
const projectTitleEl = document.getElementById("project-title");
const filterButtons = document.querySelectorAll(".toggles .toggle");
const connectGmailBtn = document.getElementById("connect-gmail-btn");
const addScheduleBtn = document.getElementById("add-schedule");
const closeScheduleBtn = document.getElementById("close-btn");
const scheduleOverlay = document.getElementById("schedule-overlay");
const scheduleForm = document.getElementById("schedule-form");
const emailConnSelect = document.getElementById("email-connection");
const hamburgerBtn = document.getElementById("hamburger-btn");
const avatarBtn = document.getElementById("avatar-btn");
const sidebarOverlay = document.getElementById("mobile-sidebar-overlay");
const sidebarCloseBtn = document.getElementById("sidebar-close-btn");
const sidebarDesignDraft = document.getElementById("sidebar-design-draft");

let currentFilter = "all";
let schedules = [];

// Helper functions
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

function statusBadge(status) {
  const map = {
    active: { cls: "badge-green", label: "Active" },
    running: { cls: "badge-green", label: "Running" },
    paused: { cls: "badge-warn", label: "Paused" },
    failed: { cls: "badge-red", label: "Failed" },
    new: { cls: "badge-blue", label: "New" },
  };
  const b = map[status] || { cls: "", label: status ? status.charAt(0).toUpperCase() + status.slice(1) : "Active" };
  return `<span class="badge ${b.cls}">${esc(b.label)}</span>`;
}

/**
 * Manages the smooth animated donut loader state inside the task list.
 * While loading, the donut spinner is visible and empty/task states are hidden.
 */
function setLoading(isLoading) {
  if (isLoading) {
    if (taskLoader) taskLoader.hidden = false;
    if (noJobState) noJobState.hidden = true;
    if (addTaskCta) addTaskCta.hidden = true;
    if (addScheduleBtn) addScheduleBtn.hidden = true;
    if (jobRows) jobRows.hidden = true;
  } else {
    if (taskLoader) taskLoader.hidden = true;
    if (addScheduleBtn) addScheduleBtn.hidden = false;
  }
}

/**
 * Renders schedule rows or displays the empty state if none are present.
 */
function renderRows(filter = currentFilter) {
  // Update toggle counts
  const allCount = schedules.length;
  const runningCount = schedules.filter((s) => s.status === "active" || s.status === "running").length;
  const newCount = schedules.filter((s) => s.status === "new" || s.status === "pending").length;
  const pausedCount = schedules.filter((s) => s.status === "paused").length;

  const btnAll = document.querySelector('[data-filter="all"]');
  const btnRunning = document.querySelector('[data-filter="running"]');
  const btnNew = document.querySelector('[data-filter="new"]');
  const btnPaused = document.querySelector('[data-filter="paused"]');

  if (btnAll) btnAll.textContent = `All (${allCount})`;
  if (btnRunning) btnRunning.textContent = `Running (${runningCount})`;
  if (btnNew) btnNew.textContent = `New (${newCount})`;
  if (btnPaused) btnPaused.textContent = `Paused (${pausedCount})`;

  let filtered = schedules;
  if (filter === "running") {
    filtered = schedules.filter((s) => s.status === "active" || s.status === "running");
  } else if (filter === "new") {
    filtered = schedules.filter((s) => s.status === "new" || s.status === "pending");
  } else if (filter === "paused") {
    filtered = schedules.filter((s) => s.status === "paused");
  }

  if (filtered.length === 0) {
    if (jobRows) {
      jobRows.innerHTML = "";
      jobRows.hidden = true;
    }
    if (noJobState) noJobState.hidden = false;
    if (addTaskCta) addTaskCta.hidden = false;
    return;
  }

  if (noJobState) noJobState.hidden = true;
  if (addTaskCta) addTaskCta.hidden = true;
  if (jobRows) {
    jobRows.hidden = false;
    jobRows.innerHTML = filtered
      .map((row) => {
        const recipients = row.config?.recipients || [];
        const joined = recipients.join(", ");
        const name = row.name || row.config?.subject || "Untitled task";
        const schedTime = formatDateTime(row.scheduled_for || row.next_run_at);

        return `
          <article class="task" data-id="${esc(row.id)}" data-schedule='${esc(JSON.stringify(row))}'>
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <h4 style="font-size: 15px; font-weight: 600; color: #111; margin: 0;">${esc(name)}</h4>
                ${statusBadge(row.status)}
              </div>
              <button class="task-edit" data-edit="${esc(row.id)}" type="button">Edit template</button>
            </div>
            <div class="task-row-meta">
              <span>Type: <strong>${row.schedule_type === "recurring" ? "Recurring" : "One-time"}</strong></span>
              <span>Recipients: <strong>${recipients.length}</strong></span>
              ${joined ? `<span style="max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${esc(joined)}">To: ${esc(joined)}</span>` : ""}
              <span>Time: <strong>${schedTime}</strong></span>
            </div>
          </article>
        `;
      })
      .join("");
  }
}

/**
 * Loads schedules from data source with smooth animated red donut loader.
 * Runs for 2 seconds before empty state is shown with unreal/mock data,
 * and will run until fetch succeeds with real data.
 */
async function loadRows(filter = currentFilter) {
  setLoading(true);
  try {
    schedules = await loadSchedules(projectId);
  } catch (err) {
    console.error("Failed to load schedules:", err);
    showToast("error", err.message || "Failed to load schedules.");
    schedules = [];
  } finally {
    setLoading(false);
    renderRows(filter);
  }
}

// Wire up global hook for composer
window.loadRows = loadRows;

// Project & sidebar updates
async function updateProjectUI(project) {
  if (projectTitleEl && project) {
    projectTitleEl.textContent = project.project_name;
  }
  if (project) {
    document.title = `bzade - ${project.project_name}`;
  }

  try {
    const allProjects = await loadProjects();
    const desktopSiblingContainer = document.getElementById("desktop-sibling-projects");
    const mobileSiblingContainer = document.getElementById("mobile-sibling-projects");

    const renderSiblings = (container) => {
      if (!container) return;
      container.innerHTML = "";
      for (const p of allProjects) {
        const isCurrent = p.id === (project?.id || projectId);
        const item = el("a", `nav-item ${isCurrent ? "active" : ""}`, p.project_name);
        item.href = `jobs.html?project=${encodeURIComponent(p.id)}`;
        item.style.padding = "6px 10px";
        item.style.fontSize = "13px";
        container.appendChild(item);
      }
    };

    renderSiblings(desktopSiblingContainer);
    renderSiblings(mobileSiblingContainer);
  } catch (e) {
    console.error("Could not load sibling projects:", e);
  }
}

// Populate connections in schedule overlay modal
async function populateConnections() {
  if (!emailConnSelect) return;
  try {
    const connections = (await loadConnections()).filter((item) => item.status === "active");
    emailConnSelect.innerHTML = "";
    if (connections.length === 0) {
      emailConnSelect.add(new Option("No mail account connected", ""));
    } else {
      for (const conn of connections) {
        const label = `${conn.email_address} (${conn.provider === "google" ? "Gmail" : "SMTP"})`;
        emailConnSelect.add(new Option(label, conn.id));
      }
    }
  } catch (err) {
    console.warn("Could not populate connections select:", err);
  }
}

// Filter buttons
filterButtons.forEach((btn) => {
  btn.addEventListener("click", async () => {
    filterButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const filter = btn.dataset.filter || "all";
    currentFilter = filter;

    // Show smooth donut loader during filter switch operation for 2 seconds
    setLoading(true);
    await new Promise((r) => setTimeout(r, 2000));
    setLoading(false);
    renderRows(filter);
  });
});

// Sidebar & modal toggles
function toggleMobileSidebar(open) {
  if (!sidebarOverlay) return;
  if (open) {
    sidebarOverlay.classList.add("open");
    document.body.style.overflow = "hidden";
  } else {
    sidebarOverlay.classList.remove("open");
    document.body.style.overflow = "";
  }
}

hamburgerBtn?.addEventListener("click", () => {
  if (window.innerWidth <= 1024) {
    toggleMobileSidebar(true);
  } else if (typeof window.toggleDesktopSidebar === "function") {
    window.toggleDesktopSidebar();
  }
});

avatarBtn?.addEventListener("click", () => {
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

function openScheduleModal() {
  scheduleOverlay?.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeScheduleModal() {
  scheduleOverlay?.classList.remove("open");
  document.body.style.overflow = "";
}

addScheduleBtn?.addEventListener("click", openScheduleModal);
closeScheduleBtn?.addEventListener("click", closeScheduleModal);
scheduleOverlay?.addEventListener("click", (e) => {
  if (e.target === scheduleOverlay) closeScheduleModal();
});

connectGmailBtn?.addEventListener("click", async () => {
  setLoading(true);
  try {
    await startGoogleConnection();
  } catch (err) {
    toastError(err.message || "Could not connect Gmail.");
  } finally {
    setLoading(false);
  }
});

// Schedule form submission (Overlay modal)
scheduleForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  closeScheduleModal();
  setLoading(true);

  try {
    const form = new FormData(scheduleForm);
    const type = String(form.get("schedule_type") || "one_time");
    const payload = {
      project_id: projectId,
      name: String(form.get("subject") || "Scheduled email"),
      job_type: "email",
      schedule_type: type,
      email_connection_id: String(form.get("email_connection_id") || ""),
      timezone: "Africa/Lagos",
      scheduled_for: String(form.get("scheduled_for") || ""),
      schedule_expression: type === "recurring" ? String(form.get("schedule_expression") || "") : null,
      config: {
        recipients: String(form.get("recipient") || "")
          .split(",")
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean),
        subject: String(form.get("subject") || "").trim(),
        body: String(form.get("body") || ""),
        body_type: "html",
      },
    };

    await addSchedule(payload);
    showToast("success", "Schedule created successfully.");
  } catch (err) {
    toastError(err.message || "Unable to create schedule.");
  } finally {
    await loadRows();
  }
});

// Composer submission hooks (Inline composer in Column 2)
async function senderFor(draft) {
  const connections = (await loadConnections()).filter((item) => item.status === "active");
  const sender = connections.find((item) => item.email_address === draft.sender) || connections[0];
  if (!sender) {
    throw new Error(`Connect a mail account first, then try again.`);
  }
  return sender;
}

function payloadFor(draft, sender) {
  const payload = {
    project_id: projectId,
    email_connection_id: sender?.id || null,
    name: draft.name,
    schedule_type: draft.schedule_type,
    timezone: "Africa/Lagos",
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

window.bzComposer = window.bzComposer || {};

window.bzComposer.onSubmit = async (draft) => {
  setLoading(true);
  try {
    const sender = await senderFor(draft);
    await addSchedule(payloadFor(draft, sender));
    showToast("success", "Task created successfully.");
  } catch (err) {
    toastError(err.message || "Could not save task.");
    throw err;
  } finally {
    await loadRows();
  }
};

window.bzComposer.onUpdate = async (id, draft) => {
  setLoading(true);
  try {
    const sender = await senderFor(draft);
    await updateSchedule(id, payloadFor(draft, sender));
    showToast("success", "Task updated successfully.");
  } catch (err) {
    toastError(err.message || "Could not update task.");
    throw err;
  } finally {
    await loadRows();
  }
};

// Main Initialization
async function init() {
  try {
    const session = await requireAuth();
    if (session) {
      try { initShell(session); } catch (e) { /* ignore layout differences */ }
      try { showGoogleResult(); } catch (e) { /* ignore */ }

      // Populate user profile info in sidebars if available
      const user = session.user || {};
      const meta = user.user_metadata || {};
      const email = user.email || "";
      const full = meta.full_name || meta.name || "";
      const name = meta.first_name || full.split(" ")[0] || email.split("@")[0] || "User";

      const nameEl = document.getElementById("sidebar-user-name");
      const emailEl = document.getElementById("sidebar-user-email");
      const avatarEl = document.getElementById("sidebar-user-avatar");
      const headerAvatar = document.getElementById("avatar-btn");

      if (nameEl) nameEl.textContent = full || name;
      if (emailEl) emailEl.textContent = email;
      if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();
      if (headerAvatar) headerAvatar.textContent = name.charAt(0).toUpperCase();
    }
  } catch (authErr) {
    console.warn("Auth initialization warning:", authErr);
  }

  // Load project info
  try {
    const project = await loadProject(projectId);
    await updateProjectUI(project);
  } catch (err) {
    console.warn("Could not load project info:", err);
  }

  // Populate connection select
  populateConnections();

  // Load schedules (runs animated red donut loader before showing empty state or jobs)
  await loadRows();
}

await init();