const STORAGE_KEY = 'taskly_toasts';

const MAX_VISIBLE = 4;
const DEFAULT_DURATION = 5000;

const containerId = 'taskly-toast-container';

let renderedIds = new Set();


function getToasts() {
  try {
    const toasts = JSON.parse(
      localStorage.getItem(STORAGE_KEY)
    );

    return Array.isArray(toasts)
      ? toasts
      : [];

  } catch {
    return [];
  }
}


function saveToasts(toasts) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(toasts)
  );
}


function removeExpired() {

  const now = Date.now();

  const active = getToasts().filter(
    toast => toast.expiresAt > now
  );

  saveToasts(active);

  return active;
}


function getContainer() {

  let container =
    document.getElementById(containerId);

  if (container) {
    return container;
  }

  container = document.createElement('div');

  container.id = containerId;

  document.body.appendChild(container);

  return container;
}


function getTypeClass(type) {

  const classes = {

    success: 'toast-success',

    warning: 'toast-warning',

    error: 'toast-error',

    info: 'toast-info',

    loading: 'toast-loading'

  };

  return classes[type] || classes.info;
}


function getIcon(type) {

  const icons = {

    success: '✓',

    warning: '!',

    error: '!',

    info: 'i',

    loading: ''

  };

  return icons[type] || 'i';
}


function removeToast(id) {

  const toasts = getToasts();

  saveToasts(
    toasts.filter(
      toast => toast.id !== id
    )
  );

  const element =
    document.querySelector(
      `[data-toast-id="${id}"]`
    );

  if (element) {

    element.classList.add(
      'toast-hide'
    );

    setTimeout(() => {

      element.remove();

      renderedIds.delete(id);

      render();

    }, 250);

  } else {

    renderedIds.delete(id);

    render();

  }
}


function renderToast(toast) {

  if (renderedIds.has(toast.id)) {
    return;
  }

  const container = getContainer();

  const element =
    document.createElement('div');

  element.dataset.toastId =
    toast.id;

  element.className =
    `taskly-toast ${getTypeClass(toast.type)}`;


  element.innerHTML = `

    <div class="toast-icon">
      ${
        toast.type === 'loading'
          ? '<span class="toast-spinner"></span>'
          : getIcon(toast.type)
      }
    </div>

    <div class="toast-content">

      ${
        toast.title
          ? `<strong>${escapeHTML(toast.title)}</strong>`
          : ''
      }

      <p>
        ${escapeHTML(toast.message)}
      </p>

    </div>

    <button
      type="button"
      class="toast-close"
      aria-label="Close notification"
    >
      ×
    </button>

    ${
      toast.type !== 'loading'
        ? '<div class="toast-progress"></div>'
        : ''
    }

  `;


  element
    .querySelector('.toast-close')
    .addEventListener(
      'click',
      () => removeToast(toast.id)
    );


  /*
   * Newest toast goes at the top.
   * Older toasts move downward.
   */

  container.prepend(element);

  renderedIds.add(toast.id);


  if (toast.type === 'loading') {
    return;
  }


  const remaining =
    Math.max(
      0,
      toast.expiresAt - Date.now()
    );


  const progress =
    element.querySelector(
      '.toast-progress'
    );


  if (progress) {

    progress.style.animationDuration =
      `${remaining}ms`;

  }


  setTimeout(() => {

    removeToast(toast.id);

  }, remaining);

}


function render() {

  const toasts =
    removeExpired();

  const container =
    getContainer();


  /*
   * Only the newest MAX_VISIBLE
   * notifications are visible.
   */

  const visible =
    toasts.slice(-MAX_VISIBLE);


  [...container.children].forEach(
    element => {

      const id =
        element.dataset.toastId;

      if (
        !visible.some(
          toast => toast.id === id
        )
      ) {

        element.remove();

        renderedIds.delete(id);

      }

    }
  );


  visible.forEach(
    toast => renderToast(toast)
  );

}


export function showToast(
  type,
  message,
  options = {}
) {

  const {

    title = '',

    duration = DEFAULT_DURATION

  } = options;


  const existing =
    removeExpired();


  /* Prevent duplicate simultaneous notifications. */

  const duplicate =
    existing.some(
      toast =>
        toast.type === type &&
        toast.message === message
    );


  if (duplicate) {
    return null;
  }


  const now = Date.now();


  const toast = {

    id:
      `${now}-${Math.random()
        .toString(36)
        .slice(2)}`,

    type,

    title,

    message,

    createdAt: now,

    expiresAt:
      now + duration

  };


  saveToasts([
    ...existing,
    toast
  ]);


  render();

  return toast.id;
}


export function updateToast(
  id,
  type,
  message,
  options = {}
) {

  const toasts =
    getToasts();

  const index =
    toasts.findIndex(
      toast => toast.id === id
    );


  if (index === -1) {

    return showToast(
      type,
      message,
      options
    );

  }


  const duration =
    options.duration ||
    DEFAULT_DURATION;


  toasts[index] = {

    ...toasts[index],

    type,

    title:
      options.title ||
      toasts[index].title,

    message,

    expiresAt:
      Date.now() + duration

  };


  saveToasts(toasts);

  renderedIds.delete(id);

  render();

  return id;
}


export function dismissToast(id) {
  removeToast(id);
}


export function success(message, options) {
  return showToast(
    'success',
    message,
    options
  );
}


export function warning(message, options) {
  return showToast(
    'warning',
    message,
    options
  );
}


export function error(message, options) {
  return showToast(
    'error',
    message,
    options
  );
}


export function info(message, options) {
  return showToast(
    'info',
    message,
    options
  );
}


export function loading(message, options = {}) {

  /* Loading is allowed to live until updateToast() or dismissToast() is called. */

  return showToast(
    'loading',
    message,
    {
      ...options,
      duration: 60000
    }
  );
}


function escapeHTML(value) {

  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

}


/* Render notifications immediately when a page loads.*/

render();


/* INTERNET CONNECTION */

let wasOffline =
  !navigator.onLine;


window.addEventListener(
  'offline',
  () => {

    wasOffline = true;

    warning(
      'Check your internet connection.',
      {
        title: 'You are offline'
      }
    );

  }
);


window.addEventListener(
  'online',
  () => {

    if (!wasOffline) {
      return;
    }

    wasOffline = false;

    success(
      'Your internet connection is back 😂',
      {
        title: 'You are now online'
      }
    );

  }
); 