/**
 * Twitter Tweek v5.3 - Content Script (MAIN World)
 *
 * Features:
 * - API-level ad/promotion filtering
 * - Download button on tweets (timeline + focused)
 * - Share menu download option for ALL media including single videos
 * - Mobile bottom nav bar customization
 * - Tweet source label restoration
 * - Account location in focused tweets
 * - Explore page cleanup
 * - Hide Grok, views, premium upsells
 * - Blue bird logo restoration
 * - Video loop & autoplay options
 * - Hide Discover More, Top Live, Today's News
 * - Fixed video scrollbar visibility
 *
 * CSP-Safe: No inline event handlers
 */

console.log("🐦 Twitter Tweek v5.3: Initializing...");

// ==========================================
// CONFIGURATION
// ==========================================
let config = {
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
  fixVideoScrollbar: true,
  videoScrollbarColor: "#ffffff",
  hideBookmarksButton: false,
};

let styleElement = null;
let isInitialized = false;
const mediaCache = new Map();
const locationCache = new Map();
let currentScreenName = null;
let currentTweetId = null;
let lastClickedTweetId = null; // Track which tweet's share was clicked

// ==========================================
// SETTINGS RECEIVER
// ==========================================
window.addEventListener("TWEEK_SETTINGS", function (e) {
  console.log("⚙️ Twitter Tweek: Settings received", e.detail);
  config = { ...config, ...e.detail };
  applyStyles();
});

// ==========================================
// API RESPONSE FILTERING
// ==========================================
const FILTER_ENTRY_PATTERNS = [
  "promoted-tweet",
  "promotedTweet",
  "who-to-follow",
  "whoToFollow",
  "topics-to-follow",
  "topicsToFollow",
  "communities-to-join",
  "communitiesToJoin",
  "creators-to-subscribe",
  "creatorsToSubscribe",
  "cursor-show-more-threads",
];

function shouldFilterEntry(entryId) {
  if (!entryId) return false;
  const id = entryId.toLowerCase();

  if (config.hideAds) {
    if (id.includes("promoted")) {
      console.log("🚫 Filtered promoted:", entryId);
      return true;
    }
  }

  if (config.hideWhoToFollow || config.hideTopicsToFollow) {
    for (const pattern of FILTER_ENTRY_PATTERNS) {
      if (id.includes(pattern.toLowerCase())) {
        console.log("🚫 Filtered suggestion:", entryId);
        return true;
      }
    }
  }

  return false;
}

function filterTimelineData(obj, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 30) return obj;

  if (Array.isArray(obj)) {
    return obj
      .filter((item) => {
        const entryId = item?.entryId || item?.entry?.entryId;
        return !shouldFilterEntry(entryId);
      })
      .map((item) => filterTimelineData(item, depth + 1));
  }

  const result = {};
  for (const key of Object.keys(obj)) {
    if (key === "entries" && Array.isArray(obj[key])) {
      result[key] = obj[key]
        .filter((entry) => !shouldFilterEntry(entry?.entryId))
        .map((entry) => filterTimelineData(entry, depth + 1));
    } else if (key === "instructions" && Array.isArray(obj[key])) {
      result[key] = obj[key].map((instruction) => {
        if (instruction.entries) {
          return {
            ...instruction,
            entries: instruction.entries
              .filter((entry) => !shouldFilterEntry(entry?.entryId))
              .map((entry) => filterTimelineData(entry, depth + 1)),
          };
        }
        return filterTimelineData(instruction, depth + 1);
      });
    } else {
      result[key] = filterTimelineData(obj[key], depth + 1);
    }
  }
  return result;
}

// ==========================================
// MEDIA & DATA EXTRACTION
// ==========================================

// Cache for user data (location, etc.) by username
const userDataCache = new Map();
// Cache for tweet data (source, user info) by tweet ID
const tweetDataCache = new Map();

function extractMediaFromData(obj, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 25) return;

  // Extract tweet data from any tweet object (with or without media)
  extractTweetData(obj);

  const entities =
    obj.extended_entities?.media || obj.legacy?.extended_entities?.media;
  if (entities && entities.length > 0) {
    const tweetId =
      obj.id_str ||
      obj.rest_id ||
      obj.legacy?.id_str ||
      obj.conversation_id_str;

    let username = "twitter_user";
    let location = null;
    let source = null;

    if (obj.core?.user_results?.result?.legacy?.screen_name) {
      username = obj.core.user_results.result.legacy.screen_name;
      location = obj.core.user_results.result.legacy.location;
    } else if (obj.user?.screen_name) {
      username = obj.user.screen_name;
      location = obj.user.location;
    } else if (obj.legacy?.user?.screen_name) {
      username = obj.legacy.user.screen_name;
      location = obj.legacy.user.location;
    }

    // Extract tweet source
    if (obj.source) {
      source = obj.source;
      const sourceMatch = source.match(/>([^<]+)</);
      if (sourceMatch) source = sourceMatch[1];
    } else if (obj.legacy?.source) {
      source = obj.legacy.source;
      const sourceMatch = source.match(/>([^<]+)</);
      if (sourceMatch) source = sourceMatch[1];
    }

    if (tweetId) {
      const mediaFiles = entities.map((m) => {
        let url = m.media_url_https;
        let type = m.type;
        let thumbnail = m.media_url_https;

        if (m.video_info?.variants) {
          const videos = m.video_info.variants
            .filter((v) => v.content_type === "video/mp4")
            .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
          if (videos.length > 0) {
            url = videos[0].url.split("?")[0];
            type = m.type === "animated_gif" ? "gif" : "video";
          }
        } else if (m.type === "photo") {
          url = m.media_url_https + ":orig";
          type = "photo";
        }

        return { type, url, thumbnail };
      });

      const cacheData = { user: username, media: mediaFiles };
      if (source) cacheData.source = source;

      mediaCache.set(tweetId, cacheData);

      if (location) {
        locationCache.set(tweetId, location);
      }

      entities.forEach((m) => {
        if (m.media_url_https) {
          const thumbKey = m.media_url_https.replace(
            /:large|:orig|:small|:medium/g,
            ""
          );
          mediaCache.set("thumb:" + thumbKey, tweetId);
        }
      });
    }
  }

  // Handle quoted tweets
  if (obj.quoted_status_result?.result) {
    extractMediaFromData(obj.quoted_status_result.result, depth + 1);
  }
  if (obj.legacy?.quoted_status) {
    extractMediaFromData(obj.legacy.quoted_status, depth + 1);
  }

  // Recursively search
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      extractMediaFromData(obj[key], depth + 1);
    }
  }
}

