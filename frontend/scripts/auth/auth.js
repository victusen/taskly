// import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm"
import { ensureNetworkConnection } from '../utils/network.js';

// console.log(createClient);

const SUPABASE_URL = 'https://xpawzghnnydtjtloxxvt.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_hmxDBByNrcbAjzTKAJlRUA_aB8XZFlt';

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

// Silence console.log in production
if (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
  console.log = () => {};
}

export function getAppRedirectUrl(targetFile = "dashboard.html") {
  const path = window.location.pathname;
  let dir = path.substring(0, path.lastIndexOf('/') + 1) || '/';
  if (dir.endsWith('/job/')) {
    dir = dir.substring(0, dir.length - 4);
  }
  return `${window.location.origin}${dir}${targetFile}`;
}

export async function signInWithGoogle() {
  ensureNetworkConnection();
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: getAppRedirectUrl('dashboard.html')
    }
  })
}

export async function signInWithGithub() {
  ensureNetworkConnection();
  return supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: getAppRedirectUrl('dashboard.html')
    }
  })
}

export async function signInWithFacebook() {
  ensureNetworkConnection();
  return supabase.auth.signInWithOAuth({
    provider: 'facebook',
    options: {
      redirectTo: getAppRedirectUrl('dashboard.html')
    }
  })
}

export async function signInWithX() {
  ensureNetworkConnection();
  return supabase.auth.signInWithOAuth({
    provider: 'x',
    options: {
      redirectTo: getAppRedirectUrl('dashboard.html')
    }
  })
}

export async function signIn(email, password) {
  ensureNetworkConnection();
  const { 
    data, error 
  } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function signUp(email, password, firstName, lastName) {
  ensureNetworkConnection();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { first_name: firstName, last_name: lastName },
      emailRedirectTo: getAppRedirectUrl('dashboard.html')
    }
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function resetPassword(email) {
  ensureNetworkConnection();
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: getAppRedirectUrl('reset-password.html')
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function signOut() {
  ensureNetworkConnection();
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}

export async function updatePassword(newPassword) {
  ensureNetworkConnection();
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;

  return data.session;
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();

  if (error) throw error;

  return data.user;
}

export async function getUserProfile(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;

  return data;
}