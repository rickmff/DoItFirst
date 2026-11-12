# Contributing

Pull requests are welcome. For anything larger than a fix, open an issue first so the approach can be agreed on.

## Running it

There is no build step.

1. Open `chrome://extensions` and turn on **Developer mode**
2. Click **Load unpacked** and select the repository folder
3. After changing a file, click the reload icon on the extension and reload the site

## Where things are

- `content.js` and `styles.css`: the task list, the timer and the settings panel, on every supported site
- `youtube.js` and `youtube.css`: what gets hidden on YouTube. It runs at `document_start` so hidden sections never flash on screen
- `options.html` and `options.js`: the options page
- `manifest.json`: sites, permissions and scripts

## Ground rules

- **No tracking**: no telemetry, no remote code, no server. See [PRIVACY.md](PRIVACY.md)
- **No loopholes**: the timer must not be refillable by reloading, opening a tab or changing a setting
- **Leave the site alone**: styles are scoped to `.doitfirst-element`, and site hotkeys are only intercepted while the task list is open
- **Text from the user goes in with `textContent`**, never `innerHTML`

## Before opening a pull request

Check by hand, on the site you touched, that the task list blocks the page, that completing the tasks starts the timer, and that the page works normally afterwards.

## Roadmap

1. Split `content.js` into modules with tests, and isolate the interface in a Shadow DOM
2. A filter for YouTube recommendations by topic, running locally or with your own API key
3. An intent mode: say what you came for and see only that
4. Focus tools for X, Instagram and TikTok
