import { showToast } from "./toast.js";
import { loadProjects } from "../data/source.js";
import { createInvitations } from "../api/invitations.js";

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

  const docsUrl = "/documentation#team";

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
      width: min(560px, 100vw);
      max-width: 100vw;
      background: #ffffff;
      border-left: 1px solid #e5e7eb;
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
      padding: 22px 24px 18px;
      border-bottom: 1px solid #f3f4f6;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-shrink: 0;
    }
    .invite-drawer-title {
      font-size: 21px;
      font-weight: 700;
      color: #111827;
      margin: 0;
      line-height: 1.3;
    }
    @media (max-width: 640px) {
      .invite-drawer-title {
        font-size: 20px;
      }
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
      padding: 22px 24px;
      overflow-y: auto;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .invite-field {
      display: flex;
      flex-direction: column;
      gap: 7px;
      min-width: 0;
    }
    .invite-field-row { display: flex; align-items: center; gap: 14px; min-width: 0; }
    .invite-field[hidden] { display: none; }
    .invite-label {
      flex: 0 0 35%;
      font-size: 13px;
      font-weight: 600;
      color: #4b5563;
    }
    .invite-hint {
      padding-left: calc(35% + 14px);
      font-size: 12px;
      color: #9ca3af;
    }
    .invite-input, .invite-select, .invite-textarea {
      flex: 1 1 0;
      width: 0;
      min-width: 0;
      padding: 10px 14px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
      color: #111827;
      background: #ffffff;
      font-family: inherit;
      font-weight: 400;
      box-sizing: border-box;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .invite-textarea { min-height: 120px; resize: vertical; }
    .invite-hint { line-height: 1.4; }
    .invite-input::placeholder, .invite-textarea::placeholder {
      font-weight: 300 !important;
      font-family: inherit;
      color: #c4c8d0;
      opacity: 1;
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
      padding: 15px 24px;
      border-top: 1px solid #e5e7eb;
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
      padding: 5px 11px;
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
      padding: 5px 16px;
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
    @media (max-width: 480px) {
      .invite-drawer-header, .invite-drawer-body { padding-left: 18px; padding-right: 18px; }
      .invite-drawer-footer { padding-left: 18px; padding-right: 18px; }
      .invite-field-row { gap: 10px; }
      .invite-hint { padding-left: calc(35% + 10px); }
      .invite-label { font-size: 12px; }
      .invite-input, .invite-select, .invite-textarea { padding-left: 10px; padding-right: 10px; }
      .btn-hollow-doc { padding-left: 10px; padding-right: 10px; }
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
          <h3 class="invite-drawer-title" id="invite-drawer-title">Invite a Team Member</h3>
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
          <div class="invite-field-row">
            <label class="invite-label" for="invite-emails-input">Member email(s)</label>
            <input type="text" class="invite-input" id="invite-emails-input" placeholder="ada@company.com, tunde@company.com" autocomplete="off" />
          </div>
          <span class="invite-hint">Separate multiple team emails with commas.</span>
        </div>

        <!-- Role -->
        <div class="invite-field">
          <div class="invite-field-row">
            <label class="invite-label" for="invite-role-select">Role & permissions</label>
            <select class="invite-select" id="invite-role-select">
              <option value="owner">Owner</option>
              <option value="admin">Admin (Full project and settings management)</option>
              <option value="editor" selected>Editor (Create, edit & dispatch schedules)</option>
              <option value="viewer">Viewer (Read-only status & report views)</option>
            </select>
          </div>
        </div>

        <!-- Access Scope -->
        <div class="invite-field">
          <div class="invite-field-row">
            <label class="invite-label" for="scope-select">Access scope</label>
            <select class="invite-select" id="scope-select">
              <option value="account">Account level [All current & future projects]</option>
              <option value="project" selected>Project level [Specific project only]</option>
            </select>
          </div>
        </div>

        <!-- Project selection (shows when Project access is picked) -->
        <div class="invite-field" id="invite-project-group">
          <div class="invite-field-row">
            <label class="invite-label" for="invite-project-select">Project to invite them to</label>
            <select class="invite-select" id="invite-project-select">
              <option value="">Loading projects...</option>
            </select>
          </div>
        </div>

        <!-- Personal note -->
        <div class="invite-field">
          <div class="invite-field-row">
            <label class="invite-label" for="invite-note-input">Personal note (optional)</label>
            <textarea class="invite-textarea" id="invite-note-input" rows="4" maxlength="500" placeholder="Hey! Joining our Bzade workspace to manage our upcoming scheduled campaigns..."></textarea>
          </div>
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
  const closeBtn = overlay.querySelector("#invite-drawer-close");
  const emailsInput = overlay.querySelector("#invite-emails-input");
  const roleSelect = overlay.querySelector("#invite-role-select");
  const scopeSelect = overlay.querySelector("#scope-select");
  const projectGroup = overlay.querySelector("#invite-project-group");
  const projectSelect = overlay.querySelector("#invite-project-select");
  const noteInput = overlay.querySelector("#invite-note-input");
  const submitBtn = overlay.querySelector("#btn-submit-invite");
  let projectLoadPromise = null;

  if (!scopeSelect) {
    console.error("Invite modal is missing its access-scope selector.");
  }

  let activeScope = scopeSelect?.value || "project";
  const updateScope = () => {
    activeScope = scopeSelect?.value || "project";
    if (projectGroup) projectGroup.hidden = activeScope === "account";
  };
  scopeSelect?.addEventListener("change", () => {
    updateScope();
    if (activeScope === "project") void populateProjects();
  });
  updateScope();

  // Load Projects into Select
  async function populateProjects() {
    if (projectLoadPromise) return projectLoadPromise;

    projectLoadPromise = (async () => {
      try {
        const projects = await loadProjects();
        projectSelect.replaceChildren(new Option("Choose a project...", ""));
        if (!projects || projects.length === 0) {
          projectSelect.replaceChildren(new Option("No projects available", ""));
          return;
        }
        for (const p of projects) {
          const opt = document.createElement("option");
          opt.value = p.id;
          opt.textContent = p.project_name || p.business_name || "Project";
          projectSelect.appendChild(opt);
        }
      } catch (e) {
        projectSelect.replaceChildren(new Option("Could not load projects", ""));
        showToast("error", e.message || "Could not load projects for the invitation.");
      }
    })();

    try {
      await projectLoadPromise;
    } finally {
      projectLoadPromise = null;
    }
  }

  // Open & Close Handlers
  function openDrawer() {
    if (activeScope === "project") void populateProjects();
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    if (!window.matchMedia("(max-width: 767px)").matches) {
      setTimeout(() => emailsInput?.focus(), 150);
    }
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
  submitBtn?.addEventListener("click", async () => {
    const rawEmails = emailsInput.value.trim();
    if (!rawEmails) {
      showToast("error", "Enter at least one email address to send an invitation.");
      emailsInput.focus();
      return;
    }

    const emailList = rawEmails.split(",").map((email) => email.trim()).filter(Boolean);
    if (emailList.length > 10) {
      showToast("error", "Invite no more than 10 people at a time.");
      emailsInput.focus();
      return;
    }
    const normalizedEmails = emailList.map((email) => email.toLowerCase());
    const invalid = normalizedEmails.find((email) => !/^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(email));
    if (invalid) {
      showToast("error", `"${invalid}" is not a valid email address.`);
      emailsInput.focus();
      return;
    }
    if (new Set(normalizedEmails).size !== normalizedEmails.length) {
      showToast("error", "Remove duplicate email addresses.");
      emailsInput.focus();
      return;
    }
    if (activeScope === "project" && !projectSelect.value) {
      showToast("error", "Choose a project for this invitation.");
      projectSelect.focus();
      return;
    }
    const personalNote = noteInput?.value.trim() || null;
    if (personalNote && Array.from(personalNote).length > 500) {
      showToast("error", "The personal note must be 500 characters or fewer.");
      noteInput.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending...";

    try {
      const response = await createInvitations({
        emails: normalizedEmails,
        role: roleSelect.value,
        scope: activeScope,
        project_id: activeScope === "project" ? projectSelect.value : null,
        personal_note: personalNote,
      });
      if (!Number.isInteger(response.data?.created) || response.data.created !== normalizedEmails.length) {
        throw new Error("The invitation service returned an unexpected response.");
      }
      closeDrawer();
      emailsInput.value = "";
      if (noteInput) noteInput.value = "";
      showToast("info", "Invites saved, but team access is not wired up yet. You can manage schedules personally for now.");
    } catch (error) {
      showToast("error", error.message || "Could not save the invitations.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Invite";
    }
  });

  return { open: openDrawer, close: closeDrawer };
}
