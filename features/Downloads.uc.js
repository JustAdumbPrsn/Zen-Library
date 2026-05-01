"use strict";

(function () {
    class ZenLibraryDownloads {
        constructor(library) {
            this.library = library;
            this._container = null;
            this._searchTerm = "";
            this._cachedDownloads = null; // Pre-fetched data cache
            this._isFetching = false;
            this._progressTimer = null;
        }

        /**
         * Background initialization - called at startup to pre-fetch data
         */
        async init() {
            if (this._isFetching) return;
            this._isFetching = true;
            try {
                this._cachedDownloads = await this.fetchDownloads();
            } catch (e) {
                console.error("ZenLibrary Downloads init error:", e);
            } finally {
                this._isFetching = false;
            }
        }

        get el() { return this.library.el.bind(this.library); }

        render() {
            // Main wrapper for switcher and panes
            const wrapper = this.el("div", {
                className: "library-list-wrapper"
            });
            const container = this.el("div", { className: "library-list-container" });
            wrapper.appendChild(container);
            this._container = container;
            this.library._downloadsContainer = container;

            // If we have cached data, render instantly
            if (this._cachedDownloads) {
                this.renderList(this._cachedDownloads);
                container.classList.add("library-content-fade-in");
                setTimeout(() => container.classList.add("scrollbar-visible"), 50);
                // Trigger a background sync to check for updates
                this.sync();
                return wrapper;
            }

            // No cache - show loading and fetch
            const loading = this.el("div", { className: "empty-state library-content-fade-in" }, [
                this.el("div", { className: "empty-icon downloads-icon" }),
                this.el("h3", { textContent: "Loading downloads..." }),
                this.el("p", { textContent: "Hang tight, we're gathering your download history." })
            ]);
            container.appendChild(loading);

            const isTransitioning = window.gZenLibrary && window.gZenLibrary._isTransitioning;
            const delay = isTransitioning ? 300 : 100;
            setTimeout(() => {
                this.fetchDownloads().then(downloads => {
                    this._cachedDownloads = downloads;
                    const l = container.querySelector(".empty-state");
                    if (l) l.remove();
                    this.renderList(downloads);
                    container.classList.add("library-content-fade-in");
                    setTimeout(() => container.classList.add("scrollbar-visible"), 100);
                });
            }, delay);

            return wrapper;
        }

        /**
         * Sync - called after rendering cached data to check for updates
         * Always re-fetches to detect status changes (e.g., deleted files)
         */
        async sync() {
            try {
                const freshDownloads = await this.fetchDownloads();

                // Always update cache and re-render to catch status changes
                // Status changes (deleted, completed) don't change length/timestamp
                this._cachedDownloads = freshDownloads;
                this.renderList(freshDownloads);
            } catch (e) {
                console.error("ZenLibrary Downloads sync error:", e);
            }
        }


        async fetchDownloads() {
            try {
                const { DownloadHistory } = ChromeUtils.importESModule("resource://gre/modules/DownloadHistory.sys.mjs");
                const { Downloads } = ChromeUtils.importESModule("resource://gre/modules/Downloads.sys.mjs");
                const { PrivateBrowsingUtils } = ChromeUtils.importESModule("resource://gre/modules/PrivateBrowsingUtils.sys.mjs");

                const isPrivate = PrivateBrowsingUtils.isContentWindowPrivate(window);
                const historyList = await DownloadHistory.getList({ type: isPrivate ? Downloads.ALL : Downloads.PUBLIC });
                const allDownloadsRaw = await historyList.getAll();
                const liveDownloads = await this.fetchLiveDownloads(Downloads);

                return allDownloadsRaw.map(d => {
                    const liveDownload = this.findMatchingLiveDownload(d, liveDownloads);
                    const progressSource = liveDownload || d;
                    let filename = "Unknown Filename";
                    let targetPath = "";
                    let fileExists = false;

                    if (d.target && d.target.path) {
                        try {
                            let file = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsIFile);
                            file.initWithPath(d.target.path);
                            fileExists = file.exists();
                            filename = file.leafName;
                            targetPath = d.target.path;
                        } catch (e) {
                            const pathParts = String(d.target.path).split(/[\\/]/);
                            filename = pathParts.pop() || "ErrorInPathUtil";
                        }
                    }

                    if ((filename === "Unknown Filename" || filename === "ErrorInPathUtil") && d.source && d.source.url) {
                        try {
                            const decodedUrl = decodeURIComponent(d.source.url);
                            let urlObj;
                            try {
                                urlObj = new URL(decodedUrl);
                                const pathSegments = urlObj.pathname.split("/");
                                filename = pathSegments.pop() || pathSegments.pop() || "Unknown from URL Path";
                            } catch (urlParseError) {
                                const urlPartsDirect = String(d.source.url).split("/");
                                const lastPartDirect = urlPartsDirect.pop() || urlPartsDirect.pop();
                                filename = lastPartDirect.split("?")[0] || "Invalid URL Filename";
                            }
                        } catch (e) {
                            const urlPartsDirect = String(d.source.url).split("/");
                            const lastPartDirect = urlPartsDirect.pop() || urlPartsDirect.pop();
                            filename = lastPartDirect.split("?")[0] || "Invalid URL Filename";
                        }
                    }

                    let status = "unknown";
                    let progressBytes = Number(progressSource.currentBytes ?? progressSource.bytesTransferredSoFar) || 0;
                    let totalBytes = Number(progressSource.totalBytes ?? d.totalBytes) || 0;

                    if (progressSource.succeeded) {
                        status = "completed";
                        if (progressSource.target && progressSource.target.size && Number(progressSource.target.size) > totalBytes) {
                            totalBytes = Number(progressSource.target.size);
                        }
                        progressBytes = Number(progressSource.currentBytes || totalBytes) || totalBytes;
                    } else if (progressSource.error || progressSource.canceled) {
                        status = "failed";
                    } else if (!progressSource.stopped || progressSource.state === Downloads.STATE_DOWNLOADING) {
                        status = "downloading";
                    } else if (progressSource.hasPartialData || progressSource.state === Downloads.STATE_PAUSED || progressSource.stopped) {
                        status = "paused";
                    }

                    if (status === "completed" && totalBytes === 0 && progressBytes > 0) {
                        totalBytes = progressBytes;
                    }

                    if (status === "completed" && d.target && d.target.path && !fileExists) {
                        status = "deleted";
                    }

                    return {
                        id: d.id,
                        filename: String(filename || "FN_MISSING"),
                        size: totalBytes,
                        progressBytes,
                        totalBytes,
                        percent: totalBytes > 0 ? Math.min(100, Math.max(0, (progressBytes / totalBytes) * 100)) : 0,
                        estimatedSeconds: this.estimateRemainingSeconds(progressSource, progressBytes, totalBytes),
                        status: status,
                        url: String(d.source?.url || "URL_MISSING"),
                        timestamp: d.endTime || d.startTime || Date.now(),
                        targetPath: String(targetPath || ""),
                        raw: liveDownload || d,
                        historyRaw: d
                    };
                }).filter(d => d.timestamp && (this._searchTerm ? d.filename.toLowerCase().includes(this._searchTerm.toLowerCase()) : true));

            } catch (e) {
                console.error("ZenLibrary: Error fetching downloads", e);
                return [];
            }
        }

        async fetchLiveDownloads(Downloads) {
            try {
                const downloadApi = window.Downloads && typeof window.Downloads.getList === "function" ? window.Downloads : Downloads;
                const listType = downloadApi.ALL || Downloads.ALL;
                const list = await downloadApi.getList(listType);
                return await list.getAll();
            } catch (e) {
                console.warn("[ZenLibrary Downloads] Live download lookup failed:", e);
                return [];
            }
        }

        findMatchingLiveDownload(download, liveDownloads) {
            if (!liveDownloads || !liveDownloads.length) return null;

            if (download.id != null) {
                const byId = liveDownloads.find(dl => dl.id != null && String(dl.id) === String(download.id));
                if (byId) return byId;
            }

            if (download.target?.path) {
                const normalizedPath = this.normalizeDownloadPath(download.target.path);
                const byPath = liveDownloads.find(dl => this.normalizeDownloadPath(dl.target?.path) === normalizedPath);
                if (byPath) return byPath;
            }

            if (download.source?.url && download.startTime) {
                const startTime = new Date(download.startTime).getTime();
                const byUrlTime = liveDownloads.find(dl => {
                    if (dl.source?.url !== download.source.url || !dl.startTime) return false;
                    return Math.abs(new Date(dl.startTime).getTime() - startTime) < 5000;
                });
                if (byUrlTime) return byUrlTime;
            }

            return null;
        }

        normalizeDownloadPath(path) {
            return typeof path === "string" ? path.replace(/\\/g, "/").toLowerCase() : "";
        }

        estimateRemainingSeconds(download, progressBytes, totalBytes) {
            if (!totalBytes || !progressBytes || progressBytes >= totalBytes) return null;

            const liveSpeed = Number(download.speed) || 0;
            if (liveSpeed > 0) {
                return Math.max(1, Math.round((totalBytes - progressBytes) / liveSpeed));
            }

            const start = download.startTime ? new Date(download.startTime).getTime() : 0;
            const elapsedSeconds = start ? Math.max(1, (Date.now() - start) / 1000) : 0;
            if (!elapsedSeconds) return null;

            const bytesPerSecond = progressBytes / elapsedSeconds;
            if (!bytesPerSecond || !Number.isFinite(bytesPerSecond)) return null;

            return Math.max(1, Math.round((totalBytes - progressBytes) / bytesPerSecond));
        }

        scheduleProgressRefresh(downloads) {
            if (this._progressTimer) {
                clearTimeout(this._progressTimer);
                this._progressTimer = null;
            }

            if (!downloads.some(d => d.status === "downloading")) return;

            this._progressTimer = setTimeout(async () => {
                this._progressTimer = null;
                if (!this._container || this.library.activeTab !== "downloads") return;

                const freshDownloads = await this.fetchDownloads();
                this._cachedDownloads = freshDownloads;
                this.renderList(freshDownloads);
            }, 1000);
        }

        renderList(downloads) {
            try {
                if (!this._container) return;
                
                // Check if custom elements are properly registered
                if (!customElements.get('zen-library-item')) {
                    console.error("ZenLibrary Error in renderList: zen-library-item custom element not registered");
                    return;
                }
                
                this._container.innerHTML = "";
                this._container.classList.add("scrollbar-visible");

                if (downloads.length === 0) {
                    const emptyState = this.el("div", { className: "empty-state" }, [
                        this.el("div", { className: "empty-icon downloads-icon" }),
                        this.el("h3", { textContent: "No downloads found" }),
                        this.el("p", { textContent: this._searchTerm ? "Try a different search term." : "Your download history is empty." })
                    ]);
                    this._container.appendChild(emptyState);
                    return;
                }

                // Group by date — compare calendar dates, not elapsed hours
                const groups = {};
                const now = new Date();
                const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const yesterdayMidnight = new Date(todayMidnight);
                yesterdayMidnight.setDate(yesterdayMidnight.getDate() - 1);
                const weekAgoMidnight = new Date(todayMidnight);
                weekAgoMidnight.setDate(weekAgoMidnight.getDate() - 7);
                const monthAgoMidnight = new Date(todayMidnight);
                monthAgoMidnight.setDate(monthAgoMidnight.getDate() - 30);

                downloads.forEach(d => {
                    const date = new Date(d.timestamp);
                    const dateMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                    let key;
                    if (dateMidnight.getTime() === todayMidnight.getTime()) {
                        key = "Today";
                    } else if (dateMidnight.getTime() === yesterdayMidnight.getTime()) {
                        key = "Yesterday";
                    } else if (dateMidnight >= weekAgoMidnight) {
                        key = date.toLocaleDateString(undefined, { weekday: "long" });
                    } else if (dateMidnight >= monthAgoMidnight) {
                        key = "Last Month";
                    } else {
                        key = "Earlier";
                    }
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(d);
                });

                const order = ["Today", "Yesterday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Last Month", "Earlier"];

                order.forEach(key => {
                    if (!groups[key]) return;

                    this._container.appendChild(this.el("div", { className: "history-section-header", textContent: key }));

                    groups[key].sort((a, b) => b.timestamp - a.timestamp).forEach(item => {
                        try {
                            if (item.status === "downloading") {
                                this._container.appendChild(this.createProgressItem(item));
                                return;
                            }

                            const timeStr = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            const itemEl = document.createElement('zen-library-item');
                            if (!itemEl || typeof itemEl.setAttribute !== 'function') {
                                console.error("ZenLibrary Error: zen-library-item custom element not properly registered");
                                return;
                            }
                            
                            itemEl.data = item; // Sets item data and status classes
                            itemEl.setAttribute("icon", `moz-icon://${item.targetPath}?size=32`);
                            itemEl.setAttribute("title", item.filename);
                            itemEl.setAttribute("subtitle", `${this.formatBytes(item.size)} • ${item.status}`);
                            itemEl.setAttribute("time", timeStr);

                            itemEl.onclick = (e) => {
                                // Ignore clicks on the folder icon, handled separately
                                if (e.target.closest('.item-folder-icon')) return;
                                this.handleAction(item, "open");
                            };
                            itemEl.oncontextmenu = (e) => {
                                e.preventDefault();
                                this._showContextMenu(e, item, itemEl);
                            };

                            // Add drag-and-drop support for dragging to web pages
                            itemEl.setAttribute('draggable', 'true');
                            itemEl.addEventListener('dragstart', async (e) => {
                                // Only allow drag if we have a file path and file exists
                                if (!item.targetPath || item.status === 'deleted') {
                                    e.preventDefault();
                                    return;
                                }

                                try {
                                    const file = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsIFile);
                                    file.initWithPath(item.targetPath);
                                    
                                    if (!file.exists()) {
                                        e.preventDefault();
                                        return;
                                    }

                                    // Set the native file flavor for Firefox
                                    if (e.dataTransfer && typeof e.dataTransfer.mozSetDataAt === 'function') {
                                        e.dataTransfer.mozSetDataAt('application/x-moz-file', file, 0);
                                    }

                                    // Set URI flavors for web pages
                                    const fileUrl = file.path.startsWith('\\') ? 
                                        'file:' + file.path.replace(/\\/g, '/') : 
                                        'file:///' + file.path.replace(/\\/g, '/');
                                    
                                    if (fileUrl) {
                                        e.dataTransfer.setData('text/uri-list', fileUrl);
                                        e.dataTransfer.setData('text/plain', fileUrl);
                                    }

                                    // Optionally, set a download URL for HTML5 drop targets
                                    if (item.url) {
                                        const contentType = this.getContentTypeFromFilename(item.filename);
                                        e.dataTransfer.setData('DownloadURL', `${contentType}:${item.filename}:${item.url}`);
                                    }

                                    // Use the item element as drag image
                                    e.dataTransfer.setDragImage(itemEl, 20, 20);
                                } catch (err) {
                                    console.error('[ZenLibrary Downloads] Error during dragstart:', err);
                                    e.preventDefault();
                                }
                            });

                            const folderIcon = this.el("div", {
                                className: `item-folder-icon${item.status === "deleted" ? " disabled" : ""}`,
                                title: item.status === "deleted" ? "File deleted" : "Show in Folder",
                                onclick: (e) => {
                                    e.stopPropagation();
                                    if (item.status === "deleted") return;
                                    this.handleAction(item, "show");
                                },
                                innerHTML: `<div class="item-folder-mask"></div>`
                            });

                            itemEl.appendSecondaryAction(folderIcon);
                            this._container.appendChild(itemEl);
                        } catch (itemError) {
                            console.error("ZenLibrary Error processing download item:", itemError, item);
                        }
                    });
                });

                this._container.appendChild(this.el("div", { className: "history-bottom-spacer" }));
                this.scheduleProgressRefresh(downloads);
            } catch (e) {
                console.error("ZenLibrary Error in renderList:", e);
            }
        }

        createProgressItem(item) {
            const percentLabel = item.totalBytes > 0 ? `${Math.round(item.percent)}%` : "";
            const totalLabel = item.totalBytes > 0 ? this.formatBytes(item.totalBytes) : "Unknown size";
            const etaLabel = item.estimatedSeconds ? this.formatDuration(item.estimatedSeconds) : "Calculating";

            const row = this.el("div", {
                className: "library-download-progress-item",
                oncontextmenu: (e) => {
                    e.preventDefault();
                    this._showContextMenu(e, item, row);
                }
            }, [
                this.el("div", { className: "download-progress-icon-container" }, [
                    this.el("div", {
                        className: "download-progress-icon",
                        style: item.targetPath ? `background-image: url("moz-icon://${item.targetPath}?size=32");` : ""
                    })
                ]),
                this.el("div", { className: "download-progress-main" }, [
                    this.el("div", { className: "download-progress-title-row" }, [
                        this.el("span", { className: "download-progress-name", textContent: item.filename }),
                        this.el("span", { className: "download-progress-percent", textContent: percentLabel })
                    ]),
                    this.el("div", { className: "download-progress-bar" }, [
                        this.el("div", {
                            className: "download-progress-fill",
                            style: `width: ${item.totalBytes > 0 ? item.percent : 18}%;`
                        })
                    ]),
                    this.el("div", { className: "download-progress-meta" }, [
                        this.el("span", { textContent: `${this.formatBytes(item.progressBytes)} of ${totalLabel}` }),
                        this.el("span", { textContent: etaLabel })
                    ])
                ]),
                this.el("button", {
                    className: "download-progress-cancel",
                    title: "Cancel download",
                    "aria-label": "Cancel download",
                    onclick: (e) => {
                        e.stopPropagation();
                        this.handleAction(item, "cancel");
                    }
                }, [this.el("span", { className: "download-progress-cancel-icon", "aria-hidden": "true" })])
            ]);

            return row;
        }

        handleAction(item, action) {
            try {
                if (action === "open-link") {
                    window.gBrowser.selectedTab = window.gBrowser.addTab(item.url, {
                        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
                    });
                    window.gZenLibrary.close();
                    return;
                }

                if (action === "pause") {
                    if (item.raw?.cancel) Promise.resolve(item.raw.cancel()).catch(() => { });
                    setTimeout(() => this.sync(), 150);
                    return;
                }

                if (action === "resume") {
                    if (item.raw?.start) Promise.resolve(item.raw.start()).catch(() => { });
                    setTimeout(() => this.sync(), 150);
                    return;
                }

                if (action === "cancel") {
                    if (item.raw?.cancel) Promise.resolve(item.raw.cancel()).catch(() => { });
                    if (item.raw?.removePartialData) {
                        Promise.resolve(item.raw.removePartialData()).catch(() => { });
                    }
                    setTimeout(() => this.sync(), 150);
                    return;
                }

                const file = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsIFile);
                file.initWithPath(item.targetPath);

                if (action === "open-external" || action === "open") {
                    if (file.exists()) file.launch();
                    else alert("File does not exist.");
                } else if (action === "show") {
                    if (file.exists()) file.reveal();
                    else alert("File does not exist.");
                }
            } catch (e) {
                console.error("ZenLibrary: Download action failed", e);
            }
        }

        handleContextMenu(event, item) {
            // Placeholder
        }

        _ensureContextMenu() {
            if (document.getElementById("zen-downloads-context-menu")) return;
            const popup = document.createXULElement("menupopup");
            popup.id = "zen-downloads-context-menu";

            const openLinkItem = document.createXULElement("menuitem");
            openLinkItem.id = "zen-downloads-ctx-open-link";
            openLinkItem.setAttribute("label", "Open Download Link");

            const pauseItem = document.createXULElement("menuitem");
            pauseItem.id = "zen-downloads-ctx-pause";
            pauseItem.setAttribute("label", "Pause");

            const renameItem = document.createXULElement("menuitem");
            renameItem.id = "zen-downloads-ctx-rename";
            renameItem.setAttribute("label", "Rename file");

            const deleteItem = document.createXULElement("menuitem");
            deleteItem.id = "zen-downloads-ctx-delete";
            deleteItem.setAttribute("label", "Delete from history");

            popup.appendChild(openLinkItem);
            popup.appendChild(pauseItem);
            popup.appendChild(document.createXULElement("menuseparator"));
            popup.appendChild(renameItem);
            popup.appendChild(document.createXULElement("menuseparator"));
            popup.appendChild(deleteItem);
            (document.getElementById("mainPopupSet") || document.body).appendChild(popup);
        }

        _showContextMenu(e, item, itemEl) {
            this._ensureContextMenu();
            const popup = document.getElementById("zen-downloads-context-menu");

            for (const id of ["zen-downloads-ctx-open-link", "zen-downloads-ctx-pause", "zen-downloads-ctx-rename", "zen-downloads-ctx-delete"]) {
                const el = document.getElementById(id);
                if (el) el.replaceWith(el.cloneNode(true));
            }

            document.getElementById("zen-downloads-ctx-open-link").addEventListener("command", () => {
                this.handleAction(item, "open-link");
            });

            const pauseItem = document.getElementById("zen-downloads-ctx-pause");
            const canPauseOrResume = item.status === "downloading" || item.status === "paused";
            pauseItem.hidden = !canPauseOrResume;
            pauseItem.setAttribute("label", item.status === "paused" ? "Resume" : "Pause");
            pauseItem.addEventListener("command", () => {
                this.handleAction(item, item.status === "paused" ? "resume" : "pause");
            });

            document.getElementById("zen-downloads-ctx-rename").addEventListener("command", () => {
                if (!item.targetPath || item.status === "deleted") return;
                const input = { value: item.filename };
                const ok = Services.prompt.prompt(window, "Rename File", null, input, null, { value: false });
                if (!ok || !input.value.trim() || input.value.trim() === item.filename) return;
                try {
                    const file = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsIFile);
                    file.initWithPath(item.targetPath);
                    if (!file.exists()) return;
                    const newName = input.value.trim();
                    file.moveTo(file.parent, newName);
                    item.filename = newName;
                    item.targetPath = file.parent.path + (file.parent.path.endsWith("\\") ? "" : "\\") + newName;
                    itemEl.setAttribute("title", newName);
                    if (this._cachedDownloads) {
                        const cached = this._cachedDownloads.find(d => d.id === item.id);
                        if (cached) cached.filename = newName;
                    }
                } catch (err) {
                    console.error("[ZenLibrary Downloads] Rename failed:", err);
                }
            });

            document.getElementById("zen-downloads-ctx-delete").addEventListener("command", async () => {
                try {
                    const { DownloadHistory } = ChromeUtils.importESModule("resource://gre/modules/DownloadHistory.sys.mjs");
                    const { Downloads } = ChromeUtils.importESModule("resource://gre/modules/Downloads.sys.mjs");
                    const { PrivateBrowsingUtils } = ChromeUtils.importESModule("resource://gre/modules/PrivateBrowsingUtils.sys.mjs");
                    const isPrivate = PrivateBrowsingUtils.isContentWindowPrivate(window);
                    const list = await DownloadHistory.getList({ type: isPrivate ? Downloads.ALL : Downloads.PUBLIC });
                    await list.remove(item.historyRaw || item.raw);
                    itemEl.style.transition = "opacity 0.15s, transform 0.15s";
                    itemEl.style.opacity = "0";
                    itemEl.style.transform = "translateX(-8px)";
                    setTimeout(() => {
                        this._cachedDownloads = this._cachedDownloads?.filter(d => d.id !== item.id) ?? null;
                        if (this._cachedDownloads) this.renderList(this._cachedDownloads);
                    }, 160);
                } catch (err) {
                    console.error("[ZenLibrary Downloads] Delete failed:", err);
                }
            });

            popup.openPopupAtScreen(e.screenX, e.screenY, true);
        }

        formatBytes(bytes, decimals = 2) {
            if (!+bytes || bytes === 0) return "0 Bytes";
            const k = 1024;
            const dm = decimals < 0 ? 0 : decimals;
            const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
        }

        formatDuration(seconds) {
            if (!Number.isFinite(seconds) || seconds <= 0) return "Calculating";
            if (seconds < 60) return `${seconds}s left`;
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            if (minutes < 60) return `${minutes}m ${remainingSeconds}s left`;
            const hours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;
            return `${hours}h ${remainingMinutes}m left`;
        }

        getContentTypeFromFilename(filename) {
            if (!filename) return 'application/octet-stream';
            
            const ext = filename.toLowerCase().split('.').pop();
            const mimeTypes = {
                // Images
                'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 
                'gif': 'image/gif', 'webp': 'image/webp', 'bmp': 'image/bmp',
                'svg': 'image/svg+xml', 'ico': 'image/x-icon',
                
                // Documents
                'pdf': 'application/pdf', 'doc': 'application/msword',
                'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'xls': 'application/vnd.ms-excel',
                'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'ppt': 'application/vnd.ms-powerpoint',
                'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                
                // Text
                'txt': 'text/plain', 'html': 'text/html', 'css': 'text/css',
                'js': 'text/javascript', 'json': 'application/json',
                'xml': 'text/xml', 'csv': 'text/csv',
                
                // Audio
                'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'ogg': 'audio/ogg',
                'flac': 'audio/flac', 'aac': 'audio/aac', 'm4a': 'audio/mp4',
                
                // Video
                'mp4': 'video/mp4', 'avi': 'video/x-msvideo', 'mov': 'video/quicktime',
                'wmv': 'video/x-ms-wmv', 'flv': 'video/x-flv', 'webm': 'video/webm',
                'mkv': 'video/x-matroska',
                
                // Archives
                'zip': 'application/zip', 'rar': 'application/x-rar-compressed',
                '7z': 'application/x-7z-compressed', 'tar': 'application/x-tar',
                'gz': 'application/gzip',
                
                // Executables
                'exe': 'application/x-msdownload', 'msi': 'application/x-msi',
                'deb': 'application/x-debian-package', 'rpm': 'application/x-rpm'
            };
            
            return mimeTypes[ext] || 'application/octet-stream';
        }
    }

    window.ZenLibraryDownloads = ZenLibraryDownloads;
})();
