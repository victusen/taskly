import { supabase } from './auth.js';
import { getCurrentSession } from './session.js';

const BACKEND_URL = 'http://localhost:3000'; 

/**
 * Ensures the session is valid, refreshing it if the access token has expired.
 */
async function ensureValidSession() {
  const session = await getCurrentSession();
  
  if (!session) {
    throw new Error('No active session');
  }

  // Check if token is expired or about to expire (within 60 seconds)
  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at && session.expires_at - now < 60) {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
      throw error;
    }
    return data.session;
  }

  return session;
}

/**
 * Helper to get authenticated headers
 */
async function getAuthHeaders() {
  const session = await ensureValidSession();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`
  };
}

/**
 * Wrapper for authenticated API requests with automatic token refresh
 */
export async function authenticatedFetch(url, options = {}) {
  try {
    const headers = await getAuthHeaders();

    const response = await fetch(`${BACKEND_URL}${url}`, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });

    // Handle 401 Unauthorized - could mean token was invalidated
    if (response.status === 401) {
      window.location.href = 'index.html';
      return;
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Request failed: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}
