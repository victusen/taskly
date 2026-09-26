import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"
import { ensureNetworkConnection } from '../utils/network.js';

// console.log(createClient);

const SUPABASE_URL = 'https://xpawzghnnydtjtloxxvt.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_hmxDBByNrcbAjzTKAJlRUA_aB8XZFlt';

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

export async function signInWithGoogle() {
  ensureNetworkConnection();
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: 'http://localhost:8158/dashboard.html'
    }
  })
}

export async function signInWithGithub() {
  ensureNetworkConnection();
  return supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: 'http://localhost:8158/dashboard.html'
    }
  })
}

export async function signInWithFacebook() {
  ensureNetworkConnection();
  return supabase.auth.signInWithOAuth({
    provider: 'facebook',
    options: {
      redirectTo: 'http://localhost:8158/dashboard.html'
    }
  })
}

export async function signInWithX() {
  ensureNetworkConnection();
  return supabase.auth.signInWithOAuth({
    provider: 'x',
    options: {
      redirectTo: 'http://localhost:8158/dashboard.html'
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

export async function signUp(email, password) {
  ensureNetworkConnection();
  const { data, error } = await supabase.auth.signUp({
    email,
    password
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function resetPassword(email) {
  ensureNetworkConnection();
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'http://localhost:8158/reset-password.html'
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
    .single();

  if (error) throw error;

  return data;
}