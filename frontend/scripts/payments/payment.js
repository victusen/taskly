import { supabase } from "../auth/auth.js";
import { loading, updateToast } from "../ui/toast.js";

const PLAN_KEYS = new Set([
  "paid_monthly",
  "paid_yearly",
  "business_monthly",
  "business_yearly",
]);

export async function startPayment(planKey = "paid_monthly") {
  const toastId = loading("Preparing secure checkout...", {
    title: "Preparing payment",
  });

  try {
    if (!PLAN_KEYS.has(planKey)) {
      throw new Error("Choose a valid subscription plan.");
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error("No active session. Please sign in again.");
    }

    const response = await fetch(
      `${supabase.supabaseUrl}/functions/v1/initialize-payment`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ plan_key: planKey }),
      },
    );

    const result = await response.json();
    if (!response.ok) {
      throw new Error(
        result.error || result.message || "Failed to initialize payment",
      );
    }

    const authorizationUrl =
      result.payment?.authorization_url ||
      result.authorization_url ||
      result.data?.payment?.authorization_url ||
      result.data?.authorization_url;
    if (!authorizationUrl) {
      throw new Error(
        "Payment initialization did not return an authorization URL.",
      );
    }

    const checkoutUrl = new URL(authorizationUrl);
    if (
      checkoutUrl.protocol !== "https:" ||
      checkoutUrl.hostname !== "checkout.paystack.com"
    ) {
      throw new Error("Payment initialization returned an invalid checkout URL.");
    }

    updateToast(toastId, "info", "Checkout is ready.", {
      title: "Opening Paystack",
    });
    window.location.assign(checkoutUrl.href);
  } catch (error) {
    console.error("[PAYSTACK]", error);
    updateToast(
      toastId,
      "error",
      error.message || "Unable to start payment.",
      { title: "Payment unavailable" },
    );
  }
}
