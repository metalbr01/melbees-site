/* Video facade: the page ships a plain link with a thumbnail. Only a click loads the privacy-enhanced YouTube
   player, and only for a well-formed video id. Nothing here runs before that click. */
(function () {
  var ID = /^[A-Za-z0-9_-]{11}$/;
  function play(event) {
    var link = event.currentTarget;
    var id = link.getAttribute('data-video-id') || '';
    if (!ID.test(id) || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button) return; // malformed id: let the link open YouTube normally
    var box = link.parentNode;
    if (box.querySelector('iframe')) { event.preventDefault(); return; }
    event.preventDefault();
    var frame = document.createElement('iframe');
    frame.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&playsinline=1';
    frame.title = link.getAttribute('data-title') || 'YouTube';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.setAttribute('allowfullscreen', '');
    frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    box.replaceChild(frame, link);
    frame.focus();
  }
  var links = document.querySelectorAll('.video-play');
  for (var i = 0; i < links.length; i++) links[i].addEventListener('click', play);
})();
