import { requireAuth, resolveUserInitial, applyUserAvatar } from "./scripts/auth/session.js";
import { signOut } from "./scripts/auth/auth.js";
import { startPayment } from "./scripts/payments/payment.js";
import { showToast } from "./scripts/ui/toast.js";
import { loadConnections, addProject, loadProjects, loadSchedules, removeProject } from "./scripts/data/source.js";
import { initInviteModal } from "./scripts/ui/inviteModal.js";
import { initAccountMenu } from "./scripts/ui/accountMenu.js";
import { openConnectModal } from "./scripts/ui/connectModal.js";
import { showGoogleResult } from "./scripts/ui/shell.js";

// Stub navigations for Audiences and Team members (real pages come later)
window.bzShowAudiences = () => showToast("info", "Audiences — coming soon. Track subscriber segments here.");
window.bzShowTeam = () => showToast("info", "Team members — coming soon. Invite collaborators to your projects.");

// Clean any leftover tokens / hash from browser address bar
if (window.location.hash || window.location.search.includes("code=") || window.location.search.includes("access_token")) {
  window.history.replaceState({}, document.title, window.location.pathname);
}

const modal = document.getElementById("business-modal");
const form = document.getElementById("business-form");
const businessCreateState = document.getElementById("business-create-state");
const businessLoading = document.getElementById("business-loading");
const businessCreateMessage = document.getElementById("business-create-message");
const businessCreateRetry = document.getElementById("business-create-retry");
const businessCreateEdit = document.getElementById("business-create-edit");
const projectListEl = document.getElementById("project-list");
const deleteModal = document.getElementById("delete-project-modal");
const deleteModalName = document.getElementById("delete-modal-project-name");
const deleteModalCancel = document.getElementById("delete-modal-cancel");
const deleteModalConfirm = document.getElementById("delete-modal-confirm");
const settingsModal = document.getElementById("project-settings-modal");
const settingsActiveName = document.getElementById("settings-active-name");
const settingsModalClose = document.getElementById("settings-modal-close");
const settingsDeleteBtn = document.getElementById("settings-delete-btn");

let pendingDeleteProject = null;
let activeProjects = [];
let projectMailConnections = new Map();
let projectScheduleCounts = new Map();
let projectMailConnectionsRequest = null;
let projectMailConnectionsLoaded = false;
let pendingBusinessInput = null;
let isCreatingBusiness = false;
let dashboardProjectRenderVersion = 0;

const session = await requireAuth();
if (!session) throw new Error("Authentication required.");

showGoogleResult();

// Populate user details in header avatar / sidebar
const initial = resolveUserInitial(session);
applyUserAvatar(initial);

// Conditionally show or hide the "Upgrade to paid" link.
// A paid user has plan info in user_metadata. If none, assume free.
(function applyPlanVisibility() {
  const meta = session?.user?.user_metadata || {};
  const plan = (meta.plan || meta.subscription_plan || "free").toLowerCase();
  const isPaid = plan !== "free" && plan !== "starter" && plan !== "";
  const upgradeLink = document.getElementById("upgrade-to-paid-link");
  if (upgradeLink) upgradeLink.style.display = isPaid ? "none" : "";
})();

// Initialize right-side team member invite drawer modal
const inviteModal = initInviteModal();
initAccountMenu({
  triggerId: "header-avatar",
  session,
  onInvite: () => inviteModal.open(),
});

/* Every Sign out button (laptop sidebar and phone drawer) signs out. */
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

/* Every Billing and Upgrade button starts payment or navigates to billing */
document.querySelectorAll("[data-upgrade]").forEach((button) => {
  button.addEventListener("click", () => startPayment());
});

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function refreshProjectMailConnections({ notify = false } = {}) {
  if (projectMailConnectionsRequest) return projectMailConnectionsRequest;
  projectMailConnectionsRequest = (async () => {
    try {
      const connections = await loadConnections();
      const ownedProjectIds = new Set(activeProjects.map((project) => project.id));
      projectMailConnections = new Map(
        connections
          .filter((connection) => ownedProjectIds.has(connection.project_id))
          .map((connection) => [connection.project_id, connection])
      );
      projectMailConnectionsLoaded = true;

      document.querySelectorAll(".proj-card-wrapper[data-project-id]").forEach((card) => {
        const connection = projectMailConnections.get(card.dataset.projectId);
        const connectAction = card.querySelector('[data-action="connect"]');
        if (connectAction) {
          connectAction.setAttribute("aria-label", connection ? "Check connected mail account" : "Connect mail account");
          const label = connectAction.querySelector("[data-mail-action-label]");
          if (label) {
            label.textContent = connection?.status === "active"
              ? "View mail account"
              : connection ? "Reconnect mail account" : "Connect mail account";
          }
        }
        renderProjectInsight(card);
      });
      return projectMailConnections;
    } catch (error) {
      projectMailConnectionsLoaded = false;
      console.error("Could not refresh project mail accounts:", error);
      if (notify) showToast("error", error.message || "Could not check this project's mail account.");
      return null;
    } finally {
      projectMailConnectionsRequest = null;
    }
  })();
  return projectMailConnectionsRequest;
}