// Extract tweet data (location, source) from ALL tweets, not just media tweets
function extractTweetData(obj) {
  if (!obj || typeof obj !== "object") return;

  // Check if this is a tweet object
  const tweetId = obj.rest_id || obj.id_str || obj.legacy?.id_str;
  if (!tweetId) return;

  // Skip if already cached
  if (tweetDataCache.has(tweetId)) return;

  let username = null;
  let location = null;
  let source = null;

  // Extract user data from various API response structures
  const userResult = obj.core?.user_results?.result;
  if (userResult) {
    const userLegacy = userResult.legacy;
    if (userLegacy) {
      username = userLegacy.screen_name;
      location = userLegacy.location;
      // Cache user data by username for later lookup
      if (username && location) {
        userDataCache.set(username.toLowerCase(), {
          location,
          name: userLegacy.name,
        });
      }
    }
  } else if (obj.user) {
    username = obj.user.screen_name;
    location = obj.user.location;
    if (username && location) {
      userDataCache.set(username.toLowerCase(), {
        location,
        name: obj.user.name,
      });
    }
  }

  // Extract source
  const rawSource = obj.source || obj.legacy?.source;
  if (rawSource) {
    const sourceMatch = rawSource.match(/>([^<]+)</);
    source = sourceMatch ? sourceMatch[1] : rawSource;
  }

  // Cache tweet data
  if (username || source) {
    tweetDataCache.set(tweetId, { username, source });
  }

  // Make sure location is in locationCache too
  if (location && location.trim()) {
    locationCache.set(tweetId, location);
  }
}

// ==========================================
// NETWORK INTERCEPTOR
// ==========================================
function startInterceptor() {
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._tweekUrl = url;
    return originalXHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    const xhr = this;
    const url = this._tweekUrl || "";

    const isApiEndpoint =
      /(api\.)?(twitter|x)\.com\/(i\/api\/)?(2|graphql|1\.1)\//i.test(url);

    if (isApiEndpoint) {
      const origOnReadyStateChange = xhr.onreadystatechange;

      xhr.onreadystatechange = function () {
        if (this.readyState === 4) {
          try {
            const contentType = this.getResponseHeader("content-type");
            if (
              contentType &&
              contentType.includes("application/json") &&
              this.responseText
            ) {
              const data = JSON.parse(this.responseText);
              extractMediaFromData(data);
            }
          } catch (e) {}
        }
        if (origOnReadyStateChange) {
          origOnReadyStateChange.apply(this, arguments);
        }
      };

      // For timeline endpoints, filter the response
      const isTimelineEndpoint =
        url.includes("/HomeTimeline") ||
        url.includes("/UserTweets") ||
        url.includes("/TweetDetail") ||
        url.includes("/SearchTimeline") ||
        url.includes("/ListLatestTweetsTimeline");

      if (isTimelineEndpoint) {
        try {
          Object.defineProperty(xhr, "responseText", {
            get: function () {
              const original = Object.getOwnPropertyDescriptor(
                XMLHttpRequest.prototype,
                "responseText"
              ).get.call(this);
              if (this.readyState === 4 && original) {
                try {
                  const data = JSON.parse(original);
                  extractMediaFromData(data);
                  const filtered = filterTimelineData(data);
                  return JSON.stringify(filtered);
                } catch (e) {}
              }
              return original;
            },
          });
        } catch (e) {}
      }
    }

    return originalXHRSend.apply(this, arguments);
  };

  // Intercept fetch too
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = args[0]?.url || args[0] || "";
    const response = await originalFetch.apply(this, args);

    try {
      if (typeof url === "string" && /(api\.)?(twitter|x)\.com/i.test(url)) {
        const clone = response.clone();
        const data = await clone.json();
        extractMediaFromData(data);
      }
    } catch (e) {}

    return response;
  };

  console.log("🔌 Twitter Tweek: Network interceptor active");
}

