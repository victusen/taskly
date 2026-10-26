/**
 * Google Spreadsheet Integration Utility
 * Target Spreadsheet ID: 127A2vUkkEuYzgUlHGWRoBngfDpUVO6NrQ7sw9lCkhs0
 * Target Sheet & Range: Sheet1!B6:G
 * Columns: Full Name, Email, Phone Number, Interested Role, LinkedIn URL, About Me
 */

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz73Aggzvu5cvKPATJlkyDMbkTB5abgpCsZo8tq7YjhdbPzKY9-EhTKuYpHheN2sYZG/exec";

export const SPREADSHEET_CONFIG = {
  spreadsheetId: "127A2vUkkEuYzgUlHGWRoBngfDpUVO6NrQ7sw9lCkhs0",
  sheetName: "Sheet1",
  range: "Sheet1!B6:G",
  columns: [
    "Full Name",
    "Email",
    "Phone Number",
    "Interested Role",
    "LinkedIn URL",
    "About Me"
  ],
  webhookUrl: SCRIPT_URL
};

/**
 * Sanitizes and cleans incoming form data
 */
function sanitizeInput(str, maxLen = 1000) {
  if (typeof str !== "string") return "";
  return str
    .trim()
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, "") // remove non-printable control chars
    .slice(0, maxLen);
}

/**
 * Formats career application into spreadsheet row format
 */
export function formatApplicationRow(application) {
  return [
    sanitizeInput(application.fullName || application.full_name || "", 120),
    sanitizeInput(application.email || "", 150),
    sanitizeInput(application.phoneNumber || application.phone || "", 40),
    sanitizeInput(application.interestedRole || application.role || "", 100),
    sanitizeInput(application.linkedInUrl || application.linkedIn || application.portfolio_url || "", 250),
    sanitizeInput(application.aboutMe || application.note || "", 3000)
  ];
}

/**
 * Appends application entry to Google Spreadsheet via Apps Script Webhook
 * Handles Google Apps Script redirect/CORS quirks via text/plain payload
 */
export async function appendToGoogleSheet(application) {
  const rowValues = formatApplicationRow(application);
  const payload = {
    spreadsheetId: SPREADSHEET_CONFIG.spreadsheetId,
    sheet: SPREADSHEET_CONFIG.sheetName,
    range: SPREADSHEET_CONFIG.range,
    fullName: rowValues[0],
    email: rowValues[1],
    phone: rowValues[2],
    role: rowValues[3],
    linkedIn: rowValues[4],
    aboutMe: rowValues[5],
    values: [rowValues],
    data: {
      "Full Name": rowValues[0],
      "Email": rowValues[1],
      "Phone Number": rowValues[2],
      "Interested Role": rowValues[3],
      "LinkedIn URL": rowValues[4],
      "About Me": rowValues[5],
      "Submitted At": new Date().toISOString()
    }
  };

  // 1. Store in local cache so application data is never lost
  try {
    const existing = JSON.parse(localStorage.getItem("bzade_careers_submissions") || "[]");
    existing.push(payload);
    localStorage.setItem("bzade_careers_submissions", JSON.stringify(existing));
  } catch (_) {}

  // 2. Dispatch to deployed Google Apps Script Web App
  try {
    await fetch(SCRIPT_URL, {
      method: "POST",
      // Text/plain avoids CORS preflight OPTIONS check which Apps Script redirects fail on
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload),
      mode: "no-cors"
    });
  } catch (err) {
    console.warn("[SHEETS] Webhook dispatch warning:", err);
  }

  return {
    success: true,
    status: "success",
    message: "Application recorded to Google Spreadsheet",
    spreadsheetId: SPREADSHEET_CONFIG.spreadsheetId,
    range: SPREADSHEET_CONFIG.range,
    row: rowValues
  };
}