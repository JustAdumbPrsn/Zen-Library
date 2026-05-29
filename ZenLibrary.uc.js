"use strict";

(function () {
    // Cleanup previous instance
    if (window.gZenLibrary && window.gZenLibrary.destroy) {
        window.gZenLibrary.destroy();
    }

    const _ucScriptPath = Components.stack.filename;

    // Load feature modules that may not have been loaded yet
    const _loadFeatureIfMissing = (windowProp, relPath) => {
        if (window[windowProp]) return;
        try {
            const scriptPath = _ucScriptPath.replace(/[^/\\]*\.uc\.js(\?.*)?$/i, relPath);
            Services.scriptloader.loadSubScript(scriptPath, window);
        } catch (e) {
            console.error(`[ZenLibrary] Failed to load ${relPath}:`, e);
        }
    };

    _loadFeatureIfMissing("ZenLibraryDownloads", "features/Downloads.uc.js");
    _loadFeatureIfMissing("ZenLibraryHistory",   "features/History.uc.js");
    _loadFeatureIfMissing("ZenLibraryMedia",     "features/Media.uc.js");
    _loadFeatureIfMissing("ZenLibrarySpaces",    "features/Spaces.uc.js");
    _loadFeatureIfMissing("ZenLibraryBoosts",    "features/Boosts.uc.js");

    /**
     * Reusable Component for Library Items
     * Moved here to ensure it is defined before use by feature modules
     */
    class ZenLibraryItem extends HTMLElement {
        constructor() {
            super();
            // Use Light DOM to inherit global ZenLibrary.css styles
        }

        connectedCallback() {
            if (this.hasAttribute('rendered')) return;
            this.render();
            this.setAttribute('rendered', 'true');
        }

        static get observedAttributes() {
            return ['title', 'subtitle', 'time', 'icon', 'status'];
        }

        attributeChangedCallback(name, oldValue, newValue) {
            if (this._structureCreated) {
                this.updateValues();
            }
        }

        set data(item) {
            this._item = item;
            if (this._structureCreated) {
                this.updateValues();
            } else {
                this.render(); // Render structure if not already
            }
        }

        get data() { return this._item; }

        render() {
            // If already rendered structure, just update values
            if (this._structureCreated) {
                this.updateValues();
                return;
            }

            this.innerHTML = "";
            this.className = "library-list-item";

            // Check status for deleted/disabled state
            if (this._item && this._item.status === 'deleted') {
                this.classList.add('deleted');
            }
            if (this.hasAttribute('pop-in')) {
                this.classList.add('pop-in');
            }

            // Main container for left side (Icon + Info)
            const mainGroup = document.createElement('div');
            mainGroup.style.display = "flex";
            mainGroup.style.alignItems = "center";
            mainGroup.style.flex = "1";
            mainGroup.style.minWidth = "0"; // Text overflow fix
            mainGroup.style.gap = "8px"; // Match .library-list-item gap

            // Icon Container
            const iconContainer = document.createElement('div');
            iconContainer.className = "item-icon-container";
            const icon = document.createElement('div');
            icon.className = "item-icon";
            iconContainer.appendChild(icon);

            // Info Container
            const info = document.createElement('div');
            info.className = "item-info";
            const title = document.createElement('div');
            title.className = "item-title";
            const subtitle = document.createElement('div');
            subtitle.className = "item-url";
            info.appendChild(title);
            info.appendChild(subtitle);

            mainGroup.appendChild(iconContainer);
            mainGroup.appendChild(info);
            this.appendChild(mainGroup);

            // Time
            const time = document.createElement('div');
            time.className = "item-time";
            this.appendChild(time);

            this._elements = { icon, title, subtitle, time };
            this._structureCreated = true;
            this.updateValues();
        }

        updateValues() {
            if (!this._elements || !this._structureCreated) return;

            const iconUrl = this.getAttribute('icon') || (this._item ? this._item.icon : '');
            const titleVal = this.getAttribute('title') || (this._item ? this._item.title : '');
            const subtitleVal = this.getAttribute('subtitle') || (this._item ? this._item.subtitle : '');
            const timeVal = this.getAttribute('time') || (this._item ? this._item.time : '');

            if (iconUrl) this._elements.icon.style.backgroundImage = `url('${iconUrl}')`;
            this._elements.title.textContent = titleVal;
            this._elements.subtitle.textContent = subtitleVal;
            this._elements.time.textContent = timeVal;

            // Update status class based on _item data
            if (this._item && this._item.status === 'deleted') {
                this.classList.add('deleted');
            } else {
                this.classList.remove('deleted');
            }
        }

        appendSecondaryAction(element) {
            this.appendChild(element);
        }
    }

    if (!customElements.get('zen-library-item')) {
        try {
            customElements.define('zen-library-item', ZenLibraryItem);
            console.log("ZenLibrary: zen-library-item custom element registered successfully");
        } catch (e) {
            console.error("ZenLibrary: Failed to register zen-library-item custom element:", e);
        }
    }
    window.ZenLibraryItem = ZenLibraryItem;

    /**
     * Centralized State Store (Simple Redux-like implementation)
     */
    class ZenStore {
        constructor(initialState = {}) {
            this._state = initialState;
            this._listeners = [];
        }

        getState() {
            return this._state;
        }

        subscribe(listener) {
            this._listeners.push(listener);
            return () => {
                this._listeners = this._listeners.filter(l => l !== listener);
            };
        }

        dispatch(action) {
            this._state = this._reducer(this._state, action);
            this._listeners.forEach(listener => listener(this._state));
        }

        _reducer(state, action) {
            switch (action.type) {
                case 'SET_DOWNLOADS':
                    return { ...state, downloads: action.payload };
                case 'SET_HISTORY':
                    return { ...state, history: action.payload };
                case 'SET_TAB':
                    return { ...state, activeTab: action.payload };
                default:
                    return state;
            }
        }
    }

    // For now, trusting user "files will already be loaded".

    class ZenLibraryElement extends HTMLElement {
        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
            this._activeTab = (window.gZenLibrary && window.gZenLibrary.lastActiveTab) || "downloads";
            this._initialized = false;

            // Use shared store if available, otherwise create local (fallback)
            this.store = (window.gZenLibrary && window.gZenLibrary.store) ? window.gZenLibrary.store : new ZenStore({
                downloads: [],
                history: [],
                activeTab: 'downloads'
            });

            this._sidebarItemEls = {};

            try {
                this._sessionStart = Services.startup.getStartupInfo().process.getTime();
            } catch (e) {
                this._sessionStart = Date.now();
            }

            // Use pre-initialized modules from controller if available
            // This allows us to use cached data for instant rendering
            const preInit = window.gZenLibrary && window.gZenLibrary.getModules ? window.gZenLibrary.getModules() : {};

            // Initialize Feature Modules - reuse pre-initialized ones or create new
            // Pass 'this' to update the library reference
            this.downloads = preInit.downloads || (window.ZenLibraryDownloads ? new window.ZenLibraryDownloads(this) : null);
            this.history = preInit.history || (window.ZenLibraryHistory ? new window.ZenLibraryHistory(this) : null);
            this.media = preInit.media || (window.ZenLibraryMedia ? new window.ZenLibraryMedia(this) : null);
            this.spaces = preInit.spaces || (window.ZenLibrarySpaces ? new window.ZenLibrarySpaces(this) : null);
            this.boosts = preInit.boosts || (window.ZenLibraryBoosts ? new window.ZenLibraryBoosts(this) : null);

            // Update the library reference on pre-initialized modules so they can use our el() helper
            if (this.downloads) this.downloads.library = this;
            if (this.history) this.history.library = this;
            if (this.media) this.media.library = this;
            if (this.spaces) this.spaces.library = this;
            if (this.boosts) this.boosts.library = this;
        }

        get activeTab() { return this._activeTab; }
        set activeTab(val) {
            if (this._activeTab === val) return;
            if (this.media && typeof this.media._stopCurrentAudio === "function") {
                this.media._stopCurrentAudio();
            }
            this._activeTab = val;
            if (window.gZenLibrary) window.gZenLibrary.lastActiveTab = val;
            this.setAttribute("active-tab", val);
            this.update();
        }

        connectedCallback() {
            console.log("[ZenLibrary] ZenLibraryElement connectedCallback called");
            try {
                if (!this._initialized) {
                    console.log("[ZenLibrary] Initializing ZenLibraryElement");
                    const link = document.createElement("link");
                    link.rel = "stylesheet";
                    link.href = _ucScriptPath.replace(/\.uc\.js(\?.*)?$/i, ".css");
                    this.shadowRoot.appendChild(link);

                    const updateColors = () => {
                        const rootStyle = window.getComputedStyle(document.documentElement);
                        const hoverBg = rootStyle.getPropertyValue("--zen-hover-background") ||
                            rootStyle.getPropertyValue("--tab-hover-background-color");
                        if (hoverBg) {
                            this.style.setProperty("--zen-library-hover-bg", hoverBg);
                        }
                    };
                    updateColors();
                    window.matchMedia("(prefers-color-scheme: dark)").addListener(updateColors);

                    const container = document.createElement("div");
                    container.className = "zen-library-container";

                    const sidebar = document.createElement("div");
                    sidebar.id = "zen-library-sidebar-container";

                    const sidebarTop = document.createElement("div");
                    sidebarTop.className = "zen-library-sidebar-top";
                    sidebar.appendChild(sidebarTop);

                    const sidebarItemsContainer = document.createElement("div");
                    sidebarItemsContainer.className = "sidebar-items";
                    const sidebarItems = ["downloads", "media", "history", "spaces", "boosts"];
                    const parser = new DOMParser();

                    sidebarItems.forEach(id => {
                        const item = document.createElement("div");
                        item.className = "sidebar-button";
                        item.dataset.id = id;

                        let iconSvg;
                        if (id === "downloads") {
    iconSvg = `
<svg class="zen-downloads-icon" width="28" height="28" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient gradientUnits="userSpaceOnUse" x1="64" y1="40" x2="64" y2="168" id="zen-downloads-grad-front">
      <stop offset="0" style="stop-color: rgb(255, 255, 255)"/>
      <stop offset="1" style="stop-color: rgb(0, 0, 0)"/>
    </linearGradient>
  </defs>
  
  <!--Circle-->
  <g class="zen-downloads-circle-translate" style="transform-origin: 64px 64px;">
    <circle class="zen-downloads-bg" cx="64" cy="64" r="47.5"
            style="fill: var(--zen-folder-front-bgcolor); fill-opacity: 0;" />
    <circle class="zen-downloads-gradient" cx="64" cy="64" r="47.5"
            style="fill: url(#zen-downloads-grad-front); fill-opacity: 0;" />
    <circle class="zen-downloads-border" cx="64" cy="64" r="47.5"
            style="fill: none; stroke: var(--zen-folder-stroke); stroke-width: 7.1px;" />
  </g>

  <!--Arrow (path)-->
  <path class="zen-downloads-arrow" d="M 64 45 L 64 83 M 50 69 L 64 83 L 78 69"
        style="stroke-width: 7.1px; stroke: var(--zen-folder-stroke); fill: none; stroke-linecap: round; stroke-linejoin: round;" />
</svg>`;
} else if (id === "history") {
    iconSvg = iconSvg = `
<svg class="zen-history-icon" width="28" height="28" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient gradientUnits="userSpaceOnUse" x1="64" y1="0" x2="64" y2="128" id="zen-history-grad-back">
      <stop offset="0" style="stop-color: rgb(255, 255, 255)"/>
      <stop offset="1" style="stop-color: rgb(0, 0, 0)"/>
    </linearGradient>
    <linearGradient gradientUnits="userSpaceOnUse" x1="64" y1="0" x2="64" y2="128" id="zen-history-grad-front">
      <stop offset="0" style="stop-color: rgb(255, 255, 255)"/>
      <stop offset="1" style="stop-color: rgb(0, 0, 0)"/>
    </linearGradient>
  </defs>

  <!-- Box (Back card) -->
  <g class="zen-history-body-translate" style="transform-origin: 0 0; transform: translate(63.977px, 79.047px);">
    <g transform="translate(-39.867, -30.328)">
      <path class="zen-history-bg" 
            d="M 3.55 0 L 76.184 0 L 76.184 46.856 A 10.25 10.25 0 0 1 65.934 57.106 L 13.8 57.106 A 10.25 10.25 0 0 1 3.55 46.856 Z" 
            style="fill: var(--zen-folder-front-bgcolor); fill-opacity: 0;" />
      <path class="zen-history-gradient" 
            d="M 3.55 0 L 76.184 0 L 76.184 46.856 A 10.25 10.25 0 0 1 65.934 57.106 L 13.8 57.106 A 10.25 10.25 0 0 1 3.55 46.856 Z" 
            style="fill: url(#zen-history-grad-front); fill-opacity: 0;" />
      <path class="zen-history-border" 
            d="M 3.55 0 L 76.184 0 L 76.184 46.856 A 10.25 10.25 0 0 1 65.934 57.106 L 13.8 57.106 A 10.25 10.25 0 0 1 3.55 46.856 Z" 
            style="fill: none; stroke: var(--zen-folder-stroke); stroke-width: 7.1px;" />
    </g>
  </g>

  <!-- Top Lid (Front card) - Keyframes Merged -->
  <g class="zen-history-lid" style="transform-origin: 0 0; transform: translate(63.977px, 37.148px) rotate(0deg) translate(-46.852px, -12.82px);">
    <rect class="zen-history-bg" x="3.55" y="3.55" width="86.603" height="18.541" rx="6.05" 
          style="fill: var(--zen-folder-front-bgcolor); fill-opacity: 0;" />
    <rect class="zen-history-gradient" x="3.55" y="3.55" width="86.603" height="18.541" rx="6.05" 
          style="fill: url(#zen-history-grad-front); fill-opacity: 0;" />
    <rect class="zen-history-border" x="3.55" y="3.55" width="86.603" height="18.541" rx="6.05" 
          style="fill: none; stroke: var(--zen-folder-stroke); stroke-width: 7.1px;" />
  </g>

  <!-- Dash (path) -->
  <g class="zen-history-dash-translate" style="transform-origin: 0 0; transform: translate(64px, 65px) scale(0.9, 1);">
    <path class="zen-history-dash-path" fill="none"
          d="M -16 0 L 16 0" 
          style="stroke: var(--zen-folder-stroke); stroke-width: 8px; stroke-linecap: round; stroke-linejoin: round;" />
  </g>
</svg>`;
} else if (id === "media") {
    iconSvg = `
<svg class="zen-media-icon" width="28" height="28" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Replaced the jagged clip-path with a precise dynamic Mask (same technique as spaces) -->
    <mask id="zen-media-mask">
      <rect x="-10" y="-10" width="148" height="148" fill="white" />
      <!-- Black cutout precisely matches the front card's size and transform so they mask perfectly -->
      <!-- The width/height match 85.439 + 7.1 stroke, rx matches 9.262 + 3.55 half-stroke -->
      <g class="zen-media-front-card" transform="translate(78.827, 77.737) translate(-46.27, -36.445)">
        <rect x="0" y="0" width="92.539" height="72.891" rx="12.812" fill="black" />
      </g>
    </mask>

    <linearGradient gradientUnits="userSpaceOnUse" x1="64" y1="0" x2="64" y2="128" id="zen-media-grad-back">
      <stop offset="0" style="stop-color: rgb(255, 255, 255)"/>
      <stop offset="1" style="stop-color: rgb(0, 0, 0)"/>
    </linearGradient>
    <linearGradient gradientUnits="userSpaceOnUse" x1="64" y1="0" x2="64" y2="128" id="zen-media-grad-front">
      <stop offset="0" style="stop-color: rgb(255, 255, 255)"/>
      <stop offset="1" style="stop-color: rgb(0, 0, 0)"/>
    </linearGradient>
  </defs>

  <!-- Back card -->
  <!-- Wrapped in an untransformed group so the mask coordinates align globally (same as spaces) -->
  <g class="zen-media-back-wrapper" mask="url(#zen-media-mask)">
    <g class="zen-media-back-card" transform="translate(54.799, 57.743) rotate(-7) translate(-46.27, -36.445)">
      <rect class="zen-media-bg" x="3.55" y="3.55" width="85.439" height="65.791" rx="9.262" 
            style="fill: var(--zen-folder-front-bgcolor); fill-opacity: 0;" />
      <rect class="zen-media-gradient" x="3.55" y="3.55" width="85.439" height="65.791" rx="9.262" 
            style="fill: url(#zen-media-grad-back); fill-opacity: 0;" />
      <rect class="zen-media-border" x="3.55" y="3.55" width="85.439" height="65.791" rx="9.262" 
            style="fill: none; stroke: var(--zen-folder-stroke); stroke-width: 7.1px;" />
    </g>
  </g>

  <!-- Front card (rect) -->
  <g class="zen-media-front-card" transform="translate(78.827, 77.737) translate(-46.27, -36.445)">
    <rect class="zen-media-bg" x="3.55" y="3.55" width="85.439" height="65.791" rx="9.262" 
          style="fill: var(--zen-folder-front-bgcolor); fill-opacity: 0;" />
    <rect class="zen-media-gradient" x="3.55" y="3.55" width="85.439" height="65.791" rx="9.262" 
          style="fill: url(#zen-media-grad-front); fill-opacity: 0;" />
    <!--Mountain (path)-->
    <g class="zen-media-mountain" transform="translate(0.289, 32.609)">
      <path class="zen-media-mountain-path" d="M7.432 21.147 L17.865 12.11 C19.665 10.596 21.373 9.862 23.173 9.862 C25.158 9.862 27.005 10.596 28.805 12.202 L36.191 18.853 L54.84 2.431 C56.779 0.734 58.81 0 61.072 0 C63.334 0 65.55 0.826 67.35 2.477 L84.568 18.67 L92 25.78 C92 35.23 87.153 40 77.551 40 L14.495 40 C4.801 40 0 35.275 0 25.78 Z" 
            style="fill: var(--zen-folder-stroke);" />
    </g>
    <rect class="zen-media-border" x="3.55" y="3.55" width="85.439" height="65.791" rx="9.262" 
          style="fill: none; stroke: var(--zen-folder-stroke); stroke-width: 7.1px;" />
  </g>
  
  <!--Sun (circle)-->
  <g class="zen-media-sun" transform="translate(64.76, 67.886) translate(-9.914, -9.984)">
    <circle class="zen-media-sun-path" cx="9.914" cy="9.984" r="9.914" 
            style="fill: var(--zen-folder-stroke);" />
  </g>
</svg>`;
}
 else if (id === "spaces") {
                            iconSvg = `
<svg class="zen-spaces-icon" width="28" height="28" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Mask using the exact same merged transform as the front card -->
    <mask id="zen-spaces-mask">
      <rect x="-10" y="-10" width="148" height="148" fill="white" />
      <g class="zen-spaces-front-card" style="transform-origin: 0 0; transform: translate(77.02px, 75.93px) rotate(0deg) translate(-35.022px, -44.68px);">
        <rect x="0" y="0" width="70.04" height="89.36" rx="14" fill="black" />
      </g>
    </mask>
<linearGradient gradientUnits="userSpaceOnUse" x1="64" y1="20" x2="64" y2="148" id="zen-spaces-grad-back">
  <stop offset="0" style="stop-color: rgb(255, 255, 255)"/>
  <stop offset="1" style="stop-color: rgb(0, 0, 0)"/>
</linearGradient>
<linearGradient gradientUnits="userSpaceOnUse" x1="64" y1="20" x2="64" y2="148" id="zen-spaces-grad-front">
  <stop offset="0" style="stop-color: rgb(255, 255, 255)"/>
  <stop offset="1" style="stop-color: rgb(0, 0, 0)"/>
</linearGradient>
  </defs>

  <!-- Back Card -->
  <g class="zen-spaces-back-wrapper" mask="url(#zen-spaces-mask)">
    <g class="zen-spaces-back-card" style="transform-origin: 0 0; transform: translate(51.28px, 61.69px) rotate(-17.5deg) translate(-35.022px, -44.68px);">
      <rect class="zen-spaces-bg" x="3.55" y="3.55" width="62.94" height="82.26" rx="10.45" 
            style="fill: var(--zen-folder-front-bgcolor); fill-opacity: 0;" />
      <rect class="zen-spaces-gradient" x="3.55" y="3.55" width="62.94" height="82.26" rx="10.45" 
            style="fill: url(#zen-spaces-grad-back); fill-opacity: 0;" />
      <rect class="zen-spaces-border" x="3.55" y="3.55" width="62.94" height="82.26" rx="10.45" 
            style="fill: none; stroke: var(--zen-folder-stroke); stroke-width: 7.1px;" />
    </g>
  </g>

  <!-- Front Card -->
  <g class="zen-spaces-front-card" style="transform-origin: 0 0; transform: translate(77.02px, 75.93px) rotate(0deg) translate(-35.022px, -44.68px);">
    <rect class="zen-spaces-bg" x="3.55" y="3.55" width="62.94" height="82.26" rx="10.45" 
          style="fill: var(--zen-folder-front-bgcolor); fill-opacity: 0;" />
    <rect class="zen-spaces-gradient" x="3.55" y="3.55" width="62.94" height="82.26" rx="10.45" 
          style="fill: url(#zen-spaces-grad-front); fill-opacity: 0;" />
    <rect class="zen-spaces-border" x="3.55" y="3.55" width="62.94" height="82.26" rx="10.45" 
          style="fill: none; stroke: var(--zen-folder-stroke); stroke-width: 7.1px;" />
  </g>
</svg>`;
                        } else if (id === "boosts") {
                            iconSvg = `
<svg class="zen-boosts-icon" width="28" height="28" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Consolidated identical back and front gradients into a single reusable gradient -->
<linearGradient id="zen-boosts-grad" gradientUnits="userSpaceOnUse" x1="64" y1="16" x2="64" y2="144">
  <stop offset="0" stop-color="#fff" />
  <stop offset="1" stop-color="#000" />
</linearGradient>
    <mask id="zen-boosts-mask" maskContentUnits="userSpaceOnUse">
      <!-- Removed redundant default positioning (x="0" y="0") and minified path data -->
      <rect x="-100" y="-100" width="300" height="300" fill="#fff" />
      <path fill="#000" stroke="#000" stroke-width="8" stroke-linejoin="round" d="M-3.79 54.121C-5.31 51.635-6.984 48.884-7.082 42.132L-7.073 42.091-7.063 42.051C-6.2 38.573-3.904 36.054-1.1 34.382L4.474 31.059C6.968 29.572 9.896 28.739 13.003 29.233 13.558 28.514 14.137 27.648 14.736 26.617L14.752 26.589 14.769 26.561C15.438 25.438 16.22 24.032 17.105 22.317 18.032 20.521 19.176 18.3 20.531 15.65 21.63 13.5 23.221 11.59 25.405 10.221 27.368 8.99 29.589 8.271 31.984 8.218L32.013 8.218C34.325 8.178 36.528 8.749 38.557 9.821 40.713 10.96 42.401 12.627 43.642 14.615L43.662 14.646 63.922 47.997C66.006 51.466 67.049 55.422 66.104 59.547 65.148 63.723 62.394 66.785 58.898 68.869L44.274 77.586C44.222 77.953 44.148 78.323 44.06 78.696 43.24 82.158 40.963 84.66 38.246 86.34L38.205 86.365 32.548 89.738C29.738 91.413 26.42 92.18 22.922 91.299 18.565 90.201 14.485 87.919 10.34 86.196 10.34 86.196 8.779 87.737 7.305 89.123 5.699 90.632 4.021 91.927 2.291 92.956-2.345 95.712-7.442 96.912-12.65 95.581-17.868 94.248-21.776 90.71-24.597 86.068-27.411 81.439-28.702 76.368-27.456 71.195-26.206 66.005-22.739 62.101-18.096 59.333-16.417 58.332-14.507 57.488-12.438 56.763L-12.4 56.75C-10.473 56.089-8.488 55.472-6.445 54.899-5.537 54.635-4.652 54.375-3.79 54.121Z" />
    </mask>
  </defs>

  <!-- Card -->
  <g class="zen-boosts-card" style="transform-origin: 0 0;" transform="translate(61.889 63.143) scale(1.1) rotate(-15)">
    <g class="zen-boosts-card-anchor" transform="translate(-44 -44)">
      <rect class="zen-boosts-bg" x="3.55" y="3.55" width="80.9" height="80.9" rx="12.45" fill="var(--zen-folder-front-bgcolor)" fill-opacity="0" />
      <rect class="zen-boosts-gradient" x="3.55" y="3.55" width="80.9" height="80.9" rx="12.45" fill="url(#zen-boosts-grad)" fill-opacity="0" />
      <rect class="zen-boosts-border" width="88" height="88" rx="16" mask="url(#zen-boosts-mask)" fill="none" stroke="var(--zen-folder-stroke)" stroke-width="7.1" />
    </g>
  </g>

  <!-- Paintbrush -->
  <g class="zen-boosts-brush" style="transform-origin: 0 0;" transform="translate(18.247 109.504) scale(1.1)">
    <g class="zen-boosts-brush-anchor" transform="translate(-15 -70)">
      <!-- Brush Tip -->
      <g class="zen-boosts-brush-tip-translate" transform="translate(27.307 3.73)">
        <path class="zen-boosts-bg" d="M0 28 6 14 12 0 44 34 26 54Z" fill="var(--zen-folder-front-bgcolor)" fill-opacity="0" />
        <path class="zen-boosts-gradient" d="M0 28 6 14 12 0 44 34 26 54Z" fill="url(#zen-boosts-grad)" fill-opacity="0" />
      </g>
      <!-- Brush Silhouette -->
      <g class="zen-boosts-brush-silhouette-fills">
        <path class="zen-boosts-bg" fill="var(--zen-folder-front-bgcolor)" fill-opacity="0" d="M0 69.826C-0.023 66.459 1.467 63.29 4.469 60.318 5.501 59.296 6.814 58.264 8.409 57.219 10.027 56.174 11.717 55.176 13.476 54.154 15.235 53.132 16.877 52.158 18.472 51.229L22.377 48.617 15.024 41.373C13.546 39.91 12.795 38.354 12.772 36.706 12.772 35.034 13.5 33.479 14.954 32.04L19.563 27.478C21.017 26.039 22.577 25.33 24.242 25.353 26.219 25.381 26.531 25.828 28.992 27.547L56.964 55.303C58.465 56.766 59.215 58.322 59.215 59.97 59.238 61.595 58.535 63.139 57.104 64.602L52.46 69.199C51.029 70.615 49.47 71.311 47.781 71.288 46.092 71.288 44.52 70.557 43.066 69.094L35.748 61.816C34.904 62.814 34.012 64.091 33.074 65.647 32.136 67.203 31.15 68.862 30.118 70.627 29.109 72.392 28.078 74.063 27.022 75.642 25.99 77.244 24.946 78.555 23.89 79.577 20.888 82.549 17.686 84.023 14.285 84 10.884 83.977 7.658 82.444 4.609 79.403 1.56 76.385 0.023 73.193 0 69.826ZM56.257 54.603L54.309 52.669 68.012 38.552C68.669 37.902 68.997 37.182 68.997 36.393 68.997 35.604 68.633 34.849 67.906 34.129L41.764 8.289C41.412 7.941 41.048 7.754 40.673 7.731 40.321 7.708 39.993 7.825 39.688 8.08 39.407 8.312 39.196 8.695 39.055 9.229 38.211 12.294 37.495 14.917 36.909 17.099 36.323 19.281 35.712 21.244 35.079 22.985 34.446 24.726 33.636 26.444 32.651 28.139 31.689 29.811 31.369 29.906 31.369 29.906L28.992 27.547 26.531 25.828C27.258 24.69 28.147 22.962 28.64 21.871 29.133 20.757 29.578 19.514 29.977 18.144 30.399 16.751 30.845 15.079 31.314 13.129 31.783 11.156 32.358 8.718 33.038 5.816 33.39 4.307 34.023 3.088 34.938 2.159 35.853 1.207 36.909 0.569 38.105 0.244 39.325-0.081 40.556-0.081 41.799 0.244 43.042 0.546 44.168 1.184 45.177 2.159L72.832 29.567C74.92 31.657 75.975 33.85 75.998 36.149 76.045 38.447 75.049 40.607 73.008 42.627L58.083 56.603 56.257 54.603Z" />
        <path class="zen-boosts-gradient" fill="url(#zen-boosts-grad)" fill-opacity="0" d="M0 69.826C-0.023 66.459 1.467 63.29 4.469 60.318 5.501 59.296 6.814 58.264 8.409 57.219 10.027 56.174 11.717 55.176 13.476 54.154 15.235 53.132 16.877 52.158 18.472 51.229L22.377 48.617 15.024 41.373C13.546 39.91 12.795 38.354 12.772 36.706 12.772 35.034 13.5 33.479 14.954 32.04L19.563 27.478C21.017 26.039 22.577 25.33 24.242 25.353 26.219 25.381 26.531 25.828 28.992 27.547L56.964 55.303C58.465 56.766 59.215 58.322 59.215 59.97 59.238 61.595 58.535 63.139 57.104 64.602L52.46 69.199C51.029 70.615 49.47 71.311 47.781 71.288 46.092 71.288 44.52 70.557 43.066 69.094L35.748 61.816C34.904 62.814 34.012 64.091 33.074 65.647 32.136 67.203 31.15 68.862 30.118 70.627 29.109 72.392 28.078 74.063 27.022 75.642 25.99 77.244 24.946 78.555 23.89 79.577 20.888 82.549 17.686 84.023 14.285 84 10.884 83.977 7.658 82.444 4.609 79.403 1.56 76.385 0.023 73.193 0 69.826ZM56.257 54.603L54.309 52.669 68.012 38.552C68.669 37.902 68.997 37.182 68.997 36.393 68.997 35.604 68.633 34.849 67.906 34.129L41.764 8.289C41.412 7.941 41.048 7.754 40.673 7.731 40.321 7.708 39.993 7.825 39.688 8.08 39.407 8.312 39.196 8.695 39.055 9.229 38.211 12.294 37.495 14.917 36.909 17.099 36.323 19.281 35.712 21.244 35.079 22.985 34.446 24.726 33.636 26.444 32.651 28.139 31.689 29.811 31.369 29.906 31.369 29.906L28.992 27.547 26.531 25.828C27.258 24.69 28.147 22.962 28.64 21.871 29.133 20.757 29.578 19.514 29.977 18.144 30.399 16.751 30.845 15.079 31.314 13.129 31.783 11.156 32.358 8.718 33.038 5.816 33.39 4.307 34.023 3.088 34.938 2.159 35.853 1.207 36.909 0.569 38.105 0.244 39.325-0.081 40.556-0.081 41.799 0.244 43.042 0.546 44.168 1.184 45.177 2.159L72.832 29.567C74.92 31.657 75.975 33.85 75.998 36.149 76.045 38.447 75.049 40.607 73.008 42.627L58.083 56.603 56.257 54.603Z" />
      </g>
      <!-- Brush Border -->
      <path class="zen-boosts-border" fill-rule="evenodd" fill="var(--zen-folder-stroke)" d="M0 69.826C-0.023 66.459 1.467 63.29 4.469 60.318 5.501 59.296 6.814 58.264 8.409 57.219 10.027 56.174 11.717 55.176 13.476 54.154 15.235 53.132 16.877 52.158 18.472 51.229L22.377 48.617 15.024 41.373C13.546 39.91 12.795 38.354 12.772 36.706 12.772 35.034 13.5 33.479 14.954 32.04L19.563 27.478C21.017 26.039 22.577 25.33 24.242 25.353 26.219 25.381 26.531 25.828 28.992 27.547L56.964 55.303C58.465 56.766 59.215 58.322 59.215 59.97 59.238 61.595 58.535 63.139 57.104 64.602L52.46 69.199C51.029 70.615 49.47 71.311 47.781 71.288 46.092 71.288 44.52 70.557 43.066 69.094L35.748 61.816C34.904 62.814 34.012 64.091 33.074 65.647 32.136 67.203 31.15 68.862 30.118 70.627 29.109 72.392 28.078 74.063 27.022 75.642 25.99 77.244 24.946 78.555 23.89 79.577 20.888 82.549 17.686 84.023 14.285 84 10.884 83.977 7.658 82.444 4.609 79.403 1.56 76.385 0.023 73.193 0 69.826ZM20.618 38.308L29.133 46.701C29.86 47.398 30.188 48.187 30.118 49.069 30.048 49.951 29.625 50.799 28.851 51.612 28.171 52.309 27.034 53.11 25.439 54.015 23.844 54.92 22.037 55.931 20.02 57.045 18.026 58.159 16.044 59.355 14.074 60.632 12.104 61.909 10.427 63.232 9.043 64.602 7.425 66.181 6.615 67.887 6.615 69.721 6.638 71.555 7.471 73.297 9.113 74.945 10.778 76.57 12.525 77.383 14.355 77.383 16.208 77.406 17.945 76.617 19.563 75.015 20.97 73.645 22.307 71.985 23.574 70.035 24.864 68.085 26.072 66.122 27.198 64.149 28.324 62.152 29.344 60.377 30.259 58.821 31.197 57.242 32.007 56.116 32.687 55.443 33.508 54.654 34.364 54.235 35.255 54.189 36.146 54.119 36.956 54.444 37.683 55.164L46.127 63.557C46.971 64.416 47.804 64.404 48.625 63.522L51.299 60.875C52.12 60.039 52.132 59.216 51.334 58.403L25.79 33.154C25.415 32.759 25.016 32.574 24.594 32.597 24.172 32.597 23.762 32.794 23.363 33.189L20.618 35.836C19.774 36.649 19.774 37.472 20.618 38.308ZM11.294 72.855C10.473 72.042 10.063 71.068 10.063 69.93 10.063 68.792 10.473 67.818 11.294 67.005 12.115 66.192 13.101 65.786 14.25 65.786 15.399 65.786 16.384 66.192 17.205 67.005 18.026 67.818 18.437 68.792 18.437 69.93 18.437 71.068 18.026 72.042 17.205 72.855 16.384 73.668 15.399 74.074 14.25 74.074 13.101 74.074 12.115 73.668 11.294 72.855ZM56.257 54.603L54.309 52.669 68.012 38.552C68.669 37.902 68.997 37.182 68.997 36.393 68.997 35.604 68.633 34.849 67.906 34.129L41.764 8.289C41.412 7.941 41.048 7.754 40.673 7.731 40.321 7.708 39.993 7.825 39.688 8.08 39.407 8.312 39.196 8.695 39.055 9.229 38.211 12.294 37.495 14.917 36.909 17.099 36.323 19.281 35.712 21.244 35.079 22.985 34.446 24.726 33.636 26.444 32.651 28.139 31.689 29.811 31.369 29.906 31.369 29.906L28.992 27.547 26.531 25.828C27.258 24.69 28.147 22.962 28.64 21.871 29.133 20.757 29.578 19.514 29.977 18.144 30.399 16.751 30.845 15.079 31.314 13.129 31.783 11.156 32.358 8.718 33.038 5.816 33.39 4.307 34.023 3.088 34.938 2.159 35.853 1.207 36.909 0.569 38.105 0.244 39.325-0.081 40.556-0.081 41.799 0.244 43.042 0.546 44.168 1.184 45.177 2.159L72.832 29.567C74.92 31.657 75.975 33.85 75.998 36.149 76.045 38.447 75.049 40.607 73.008 42.627L58.083 56.603 56.257 54.603ZM50.455 37.786C52.425 35.836 54.138 33.7 55.592 31.378 57.07 29.056 57.973 26.352 58.301 23.264L66.041 30.89C65.15 32.004 63.93 33.142 62.382 34.303 60.834 35.441 59.216 36.463 57.527 37.368 55.862 38.25 54.36 38.878 53.023 39.249 51.709 39.62 50.818 39.573 50.349 39.109 49.927 38.714 49.962 38.274 50.455 37.786Z" />
    </g>
  </g>

  <!-- Sparkle Small -->
  <g class="zen-boosts-star-small" style="transform-origin: 0 0;" transform="translate(68.002 37.075) rotate(2.014)">
    <g class="zen-boosts-star-small-anchor" transform="translate(-8 -8)">
      <path class="zen-boosts-border" d="M8 0C8 4.418 4.418 8 0 8 4.418 8 8 11.582 8 16 8 11.582 11.582 8 16 8 11.582 8 8 4.418 8 0Z" fill="var(--zen-folder-stroke)" stroke="var(--zen-folder-stroke)" stroke-width="3" stroke-linejoin="round" />
    </g>
  </g>

  <!-- Sparkle Large -->
  <g class="zen-boosts-star-large" style="transform-origin: 0 0;" transform="translate(85.002 50.174) rotate(2.014)">
    <g class="zen-boosts-star-large-anchor" transform="translate(-12 -12)">
      <path class="zen-boosts-border" d="M12 0C12 6.627 6.627 12 0 12 6.627 12 12 17.373 12 24 12 17.373 17.373 12 24 12 17.373 12 12 6.627 12 0Z" fill="var(--zen-folder-stroke)" stroke="var(--zen-folder-stroke)" stroke-width="3" stroke-linejoin="round" />
    </g>
  </g>
</svg>`;
                        }

                        if (iconSvg) {
                            const doc = parser.parseFromString(iconSvg, "image/svg+xml");
                            const iconNode = doc.documentElement;
                            iconNode.removeAttribute("xmlns");
                            item.appendChild(iconNode);
                        } else {
                            const iconDiv = document.createElement("div");
                            iconDiv.className = `icon ${id}-icon`;
                            item.appendChild(iconDiv);
                        }

                        const labelSpan = document.createElement("span");
                        labelSpan.className = "label";
                        labelSpan.textContent = id.charAt(0).toUpperCase() + id.slice(1);
                        item.appendChild(labelSpan);

                        item.onclick = () => {
                            if (this.activeTab === id) {
                                if (id === "history" && this.history && this.history.resetView) {
                                    this.history.resetView();
                                }
                                this.update();
                            }
                            else this.activeTab = id;
                        };
                        sidebarItemsContainer.appendChild(item);
                        this._sidebarItemEls[id] = item;
                    });
                    sidebar.appendChild(sidebarItemsContainer);

                    const exitBtn = document.createElement("div");
                    exitBtn.className = "sidebar-button sidebar-button-exit";
                    exitBtn.dataset.id = "exit";
                    exitBtn.innerHTML = `<div class="icon back-icon"></div><span class="label">Exit Library</span>`;
                    exitBtn.onclick = () => window.gZenLibrary.close();
                    sidebar.appendChild(exitBtn);
                    container.appendChild(sidebar);

                    const panel = document.createElement("div");
                    panel.id = "zen-library-main-panel";
                    panel.innerHTML = `
                        <header class="library-header"></header>
                        <div class="library-content"></div>
                    `;
                    container.appendChild(panel);
                    this.shadowRoot.appendChild(container);

                    this._initialized = true;
                    console.log("[ZenLibrary] ZenLibraryElement initialization complete");
                }
                this.setAttribute("active-tab", this.activeTab);
                console.log("[ZenLibrary] About to call update(), activeTab:", this.activeTab);
                this.update();
                this.getBoundingClientRect();
                requestAnimationFrame(() => requestAnimationFrame(() => this.style.width = ""));
                console.log("[ZenLibrary] ZenLibraryElement connectedCallback finished");
            } catch (e) {
                console.error("ZenLibrary Error in connectedCallback:", e);
            }
        }

        update() {
            try {
                // Check if custom elements are properly registered
                if (!customElements.get('zen-library-item')) {
                    console.error("ZenLibrary Error: zen-library-item custom element not registered");
                    return;
                }
                
                // Common width calculation
                // We can rely on Spaces module or default fallback
                let targetWidth = 340;
                // Assuming ZenLibrarySpaces is available on window if Spaces module loaded
                if (this.activeTab === "spaces" && window.ZenLibrarySpaces) {
                    const ws = window.ZenLibrarySpaces.getWorkspaces();
                    targetWidth = window.ZenLibrarySpaces.calculatePanelWidth(ws.length);
                } else if (this.activeTab === "media") {
                    const count = window.gZenLibraryMediaCount ?? 0;
                    if (window.ZenLibrarySpaces && window.ZenLibrarySpaces.calculateMediaWidth) {
                        targetWidth = window.ZenLibrarySpaces.calculateMediaWidth(count);
                    } else {
                        // Fallback logic if module missing
                        const widthCalc = 340; // Default
                        targetWidth = widthCalc;
                    }
                }

                const startWidthStyle = this.style.getPropertyValue("--zen-library-start-width");
                const startWidth = startWidthStyle ? parseInt(startWidthStyle) : 0;
                const offset = targetWidth - startWidth;

                this.style.setProperty("--zen-library-width", `${targetWidth}px`);
                document.documentElement.style.setProperty("--zen-library-offset", `${offset}px`);

                for (const id in this._sidebarItemEls) {
                    this._sidebarItemEls[id].classList.toggle("active", id === this.activeTab);
                }

                const content = this.shadowRoot.querySelector(".library-content");
                const header = this.shadowRoot.querySelector(".library-header");
                const tabChanged = this._lastRenderedTab !== this.activeTab;
                this._lastRenderedTab = this.activeTab;

                // Header / Search Bar Logic
                if (this.activeTab !== "spaces") {
                    if (tabChanged || !header.firstElementChild) {
                        header.innerHTML = "";
                        let val = "";
                        if (this.history && this.activeTab === "history") val = this.history._searchTerm;
                        else if (this.downloads && this.activeTab === "downloads") val = this.downloads._searchTerm;
                        else if (this.media && this.activeTab === "media") val = this.media._searchTerm;

                        const searchInput = this.el("input", {
                            type: "text",
                            placeholder: `Search ${this.activeTab.charAt(0).toUpperCase() + this.activeTab.slice(1)}...`,
                            value: val,
                            oninput: (e) => {
                                const v = e.target.value;
                                if (this.media && typeof this.media._stopCurrentAudio === "function") {
                                    this.media._stopCurrentAudio();
                                }
                                if (this.activeTab === "history" && this.history) {
                                    this.history._searchTerm = v;
                                    this.history.renderBatch(true);
                                } else if (this.activeTab === "downloads" && this.downloads) {
                                    this.downloads._searchTerm = v;
                                    this.downloads.fetchDownloads().then(d => this.downloads.renderList(d));
                                } else if (this.activeTab === "media" && this.media) {
                                    this.media._searchTerm = v;
                                    this.media.fetchDownloads().then(d => this.media.renderList(d));
                                } else if (this.activeTab === "boosts" && this.boosts) {
                                    this.boosts._searchTerm = v;
                                    this.boosts.renderList();
                                }
                            }
                        });
                        const searchContainer = this.el("div", { className: "search-container" }, [
                            this.el("div", { className: "search-icon-wrapper" }, [
                                this.el("div", { className: "search-icon" })
                            ]),
                            searchInput
                        ]);
                        header.appendChild(searchContainer);

                        // Support for module-specific header extensions (e.g. Media filter bar)
                        const module = this[this.activeTab];
                        if (module && typeof module.renderFilterBar === "function") {
                            header.appendChild(module.renderFilterBar());
                        }
                    }
                } else {
                    header.innerHTML = "";
                }

                // Content Rendering via Feature Modules
                let elToAppend = null;
                let needsAppend = false;

                // Lazy load features if they weren't available during constructor
                if (!this.downloads && window.ZenLibraryDownloads) this.downloads = new window.ZenLibraryDownloads(this);
                if (!this.history && window.ZenLibraryHistory) this.history = new window.ZenLibraryHistory(this);
                if (!this.media && window.ZenLibraryMedia) this.media = new window.ZenLibraryMedia(this);
                if (!this.spaces && window.ZenLibrarySpaces) this.spaces = new window.ZenLibrarySpaces(this);
                if (!this.boosts && window.ZenLibraryBoosts) this.boosts = new window.ZenLibraryBoosts(this);

                if (this.activeTab === "spaces" && this.spaces) {
                    // Spaces has its own intelligent re-render check usually
                    // But for now we delegate completely
                    elToAppend = this.spaces.render();
                    // Optimization: Spaces.render checks if container exists
                    needsAppend = true; // Always append correctly returned wrapper
                }
                else if (this.activeTab === "history" && this.history) {
                    if (!content.querySelector(".library-list-container") || tabChanged) {
                        elToAppend = this.history.render();
                        needsAppend = true;
                    }
                }
                else if (this.activeTab === "downloads" && this.downloads) {
                    if (!content.querySelector(".library-list-container") || tabChanged) {
                        elToAppend = this.downloads.render();
                        needsAppend = true;
                    }
                }
                else if (this.activeTab === "media" && this.media) {
                    if (!content.querySelector(".media-grid") || tabChanged) {
                        elToAppend = this.media.render();
                        needsAppend = true;
                    }
                }
                else if (this.activeTab === "boosts" && this.boosts) {
                    if (!content.querySelector(".library-list-container") || tabChanged) {
                        elToAppend = this.boosts.render();
                        needsAppend = true;
                    }
                }

                if (needsAppend && elToAppend) {
                    content.innerHTML = "";
                    content.appendChild(elToAppend);
                } else if (!this[this.activeTab] && !elToAppend && tabChanged) {
                    // Fallback if module missing
                    content.innerHTML = `<div class="empty-state library-content-fade-in">
                         <div class="empty-icon ${this.activeTab}-icon"></div>
                         <h3>Feature not available</h3>
                         <p>The ${this.activeTab} module is not loaded.</p>
                       </div>`;
                }

            } catch (e) {
                console.error("ZenLibrary Error in update:", e);
                const content = this.shadowRoot.querySelector(".library-content");
                if (content) content.innerHTML = `<div style="color:red; padding:20px;">Error loading content: ${e.message}</div>`;
            }
        }

        el(tag, props = {}, children = []) {
            const el = document.createElement(tag);
            const { className, id, textContent, innerHTML, onclick, src, oncontextmenu, style, dataset, ...other } = props;

            if (className) el.className = className;
            if (id) el.id = id;
            if (textContent !== undefined) el.textContent = textContent;
            if (innerHTML !== undefined) el.innerHTML = innerHTML;
            if (onclick) el.onclick = onclick;
            if (src) el.src = src;
            if (oncontextmenu) el.oncontextmenu = oncontextmenu;

            if (style) {
                if (typeof style === 'string') el.style.cssText = style;
                else Object.assign(el.style, style);
            }

            if (dataset) Object.assign(el.dataset, dataset);

            for (const key in other) {
                if (key.startsWith('on')) el[key] = other[key];
                else el.setAttribute(key, other[key]);
            }

            if (children) {
                if (Array.isArray(children)) {
                    for (const child of children) {
                        if (child) el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
                    }
                } else if (children instanceof Node) {
                    el.appendChild(children);
                } else {
                    el.appendChild(document.createTextNode(String(children)));
                }
            }
            return el;
        }

        svg(svgString) {
            if (!this._svgCache) this._svgCache = new Map();
            if (this._svgCache.has(svgString)) return this._svgCache.get(svgString).cloneNode(true);

            const parser = this._parser || (this._parser = new DOMParser());
            const doc = parser.parseFromString(svgString, "image/svg+xml");
            const node = doc.documentElement;
            if (node) {
                node.removeAttribute("xmlns");
                this._svgCache.set(svgString, node);
                return node.cloneNode(true);
            }
            return null;
        }
    }

    if (!customElements.get("zen-library")) {
        try {
            customElements.define("zen-library", ZenLibraryElement);
            console.log("ZenLibrary: zen-library custom element registered successfully");
        } catch (e) {
            console.error("ZenLibrary: Failed to register zen-library custom element:", e);
        }
    }

    class ZenLibrary {
        constructor() {
            this._isOpen = false;
            this.lastActiveTab = "downloads";
            this._isTransitioning = false;
            this._lastToggleTime = 0;
            this._onKeyDown = this._onKeyDown.bind(this);

            // Initialize Store
            this.store = new ZenStore({
                downloads: [],
                history: [],
                activeTab: 'downloads'
            });

            // Persistent module instances for background pre-fetching
            this._modules = {
                downloads: null,
                history: null,
                media: null,
                spaces: null,
                boosts: null
            };

            this._init();
        }
        update() {
            if (this._element && typeof this._element.update === "function") {
                this._element.update();
            }
        }
        _init() {
            window.addEventListener("keydown", this._onKeyDown, true);
            if (!document.getElementById("zen-library-global-style")) {
                const s = document.createElement("style"); s.id = "zen-library-global-style"; document.head.appendChild(s);
            }

            // Create toolbar button and initialize modules after browser is ready
            setTimeout(() => {
                this._initModules();
                this._createToolbarButton();
            }, 2000);
        }

        /**
         * Initialize persistent module instances and trigger background data fetching
         */
        _initModules() {
            // Create a minimal "shell" object for modules that need library.el helper
            const shell = this._createModuleShell();

            try {
                if (window.ZenLibraryDownloads && !this._modules.downloads) {
                    this._modules.downloads = new window.ZenLibraryDownloads(shell);
                    if (this._modules.downloads.init) this._modules.downloads.init();
                }
                if (window.ZenLibraryHistory && !this._modules.history) {
                    this._modules.history = new window.ZenLibraryHistory(shell);
                    if (this._modules.history.init) this._modules.history.init();
                }
                if (window.ZenLibraryMedia && !this._modules.media) {
                    this._modules.media = new window.ZenLibraryMedia(shell);
                    // Media doesn't need init for now as it's not as critical
                }
                if (window.ZenLibrarySpaces && !this._modules.spaces) {
                    this._modules.spaces = new window.ZenLibrarySpaces(shell);
                }
                if (window.ZenLibraryBoosts && !this._modules.boosts) {
                    this._modules.boosts = new window.ZenLibraryBoosts(shell);
                    if (this._modules.boosts.init) this._modules.boosts.init();
                }
            } catch (e) {
                console.error("ZenLibrary: Module initialization error", e);
            }
        }

        /**
         * Create the toolbar button for toggling Zen Library
         */
        _createToolbarButton() {
            console.log("[ZenLibrary] Creating toggle button for customizable UI");
            
            try {
                CustomizableUI.createWidget({
                    id: "zen-library-button",
                    type: "toolbarbutton",
                    label: "Zen Library",
                    tooltiptext: "Zen Library",
                    onCreated: (node) => {
                        if (node) {
                            node.addEventListener("click", (ev) => {
                                console.log("[ZenLibrary] Button clicked");
                                if (window.gZenLibrary) {
                                    window.gZenLibrary.toggle();
                                }
                            });
                        }
                    }
                });
                
                console.log("ZenLibrary: Toggle button created successfully");
            } catch (e) {
                console.error("[ZenLibrary] Failed to create widget:", e);
                // Fallback: try to find and add click handler to existing button
                setTimeout(() => {
                    const button = document.getElementById("zen-library-button");
                    if (button) {
                        button.addEventListener("click", () => {
                            if (window.gZenLibrary) {
                                window.gZenLibrary.toggle();
                            }
                        });
                        console.log("[ZenLibrary] Added fallback click handler");
                    }
                }, 1000);
            }
        }

        /**
         * Create a minimal shell object that provides the el() helper for modules
         */
        _createModuleShell() {
            return {
                el(tag, props = {}, children = []) {
                    const el = document.createElement(tag);
                    const { className, id, textContent, innerHTML, onclick, src, oncontextmenu, style, dataset, ...other } = props;
                    if (className) el.className = className;
                    if (id) el.id = id;
                    if (textContent !== undefined) el.textContent = textContent;
                    if (innerHTML !== undefined) el.innerHTML = innerHTML;
                    if (onclick) el.onclick = onclick;
                    if (src) el.src = src;
                    if (oncontextmenu) el.oncontextmenu = oncontextmenu;
                    if (style) {
                        if (typeof style === 'string') el.style.cssText = style;
                        else Object.assign(el.style, style);
                    }
                    if (dataset) Object.assign(el.dataset, dataset);
                    for (const key in other) {
                        if (key.startsWith('on')) el[key] = other[key];
                        else el.setAttribute(key, other[key]);
                    }
                    if (children) {
                        if (Array.isArray(children)) {
                            for (const child of children) {
                                if (child) el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
                            }
                        } else if (children instanceof Node) {
                            el.appendChild(children);
                        } else {
                            el.appendChild(document.createTextNode(String(children)));
                        }
                    }
                    return el;
                },
                style: { getPropertyValue: () => "" },
                store: this.store
            };
        }

        /**
         * Get pre-initialized module instances for the library element to use
         */
        getModules() {
            return this._modules;
        }
        _onKeyDown(e) {
            const isMac = Services.appinfo.OS === "Darwin";
            const toggleKey = e.code === "KeyB";

            // Support Alt + Shift + B (Direct fallback/Windows default)
            // AND Cmd + Alt + B (Common macOS alternative)
            const isToggle = toggleKey && (
                (e.altKey && e.shiftKey) ||
                (isMac && e.metaKey && e.altKey)
            );

            if (isToggle) {
                e.preventDefault();
                e.stopPropagation();
                this.toggle();
                return;
            }

            // Override Ctrl+H to open Zen Library History (instead of native history)
            const isHistoryShortcut = e.code === "KeyH" && (isMac ? e.metaKey : e.ctrlKey) && !e.shiftKey && !e.altKey;
            if (isHistoryShortcut) {
                e.preventDefault();
                e.stopPropagation();
                this.openTab("history");
                return;
            }

            // Override Ctrl+J to open Zen Library Downloads (instead of native downloads)
            const isDownloadsShortcut = e.code === "KeyJ" && (isMac ? e.metaKey : e.ctrlKey) && !e.shiftKey && !e.altKey;
            if (isDownloadsShortcut) {
                e.preventDefault();
                e.stopPropagation();
                this.openTab("downloads");
                return;
            }

            if (!this._isOpen || !this._element) return;

            // Allow closing with Escape
            if (e.code === "Escape") {
                this.close();
                e.preventDefault();
                return;
            }

            // Handle Navigation within Library
            const shadow = this._element.shadowRoot;
            if (!shadow) return;

            if (e.code === "ArrowDown" || e.code === "ArrowUp") {
                e.preventDefault();
                this._moveFocus(e.code === "ArrowDown" ? 1 : -1);
            }
        }

        /**
         * Move focus to next/prev focusable element in the library
         */
        _moveFocus(dir) {
            const shadow = this._element.shadowRoot;
            const focusableSelector = '.library-list-item, .history-nav-item, .sidebar-button, input, button, [tabindex="0"]';
            const all = Array.from(shadow.querySelectorAll(focusableSelector))
                .filter(el => el.offsetParent !== null && !el.disabled && el.style.display !== "none");

            if (all.length === 0) return;

            const current = shadow.activeElement;
            let index = all.indexOf(current);

            if (index === -1) {
                // If focus is not in list, focus first item
                index = dir > 0 ? 0 : all.length - 1;
            } else {
                index += dir;
                // Loop around
                if (index < 0) index = all.length - 1;
                if (index >= all.length) index = 0;
            }

            all[index].focus();
            all[index].scrollIntoView({ block: "nearest" });
        }
        destroy() {
            window.removeEventListener("keydown", this._onKeyDown, true);
            const el = document.querySelector("zen-library");
            if (el) el.remove();
        }
        toggle() {
            console.log("[ZenLibrary] Toggle called, _isOpen:", this._isOpen, "_isTransitioning:", this._isTransitioning);
            const now = Date.now();
            if (now - this._lastToggleTime < 100) {
                console.log("[ZenLibrary] Toggle blocked - too soon since last toggle");
                return;
            }
            this._lastToggleTime = now;
            if (this._isTransitioning) {
                console.log("[ZenLibrary] Toggle blocked - currently transitioning");
                return;
            }
            if (this._isOpen && !document.querySelector("zen-library")) {
                console.log("[ZenLibrary] Resetting _isOpen state - element not found");
                this._isOpen = false;
            }
            console.log("[ZenLibrary] Calling", this._isOpen ? "close()" : "open()");
            this._isOpen ? this.close() : this.open();
        }
        
        /**
         * Open the library with a specific tab selected, or close if already on that tab
         * @param {string} tabName - The tab to open ("downloads", "history", "media", "spaces")
         */
        openTab(tabName) {
            console.log("[ZenLibrary] openTab called with:", tabName);
            
            // Validate tab name
            if (!tabName || !["downloads", "history", "media", "spaces", "boosts"].includes(tabName)) {
                console.log("[ZenLibrary] Invalid tab name:", tabName);
                return;
            }
            
            // If already open on the same tab, close the library
            if (this._isOpen && this._element && this._element.activeTab === tabName) {
                console.log("[ZenLibrary] Already open on tab:", tabName, "- closing");
                this.close();
                return;
            }
            
            // Set the desired tab before opening
            this.lastActiveTab = tabName;
            
            // If already open but on a different tab, switch to the requested tab
            if (this._isOpen && this._element) {
                console.log("[ZenLibrary] Already open, switching to tab:", tabName);
                this._element.activeTab = tabName;
                return;
            }
            
            // Otherwise, open the library (it will use lastActiveTab)
            console.log("[ZenLibrary] Opening library with tab:", tabName);
            this.open();
        }
        open() {
            console.log("[ZenLibrary] Open called, _isOpen:", this._isOpen, "_isTransitioning:", this._isTransitioning);
            if (this._isOpen || this._isTransitioning) {
                console.log("[ZenLibrary] Open blocked - already open or transitioning");
                return;
            }
            const b = document.getElementById("browser");
            if (!b) {
                console.log("[ZenLibrary] Open blocked - browser element not found");
                return;
            }

            console.log("[ZenLibrary] Opening library...");
            this._isTransitioning = true;
            this._isOpen = true;

            const isRightSide = document.documentElement.hasAttribute("zen-right-side");
            let isCompactHidden = false;
            try {
                const isCompact = document.documentElement.hasAttribute("zen-compact-mode") && document.documentElement.getAttribute("zen-compact-mode") !== "false";
                const isTabbarHidden = Services.prefs.getBoolPref("zen.view.compact.hide-tabbar", false);
                const isSingleToolbar = document.documentElement.hasAttribute("zen-single-toolbar");
                isCompactHidden = isCompact && (isTabbarHidden || isSingleToolbar);
            } catch (e) { }

            this._element = document.createElement("zen-library");
            console.log("[ZenLibrary] Created element:", this._element);
            console.log("[ZenLibrary] Element constructor:", this._element.constructor.name);
            this._element.id = "zen-library-container";
            if (isRightSide) this._element.setAttribute("right-side", "true");
            this._element.style.zIndex = "1";

            let startWidth = 0;
            if (!isCompactHidden) {
                const t = document.getElementById("navigator-toolbox");
                const s = document.getElementById("zen-sidebar-splitter");
                const sb = document.getElementById("sidebar-box");

                startWidth = (t ? t.getBoundingClientRect().width : 0) +
                    (s ? s.getBoundingClientRect().width : 0) +
                    (sb ? sb.getBoundingClientRect().width : 0);

                if (startWidth === 0) {
                    const cssWidth = getComputedStyle(document.documentElement).getPropertyValue('--zen-sidebar-width').trim();
                    if (cssWidth && cssWidth.endsWith('px')) {
                        startWidth = parseInt(cssWidth);
                    }
                }
            }

            this._element.style.width = startWidth + "px";
            this._element.style.setProperty("--zen-library-start-width", startWidth + "px");
            this._element.style.display = "block";
            this._element.style.visibility = "visible";
            this._element.style.opacity = "1";

            if (isRightSide) b.append(this._element);
            else b.prepend(this._element);
            
            console.log("[ZenLibrary] Element appended to browser, parent:", this._element.parentNode);
            console.log("[ZenLibrary] Element in DOM:", document.contains(this._element));

            if (!isCompactHidden) {
                document.documentElement.setAttribute("zen-library-open", "true");
            } else {
                document.documentElement.setAttribute("zen-library-open-compact", "true");
            }

            requestAnimationFrame(() => requestAnimationFrame(() => {
                if (this._element) {
                    console.log("[ZenLibrary] Calling element.update()");
                    this._element.update();
                } else {
                    console.log("[ZenLibrary] Element not found for update");
                }
            }));

            setTimeout(() => { 
                console.log("[ZenLibrary] Resetting _isTransitioning to false");
                this._isTransitioning = false; 
            }, 400);
        }

        close() {
            if (!this._isOpen || !this._element || this._isTransitioning) return;
            if (this._modules.media && typeof this._modules.media._stopCurrentAudio === "function") {
                this._modules.media._stopCurrentAudio();
            }
            const el = this._element;
            this._isTransitioning = true;
            this._isOpen = false;
            el.classList.add("closing");

            const wasNormalOpen = document.documentElement.hasAttribute("zen-library-open");

            document.documentElement.style.setProperty("--zen-library-offset", "0px");

            const end = () => {
                if (el.parentNode) el.remove();
                if (this._element === el) this._element = null;

                if (!this._isOpen) {
                    document.documentElement.removeAttribute("zen-library-open");
                    document.documentElement.removeAttribute("zen-library-open-compact");
                    document.documentElement.style.removeProperty("--zen-library-offset");
                    document.documentElement.removeAttribute("zen-media-glance-active");

                    if (wasNormalOpen) {
                        document.documentElement.classList.add("zen-toolbox-fading-in");
                        setTimeout(() => {
                            if (!this._isOpen) document.documentElement.classList.remove("zen-toolbox-fading-in");
                        }, 400);
                    }
                    this._isTransitioning = false;
                }
            };

            setTimeout(end, 300);
        }
    }

    window.gZenLibrary = new ZenLibrary();
})();
