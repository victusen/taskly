import { showToast, error as toastError } from "./scripts/ui/toast.js";
import { signOut } from "./scripts/auth/auth.js";
import { initShell, showGoogleResult } from "./scripts/ui/shell.js";
import { initAccountMenu } from "./scripts/ui/accountMenu.js";
import { initInviteModal } from "./scripts/ui/inviteModal.js";
import { startGoogleConnection } from "./scripts/api/emailConnections.js";
import { openConnectModal } from "./scripts/ui/connectModal.js";
import { sendNow } from "./scripts/api/schedules.js"
import {
  loadProject,
  loadProjects,
  loadConnections,
  loadSchedules,
  changeStatus,
  updateSchedule,
  addSchedule,
  removeProject,
} from "./scripts/data/source.js";
import { saveDraft, readDrafts, deleteDraft } from "./scripts/data/drafts.js";

const PROJECT_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
const urlParams = new URLSearchParams(window.location.search);
const rawProjectId = urlParams.get("project");
const projectId = rawProjectId && PROJECT_ID_PATTERN.test(rawProjectId) ? rawProjectId : null;

if (!projectId) {
  window.location.replace("dashboard.html");
  throw new Error("Missing or invalid project id.");
}

let currentProject = null;
let isFetchingSchedules = false;

// DOM references
const taskList = document.getElementById("task-list");
const taskLoader = document.getElementById("task-loader");
const noJobState = document.getElementById("no-job-state");
const projectNotFoundState = document.getElementById("project-not-found-state");
const requestErrorState = document.getElementById("request-error-state");
const requestErrorMessage = document.getElementById("request-error-message");
const retryBtn = document.getElementById("btn-retry-schedules");
const addTaskCta = document.getElementById("add-task-cta");
const jobRows = document.getElementById("job-rows");
const taskPagination = document.getElementById("task-pagination");
const projectTitleEl = document.getElementById("project-title");
const filterButtons = document.querySelectorAll(".toggles .toggle");
const connectGmailBtn = document.getElementById("connect-gmail-btn");
const connectDatabaseBtn = document.getElementById("cmp-connect-database");
const addScheduleBtn = document.getElementById("add-schedule");
const closeScheduleBtn = document.getElementById("close-btn");
const scheduleOverlay = document.getElementById("schedule-overlay");
const scheduleForm = document.getElementById("schedule-form");
const emailConnSelect = document.getElementById("email-connection");

let currentFilter = "all";
let currentChannel = "emails";
let schedules = [];
let currentPage = 1;
let pageSize = 4;
let isFittingRows = false;
let inviteModal = null;

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

function hideAllStates() {
  if (taskLoader) {
    taskLoader.hidden = true;
    taskLoader.style.display = "none";
  }
  if (jobRows) {
    jobRows.hidden = true;
    jobRows.style.display = "none";
  }
  if (noJobState) noJobState.hidden = true;
  if (projectNotFoundState) projectNotFoundState.hidden = true;
  if (requestErrorState) requestErrorState.hidden = true;
  if (addTaskCta) addTaskCta.hidden = true;
  if (taskPagination) {
    taskPagination.hidden = true;
    taskPagination.style.display = "none";
  }
}

function setLoading(isLoading) {
  if (isLoading) {
    hideAllStates();
    if (taskLoader) {
      taskLoader.hidden = false;
      taskLoader.style.display = "flex";
    }
  } else {
    if (taskLoader) {
      taskLoader.hidden = true;
      taskLoader.style.display = "none";
    }
  }
}

function showProjectNotFound() {
  hideAllStates();
  if (projectNotFoundState) {
    projectNotFoundState.hidden = false;
  }
}

function showRequestError(msg) {
  hideAllStates();
  if (requestErrorMessage) {
    requestErrorMessage.textContent = msg || "Could not retrieve schedules. Please check your connection.";
  }
  if (requestErrorState) {
    requestErrorState.hidden = false;
  }
}

