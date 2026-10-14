import { showLoading, showError } from "./scripts/ui/states.js";
import { requireAuth } from "./scripts/auth/session.js";
import { showToast, error as toastError } from "./scripts/ui/toast.js";
import { loadProjects, addProject, loadConnections } from "./scripts/data/source.js";

const list = document.getElementById("project-list");
const modal = document.getElementById("business-modal");
const form = document.getElementById("business-form");
const select = document.getElementById("conn-select");
const sidebar = document.getElementById("dash-sidebar");
const hamburgerBtn = document.getElementById("hamburger-btn");
const scrim = document.getElementById("scrim");

let projects = [];

showLoading(list, "Loading your projects");

const session = await requireAuth();
if (!session) throw new Error("Authentication required.");

// Populate user details in sidebar
const user = session.user;
const meta = user.user_metadata || {};
const email = user.email || "";
const full = meta.full_name || meta.name || "";
const name = meta.first_name || full.split(" ")[0] || email.split("@")[0] || "User";

document.getElementById("user-name").textContent = full || name;
document.getElementById("user-email").textContent = email;
document.getElementById("user-avatar").textContent = name.charAt(0).toUpperCase();

document.getElementById("sidebar-logout").addEventListener("click", async () => {
  try {
    await session.signOut?.();
  } catch (e) {
    console.error(e);
  }
  window.location.href = "index.html";
});

function toggleSidebar(open) {
  sidebar.classList.toggle("open", open);
  scrim.classList.toggle("open", open);
  document.body.style.overflow = open ? "hidden" : "";
}

hamburgerBtn?.addEventListener("click", () => toggleSidebar(true));
scrim?.addEventListener("click", () => toggleSidebar(false));

const formatDate = (iso) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(iso));

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function jobsUrl(project) {
  return `jobs.html?project=${encodeURIComponent(project.id)}`;
}

function renderProjects() {
  list.innerHTML = "";

  for (const project of projects) {
    const card = el("a", "project-card");
    card.href = jobsUrl(project);

    const top = el("div");
    top.append(el("h3", "", project.project_name), el("p", "biz", project.business_name));

    const meta = el("div", "project-card-meta");
    meta.append(el("span", "", `Created ${formatDate(project.created_at)}`));

    const count = project.schedule_count;
    meta.append(el("span", count > 0 ? "badge badge-green" : "badge", count === undefined ? "Open" : `${count} ${count === 1 ? "email" : "emails"}`));

    card.append(top, meta);
    list.append(card);
  }

  // CTA Card (large dashed card)
  const tile = el("button", "project-card project-card-dashed", "");
  tile.type = "button";
  
  const inner = el("div", "", "");
  inner.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; gap: 8px;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg><span>Add a new business / project</span></div>`;
  tile.append(inner);
  tile.addEventListener("click", openModal);
  list.append(tile);
}

async function refresh() {
  showLoading(list, "Loading your projects");

  try {
    projects = await loadProjects();
    renderProjects();
  } catch (err) {
    if (err.status === 401) {
      window.location.href = "login.html";
      return;
    }
    showError(list, err.message || "Unable to load your projects.", refresh);
  }
}

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

document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal-cancel").addEventListener("click", closeModal);
modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modal.classList.contains("open")) closeModal();
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

    projects.push(project);
    renderProjects();
    closeModal();
    showToast("success", "Business profile created.");
  } catch (err) {
    const first = err.fieldErrors ? Object.values(err.fieldErrors)[0] : null;
    toastError(first || err.message || "Could not create the business profile.");
  } finally {
    button.disabled = false;
  }
});

await refresh();
