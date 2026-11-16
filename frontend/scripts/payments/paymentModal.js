import { startPayment } from "./payment.js";
import { showToast } from "../ui/toast.js";

const PLANS = [
  { key: "paid_monthly", name: "Paid Monthly", amount: 2999, period: "monthly" },
  { key: "business_monthly", name: "Business Monthly", amount: 4999, period: "monthly" },
  { key: "paid_yearly", name: "Paid Yearly", amount: 29999, period: "yearly" },
  { key: "business_yearly", name: "Business Yearly", amount: 49999, period: "yearly" },
];

let modalController = null;

function addPaymentModalStyles() {
  if (document.getElementById("shared-payment-modal-styles")) return;
  const style = document.createElement("style");
  style.id = "shared-payment-modal-styles";
  style.textContent = `
    .payment-modal-backdrop{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:4000;opacity:0;transition:opacity .25s ease}
    .payment-modal-backdrop.open{display:block;opacity:1}
    .payment-modal-box{position:absolute;top:0;right:0;bottom:0;width:480px;max-width:90vw;background:#fff;box-shadow:-8px 0 30px rgba(0,0,0,.15);display:flex;flex-direction:column;transform:translateX(100%);transition:transform .3s cubic-bezier(.16,1,.3,1)}
    .payment-modal-backdrop.open .payment-modal-box{transform:translateX(0)}
    .payment-modal-header{padding:24px 28px 12px;border-bottom:1px solid #f3f4f6;display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
    .payment-modal-title{font-size:20px;font-weight:700;color:#111827;margin:0}
    .payment-close-btn{background:transparent;border:0;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#4b5563;flex-shrink:0}
    .payment-close-btn:hover{background:#f3f4f6;color:#111827}
    .payment-modal-body{padding:24px 28px;flex:1;overflow-y:auto}
    .payment-modal-note{margin:0 0 16px;color:#6b7280;font-size:13px;line-height:1.5}
    .plan-options{margin-bottom:24px}
    .plan-option{width:100%;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:16px;text-align:left;font:inherit;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;cursor:pointer;transition:all .15s ease;margin-bottom:8px}
    .plan-option:hover{border-color:#d1d5db;background:#f3f4f6}
    .plan-option.selected{border-color:#16a34a;background:#f0fdf4}
    .plan-option-copy{min-width:0}
    .plan-option .plan-name{font-size:16px;font-weight:600;color:#111827;margin-bottom:4px}
    .plan-option .plan-desc{font-size:12px;color:#6b7280}
    .plan-option .plan-price{flex:0 0 auto;font-size:18px;font-weight:700;color:#059669;text-align:right}
    .payment-details{margin-top:24px}
    .plan-type{font-size:14px;font-weight:500;color:#374151;margin-bottom:8px}
    .pricing-info{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
    .pricing-info .price{font-size:32px;font-weight:700;color:#111827}
    .pricing-info .currency,.pricing-info .period{font-size:13px;color:#6b7280}
    .billing-cycle,.end-date{margin-top:16px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280}
    .end-date{margin-top:12px;padding-top:12px;line-height:1.5}
    .payment-modal-footer{padding:16px 28px;border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end;gap:12px}
    .payment-cancel-btn,.payment-submit-btn{padding:8px 24px;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer}
    .payment-cancel-btn{border:1px solid #d1d5db;background:#fff;color:#374151}
    .payment-cancel-btn:hover{border-color:#9ca3af;color:#6b7280}
    .payment-submit-btn{border:0;background:#16a34a;color:#fff;font-weight:600}
    .payment-submit-btn:hover{background:#15803d}
    .payment-submit-btn:disabled{opacity:.6;cursor:wait}
    @media(max-width:520px){.payment-modal-box{max-width:100vw}.payment-modal-header,.payment-modal-body{padding-left:20px;padding-right:20px}.payment-modal-footer{padding-left:20px;padding-right:20px}}
  `;
  document.head.append(style);
}

function createPaymentModal() {
  const modal = document.createElement("div");
  modal.className = "payment-modal-backdrop";
  modal.id = "payment-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "payment-modal-title");
  modal.innerHTML = `
    <div class="payment-modal-box">
      <div class="payment-modal-header">
        <h3 class="payment-modal-title" id="payment-modal-title">Select Payment Plan</h3>
        <button type="button" class="payment-close-btn" id="payment-modal-close" aria-label="Close payment plans">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      <div class="payment-modal-body">
        <p class="payment-modal-note">Choose a plan, then pay securely with Paystack and select an available payment method.</p>
        <div class="plan-options" id="plan-options"></div>
        <div class="payment-details" id="payment-details" hidden>
          <div class="plan-type" id="plan-type"></div>
          <div class="pricing-info" id="pricing-info"></div>
          <div class="billing-cycle">Billing cycle: <span id="billing-cycle-text"></span></div>
          <div class="end-date" id="end-date" hidden>If paid today, this plan will renew on <span id="end-date-text"></span>.</div>
        </div>
      </div>
      <div class="payment-modal-footer">
        <button type="button" class="payment-cancel-btn" id="payment-cancel">Cancel</button>
        <button type="button" class="payment-submit-btn" id="payment-subscribe" disabled>Pay</button>
      </div>
    </div>
  `;
  document.body.append(modal);
  return modal;
}