// ==========================================
// CSS INJECTION
// ==========================================
function applyStyles() {
  if (styleElement) styleElement.remove();

  let css = `
    /* Download Button Styles */
    .tweek-dl-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 34.75px;
      min-height: 34.75px;
      width: auto;
      height: auto;
      border-radius: 9999px;
      transition: background-color 0.2s;
      cursor: pointer;
      border: none;
      background: transparent;
      padding: 0px 8px;
      margin: 0;
      box-sizing: border-box;
    }
    .tweek-dl-btn:hover {
      background-color: rgba(29, 155, 240, 0.1);
    }
    .tweek-dl-btn svg {
      width: 18.75px;
      height: 18.75px;
      fill: rgb(113, 118, 123);
      transition: fill 0.2s;
      display: block;
    }
    .tweek-dl-btn:hover svg {
      fill: rgb(29, 155, 240);
    }
    .tweek-dl-btn.loading svg {
      animation: tweek-spin 0.8s linear infinite;
    }
    .tweek-dl-btn.success svg {
      fill: rgb(0, 186, 124);
    }
    @keyframes tweek-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    
    /* Larger download button for focused/expanded tweets */
    article[tabindex="-1"] .tweek-dl-btn,
    [data-testid="tweet"] .tweek-dl-btn {
      min-width: 40px;
      min-height: 40px;
      padding: 0px 10px;
    }
    
    article[tabindex="-1"] .tweek-dl-btn svg,
    [data-testid="tweet"] .tweek-dl-btn svg {
      width: 22px;
      height: 22px;
    }
    
    /* Add spacing to Reply, Retweet, Like buttons */
    article [role="group"] > div:nth-child(1),
    article [role="group"] > div:nth-child(2),
    article [role="group"] > div:nth-child(3) {
      padding-right: 8px !important;
    }
    
    /* Add proper spacing to Bookmark, Share, and Download buttons */
    article [role="group"] > div:nth-last-child(1),
    article [role="group"] > div:nth-last-child(2),
    article [role="group"] > div:nth-last-child(3) {
      padding-left: 8px !important;
    }
    
    /* Ensure buttons inside have proper spacing */
    article [role="group"] > div:nth-last-child(1) > div,
    article [role="group"] > div:nth-last-child(2) > div,
    article [role="group"] > div:nth-last-child(3) > div {
      margin-left: 8px !important;
    }
    
    /* Share menu download item */
    .tweek-menu-item {
      padding: 12px 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 12px;
      transition: background-color 0.2s;
      color: rgb(231, 233, 234) !important;
    }
    .tweek-menu-item:hover {
      background-color: rgba(239, 243, 244, 0.1);
    }
    .tweek-menu-item svg {
      width: 18px;
      height: 18px;
      fill: rgb(231, 233, 234);
    }
    .tweek-menu-item span {
      font-size: 15px;
      font-weight: 400;
      color: rgb(231, 233, 234);
    }
    
    /* Hide Premium upsells */
    [href="/i/verified-orgs-signup"],
    [href="/settings/monetization"],
    [aria-label="Subscribe to Premium"],
    [href="/i/premium_sign_up"],
    [data-testid="placementTracking"] a[href*="premium"],
    [data-testid="tweetButtonInline"] ~ div[role="button"]:has([href*="premium"]) {
      display: none !important;
    }
  `;

  // Hide Grok
  if (config.hideGrok) {
    css += `
      [href="/i/grok"],
      [data-testid="grok_drawer"],
      [aria-label="Grok"],
      [aria-label="Grok actions"],
      button[aria-label*="Grok"],
      a[href*="/i/grok"],
      nav a[href="/i/grok"],
      [data-testid="grokImgGen"],
      [data-testid="AppTabBar_Grok_Link"] {
        display: none !important;
      }
    `;
  }

  // Hide View Counts
  if (config.hideViews) {
    css += `
      /* Completely remove views button from layout */
      a[href$="/analytics"],
      [data-testid="analyticsButton"],
      article [role="group"] a[href*="/analytics"],
      article [role="group"] > div:has(a[href*="/analytics"]) {
        display: none !important;
      }
      
      /* Also hide the wrapper divs containing analytics links */
      article [role="group"] > div > div:has(a[aria-label*="View"]),
      article [role="group"] > div:has(> div > a[href*="/analytics"]) {
        display: none !important;
      }
    `;
  }

  // Hide Floating Action Button
  if (config.hideFloatingButton) {
    css += `
      /* Hide the compose tweet floating action button */
      a[href="/compose/tweet"],
      a[href="/compose/post"],
      [data-testid="SideNav_NewTweet_Button"] + div a[href="/compose/tweet"],
      [aria-label*="Post"][aria-label*="weet"],
      div[style*="position: fixed"] a[href="/compose/tweet"],
      div[style*="position: fixed"] a[href="/compose/post"] {
        display: none !important;
      }
    `;
  }

  // Hide Discover More
  if (config.hideDiscoverMore) {
    css += `
      /* Hide "Discover more" section in timeline */
      [aria-label*="Discover more"],
      [data-testid="cellInnerDiv"]:has([aria-label*="Discover"]),
      [data-testid="cellInnerDiv"]:has(h2[role="heading"]),
      div[data-testid="primaryColumn"] section:has([aria-label*="Discover"]) {
        display: none !important;
      }
    `;
  }

  // Hide Top Live
  if (config.hideTopLive) {
    css += `
      /* Hide "Top Live" section */
      [aria-label*="Top Live"],
      [aria-label*="Live"][role="group"],
      [data-testid="cellInnerDiv"]:has([aria-label*="Live"]),
      [data-testid="cellInnerDiv"]:has(a[href*="/i/broadcasts"]) {
        display: none !important;
      }
    `;
  }

  // Hide Today's News
  if (config.hideTodaysNews) {
    css += `
      /* Hide "Today's News" / "What's happening" section */
      [aria-label*="Today's News"],
      [aria-label*="What's happening"],
      [data-testid="cellInnerDiv"]:has([aria-label*="news" i]),
      [data-testid="trend"],
      section[aria-labelledby*="accessible-list"]:has([data-testid="trend"]) {
        display: none !important;
      }
    `;
  }

  // Fix Video Scrollbar - Target Twitter's custom video player
  if (config.fixVideoScrollbar) {
    const scrollbarColor = config.videoScrollbarColor || "#ffffff";
    const r = parseInt(scrollbarColor.slice(1, 3), 16);
    const g = parseInt(scrollbarColor.slice(3, 5), 16);
    const b = parseInt(scrollbarColor.slice(5, 7), 16);

    css += `
      /* Twitter's custom video player progress bar */
      div[data-testid="videoPlayer"] div[role="progressbar"],
      div[data-testid="videoPlayer"] input[type="range"],
      div[data-testid="videoComponent"] input[type="range"],
      [data-testid="videoPlayer"] [role="slider"],
      div[aria-label*="video player"] input[type="range"] {
        accent-color: ${scrollbarColor} !important;
      }
      
      /* Video player progress track */
      div[data-testid="videoPlayer"] input[type="range"]::-webkit-slider-track,
      div[data-testid="videoComponent"] input[type="range"]::-webkit-slider-track {
        background: rgba(${r}, ${g}, ${b}, 0.3) !important;
        border: none !important;
      }
      
      /* Video player progress thumb */
      div[data-testid="videoPlayer"] input[type="range"]::-webkit-slider-thumb,
      div[data-testid="videoComponent"] input[type="range"]::-webkit-slider-thumb {
        background: ${scrollbarColor} !important;
        border: 2px solid ${scrollbarColor} !important;
        box-shadow: 0 0 5px rgba(0, 0, 0, 0.5) !important;
      }
      
      /* Firefox support */
      div[data-testid="videoPlayer"] input[type="range"]::-moz-range-track,
      div[data-testid="videoComponent"] input[type="range"]::-moz-range-track {
        background: rgba(${r}, ${g}, ${b}, 0.3) !important;
      }
      
      div[data-testid="videoPlayer"] input[type="range"]::-moz-range-thumb,
      div[data-testid="videoComponent"] input[type="range"]::-moz-range-thumb {
        background: ${scrollbarColor} !important;
        border: 2px solid ${scrollbarColor} !important;
      }
      
      /* Video player progress fill/loaded */
      div[data-testid="videoPlayer"] div[style*="background"],
      div[data-testid="videoComponent"] div[style*="background"] {
        filter: brightness(1.5) !important;
      }
      
      /* Volume slider */
      div[data-testid="videoPlayer"] input[aria-label*="olume"],
      div[data-testid="videoComponent"] input[aria-label*="olume"] {
        accent-color: ${scrollbarColor} !important;
      }
      
      /* Time display */
      div[data-testid="videoPlayer"] span,
      div[data-testid="videoPlayer"] div[style*="color"] {
        color: ${scrollbarColor} !important;
        text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8) !important;
      }
      
      /* Control buttons */
      div[data-testid="videoPlayer"] svg,
      div[data-testid="videoComponent"] svg {
        filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.8)) !important;
      }
      
      /* Enhanced control bar visibility */
      div[data-testid="videoPlayer"] > div,
      div[data-testid="videoComponent"] > div {
        background: linear-gradient(to top, rgba(0, 0, 0, 0.6) 0%, transparent 100%) !important;
      }
    `;
  }

  // Hide Bookmarks Button (in action bar)
  if (config.hideBookmarksButton) {
    css += `
      /* Hide bookmark button in tweet action bar */
      [data-testid="bookmark"],
      [data-testid="removeBookmark"],
      article [role="group"] > div:has([data-testid="bookmark"]),
      article [role="group"] > div:has([data-testid="removeBookmark"]) {
        display: none !important;
      }
    `;
  }

  // Explore page cleanup
  if (config.hideExploreContent) {
    css += `
      /* Hide trending and suggestions on Explore page */
      [aria-label="Timeline: Explore"] [data-testid="trend"],
      [aria-label="Timeline: Explore"] [data-testid="cellInnerDiv"]:has([data-testid="UserCell"]),
      [aria-label="Timeline: Trending now"] section,
      div[aria-label="Timeline: Explore"] > div > div > div:not(:has(form)):not(:has([role="searchbox"])),
      [data-testid="sidebarColumn"] [data-testid="trend"],
      [data-testid="sidebarColumn"] aside section {
        display: none !important;
      }
      /* Keep search bar visible */
      [aria-label="Timeline: Explore"] [role="search"],
      [aria-label="Timeline: Explore"] form,
      [data-testid="SearchBox_Search_Input"] {
        display: block !important;
      }
    `;
  }

  // Blue Bird Logo
  if (config.blueBird) {
    css += `
      /* Replace X logo with Twitter bird */
      h1[role="heading"] a[href="/home"] svg path,
      [data-testid="TopNavLogo"] svg path,
      header svg[viewBox="0 0 24 24"] path {
        d: path("M23.643 4.937c-.835.37-1.732.62-2.675.733.962-.576 1.7-1.49 2.048-2.578-.9.534-1.897.922-2.958 1.13-.85-.904-2.06-1.47-3.4-1.47-2.572 0-4.658 2.086-4.658 4.66 0 .364.042.718.12 1.06-3.873-.195-7.304-2.05-9.602-4.868-.4.69-.63 1.49-.63 2.342 0 1.616.823 3.043 2.072 3.878-.764-.025-1.482-.234-2.11-.583v.06c0 2.257 1.605 4.14 3.737 4.568-.392.106-.803.162-1.227.162-.3 0-.593-.028-.877-.082.593 1.85 2.313 3.198 4.352 3.234-1.595 1.25-3.604 1.995-5.786 1.995-.376 0-.747-.022-1.112-.065 2.062 1.323 4.51 2.093 7.14 2.093 8.57 0 13.255-7.098 13.255-13.254 0-.2-.005-.402-.014-.602.91-.658 1.7-1.477 2.323-2.41z") !important;
        fill: #1d9bf0 !important;
      }
    `;
  }

  styleElement = document.createElement("style");
  styleElement.id = "tweek-styles";
  styleElement.textContent = css;
  (document.head || document.documentElement).appendChild(styleElement);
}

