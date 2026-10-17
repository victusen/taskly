import { supabase } from './auth.js';

export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();
  

  if (error) {
    throw error;
  }
  return data.session;
}

export async function requireAuth() {
  try {
    const session = await getCurrentSession();
    if (session) return session;
  } catch (err) {
    console.warn("Session check:", err);
  }

  // Allow testing mock projects without getting redirected to login.html
  const urlParams = new URLSearchParams(window.location.search);
  const proj = urlParams.get("project");
  if (!proj || proj.startsWith("mock-")) {
    return {
      user: {
        id: "mock-user-1",
        email: "usenvictor40@gmail.com",
        user_metadata: { full_name: "Victor Usen", name: "Victor Usen" },
      },
      signOut: async () => {},
    };
  }

  window.location.href = 'login.html';
  return null;
}

export function watchAuth(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}