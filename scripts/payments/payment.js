import { supabase } from '../auth/auth.js';

import {
  loading,
  updateToast
} from '../ui/toast.js';

export async function startPayment() {
  const toastId = loading(
    'Preparing secure checkout...',
    {
      title: 'Preparing payment'
    }
  );

  try {
    const { data, error } =
      await supabase.functions.invoke(
        'https://xpawzghnnydtjtloxxvt.supabase.co/functions/v1/initialize-payment',
        {
          body: {}
        }
      );

    if (error) {
      throw error;
    }

    const accessCode =
      data?.access_code;

    if (!accessCode) {
      throw new Error(
        'Payment initialization did not return an access code.'
      );
    }

    updateToast(
      toastId,
      'info',
      'Checkout is ready.',
      {
        title: 'Opening Paystack'
      }
    );

    const popup =
      new PaystackPop();

    popup.resumeTransaction(
      accessCode
    );

  } catch (error) {
    console.error(
      '[PAYSTACK]',
      error
    );

    updateToast(
      toastId,
      'error',
      error.message ||
        'Unable to start payment.',
      {
        title: 'Payment unavailable'
      }
    );
  }
}