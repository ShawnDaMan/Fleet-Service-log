// This file provides a helper to fetch the signed-in user's email using the Google OAuth2 userinfo endpoint.
// Returns a Promise that resolves to the email string, or null if not available.
export async function fetchGoogleUserEmail(accessToken) {
  if (!accessToken) return null;
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.email || null;
  } catch (e) {
    return null;
  }
}
