# doitfirst

A Chrome extension that replaces social media feeds (Twitter/X, YouTube, Instagram, TikTok) with a productivity-focused todo list and limits scrolling time.

## Features

- **Feed Replacement**: Replaces social media feeds with a clean, modern todo list
- **Time Limiting**: Automatically limits scrolling time to 5 minutes (configurable)
- **Todo Management**: Add, complete, and delete tasks
- **Filtering**: Filter tasks by all, active, or completed
- **Persistent Storage**: Your todos are saved between sessions
- **Multi-platform**: Works on Twitter/X, YouTube, Instagram, and TikTok

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

1. Visit any supported social media site (Twitter/X, YouTube, Instagram, TikTok)
2. The feed will automatically be replaced with the todo list
3. Add new tasks using the input field at the top
4. Click the checkbox to mark tasks as completed
5. Use the filter buttons to view different task states
6. The timer will start when you begin scrolling
7. When the time limit is reached, scrolling will be disabled
8. Click "Reset Timer" to reset the time limit or "Add 5 More Minutes" when prompted

## Customization

You can modify the following files to customize the extension:

- `content.js`: Main functionality
- `styles.css`: Visual appearance
- `manifest.json`: Extension configuration

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. 