function filteredSchedules(filter = currentFilter) {
  const channelSchedules = schedules.filter((schedule) => {
    const type = String(schedule.job_type || schedule.channel || "email").toLowerCase();
    return currentChannel === "payload"
      ? type.includes("payload")
      : !type.includes("payload");
  });

  if (filter === "running") {
    return channelSchedules.filter((s) => s.status === "active" || s.status === "running");
  }
  if (filter === "new") {
    return channelSchedules.filter((s) => s.status === "new" || s.status === "pending");
  }
  if (filter === "paused") {
    return channelSchedules.filter((s) => s.status === "paused");
  }
  return channelSchedules;
}

function renderPagination(totalPages) {
  if (!taskPagination) return;

  if (totalPages <= 1) {
    taskPagination.hidden = true;
    taskPagination.style.display = "none";
    taskPagination.innerHTML = "";
    return;
  }

  const windowSize = 5;
  let start = Math.max(1, currentPage - Math.floor(windowSize / 2));
  let end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);

  const parts = [];
  if (start > 1) parts.push('<span class="page-ellipsis">…</span>');

  for (let page = start; page <= end; page += 1) {
    const active = page === currentPage;
    parts.push(
      `<button type="button" class="page-btn${active ? " active" : ""}" data-page="${page}" aria-label="Page ${page}"${active ? ' aria-current="page"' : ""}>${page}</button>`
    );
  }

  if (end < totalPages) parts.push('<span class="page-ellipsis">…</span>');

  taskPagination.innerHTML = parts.join("");
  taskPagination.hidden = false;
  taskPagination.style.display = "flex";
}

/**
 * If the current page is taller than the laptop list area, shrink the page size
 * until every visible row fits without the page itself scrolling.
 */
function fitPageToViewport(filter = currentFilter) {
  if (isFittingRows || !jobRows || jobRows.hidden || window.innerWidth < 768) return;

  const firstRow = jobRows.querySelector(".task");
  if (!firstRow) return;

  const rowHeight = firstRow.getBoundingClientRect().height;
  const available = jobRows.clientHeight;
  if (!rowHeight || !available) return;

  const fit = Math.max(1, Math.floor(available / rowHeight));
  const total = filteredSchedules(filter).length;

  if (fit < pageSize && total > fit) {
    isFittingRows = true;
    pageSize = fit;
    currentPage = Math.min(currentPage, Math.max(1, Math.ceil(total / pageSize)));
    renderRows(filter, true);
    isFittingRows = false;
  }
}

/**
 * Renders the current page of schedule rows and the pager.
 */
function renderRows(filter = currentFilter, skipFit = false) {
  // Update toggle counts
  const channelSchedules = filteredSchedules("all");
  const allCount = channelSchedules.length;
  const runningCount = channelSchedules.filter((s) => s.status === "active" || s.status === "running").length;
  const newCount = channelSchedules.filter((s) => s.status === "new" || s.status === "pending").length;
  const pausedCount = channelSchedules.filter((s) => s.status === "paused").length;

  const btnAll = document.querySelector('[data-filter="all"]');
  const btnRunning = document.querySelector('[data-filter="running"]');
  const btnNew = document.querySelector('[data-filter="new"]');
  const btnPaused = document.querySelector('[data-filter="paused"]');

  if (btnAll) btnAll.textContent = `All (${allCount})`;
  if (btnRunning) btnRunning.textContent = `Running (${runningCount})`;
  if (btnNew) btnNew.textContent = `New (${newCount})`;
  if (btnPaused) btnPaused.textContent = `Paused (${pausedCount})`;

  const filtered = filteredSchedules(filter);

  if (filtered.length === 0) {
    hideAllStates();
    if (noJobState) noJobState.hidden = false;
    if (addTaskCta) addTaskCta.hidden = false;
    return;
  }

  hideAllStates();

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  currentPage = Math.min(Math.max(1, currentPage), totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);

  if (jobRows) {
    jobRows.hidden = false;
    jobRows.style.display = "flex";
    jobRows.innerHTML = pageRows
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

  renderPagination(totalPages);

  // Update right panel task count
  if (typeof window.bzRightPanel?.updateTaskCount === 'function') {
    window.bzRightPanel.updateTaskCount(filteredSchedules("all").length);
  }

  if (!skipFit) requestAnimationFrame(() => fitPageToViewport(filter));
}

/**
 * Loads schedules from data source once per page load.
 * Guarded against concurrent runs with an 8-second request timeout,
 * and guaranteed to end loading in a finally block.
 */

async function loadRows(filter = currentFilter) {
  if (isFetchingSchedules) return;
  isFetchingSchedules = true;
  const startedAt = Date.now();
  setLoading(true);

  const TIMEOUT_MS = 6000;
  const MIN_LOADER_MS = 700;
  let fetchError = null;
  let timer = null;

  try {
    const result = await Promise.race([
      loadSchedules(projectId),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS);
      }),
    ]);
    schedules = Array.isArray(result) ? result : [];
  } catch (err) {
    fetchError = err;
    schedules = [];
  } finally {
    clearTimeout(timer);
    // Keep the red loader on screen long enough to be seen even when the
    // backend rejects instantly (offline/CORS).
    const remaining = MIN_LOADER_MS - (Date.now() - startedAt);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    setLoading(false);
    isFetchingSchedules = false;

    if (fetchError && fetchError.status === 404) {
      showProjectNotFound();
    } else if (fetchError) {
      // Timeout or other failure: show the empty state, as you asked.
      hideAllStates();
      if (noJobState) noJobState.hidden = false;
      if (addTaskCta) addTaskCta.hidden = false;
    } else {
      currentPage = 1;
      renderRows(filter);
    }
  }
}

