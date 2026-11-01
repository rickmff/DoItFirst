# doitfirst

A Chrome extension that makes you finish your todo list before you can use social media (Twitter/X, YouTube, Instagram, TikTok), then limits how long you stay.

## Features

- **Task Gate**: A modal covers the site until you add tasks and complete all of them
- **Time Limiting**: A configurable timer (25 minutes by default) brings the modal back when it ends
- **Shared Session**: The time left is kept per site, so reloading or opening a new tab doesn't refill it
- **Background Playback Counts**: A hidden tab only pauses the timer if nothing is playing in it
- **One Task per Session**: When the time runs out, a new task has to be added and completed to continue
- **Media Pausing**: Videos stop and fullscreen closes while the modal is open
- **Hide YouTube Shorts**: Removes Shorts from the feed, search and sidebar, and opens Shorts links in the normal player
- **Hide YouTube Distractions**: Removes the home feed and the recommended videos around the player
- **Persistent Storage**: Your todos and settings sync through your Chrome account
- **Keyboard Shortcuts**: Add, navigate, complete and delete tasks without the mouse

## Installation

### From Chrome Web Store (Coming Soon)

1. Visit the Chrome Web Store page for doitfirst
2. Click "Add to Chrome"
3. Confirm the installation

### Manual Installation (Developer Mode)

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the folder containing the extension files
5. The extension should now be installed and active

> **Note:** The extension currently doesn't include icon files. If you want to add icons, create PNG files named icon16.png, icon48.png, and icon128.png in the icons directory, and then add the icons section back to the manifest.json file.

## Usage

1. Visit any supported site (Twitter/X, YouTube, Instagram, TikTok)
2. Add tasks in the modal and check them off
3. Click "Continue" once all tasks are complete to start the timer
4. When the timer ends, the modal comes back and asks for a new task
5. Use the gear icon or the extension's options page to change the timer, the enabled sites and what gets hidden on YouTube

## Customization

You can modify the following files to customize the extension:

- `content.js`: Main functionality
- `styles.css`: Visual appearance
- `youtube.js` and `youtube.css`: YouTube-only tweaks, such as hiding Shorts
- `manifest.json`: Extension configuration

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. 