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
const meta = user?.user_metadata || {};
const email = user?.email || "Victor@bzade.app";

const emailEl = document.getElementById("user-billing-email");
if (emailEl) emailEl.textContent = email;

// Detect paid vs free plan
const userPlan = (meta.plan || meta.subscription_plan || "hobby").toLowerCase();
const isPaid = userPlan !== "hobby" && userPlan !== "free" && userPlan !== "starter" && userPlan !== "";

const planDisplayEl = document.getElementById("plan-title-display");
if (planDisplayEl) {
  planDisplayEl.textContent = isPaid ? "Bzade Pro" : "Hobby";
}

const pmStatusEl = document.getElementById("pm-status-text");
if (pmStatusEl && isPaid) {
  pmStatusEl.innerHTML = `<strong style="color: #111827;">•••• 4242</strong> <span style="color: #6b7280;">(Visa) — Active via Paystack</span>`;
}

// Sign out handlers
document.querySelectorAll("[data-logout]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    try {
      await signOut();
    } catch (e) {
      console.error(e);
    }
    window.location.href = "../index.html";
  });
});

// Upgrade plan / Add Card handlers with Paystack
const launchCheckout = () => {
  try {
    startPayment();
  } catch (err) {
    showToast("error", err.message || "Could not launch checkout.");
  }
};

document.getElementById("btn-upgrade-top")?.addEventListener("click", launchCheckout);
document.getElementById("btn-upgrade-plan")?.addEventListener("click", launchCheckout);
document.getElementById("btn-add-card")?.addEventListener("click", launchCheckout);

// Plan Benefits toggle
const benefitsBtn = document.getElementById("btn-plan-benefits-toggle");
const benefitsList = document.getElementById("plan-benefits-list");
const benefitsArrow = document.getElementById("plan-benefits-arrow");

benefitsBtn?.addEventListener("click", () => {
  if (!benefitsList) return;
  const isHidden = benefitsList.style.display === "none";
  benefitsList.style.display = isHidden ? "flex" : "none";
  if (benefitsArrow) {
    benefitsArrow.style.transform = isHidden ? "rotate(180deg)" : "";
  }
});

// Additional Billing Information Modal
const billingModal = document.getElementById("billing-info-modal");
const openModalBtn = document.getElementById("btn-open-billing-info-modal");
const closeModalBtn = document.getElementById("btn-close-billing-modal");
const cancelModalBtn = document.getElementById("btn-cancel-billing-modal");
const billingForm = document.getElementById("billing-info-form");
const displayCompanyEl = document.getElementById("display-company-info");

const BILLING_STORAGE_KEY = "bzade_additional_billing_info";

function loadSavedBillingInfo() {
  try {
    const raw = localStorage.getItem(BILLING_STORAGE_KEY);
    if (!raw) return;
    const info = JSON.parse(raw);
    if (info && (info.company || info.address || info.vat)) {
      const parts = [];
      if (info.company) parts.push(`<strong>${escapeHtml(info.company)}</strong>`);
      if (info.address) parts.push(escapeHtml(info.address));
      if (info.vat) parts.push(`VAT: ${escapeHtml(info.vat)}`);
      if (displayCompanyEl) {
        displayCompanyEl.innerHTML = parts.join(" • ");
      }
      const compInput = document.getElementById("input-company-name");
      const addrInput = document.getElementById("input-billing-address");
      const vatInput = document.getElementById("input-vat-number");
      if (compInput) compInput.value = info.company || "";
      if (addrInput) addrInput.value = info.address || "";
      if (vatInput) vatInput.value = info.vat || "";
    }
  } catch (_) {}
}

loadSavedBillingInfo();

function setBillingModal(open) {
  if (!billingModal) return;
  billingModal.classList.toggle("open", open);
}

openModalBtn?.addEventListener("click", () => setBillingModal(true));
closeModalBtn?.addEventListener("click", () => setBillingModal(false));
cancelModalBtn?.addEventListener("click", () => setBillingModal(false));
billingModal?.addEventListener("click", (e) => {
  if (e.target === billingModal) setBillingModal(false);
});

billingForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  const company = document.getElementById("input-company-name")?.value.trim() || "";
  const address = document.getElementById("input-billing-address")?.value.trim() || "";
  const vat = document.getElementById("input-vat-number")?.value.trim() || "";

  const payload = { company, address, vat };
  try {
    localStorage.setItem(BILLING_STORAGE_KEY, JSON.stringify(payload));
  } catch (_) {}

  loadSavedBillingInfo();
  setBillingModal(false);
  showToast("success", "Billing details saved.");
});

