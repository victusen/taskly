
import { getCurrentSession } from './session.js';
import {
  BACKEND_URL
} from "../config.js";

import {
  showToast
} from '../ui/toast.js';


//const BACKEND_URL = 'http://localhost:3000';


async function ensureValidSession() {

  const session =
    await getCurrentSession();

    if (!session) {
      const error = new Error('Please sign in again.');
      error.status = 401;
      throw error;
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

    let response;

    try {
      response = await fetch(`${BACKEND_URL}${url}`, {
        ...options,
        headers: { ...headers, ...options.headers },
      });
    } catch {
      const error = new Error('Cannot reach Bzade. Check your connection and try again.');
      error.status = 0;
      throw error;
    }

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