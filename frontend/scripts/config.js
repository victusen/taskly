// frontend/scripts/config.js

export const BACKEND_URL = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:3000"
  : "https://api.bzade.app";

export const ROUTES = {
  home: "/",
  pricing: "/pricing",
  login: "/login",
  signup: "/signup",
  resetPassword: "/reset-password",
  app: "/app",
  mailAccounts: "/app/mail-accounts",
  jobs: (projectId) => `/app/jobs?project=${encodeURIComponent(projectId)}`,
  terms: "/legal/terms",
  privacy: "/legal/privacy",
  dataProtection: "/legal/data-protection",
};