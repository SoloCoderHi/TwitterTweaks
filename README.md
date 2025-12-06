# 🐦 Twitter Tweek

> A powerful browser extension to enhance your Twitter/X experience with ad blocking, media downloads, UI customization, and more!

[![Version](https://img.shields.io/badge/version-5.1-blue.svg)](https://github.com/yourusername/twitter-tweek)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## ✨ Features

### 🧹 Timeline Cleanup
- **Block Promoted Tweets** - Remove ads at API level for a cleaner timeline
- **Hide "Who to Follow"** - Remove follow suggestions from your feed
- **Hide "Topics to Follow"** - Remove topic suggestions
- **Hide Premium Upsells** - Remove X Premium subscription prompts
- **Hide Grok AI** - Remove Grok buttons and links
- **Hide View Counts** - Remove analytics/views under tweets (optional)
- **Clean Explore Page** - Show only search bar, hide trending suggestions

### 📥 Media Downloads
- **Download Buttons** - Adds download icon to all tweets with media (images, videos, GIFs)
- **Share Menu Download** - Adds "Download Media" option to the share menu
- **Smart Naming** - Downloads are saved as `Username_TweetID_Index.ext`
- **Batch Download** - Download all media from a tweet at once
- **Quoted Tweet Support** - Downloads media from both main and quoted tweets

### 🎨 Customization
- **Blue Bird Logo** - Restore the classic Twitter bird logo (replaces X)
- **Custom Navigation** - 
  - Notifications → Bookmarks
  - Messages → Profile
- **Tweet Source Display** - Show the app/device used to post tweets
- **Account Location** - Display user location in focused tweets
- **Hide Floating Compose Button** - Remove the blue "Post" button at bottom-right

## 🚀 Installation

### Chrome/Edge/Brave (Manual Installation)
1. Download or clone this repository
2. Open your browser and navigate to:
   - **Chrome**: `chrome://extensions/`
   - **Edge**: `edge://extensions/`
   - **Brave**: `brave://extensions/`
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked**
5. Select the extension folder
6. The extension is now installed! Visit [twitter.com](https://twitter.com) or [x.com](https://x.com)

### Firefox (Coming Soon)
Firefox support is planned for future releases.

## 📖 Usage

### Quick Start
1. Install the extension
2. Visit [twitter.com](https://twitter.com) or [x.com](https://x.com)
3. The extension works automatically with default settings
4. To customize, click the extension icon or visit the options page

### Downloading Media
**Method 1: Download Button**
- Look for the download icon (↓) in the tweet action bar
- Click to download all media from that tweet

**Method 2: Share Menu**
- Click the share icon on any tweet
- Select "Download Media" from the menu
- Works for all media types including single videos

### Configuring Settings
1. Right-click the extension icon and select "Options"
2. Toggle features on/off as desired
3. Refresh Twitter tabs to apply changes

## 🛠️ Technical Details

### Architecture
- **Manifest V3** - Modern extension architecture
- **Content Script (MAIN world)** - Intercepts Twitter API responses and modifies UI
- **Content Script (ISOLATED world)** - Handles settings and downloads
- **Background Service Worker** - Manages file downloads with smart naming

### Key Technologies
- Native JavaScript (no dependencies)
- Chrome Extensions API
- DOM Mutation Observers
- XMLHttpRequest/Fetch Interceptors
- Chrome Storage API

### File Structure
```
twitter-tweek/
├── manifest.json          # Extension configuration
├── content.js            # Main content script (MAIN world)
├── bridge.js             # Bridge script (ISOLATED world)
├── background.js         # Service worker for downloads
├── options.html          # Settings page UI
├── options.js            # Settings page logic
├── icons/                # Extension icons
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   └── icon-128.png
└── README.md            # This file
```

## 🔒 Privacy & Security

- **No data collection** - All processing happens locally in your browser
- **No external requests** - Only communicates with Twitter/X domains
- **No analytics or tracking** - Your browsing remains private
- **Open source** - Audit the code yourself!

### Permissions Explained
- `downloads` - Required to download media files
- `storage` - Stores your settings preferences locally
- `*.twitter.com/*`, `*.x.com/*` - Only runs on Twitter/X domains

## 🐛 Known Issues & Limitations

- Some features may break with Twitter/X UI updates (we update regularly)
- Download feature requires tweets to be visible/loaded before downloading
- Share menu download works best after scrolling past the tweet once

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 Changelog

### v5.1 (Current)
- API-level ad filtering
- Enhanced media download with share menu support
- Tweet source and location display
- Navigation customization
- Blue bird logo restoration
- Multiple UI improvements

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This extension is not affiliated with, endorsed by, or sponsored by Twitter, Inc. or X Corp. Use at your own discretion. Twitter/X's terms of service apply.

## 💡 Support

If you encounter issues:
1. Try disabling other extensions to check for conflicts
2. Refresh the page or restart your browser
3. Check if Twitter/X has updated their UI
4. Open an issue on GitHub with details

## 🌟 Star This Repo

If you find this extension useful, please consider starring the repository! It helps others discover it.

---

**Made with 💙 for a better Twitter/X experience**
