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
            this._coverCache = new Map();
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

            // Use correct Media Icon SVG (Film Strip)
            const iconSvg = `<svg class="empty-icon media-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 3L8 8M16 3L15 8M22 8H2M6.8 21H17.2C18.8802 21 19.7202 21 20.362 20.673C20.9265 20.3854 21.3854 19.9265 21.673 19.362C22 18.7202 22 17.8802 22 16.2V7.8C22 6.11984 22 5.27976 21.673 4.63803C21.3854 4.07354 20.9265 3.6146 20.362 3.32698C19.7202 3 18.8802 3 17.2 3H6.8C5.11984 3 4.27976 3 3.63803 3.32698C3.07354 3.6146 2.6146 4.07354 2.32698 4.63803C2 5.27976 2 6.11984 2 7.8V16.2C2 17.8802 2 18.7202 2.32698 19.362C2.6146 19.9265 3.07354 20.3854 3.63803 20.673C4.27976 21 5.11984 21 6.8 21Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
            const iconContainer = this.el("div", {
                innerHTML: iconSvg
            });
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

        async _extractCover(file) {
            try {
                // Read first 2MB to be safe for MP4/FLAC metadata
                const stream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
                stream.init(file, 0x01, 0o444, 0);
                const bis = Cc["@mozilla.org/binaryinputstream;1"].createInstance(Ci.nsIBinaryInputStream);
                bis.setInputStream(stream);

                const bytes = bis.readByteArray(Math.min(file.fileSize, 2048 * 1024));
                stream.close();

                const view = new DataView(new Uint8Array(bytes).buffer);

                // 1. ID3v2 (MP3/WAV)
                if (view.getUint8(0) === 0x49 && view.getUint8(1) === 0x44 && view.getUint8(2) === 0x33) {
                    const version = view.getUint8(3);
                    let offset = 10;
                    const tagSize = ((view.getUint8(6) & 0x7f) << 21) | ((view.getUint8(7) & 0x7f) << 14) | ((view.getUint8(8) & 0x7f) << 7) | (view.getUint8(9) & 0x7f);

                    while (offset < tagSize && offset < bytes.length - 10) {
                        const frameId = String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
                        let frameSize;
                        if (version === 3) {
                            frameSize = view.getUint32(offset + 4);
                        } else if (version === 4) {
                            frameSize = ((view.getUint8(offset + 4) & 0x7f) << 21) | ((view.getUint8(offset + 5) & 0x7f) << 14) | ((view.getUint8(offset + 6) & 0x7f) << 7) | (view.getUint8(offset + 7) & 0x7f);
                        } else break;

                        if (frameId === "APIC") {
                            let innerOffset = offset + 10;
                            const encoding = view.getUint8(innerOffset++);
                            let mimeType = "";
                            while (innerOffset < bytes.length && view.getUint8(innerOffset) !== 0) {
                                mimeType += String.fromCharCode(view.getUint8(innerOffset++));
                            }
                            innerOffset++;
                            const picType = view.getUint8(innerOffset++);
                            if (encoding === 0 || encoding === 3) {
                                while (innerOffset < bytes.length && view.getUint8(innerOffset) !== 0) innerOffset++;
                                innerOffset++;
                            } else {
                                while (innerOffset < bytes.length - 1 && view.getUint16(innerOffset) !== 0) innerOffset += 2;
                                innerOffset += 2;
                            }
                            if (innerOffset >= bytes.length) return null;
                            const dataSize = (offset + 10 + frameSize) - innerOffset;
                            if (dataSize <= 0) return null;
                            const data = bytes.slice(innerOffset, innerOffset + dataSize);
                            return URL.createObjectURL(new Blob([new Uint8Array(data)], { type: mimeType || "image/jpeg" }));
                        }
                        if (frameSize <= 0) break;
                        offset += 10 + frameSize;
                    }
                }

                // 2. FLAC
                if (view.getUint8(0) === 0x66 && view.getUint8(1) === 0x4c && view.getUint8(2) === 0x61 && view.getUint8(3) === 0x43) {
                    let offset = 4;
                    let isLastBlock = false;
                    while (!isLastBlock && offset < bytes.length - 4) {
                        const header = view.getUint8(offset);
                        isLastBlock = (header & 0x80) !== 0;
                        const blockType = header & 0x7f;
                        const blockSize = (view.getUint8(offset + 1) << 16) | (view.getUint8(offset + 2) << 8) | view.getUint8(offset + 3);
                        if (blockType === 6) { // PICTURE
                            let pOffset = offset + 4;
                            pOffset += 4; // Skip type
                            const mimeLen = view.getUint32(pOffset); pOffset += 4;
                            let mimeType = "";
                            for (let i = 0; i < mimeLen; i++) mimeType += String.fromCharCode(view.getUint8(pOffset++));
                            const descLen = view.getUint32(pOffset); pOffset += 4;
                            pOffset += descLen + 16; // Skip desc, w, h, d, c
                            const dataLen = view.getUint32(pOffset); pOffset += 4;
                            if (pOffset + dataLen <= bytes.length) {
                                return URL.createObjectURL(new Blob([new Uint8Array(bytes.slice(pOffset, pOffset + dataLen))], { type: mimeType || "image/jpeg" }));
                            }
                        }
                        offset += 4 + blockSize;
                    }
                }

                // 3. MP4 (M4A/ALAC/MOV)
                // Search for 'covr' inside 'ilst'
                const findAtom = (start, end, target) => {
                    let i = start;
                    while (i < end - 8) {
                        const size = view.getUint32(i);
                        const type = String.fromCharCode(view.getUint8(i + 4), view.getUint8(i + 5), view.getUint8(i + 6), view.getUint8(i + 7));
                        if (size === 0) break;
                        if (type === target) return { start: i + 8, end: i + size };
                        i += size;
                    }
                    return null;
                };

                const ftyp = findAtom(0, bytes.length, "ftyp");
                if (ftyp) {
                    const moov = findAtom(0, bytes.length, "moov");
                    if (moov) {
                        const udta = findAtom(moov.start, moov.end, "udta");
                        if (udta) {
                            const meta = findAtom(udta.start, udta.end, "meta");
                            if (meta) {
                                const ilst = findAtom(meta.start + 4, meta.end, "ilst"); // Skip 4 bytes for meta flag
                                if (ilst) {
                                    const covr = findAtom(ilst.start, ilst.end, "covr");
                                    if (covr) {
                                        const data = findAtom(covr.start, covr.end, "data");
                                        if (data) {
                                            // MP4 'data' atom: 8 bytes header, 4 bytes version/flag (skipped by findAtom), 4 bytes reserved
                                            // Actually findAtom moves to start of inner content.
                                            // The content of 'data' atom starts with 8 bytes: 4 flags + 4 empty
                                            const pOffset = data.start + 8;
                                            const dataLen = (data.end - data.start) - 8;
                                            if (pOffset + dataLen <= bytes.length) {
                                                return URL.createObjectURL(new Blob([new Uint8Array(bytes.slice(pOffset, pOffset + dataLen))], { type: "image/jpeg" }));
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (e) { }
            return null;
        }

        async fetchDownloads() {
            try {
                const getDir = (key) => {
                    try {
                        return Services.dirsvc.get(key, Ci.nsIFile);
                    } catch (e) { return null; }
                };

                let downloadsDir = getDir("Dwnld"); // OS Downloads
                if (!downloadsDir) {
                    const home = getDir("Home");
                    if (home) {
                        downloadsDir = home.clone();
                        downloadsDir.append("Downloads");
                    }
                }

                if (!downloadsDir || !downloadsDir.exists() || !downloadsDir.isDirectory()) {
                    console.error("ZenLibrary: Could not find Downloads directory");
                    return [];
                }

                const IMAGE_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "svg", "avif", "ico", "bmp", "tiff", "tif", "heic", "heif"];
                const VIDEO_EXTS = ["mp4", "webm", "mkv", "avi", "mov", "m4v", "3gp", "mpg", "mpeg", "flv", "ts", "ogv", "wmv"];
                const AUDIO_EXTS = ["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus", "m4b", "m4p", "wma", "alac", "amr", "aiff", "aif", "caf", "oga", "spx", "mid", "midi"];
                const MEDIA_EXTS = [...IMAGE_EXTS, ...VIDEO_EXTS, ...AUDIO_EXTS];

                const mediaFiles = [];

                const scanDir = (dir, depth = 0) => {
                    if (depth > 3) return;
                    try {
                        const entries = dir.directoryEntries;
                        while (entries.hasMoreElements()) {
                            const file = entries.getNext().QueryInterface(Ci.nsIFile);
                            try {
                                if (file.isDirectory()) {
                                    if (file.leafName.startsWith(".")) continue;
                                    scanDir(file, depth + 1);
                                    continue;
                                }

                                const filename = file.leafName;
                                const ext = filename.split('.').pop().toLowerCase();

                                if (!MEDIA_EXTS.includes(ext)) continue;

                                let contentType = "";
                                if (IMAGE_EXTS.includes(ext)) contentType = "image/" + (ext === "jpg" ? "jpeg" : ext);
                                else if (VIDEO_EXTS.includes(ext)) contentType = "video/" + ext;
                                else if (AUDIO_EXTS.includes(ext)) contentType = "audio/" + ext;

                                mediaFiles.push({
                                    id: `local_${file.path}_${file.lastModifiedTime}`,
                                    filename: filename,
                                    size: file.fileSize,
                                    status: "completed",
                                    url: Services.io.newFileURI(file).spec,
                                    contentType: contentType,
                                    timestamp: file.lastModifiedTime,
                                    targetPath: file.path,
                                    file: file,
                                    raw: { target: { path: file.path }, lastModified: file.lastModifiedTime }
                                });
                            } catch (e) { }
                        }
                    } catch (e) { }
                };

                scanDir(downloadsDir);
                return mediaFiles;
            } catch (e) {
                console.error("ZenLibrary: Error scanning downloads", e);
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
                const ext = d.filename.split('.').pop().toLowerCase();
                const contentType = (d.contentType || "").toLowerCase();

                const isImage = IMAGE_EXTS.includes(ext) || contentType.startsWith("image/");
                const isVideo = VIDEO_EXTS.includes(ext) || contentType.startsWith("video/");
                const isAudio = AUDIO_EXTS.includes(ext) || contentType.startsWith("audio/");

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
                const emptyState = this.el("div", { className: "empty-state" });

                const iconSvg = `<svg class="empty-icon media-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 3L8 8M16 3L15 8M22 8H2M6.8 21H17.2C18.8802 21 19.7202 21 20.362 20.673C20.9265 20.3854 21.3854 19.9265 21.673 19.362C22 18.7202 22 17.8802 22 16.2V7.8C22 6.11984 22 5.27976 21.673 4.63803C21.3854 4.07354 20.9265 3.6146 20.362 3.32698C19.7202 3 18.8802 3 17.2 3H6.8C5.11984 3 4.27976 3 3.63803 3.32698C3.07354 3.6146 2.6146 4.07354 2.32698 4.63803C2 5.27976 2 6.11984 2 7.8V16.2C2 17.8802 2 18.7202 2.32698 19.362C2.6146 19.9265 3.07354 20.3854 3.63803 20.673C4.27976 21 5.11984 21 6.8 21Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
                const iconContainer = this.el("div");
                iconContainer.innerHTML = iconSvg;

                emptyState.appendChild(iconContainer.firstElementChild);
                emptyState.appendChild(this.el("h3", { textContent: this._searchTerm ? "No matching media" : "No media found" }));
                emptyState.appendChild(this.el("p", { textContent: this._searchTerm ? "Try a different search term." : `We couldn't find any ${this._filter !== 'all' ? this._filter : 'images, videos, or audio files'} in your downloads.` }));

                this._container.appendChild(emptyState);
                return;
            }

            // Sort by TS
            mediaItems.sort((a, b) => b.timestamp - a.timestamp);

            const libWidth = parseFloat(this.library.style.getPropertyValue("--zen-library-width")) || 340;
            let colCount = 1;
            try {
                if (window.ZenLibrarySpacesRenderer && window.ZenLibrarySpacesRenderer.calculateMediaColumns) {
                    colCount = window.ZenLibrarySpacesRenderer.calculateMediaColumns(libWidth);
                } else if (window.ZenLibrarySpaces && window.ZenLibrarySpaces.calculateMediaColumns) {
                    colCount = window.ZenLibrarySpaces.calculateMediaColumns(libWidth);
                }
            } catch (e) { }

            const masonryWrapper = this.el("div", {
                className: "media-masonry-wrapper"
            });
            const grid = this._container;
            grid.innerHTML = "";
            grid.appendChild(masonryWrapper);

            // Create columns
            const columns = [];
            for (let i = 0; i < colCount; i++) {
                const col = this.el("div", { className: "media-masonry-column" });
                masonryWrapper.appendChild(col);
                columns.push(col);
            }

            // Smooth vertical scrolling
            grid.onwheel = (e) => {
                if (e.deltaY !== 0) {
                    e.preventDefault();
                    if (e.deltaMode === 1) {
                        grid.scrollBy({ top: e.deltaY * 37.5, behavior: "smooth" });
                    } else {
                        grid.scrollTop += e.deltaY * 2.5;
                    }
                }
            };

            mediaItems.forEach((item, index) => {
                const ext = item.filename.split('.').pop().toLowerCase();
                const contentType = item.contentType.toLowerCase();
                const isVideo = VIDEO_EXTS.includes(ext) || contentType.startsWith("video/");
                const isAudio = AUDIO_EXTS.includes(ext) || contentType.startsWith("audio/");
                const isGif = ext === "gif" || contentType === "image/gif";
                const fileUrl = item.url;

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
                    });

                    const cachedCover = this._coverCache.get(item.id);
                    if (cachedCover) {
                        audioIconContainer.appendChild(this.el("img", { src: cachedCover, className: "cover-art" }));
                    } else {
                        audioIconContainer.appendChild(this.el("div", { className: "icon-mask icon-audio placeholder-icon" }));

                        // Only try extraction if we haven't failed before (cachedCover would be null if failed)
                        if (cachedCover === undefined) {
                            const updateCover = async () => {
                                const coverUrl = await this._extractCover(item.file);
                                this._coverCache.set(item.id, coverUrl);
                                if (coverUrl) {
                                    const placeholder = audioIconContainer.querySelector(".placeholder-icon");
                                    if (placeholder) {
                                        placeholder.replaceWith(this.el("img", { src: coverUrl, className: "cover-art" }));
                                    }
                                }
                            };
                            updateCover();
                        }
                    }

                    audioIconContainer.appendChild(this.el("div", { className: "progress-bar-container" }, [
                        this.el("div", { className: "progress-bar-fill" })
                    ]));
                    audioIconContainer.appendChild(this.el("div", { className: "audio-control-overlay" }, [
                        this.el("div", { className: "icon-mask icon-play" }),
                        this.el("div", { className: "icon-mask icon-pause" })
                    ]));
                    previewContainer.appendChild(audioIconContainer);

                    const durationBadge = this.el("div", { className: "video-duration-badge", textContent: "..." });

                    const audioEl = this.el("audio", {
                        src: fileUrl,
                        preload: "metadata",
                        style: "display: none;"
                    });

                    audioEl.addEventListener("loadedmetadata", () => {
                        const mins = Math.floor(audioEl.duration / 60);
                        const secs = Math.floor(audioEl.duration % 60);
                        durationBadge.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
                        audioEl.remove();
                    });

                    audioEl.addEventListener("error", () => {
                        durationBadge.textContent = "";
                        audioEl.remove();
                    });

                    previewContainer.appendChild(audioEl);
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

                // Distribute round-robin to columns
                columns[index % colCount].appendChild(card);
            });
        }

        _stopCurrentAudio() {
            if (this._currentAudio) {
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
                    const progress = oldCard.querySelector(".progress-bar-fill");
                    if (progress) progress.style.width = "0%";
                }
            }
            this._playingId = null;
            this._playingCard = null;
        }

        toggleAudio(item, cardEl) {
            const fileUrl = item.url;
            if (this._playingId === item.id) {
                this._stopCurrentAudio();
                return;
            }
            this._stopCurrentAudio();
            this._playingId = item.id;
            this._playingCard = cardEl;
            this._currentAudio = new Audio(fileUrl);

            this._currentAudio.onended = () => {
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
                    this._stopCurrentAudio();
                }
            }).catch(e => {
                console.error("Play request failed", e);
                this._stopCurrentAudio();
            });
        }

        showGlance(item, event) {
            const fileUrl = item.url;
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