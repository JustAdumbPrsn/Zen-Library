"use strict";

(function () {
    class ZenLibraryBoosts {
        constructor(library) {
            this.library = library;
            this._container = null;
            this._searchTerm = "";
            this._items = []; // [{ domain, boosts: [...], activeId }]
            this._initialized = false;
            this._isFetching = false;
            this._observer = null;
        }

        get el() { return this.library.el.bind(this.library); }

        _getManager() {
            try {
                const { gZenBoostsManager } = ChromeUtils.importESModule(
                    "resource:///modules/zen/boosts/ZenBoostsManager.sys.mjs"
                );
                return gZenBoostsManager;
            } catch (e) {
                console.error("[ZenLibrary Boosts] Failed to import ZenBoostsManager:", e);
                return null;
            }
        }

        async init() {
            if (this._isFetching || this._initialized) return;
            this._isFetching = true;
            try {
                await this.fetchBoosts();
                this._initialized = true;
                this._startObserving();
            } catch (e) {
                console.error("[ZenLibrary Boosts] init error:", e);
            } finally {
                this._isFetching = false;
            }
        }

        _startObserving() {
            if (this._observer) return;
            this._observer = {
                observe: (subject, topic) => {
                    if (topic === "zen-boosts-update") {
                        // Re-fetch only if the panel is visible, otherwise mark stale
                        // so next render() picks up fresh data.
                        // We intentionally do NOT re-fetch on every toggle because
                        // registeredBoostForDomain returns false for disabled boosts,
                        // which would remove them from the list.
                        this._stale = true;
                        if (this._container) this.renderList();
                    }
                }
            };
            Services.obs.addObserver(this._observer, "zen-boosts-update");
            window.addEventListener("unload", () => {
                if (this._observer) {
                    Services.obs.removeObserver(this._observer, "zen-boosts-update");
                    this._observer = null;
                }
            }, { once: true });
        }

        async fetchBoosts() {
            const mgr = this._getManager();
            if (!mgr) {
                console.warn("[ZenLibrary Boosts] No manager available");
                this._items = [];
                return;
            }

            const results = [];
            const seenDomains = new Set();

            try {
                // Walk history to find all domains that have boosts
                const { PlacesUtils } = ChromeUtils.importESModule(
                    "resource://gre/modules/PlacesUtils.sys.mjs"
                );
                const query = PlacesUtils.history.getNewQuery();
                const options = PlacesUtils.history.getNewQueryOptions();
                options.sortingMode = options.SORT_BY_DATE_DESCENDING;
                options.maxResults = 2000;

                const result = PlacesUtils.history.executeQuery(query, options);
                const root = result.root;
                root.containerOpen = true;

                for (let i = 0; i < root.childCount; i++) {
                    const node = root.getChild(i);
                    try {
                        const uri = Services.io.newURI(node.uri);
                        const domain = uri.host;
                        if (!domain || seenDomains.has(domain)) continue;
                        seenDomains.add(domain);

                        // Use loadBoostsFromStore directly — registeredBoostForDomain
                        // returns false for disabled boosts, so we skip that check.
                        const boosts = mgr.loadBoostsFromStore(domain);
                        if (!boosts || boosts.length === 0) continue;

                        const validBoosts = boosts.filter(
                            b => b && b.boostEntry && b.boostEntry.boostData && b.boostEntry.boostData.changeWasMade
                        );
                        if (validBoosts.length === 0) continue;

                        const activeId = mgr.getActiveBoostId(domain);
                        results.push({ domain, boosts: validBoosts, activeId });
                    } catch (_) { /* skip invalid URIs */ }
                }

                root.containerOpen = false;
            } catch (e) {
                console.error("[ZenLibrary Boosts] fetchBoosts error:", e);
            }

            console.log(`[ZenLibrary Boosts] Found ${results.length} boosted domains`);
            this._items = results;
        }

        render() {
            const wrapper = this.el("div", { className: "library-list-wrapper" });
            const container = this.el("div", { className: "library-list-container" });
            wrapper.appendChild(container);
            this._container = container;
            this._startObserving();

            if (this._initialized) {
                if (this._stale) {
                    this._stale = false;
                    this.fetchBoosts().then(() => {
                        this.renderList();
                        container.classList.add("library-content-fade-in");
                        setTimeout(() => container.classList.add("scrollbar-visible"), 100);
                    });
                } else {
                    this.renderList();
                }
                container.classList.add("library-content-fade-in");
                setTimeout(() => container.classList.add("scrollbar-visible"), 100);
                return wrapper;
            }

            // Show loading state while fetching
            container.appendChild(this.el("div", { className: "empty-state library-content-fade-in" }, [
                this.el("div", { className: "empty-icon boosts-icon" }),
                this.el("h3", { textContent: "Loading boosts..." }),
                this.el("p", { textContent: "Gathering your site boosts." })
            ]));

            const delay = (window.gZenLibrary && window.gZenLibrary._isTransitioning) ? 400 : 200;
            setTimeout(() => {
                this.fetchBoosts().then(() => {
                    this._initialized = true;
                    container.innerHTML = "";
                    this.renderList();
                    container.classList.add("library-content-fade-in");
                    setTimeout(() => container.classList.add("scrollbar-visible"), 100);
                });
            }, delay);

            return wrapper;
        }

        _ensureContextMenu() {
            if (document.getElementById("zen-boosts-context-menu")) return;

            const popup = document.createXULElement("menupopup");
            popup.id = "zen-boosts-context-menu";

            const renameItem = document.createXULElement("menuitem");
            renameItem.id = "zen-boosts-ctx-rename";
            renameItem.setAttribute("label", "Rename boost");

            const deleteItem = document.createXULElement("menuitem");
            deleteItem.id = "zen-boosts-ctx-delete";
            deleteItem.setAttribute("label", "Delete boost");


            popup.appendChild(renameItem);
            popup.appendChild(document.createXULElement("menuseparator"));
            popup.appendChild(deleteItem);
            document.getElementById("mainPopupSet")?.appendChild(popup) || document.body.appendChild(popup);
        }

        _showContextMenu(event, domain, boost, onRenamed, onDeleted) {
            this._ensureContextMenu();
            const popup = document.getElementById("zen-boosts-context-menu");
            const renameItem = document.getElementById("zen-boosts-ctx-rename");
            const deleteItem = document.getElementById("zen-boosts-ctx-delete");

            // Replace listeners each time to bind correct boost
            const newRename = renameItem.cloneNode(true);
            const newDelete = deleteItem.cloneNode(true);
            renameItem.replaceWith(newRename);
            deleteItem.replaceWith(newDelete);

            newRename.addEventListener("command", () => {
                const mgr = this._getManager();
                if (!mgr) return;
                const current = boost.boostEntry.boostData.boostName || domain;
                const input = { value: current };
                const ok = Services.prompt.prompt(window, "Rename Boost", null, input, null, { value: false });
                if (!ok || !input.value.trim()) return;
                boost.boostEntry.boostData.boostName = input.value.trim().substring(0, 30);
                boost.boostEntry.boostData.changeWasMade = true;
                mgr.saveBoostToStore(boost);
                onRenamed(boost.boostEntry.boostData.boostName);
            });

            newDelete.addEventListener("command", () => {
                const mgr = this._getManager();
                if (!mgr) return;
                const boostName = boost.boostEntry.boostData.boostName || domain;
                const confirmed = Services.prompt.confirm(window, "Delete This Boost?", `This can't be undone.`);
                if (!confirmed) return;
                mgr.deleteBoost(boost);
                // Remove from local cache and re-render
                const entry = this._items.find(e => e.domain === domain);
                if (entry) {
                    entry.boosts = entry.boosts.filter(b => b.id !== boost.id);
                    if (entry.boosts.length === 0) {
                        this._items = this._items.filter(e => e.domain !== domain);
                    }
                }
                onDeleted();
            });

            popup.openPopupAtScreen(event.screenX, event.screenY, true);
        }

        renderList() {
            if (!this._container) return;
            this._container.innerHTML = "";

            const mgr = this._getManager();

            const filtered = this._searchTerm
                ? this._items.filter(entry =>
                    entry.domain.toLowerCase().includes(this._searchTerm.toLowerCase()) ||
                    entry.boosts.some(b =>
                        (b.boostEntry.boostData.boostName || "").toLowerCase().includes(this._searchTerm.toLowerCase())
                    )
                )
                : this._items;

            if (filtered.length === 0) {
                this._container.appendChild(this.el("div", { className: "empty-state" }, [
                    this.el("div", { className: "empty-icon boosts-icon" }),
                    this.el("h3", { textContent: this._searchTerm ? "No results found" : "No boosts found" }),
                    this.el("p", { textContent: this._searchTerm ? "Try a different search term." : "Visit a site and create a boost to see it here." })
                ]));
                return;
            }

            const fragment = document.createDocumentFragment();

            for (const entry of filtered) {
                const { domain, boosts } = entry;
                // Re-fetch active ID live so toggle reflects current state
                const activeId = mgr ? mgr.getActiveBoostId(domain) : entry.activeId;

                fragment.appendChild(this.el("div", {
                    className: "history-section-header",
                    textContent: domain
                }));

                for (const boost of boosts) {
                    const boostData = boost.boostEntry.boostData;
                    const boostId = boost.id;
                    // Always read live from manager so toggle state is accurate after obs fires
                    const isEnabled = mgr ? (mgr.getActiveBoostId(domain) === boostId) : (boostId === activeId);

                    const row = this.el("div", {
                        className: `library-list-item boosts-item${isEnabled ? "" : " boosts-disabled"}`
                    });

                    // Favicon
                    const iconContainer = this.el("div", { className: "item-icon-container" });
                    iconContainer.appendChild(this.el("div", {
                        className: "item-icon",
                        style: `background-image: url('page-icon:https://${domain}');`
                    }));
                    row.appendChild(iconContainer);

                    // Name + URL
                    const info = this.el("div", { className: "item-info" });
                    info.appendChild(this.el("div", {
                        className: "item-title",
                        textContent: boostData.boostName || domain
                    }));
                    info.appendChild(this.el("div", {
                        className: "item-url",
                        textContent: `https://${domain}`
                    }));
                    row.appendChild(info);

                    // Toggle
                    const toggle = this._createToggle(isEnabled, () => {
                        if (!mgr) return;
                        mgr.toggleBoostActiveForDomain(domain, boostId);
                        const nowEnabled = mgr.getActiveBoostId(domain) === boostId;
                        row.classList.toggle("boosts-disabled", !nowEnabled);
                    });
                    row.appendChild(toggle);

                    row.onclick = (e) => {
                        if (e.target.closest(".boosts-toggle")) return;
                        window.gBrowser.selectedTab = window.gBrowser.addTab(`https://${domain}`, {
                            triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
                        });
                        window.gZenLibrary.close();
                    };

                    row.oncontextmenu = (e) => {
                        e.preventDefault();
                        this._showContextMenu(
                            e,
                            domain,
                            boost,
                            (newName) => {
                                // Update title in place
                                row.querySelector(".item-title").textContent = newName;
                            },
                            () => {
                                // Animate out then re-render
                                row.style.transition = "opacity 0.15s, transform 0.15s";
                                row.style.opacity = "0";
                                row.style.transform = "translateX(-8px)";
                                setTimeout(() => this.renderList(), 160);
                            }
                        );
                    };

                    fragment.appendChild(row);
                }
            }

            fragment.appendChild(this.el("div", { className: "history-bottom-spacer" }));
            this._container.appendChild(fragment);
        }

        _createToggle(checked, onToggle) {
            const toggle = this.el("div", { className: "boosts-toggle" });
            toggle.setAttribute("checked", checked ? "true" : "false");

            const track = this.el("div", { className: "boosts-toggle-track" });
            const thumb = this.el("div", {
                className: "boosts-toggle-thumb",
                style: `transform: translateX(${checked ? 14 : 0}px);`
            });
            track.appendChild(thumb);
            toggle.appendChild(track);

            toggle.onclick = (e) => {
                e.stopPropagation();
                const isChecked = toggle.getAttribute("checked") === "true";
                const next = !isChecked;
                toggle.setAttribute("checked", next ? "true" : "false");
                thumb.style.transform = `translateX(${next ? 14 : 0}px)`;
                onToggle(next);
            };

            return toggle;
        }
    }

    window.ZenLibraryBoosts = ZenLibraryBoosts;
    console.log("[ZenLibrary Boosts] Module loaded");
})();
