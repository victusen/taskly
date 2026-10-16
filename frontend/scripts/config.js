const isLocal = false;
  // ["localhost", "127.0.0.1"].includes(window.location.hostname);

export const BACKEND_URL = isLocal
  ? "http://localhost:3000"
  : "https://api.bzade.app";

console.log(BACKEND_URL);