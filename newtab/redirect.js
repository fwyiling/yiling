// New tabs show the Syndicates page; if "Google" is chosen in the popup they open google.com instead.
// Runs before anything else so the page switches instantly.
try {
  if (localStorage.getItem('scStartPage') === 'google') location.replace('https://www.google.com/');
} catch {}