retryBtn?.addEventListener("click", () => {
  loadRows(currentFilter);
});

document.getElementById("cmp-mail-account")?.addEventListener("click", () => {
  openConnectModal({
    projectId,
    projectName: currentProject?.project_name || currentProject?.business_name || "",
  });
});

const sidebar = document.getElementById("left-sidebar");
const sidebarCollapseButton = document.getElementById("sidebar-collapse-btn");
sidebarCollapseButton?.addEventListener("click", () => {
  if (!sidebar) return;
  const collapsed = sidebar.classList.toggle("collapsed");
  sidebarCollapseButton.setAttribute("aria-label", collapsed ? "Expand navigation" : "Collapse navigation");
  sidebarCollapseButton.title = collapsed ? "Expand navigation" : "Collapse navigation";
});

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
  // Sync right panel settings tab
  if (typeof window.bzRightPanel?.updateProjectInfo === 'function') {
    window.bzRightPanel.updateProjectInfo(project);
  }

  try {
    const loadedProjects = await loadProjects();
    const allProjects = Array.isArray(loadedProjects) ? loadedProjects : [];
    // schedules.html clones the nav template (data-sub-nav); jobs.html still
    // uses the legacy side-panel ids. Support both so neither page regresses.
    const subNavs = document.querySelectorAll(
      "[data-sub-nav], #desktop-sibling-projects, #mobile-sibling-projects"
    );

    const renderSiblings = (container) => {
      if (!container) return;
      container.innerHTML = "";
      for (const p of allProjects) {
        const isCurrent = p.id === (project?.id || projectId);
        const projectName = p.project_name || p.business_name || "Untitled Project";
        const item = el("a", `nav-item ${isCurrent ? "active" : ""}`, projectName);
        item.href = `schedules.html?project=${encodeURIComponent(p.id)}`;
        item.style.padding = "6px 10px";
        item.style.fontSize = "13px";
        item.title = p.business_name && p.business_name !== projectName
          ? `${projectName} — ${p.business_name}`
          : projectName;
        container.appendChild(item);
      }
    };

    subNavs.forEach(renderSiblings);
  } catch (e) {
    console.error("Could not load sibling projects:", e);
  } finally {
    document.querySelectorAll("[data-subnav-skeleton]").forEach((node) => node.remove());
  }

  // If project has an active connected Gmail/mail account, show light channel switcher and hide connect btn
  try {
    const connections = (await loadConnections()).filter((c) => c.status === "active");
    const projectConnection = connections.find((connection) =>
      connection.id === project?.email_connection_id
    );
    const hasConnection = Boolean(projectConnection);
    const channelSwitcher = document.getElementById("channel-switcher");
    const connectGmailBtn = document.getElementById("connect-gmail-btn");
    if (channelSwitcher && connectGmailBtn) {
      if (hasConnection) {
        channelSwitcher.style.display = "inline-flex";
        connectGmailBtn.style.display = "none";
      } else {
        channelSwitcher.style.display = "none";
        connectGmailBtn.style.display = "inline-flex";
      }
    }
  } catch (connErr) {
    console.warn("Could not check connections for channel switcher:", connErr);
  }
}

