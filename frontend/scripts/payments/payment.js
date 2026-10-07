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
    if (!session) {
  throw new Error(
    'No active session. Please sign in again.'
  );
    }

    console.log("starting edge function invocation");
   const response = await fetch(`${supabase.supabaseUrl}/functions/v1/initialize-payment`, 
 {
       method: 'POST',
       headers: {
         'Authorization': `Bearer ${session.access_token}`,
         'Content-Type': 'application/json'
       },
       body: JSON.stringify({})
     });

     const result = await response.json();

     if (!response.ok) {
       console.error("Edge Function failed with status:", 
 response.status, result);
       throw new Error(
  result.error ||
  result.message ||
  "Failed to initialize payment"
);
     }

    const { payment } = result;
    
   // if (error) {
   //   console.error("Function invocation error:", error);
   //   throw error;
   // }

    const accessCode = payment?.access_code || "";

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