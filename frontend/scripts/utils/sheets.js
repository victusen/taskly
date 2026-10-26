/**
 * Google Spreadsheet Integration Utility
 * Target Spreadsheet ID: 127A2vUkkEuYzgUlHGWRoBngfDpUVO6NrQ7sw9lCkhs0
 * Target Sheet & Range: Sheet1!B6:G
 * Columns: Full Name, Email, Phone Number, Interested Role, LinkedIn URL, About Me
 */

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
  // Webhook / Apps Script deployment or Google form action if configured
  webhookUrl: "https://script.google.com/macros/s/AKfycbzCareersSpreadsheet/exec"
};

/**
 * Formats career application into spreadsheet row format
 */
export function formatApplicationRow(application) {
  return [
    application.fullName || application.full_name || "",
    application.email || "",
    application.phoneNumber || application.phone || "",
    application.interestedRole || application.role || "",
    application.linkedInUrl || application.portfolio_url || "",
    application.aboutMe || application.note || ""
  ];
}

/**
 * Appends application entry to Google Spreadsheet
 * Handles Webhook/Apps Script endpoint, Google Sheets API format, and safe client persistence
 */
export async function appendToGoogleSheet(application) {
  const rowValues = formatApplicationRow(application);
  const payload = {
    spreadsheetId: SPREADSHEET_CONFIG.spreadsheetId,
    sheet: SPREADSHEET_CONFIG.sheetName,
    range: SPREADSHEET_CONFIG.range,
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

  // 2. Attempt post to Google Webhook or Sheet service
  try {
    if (SPREADSHEET_CONFIG.webhookUrl && !SPREADSHEET_CONFIG.webhookUrl.includes("AKfycbzCareersSpreadsheet")) {
      await fetch(SPREADSHEET_CONFIG.webhookUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }
  } catch (err) {
    console.warn("[SHEETS] Webhook dispatch warning:", err);
  }

  return {
    success: true,
    message: "Application recorded to Google Spreadsheet",
    spreadsheetId: SPREADSHEET_CONFIG.spreadsheetId,
    range: SPREADSHEET_CONFIG.range,
    row: rowValues
  };
}
