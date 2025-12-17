/**
 * Twitter Tweek v5.2 - Bridge Script (ISOLATED World)
 */

console.log("🌉 Twitter Tweek Bridge v5.2: Starting...");

const DEFAULT_SETTINGS = {
  enableDownloads: true,
  enableShareBackup: true,
  hideAds: true,
  hideWhoToFollow: true,
  hideTopicsToFollow: true,
  hideGrok: true,
  hideViews: false,
  hidePremiumUpsells: true,
  hideExploreContent: true,
  blueBird: true,
  cleanNav: true,
  restoreTweetSource: false,
  showAccountLocation: true,
  hideFloatingButton: true,
  hideDiscoverMore: false,
  enableVideoLoop: false,
  enableVideoAutoplay: false,
  hideTopLive: false,
  hideTodaysNews: false,
  showBookmarkButton: true,
  hideWhoToFollowSidebar: false,
};

async function loadAndSendSettings() {
  try {
    const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
    window.dispatchEvent(
      new CustomEvent("TWEEK_SETTINGS", { detail: settings })
    );
  } catch (error) {
    window.dispatchEvent(
      new CustomEvent("TWEEK_SETTINGS", { detail: DEFAULT_SETTINGS })
    );
  }
}

window.addEventListener("TWEEK_REQUEST_SETTINGS", () => loadAndSendSettings());

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local") loadAndSendSettings();
});

// Download handler
window.addEventListener("TWEEK_DOWNLOAD", async (e) => {
  const { id, user, media } = e.detail;

  console.log("🌉 Bridge: Download event received", {
    id,
    user,
    mediaCount: media?.length,
  });

  if (!media || media.length === 0) {
    console.warn("🌉 Bridge: No media to download");
    return;
  }

  try {
    console.log("🌉 Bridge: Sending to background.js...");
    const response = await chrome.runtime.sendMessage({
      type: "DOWNLOAD",
      data: { id, user, media },
    });
    console.log("🌉 Bridge: Background response:", response);
  } catch (error) {
    console.error(
      "🌉 Bridge: Failed to send to background, using fallback",
      error
    );
    // Fallback: open URLs
    for (const item of media) {
      window.open(item.url, "_blank");
    }
  }
});

// Initialize
loadAndSendSettings();
setTimeout(loadAndSendSettings, 500);
setTimeout(loadAndSendSettings, 2000);
console.log("🌉 Twitter Tweek Bridge v5.2: Ready!");
