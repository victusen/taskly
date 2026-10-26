import { appendToGoogleSheet, SPREADSHEET_CONFIG } from "../utils/sheets.js";

/**
 * Validates and submits a career application to Google Spreadsheet
 */
export async function submitCareerApplication({
  fullName,
  email,
  phone,
  role,
  linkedInUrl,
  aboutMe
}) {
  if (!fullName || !fullName.trim()) {
    throw new Error("Please enter your full name.");
  }
  if (!email || !email.includes("@")) {
    throw new Error("Please enter a valid email address.");
  }
  if (!role) {
    throw new Error("Please select a role of interest.");
  }
  if (!aboutMe || aboutMe.trim().length < 10) {
    throw new Error("Please share a brief note about yourself and your experience (at least 10 characters).");
  }

  const result = await appendToGoogleSheet({
    fullName: fullName.trim(),
    email: email.trim(),
    phone: (phone || "").trim(),
    role: role.trim(),
    linkedInUrl: (linkedInUrl || "").trim(),
    aboutMe: aboutMe.trim()
  });

  return result;
}

export { SPREADSHEET_CONFIG };
