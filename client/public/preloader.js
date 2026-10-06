// Preloader helpers for index.html. Kept in a file (not inline) because the
// production Content-Security-Policy only allows scripts from the site itself.
(function () {
  // Match the saved theme before the first paint.
  try {
    if (localStorage.getItem('aii_theme') === 'dark') document.documentElement.classList.add('pl-dark');
  } catch (e) {}

  document.addEventListener('DOMContentLoaded', function () {
    var el = document.getElementById('preloader');
    if (!el) return;
    el.querySelector('.pl-retry').addEventListener('click', function () {
      location.reload();
    });
    // If the app hasn't taken over after 20s (slow network, server down),
    // say so and offer a reload instead of spinning forever.
    setTimeout(function () {
      if (!document.body.contains(el) || el.classList.contains('pl-done')) return;
      el.classList.add('pl-slow');
      el.querySelector('.pl-sub').textContent = 'This is taking longer than usual. Check your connection and reload.';
    }, 20000);
  });
})();
