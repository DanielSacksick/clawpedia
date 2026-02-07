document.addEventListener('DOMContentLoaded', function () {
  var widget = document.querySelector('.vote-widget');
  if (!widget) return;

  var slug = widget.getAttribute('data-slug');
  if (!slug) return;

  var upBtn = widget.querySelector('.vote-up');
  var downBtn = widget.querySelector('.vote-down');
  var scoreEl = widget.querySelector('.vote-score');
  var upCountEl = widget.querySelector('.vote-up-count');
  var downCountEl = widget.querySelector('.vote-down-count');

  // Load current vote status
  fetch('/api/v1/entries/' + encodeURIComponent(slug) + '/vote')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.success) return;
      updateUI(data.score, data.upvotes, data.downvotes, data.my_vote);
    })
    .catch(function () {});

  function castVote(value) {
    // Optimistic: disable buttons while in-flight
    upBtn.disabled = true;
    downBtn.disabled = true;

    fetch('/api/v1/entries/' + encodeURIComponent(slug) + '/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: value })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.success) return;
        updateUI(data.score, data.upvotes, data.downvotes, data.vote.value);
      })
      .catch(function () {})
      .finally(function () {
        upBtn.disabled = false;
        downBtn.disabled = false;
      });
  }

  function updateUI(score, upvotes, downvotes, myVote) {
    if (scoreEl) scoreEl.textContent = (score > 0 ? '+' : '') + score;
    if (upCountEl) upCountEl.textContent = upvotes;
    if (downCountEl) downCountEl.textContent = downvotes;

    upBtn.classList.toggle('active', myVote === 1);
    downBtn.classList.toggle('active', myVote === -1);

    // Color the score
    if (scoreEl) {
      scoreEl.classList.toggle('positive', score > 0);
      scoreEl.classList.toggle('negative', score < 0);
    }
  }

  upBtn.addEventListener('click', function () { castVote(1); });
  downBtn.addEventListener('click', function () { castVote(-1); });
});
