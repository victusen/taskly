import { supabase } from './auth.js';
import { getCurrentSession } from './session.js';

import {
  showToast,
  updateToast,
  dismissToast
} from '../ui/toast.js';


const BACKEND_URL =
  'http://localhost:3000';


async function ensureValidSession() {

  const session =
    await getCurrentSession();

  if (!session) {

    throw new Error(
      'No active session'
    );

  }

  return session;
}

async function getAuthHeaders() {

  const session =
    await ensureValidSession();

  return {
    'Content-Type':
      'application/json',

    'Authorization':
      `Bearer ${session.access_token}`
  };
}

export async function authenticatedFetch(
  url,
  options = {}
) {

  const headers =
    await getAuthHeaders();

  const response =
    await fetch(
      `${BACKEND_URL}${url}`,
      {
        ...options,

        headers: {
          ...headers,
          ...options.headers
        }
      }
    );

  let body = {};

  try {

    body =
      await response.json();

  } catch {

    body = {};

  }


  /* BACKEND NOTICE: If backend included a notice, show it automatically. */

  if (body.notice) {

    showToast(
      body.notice.type,
      body.notice.message,
      {
        title:
          body.notice.title,

        duration:
          body.notice.duration
      }
    );

  }

  /* HTTP FAILURE */

  if (!response.ok) {

    const error =
      new Error(
        body.message ||
        body.error ||
        'Request failed.'
      );

    error.status =
      response.status;

    error.code =
      body.code;

    error.fieldErrors =
      body.fieldErrors;

    throw error;
  }

  return body;
}