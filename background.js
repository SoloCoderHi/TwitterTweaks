/**
 * Twitter Tweek - Background Service Worker
 * Handles file downloads with smart naming
 */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "DOWNLOAD") {
    handleDownload(msg.data);
    sendResponse({ success: true });
  }
  return true; // Keep message channel open for async response
});

async function handleDownload({ user, id, media }) {
  if (!media || media.length === 0) {
    console.warn("No media to download");
    return;
  }

  console.log(`📥 Downloading ${media.length} file(s) from @${user}`);

  for (let i = 0; i < media.length; i++) {
    const item = media[i];
    let url = item.url;

    // Determine file extension based on type and URL
    let ext = "jpg"; // default

    if (
      item.type === "video" ||
      url.includes(".mp4") ||
      url.includes("video")
    ) {
      ext = "mp4";
    } else if (item.type === "gif" || url.includes(".gif")) {
      // Twitter GIFs are actually MP4s
      ext = "mp4";
    } else if (url.includes(".png")) {
      ext = "png";
    } else if (url.includes(".webp")) {
      ext = "webp";
    }

    // Clean URL - remove query parameters and :orig suffix for extension detection
    const cleanUrl = url.split("?")[0].replace(/:orig$/, "");

    // Check URL extension as fallback
    const urlExt = cleanUrl.split(".").pop()?.toLowerCase();
    if (
      urlExt &&
      ["jpg", "jpeg", "png", "gif", "mp4", "webp"].includes(urlExt)
    ) {
      if (urlExt === "jpeg") ext = "jpg";
      else if (urlExt !== "gif") ext = urlExt; // Keep gif as mp4
    }

    // Smart filename: Username_TweetID_Index.ext
    const index = media.length > 1 ? `_${i + 1}` : "";
    const filename = `TwitterTweek/${sanitizeFilename(
      user
    )}_${id}${index}.${ext}`;

    try {
      await chrome.downloads.download({
        url: url,
        filename: filename,
        conflictAction: "uniquify", // Add (1), (2) etc if file exists
      });
      console.log(`✅ Downloaded: ${filename}`);
    } catch (error) {
      console.error(`❌ Failed to download: ${url}`, error);
    }
  }
}

// Sanitize filename to remove invalid characters
function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, "_").substring(0, 50);
}

// Handle extension installation/update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("🐦 Twitter Tweek installed!");
    // Open options page on first install
    chrome.runtime.openOptionsPage();
  } else if (details.reason === "update") {
    console.log(
      `🐦 Twitter Tweek updated to v${chrome.runtime.getManifest().version}`
    );
  }
});
