import { getCurrentSession, resolveUserInitial } from "../auth/session.js";
import { signOut } from "../auth/auth.js";
import { showToast } from "./toast.js";

const STYLE_ID = "account-menu-style";

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .avatar-menu-wrap { position: relative; display: inline-flex; margin-left: 8px; }
    .avatar-menu {
      display: none; position: absolute; top: 42px; right: 0; width: 280px;
      padding: 8px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
      box-shadow: 0 16px 40px rgba(17,24,39,.16); z-index: 80;
    }
    .avatar-menu.open { display: block; }
    .avatar-account-info { display: flex; align-items: center; gap: 11px; padding: 10px 9px 14px; border-bottom: 1px solid #e5e7eb; margin-bottom: 6px; }
    .avatar-account-initial { width: 38px; height: 38px; flex: 0 0 38px; display: grid; place-items: center; border-radius: 50%; background: #111827; color: #fff; font-weight: 600; }
    .avatar-account-details { min-width: 0; }
    .avatar-account-details strong, .avatar-account-details span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .avatar-account-details strong { color: #111827; font-size: 13px; }
    .avatar-account-details span { margin-top: 2px; color: #6b7280; font-size: 12px; }
    .avatar-menu-action { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 10px; border: 0; border-radius: 7px; background: transparent; color: #374151; font: inherit; font-size: 13px; text-align: left; text-decoration: none; cursor: pointer; }
    .avatar-menu-action:hover { background: #f3f4f6; color: #111827; }
    .avatar-theme-view[hidden], .avatar-main-view[hidden] { display: none; }
    body[data-theme="dark"] .avatar-menu { background: #1f2937; color: #f9fafb; border-color: #374151; }
    body[data-theme="dark"] .avatar-account-info { border-color: #374151; }
    body[data-theme="dark"] .avatar-account-details strong, body[data-theme="dark"] .avatar-menu-action { color: #f9fafb; }
    body[data-theme="dark"] .avatar-menu-action:hover { background: #374151; color: #fff; }
  `;
  document.head.appendChild(style);
}

function createMenu() {
  const menu = document.createElement("div");
  menu.className = "avatar-menu";
  menu.id = "avatar-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Account menu");
  menu.innerHTML = `
    <div class="avatar-main-view" id="avatar-main-view">
      <div class="avatar-account-info">
        <div class="avatar-account-initial" id="avatar-account-initial">U</div>
        <div class="avatar-account-details">
          <strong id="avatar-account-name">Account</strong>
          <span id="avatar-account-email"></span>
        </div>
      </div>
      <a class="avatar-menu-action" href="account/billing.html" role="menuitem">Account settings</a>
      <button type="button" class="avatar-menu-action" id="avatar-theme-open" role="menuitem"><span>Theme</span><span aria-hidden="true">&gt;</span></button>
      <button type="button" class="avatar-menu-action" id="avatar-invite" role="menuitem">Invite someone</button>
      <button type="button" class="avatar-menu-action" id="avatar-sign-out" role="menuitem">Sign out</button>
    </div>
    <div class="avatar-theme-view" id="avatar-theme-view" hidden>
      <button type="button" class="avatar-menu-action" id="avatar-theme-back"><span aria-hidden="true">&lt;</span> Back</button>
      <button type="button" class="avatar-menu-action" data-theme-choice="system">System <span data-theme-check></span></button>
      <button type="button" class="avatar-menu-action" data-theme-choice="dark">Dark <span data-theme-check></span></button>
      <button type="button" class="avatar-menu-action" data-theme-choice="light">Light <span data-theme-check></span></button>
    </div>
  `;
  return menu;
}

export function initAccountMenu({
  triggerId = "avatar-btn",
  session: initialSession = null,
  onInvite = null,
} = {}) {
  const trigger = document.getElementById(triggerId);
  if (!trigger) return;

  injectStyles();
  try {
    document.body.dataset.theme = localStorage.getItem("bzade_theme") === "dark" ? "dark" : "";
  } catch (error) {
    console.error("Could not load theme preference:", error);
  }

  let wrap = trigger.closest(".avatar-menu-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "avatar-menu-wrap";
    trigger.parentNode.insertBefore(wrap, trigger);
    wrap.appendChild(trigger);
  }

  let menu = wrap.querySelector(".avatar-menu");
  if (!menu) {
    menu = createMenu();
    wrap.appendChild(menu);
  }

  if (trigger.tagName !== "BUTTON") {
    trigger.setAttribute("role", "button");
    trigger.setAttribute("tabindex", "0");
  }
  trigger.setAttribute("aria-haspopup", "true");
  trigger.setAttribute("aria-expanded", "false");

  const mainView = menu.querySelector("#avatar-main-view");
  const themeView = menu.querySelector("#avatar-theme-view");
  const showView = (showTheme) => {
    mainView.hidden = showTheme;
    themeView.hidden = !showTheme;
  };
  const closeMenu = () => {
    menu.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
    showView(false);
  };
  const refreshThemeSelection = () => {
    try {
      const currentTheme = localStorage.getItem("bzade_theme") || "system";
      themeView.querySelectorAll("[data-theme-choice]").forEach((option) => {
        option.querySelector("[data-theme-check]").textContent =
          option.dataset.themeChoice === currentTheme ? "✓" : "";
      });
    } catch (error) {
      console.error("Could not read theme preference:", error);
      showToast("error", "Could not load your theme preference.");
    }
  };
  const loadAccount = async () => {
    try {
      const session = initialSession || await getCurrentSession();
      const user = session?.user;
      if (!user) throw new Error("No signed-in account was returned.");
      const metadata = user.user_metadata || {};
      const name = metadata.full_name || metadata.name || metadata.first_name || user.email?.split("@")[0] || "Account";
      const initial = resolveUserInitial(session);
      menu.querySelector("#avatar-account-name").textContent = name;
      menu.querySelector("#avatar-account-email").textContent = user.email || "";
      menu.querySelector("#avatar-account-initial").textContent = initial;
      trigger.textContent = initial;
    } catch (error) {
      console.error("Could not load account information:", error);
      showToast("error", error.message || "Could not load your account information.");
    }
  };

  trigger.addEventListener("click", async (event) => {
    event.stopPropagation();
    const open = !menu.classList.contains("open");
    menu.classList.toggle("open", open);
    trigger.setAttribute("aria-expanded", String(open));
    showView(false);
    if (open) await loadAccount();
  });
  trigger.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      trigger.click();
    }
  });
  document.addEventListener("click", (event) => {
    if (!wrap.contains(event.target)) closeMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
  menu.querySelector("#avatar-theme-open").addEventListener("click", () => {
    showView(true);
    refreshThemeSelection();
  });
  menu.querySelector("#avatar-theme-back").addEventListener("click", () => showView(false));
  themeView.querySelectorAll("[data-theme-choice]").forEach((option) => {
    option.addEventListener("click", () => {
      if (option.dataset.themeChoice === "light") return;
      try {
        localStorage.setItem("bzade_theme", option.dataset.themeChoice);
        document.body.dataset.theme = option.dataset.themeChoice === "dark" ? "dark" : "";
        refreshThemeSelection();
      } catch (error) {
        console.error("Could not save theme preference:", error);
        showToast("error", "Could not save your theme preference.");
      }
    });
  });
  menu.querySelector("#avatar-invite").addEventListener("click", () => {
    closeMenu();
    if (onInvite) {
      onInvite();
    } else {
      document.getElementById("btn-header-invite")?.click();
    }
  });
  menu.querySelector("#avatar-sign-out").addEventListener("click", async () => {
    try {
      await signOut();
      window.location.href = "index.html";
    } catch (error) {
      console.error("[LOGOUT]", error);
      showToast("error", "Could not sign out. Please try again.");
    }
  });
}