// ==========================================
// DOM OBSERVER
// ==========================================
function startObserver() {
  const processedElements = new WeakSet();

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        // Process tweets (articles)
        const articles =
          node.tagName === "ARTICLE"
            ? [node]
            : node.querySelectorAll("article");
        for (const tweet of articles) {
          if (processedElements.has(tweet)) continue;
          processedElements.add(tweet);

          if (config.enableDownloads) {
            addDownloadButton(tweet);
          }
        }

        // Process modals/focused tweets
        const modals = node.querySelectorAll(
          '[aria-modal="true"], [data-testid="tweet"]'
        );
        for (const modal of modals) {
          if (processedElements.has(modal)) continue;
          processedElements.add(modal);

          if (config.enableDownloads) {
            addDownloadButton(modal);
          }
        }

        // Customize bottom navigation (mobile)
        if (config.cleanNav) {
          customizeBottomNavBar();
          customizeSideNavBar();
        }

        // Share menu injection
        if (config.enableShareBackup) {
          const menus =
            node.getAttribute?.("role") === "menu"
              ? [node]
              : node.querySelectorAll?.('[role="menu"]') || [];
          for (const menu of menus) {
            if (!menu.querySelector(".tweek-menu-item")) {
              injectShareMenuItem(menu);
            }
          }
        }

        // Restore tweet source and location
        if (config.restoreTweetSource || config.showAccountLocation) {
          enhanceFocusedTweet();
        }

        // Process videos for loop and autoplay
        if (config.enableVideoLoop || config.enableVideoAutoplay) {
          const videos =
            node.tagName === "VIDEO" ? [node] : node.querySelectorAll("video");
          for (const video of videos) {
            if (!processedElements.has(video)) {
              processedElements.add(video);
              enhanceVideo(video);
            }
          }
        }

        // Fix video player controls color
        if (config.fixVideoScrollbar) {
          const videoPlayers = node.querySelectorAll(
            '[data-testid="videoPlayer"], [data-testid="videoComponent"]'
          );
          for (const player of videoPlayers) {
            if (!processedElements.has(player)) {
              processedElements.add(player);
              fixVideoPlayerControls(player);
            }
          }
        }
      }
    }
  });

  function startObserving() {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
      console.log("👁️ Twitter Tweek: DOM observer active");

      // Initial customization
      setTimeout(() => {
        customizeBottomNavBar();
        customizeSideNavBar();
      }, 1000);
    } else {
      setTimeout(startObserving, 50);
    }
  }
  startObserving();
}

