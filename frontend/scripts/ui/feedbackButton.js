if (!document.getElementById("bzade-feedback-tab")) {
  const styles = document.createElement("style");
  styles.textContent = `
    #bzade-feedback-tab {
      position: fixed;
      z-index: 1000;
      top: 50%;
      right: 0;
      display: inline-flex;
      min-height: 90px;
      align-items: center;
      justify-content: center;
      padding: 12px 9px;
      border: 1px solid #e8e5de;
      border-right: 0;
      border-radius: 8px 0 0 8px;
      background: #f2f0eb;
      box-shadow: 0 2px 8px rgba(0, 0, 0, .06);
      color: #272724;
      font: 500 12px/1 system-ui, sans-serif;
      text-decoration: none;
      writing-mode: vertical-rl;
      transform: translateY(-50%);
      transition: background-color .15s ease, color .15s ease, padding .15s ease;
    }

    #bzade-feedback-tab:hover {
      padding-right: 11px;
      background: #e9e6de;
      color: #111;
    }

    #bzade-feedback-tab:focus-visible {
      outline: 2px solid #0b7f83;
      outline-offset: 2px;
    }
  `;
  document.head.append(styles);

  const link = document.createElement("a");
  link.id = "bzade-feedback-tab";
  link.href = "/feedback";
  link.textContent = "Feedback";
  link.setAttribute("aria-label", "Share feedback");
  link.title = "Share feedback";
  document.body.append(link);
}
