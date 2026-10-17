const DONUT_LOADER = `<div class="bz-donut-spinner" aria-hidden="true"></div>`;

export function showLoading(container, text = "Loading...") {
  container.innerHTML = "";

  const box = document.createElement("div");
  box.className = "bz-state bz-loading";
  box.setAttribute("role", "status");
  box.innerHTML = DONUT_LOADER;

  const label = document.createElement("p");
  label.textContent = text;

  box.appendChild(label);
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