// ==========================================
// NAVIGATION CUSTOMIZATION (Mobile + Desktop)
// ==========================================
function customizeBottomNavBar() {
  // Mobile bottom nav bar
  const bottomNav = document.querySelector(
    'nav[aria-label="Primary"], nav[role="navigation"]'
  );
  if (!bottomNav) return;

  const navLinks = bottomNav.querySelectorAll('a[role="link"]');

  navLinks.forEach((link) => {
    const href = link.getAttribute("href");

    // Replace Notifications with Bookmarks
    if (
      href &&
      (href.includes("/notifications") || href.includes("/notification"))
    ) {
      if (!link.dataset.tweekModified) {
        link.dataset.tweekModified = "true";
        link.setAttribute("href", "/i/bookmarks");
        link.setAttribute("aria-label", "Bookmarks");

        // Update icon to bookmark
        const svg = link.querySelector("svg");
        if (svg) {
          svg.innerHTML =
            '<g><path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v14.56l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z"></path></g>';
        }

        // Hide badge
        const badge = link.querySelector('[aria-live], [data-testid="badge"]');
        if (badge) badge.style.display = "none";

        // Force navigation on click to prevent reversion
        link.addEventListener(
          "click",
          (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = "/i/bookmarks";
          },
          true
        );
      }
    }

    // Replace Messages with Profile
    if (href && (href.includes("/messages") || href === "/messages")) {
      if (!link.dataset.tweekModified) {
        const username = getMyUsername() || currentScreenName;
        if (username) {
          link.dataset.tweekModified = "true";
          const profilePath = "/" + username;
          link.setAttribute("href", profilePath);
          link.setAttribute("aria-label", "Profile");

          // Update icon to profile
          const svg = link.querySelector("svg");
          if (svg) {
            svg.innerHTML =
              '<g><path d="M5.651 19h12.698c-.337-1.8-1.023-3.21-1.945-4.19C15.318 13.65 13.838 13 12 13s-3.317.65-4.404 1.81c-.922.98-1.608 2.39-1.945 4.19zm.486-5.56C7.627 11.85 9.648 11 12 11s4.373.85 5.863 2.44c1.477 1.58 2.366 3.8 2.632 6.46l.11 1.1H3.395l.11-1.1c.266-2.66 1.155-4.88 2.632-6.46zM12 4c-1.105 0-2 .9-2 2s.895 2 2 2 2-.9 2-2-.895-2-2-2zM8 6c0-2.21 1.791-4 4-4s4 1.79 4 4-1.791 4-4 4-4-1.79-4-4z"></path></g>';
          }

          // Hide badge
          const badge = link.querySelector(
            '[aria-live], [data-testid="badge"]'
          );
          if (badge) badge.style.display = "none";

          // Remove old listeners and add new one
          const newLink = link.cloneNode(true);
          link.parentNode.replaceChild(newLink, link);

          newLink.addEventListener(
            "click",
            (e) => {
              e.preventDefault();
              e.stopPropagation();
              window.location.href = profilePath;
            },
            true
          );
        }
      }
    }
  });
}

function customizeSideNavBar() {
  // Desktop sidebar nav
  const sideNav = document
    .querySelector('[data-testid="primaryColumn"]')
    ?.parentElement?.querySelector("nav");
  if (!sideNav) return;

  const navLinks = sideNav.querySelectorAll("a[href]");

  navLinks.forEach((link) => {
    const href = link.getAttribute("href");

    if (
      href &&
      href.includes("/notifications") &&
      !link.dataset.tweekModified
    ) {
      link.dataset.tweekModified = "true";
      link.setAttribute("href", "/i/bookmarks");

      const textSpan = link.querySelector("span");
      if (textSpan) {
        const text = textSpan.textContent;
        if (
          text &&
          (text.includes("Notification") || text.includes("notification"))
        ) {
          textSpan.textContent = "Bookmarks";
        }
      }
    }
  });
}

function getMyUsername() {
  try {
    // Method 1: React state
    const root = document.querySelector("#react-root");
    if (root) {
      const key = Object.keys(root).find((k) =>
        k.startsWith("__reactContainer")
      );
      if (key) {
        const state =
          root[key]?.memoizedState?.element?.props?.store?.getState?.();
        if (state?.session?.user_id) {
          return state.entities?.users?.entities?.[state.session.user_id]
            ?.screen_name;
        }
      }
    }

    // Method 2: Profile link in nav
    const profileLink = document.querySelector(
      'a[data-testid="AppTabBar_Profile_Link"]'
    );
    if (profileLink) {
      const match = profileLink.href.match(/\/([^\/]+)$/);
      if (match) return match[1];
    }

    // Method 3: Account switcher
    const accountSwitcher = document.querySelector(
      '[data-testid="SideNav_AccountSwitcher_Button"]'
    );
    if (accountSwitcher) {
      const userSpan = accountSwitcher.querySelector('div[dir="ltr"] > span');
      if (userSpan && userSpan.textContent.startsWith("@")) {
        const name = userSpan.textContent.slice(1);
        if (name) currentScreenName = name;
        return name;
      }
    }
  } catch (e) {
    console.log("Could not get username:", e);
  }
  return null;
}