function isImmediate(draft) {
  return draft.schedule_type === "immediate";
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

async function refreshSenderField() {
  const account = document.getElementById("cmp-mail-account");
  const emailLabel = document.getElementById("cmp-mail-account-email");
  if (!account || !emailLabel) return;

  try {
    const connections = (await loadConnections()).filter((item) => item.status === "active");
    const sender = connections.find((item) => item.id === currentProject?.email_connection_id);
    emailLabel.textContent = sender?.email_address || "Mail account unavailable";
    emailLabel.dataset.email = sender?.email_address || "";
    account.title = sender
      ? `${sender.email_address} (${sender.provider === "google" ? "Gmail" : "SMTP"})`
      : "Connect a mail account first";
  } catch (err) {
    console.warn("Could not load the project mail account:", err);
    emailLabel.textContent = "Mail account unavailable";
    emailLabel.dataset.email = "";
    account.title = "Could not load the mail account for this project";
  }
}

// Filter buttons
filterButtons.forEach((btn) => {
  btn.addEventListener("click", async () => {
    filterButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const filter = btn.dataset.filter || "all";
    currentFilter = filter;
    currentPage = 1;

    // Show smooth donut loader during filter switch operation for 2 seconds
    setLoading(true);
    await new Promise((r) => setTimeout(r, 2000));
    setLoading(false);
    renderRows(filter);
  });
});

// Pager: display the next set of schedule rows in place.
taskPagination?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-page]");
  if (!button) return;

  const page = Number(button.dataset.page);
  if (!Number.isInteger(page) || page === currentPage) return;

  currentPage = page;
  renderRows(currentFilter);
  jobRows?.scrollTo?.({ top: 0 });
});

let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (window.innerWidth < 768) return;
    pageSize = 4;
    currentPage = 1;
    renderRows(currentFilter);
  }, 180);
});

const NAV_TOASTS = {
  audiences: "Audiences — coming soon. Track subscriber segments here.",
  notifications: "No new notifications.",
  "email-template": "Email templates — coming soon. Save and reuse your best emails here.",
};

let draftsOverlay = null;

function openDrafts() {
  if (!draftsOverlay) {
    draftsOverlay = document.createElement("div");
    draftsOverlay.className = "drafts-overlay";
    draftsOverlay.style.cssText = "position:fixed;inset:0;z-index:4700;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(17,24,39,.55);";
    draftsOverlay.innerHTML = `
      <section role="dialog" aria-modal="true" aria-labelledby="drafts-title" style="width:min(560px,100%);max-height:min(680px,90vh);display:flex;flex-direction:column;background:#fff;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.2);">
        <header style="display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid #e5e7eb;">
          <div>
            <p class="drafts-kicker">Your saved drafts</p>
            <h2 id="drafts-title" style="margin:0;font-size:18px;color:#111827;">Email drafts</h2>
          </div>
          <button type="button" data-drafts-close aria-label="Close drafts" style="border:0;background:transparent;font-size:24px;line-height:1;cursor:pointer;color:#6b7280;">&times;</button>
        </header>
        <div data-drafts-list style="padding:12px 20px;overflow:auto;"></div>
      </section>`;
    document.body.appendChild(draftsOverlay);
    draftsOverlay.addEventListener("click", (event) => {
      if (event.target === draftsOverlay || event.target.closest("[data-drafts-close]")) {
        draftsOverlay.remove();
        draftsOverlay = null;
        return;
      }
      const openButton = event.target.closest("[data-open-draft]");
      if (openButton) {
        const draft = readDrafts().find((item) => item.id === openButton.dataset.openDraft);
        if (draft && typeof window.bzComposer?.openDraft === "function") {
          draftsOverlay.remove();
          draftsOverlay = null;
          window.bzComposer.openDraft(draft);
        }
        return;
      }
      const deleteButton = event.target.closest("[data-delete-draft]");
      if (deleteButton) {
        try {
          deleteDraft(deleteButton.dataset.deleteDraft);
          renderDraftsList();
          showToast("success", "Draft deleted.");
        } catch (err) {
          showToast("error", err.message || "Could not delete this draft.");
        }
      }
    });
  }
  renderDraftsList();
}

