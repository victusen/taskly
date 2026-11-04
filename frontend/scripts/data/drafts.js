const DRAFTS_KEY = "bzade_email_drafts";
const MAX_DRAFTS = 50;

export function readDrafts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFTS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveDraft({ name, subject, body }) {
  const clean = {
    id: `d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: String(name || "Untitled draft").slice(0, 120),
    subject: String(subject || "").slice(0, 300),
    body: String(body || "").slice(0, 200000),
    savedAt: new Date().toISOString(),
  };
  const next = [clean, ...readDrafts()].slice(0, MAX_DRAFTS);
  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(next));
  } catch {
    throw new Error("This device is out of storage space. Delete some drafts and try again.");
  }
  return clean;
}