function renderProjectInsight(card) {
  const projectId = card.dataset.projectId;
  const label = card.querySelector("[data-project-info]");
  if (!label) return;
  const connection = projectMailConnections.get(projectId);
  const mailMessage = connection?.status === "active"
    ? `Mail connected: ${connection.email_address}`
    : connection ? "Mail account needs attention" : "No mail account connected";
  const todayCount = projectScheduleCounts.get(projectId);
  const messages = [mailMessage];
  if (Number.isInteger(todayCount)) {
    messages.push(todayCount === 1
      ? "1 schedule set to run today"
      : `${todayCount} schedules set to run today`);
  }
  const currentIndex = Number(card.dataset.projectInfoIndex || 0) % messages.length;
  card.dataset.projectInfoIndex = String(currentIndex);
  label.textContent = messages[currentIndex];
  label.dataset.messages = JSON.stringify(messages);
}

async function refreshProjectScheduleInsights() {
  const projects = [...activeProjects];
  await Promise.all(projects.map(async (project) => {
    try {
      const schedules = [];
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const result = await loadSchedules(project.id, { page, pageSize: 50, filter: "all", jobType: "email" });
        const items = Array.isArray(result) ? result : result?.items || [];
        schedules.push(...items);
        hasMore = Boolean(result?.hasMore);
        page += 1;
      }
      const now = new Date();
      const todayCount = schedules.filter((schedule) => {
        if (schedule.status !== "active") return false;
        const nextRun = schedule.next_run_at || schedule.scheduled_for;
        if (!nextRun) return false;
        const date = new Date(nextRun);
        return !Number.isNaN(date.getTime()) &&
          date.getFullYear() === now.getFullYear() &&
          date.getMonth() === now.getMonth() &&
          date.getDate() === now.getDate();
      }).length;
      projectScheduleCounts.set(project.id, todayCount);
      const card = document.querySelector(`.proj-card-wrapper[data-project-id="${CSS.escape(project.id)}"]`);
      if (card) renderProjectInsight(card);
    } catch (error) {
      projectScheduleCounts.delete(project.id);
      console.error(`Could not load schedule insights for project ${project.id}:`, error);
    }
  }));
}

/**
 * Renders user's projects dynamically.
 * If 0 projects: shows pre-no-result state, followed by add project button on next line.
 * Hides dropdown arrow if no projects exist.
 * Populates left sidebar with user's projects.
 */
