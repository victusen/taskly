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
  window.location.replace("./login.html");
  return null;
}

export function watchAuth(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}