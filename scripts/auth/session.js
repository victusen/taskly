import { supabase } from './auth.js';

export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session;
}

export async function requireAuth() {
  const session = await getCurrentSession();

  if (!session) {
    window.location.href = 'index.html';
    return null;
  }

  return session;
}

export function watchAuth(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}