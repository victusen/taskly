import { supabase } from './auth.js';

const PROFILE_AVATAR_STORAGE_KEY = "bzade_profile_avatar";
const AVATAR_DATA_URL_PATTERN = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

function profileAvatarStorageKey(userId) {
  if (typeof userId !== "string" || !userId.trim()) return null;
  return `${PROFILE_AVATAR_STORAGE_KEY}:${encodeURIComponent(userId)}`;
}

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

export function getLocalProfileAvatar(userId) {
  if (typeof localStorage === "undefined") return null;
  const key = profileAvatarStorageKey(userId);
  if (!key) return null;
  try {
    const avatar = localStorage.getItem(key);
    return typeof avatar === "string" && AVATAR_DATA_URL_PATTERN.test(avatar) ? avatar : null;
  } catch {
    return null;
  }
}

export function saveLocalProfileAvatar(userId, avatarUrl) {
  if (typeof avatarUrl !== "string" || !AVATAR_DATA_URL_PATTERN.test(avatarUrl)) {
    throw new Error("Choose a valid PNG, JPG, or WebP profile icon.");
  }
  const key = profileAvatarStorageKey(userId);
  if (!key) throw new Error("Could not identify the signed-in account for this profile icon.");
  try {
    localStorage.setItem(key, avatarUrl);
  } catch (error) {
    console.error("Could not save the profile icon in this browser:", error);
    throw new Error("Could not save the profile icon on this device.");
  }
}

export function removeLocalProfileAvatar(userId) {
  const key = profileAvatarStorageKey(userId);
  if (!key) throw new Error("Could not identify the signed-in account for this profile icon.");
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error("Could not remove the profile icon from this browser:", error);
    throw new Error("Could not remove the profile icon from this device.");
  }
}

export function applyUserAvatar(initial, avatarUrl = null, { preferProvided = false, userId = null } = {}) {
  const char = (initial || (typeof localStorage !== "undefined" && localStorage.getItem("bzade_user_initial")) || "U").toUpperCase();
  const providedImage = typeof avatarUrl === "string" && AVATAR_DATA_URL_PATTERN.test(avatarUrl)
    ? avatarUrl
    : null;
  const localImage = getLocalProfileAvatar(userId);
  const image = preferProvided ? providedImage || localImage : localImage;
  if (typeof document !== "undefined") {
    document.querySelectorAll("#header-avatar, #avatar-btn, #avatar, #sidebar-user-avatar, #avatar-account-initial, #profile-avatar-preview, .avatar-initial").forEach((el) => {
      el.textContent = image ? "" : char;
      el.style.backgroundImage = image ? `url("${image}")` : "";
      el.style.backgroundSize = image ? "cover" : "";
      el.style.backgroundPosition = image ? "center" : "";
    });
  }
}

export async function requireAuth() {
  try {
    const session = await getCurrentSession();
    if (session) {
      const initial = resolveUserInitial(session);
      applyUserAvatar(initial, session.user?.user_metadata?.avatar_url, { userId: session.user?.id });
      // Clean tokens, hashes, and OAuth codes from the browser address bar
      if (window.location.hash || window.location.search.includes("code=") || window.location.search.includes("access_token")) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      return session;
    }
  } catch (err) {
    console.warn("Session check:", err);
  }
  window.location.replace(new URL("/login.html", window.location.origin).href);
  return null;
}

export function watchAuth(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}