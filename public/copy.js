document.addEventListener('DOMContentLoaded', function () {
  var btn = document.querySelector('.copy-btn');
  if (!btn) return;
  btn.addEventListener('click', function () {
    var cmd = btn.getAttribute('data-copy');
    if (!cmd) return;
    navigator.clipboard.writeText(cmd).then(function () {
      btn.textContent = '✓';
      btn.classList.add('copied');
      setTimeout(function () {
        btn.textContent = '⧉';
        btn.classList.remove('copied');
      }, 1500);
    });
  });
});
