import { showToast } from "./toast.js";
import { loadProjects } from "../data/source.js";

/**
 * Slide-over drawer modal for inviting team members.
 * Slides in from the right edge with a dimmed backdrop.
 */
export function initInviteModal(options = {}) {
  // Prevent duplicate initialization
  if (document.getElementById("invite-drawer-overlay")) {
    return {
      open: () => openDrawer(),
      close: () => closeDrawer()
    };
  }

  // Determine relative path to documentation.html
  const isSubdir = window.location.pathname.includes("/account/") || window.location.pathname.includes("/job/");
  const docsUrl = isSubdir ? "../documentation.html#team" : "documentation.html#team";

  // Create Styles
  const style = document.createElement("style");
  style.id = "invite-modal-styles";
  style.textContent = `
    .invite-drawer-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      z-index: 3500;
      opacity: 0;
      transition: opacity 0.25s ease;
    }
    .invite-drawer-overlay.open {
      display: block;
      opacity: 1;
    }
    .invite-drawer {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      width: 600px;
      max-width: 92vw;
      background: #ffffff;
      box-shadow: -8px 0 30px rgba(0, 0, 0, 0.15);
      display: flex;
      flex-direction: column;
      transform: translateX(100%);
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .invite-drawer-overlay.open .invite-drawer {
      transform: translateX(0);
    }
    .invite-drawer-header {
      padding: 24px 28px 18px 28px;
      border-bottom: 1px solid #f3f4f6;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-shrink: 0;
    }
    .invite-drawer-title {
      font-size: 20px;
      font-weight: 700;
      color: #111827;
      margin: 0;
      line-height: 1.3;
    }
    .invite-drawer-sub {
      font-size: 13px;
      color: #6b7280;
      margin-top: 4px;
      line-height: 1.45;
    }
    .invite-close-btn {
      background: transparent;
      border: none;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: #4b5563;
      transition: background 0.15s ease, color 0.15s ease;
      flex-shrink: 0;
      margin-left: 12px;
    }
    .invite-close-btn:hover {
      background: #f3f4f6;
      color: #111827;
    }
    .invite-drawer-body {
      padding: 24px 28px;
      overflow-y: auto;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .invite-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .invite-label {
      font-size: 13px;
      font-weight: 600;
      color: #374151;
    }
    .invite-hint {
      font-size: 12px;
      color: #9ca3af;
    }
    .invite-input, .invite-select, .invite-textarea {
      width: 100%;
      padding: 10px 14px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
      color: #111827;
      background: #ffffff;
      font-family: inherit;
      box-sizing: border-box;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .invite-input:focus, .invite-select:focus, .invite-textarea:focus {
      outline: none;
      border-color: #16a34a;
      box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.12);
    }
    .invite-scope-toggle {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .invite-scope-pill {
      border: 1px solid #d1d5db;
      border-radius: 6px;
      padding: 10px 12px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 2px;
      transition: all 0.15s ease;
      background: #fafafa;
    }
    .invite-scope-pill.active {
      border-color: #16a34a;
      background: #f0fdf4;
    }
    .invite-scope-title {
      font-size: 13px;
      font-weight: 600;
      color: #111827;
    }
    .invite-scope-desc {
      font-size: 11px;
      color: #6b7280;
    }
    .invite-drawer-footer {
      padding: 15px 28px;
      // height: 50px
      border-top: 1px solid #f3f4f6;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      background: #ffffff;
      flex-shrink: 0;
    }
    .btn-hollow-doc {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 5px 16px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      background: #ffffff;
      color: #374151;
      font-size: 13px;
      font-weight: 500;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn-hollow-doc:hover {
      border-color: #111827;
      color: #111827;
      background: #f9fafb;
    }
    .btn-invite-cta {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 5px 25px;
      background: #16a34a;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .btn-invite-cta:hover {
      background: #15803d;
    }
    .btn-invite-cta:disabled {
      background: #9ca3af;
      cursor: not-allowed;
    }
  `;
  document.head.appendChild(style);

  // Create Markup
  const overlay = document.createElement("div");
  overlay.className = "invite-drawer-overlay";
  overlay.id = "invite-drawer-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "invite-drawer-title");

  overlay.innerHTML = `
    <aside class="invite-drawer" id="invite-drawer">
      <div class="invite-drawer-header">
        <div>
          <h3 class="invite-drawer-title" id="invite-drawer-title">Invite a team member</h3>
          <p class="invite-drawer-sub">Collaborate on email schedules, review dispatches, or manage mail connections together.</p>
        </div>
        <button type="button" class="invite-close-btn" id="invite-drawer-close" aria-label="Close invite modal">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="invite-drawer-body">
        <!-- Emails -->
        <div class="invite-field">
          <label class="invite-label" for="invite-emails-input">Member email(s)</label>
          <input type="text" class="invite-input" id="invite-emails-input" placeholder="ada@company.com, tunde@company.com" autocomplete="off" />
          <span class="invite-hint">Separate multiple team emails with commas.</span>
        </div>

        <!-- Role -->
        <div class="invite-field">
          <label class="invite-label" for="invite-role-select">Role & permissions</label>
          <select class="invite-select" id="invite-role-select">
            <option value="Admin">Admin (Full project and settings management)</option>
            <option value="Editor" selected>Editor (Create, edit & dispatch schedules)</option>
            <option value="Viewer">Viewer (Read-only status & report views)</option>
          </select>
        </div>

        <!-- Access Scope -->
        <div class="invite-field">
          <label class="invite-label">Access scope</label>
          <div class="invite-scope-toggle">
            <div class="invite-scope-pill active" id="scope-account" role="button" tabindex="0">
              <span class="invite-scope-title">Account access</span>
              <span class="invite-scope-desc">All current & future projects</span>
            </div>
            <div class="invite-scope-pill" id="scope-project" role="button" tabindex="0">
              <span class="invite-scope-title">Project access</span>
              <span class="invite-scope-desc">Specific project only</span>
            </div>
          </div>
        </div>

        <!-- Project selection (shows when Project access is picked) -->
        <div class="invite-field" id="invite-project-group" style="display: none;">
          <label class="invite-label" for="invite-project-select">Project to invite them to</label>
          <select class="invite-select" id="invite-project-select">
            <option value="">Loading projects...</option>
          </select>
        </div>

        <!-- Personal note -->
        <div class="invite-field">
          <label class="invite-label" for="invite-note-input">Personal note (optional)</label>
          <textarea class="invite-textarea" id="invite-note-input" rows="2" placeholder="Hey! Joining our Bzade workspace to manage our upcoming scheduled campaigns..."></textarea>
        </div>
      </div>

      <div class="invite-drawer-footer">
        <!-- Hollow button to Docs with hashtag ID -->
        <a href="${docsUrl}" target="_blank" class="btn-hollow-doc" id="btn-invite-docs" title="View documentation on team roles & permissions">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
          <span>Docs & Roles</span>
        </a>

        <!-- CTA button -->
        <button type="button" class="btn-invite-cta" id="btn-submit-invite">
          <span>Invite</span>
        </button>
      </div>
    </aside>
  `;

  document.body.appendChild(overlay);

  // References
  const closeBtn = document.getElementById("invite-drawer-close");
  const emailsInput = document.getElementById("invite-emails-input");
  const roleSelect = document.getElementById("invite-role-select");
  const scopeAccount = document.getElementById("scope-account");
  const scopeProject = document.getElementById("scope-project");
  const projectGroup = document.getElementById("invite-project-group");
  const projectSelect = document.getElementById("invite-project-select");
  const noteInput = document.getElementById("invite-note-input");
  const submitBtn = document.getElementById("btn-submit-invite");

  let activeScope = "account";

  // Toggle Access Scope
  scopeAccount.addEventListener("click", () => {
    activeScope = "account";
    scopeAccount.classList.add("active");
    scopeProject.classList.remove("active");
    projectGroup.style.display = "none";
  });

  scopeProject.addEventListener("click", () => {
    activeScope = "project";
    scopeProject.classList.add("active");
    scopeAccount.classList.remove("active");
    projectGroup.style.display = "flex";
  });

  // Load Projects into Select
  async function populateProjects() {
    try {
      const projects = await loadProjects();
      projectSelect.innerHTML = "";
      if (!projects || projects.length === 0) {
        projectSelect.innerHTML = `<option value="">No projects found (using default)</option>`;
        return;
      }
      for (const p of projects) {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.project_name || p.business_name || "Project";
        projectSelect.appendChild(opt);
      }
    } catch (e) {
      projectSelect.innerHTML = `<option value="current">Current Project</option>`;
    }
  }

  // Open & Close Handlers
  function openDrawer() {
    populateProjects();
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    setTimeout(() => emailsInput?.focus(), 150);
  }

  function closeDrawer() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
  }

  closeBtn?.addEventListener("click", closeDrawer);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeDrawer();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("open")) {
      closeDrawer();
    }
  });

  // Connect Invite Buttons
  document.querySelectorAll("#btn-header-invite, [data-action='open-invite']").forEach((btn) => {
    btn.removeAttribute("onclick");
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      openDrawer();
    });
  });

  // Handle Invitation Submit
  submitBtn?.addEventListener("click", () => {
    const rawEmails = emailsInput.value.trim();
    if (!rawEmails) {
      showToast("error", "Enter at least one email address to send an invitation.");
      emailsInput.focus();
      return;
    }

    const emailList = rawEmails.split(",").map(e => e.trim()).filter(Boolean);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalid = emailList.find(e => !emailRegex.test(e));
    if (invalid) {
      showToast("error", `"${invalid}" is not a valid email address.`);
      emailsInput.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending...";

    const role = roleSelect.value;
    const targetDesc = activeScope === "account" ? "entire account" : (projectSelect.selectedOptions[0]?.text || "selected project");

    setTimeout(() => {
      submitBtn.disabled = false;
      submitBtn.textContent = "Invite";
      closeDrawer();
      emailsInput.value = "";
      if (noteInput) noteInput.value = "";

      const msg = emailList.length === 1
        ? `Invitation sent to ${emailList[0]} (${role} · ${targetDesc}).`
        : `Invitations sent to ${emailList.length} members (${role} · ${targetDesc}).`;
      showToast("success", msg);
    }, 450);
  });

  return { open: openDrawer, close: closeDrawer };
}
