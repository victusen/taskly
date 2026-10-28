import { requireAuth, resolveUserInitial, applyUserAvatar } from "../scripts/auth/session.js";
import { signOut } from "../scripts/auth/auth.js";
import { startPayment } from "../scripts/payments/payment.js";
import { showToast } from "../scripts/ui/toast.js";
import { loadProjects } from "../scripts/data/source.js";
import { initInviteModal } from "../scripts/ui/inviteModal.js";

// Clean any leftover tokens / hash from browser address bar
if (window.location.hash || window.location.search.includes("code=") || window.location.search.includes("access_token")) {
  window.history.replaceState({}, document.title, window.location.pathname);
}

const session = await requireAuth();
if (!session) throw new Error("Authentication required.");

const initial = resolveUserInitial(session);
applyUserAvatar(initial);

initInviteModal();

const user = session.user;
const email = user?.email || "Victor@bzade.app";

const emailEl = document.getElementById("user-billing-email");
if (emailEl) emailEl.textContent = email;

// Sign out handlers
document.querySelectorAll("[data-logout]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    try {
      await signOut();
    } catch (e) {
      console.error(e);
    }
    window.location.href = "index.html";
  });
});

// Upgrade plan handlers with Paystack
const upgradePlan = () => {
  try {
    startPayment();
  } catch (err) {
    showToast("error", err.message || "Could not launch checkout.");
  }
};

document.getElementById("btn-upgrade-top")?.addEventListener("click", upgradePlan);
document.getElementById("btn-upgrade-plan")?.addEventListener("click", upgradePlan);

document.getElementById("btn-update-card")?.addEventListener("click", () => {
  showToast("info", "To update your billing card, complete your subscription upgrade or checkout via Paystack.");
});

document.querySelectorAll(".invoice-dl-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    showToast("success", "Receipt statement downloaded.");
  });
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

async function loadBillingProjects() {
  const tbody = document.getElementById("projects-billing-tbody");
  const subNavs = document.querySelectorAll("[data-sub-nav]");
  const toggleArrows = document.querySelectorAll(".projects-toggle-icon");
  const skeletonEl = document.querySelectorAll("#subnav-skeleton");

  try {
    const projects = await loadProjects();
    const activeProjects = Array.isArray(projects) ? projects : [];

    // Clear skeleton
    skeletonEl.forEach((el) => {
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 250);
    });

    if (activeProjects.length === 0) {
      toggleArrows.forEach((a) => (a.style.display = "none"));
      subNavs.forEach((n) => (n.style.display = "none"));

      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align: center; padding: 40px 20px; color: #6b7280;">
              <p style="font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 4px;">No projects created yet</p>
              <p style="font-size: 13px;">Create a project in the <a href="dashboard.html" style="color: green; text-decoration: underline;">Overview Dashboard</a> to view billing details.</p>
            </td>
          </tr>
        `;
      }

      updateQuotas(0, 0);
      return;
    }

    toggleArrows.forEach((a) => (a.style.display = ""));

    // Populate Sidebar
    const sidebarHtml = activeProjects
      .map(
        (p) =>
          `<a href="schedules.html?project=${encodeURIComponent(p.id)}" class="nav-item sub-item">${escapeHtml(
            p.project_name || p.business_name || "Untitled Project"
          )}</a>`
      )
      .join("");

    subNavs.forEach((nav) => {
      nav.innerHTML = sidebarHtml;
      nav.style.display = "";
      nav.style.opacity = "1";
    });

    // Populate Billing Table
    let totalSchedules = 0;
    if (tbody) {
      tbody.innerHTML = activeProjects
        .map((p) => {
          const sCount = p.schedule_count ?? 0;
          totalSchedules += sCount;
          const pName = p.project_name || p.business_name || "Untitled Project";
          const bName = p.business_name || "Default Business";

          return `
            <tr>
              <td>
                <div style="font-weight: 600; color: #111827;">${escapeHtml(pName)}</div>
                <div style="font-size: 12px; color: #9ca3af;">ID: ${escapeHtml(p.id)}</div>
              </td>
              <td>${escapeHtml(bName)}</td>
              <td>
                <span style="font-weight: 600; color: #111827;">${sCount}</span>
                <span style="font-size: 12px; color: #6b7280;"> active</span>
              </td>
              <td>
                <span style="font-weight: 600; color: #111827;">0</span>
                <span style="font-size: 12px; color: #6b7280;"> / 500 emails</span>
              </td>
              <td><span class="badge-status">Included</span></td>
              <td style="text-align: right;">
                <a href="schedules.html?project=${encodeURIComponent(p.id)}" class="btn-outline" style="text-decoration: none;">View Schedules</a>
              </td>
            </tr>
          `;
        })
        .join("");
    }

    updateQuotas(activeProjects.length, totalSchedules);
  } catch (err) {
    console.error(err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 30px; color: #dc2626;">
            Failed to load projects billing data.
          </td>
        </tr>
      `;
    }
  }
}

function updateQuotas(projCount, schedCount) {
  const qProj = document.getElementById("quota-projects");
  const qBarProj = document.getElementById("quota-bar-projects");
  const qSched = document.getElementById("quota-schedules");
  const qBarSched = document.getElementById("quota-bar-schedules");

  if (qProj) qProj.textContent = `${projCount} / 5`;
  if (qBarProj) qBarProj.style.width = `${Math.min(100, (projCount / 5) * 100)}%`;

  if (qSched) qSched.textContent = `${schedCount} / 25`;
  if (qBarSched) qBarSched.style.width = `${Math.min(100, (schedCount / 25) * 100)}%`;
}

loadBillingProjects();
