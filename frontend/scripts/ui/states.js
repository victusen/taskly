const DONUT_LOADER = `
<svg class="bz-donut-spinner" viewBox="0 0 44 44" width="40" height="40" aria-hidden="true">
  <circle class="bz-spinner-track" cx="22" cy="22" r="17" fill="none" stroke-width="3"></circle>
  <circle class="bz-spinner-arc" cx="22" cy="22" r="17" fill="none" stroke-width="3" stroke-linecap="round" stroke-dasharray="106.8" stroke-dashoffset="78"></circle>
</svg>`;

export function showLoading(container, text = "") {
  if (!container) return;
  container.innerHTML = "";

  const box = document.createElement("div");
  box.className = "bz-state bz-loading";
  box.setAttribute("role", "status");
  box.innerHTML = DONUT_LOADER;

  if (text) {
    const label = document.createElement("p");
    label.className = "bz-loader-text";
    label.textContent = text;
    box.appendChild(label);
  }

  container.appendChild(box);
}

export function showEmpty(container, title, text) {
  container.innerHTML = "";

  const box = document.createElement("div");
  box.className = "bz-state";

  const heading = document.createElement("h3");
  heading.textContent = title;

  const body = document.createElement("p");
  body.textContent = text;

  box.append(heading, body);
  container.appendChild(box);
}

export function showError(container, message, onRetry) {
  container.innerHTML = "";

  const box = document.createElement("div");
  box.className = "bz-state bz-error";
  box.setAttribute("role", "alert");

  const heading = document.createElement("h3");
  heading.textContent = "Something went wrong";

  const body = document.createElement("p");
  body.textContent = message || "Please try again.";

  box.append(heading, body);

  if (typeof onRetry === "function") {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "bz-retry";
    retry.textContent = "Try again";
    retry.addEventListener("click", onRetry);
    box.appendChild(retry);
  }

  container.appendChild(box);
}