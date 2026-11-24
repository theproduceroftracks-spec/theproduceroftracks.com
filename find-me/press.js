/* Press links reuse the existing campaign tracker. No personal recipient data or new service.
   Presentation only: these public links are shareable, not an access-control mechanism. */
(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  const outlet = params.get('utm_content') || '';
  const press = params.get('utm_source') === 'editorial' &&
    params.get('utm_medium') === 'press' &&
    params.get('utm_campaign') === 'find_me_press' &&
    /^outlet-[a-z0-9][a-z0-9-]{0,63}$/.test(outlet);
  const panel = document.getElementById('press-download');
  if (press && panel) panel.hidden = false;
  // The existing tracker records the anchor as outbound, labelled press-album-download.
  // A click is not recorded as a completed download or proof of listening.
})();
