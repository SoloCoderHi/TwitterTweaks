/**
 * Twitter Tweek v5.3 - Options Page Script
 */

const defaults = {
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
  restoreTweetSource: true,
  showAccountLocation: true,
  hideFloatingButton: true,
  hideDiscoverMore: false,
  enableVideoLoop: false,
  enableVideoAutoplay: false,
  hideTopLive: false,
  hideTodaysNews: false,
  hideBookmarksButton: false,
};

// Display version
document.getElementById("version").textContent =
  "Version " + chrome.runtime.getManifest().version;

function showStatus(message) {
  const status = document.getElementById("status");
  status.textContent = message;
  setTimeout(() => {
    status.textContent = "";
  }, 2500);
}

function saveOptions() {
  const settings = {};
  for (const key in defaults) {
    const el = document.getElementById(key);
    if (el) {
      if (el.type === "checkbox") {
        settings[key] = el.checked;
      } else if (el.type === "color") {
        settings[key] = el.value;
      } else {
        settings[key] = el.value;
      }
    }
  }

  chrome.storage.local.set(settings, () => {
    if (chrome.runtime.lastError) {
      showStatus("❌ Failed to save");
    } else {
      showStatus("✓ Saved! Refresh Twitter to apply.");
    }
  });
}

function restoreOptions() {
  chrome.storage.local.get(defaults, (items) => {
    for (const key in defaults) {
      const el = document.getElementById(key);
      if (el) {
        if (el.type === "checkbox") {
          el.checked = items[key];
        } else if (el.type === "color") {
          el.value = items[key] || defaults[key];
        } else {
          el.value = items[key];
        }
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  restoreOptions();

  const checkboxes = document.querySelectorAll("input[type='checkbox']");
  for (const checkbox of checkboxes) {
    checkbox.addEventListener("change", saveOptions);
  }

  const colorPickers = document.querySelectorAll("input[type='color']");
  for (const picker of colorPickers) {
    picker.addEventListener("change", saveOptions);
  }
});
