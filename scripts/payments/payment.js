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

  console.log("starting payment");

  try {
    const { data: { session } } = await supabase.auth.getSession();
   console.log("Current Session:", session ? "Exists" : 
 "MISSING");
   
   // IF the client is initialized correctly.
   const { data, error } = await 
 supabase.functions.invoke('initialize-payment', {
     method: 'POST', // Ensure explicit method
     body: {}
   });

   if (error) {
     // If it's a CORS issue, the browser console will show it.
     // If it's a 401/403, the response will be here.
     console.error("Function invocation error:", error);
     throw error;
   }

    const accessCode = data?.payment?.access_code;

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