import {
  requireAuth,
  resolveUserInitial,
  applyUserAvatar,
  getLocalProfileAvatar,
  saveLocalProfileAvatar,
  removeLocalProfileAvatar,
} from "../../scripts/auth/session.js";
import { signOut } from "../../scripts/auth/auth.js";
import { initAccountMenu } from "../../scripts/ui/accountMenu.js";
import { showToast } from "../../scripts/ui/toast.js";

const session = await requireAuth();
if (!session) throw new Error("Authentication required.");

const user = session.user;
const metadata = user.user_metadata || {};
const initial = resolveUserInitial(session);
let savedAvatar = getLocalProfileAvatar(user.id);
let selectedAvatar = null;

applyUserAvatar(initial, null, { userId: user.id });

const accountName = document.getElementById("account-name");
const accountEmail = document.getElementById("account-email");
const profileName = document.getElementById("profile-name");
const fileInput = document.getElementById("profile-icon-file");
const chooseButton = document.getElementById("choose-profile-icon");
const saveButton = document.getElementById("save-profile-icon");
const removeButton = document.getElementById("remove-profile-icon");
const statusMessage = document.getElementById("profile-icon-status");
const teamMembersList = document.getElementById("team-members-list");
let settingsProjects = [];

const displayName = metadata.full_name || metadata.name || metadata.first_name || user.email?.split("@")[0] || "Your profile";
if (accountName) accountName.textContent = displayName;
if (accountEmail) accountEmail.textContent = user.email || "—";
if (profileName) profileName.textContent = displayName;
if (removeButton) removeButton.hidden = !savedAvatar;

try {
  initAccountMenu({ triggerId: "header-avatar", session });
} catch (error) {
  console.error("Could not initialize the Settings account menu:", error);
  showToast("error", "Could not initialize the account menu.");
}

const navTemplate = document.getElementById("settings-nav-template");
const mobileNav = document.getElementById("mobile-nav");
if (navTemplate && mobileNav) mobileNav.append(navTemplate.content.cloneNode(true));

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderTeamMembers(error = null) {
  if (!teamMembersList) return;
  if (error) {
    teamMembersList.innerHTML = `
      <p class="status-message">Could not load project access. ${escapeHtml(error.message || "Please try again.")}</p>
      <button type="button" class="button" data-retry-project-access>Try again</button>
    `;
    return;
  }
  if (settingsProjects.length === 0) {
    teamMembersList.innerHTML = '<p class="status-message">No project access to show yet.</p>';
    return;
  }

  const projectRows = settingsProjects.map((project) => {
    const name = project.project_name || project.business_name || "Untitled Project";
    const role = String(project.role || "Owner").replace(/^./, (letter) => letter.toUpperCase());
    const href = `../../schedules.html?project=${encodeURIComponent(project.id)}`;
    return `
      <a class="project-access-row" href="${escapeHtml(href)}">
        <span>${escapeHtml(name)}</span>
        <span class="project-access-role">${escapeHtml(role)}</span>
      </a>`;
  }).join("");
  teamMembersList.innerHTML = `
    <div class="team-member-row">
      <div class="team-member-avatar" aria-hidden="true">${escapeHtml(initial)}</div>
      <div class="team-member-details">
        <strong>${escapeHtml(displayName)}</strong>
        <span>${escapeHtml(user.email || "")}</span>
      </div>
      <span class="team-member-role">Owner</span>
    </div>
    <div class="project-access-list">${projectRows}</div>
  `;
}

async function loadProjectNavigation() {
  const skeletons = document.querySelectorAll("[data-project-skeleton]");
  const subNavs = document.querySelectorAll("[data-sub-nav]");
  const toggles = document.querySelectorAll("[data-toggle-projects]");
  let timeoutId;

  try {
    const projects = await Promise.race([
      import("../../scripts/data/source.js").then(({ loadProjects }) => loadProjects()),
      new Promise((_, reject) => {
        timeoutId = window.setTimeout(
          () => reject(new Error("Loading projects timed out. Check your connection and try again.")),
          8000
        );
      }),
    ]);
    const activeProjects = Array.isArray(projects) ? projects : [];
    settingsProjects = activeProjects;
    renderTeamMembers();
    skeletons.forEach((skeleton) => skeleton.remove());

    if (activeProjects.length === 0) {
      toggles.forEach((toggle) => {
        toggle.style.display = "none";
        toggle.setAttribute("aria-expanded", "false");
      });
      subNavs.forEach((nav) => {
        nav.innerHTML = "";
        nav.classList.add("collapsed");
      });
      return;
    }

    const projectLinks = activeProjects.map((project) => {
      const name = project.project_name || project.business_name || "Untitled Project";
      return `<a class="nav-item sub-item" href="../../schedules.html?project=${encodeURIComponent(project.id)}">${escapeHtml(name)}</a>`;
    }).join("");
    subNavs.forEach((nav) => {
      nav.innerHTML = projectLinks;
      nav.classList.add("collapsed");
    });
  } catch (error) {
    settingsProjects = [];
    renderTeamMembers(error);
    skeletons.forEach((skeleton) => skeleton.remove());
    toggles.forEach((toggle) => {
      toggle.style.display = "none";
      toggle.setAttribute("aria-expanded", "false");
    });
    subNavs.forEach((nav) => {
      nav.innerHTML = '<span class="project-nav-empty">Could not load projects.</span>';
      nav.classList.remove("collapsed");
    });
    console.error("Could not load the Settings project navigation:", error);
    showToast("error", error.message || "Could not load projects.");
  } finally {
    window.clearTimeout(timeoutId);
  }
}

