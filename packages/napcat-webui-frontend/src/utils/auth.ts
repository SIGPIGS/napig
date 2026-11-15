let redirecting = false;

export function signIn () {
  if (redirecting) return;
  redirecting = true;
  const target = new URL('/oauth2/start', window.location.origin);
  target.searchParams.set('rd', window.location.href);
  window.location.assign(target.toString());
}

export function signOut () {
  const target = new URL('/oauth2/sign_out', window.location.origin);
  // The sign-in page leaves the user signed out until they explicitly sign in.
  target.searchParams.set('rd', new URL('/oauth2/sign_in', window.location.origin).toString());
  window.location.assign(target.toString());
}

export async function checkSessionAfterDisconnect () {
  try {
    const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' } });
    if (response.status === 401) signIn();
  } catch {
    // A backend restart or network error does not mean the OAuth session expired.
  }
}
