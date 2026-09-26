import {
  requireAuth
} from './scripts/auth/session.js';

import {
  toastSuccess,
  toastWarning,
  toastError,
  toastInfo,
  toastLoading
} from './scripts/ui/toast.js';


const session =
  await requireAuth();

if (!session) {
  throw new Error(
    'Authentication required.'
  );
}


const addTaskBtn =
  document.getElementById(
    'add-schedule'
  );

const closeBtn =
  document.getElementById(
    'close-btn'
  );

const overLay =
  document.getElementById(
    'schedule-overlay'
  );


addTaskBtn.addEventListener(
  'click',
  () => {

    overLay.classList.add('open');

  }
);


closeBtn.addEventListener(
  'click',
  () => {

    overLay.classList.remove('open');

  }
);