void loadProjectNavigation();

const drawer = document.getElementById("mobile-sidebar-overlay");
const hamburger = document.getElementById("hamburger-btn");
const closeDrawerButton = document.getElementById("sidebar-close-btn");
const helpButton = document.getElementById("help-dropdown-btn");
const helpMenu = document.getElementById("help-dropdown-menu");

function setDrawerOpen(open) {
  drawer.classList.toggle("open", open);
  drawer.setAttribute("aria-hidden", String(!open));
  hamburger.setAttribute("aria-expanded", String(open));
  document.body.style.overflow = open ? "hidden" : "";
}

hamburger.addEventListener("click", () => setDrawerOpen(true));
closeDrawerButton.addEventListener("click", () => setDrawerOpen(false));
drawer.addEventListener("click", (event) => {
  if (event.target === drawer) setDrawerOpen(false);
});

function toggleProjects(toggle) {
  const subNav = toggle.closest("nav")?.querySelector("[data-sub-nav]");
  if (!subNav || toggle.style.display === "none") return;
  const collapsed = subNav.classList.toggle("collapsed");
  toggle.classList.toggle("collapsed", collapsed);
  toggle.setAttribute("aria-expanded", String(!collapsed));
}

document.querySelectorAll("[data-toggle-projects]").forEach((toggle) => {
  toggle.addEventListener("click", () => toggleProjects(toggle));
  toggle.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggleProjects(toggle);
  });
});

helpButton?.addEventListener("click", (event) => {
  if (!helpMenu) return;
  event.stopPropagation();
  const open = helpMenu.classList.toggle("show");
  helpButton.setAttribute("aria-expanded", String(open));
});

document.addEventListener("click", (event) => {
  const navToast = event.target.closest("[data-nav-toast]");
  if (navToast) {
    event.preventDefault();
    showToast("info", "Coming soon.");
    setDrawerOpen(false);
    return;
  }
  if (event.target.closest("#mobile-nav a, #mobile-nav [data-logout]")) setDrawerOpen(false);
  if (!event.target.closest("#help-menu-container")) {
    helpMenu?.classList.remove("show");
    helpButton?.setAttribute("aria-expanded", "false");
  }

  const logoutButton = event.target.closest("[data-logout]");
  if (!logoutButton) return;
  void signOut().then(() => {
    window.location.href = "/";
  }).catch((error) => {
    console.error("Could not sign out:", error);
    showToast("error", error.message || "Could not sign out.");
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setDrawerOpen(false);
    helpMenu?.classList.remove("show");
    helpButton?.setAttribute("aria-expanded", "false");
  }
});

teamMembersList?.addEventListener("click", (event) => {
  if (event.target.closest("[data-retry-project-access]")) void loadProjectNavigation();
});

chooseButton?.addEventListener("click", () => fileInput?.click());
fileInput?.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    showToast("error", "Choose a PNG, JPG, or WebP image.");
    fileInput.value = "";
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast("error", "Choose an image smaller than 5 MB.");
    fileInput.value = "";
    return;
  }

  try {
    selectedAvatar = await resizeAvatar(file);
    applyUserAvatar(initial, selectedAvatar, { preferProvided: true, userId: user.id });
    saveButton.disabled = false;
    statusMessage.textContent = "Preview updated. Save to use this icon on this device.";
  } catch (error) {
    console.error("Could not prepare profile icon:", error);
    showToast("error", error.message || "Could not read that image.");
    fileInput.value = "";
  }
});

saveButton?.addEventListener("click", async () => {
  if (!selectedAvatar) return;
  saveButton.disabled = true;
  chooseButton.disabled = true;
  removeButton.disabled = true;
  statusMessage.textContent = "Saving profile icon...";
  try {
    saveLocalProfileAvatar(user.id, selectedAvatar);
    savedAvatar = selectedAvatar;
    selectedAvatar = null;
    fileInput.value = "";
    applyUserAvatar(initial, null, { userId: user.id });
    removeButton.hidden = false;
    statusMessage.textContent = "Your profile icon is saved on this device.";
    showToast("success", "Profile icon updated.");
  } catch (error) {
    console.error("Could not save profile icon:", error);
    statusMessage.textContent = "";
    showToast("error", error.message || "Could not save your profile icon.");
  } finally {
    saveButton.disabled = !selectedAvatar;
    chooseButton.disabled = false;
    removeButton.disabled = false;
  }
});

removeButton?.addEventListener("click", async () => {
  if (!savedAvatar) return;
  removeButton.disabled = true;
  chooseButton.disabled = true;
  try {
    removeLocalProfileAvatar(user.id);
    savedAvatar = null;
    selectedAvatar = null;
    fileInput.value = "";
    applyUserAvatar(initial, null, { userId: user.id });
    removeButton.hidden = true;
    saveButton.disabled = true;
    statusMessage.textContent = "Your profile icon has been removed.";
    showToast("success", "Profile icon removed.");
  } catch (error) {
    console.error("Could not remove profile icon:", error);
    showToast("error", error.message || "Could not remove your profile icon.");
  } finally {
    removeButton.disabled = false;
    chooseButton.disabled = false;
  }
});

function resizeAvatar(file) {
  return new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(imageUrl);
      const size = 128;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Your browser could not process this image."));
        return;
      }
      const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, size, size);
      context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
      try {
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      } catch (error) {
        reject(new Error("Your browser could not encode this image."));
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      reject(new Error("Could not load that image."));
    };
    image.src = imageUrl;
  });
}
