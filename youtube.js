/**
 * doitfirst - YouTube tweaks
 * Runs at document_start so hidden sections don't flash on screen first.
 * The hiding itself lives in youtube.css, switched on by attributes on <html>.
 */
(() => {
  const TWEAKS = {
    hideShorts: 'data-doitfirst-hide-shorts',
    hideHomeFeed: 'data-doitfirst-hide-home-feed',
    hideRecommendations: 'data-doitfirst-hide-recommendations'
  };

  const defaults = Object.fromEntries(Object.keys(TWEAKS).map(option => [option, true]));
  let hideShorts = false;

  // Opens a Short in the normal player, or leaves the Shorts feed altogether
  function redirectShorts() {
    const match = location.pathname.match(/^\/shorts(?:\/([\w-]+))?\/?$/);

    if (hideShorts && match) {
      location.replace(match[1] ? `/watch?v=${match[1]}` : '/');
    }
  }

  function setTweak(option, value) {
    document.documentElement.toggleAttribute(TWEAKS[option], value);

    if (option === 'hideShorts') {
      hideShorts = value;
      redirectShorts();
    }
  }

  chrome.storage.sync.get(defaults, (items) => {
    Object.keys(TWEAKS).forEach(option => setTweak(option, items[option]));
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;

    Object.keys(TWEAKS)
      .filter(option => changes[option])
      .forEach(option => setTweak(option, changes[option].newValue));
  });

  // YouTube is a single page app: moving between pages doesn't reload this script
  document.addEventListener('yt-navigate-finish', redirectShorts);
})();
