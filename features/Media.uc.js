"use strict";

(function () {
    class ZenLibraryMedia {
        constructor(library) {
            this.library = library;
            this._container = null;
            this._searchTerm = "";
            this._filter = "all"; // all, images, videos, audio
            this._itemCount = 0;
            this._currentAudio = null;
            this._playingId = null;
            this._playingCard = null;
            this._durations = new Map();
        }

        get el() { return this.library.el.bind(this.library); }

        renderFilterBar() {
            const filterBar = this.el("div", { className: "media-filter-bar" });
            const filters = [
                { id: "all", label: "All", iconClass: "icon-all" },
                { id: "images", label: "Images", iconClass: "icon-images" },
                { id: "videos", label: "Videos", iconClass: "icon-videos" },
                { id: "audio", label: "Audio", iconClass: "icon-audio" }
            ];

            filters.forEach(f => {
                const pill = this.el("div", {
                    className: `media-filter-pill ${this._filter === f.id ? 'active' : ''}`,
                    title: f.label,
                    onclick: () => {
                        if (this._filter === f.id) return;
                        this._filter = f.id;
                        filterBar.querySelectorAll(".media-filter-pill").forEach(p => p.classList.remove("active"));
                        pill.classList.add("active");
                        this._stopCurrentAudio(); // STOP ON FILTER CHANGE
                        this.fetchDownloads().then(downloads => {
                            this._container.classList.remove("library-content-fade-in");
                            void this._container.offsetWidth; // Force reflow
                            this.renderList(downloads);
                            this._container.classList.add("library-content-fade-in");
                        });
                    }
                }, [
                    this.el("div", { className: `icon-mask ${f.iconClass}` })
                ]);
                filterBar.appendChild(pill);
            });
            return filterBar;
        }

        render() {
            // Main wrapper
            const wrapper = this.el("div", {
                className: "library-list-wrapper"
            });

            const container = this.el("div", { className: "media-grid" });
            wrapper.appendChild(container);
            this._container = container;
            this.library._mediaContainer = container; // Keep ref

            const startLoading = () => {
                this.fetchDownloads().then(downloads => {
                    this.renderList(downloads);
                    this._container.classList.add("library-content-fade-in");
                    setTimeout(() => this._container.classList.add("scrollbar-visible"), 100);
                });
            };

            const isTransitioning = window.gZenLibrary && window.gZenLibrary._isTransitioning;
            const loading = this.el("div", { className: "empty-state library-content-fade-in" });

            // Use correct Media Icon SVG (Film Strip) - Consistent 64x64
            const iconSvg = `
<svg class="empty-icon media-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
 <path d="M9 3L8 8M16 3L15 8M22 8H2M6.8 21H17.2C18.8802 21 19.7202 21 20.362 20.673C20.9265 20.3854 21.3854 19.9265 21.673 19.362C22 18.7202 22 17.8802 22 16.2V7.8C22 6.11984 22 5.27976 21.673 4.63803C21.3854 4.07354 20.9265 3.6146 20.362 3.32698C19.7202 3 18.8802 3 17.2 3H6.8C5.11984 3 4.27976 3 3.63803 3.32698C3.07354 3.6146 2.6146 4.07354 2.32698 4.63803C2 5.27976 2 6.11984 2 7.8V16.2C2 17.8802 2 18.7202 2.32698 19.362C2.6146 19.9265 3.07354 20.3854 3.63803 20.673C4.27976 21 5.11984 21 6.8 21Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
 </svg>`;
            const iconContainer = this.el("div");
            iconContainer.innerHTML = iconSvg;
            loading.appendChild(iconContainer.firstElementChild);

            loading.appendChild(this.el("h3", { textContent: "Gathering media..." }));
            loading.appendChild(this.el("p", { textContent: "Looking for your downloaded images and videos." }));

            container.appendChild(loading);

            const delay = isTransitioning ? 400 : 250;
            setTimeout(() => {
                const l = container.querySelector(".empty-state");
                if (l) l.remove();
                startLoading();
            }, delay);

            return wrapper;
        }

        async fetchDownloads() {
            try {
                const { DownloadHistory } = ChromeUtils.importESModule("resource://gre/modules/DownloadHistory.sys.mjs");
                const { Downloads } = ChromeUtils.importESModule("resource://gre/modules/Downloads.sys.mjs");
                const { PrivateBrowsingUtils } = ChromeUtils.importESModule("resource://gre/modules/PrivateBrowsingUtils.sys.mjs");

                const isPrivate = PrivateBrowsingUtils.isContentWindowPrivate(window);
                const list = await DownloadHistory.getList({ type: isPrivate ? Downloads.ALL : Downloads.PUBLIC });
                const allDownloadsRaw = await list.getAll();

                return allDownloadsRaw.map((d, index) => {
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
                    const isCompleted = d.succeeded || d.state === 1 || (d.progress === 100 && d.target?.path);
                    const isFailed = d.error || d.canceled || d.state === 4 || d.state === 3;

                    if (isCompleted) status = "completed";
                    else if (isFailed) status = "failed";
                    else if (d.state === 2) status = "paused";
                    else if (d.startTime && !d.endTime) status = "downloading";

                    if (d.target?.path && !fileExists) {
                        status = "deleted";
                    }

                    let size = Number(d.totalBytes) || Number(d.fileSize) || 0;
                    if (isCompleted && size === 0 && d.target?.size) {
                        size = Number(d.target.size);
                    }

                    return {
                        id: d.id || `local_id_${index}_${Date.now()}`,
                        filename: String(filename || "FN_MISSING"),
                        size: size,
                        status: status,
                        url: String(d.source?.url || "URL_MISSING"),
                        contentType: String(d.contentType || ""),
                        timestamp: d.endTime || d.startTime || Date.now(),
                        targetPath: String(targetPath || ""),
                        raw: d
                    };
                });
            } catch (e) {
                console.error("ZenLibrary: Error fetching downloads", e);
                return [];
            }
        }

        renderList(downloads) {
            if (!this._container) return;
            this._container.innerHTML = "";
            this._container.classList.add("scrollbar-visible");

            const IMAGE_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "svg", "avif", "ico", "bmp", "tiff", "tif", "heic", "heif"];
            const VIDEO_EXTS = ["mp4", "webm", "mkv", "avi", "mov", "m4v", "3gp", "mpg", "mpeg", "flv", "ts", "ogv", "wmv"];
            const AUDIO_EXTS = ["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus", "m4b", "m4p", "wma", "alac", "amr", "aiff", "aif", "caf", "oga", "spx", "mid", "midi"];

            const mediaItems = downloads.filter(d => {
                if (d.status === "deleted" || d.status === "failed") return false;
                const ext = d.filename.split('.').pop().toLowerCase();
                const contentType = d.contentType.toLowerCase();

                const isImage = IMAGE_EXTS.includes(ext) || contentType.startsWith("image/");
                const isVideo = VIDEO_EXTS.includes(ext) || contentType.startsWith("video/") || (contentType === "application/ogg" && (ext === "ogv" || ext === "ogg")) || contentType === "application/x-mpegurl";
                const isAudio = AUDIO_EXTS.includes(ext) || contentType.startsWith("audio/") || (contentType === "application/ogg" && ext === "oga") || contentType === "application/x-flac";

                if (this._filter === "images" && !isImage) return false;
                if (this._filter === "videos" && !isVideo) return false;
                if (this._filter === "audio" && !isAudio) return false;
                if (this._filter === "all" && !isImage && !isVideo && !isAudio) return false;

                if (this._searchTerm && !d.filename.toLowerCase().includes(this._searchTerm.toLowerCase())) {
                    return false;
                }
                return true;
            });

            // Update count
            const prevCount = this._itemCount;
            this._itemCount = mediaItems.length;
            window.gZenLibraryMediaCount = this._itemCount;

            if (this._itemCount !== prevCount) {
                if (this.library.update) this.library.update();
            }

            if (mediaItems.length === 0) {
                this._container.innerHTML = "";
                const emptyState = this.el("div", { className: "empty-state" }, [
                    this.el("div", {
                        className: "empty-icon media-icon",
                        innerHTML: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.4 3H4.6C4.03995 3 3.75992 3 3.54601 3.10899C3.35785 3.20487 3.20487 3.35785 3.10899 3.54601C3 3.75992 3 4.03995 3 4.6V8.4C3 8.96005 3 9.24008 3.10899 9.45399C3.20487 9.64215 3.35785 9.79513 3.54601 9.89101C3.75992 10 4.03995 10 4.6 10H8.4C8.96005 10 9.24008 10 9.45399 9.89101C9.64215 9.79513 9.79513 9.64215 9.89101 9.45399C10 9.24008 10 8.96005 10 8.4V4.6C10 4.03995 10 3.75992 9.89101 3.54601C9.79513 3.35785 9.64215 3.20487 9.45399 3.10899C9.24008 3 8.96005 3 8.4 3Z"/><path d="M19.4 3H15.6C15.0399 3 14.7599 3 14.546 3.10899C14.3578 3.20487 14.2049 3.35785 14.109 3.54601C14 3.75992 14 4.03995 14 4.6V8.4C14 8.96005 14 9.24008 14.109 9.45399C14.2049 9.64215 14.3578 9.79513 14.546 9.89101C14.7599 10 15.0399 10 15.6 10H19.4C19.9601 10 20.2401 10 20.454 9.89101C20.6422 9.79513 20.7951 9.64215 20.891 9.45399C21 9.24008 21 8.96005 21 8.4V4.6C21 4.03995 21 3.75992 20.891 3.54601C20.7951 3.35785 20.6422 3.20487 20.454 3.10899C20.2401 3 19.9601 3 19.4 3Z"/><path d="M19.4 14H15.6C15.0399 14 14.7599 14 14.546 14.109C14.3578 14.2049 14.2049 14.3578 14.109 14.546C14 14.7599 14 15.0399 14 15.6V19.4C14 19.9601 14 20.2401 14.109 20.454C14.2049 20.6422 14.3578 20.7951 14.546 20.891C14.7599 21 15.0399 21 15.6 21H19.4C19.9601 21 20.2401 21 20.454 20.891C20.6422 20.7951 20.7951 20.6422 20.891 20.454C21 20.2401 21 19.9601 21 19.4V15.6C21 15.0399 21 14.7599 20.891 14.546C20.7951 14.3578 20.6422 14.2049 20.454 14.109C20.2401 14 19.9601 14 19.4 14Z"/><path d="M8.4 14H4.6C4.03995 14 3.75992 14 3.54601 14.109C3.35785 14.2049 3.20487 14.3578 3.10899 14.546C3 14.7599 3 15.0399 3 15.6V19.4C3 19.9601 3 20.2401 3.10899 20.454C3.20487 20.6422 3.35785 20.7951 3.54601 20.891C3.75992 21 4.03995 21 4.6 21H8.4C8.96005 21 9.24008 21 9.45399 20.891C9.64215 20.7951 9.79513 20.6422 9.89101 20.454C10 20.2401 10 19.9601 10 19.4V15.6C10 15.0399 10 14.7599 9.89101 14.546C9.79513 14.3578 9.64215 14.2049 9.45399 14.109C9.24008 14 8.96005 14 8.4 14Z"/></svg>`
                    }),
                    this.el("h3", { textContent: this._searchTerm ? "No matching media" : "No media found" }),
                    this.el("p", { textContent: this._searchTerm ? "Try a different search term." : `We couldn't find any ${this._filter !== 'all' ? this._filter : 'images, videos, or audio files'} in your downloads.` })
                ]);
                this._container.appendChild(emptyState);
                return;
            }

            // Sort by TS
            mediaItems.sort((a, b) => b.timestamp - a.timestamp);

            // Helper for columns - using the method from Spaces if available or fallback
            // We'll define a standard way to get width
            const libWidth = parseFloat(this.library.style.getPropertyValue("--zen-library-width")) || 340;
            // Assuming ZenLibrarySpaces is available globally as confirmed by user "files loaded"
            // But if we are modularizing Spaces, we might need a safer check.
            let colCount = 1;
            try {
                if (window.ZenLibrarySpacesRenderer && window.ZenLibrarySpacesRenderer.calculateMediaColumns) {
                    colCount = window.ZenLibrarySpacesRenderer.calculateMediaColumns(libWidth);
                } else if (window.ZenLibrarySpaces && window.ZenLibrarySpaces.calculateMediaColumns) {
                    colCount = window.ZenLibrarySpaces.calculateMediaColumns(libWidth);
                }
            } catch (e) { }

            const masonryWrapper = this.el("div", {
                className: "media-masonry-wrapper",
                style: `column-count: ${colCount};`
            });
            const grid = this._container;
            grid.innerHTML = "";
            grid.appendChild(masonryWrapper);

            // Smooth vertical scrolling
            grid.onwheel = (e) => {
                if (e.deltaY !== 0) {
                    e.preventDefault();
                    if (e.deltaMode === 1) {
                        grid.scrollBy({ top: e.deltaY * 37.5, behavior: "smooth" }); // 1.5x of 25 = 37.5, roughly 2.5x speed
                    } else {
                        grid.scrollTop += e.deltaY * 2.5;
                    }
                }
            };

            const fragment = document.createDocumentFragment();

            mediaItems.forEach(item => {
                const ext = item.filename.split('.').pop().toLowerCase();
                const contentType = item.contentType.toLowerCase();
                const isVideo = VIDEO_EXTS.includes(ext) || contentType.startsWith("video/");
                const isAudio = AUDIO_EXTS.includes(ext) || contentType.startsWith("audio/");
                const isGif = ext === "gif" || contentType === "image/gif";
                const fileUrl = "file://" + item.targetPath;

                const card = this.el("div", {
                    className: `media-card ${isAudio && this._playingId === item.id ? 'playing' : ''}`,
                    dataset: { id: item.id },
                    onclick: (e) => {
                        if (isAudio) {
                            this.toggleAudio(item, card);
                        } else {
                            this.showGlance(item, e);
                        }
                    },
                    title: item.filename
                });

                const previewContainer = this.el("div", {
                    className: isAudio ? "audio-preview-container" : "media-preview-container"
                });

                if (isVideo) {
                    const videoEl = this.el("video", {
                        src: fileUrl,
                        preload: "metadata",
                        muted: true
                    });
                    previewContainer.appendChild(videoEl);

                    const durationBadge = this.el("div", { className: "video-duration-badge", textContent: "..." });
                    videoEl.addEventListener("loadedmetadata", () => {
                        const mins = Math.floor(videoEl.duration / 60);
                        const secs = Math.floor(videoEl.duration % 60);
                        durationBadge.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
                    });
                    previewContainer.appendChild(durationBadge);
                } else if (isGif) {
                    const imgEl = this.el("img", {
                        src: fileUrl,
                        loading: "lazy",
                    });
                    previewContainer.appendChild(imgEl);
                    const gifBadge = this.el("div", { className: "gif-badge", textContent: "GIF" });
                    previewContainer.appendChild(gifBadge);
                } else if (isAudio) {
                    const audioIconContainer = this.el("div", {
                        className: "audio-preview-icon"
                    }, [
                        this.el("div", { className: "icon-mask icon-audio placeholder-icon" }),
                        this.el("div", { className: "progress-bar-container" }, [
                            this.el("div", { className: "progress-bar-fill" })
                        ]),
                        this.el("div", { className: "audio-control-overlay" }, [
                            this.el("div", { className: "icon-mask icon-play" }),
                            this.el("div", { className: "icon-mask icon-pause" })
                        ])
                    ]);
                    previewContainer.appendChild(audioIconContainer);

                    const durationBadge = this.el("div", { className: "video-duration-badge", textContent: "..." });

                    // Create DOM element for metadata (Exact match to video logic)
                    const audioEl = this.el("audio", {
                        src: fileUrl,
                        preload: "metadata",
                        style: "display: none;" // Hidden but in DOM context
                    });

                    audioEl.addEventListener("loadedmetadata", () => {
                        const mins = Math.floor(audioEl.duration / 60);
                        const secs = Math.floor(audioEl.duration % 60);
                        durationBadge.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
                        audioEl.remove(); // Cleanup after load
                    });

                    audioEl.addEventListener("error", () => {
                        durationBadge.textContent = ""; // Clear if failed
                        audioEl.remove();
                    });

                    previewContainer.appendChild(audioEl); // Must be appended for some browsers to load metadata
                    previewContainer.appendChild(durationBadge);
                } else {
                    const imgEl = this.el("img", {
                        src: fileUrl,
                        loading: "lazy",
                    });
                    previewContainer.appendChild(imgEl);
                }

                let timeStr = "";
                try {
                    const date = new Date(item.timestamp);
                    timeStr = date.toLocaleDateString([], { month: "short", day: "numeric" }) + ", " +
                        date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
                } catch (e) { }

                const info = this.el("div", { className: "media-info" }, [
                    this.el("div", { className: "media-title", textContent: item.filename }),
                    this.el("div", { className: "media-meta-row" }, [
                        this.el("div", { className: "media-meta", textContent: this.formatBytes(item.size) }),
                        this.el("div", { className: "media-time", textContent: timeStr })
                    ])
                ]);

                card.appendChild(previewContainer);
                card.appendChild(info);
                fragment.appendChild(card);
            });

            masonryWrapper.appendChild(fragment);
        }

        _stopCurrentAudio() {
            if (this._currentAudio) {
                // CRITICAL: Nullify handlers first to prevent race/logic loops
                this._currentAudio.onended = null;
                this._currentAudio.onerror = null;
                this._currentAudio.pause();
                this._currentAudio.src = "";
                this._currentAudio.load();
                this._currentAudio = null;
            }
            if (this._playingId) {
                const oldCard = this._container?.querySelector(`.media-card[data-id="${CSS.escape(this._playingId)}"]`);
                if (oldCard) {
                    oldCard.classList.remove("playing");
                    // Reset progress bar
                    const progress = oldCard.querySelector(".progress-bar-fill");
                    if (progress) progress.style.width = "0%";
                }
            }
            this._playingId = null;
            this._playingCard = null;
        }

        toggleAudio(item, cardEl) {
            const fileUrl = "file://" + item.targetPath;

            // 1. Is this the same card?
            if (this._playingId === item.id) {
                // Just pause it.
                this._stopCurrentAudio();
                return;
            }

            // 2. Different card? (Or starting fresh)
            // Stop EVERYTHING first. Global Reset.
            this._stopCurrentAudio();

            // 3. Start New
            this._playingId = item.id;
            this._playingCard = cardEl;
            this._currentAudio = new Audio(fileUrl);

            this._currentAudio.onended = () => {
                // Logic managed securely via _stopCurrentAudio
                this._stopCurrentAudio();
            };

            this._currentAudio.ontimeupdate = () => {
                if (this._playingId === item.id && this._currentAudio.duration) {
                    const percent = (this._currentAudio.currentTime / this._currentAudio.duration) * 100;
                    const progress = cardEl.querySelector(".progress-bar-fill");
                    if (progress) progress.style.width = `${percent}%`;
                }
            };

            this._currentAudio.onerror = (e) => {
                console.error("Audio playback error", e);
                this._stopCurrentAudio();
            };

            this._currentAudio.play().then(() => {
                if (this._playingId === item.id) {
                    cardEl.classList.add("playing");
                } else {
                    // Race condition: user clicked something else while loading
                    this._stopCurrentAudio();
                }
            }).catch(e => {
                console.error("Play request failed", e);
                this._stopCurrentAudio();
            });
        }

        showGlance(item, event) {
            const fileUrl = "file://" + item.targetPath;
            if (window.gZenGlanceManager) {
                if (window.gZenGlanceManager.closeGlance) {
                    window.gZenGlanceManager.closeGlance();
                }

                const rect = event.currentTarget.getBoundingClientRect();
                window.gZenGlanceManager.openGlance({
                    url: fileUrl,
                    clientX: rect.left,
                    clientY: rect.top,
                    width: rect.width,
                    height: rect.height
                });
            }
        }

        formatBytes(bytes, decimals = 2) {
            if (!+bytes || bytes === 0) return "0 Bytes";
            const k = 1024;
            const dm = decimals < 0 ? 0 : decimals;
            const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
        }
    }

    window.ZenLibraryMedia = ZenLibraryMedia;
})();