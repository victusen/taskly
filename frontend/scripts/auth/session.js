import { supabase } from './auth.js';

export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();
  

  if (error) {
    throw error;
  }
  return data.session;
}

export function resolveUserInitial(session) {
  let initial = "";
  if (session && session.user) {
    const user = session.user;
    const meta = user.user_metadata || {};
    const email = user.email || "";
    const firstName = meta.first_name || "";
    const fullName = meta.full_name || meta.name || "";
    const businessName = meta.business_name || (typeof localStorage !== "undefined" && localStorage.getItem("bzade_user_business")) || "";

    // Priority: actual name -> business name -> email
    if (firstName && firstName.trim()) {
      initial = firstName.trim().charAt(0);
    } else if (fullName && fullName.trim()) {
      initial = fullName.trim().charAt(0);
    } else if (businessName && businessName.trim()) {
      initial = businessName.trim().charAt(0);
    } else if (email && email.trim()) {
      initial = email.trim().charAt(0);
    }
  }

  if (!initial && typeof localStorage !== "undefined") {
    try {
      initial = localStorage.getItem("bzade_user_initial") || "";
    } catch (_) {}
  }

  initial = (initial || "U").toUpperCase();

  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem("bzade_user_initial", initial);
    } catch (_) {}
  }

  return initial;
}

export function applyUserAvatar(initial) {
  const char = (initial || (typeof localStorage !== "undefined" && localStorage.getItem("bzade_user_initial")) || "U").toUpperCase();
  if (typeof document !== "undefined") {
    document.querySelectorAll("#header-avatar, #avatar-btn, #avatar, #sidebar-user-avatar, .avatar-initial").forEach((el) => {
      el.textContent = char;
    });
  }
}

export async function requireAuth() {
  try {
    const session = await getCurrentSession();
    if (session) {
      const initial = resolveUserInitial(session);
      applyUserAvatar(initial);
      // Clean tokens, hashes, and OAuth codes from the browser address bar
      if (window.location.hash || window.location.search.includes("code=") || window.location.search.includes("access_token")) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      return session;
    }
  } catch (err) {
    console.warn("Session check:", err);
  }
  window.location.replace("./login.html");
  return null;
}

export function watchAuth(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}