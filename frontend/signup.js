import { signUp, signInWithGoogle, signInWithFacebook } from "./scripts/auth/auth.js";
import { showToast } from "./scripts/ui/toast.js";

const form = document.getElementById("signup-form");

document.getElementById("google")?.addEventListener("click", () => signInWithGoogle().catch((e) => showToast("error", e.message || "Google sign-in failed.")));
document.getElementById("facebook")?.addEventListener("click", () => signInWithFacebook().catch((e) => showToast("error", e.message || "Facebook sign-in failed.")));

// Password visibility eye toggle
document.querySelectorAll('.eye-toggle').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const targetId = btn.getAttribute('data-target');
    const input = document.getElementById(targetId);
    if (!input) return;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    const eyeShow = btn.querySelector('.eye-show');
    const eyeHide = btn.querySelector('.eye-hide');
    if (eyeShow && eyeHide) {
      eyeShow.style.display = isPassword ? 'none' : 'block';
      eyeHide.style.display = isPassword ? 'block' : 'none';
    }
  });
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const businessName = document.getElementById("business")?.value.trim() || "";
    if (businessName) {
      try {
        localStorage.setItem("bzade_user_business", businessName);
      } catch (_) {}
    }
    const result = await signUp(
      document.getElementById("email").value.trim(),
      document.getElementById("password").value,
      document.getElementById("first").value.trim(),
      document.getElementById("last").value.trim()
    );
    if (result.session) {
      showToast("success", "Account created successfully! Redirecting...");
      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 400);
    } else {
      showToast("info", "Check your email to confirm your account.");
    }
  } catch (error) {
    showToast("error", error.message || "Could not create account.");
  } finally {
    button.disabled = false;
  }
});