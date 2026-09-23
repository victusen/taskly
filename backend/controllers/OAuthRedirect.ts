const express = require('express');
const { google } = require('googleapis'); // Install via: pnpm install googleapis
const app = express();

// Initialize the Google OAuth2 client using the keys from your console
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3000/token-redirect' // Your EXACT Callback URL
);

// 1. The Backend Endpoint where Google sends the user
app.get('/token-redirect', async (req, res) => {
  // Capture the temporary authorization code from Google's URL parameter
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('Authorization code missing.');
  }

  try {
    // 2. The Backend Secret Exchange (Hidden server-to-server request)
    const { tokens } = await oauth2Client.getToken(code);
    
    // 3. Save these tokens to your database securely linked to your user
    // tokens.access_token  (Expires in 1 hour)
    // tokens.refresh_token (Permanent - save this to run your bot forever!)
    console.log('Tokens received successfully:', tokens);

    // 4. Send the HTTP redirect command to push the user back to your frontend
    return res.redirect('https://victor.com');

  } catch (error) {
    console.error('Error exchanging token:', error);
    // Redirect to frontend with an error status so your UI can display a message
    return res.redirect('https://victor.com');
  }
});

app.listen(process.env.PORT, () => console.log('Backend running on port 5000'));
