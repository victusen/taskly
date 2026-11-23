import { saveDraft } from "../scripts/data/drafts.js";
import {
  initEmailComposerEditor,
  readImageAsDataUrl,
} from "../scripts/ui/emailComposerEditor.js";

const form = document.getElementById("template-form");
const bodyEditor = document.getElementById("template-body");
const subjectInput = form?.elements.namedItem("subject");
const senderNameInput = form?.elements.namedItem("sender_name");
const message = document.getElementById("form-message");
const saveStatus = document.getElementById("save-status");

function showMessage(text, isError = false) {
  if (message) {
    message.textContent = text;
    message.style.color = isError ? "#dc2626" : "#15803d";
  }
}

function saveCurrentTemplate(messageText) {
  if (!form?.reportValidity()) return;

  const data = new FormData(form);
  try {
    saveDraft({
      name: data.get("name"),
      subject: data.get("subject"),
      sender_name: data.get("sender_name"),
      body: data.get("body"),
    });
    showMessage(messageText);
    if (saveStatus) saveStatus.textContent = "Saved just now";
  } catch (error) {
    showMessage(error.message || "Could not save this email.", true);
    if (saveStatus) saveStatus.textContent = "Not saved";
  }
}

initEmailComposerEditor({
  root: form,
  bodyInput: bodyEditor,
  subjectInput,
  uploadButton: document.getElementById("cmp-upload-btn"),
  fileInput: document.getElementById("cmp-file"),
  assetsToggle: document.getElementById("cmp-assets-toggle"),
  assetsBox: document.getElementById("cmp-assets"),
  assetCount: document.getElementById("cmp-asset-count"),
  previewButton: document.getElementById("preview-button"),
  previewPanel: document.getElementById("preview-panel"),
  previewFrame: document.getElementById("preview-frame"),
  uploadAsset: readImageAsDataUrl,
  onError: (text) => showMessage(text, true),
  onChange: () => showMessage(""),
});

document.getElementById("save-button")?.addEventListener("click", () => {
  saveCurrentTemplate("Draft saved to this device.");
});

document.getElementById("use-project-name")?.addEventListener("click", () => {
  const projectName = new URLSearchParams(window.location.search).get("project_name")?.trim()
    || window.bzComposer?.getProjectName?.()
    || "";
  if (!projectName) {
    showMessage("A project name is not available here. Enter a sender name instead.", true);
    return;
  }
  senderNameInput.value = projectName;
  showMessage("");
});

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  saveCurrentTemplate("Template saved as a reusable email draft on this device.");
});