function renderDraftsList() {
  if (!draftsOverlay) return;
  const list = draftsOverlay.querySelector("[data-drafts-list]");
  const drafts = readDrafts();
  list.replaceChildren();
  if (drafts.length === 0) {
    list.textContent = "No saved drafts yet. Use Save draft in the schedule editor to keep an email here.";
    list.style.cssText = "padding:24px 20px;overflow:auto;color:#6b7280;font-size:14px;";
    return;
  }
  list.style.cssText = "padding:12px 20px;overflow:auto;";
  for (const draft of drafts) {
    const row = document.createElement("article");
    row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid #f3f4f6;";
    const detail = document.createElement("div");
    detail.style.cssText = "min-width:0;";
    const name = document.createElement("strong");
    name.textContent = draft.name || "Untitled draft";
    const subject = document.createElement("p");
    subject.style.cssText = "margin:3px 0 0;color:#6b7280;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    subject.textContent = draft.subject || "No subject";
    detail.append(name, subject);
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:8px;flex-shrink:0;";
    const open = document.createElement("button");
    open.type = "button";
    open.dataset.openDraft = draft.id;
    open.textContent = "Open";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.dataset.deleteDraft = draft.id;
    remove.textContent = "Delete";
    for (const button of [open, remove]) {
      button.style.cssText = "padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;background:#fff;color:#374151;cursor:pointer;font:inherit;font-size:13px;";
    }
    actions.append(open, remove);
    row.append(detail, actions);
    list.appendChild(row);
  }
}

document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-nav-toast]");
  if (!trigger) return;
  event.preventDefault();
  if (trigger.dataset.navToast === "drafts") {
    openDrafts();
    return;
  }
  const message = NAV_TOASTS[trigger.dataset.navToast];
  if (message) showToast("info", message);
});

// Shared across the schedule page and legacy jobs page headers.
try {
  document.body.dataset.theme = localStorage.getItem("bzade_theme") === "dark" ? "dark" : "";
} catch (err) {
  console.error("Could not load theme preference:", err);
}
// Sign out buttons in the cloned sidebar/drawer
document.querySelectorAll("[data-logout]").forEach((button) => {
  button.addEventListener("click", async () => {
    try {
      await signOut();
    } catch (err) {
      console.error(err);
    }
    window.location.href = "index.html";
  });
});

