const SNIPPETS = {
  h1: "<h1>|</h1>",
  p: "<p>|</p>",
  variable: "{name1}|",
  operation: "{num1/num2}|",
  a: '<a href="https://|" target="_blank" rel="noopener noreferrer">Link text</a>',
  button: '<a href="https://|" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 22px;background-color:#111111;color:#ffffff;text-decoration:none;">Button text</a>',
  img: '<img src="|" alt="" width="240" style="display:block;max-width:100%;height:auto;">',
  column: '<div style="display:flex;flex-direction:column;gap:12px;">\n  |\n</div>',
  row: '<div style="display:flex;flex-direction:row;align-items:center;gap:12px;">\n  |\n</div>',
};

export function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

export function initEmailComposerEditor({
  root,
  bodyInput,
  subjectInput,
  uploadButton,
  fileInput,
  assetsToggle,
  assetsBox,
  assetCount,
  previewButton,
  previewPanel,
  previewFrame,
  uploadAsset = readImageAsDataUrl,
  onChange = () => {},
  onError = () => {},
}) {
  if (!root || !bodyInput || !uploadButton || !fileInput || !assetsToggle || !assetsBox || !assetCount) {
    throw new Error("The email editor is missing a required control.");
  }

  const assets = [];

  function insertAtCursor(text, caretOffset = text.length) {
    const start = bodyInput.selectionStart;
    const end = bodyInput.selectionEnd;
    bodyInput.value = `${bodyInput.value.slice(0, start)}${text}${bodyInput.value.slice(end)}`;
    const caret = start + caretOffset;
    bodyInput.focus();
    bodyInput.setSelectionRange(caret, caret);
    onChange();
  }

  function insertTemplate(template) {
    if (!template) return;
    const marker = template.indexOf("|");
    const insertion = template.replace("|", "");
    insertAtCursor(insertion, marker < 0 ? insertion.length : marker);
  }

  root.querySelectorAll("[data-insert]").forEach((button) => {
    button.addEventListener("click", () => insertTemplate(SNIPPETS[button.dataset.insert]));
  });

  subjectInput?.addEventListener("input", onChange);
  bodyInput.addEventListener("input", onChange);
  bodyInput.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    event.preventDefault();
    insertAtCursor("  ");
  });

  function renderAssets() {
    assetCount.textContent = String(assets.length);
    assetsBox.replaceChildren();

    if (assets.length === 0) {
      const empty = document.createElement("p");
      empty.className = "cmp-muted";
      empty.textContent = "No assets yet. Upload an image to see it here.";
      assetsBox.append(empty);
      return;
    }

    for (const asset of assets) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "cmp-asset";
      item.title = asset.name;

      const image = document.createElement("img");
      image.src = asset.url;
      image.alt = "";

      const label = document.createElement("span");
      label.textContent = asset.name;

      item.append(image, label);
      item.addEventListener("click", () => {
        insertTemplate(`<img src="${asset.url}" alt="" width="240" style="display:block;max-width:100%;height:auto;">`);
      });
      assetsBox.append(item);
    }
  }

  uploadButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      onError("Choose an image file.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      onError("Images must be 2 MB or smaller.");
      return;
    }

    try {
      const url = await uploadAsset(file);
      if (typeof url !== "string" || !url) throw new Error("Could not read that file.");
      assets.push({ name: file.name, url });
      renderAssets();
      assetsBox.hidden = false;
      assetsToggle.setAttribute("aria-expanded", "true");
    } catch (error) {
      onError(error.message || "Upload failed.");
    }
  });

  assetsToggle.addEventListener("click", () => {
    assetsBox.hidden = !assetsBox.hidden;
    assetsToggle.setAttribute("aria-expanded", String(!assetsBox.hidden));
  });

  if (previewButton && previewPanel && previewFrame) {
    previewButton.addEventListener("click", () => {
      const isVisible = !previewPanel.hidden;
      previewPanel.hidden = isVisible;
      previewButton.textContent = isVisible ? "Preview" : "Hide preview";
      previewButton.setAttribute("aria-expanded", String(!isVisible));
      if (isVisible) return;

      const previewDocument = previewFrame.contentDocument || previewFrame.contentWindow.document;
      previewDocument.open();
      previewDocument.write(bodyInput.value.trim() || "<p style='color:#999;font-size:13px;padding:16px;'>Nothing to preview yet.</p>");
      previewDocument.close();
    });
  }
}
