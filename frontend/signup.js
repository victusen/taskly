import { signUp, signInWithGoogle, signInWithFacebook } from "./scripts/auth/auth.js";

const form = document.getElementById("signup-form");

document.getElementById("google").addEventListener("click", () => signInWithGoogle().catch((e) => alert(e.message)));
document.getElementById("facebook").addEventListener("click", () => signInWithFacebook().catch((e) => alert(e.message)));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const result = await signUp(
      document.getElementById("email").value.trim(),
      document.getElementById("password").value,
      document.getElementById("first").value.trim(),
      document.getElementById("last").value.trim()
    );
    if (result.session) {
      window.location.href = "dashboard.html";
    } else {
      alert("Check your email to confirm your account.");
    }
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
  }
});