function openScheduleModal() {
  scheduleOverlay?.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeScheduleModal() {
  scheduleOverlay?.classList.remove("open");
  document.body.style.overflow = "";
}

connectGmailBtn?.addEventListener("click", () => {
  openConnectModal({
    projectId,
    projectName: currentProject?.project_name || currentProject?.business_name || "",
  });
});

connectDatabaseBtn?.addEventListener("click", async () => {
  connectDatabaseBtn.disabled = true;
  try {
    showToast("info", "Opening Google to connect your Sheets.");
    await startGoogleConnection(projectId, "database");
  } catch (err) {
    showToast("error", err.message || "Could not start the Google Sheets connection.");
    connectDatabaseBtn.disabled = false;
  }
});

addScheduleBtn?.addEventListener("click", () => {
  const composer = document.getElementById("job-composer");
  if (composer?.classList.contains("sched-editor-overlay") && typeof window.bzComposer?.openCreate === "function") {
    window.bzComposer.openCreate();
    return;
  }
  openScheduleModal();
});
closeScheduleBtn?.addEventListener("click", closeScheduleModal);
scheduleOverlay?.addEventListener("click", (e) => {
  if (e.target === scheduleOverlay) closeScheduleModal();
});


// Clean tokens / hash fragments from URL
if (window.location.hash && (window.location.hash.includes("access_token") || window.location.hash.includes("refresh_token") || window.location.hash === "#")) {
  window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
}

// Channel switcher pills (Emails vs Payloads)
const channelSwitcherEl = document.getElementById("channel-switcher");
if (channelSwitcherEl) {
  const pills = channelSwitcherEl.querySelectorAll(".channel-pill");
  pills.forEach((pill) => {
    pill.addEventListener("click", async () => {
      const channel = pill.dataset.channel || "emails";
      if (channel === currentChannel) return;
      currentChannel = channel;
      currentPage = 1;
      pills.forEach((p) => {
        p.classList.remove("active");
        p.style.background = "transparent";
        p.style.color = "#6b7280";
        p.style.fontWeight = "500";
        p.style.boxShadow = "none";
      });
      pill.classList.add("active");
      pill.style.background = "#ffffff";
      pill.style.color = "#111827";
      pill.style.fontWeight = "600";
      pill.style.boxShadow = "0 1px 3px rgba(0,0,0,0.08)";
      await loadRows(currentFilter);
    });
  });
}

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
      email_connection_id: String(form.get("email_connection_id") || "") || null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      scheduled_for: String(form.get("scheduled_for") || ""),
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
    if (type === "recurring") {
      payload.schedule_rule = { every: String(form.get("schedule_expression") || "") };
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
  const sender = connections.find((item) => item.email_address === draft.sender) ||
    connections.find((item) => item.id === currentProject?.email_connection_id) ||
    connections[0];
  if (!sender) {
    throw new Error(`Connect a mail account first, then try again.`);
  }
  return sender;
}

function payloadFor(draft, sender) {
  const tzSelect = document.getElementById("cmp-tz");
  const timezone = tzSelect?.value || draft.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const payload = {
    project_id: projectId,
    email_connection_id: sender?.id || null,
    name: draft.name,
    schedule_type: draft.schedule_type,
    timezone,
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
window.bzComposer.saveDraft = saveDraft;
window.bzComposer.toast = showToast;
window.bzComposer.refreshSender = refreshSenderField;

window.bzComposer.onSubmit = async (draft) => {
  setLoading(true);
  let saved = false;
  try {
    const sender = await senderFor(draft);
    const payload = payloadFor(draft, sender);
    if (isImmediate(draft)) {
      await sendNow(payload);
    } else {
      await addSchedule(payload);
    }
    saved = true;
  } catch (err) {
    // DB rejected: re-throw so composer shows error inline
    toastError(err.message || "Could not save task.");
    throw err;
  } finally {
    // Always re-fetch from server with loader — so the UI reflects real DB state
    await loadRows();
    if (saved && typeof window.bzShowSuccess === "function") {
      window.bzShowSuccess();
    }
  }
};

window.bzComposer.onUpdate = async (id, draft) => {
  setLoading(true);
  let saved = false;
  try {
    const sender = await senderFor(draft);
    await updateSchedule(id, payloadFor(draft, sender));
    saved = true;
  } catch (err) {
    toastError(err.message || "Could not update task.");
    throw err;
  } finally {
    await loadRows();
    if (saved && typeof window.bzShowSuccess === "function") {
      window.bzShowSuccess();
    } else if (saved) {
      showToast("success", "Task updated.");
    }
  }
};

async function init() {
  showGoogleResult();

  // Load project info
  try {
    const project = await loadProject(projectId);
    currentProject = project;
    await updateProjectUI(project);
  } catch (err) {
    console.warn("Could not load project info:", err);
  }

  // Populate connection select + show the connected sender in the editor
  populateConnections();
  await refreshSenderField();

  // Wire up Project Settings & Delete Project Modals
  const deleteModal = document.getElementById("delete-project-modal");
  const deleteModalName = document.getElementById("delete-modal-project-name");
  const deleteModalCancel = document.getElementById("delete-modal-cancel");
  const deleteModalClose = document.getElementById("delete-modal-close");
  const deleteModalConfirm = document.getElementById("delete-modal-confirm");
  const settingsModal = document.getElementById("project-settings-modal");
  const settingsActiveName = document.getElementById("settings-active-name");
  const settingsModalClose = document.getElementById("settings-modal-close");
  const settingsDeleteBtn = document.getElementById("settings-delete-btn");

  function openSettings() {
    const pName = currentProject?.project_name || currentProject?.business_name || "Active Project";
    if (settingsActiveName) settingsActiveName.textContent = pName;
    if (settingsModal) settingsModal.style.display = "flex";
  }

  function closeSettings() {
    if (settingsModal) settingsModal.style.display = "none";
  }

  function openDeleteModal() {
    const pName = currentProject?.project_name || currentProject?.business_name || "Active Project";
    if (deleteModalName) deleteModalName.textContent = pName;
    if (deleteModal) deleteModal.style.display = "flex";
  }

  function closeDeleteModal() {
    if (deleteModal) deleteModal.style.display = "none";
  }

  // Wire settings navigation items
  document.querySelectorAll('a[onclick*="Project settings"], [data-action="open-settings"]').forEach((link) => {
    link.removeAttribute("onclick");
    link.addEventListener("click", (e) => {
      e.preventDefault();
      openSettings();
    });
  });

  settingsModalClose?.addEventListener("click", closeSettings);
  settingsModal?.addEventListener("click", (e) => {
    if (e.target === settingsModal) closeSettings();
  });

  settingsDeleteBtn?.addEventListener("click", () => {
    closeSettings();
    openDeleteModal();
  });

  deleteModalCancel?.addEventListener("click", closeDeleteModal);
  deleteModalClose?.addEventListener("click", closeDeleteModal);
  deleteModal?.addEventListener("click", (e) => {
    if (e.target === deleteModal) closeDeleteModal();
  });

  deleteModalConfirm?.addEventListener("click", async () => {
    if (!currentProject) return;
    deleteModalConfirm.disabled = true;
    deleteModalConfirm.textContent = "Deleting...";

    try {
      await removeProject(currentProject.id);
      showToast("success", "Project deleted successfully.");
      closeDeleteModal();
      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 500);
    } catch (err) {
      showToast("error", err.message || "Could not delete project.");
      deleteModalConfirm.disabled = false;
      deleteModalConfirm.textContent = "Delete Project";
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeDeleteModal();
      closeSettings();
    }
  });

  // Load schedules (runs animated red donut loader before showing empty state or jobs)
  await loadRows();

  // Wire up preview button in the inline composer
  const previewBtn = document.getElementById("cmp-preview-btn");
  const previewPanel = document.getElementById("cmp-preview-panel");
  const previewFrame = document.getElementById("cmp-preview-frame");
  const cmpBody = document.getElementById("cmp-body");

  if (previewBtn && previewPanel && previewFrame && cmpBody) {
    previewBtn.addEventListener("click", () => {
      const html = cmpBody.value.trim();
      const isVisible = previewPanel.style.display !== "none";
      if (isVisible) {
        previewPanel.style.display = "none";
        previewBtn.textContent = "";
        previewBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Preview`;
      } else {
        previewPanel.style.display = "block";
        previewBtn.textContent = "Hide preview";
        const doc = previewFrame.contentDocument || previewFrame.contentWindow.document;
        doc.open();
        doc.write(html || "<p style='color:#999;font-size:13px;padding:16px;'>Nothing to preview yet.</p>");
        doc.close();
      }
    });
  }

  // Phone drawer. schedules.html also wires this inline; the calls are
  // idempotent so double-binding is harmless and jobs.html keeps working.
  const drawerOverlay = document.getElementById("mobile-sidebar-overlay");
  const drawerOpenBtn = document.getElementById("hamburger-btn");
  const drawerCloseBtn = document.getElementById("sidebar-close-btn");
  const setDrawer = (open) => {
    drawerOverlay?.classList.toggle("open", open);
    drawerOpenBtn?.setAttribute("aria-expanded", String(open));
    document.body.style.overflow = open ? "hidden" : "";
  };
  drawerOpenBtn?.addEventListener("click", () => setDrawer(true));
  drawerCloseBtn?.addEventListener("click", () => setDrawer(false));
  drawerOverlay?.addEventListener("click", (e) => {
    if (e.target === drawerOverlay) setDrawer(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setDrawer(false);
  });
}

await init();

/* The sidebar drawer, project sub-list and help dropdown are wired by the
   inline layout script in schedules.html, so only the invite modal is left. */
inviteModal = initInviteModal();
initAccountMenu({ onInvite: () => inviteModal.open() });
