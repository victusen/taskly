import { showToast } from '../ui/toast.js';

export function ensureNetworkConnection() {
  if (!navigator.onLine) {
    const error = new Error(
      'No internet connection. Check your internet connection and try again.'
    );

    error.code = 'NETWORK_OFFLINE';

    try {
      showToast('error', 'No internet connection. Check your network.');
    } catch (_) {}

    throw error;
  }
}