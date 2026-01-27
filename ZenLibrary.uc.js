"use strict";

(function () {
    // Cleanup previous instance
    if (window.gZenLibrary && window.gZenLibrary.destroy) {
        window.gZenLibrary.destroy();
    }

    const _ucScriptPath = Components.stack.filename;

    // Initialize features if they are not yet loaded (Assumption: they are loaded via UC loader or manual scripts)
    // If we needed to force load them, we would use Services.scriptloader.loadSubScript here.

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
        customElements.define('zen-library-item', ZenLibraryItem);
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

            // Update the library reference on pre-initialized modules so they can use our el() helper
            if (this.downloads) this.downloads.library = this;
            if (this.history) this.history.library = this;
            if (this.media) this.media.library = this;
            if (this.spaces) this.spaces.library = this;
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
            try {
                if (!this._initialized) {
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
                    const sidebarItems = ["downloads", "media", "history", "spaces"];
                    const parser = new DOMParser();

                    sidebarItems.forEach(id => {
                        const item = document.createElement("div");
                        item.className = "sidebar-button";
                        item.dataset.id = id;

                        let iconSvg;
                        if (id === "downloads") {
                            iconSvg = `
<svg class="icon downloads-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="9" stroke="var(--zen-folder-stroke)" stroke-width="2" fill="var(--zen-folder-front-bgcolor)" fill-opacity="0"/>
  <path d="M12 8V16M9 13L12 16L15 13" stroke="var(--zen-folder-stroke)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
                        } else if (id === "history") {
                            iconSvg = `
<svg class="icon history-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="9" stroke="var(--zen-folder-stroke)" stroke-width="2" fill="var(--zen-folder-front-bgcolor)" fill-opacity="0"/>
  <path d="M12 7V12 L 15.5 14" stroke="var(--zen-folder-stroke)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
                        } else if (id === "media") {
                            iconSvg = `
<svg class="icon media-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <mask id="media-mask">
      <rect x="0" y="0" width="24" height="24" fill="white"/>
      <rect x="6" y="7" width="14" height="12" rx="2" fill="black"/>
    </mask>
  </defs>
  <g class="back" transform="rotate(-15 12 12)" mask="url(#media-mask)">
    <rect class="back-rect" x="4" y="5" width="14" height="12" rx="2" stroke="var(--zen-folder-stroke)" stroke-width="2" fill="var(--zen-folder-behind-bgcolor)" fill-opacity="0"/>
  </g>
  <g class="front">
    <rect class="front-rect" x="6" y="7" width="14" height="12" rx="2" stroke="var(--zen-folder-stroke)" stroke-width="2" fill="var(--zen-folder-front-bgcolor)" fill-opacity="0"/>
    <circle class="sun" cx="10" cy="12.5" r="1.5" fill="var(--zen-folder-stroke)" fill-opacity="0.7" />
    <path class="mountain" d="M6 19Q9 14 10.5 15.5T13 15Q14.5 13 16 14T20 19H6Z" fill="var(--zen-folder-stroke)" fill-opacity="0"/>
  </g>
</svg>`;
                        } else if (id === "spaces") {
                            iconSvg = `
<svg class="icon spaces-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <mask id="spaces-mask">
      <rect x="0" y="0" width="24" height="24" fill="white"/>
      <rect x="9" y="6" width="10" height="14" rx="2" fill="black"/>
    </mask>
  </defs>
  <g class="back" transform="rotate(-15 12 12)" mask="url(#spaces-mask)">
    <rect class="back-rect" x="6" y="4" width="10" height="14" rx="2" stroke="var(--zen-folder-stroke)" stroke-width="2" fill="var(--zen-folder-behind-bgcolor)" fill-opacity="0"/>
  </g>
  <g class="front">
    <rect class="front-rect" x="9" y="6" width="10" height="14" rx="2" stroke="var(--zen-folder-stroke)" stroke-width="2" fill="var(--zen-folder-front-bgcolor)" fill-opacity="0"/>
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
                }
                this.setAttribute("active-tab", this.activeTab);
                this.update();
                this.getBoundingClientRect();
                requestAnimationFrame(() => requestAnimationFrame(() => this.style.width = ""));
            } catch (e) {
                console.error("ZenLibrary Error in connectedCallback:", e);
            }
        }

        update() {
            try {
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

    if (!customElements.get("zen-library")) customElements.define("zen-library", ZenLibraryElement);

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
                spaces: null
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
                    id: "zen-library-button",                // required
                    type: "toolbarbutton",                   // "toolbaritem" or "toolbarbutton"
                    label: "Zen Library",                    // optional (uses id when missing)
                    tooltip: "Zen Library",                  // optional (uses id when missing)
                    class: "zen-library-button",             // optional additional className
                    callback: (ev, win) => {                 // Function called when clicked
                        if (win.gZenLibrary) {
                            win.gZenLibrary.toggle();
                        }
                    }
                });
                
                // Add event listener as fallback in case callback doesn't work
                setTimeout(() => {
                    const button = document.getElementById("zen-library-button");
                    if (button) {
                        button.addEventListener("click", (ev) => {
                            console.log("[ZenLibrary] Button clicked via event listener");
                            if (window.gZenLibrary) {
                                window.gZenLibrary.toggle();
                            }
                        });
                        console.log("[ZenLibrary] Event listener added to button");
                    } else {
                        console.warn("[ZenLibrary] Button element not found for event listener");
                    }
                }, 1000);
                
                console.log("[ZenLibrary] Toggle button created successfully");
            } catch (e) {
                console.error("[ZenLibrary] Failed to create widget:", e);
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
            const now = Date.now();
            if (now - this._lastToggleTime < 100) return;
            this._lastToggleTime = now;
            if (this._isTransitioning) return;
            if (this._isOpen && !document.querySelector("zen-library")) this._isOpen = false;
            this._isOpen ? this.close() : this.open();
        }
        open() {
            if (this._isOpen || this._isTransitioning) return;
            const b = document.getElementById("browser");
            if (!b) return;

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

            if (isRightSide) b.append(this._element);
            else b.prepend(this._element);

            if (!isCompactHidden) {
                document.documentElement.setAttribute("zen-library-open", "true");
            } else {
                document.documentElement.setAttribute("zen-library-open-compact", "true");
            }

            requestAnimationFrame(() => requestAnimationFrame(() => {
                if (this._element) this._element.update();
            }));

            setTimeout(() => { this._isTransitioning = false; }, 400);
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
