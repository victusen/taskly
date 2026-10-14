import { signOut } from "../auth/auth.js";
import { startPayment } from "../payments/payment.js";
import { showToast } from "./toast.js";

const GOOGLE_RESULTS = {
  connected: ["success", "Gmail connected."],
  cancelled: ["warning", "Gmail connection cancelled."],
  missing_scope: ["warning", "Gmail needs the send permission. Connect again and keep it ticked."],
  failed: ["error", "Could not connect Gmail. Try again."],
};

/* Shows the result of the Gmail connection once, then removes ?google= from the address bar. */
export function showGoogleResult() {
  const url = new URL(window.location.href);
  const key = url.searchParams.get("google");

  if (key && GOOGLE_RESULTS[key]) {
    showToast(...GOOGLE_RESULTS[key]);
  }

  if (key) {
    url.searchParams.delete("google");
    window.history.replaceState({}, "", url);
  }
}

/* Wires what every signed in page shares: the sidebar, the avatar, log out, upgrade. */
export function initShell(session) {
  const drawer = document.getElementById("drawer");
  const scrim = document.getElementById("scrim");
  const openBtn = document.getElementById("menu-open");
  const closeBtn = document.getElementById("menu-close");

  function setMenu(open) {
    drawer.classList.toggle("open", open);
    scrim.classList.toggle("open", open);
    drawer.setAttribute("aria-hidden", String(!open));
    openBtn?.setAttribute("aria-expanded", String(open));
    document.body.style.overflow = open ? "hidden" : "";
  }

  openBtn?.addEventListener("click", () => setMenu(true));
  closeBtn?.addEventListener("click", () => setMenu(false));
  scrim.addEventListener("click", () => setMenu(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setMenu(false);
  });
  drawer.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setMenu(false)));

  const user = session.user;
  const meta = user.user_metadata || {};
  const email = user.email || "";
  const full = meta.full_name || meta.name || "";
  const name = meta.first_name || full.split(" ")[0] || email.split("@")[0] || "B";

  document.getElementById("avatar").textContent = name.charAt(0).toUpperCase();

  const emailLabel = document.getElementById("user-email");
  if (emailLabel) emailLabel.textContent = email;

  document.querySelectorAll("[data-logout]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await signOut();
      } catch (err) {
        console.error("[LOGOUT]", err);
      }
      window.location.href = "index.html";
    });
  });

  document.querySelectorAll("[data-upgrade]").forEach((button) => {
    button.addEventListener("click", () => {
      setMenu(false);
      startPayment();
    });
  });

  document.querySelectorAll("[data-sheet]").forEach((button) => {
    button.addEventListener("click", () => {
      showToast("info", "Google Sheets connection is coming soon.");
    });
  });

  return { setMenu, name };
}