export function initPaymentModal() {
  if (modalController) return modalController;
  addPaymentModalStyles();

  const modal = document.getElementById("payment-modal") || createPaymentModal();
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "payment-modal-title");
  const title = modal.querySelector(".payment-modal-title") || modal.querySelector(".payment-modal-header h3");
  if (title && !title.id) title.id = "payment-modal-title";
  if (!modal.querySelector(".payment-modal-note")) {
    const note = document.createElement("p");
    note.className = "payment-modal-note";
    note.textContent = "Choose a plan, then pay securely with Paystack and select an available payment method.";
    modal.querySelector(".payment-modal-body")?.prepend(note);
  }
  const options = modal.querySelector("#plan-options");
  const details = modal.querySelector("#payment-details");
  const planType = modal.querySelector("#plan-type");
  const pricingInfo = modal.querySelector("#pricing-info");
  const cycleText = modal.querySelector("#billing-cycle-text");
  const endDate = modal.querySelector("#end-date");
  const endDateText = modal.querySelector("#end-date-text");
  const submitButton = modal.querySelector("#payment-subscribe");
  submitButton.textContent = "Pay";
  let selectedPlan = null;
  let previousOverflow = "";

  function selectPlan(plan, card) {
    selectedPlan = plan;
    options.querySelectorAll(".plan-option").forEach((option) => {
      const selected = option === card;
      option.classList.toggle("selected", selected);
      option.setAttribute("aria-pressed", String(selected));
    });
    planType.textContent = plan.name;
    pricingInfo.innerHTML = `
      <div class="price"></div>
      <div class="currency">NGN</div>
      <div class="period"></div>
    `;
    pricingInfo.querySelector(".price").textContent = `₦${plan.amount.toLocaleString("en-NG")}`;
    pricingInfo.querySelector(".period").textContent = plan.period;
    cycleText.textContent = plan.period === "monthly" ? "Monthly" : "Yearly";

    const renewsAt = new Date();
    if (plan.period === "monthly") renewsAt.setMonth(renewsAt.getMonth() + 1);
    else renewsAt.setFullYear(renewsAt.getFullYear() + 1);
    const dateParts = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).formatToParts(renewsAt);
    endDateText.replaceChildren();
    for (const part of dateParts) {
      if (part.type === "literal") {
        endDateText.append(document.createTextNode(part.value));
      } else if (
        (plan.period === "monthly" && ["month", "day"].includes(part.type)) ||
        (plan.period === "yearly" && part.type === "year")
      ) {
        const emphasized = document.createElement("strong");
        emphasized.textContent = part.value;
        endDateText.append(emphasized);
      } else {
        endDateText.append(document.createTextNode(part.value));
      }
    }

    details.hidden = false;
    details.style.display = "block";
    endDate.hidden = false;
    endDate.style.display = "block";
    submitButton.disabled = false;
  }

  function renderPlans() {
    options.replaceChildren();
    details.hidden = true;
    details.style.display = "none";
    endDate.hidden = true;
    endDate.style.display = "none";
    submitButton.disabled = true;
    selectedPlan = null;

    PLANS.forEach((plan) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "plan-option";
      card.setAttribute("aria-pressed", "false");
      card.innerHTML = `
        <div class="plan-option-copy">
          <div class="plan-name"></div>
          <div class="plan-desc"></div>
        </div>
        <div class="plan-price"></div>
      `;
      card.querySelector(".plan-name").textContent = plan.name;
      card.querySelector(".plan-desc").textContent = plan.period === "monthly" ? "Billed monthly" : "Billed yearly";
      card.querySelector(".plan-price").textContent = `₦${plan.amount.toLocaleString("en-NG")} / ${plan.period === "monthly" ? "month" : "year"}`;
      card.addEventListener("click", () => selectPlan(plan, card));
      options.append(card);
    });
  }

  function open(initialPlanKey) {
    if (!modal.classList.contains("open")) {
      previousOverflow = document.body.style.overflow;
    }
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
    renderPlans();
    if (initialPlanKey) {
      const index = PLANS.findIndex((plan) => plan.key === initialPlanKey);
      if (index >= 0) selectPlan(PLANS[index], options.children[index]);
    }
    modal.querySelector("#payment-modal-close")?.focus();
  }

  function close() {
    modal.classList.remove("open");
    document.body.style.overflow = previousOverflow;
  }

  modal.querySelector("#payment-modal-close")?.addEventListener("click", close);
  modal.querySelector("#payment-cancel")?.addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("open")) close();
  });
  submitButton.addEventListener("click", async () => {
    if (!selectedPlan) {
      showToast("warning", "Select a plan to continue.");
      return;
    }
    submitButton.disabled = true;
    submitButton.textContent = "Preparing...";
    try {
      if (await startPayment(selectedPlan.key)) close();
    } finally {
      submitButton.textContent = "Pay";
      submitButton.disabled = !selectedPlan;
    }
  });

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-upgrade], [data-open-payment], [data-paystack-btn], #btn-upgrade-top, #btn-upgrade-plan, #btn-add-card");
    if (!trigger) return;
    event.preventDefault();
    const billingPeriod = document.getElementById("billing-yearly")?.classList.contains("active")
      ? "yearly"
      : "monthly";
    const planKey = trigger.dataset.planKey ||
      (trigger.dataset.planTier ? `${trigger.dataset.planTier}_${billingPeriod}` : null);
    open(planKey);
  });

  modalController = { open, close };
  window.openPaymentModal = open;
  return modalController;
}