// ==========================================
// DOWNLOAD FUNCTIONALITY
// ==========================================
function addDownloadButton(container) {
  const actionBar = container.querySelector('[role="group"]');
  if (!actionBar || actionBar.querySelector(".tweek-dl-btn")) return;

  // Find tweet ID from any status link
  const statusLink = container.querySelector('a[href*="/status/"]');
  if (!statusLink) return;

  const match = statusLink.href.match(/status\/(\d+)/);
  if (!match) return;

  const tweetId = match[1];

  // Create structure matching Twitter's native buttons
  // Twitter structure: div > div > div > button
  const outerWrapper = document.createElement("div");
  outerWrapper.style.cssText = "display: flex; flex: 1 1 0%;";

  const innerWrapper = document.createElement("div");
  innerWrapper.style.cssText =
    "display: flex; align-items: center; justify-content: flex-start;";

  const buttonContainer = document.createElement("div");
  buttonContainer.style.cssText = "display: flex;";

  const btn = document.createElement("button");
  btn.className = "tweek-dl-btn";
  btn.setAttribute("role", "button");
  btn.setAttribute("aria-label", "Download media");
  btn.innerHTML =
    '<svg viewBox="0 0 24 24"><g><path d="M3 19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-8h-2v8H5v-8H3v8zM13 9v6h-2V9H8l4-5 4 5h-3z"/></g></svg>';

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    downloadMedia(tweetId, btn);
  });

  buttonContainer.appendChild(btn);
  innerWrapper.appendChild(buttonContainer);
  outerWrapper.appendChild(innerWrapper);
  actionBar.appendChild(outerWrapper);
}

function injectShareMenuItem(menu) {
  // Prevent duplicate menu items
  if (menu.querySelector(".tweek-menu-item")) return;

  console.log("🎯 Share menu detected, injecting download option...");

  // SIMPLE APPROACH: Find tweet ID from DOM when menu appears
  let tweetId = null;

  // Try 1: URL (for focused tweets)
  const urlMatch = window.location.href.match(/status\/(\d+)/);
  if (urlMatch) {
    tweetId = urlMatch[1];
    console.log("   Method 1 (URL): Found tweet", tweetId);
  }

  // Try 2: Last clicked (from tracking)
  if (!tweetId && lastClickedTweetId) {
    tweetId = lastClickedTweetId;
    console.log("   Method 2 (Tracking): Found tweet", tweetId);
  }

  // Try 3: Find ANY visible tweet with media
  if (!tweetId) {
    const allTweets = Array.from(document.querySelectorAll("article"));
    for (const tweet of allTweets) {
      const link = tweet.querySelector('a[href*="/status/"]');
      if (link) {
        const match = link.href.match(/status\/(\d+)/);
        if (match) {
          const possibleId = match[1];
          // Check if this tweet has media cached
          if (mediaCache.has(possibleId)) {
            tweetId = possibleId;
            console.log("   Method 3 (Scan): Found tweet with media", tweetId);
            break;
          }
        }
      }
    }
  }

  console.log("   Final tweet ID:", tweetId || "NONE");

  // Create the menu item
  const item = document.createElement("div");
  item.className = "tweek-menu-item";
  item.setAttribute("role", "menuitem");
  item.setAttribute("tabindex", "0");
  item.innerHTML =
    '<svg viewBox="0 0 24 24"><g><path d="M3 19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-8h-2v8H5v-8H3v8zM13 9v6h-2V9H8l4-5 4 5h-3z"/></g></svg><span>Download Media</span>';

  // Store tweet ID in the element
  if (tweetId) {
    item.dataset.tweetId = tweetId;
  }

  item.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    let finalTweetId = e.currentTarget.dataset.tweetId;

    // Try to find tweet ID if not stored
    if (!finalTweetId) {
      const urlMatch2 = window.location.href.match(/status\/(\d+)/);
      if (urlMatch2) finalTweetId = urlMatch2[1];
      else if (lastClickedTweetId) finalTweetId = lastClickedTweetId;
    }

    console.log("📥 Download clicked, tweet ID:", finalTweetId);

    // Close menu
    try {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          keyCode: 27,
          bubbles: true,
          cancelable: true,
        })
      );
      setTimeout(
        () => document.querySelector('[data-testid="app"]')?.click(),
        50
      );
    } catch (err) {}

    await new Promise((resolve) => setTimeout(resolve, 200));

    // Download
    if (finalTweetId && mediaCache.has(finalTweetId)) {
      console.log("✅ Downloading...");
      downloadMedia(finalTweetId);
    } else {
      alert("⏳ Media not ready. Scroll the tweet and try again.");
    }
  });

  // Insert at TOP of menu (before Twitter's premium download option)
  const firstItem = menu.querySelector('[role="menuitem"]');
  if (firstItem && firstItem.parentNode) {
    firstItem.parentNode.insertBefore(item, firstItem);
    console.log("✅ Download option added to share menu");
  } else {
    menu.insertBefore(item, menu.firstChild);
    console.log("✅ Download option added to share menu (fallback)");
  }
}

