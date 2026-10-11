const MARK = `
<svg class="bz-mark" viewBox="0 0 24 24" aria-hidden="true">
  <g stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
    <line x1="12" y1="2.5" x2="12" y2="21.5"/>
    <line x1="2.5" y1="12" x2="21.5" y2="12"/>
    <line x1="5.3" y1="5.3" x2="18.7" y2="18.7"/>
    <line x1="18.7" y1="5.3" x2="5.3" y2="18.7"/>
  </g>
</svg>
`;

export function showLoading(container, text = "Loading...") {
  container.innerHTML = "";

  const box = document.createElement("div");
  box.className = "bz-state bz-loading";
  box.setAttribute("role", "status");
  box.innerHTML = MARK;

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