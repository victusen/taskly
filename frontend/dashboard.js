import { requireAuth } from "./scripts/auth/session.js";
import { signOut } from "./scripts/auth/auth.js";
import { startPayment } from "./scripts/payments/payment.js";
import { showToast, error as toastError } from "./scripts/ui/toast.js";
import { loadConnections, addProject } from "./scripts/data/source.js";

const modal = document.getElementById("business-modal");
const form = document.getElementById("business-form");
const select = document.getElementById("conn-select");
const hamburgerBtn = document.getElementById("hamburger-btn");
const scrim = document.getElementById("scrim");

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

/* Every Billing and Upgrade button starts payment. */
document.querySelectorAll("[data-upgrade]").forEach((button) => {
  button.addEventListener("click", () => startPayment());
});

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

    closeModal();
    showToast("success", "Business profile created.");
    setTimeout(() => {
      window.location.href = `jobs.html?project=${encodeURIComponent(project.id)}`;
    }, 500);
  } catch (err) {
    const first = err.fieldErrors ? Object.values(err.fieldErrors)[0] : null;
    toastError(first || err.message || "Could not create the business profile.");
  } finally {
    button.disabled = false;
  }
});