async function renderDashboardProjects({ fallbackProject = null, useFallback = false } = {}) {
  // Race loadProjects against an 8-second timeout so skeleton never spins forever
  const SKELETON_TIMEOUT_MS = 8000;
  const renderVersion = ++dashboardProjectRenderVersion;
  const previousProjects = activeProjects;
  let projects = null;
  let loadError = null;

  if (useFallback && fallbackProject) {
    activeProjects = [fallbackProject, ...previousProjects.filter((project) => project.id !== fallbackProject.id)];
  } else {
    try {
      projects = await Promise.race([
        loadProjects(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Request timed out. Check your connection and refresh.")), SKELETON_TIMEOUT_MS)
        ),
      ]);
    } catch (err) {
      loadError = err;
    }
    if (renderVersion !== dashboardProjectRenderVersion) return;
    if (loadError && fallbackProject) {
      activeProjects = [fallbackProject, ...previousProjects.filter((project) => project.id !== fallbackProject.id)];
      loadError = null;
    } else if (loadError) {
      activeProjects = [];
    } else {
      activeProjects = Array.isArray(projects) ? projects : [];
      if (projects && projects.__fromCache) {
        // Offline mode silent or gentle indicator
      }
    }
  }

  // Always fade out skeleton loaders — errors or success, skeleton must go
  document.querySelectorAll("#subnav-skeleton").forEach((el) => {
    el.style.transition = "opacity 0.25s ease";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 250);
  });

  // If we got a network/timeout error, check cache flag first
  if (loadError) {
    console.error("[LOAD PROJECTS ERROR]", loadError);
    // If __fromCache is set, projects already loaded from cache — don't error-state
    // (This path only runs if cache also failed)
    showToast("error", "Could not reach the server. Check your connection.");

    // Hide toggle arrows since we don't know if there are projects
    document.querySelectorAll(".projects-toggle-icon").forEach((a) => (a.style.display = "none"));
    document.querySelectorAll("[data-sub-nav]").forEach((nav) => {
      nav.innerHTML = "";
      nav.style.display = "none";
    });

    if (projectListEl) {
      projectListEl.innerHTML = `
        <div class="no-projects-box">
          <div class="no-projects-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.8">
              <path d="M12 2L16.5 4.6V9.8L12 12.4L7.5 9.8V4.6L12 2Z"/>
              <path d="M12 12.4V7.2M12 7.2L16.5 4.6M12 7.2L7.5 4.6"/>
              <path d="M7.5 10.2L12 12.8V18L7.5 20.6L3 18V12.8L7.5 10.2Z"/>
              <path d="M7.5 20.6V15.4M7.5 15.4L12 12.8M7.5 15.4L3 12.8"/>
              <path d="M16.5 10.2L21 12.8V18L16.5 20.6L12 18V12.8L16.5 10.2Z"/>
              <path d="M16.5 20.6V15.4M16.5 15.4L21 12.8M16.5 15.4L12 12.8"/>
            </svg>
          </div>
          <h4 class="no-projects-title">Could not load projects</h4>
          <p class="no-projects-sub">Check your connection and refresh the page.</p>
        </div>
      `;
    }
    // Still clear metric skeletons with zeroes
    ["metric-dispatched", "metric-delivered", "metric-bounced", "metric-failed"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = "—";
    });
    return;
  }

  // Populate Sidebar Subnav
  const subNavs = document.querySelectorAll("[data-sub-nav]");
  const toggleArrows = document.querySelectorAll(".projects-toggle-icon");

  if (activeProjects.length === 0) {
    // Hide dropdown arrow when there's no project created yet
    toggleArrows.forEach((arrow) => {
      arrow.style.display = "none";
    });
    subNavs.forEach((nav) => {
      nav.style.display = "none";
      nav.innerHTML = "";
    });

    // Render pre no-result state in project list
    if (projectListEl) {
      projectListEl.innerHTML = `
        <div class="no-projects-box">
          <div class="no-projects-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.8">
              <path d="M12 2L16.5 4.6V9.8L12 12.4L7.5 9.8V4.6L12 2Z"/>
              <path d="M12 12.4V7.2M12 7.2L16.5 4.6M12 7.2L7.5 4.6"/>
              <path d="M7.5 10.2L12 12.8V18L7.5 20.6L3 18V12.8L7.5 10.2Z"/>
              <path d="M7.5 20.6V15.4M7.5 15.4L12 12.8M7.5 15.4L3 12.8"/>
              <path d="M16.5 10.2L21 12.8V18L16.5 20.6L12 18V12.8L16.5 10.2Z"/>
              <path d="M16.5 20.6V15.4M16.5 15.4L21 12.8M16.5 15.4L12 12.8"/>
            </svg>
          </div>
          <h4 class="no-projects-title">No projects created yet</h4>
          <p class="no-projects-sub">Create your first Bzade project to configure email automations and scheduled tasks.</p>
        </div>
      `;
    }
    ["metric-dispatched", "metric-delivered", "metric-bounced", "metric-failed"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = "0";
    });
    return;
  }

  // Projects exist: show dropdown arrow
  toggleArrows.forEach((arrow) => {
    arrow.style.display = "";
  });

  // Populate sidebar project list
  const sidebarItemsHtml = activeProjects
    .map(
      (p) =>
        `<a href="schedules.html?project=${encodeURIComponent(p.id)}" class="nav-item sub-item">${escapeHtml(
          p.project_name || p.business_name || "Untitled Project"
        )}</a>`
    )
    .join("");

  subNavs.forEach((nav) => {
    nav.innerHTML = sidebarItemsHtml;
    nav.style.display = "";
    nav.style.opacity = "0";
    nav.style.transition = "opacity 0.25s ease";
    requestAnimationFrame(() => {
      nav.style.opacity = "1";
    });
  });

  // Render Dynamic Project Cards with 3-dots top right
  if (projectListEl) {
    projectListEl.innerHTML = activeProjects
      .map((p) => {
        const pName = p.project_name || p.business_name || "Untitled Project";
        const count = 0;
        return `
          <div class="proj-card-wrapper" data-project-id="${escapeHtml(p.id)}">
            <a href="schedules.html?project=${encodeURIComponent(p.id)}" style="text-decoration: none; color: inherit; display: block; height: 100%;">
              <div class="projs">
                <div style="padding-right: 28px;">
                  <h4 class="title">${escapeHtml(pName)}</h4>
                  ${p.business_name && p.business_name !== pName ? `<p style="font-size: 13px; color: #6b7280; margin-top: 4px;">${escapeHtml(p.business_name)}</p>` : ""}
                </div>
                <p class="project-tag" data-project-info aria-live="polite">${projectMailConnections.get(p.id)?.status === "active"
                  ? `Mail connected: ${escapeHtml(projectMailConnections.get(p.id).email_address)}`
                  : projectMailConnections.has(p.id) ? "Mail account needs attention" : "No mail account connected"}</p>
              </div>
            </a>

            <!-- 3 Dots Action with fully rounded lightgrey hover -->
            <button type="button" class="proj-dots-btn" aria-label="Project options" data-dots-trigger data-id="${escapeHtml(p.id)}" data-name="${escapeHtml(pName)}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="2"></circle>
                <circle cx="12" cy="12" r="2"></circle>
                <circle cx="12" cy="19" r="2"></circle>
              </svg>
            </button>

            <!-- Popover toggle menu -->
            <div class="proj-menu-dropdown" style="display: none;" data-menu-dropdown>
              <a href="schedules.html?project=${encodeURIComponent(p.id)}" class="proj-menu-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                Open project
              </a>
              <button type="button" class="proj-menu-item" data-action="connect" data-id="${escapeHtml(p.id)}" data-name="${escapeHtml(pName)}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                <span data-mail-action-label>${projectMailConnections.get(p.id)?.status === "active"
                  ? "View mail account"
                  : projectMailConnections.has(p.id) ? "Reconnect mail account" : "Connect mail account"}</span>
              </button>
              <button type="button" class="proj-menu-item" data-action="settings" data-id="${escapeHtml(p.id)}" data-name="${escapeHtml(pName)}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06-.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                Project settings
              </button>
              <div class="proj-menu-divider"></div>
              <button type="button" class="proj-menu-item delete-item" data-action="delete" data-id="${escapeHtml(p.id)}" data-name="${escapeHtml(pName)}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                Delete project
              </button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  // Populate synced metrics, replacing skeleton placeholders
  const mDisp = document.getElementById("metric-dispatched");
  const mDel = document.getElementById("metric-delivered");
  const mBnc = document.getElementById("metric-bounced");
  const mFail = document.getElementById("metric-failed");
  if (mDisp) mDisp.textContent = "0";
  if (mDel) mDel.textContent = "0%";
  if (mBnc) mBnc.textContent = "0%";
  if (mFail) mFail.textContent = "0%";
  void refreshProjectMailConnections({ notify: true }).then(() => refreshProjectScheduleInsights());
}

function rotateProjectInsights() {
  document.querySelectorAll(".proj-card-wrapper[data-project-id]").forEach((card) => {
    const label = card.querySelector("[data-project-info]");
    if (!label) return;
    let messages = [];
    try {
      messages = JSON.parse(label.dataset.messages || "[]");
    } catch (error) {
      console.error("Could not read project insight messages:", error);
    }
    if (messages.length < 2) return;
    card.dataset.projectInfoIndex = String((Number(card.dataset.projectInfoIndex || 0) + 1) % messages.length);
    label.textContent = messages[Number(card.dataset.projectInfoIndex)];
  });
}

window.setInterval(rotateProjectInsights, 4500);

// 3-dots popover toggles
document.addEventListener("click", async (e) => {
  const dotsBtn = e.target.closest("[data-dots-trigger]");
  const allDropdowns = document.querySelectorAll("[data-menu-dropdown]");

  if (dotsBtn) {
    e.stopPropagation();
    const wrapper = dotsBtn.closest(".proj-card-wrapper");
    const dropdown = wrapper?.querySelector("[data-menu-dropdown]");
    const isOpen = dropdown?.style.display === "flex";

    // Close others
    allDropdowns.forEach((d) => (d.style.display = "none"));
    document.querySelectorAll("[data-dots-trigger]").forEach((b) => b.classList.remove("active"));

    if (dropdown && !isOpen) {
      dropdown.style.display = "flex";
      dotsBtn.classList.add("active");
    }
    return;
  }

  // Handle Action clicks inside the dropdown
  const actionBtn = e.target.closest(".proj-menu-item");
  if (actionBtn) {
    const action = actionBtn.getAttribute("data-action");
    const projectId = actionBtn.getAttribute("data-id");
    const projectName = actionBtn.getAttribute("data-name");

    allDropdowns.forEach((d) => (d.style.display = "none"));
    document.querySelectorAll("[data-dots-trigger]").forEach((b) => b.classList.remove("active"));

    if (action === "connect") {
      if (!projectMailConnectionsLoaded) {
        showToast("error", "Could not verify this project's mail account. Check your connection and try again.");
        return;
      }
      const connection = projectMailConnections.get(projectId);
      if (connection?.status === "active") {
        showToast("info", "This project already has a mail account. Go in and see your projects.");
        return;
      }
      openConnectModal({ projectId, projectName });
      return;
    }
    
    if (action === "delete") {
      openDeleteModal(projectId, projectName);
      return;
    }
    if (action === "settings") {
      openSettingsModal(projectId, projectName);
      return;
    }
  }

  // Clicked elsewhere: close all dropdowns
  if (!e.target.closest("[data-menu-dropdown]")) {
    allDropdowns.forEach((d) => (d.style.display = "none"));
    document.querySelectorAll("[data-dots-trigger]").forEach((b) => b.classList.remove("active"));
  }
});

// Sidebar Settings link click
document.addEventListener("click", (e) => {
  const settingsLink = e.target.closest("[data-sidebar-settings]");
  if (settingsLink) {
    e.preventDefault();
    const firstProject = activeProjects[0];
    if (firstProject) {
      openSettingsModal(firstProject.id, firstProject.project_name || firstProject.business_name);
    } else {
      showToast("info", "Create a project first to configure settings.");
    }
  }
});

/**
 * Delete Modal Functions
 */
function openDeleteModal(projectId, projectName) {
  pendingDeleteProject = { id: projectId, name: projectName };
  if (deleteModalName) deleteModalName.textContent = projectName || "this project";
  if (deleteModal) deleteModal.classList.add("open");
}

function closeDeleteModal() {
  pendingDeleteProject = null;
  if (deleteModal) deleteModal.classList.remove("open");
}

deleteModalCancel?.addEventListener("click", closeDeleteModal);
deleteModal?.addEventListener("click", (e) => {
  if (e.target === deleteModal) closeDeleteModal();
});

deleteModalConfirm?.addEventListener("click", async () => {
  if (!pendingDeleteProject) return;
  deleteModalConfirm.disabled = true;
  deleteModalConfirm.textContent = "Deleting...";

  try {
    await removeProject(pendingDeleteProject.id);
    closeDeleteModal();
    closeSettingsModal();
    showToast("success", "Project deleted successfully.");
    await renderDashboardProjects();
  } catch (err) {
    showToast("error", err.message || "Failed to delete project.");
  } finally {
    deleteModalConfirm.disabled = false;
    deleteModalConfirm.textContent = "Delete Project";
  }
});

/**
 * Settings Modal Functions
 */
function openSettingsModal(projectId, projectName) {
  pendingDeleteProject = { id: projectId, name: projectName };
  if (settingsActiveName) settingsActiveName.textContent = projectName || "-";
  if (settingsModal) settingsModal.classList.add("open");
}

function closeSettingsModal() {
  if (settingsModal) settingsModal.classList.remove("open");
}

settingsModalClose?.addEventListener("click", closeSettingsModal);
settingsModal?.addEventListener("click", (e) => {
  if (e.target === settingsModal) closeSettingsModal();
});

settingsDeleteBtn?.addEventListener("click", () => {
  if (pendingDeleteProject) {
    closeSettingsModal();
    openDeleteModal(pendingDeleteProject.id, pendingDeleteProject.name);
  }
});

// Global Escape listener for modals
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeDeleteModal();
    closeSettingsModal();
    closeModal();
  }
});

/**
 * Add Business Modal Functions
 */
async function openModal() {
  if (isCreatingBusiness) return;
  form.reset();
  form.hidden = false;
  businessCreateState.hidden = true;
  businessLoading.hidden = true;
  modal.classList.remove("is-loading");
  businessCreateRetry.hidden = true;
  businessCreateEdit.hidden = true;
  businessCreateMessage.textContent = "";
  modal.classList.add("open");
  form.elements.business_name.focus();
}

function closeModal() {
  modal.classList.remove("open");
  modal.classList.remove("is-loading");
  businessLoading.hidden = true;
  form.hidden = false;
  businessCreateState.hidden = true;
}

document.getElementById("modal-close")?.addEventListener("click", closeModal);
document.getElementById("business-create-close")?.addEventListener("click", closeModal);
document.getElementById("business-loading-close")?.addEventListener("click", closeModal);
document.getElementById("add-business-card")?.addEventListener("click", openModal);
modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});

form.elements.project_name.addEventListener("input", (event) => {
  form.elements.business_name.setCustomValidity("");
  if (event.currentTarget.value.trim()) event.currentTarget.setCustomValidity("");
});
form.elements.business_name.addEventListener("input", (event) => {
  form.elements.project_name.setCustomValidity("");
  if (event.currentTarget.value.trim()) event.currentTarget.setCustomValidity("");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const enteredProjectName = form.elements.project_name.value.trim();
  const enteredBusinessName = form.elements.business_name.value.trim();
  const projectNameField = form.elements.project_name;
  const businessNameField = form.elements.business_name;

  if (!enteredProjectName && !enteredBusinessName) {
    projectNameField.setCustomValidity("Enter a business name or a project name.");
    projectNameField.reportValidity();
    return;
  }

  projectNameField.setCustomValidity("");
  businessNameField.setCustomValidity("");
  pendingBusinessInput = {
    project_name: enteredProjectName || enteredBusinessName,
    business_name: enteredBusinessName || enteredProjectName,
  };
  await createBusiness(pendingBusinessInput);
});

async function createBusiness(input) {
  if (!input || isCreatingBusiness) return;
  const enteredProjectName = String(input.project_name || "").trim();
  const enteredBusinessName = String(input.business_name || "").trim();
  if (!enteredProjectName && !enteredBusinessName) {
    form.hidden = false;
    businessCreateState.hidden = true;
    form.elements.project_name.setCustomValidity("Enter a business name or a project name.");
    form.elements.project_name.reportValidity();
    return;
  }
  const projectName = enteredProjectName || enteredBusinessName;
  const businessName = enteredBusinessName || enteredProjectName;
  input = { project_name: projectName, business_name: businessName };
  pendingBusinessInput = input;
  isCreatingBusiness = true;
  form.hidden = true;
  businessCreateState.hidden = true;
  businessLoading.hidden = false;
  modal.classList.add("is-loading");
  businessCreateRetry.hidden = true;
  businessCreateState.dataset.state = "loading";
  businessCreateMessage.textContent = "Creating your business and loading its project details…";

  try {
    const createdProject = await addProject(input);
    isCreatingBusiness = false;
    closeModal();
    showToast("success", "Business profile created.");
    await renderDashboardProjects({ fallbackProject: createdProject, useFallback: true });
  } catch (err) {
    modal.classList.remove("is-loading");
    businessLoading.hidden = true;
    businessCreateState.hidden = false;
    const first = err.fieldErrors ? Object.values(err.fieldErrors)[0] : null;
    businessCreateState.dataset.state = "error";
    businessCreateMessage.textContent = first || err.message || "Could not create the business profile. Check your connection and try again.";
    businessCreateRetry.hidden = false;
    businessCreateEdit.hidden = false;
  } finally {
    isCreatingBusiness = false;
  }
}

businessCreateRetry?.addEventListener("click", () => createBusiness(pendingBusinessInput));
businessCreateEdit?.addEventListener("click", () => {
  if (isCreatingBusiness) return;
  businessCreateState.hidden = true;
  form.hidden = false;
});

// Initial load
renderDashboardProjects();
window.setInterval(() => {
  if (document.visibilityState === "visible") {
    void refreshProjectMailConnections().then(() => refreshProjectScheduleInsights());
  }
}, 60_000);