function downloadMedia(tweetId, btn) {
  const data = mediaCache.get(tweetId);

  if (!data || !data.media || data.media.length === 0) {
    // Try to find media by scanning page images
    const article = document
      .querySelector(`a[href*="/status/${tweetId}"]`)
      ?.closest("article");
    if (article) {
      const imgs = article.querySelectorAll('img[src*="twimg.com/media"]');
      const videos = article.querySelectorAll("video");

      if (imgs.length > 0 || videos.length > 0) {
        // Download directly
        imgs.forEach((img, i) => {
          let url = img.src.replace(/\?.*$/, "").replace(/&name=\w+/, "");
          if (!url.includes(":orig")) url += "?format=jpg&name=orig";
          triggerDownload(url, `twitter_${tweetId}_${i}`);
        });

        videos.forEach((vid, i) => {
          if (vid.src && !vid.src.includes("blob:")) {
            triggerDownload(vid.src, `twitter_${tweetId}_video_${i}`);
          }
        });

        if (btn) {
          btn.classList.add("success");
          setTimeout(() => btn.classList.remove("success"), 2000);
        }
        return;
      }
    }

    alert(
      "⏳ Media not captured yet. Scroll the tweet out of view and back, then try again."
    );
    return;
  }

  if (btn) btn.classList.add("loading");

  // Check for quoted tweet scenario
  const article = document
    .querySelector(`a[href*="/status/${tweetId}"]`)
    ?.closest("article");

  let allMedia = [...data.media];
  let quotedTweetData = null;

  if (article) {
    // Look for quoted tweet within this article
    const quotedTweetLink = article.querySelector(
      '[role="link"] a[href*="/status/"]:not([href*="/' + tweetId + '"])'
    );
    if (quotedTweetLink) {
      const quotedMatch = quotedTweetLink.href.match(/status\/(\d+)/);
      if (quotedMatch) {
        const quotedTweetId = quotedMatch[1];
        quotedTweetData = mediaCache.get(quotedTweetId);

        // Add quoted tweet media to the collection
        if (
          quotedTweetData &&
          quotedTweetData.media &&
          quotedTweetData.media.length > 0
        ) {
          console.log(
            `📎 Found quoted tweet ${quotedTweetId}, downloading both tweets' media`
          );
          allMedia = [...allMedia, ...quotedTweetData.media];
        }
      }
    }
  }

  // Dispatch to bridge for download
  window.dispatchEvent(
    new CustomEvent("TWEEK_DOWNLOAD", {
      detail: {
        id: tweetId,
        user: data.user,
        media: allMedia,
      },
    })
  );

  if (btn) {
    setTimeout(() => {
      btn.classList.remove("loading");
      btn.classList.add("success");
      setTimeout(() => btn.classList.remove("success"), 2000);
    }, 1000);
  }
}

function triggerDownload(url, filename) {
  // Send via event for background.js to handle
  window.dispatchEvent(
    new CustomEvent("TWEEK_DOWNLOAD", {
      detail: {
        id: filename,
        user: "twitter",
        media: [{ url: url, type: url.includes(".mp4") ? "video" : "photo" }],
      },
    })
  );
}

// ==========================================
// VIDEO PLAYER CONTROLS COLOR FIX
// ==========================================
function fixVideoPlayerControls(playerElement) {
  const color = config.videoScrollbarColor || "#ffffff";

  // Find all range inputs (progress bars, volume sliders)
  const rangeInputs = playerElement.querySelectorAll('input[type="range"]');
  rangeInputs.forEach((input) => {
    input.style.accentColor = color;

    // Add custom styling
    const style = document.createElement("style");
    style.textContent = `
      input[type="range"]::-webkit-slider-track {
        background: rgba(255, 255, 255, 0.3) !important;
      }
      input[type="range"]::-webkit-slider-thumb {
        background: ${color} !important;
        border: 2px solid ${color} !important;
      }
    `;
    if (!document.getElementById("tweek-video-range-style")) {
      style.id = "tweek-video-range-style";
      document.head.appendChild(style);
    }
  });

  // Find progress bar divs and force color
  const progressBars = playerElement.querySelectorAll(
    '[role="progressbar"], [role="slider"]'
  );
  progressBars.forEach((bar) => {
    const observer = new MutationObserver(() => {
      const fills = bar.querySelectorAll('div[style*="background"]');
      fills.forEach((fill) => {
        if (fill.style.background && fill.style.background.includes("rgb")) {
          fill.style.background = color;
        }
      });
    });
    observer.observe(bar, { attributes: true, childList: true, subtree: true });
  });

  // Force text color for time displays
  const timeDisplays = playerElement.querySelectorAll("span, div");
  timeDisplays.forEach((el) => {
    if (el.textContent.match(/\d+:\d+/)) {
      el.style.color = color;
      el.style.textShadow = "1px 1px 2px rgba(0, 0, 0, 0.8)";
    }
  });
}

// ==========================================
// VIDEO ENHANCEMENTS
// ==========================================
const processedVideos = new WeakMap();

function enhanceVideo(video) {
  // Prevent duplicate processing
  if (processedVideos.has(video)) return;
  processedVideos.set(video, true);

  // Enable loop playback
  if (config.enableVideoLoop) {
    video.loop = true;
    video.setAttribute("loop", "");
  }

  // DISABLED BY DEFAULT - Only enable if user explicitly wants it
  // The autoplay feature was causing videos to pause unexpectedly
  if (config.enableVideoAutoplay) {
    // Simple autoplay - let Twitter handle the logic
    // Don't interfere with Twitter's native video behavior
    video.setAttribute("autoplay", "");
    video.setAttribute("playsinline", "");
  }
}

