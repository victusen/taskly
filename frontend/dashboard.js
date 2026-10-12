import { showLoading, showEmpty, showError } from "./scripts/ui/states.js";
import { requireAuth } from "./scripts/auth/session.js";
import { signOut } from "./scripts/auth/auth.js";
import { startGoogleConnection } from "./scripts/api/emailConnections.js";
import { getProjects, createProject } from "./scripts/api/projects.js";
import { error as toastError, success as toastSuccess } from "./scripts/ui/toast.js";

const content = document.getElementById("project-content");
const form = document.getElementById("project-form");
const logoutButton = document.getElementById("logout-btn");
const connectButton = document.getElementById("connect-google");

const GOOGLE_RESULTS = {
  connected: ["success", "Gmail connected."],
  cancelled: ["warning", "Gmail connection cancelled."],
  missing_scope: ["warning", "Gmail needs the send permission. Connect again and keep it ticked."],
  failed: ["error", "Could not connect Gmail. Try again."],
};

showLoading(content, "Loading your workspace");

const session = await requireAuth();
if (!session) throw new Error("Authentication required.");

async function load() {
  try {
    const result = await getProjects();
    const projects = result.data;
    if (projects.length > 0) {
      window.location.href = `jobs.html?project=${encodeURIComponent(projects[0].id)}`;
      return;
    }
    content.innerHTML = "";
    form.hidden = false;
  } catch (err) {
    if (err.status === 401) { window.location.href = "login.html"; return; }
    showError(content, err.message || "Unable to load your workspace.", load);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const result = await createProject({
      project_name: form.elements.project_name.value.trim(),
      business_name: form.elements.business_name.value.trim(),
    });
    window.location.href = `jobs.html?project=${encodeURIComponent(result.data.id)}`;
  } catch (err) {
    const first = err.fieldErrors ? Object.values(err.fieldErrors)[0] : null;
    toastError(first || err.message || "Could not create the project.");
    button.disabled = false;
  }
});

logoutButton?.addEventListener("click", async () => {
  await signOut();
  window.location.href = "index.html";
});

connectButton?.addEventListener("click", () => {
  startGoogleConnection().catch((err) => toastError(err.message));
});

await load();
