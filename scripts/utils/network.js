export function ensureNetworkConnection() {
  if (!navigator.onLine) {
    const error = new Error(
      'No internet connection. Check your internet connection and try again.'
    );

    error.code = 'NETWORK_OFFLINE';

    console.error('[NETWORK]', error.message);

    alert('Error: Check your internet connection.');

    throw error;
  }
}