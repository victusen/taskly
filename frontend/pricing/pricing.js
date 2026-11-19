import { supabase } from "../scripts/auth/auth.js";
import { initPaymentModal } from "../scripts/payments/paymentModal.js";
import { showToast } from "../scripts/ui/toast.js";

initPaymentModal();

const monthlyButton = document.getElementById("billing-monthly");
const yearlyButton = document.getElementById("billing-yearly");
const pricePaid = document.getElementById("price-paid");
const discountPaid = document.getElementById("discount-paid");
const priceBusiness = document.getElementById("price-business");
const discountBusiness = document.getElementById("discount-business");
const intervalPaid = document.getElementById("interval-paid");
const intervalBusiness = document.getElementById("interval-business");

function setBilling(isYearly) {
  if (!monthlyButton || !yearlyButton) return;
  yearlyButton.classList.toggle("active", isYearly);
  monthlyButton.classList.toggle("active", !isYearly);

  if (pricePaid) pricePaid.textContent = isYearly ? "23.88" : "2.99";
  if (discountPaid) {
    discountPaid.textContent = "(-$12)";
    discountPaid.style.display = isYearly ? "inline" : "none";
  }
  if (intervalPaid) intervalPaid.textContent = isYearly ? "/ year" : "/ month";

  if (priceBusiness) priceBusiness.textContent = isYearly ? "47.88" : "4.99";
  if (discountBusiness) {
    discountBusiness.textContent = "(-$12)";
    discountBusiness.style.display = isYearly ? "inline" : "none";
  }
  if (intervalBusiness) intervalBusiness.textContent = isYearly ? "/ year" : "/ month";
}

monthlyButton?.addEventListener("click", () => setBilling(false));
yearlyButton?.addEventListener("click", () => setBilling(true));

const authModal = document.getElementById("auth-required-modal");

function openAuthModal() {
  if (!authModal) return;
  authModal.style.display = "flex";
  authModal.setAttribute("aria-hidden", "false");
}

function closeAuthModal() {
  if (!authModal) return;
  authModal.style.display = "none";
  authModal.setAttribute("aria-hidden", "true");
}

authModal?.addEventListener("click", (event) => {
  if (event.target === authModal) closeAuthModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && authModal?.style.display === "flex") {
    closeAuthModal();
  }
});

async function getActiveSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data?.session || null;
}

document.querySelectorAll(".pricing-card").forEach((card) => {
  card.addEventListener("click", async (event) => {
    if (event.target.closest("a, button")) return;
    event.preventDefault();
    try {
      const session = await getActiveSession();
      if (session?.access_token) {
        window.location.assign("/dashboard");
      } else {
        openAuthModal();
      }
    } catch (error) {
      console.error("[PRICING] Could not verify the current session:", error);
      showToast("error", "Could not verify your session. Please try again.");
    }
  });
});

document.addEventListener("click", async (event) => {
  const link = event.target.closest(
    'a[href*="/dashboard"], a[href*="/schedules"], a[href*="/account/billing"], a[href*="/smtp"]',
  );
  if (!link) return;

  event.preventDefault();
  try {
    const session = await getActiveSession();
    if (session?.access_token) {
      window.location.assign(link.href);
    } else {
      openAuthModal();
    }
  } catch (error) {
    console.error("[PRICING] Could not verify the current session:", error);
    showToast("error", "Could not verify your session. Please try again.");
  }
});

const mobileToggle = document.getElementById("mobile-nav-toggle");
const mobileDrawer = document.getElementById("mobile-nav-drawer");
const closeDrawer = document.getElementById("close-mobile-drawer");

mobileToggle?.addEventListener("click", () => {
  if (mobileDrawer) mobileDrawer.style.display = "flex";
});
closeDrawer?.addEventListener("click", () => {
  if (mobileDrawer) mobileDrawer.style.display = "none";
});
