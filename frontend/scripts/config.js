const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);

export const BACKEND_URL = isLocal
  ? "http://localhost:3000"
  : "https://api.bzade.app";