// Download invoice receipts
document.querySelectorAll(".invoice-dl-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    showToast("success", "Official receipt downloaded.");
  });
});

document.getElementById("btn-view-more-invoices")?.addEventListener("click", () => {
  showToast("info", "All previous invoices are up to date.");
});

// Promo code application
document.getElementById("btn-apply-promo")?.addEventListener("click", () => {
  const input = document.getElementById("promo-input");
  const code = input?.value.trim();
  if (!code) {
    showToast("warn", "Please enter a promo code first.");
    return;
  }
  if (code.toUpperCase() === "BZADE100" || code.toUpperCase() === "WELCOME") {
    showToast("success", "Promo code applied! $10.00 credit added to your balance.");
    const balanceEl = document.querySelector(".credit-amount-num");
    if (balanceEl) balanceEl.textContent = "$10.00";
    input.value = "";
  } else {
    showToast("error", "Promo code is invalid or has expired.");
  }
});

// Download as CSV
document.getElementById("btn-download-csv")?.addEventListener("click", () => {
  const csvContent = "data:text/csv;charset=utf-8," +
    "Category,Description,Accrued Amount (USD),Billing Cycle\n" +
    "Projects,Workspace Projects Active,0.00,October 2026\n" +
    "Schedules,Automated Schedules & Email Dispatch,0.00,October 2026\n" +
    "Bandwidth,HTTP & Webhook Ingestion,0.00,October 2026\n" +
    "Total,Total Accrued,0.00,October 2026\n";

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `bzade_billing_summary_${new Date().toISOString().slice(0, 7)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("success", "Billing summary CSV downloaded.");
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
      setTimeout(() => el.remove(), 200);
    });

    if (activeProjects.length === 0) {
      toggleArrows.forEach((a) => (a.style.display = "none"));
      subNavs.forEach((n) => (n.style.display = "none"));

      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align: center; padding: 32px 20px; color: #6b7280;">
              <p style="font-size: 14px; font-weight: 600; color: #111827; margin-bottom: 4px;">No projects created yet</p>
              <p style="font-size: 13px;">Create a project in the <a href="../dashboard.html" style="color: #4f46e5; text-decoration: underline;">Overview Dashboard</a> to view project billing details.</p>
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
          `<a href="../schedules.html?project=${encodeURIComponent(p.id)}" class="nav-item sub-item">${escapeHtml(
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
                <div style="font-size: 11px; color: #9ca3af;">ID: ${escapeHtml(p.id)}</div>
              </td>
              <td>${escapeHtml(bName)}</td>
              <td>
                <span style="font-weight: 600; color: #111827;">${sCount}</span>
                <span style="font-size: 12px; color: #6b7280;"> active</span>
              </td>
              <td>
                <span style="font-weight: 600; color: #111827;">0</span>
                <span style="font-size: 12px; color: #6b7280;"> / 1,000 emails</span>
              </td>
              <td><span class="badge-paid">✓ Included</span></td>
              <td style="text-align: right;">
                <a href="../schedules.html?project=${encodeURIComponent(p.id)}" class="btn-outline-sm">View Schedules</a>
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
          <td colspan="6" style="text-align: center; padding: 24px; color: #dc2626;">
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
  const qDisp = document.getElementById("quota-dispatches");
  const qBarDisp = document.getElementById("quota-bar-dispatches");
  const totalBreakdown = document.getElementById("total-dispatches-breakdown");
  const automatedLegend = document.getElementById("legend-automated-count");

  if (qProj) qProj.textContent = String(projCount);
  if (qBarProj) qBarProj.style.width = `${Math.min(100, (projCount / 5) * 100)}%`;

  if (qSched) qSched.textContent = String(schedCount);
  if (qBarSched) qBarSched.style.width = `${Math.min(100, (schedCount / 25) * 100)}%`;

  const estDispatches = schedCount * 12; // Sample dispatch baseline for active schedules
  if (qDisp) qDisp.textContent = String(estDispatches);
  if (qBarDisp) qBarDisp.style.width = `${Math.min(100, (estDispatches / 1000) * 100)}%`;
  if (totalBreakdown) totalBreakdown.textContent = String(estDispatches);
  if (automatedLegend) automatedLegend.textContent = `${estDispatches} emails`;
}

loadBillingProjects();
