import { requireAuth } from "./scripts/auth/session.js";
import { signOut } from "./scripts/auth/auth.js";
import { startPayment } from "./scripts/payments/payment.js";
import { showToast, error as toastError } from "./scripts/ui/toast.js";
import { loadConnections, addProject, loadProjects, removeProject } from "./scripts/data/source.js";

// Clean any leftover tokens / hash from browser address bar
if (window.location.hash || window.location.search.includes("code=") || window.location.search.includes("access_token")) {
  window.history.replaceState({}, document.title, window.location.pathname);
}

const modal = document.getElementById("business-modal");
const form = document.getElementById("business-form");
const select = document.getElementById("conn-select");
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

const session = await requireAuth();
if (!session) throw new Error("Authentication required.");

// Populate user details in header avatar / sidebar if present
const user = session.user;
const meta = user.user_metadata || {};
const email = user.email || "";
const full = meta.full_name || meta.name || "";
const name = meta.first_name || full.split(" ")[0] || email.split("@")[0] || "User";

const avatarEl = document.getElementById("header-avatar");
if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();

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

/**
 * Renders user's projects dynamically.
 * If 0 projects: shows pre-no-result state, followed by add project button on next line.
 * Hides dropdown arrow if no projects exist.
 * Populates left sidebar with user's projects.
 */
async function renderDashboardProjects() {
  try {
    const projects = await loadProjects();
    activeProjects = Array.isArray(projects) ? projects : [];

    // Fade out and remove skeleton loaders in sidebars
    document.querySelectorAll("#subnav-skeleton").forEach((el) => {
      el.style.transition = "opacity 0.25s ease";
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 250);
    });

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
          const count = p.schedule_count ?? 0;
          return `
            <div class="proj-card-wrapper" data-project-id="${escapeHtml(p.id)}">
              <a href="schedules.html?project=${encodeURIComponent(p.id)}" style="text-decoration: none; color: inherit; display: block; height: 100%;">
                <div class="projs">
                  <div style="padding-right: 28px;">
                    <h4 class="title">${escapeHtml(pName)}</h4>
                    ${p.business_name && p.business_name !== pName ? `<p style="font-size: 13px; color: #6b7280; margin-top: 4px;">${escapeHtml(p.business_name)}</p>` : ""}
                  </div>
                  <p class="project-tag">${count} schedule${count === 1 ? "" : "s"} live and running</p>
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
                  Open schedules
                </a>
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
  } catch (err) {
    console.error("[LOAD PROJECTS ERROR]", err);
    if (projectListEl) {
      projectListEl.innerHTML = `
        <div class="no-projects-box" style="border-color: #fca5a5;">
          <h4 class="no-projects-title" style="color: #b91c1c;">Could not load projects</h4>
          <p class="no-projects-sub">${escapeHtml(err.message || "Please refresh or try again later.")}</p>
        </div>
      `;
    }
    const mDisp = document.getElementById("metric-dispatched");
    const mDel = document.getElementById("metric-delivered");
    const mBnc = document.getElementById("metric-bounced");
    const mFail = document.getElementById("metric-failed");
    if (mDisp) mDisp.textContent = "0";
    if (mDel) mDel.textContent = "0%";
    if (mBnc) mBnc.textContent = "0%";
    if (mFail) mFail.textContent = "0%";
  }
}

// 3-dots popover toggles
document.addEventListener("click", (e) => {
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
  form.reset();
  modal.classList.add("open");
  form.elements.business_name.focus();

  select.innerHTML = "";
  select.add(new Option("Loading accounts", ""));
  select.disabled = true;

  try {
    const connections = (await loadConnections()).filter((item) => item.status === "active");

    select.innerHTML = "";
    select.add(new Option(connections.length ? "Choose mail connection" : "No account connected yet", ""));

    for (const item of connections) {
      select.add(new Option(`${item.email_address} (${item.provider === "google" ? "Gmail" : "SMTP"})`, item.id));
    }
  } catch (err) {
    select.innerHTML = "";
    select.add(new Option("Could not load accounts", ""));
  } finally {
    select.disabled = false;
  }
}

function closeModal() {
  modal.classList.remove("open");
}

document.getElementById("modal-close")?.addEventListener("click", closeModal);
document.getElementById("add-business-card")?.addEventListener("click", openModal);
modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const button = form.querySelector("button[type=submit]");
  button.disabled = true;

  try {
    const project = await addProject({
      project_name: form.elements.project_name.value.trim(),
      business_name: form.elements.business_name.value.trim(),
      email_connection_id: form.elements.email_connection_id.value,
    });

    closeModal();
    showToast("success", "Business profile created.");
    await renderDashboardProjects();
  } catch (err) {
    const first = err.fieldErrors ? Object.values(err.fieldErrors)[0] : null;
    toastError(first || err.message || "Could not create the business profile.");
  } finally {
    button.disabled = false;
  }
});

// Initial load
renderDashboardProjects();