// ==========================================
// FOCUSED TWEET ENHANCEMENTS
// ==========================================
function enhanceFocusedTweet() {
  // Find focused/expanded tweet
  const focusedTweet =
    document.querySelector('[data-testid="tweet"][tabindex="-1"]') ||
    document.querySelector('article[data-testid="tweet"]');

  if (!focusedTweet) return;

  // Get Tweet ID
  const statusLink = focusedTweet.querySelector('a[href*="/status/"]');
  if (!statusLink) return;
  const match = statusLink.href.match(/status\/(\d+)/);
  if (!match) return;
  const tweetId = match[1];

  // 1. Restore Tweet Source
  if (config.restoreTweetSource && !focusedTweet.dataset.tweekSource) {
    focusedTweet.dataset.tweekSource = "true";

    // Find the tweet metadata area (where timestamp is)
    const timeElement = focusedTweet.querySelector("time");
    if (timeElement) {
      const timeLink = timeElement.closest("a");
      if (timeLink && timeLink.parentElement) {
        const metadataContainer = timeLink.parentElement;

        // Try to get source from API data first
        const data = mediaCache.get(tweetId);
        let sourceText = null;

        if (data && data.source) {
          sourceText = data.source;
        }

        // Create source element
        if (sourceText || true) {
          // Always create, will populate from DOM or "Twitter"
          const separator = document.createElement("span");
          separator.setAttribute("aria-hidden", "true");
          separator.textContent = " · ";
          separator.style.color = "rgb(113, 118, 123)";
          separator.style.margin = "0 4px";

          const sourceSpan = document.createElement("span");
          sourceSpan.style.color = "rgb(113, 118, 123)";
          sourceSpan.textContent = sourceText || "Twitter Web App";

          metadataContainer.appendChild(separator);
          metadataContainer.appendChild(sourceSpan);
        }
      }
    }
  }

  // 2. Show Account Location
  if (config.showAccountLocation && !focusedTweet.dataset.tweekLocation) {
    // Try to get location from cache by tweet ID first
    let location = locationCache.get(tweetId);

    // If not found, try to get username from tweetDataCache and look up from userDataCache
    if (!location) {
      const tweetData = tweetDataCache.get(tweetId);
      if (tweetData && tweetData.username) {
        const userData = userDataCache.get(tweetData.username.toLowerCase());
        if (userData && userData.location) {
          location = userData.location;
        }
      }
    }

    // If still not found, try extracting username from DOM
    if (!location) {
      const userLinks = focusedTweet.querySelectorAll('a[role="link"]');
      for (const link of userLinks) {
        const href = link.getAttribute("href");
        if (
          href &&
          href.startsWith("/") &&
          !href.includes("/status/") &&
          href.split("/").length === 2
        ) {
          const username = href.slice(1).toLowerCase();
          const userData = userDataCache.get(username);
          if (userData && userData.location) {
            location = userData.location;
            break;
          }
        }
      }
    }

    if (location && location.trim()) {
      focusedTweet.dataset.tweekLocation = "true";

      // Find the metadata container - try multiple approaches
      const timeElement = focusedTweet.querySelector("time");
      if (timeElement) {
        const timeLink = timeElement.closest("a");
        if (timeLink) {
          // Get the parent that contains the timestamp and other metadata
          const timestampContainer = timeLink.parentElement;

          if (timestampContainer) {
            // Create location element to add after timestamp
            const separator = document.createElement("span");
            separator.setAttribute("aria-hidden", "true");
            separator.style.color = "rgb(113, 118, 123)";
            separator.style.margin = "0 4px";
            separator.textContent = " · ";

            const locSpan = document.createElement("span");
            locSpan.style.color = "rgb(113, 118, 123)";
            locSpan.style.fontSize = "15px";
            locSpan.textContent = location;

            // Append location right after the timestamp in the same container
            timestampContainer.appendChild(separator);
            timestampContainer.appendChild(locSpan);
          }
        }
      }
    }
  }
}

// ==========================================
// INITIALIZATION
// ==========================================
function init() {
  if (isInitialized) return;
  isInitialized = true;

  applyStyles();
  startInterceptor();
  startObserver();

  // Setup global share button click tracking AFTER DOM is ready
  setupShareTracking();

  // Request settings from bridge
  window.dispatchEvent(new CustomEvent("TWEEK_REQUEST_SETTINGS"));

  console.log("🐦 Twitter Tweek v5.2: Ready!");
}

// Track share button clicks to identify which tweet's share was clicked
function setupShareTracking() {
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target;

      // Check if click is on share button or its children (including SVG paths)
      const shareBtn =
        target.closest('[data-testid="share"]') ||
        target.closest('[aria-label*="Share"]') ||
        target.closest('button[aria-label*="hare"]');

      if (shareBtn) {
        console.log("🔍 Share button clicked, searching for tweet...");

        // Try multiple methods to find the article
        let article = shareBtn.closest('article[data-testid="tweet"]');

        if (!article) {
          // Try finding article by role
          article = shareBtn.closest('article[role="article"]');
        }

        if (!article) {
          // Look for any article parent
          article = shareBtn.closest("article");
        }

        if (!article) {
          console.warn("⚠️ Share button clicked but no article found");
          console.log("   Share button element:", shareBtn);
          console.log(
            "   Parent elements:",
            shareBtn.parentElement,
            shareBtn.parentElement?.parentElement
          );

          // Last resort: Find the nearest tweet by scanning up the DOM
          let parent = shareBtn.parentElement;
          let attempts = 0;
          while (parent && attempts < 20) {
            const statusLink = parent.querySelector('a[href*="/status/"]');
            if (statusLink) {
              const match = statusLink.href.match(/status\/(\d+)/);
              if (match) {
                lastClickedTweetId = match[1];
                console.log(
                  "📌 Found tweet ID by scanning DOM:",
                  lastClickedTweetId
                );
                return;
              }
            }
            parent = parent.parentElement;
            attempts++;
          }

          return;
        }

        console.log("✅ Found article element");

        // Get ALL status links in this specific article
        const links = article.querySelectorAll('a[href*="/status/"]');
        console.log("   Found", links.length, "status links in article");

        // Method 1: Find the time element's parent link (most reliable for main tweet)
        let mainLink = null;
        const timeElement = article.querySelector("time");
        if (timeElement) {
          mainLink = timeElement.closest('a[href*="/status/"]');
          console.log("   Found link via time element:", mainLink?.href);
        }

        // Method 2: If no time element, get the last status link
        if (!mainLink && links.length > 0) {
          mainLink = links[links.length - 1];
          console.log("   Using last status link:", mainLink?.href);
        }

        if (mainLink) {
          const match = mainLink.href.match(/status\/(\d+)/);
          if (match) {
            lastClickedTweetId = match[1];
            console.log("📌 Share clicked on tweet ID:", lastClickedTweetId);
          }
        } else {
          console.warn("⚠️ Could not find tweet ID in article");
        }
      }
    },
    true
  ); // Use capture phase to ensure we catch it first

  console.log("👂 Share button tracking enabled");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
