// New tabs open google.com (customised by Syndicates) unless "Syndicates page" is chosen.
// Runs before anything else so the page switches instantly.
try {
  if ((localStorage.getItem('scStartPage') || 'google') === 'google') location.replace('https://www.google.com/');
} catch {}
