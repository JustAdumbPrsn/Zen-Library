"use strict";

(function () {
    class ZenLibrarySpaces {
        static getWorkspaces() { return window.gZenWorkspaces ? window.gZenWorkspaces.getWorkspaces() : []; }

        static calculatePanelWidth(count) {
            // sidebar (90) + grid padding (40) + cards (count * 240) + gaps (count * 16) + create-button (36 + 2 margin)
            const total = 90 + 40 + (count * 240) + (count * 16) + 38;
            return Math.min(total, window.innerWidth * 0.8);
        }

        static getLastWidth() { return this._lastWidth || 340; }

        static calculateMediaColumns(width) {
            const sidebar = 90;
            const padding = 36;
            const colWidth = 210;
            const gap = 16;
            const scrollbarBuffer = 4;

            const avail = width - sidebar - padding - scrollbarBuffer;
            return Math.max(1, Math.floor((avail + gap + 2) / (colWidth + gap)));
        }

        static calculateMediaWidth(count) {
            const sidebar = 90;
            const padding = 36;
            const colWidth = 210;
            const gap = 16;
            const scrollbarBuffer = 4;

            let cols = 1;
            if (count > 6) cols = 3;
            else if (count > 2) cols = 2;

            const total = sidebar + padding + (cols * colWidth) + ((cols - 1) * gap) + scrollbarBuffer;
            return Math.min(total, window.innerWidth * 0.9);
        }

        static getData() {
            const workspaces = this.getWorkspaces();
            const width = this.calculatePanelWidth(workspaces.length);
            this._lastWidth = width;
            return { workspaces, width };
        }

        constructor(library) {
            this.library = library;
            // Local state for folder expansion
            this._folderExpansion = new Map();
        }

        get el() { return this.library.el.bind(this.library); }
        get svg() { return this.library.svg.bind(this.library); }

        render() {
            // Capture existing scroll position
            const oldGrid = this.library.shadowRoot.querySelector(".library-workspace-grid");
            const oldScroll = oldGrid ? oldGrid.scrollLeft : 0;

            const { workspaces, width } = ZenLibrarySpaces.getData();
            // We return the grid to be appended by the main update loop, 
            // OR we can manage the container ourselves if the shell delegates that.
            // Based on ZenLibrary.uc.js's shell logic, it calls render() but also handles the grid creation 
            // in its `update()` method for sticky headers etc?
            // Actually, the main shell's update() seems to handle the High Level structure.
            // But if we want to modularize, we should do as much as possible here.

            // However, the main shell's `update()` (lines 2856+ in backup) does a lot of heavy lifting 
            // including calculating width and diffing hash.
            // The REFRACTORED ZenLibrary.uc.js (which we verified) delegates to `.update()`?
            // No, the refactored ZenLibrary.uc.js calls `this._spaces.render()`?
            // Let's look at the refactored ZenLibrary.uc.js ... I don't have it fully in memory 
            // but the plan was for `renderSpaces()` or similar.

            // Assuming the shell calls `render()` and expects an element back.
            // BUT, the Spaces UI is a horizontal grid that affects the WINDOW WIDTH.
            // The logic to resize the window (`this.style.setProperty("--zen-library-width"...)`) 
            // IS in the shell's `update()`.

            // So this module should primarily return the CONTENT (the grid).

            const grid = this.el("div", { className: "library-workspace-grid" });
            const fragment = document.createDocumentFragment();

            for (const ws of workspaces) {
                const card = this.createWorkspaceCard(ws);
                if (card) fragment.appendChild(card);
            }

            // Add "Create Space" button at end of grid
            fragment.appendChild(this.el("div", {
                className: "library-create-workspace-button",
                title: "Create Space",
                onclick: () => {
                    window.gZenLibrary.close();
                    const creationCmd = document.getElementById("cmd_zenOpenWorkspaceCreation");
                    if (creationCmd) creationCmd.doCommand();
                }
            }, [
                this.el("span", { textContent: "+" })
            ]));

            grid.appendChild(fragment);

            // Optimized wheel handling matching backup
            grid.onwheel = (e) => {
                const list = e.target.closest(".library-workspace-card-list");
                let shouldScrollHorizontal = !list;
                if (list) {
                    const isAtTop = list.scrollTop <= 0 && e.deltaY < 0;
                    const isAtBottom = Math.abs(list.scrollHeight - list.scrollTop - list.clientHeight) < 1 && e.deltaY > 0;
                    if (isAtTop || isAtBottom) shouldScrollHorizontal = true;
                }

                if (e.deltaY !== 0 && shouldScrollHorizontal) {
                    e.preventDefault();
                    if (e.deltaMode === 1) grid.scrollBy({ left: e.deltaY * 30, behavior: "smooth" });
                    else grid.scrollLeft += e.deltaY * 1.5;
                }
            };

            grid.classList.add("library-content-fade-in");

            // Restore scroll position
            if (oldScroll > 0) {
                requestAnimationFrame(() => { grid.scrollLeft = oldScroll; });
            }

            // Only animate entry if it's a fresh load (no old grid), otherwise instant
            if (!oldGrid) {
                setTimeout(() => grid.classList.add("scrollbar-visible"), 100);
            } else {
                grid.classList.add("scrollbar-visible");
            }

            return grid;
        }

        // --- Core Rendering Logic Copied from Backup ---

        createFolderIconSVG(iconURL = '', state = 'close', active = false) {
            const id1 = "nebula-native-grad-0-" + Math.floor(Math.random() * 100000);
            const id2 = "nebula-native-grad-1-" + Math.floor(Math.random() * 100000);

            let imageTag = "";
            if (iconURL) {
                imageTag = `<image href="${iconURL}" height="10" width="10" transform="translate(9 11)" />`;
            }

            const svgStr = `
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" state="${state}" active="${active}">
                <defs>
                    <linearGradient gradientUnits="userSpaceOnUse" x1="14" y1="5.625" x2="14" y2="22.375" id="${id1}">
                        <stop offset="0" style="stop-color: rgb(255, 255, 255)"/>
                        <stop offset="1" style="stop-color: rgb(0, 0, 0)"/>
                    </linearGradient>
                    <linearGradient gradientUnits="userSpaceOnUse" x1="14" y1="9.625" x2="14" y2="22.375" id="${id2}">
                        <stop offset="0" style="stop-color: rgb(255, 255, 255)"/>
                        <stop offset="1" style="stop-color: rgb(0, 0, 0)"/>
                    </linearGradient>
                </defs>
                <path class="back" d="M8 5.625H11.9473C12.4866 5.625 13.0105 5.80861 13.4316 6.14551L14.2881 6.83105C14.9308 7.34508 15.7298 7.625 16.5527 7.625H20C21.3117 7.625 22.375 8.68832 22.375 10V20C22.375 21.3117 21.3117 22.375 20 22.375H8C6.68832 22.375 5.625 21.3117 5.625 20V8C5.625 6.68832 6.68832 5.625 8 5.625Z" style="fill: var(--ws-folder-behind);" />
                <path class="back" d="M8 5.625H11.9473C12.4866 5.625 13.0105 5.80861 13.4316 6.14551L14.2881 6.83105C14.9308 7.34508 15.7298 7.625 16.5527 7.625H20C21.3117 7.625 22.375 8.68832 22.375 10V20C22.375 21.3117 21.3117 22.375 20 22.375H8C6.68832 22.375 5.625 21.3117 5.625 20V8C5.625 6.68832 6.68832 5.625 8 5.625Z" style="stroke-width: 1.5px; stroke: var(--ws-folder-stroke); fill: url(#${id1}); fill-opacity: 0.1;" />
                <rect class="front" x="5.625" y="9.625" width="16.75" height="12.75" rx="2.375" style="fill: var(--ws-folder-front);" />
                <rect class="front" x="5.625" y="9.625" width="16.75" height="12.75" rx="2.375" style="stroke-width: 1.5px; stroke: var(--ws-folder-stroke); fill: url(#${id2}); fill-opacity: 0.1;" />
                <g class="icon" style="fill: var(--ws-folder-stroke, currentColor);">
                     ${imageTag}
                </g>
                <g class="dots" style="fill: var(--ws-folder-stroke);">
                    <ellipse cx="10" cy="16" rx="1.25" ry="1.25"/>
                    <ellipse cx="14" cy="16" rx="1.25" ry="1.25"/>
                    <ellipse cx="18" cy="16" rx="1.25" ry="1.25"/>
                </g>
            </svg>`;
            return this.svg(svgStr);
        }

        createWorkspaceCard(ws) {
            try {
                if (!window.gZenWorkspaces) return null;

                let themeData = { gradient: "var(--zen-primary-color)", grain: 0, primaryColor: "var(--zen-primary-color)", isDarkMode: true, toolbarColor: [255, 255, 255, 0.6] };
                if (window.gZenThemePicker && window.gZenThemePicker.getGradientForWorkspace) {
                    themeData = window.gZenThemePicker.getGradientForWorkspace(ws);
                }

                const card = this.el("div", { className: "library-workspace-card" });
                card.style.setProperty("--ws-gradient", themeData.gradient);
                card.style.setProperty("--ws-grain", themeData.grain);

                const pColor = themeData.primaryColor;
                const tColor = `rgba(${themeData.toolbarColor.join(',')})`;

                card.style.setProperty("--ws-primary-color", pColor);
                card.style.setProperty("--ws-text-color", tColor);
                card.style.colorScheme = themeData.isDarkMode ? "dark" : "light";

                // Native Zen Tab Highlights
                if (themeData.isDarkMode) {
                    card.style.setProperty("--ws-tab-selected-color", "rgba(255, 255, 255, 0.12)");
                    card.style.setProperty("--ws-tab-selected-shadow", "0 1px 1px 1px rgba(0, 0, 0, 0.1)");
                } else {
                    card.style.setProperty("--ws-tab-selected-color", "rgba(255, 255, 255, 0.8)");
                    card.style.setProperty("--ws-tab-selected-shadow", "0 1px 1px 1px rgba(0, 0, 0, 0.09)");
                }
                card.style.setProperty("--ws-tab-hover-color", `color-mix(in srgb, ${tColor}, transparent 92.5%)`);

                if (themeData.isDarkMode) {
                    card.style.setProperty("--ws-folder-front", `color-mix(in srgb, ${pColor}, black 40%)`);
                    card.style.setProperty("--ws-folder-behind", `color-mix(in srgb, ${pColor} 60%, #c1c1c1)`);
                    card.style.setProperty("--ws-folder-stroke", `color-mix(in srgb, ${pColor} 15%, #ebebeb)`);
                } else {
                    card.style.setProperty("--ws-folder-front", `color-mix(in srgb, ${pColor}, white 70%)`);
                    card.style.setProperty("--ws-folder-behind", `color-mix(in srgb, ${pColor} 60%, gray)`);
                    card.style.setProperty("--ws-folder-stroke", `color-mix(in srgb, ${pColor} 50%, black)`);
                }

                if (themeData.isDarkMode) card.classList.add("dark");

                let iconEl;
                if (ws.icon && (ws.icon.includes("/") || ws.icon.startsWith("data:"))) {
                    iconEl = this.el("div", {
                        className: "library-workspace-icon",
                        style: `mask-image: url("${ws.icon}");`
                    });
                } else if (ws.icon && ws.icon.trim().length > 0) {
                    iconEl = this.el("span", { textContent: ws.icon, className: "library-workspace-icon-text" });
                } else {
                    iconEl = this.el("div", { className: "library-workspace-icon-empty" });
                }

                const editBtn = this.el("div", {
                    className: "library-workspace-edit-button",
                    title: "Edit Workspace"
                }, [this.el("div")]);

                editBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const popup = document.getElementById("zenWorkspaceMoreActions");
                    if (popup) {
                        popup.setAttribute("workspace-id", ws.uuid);
                        popup.openPopup(e.currentTarget, "after_start");
                    }
                });

                const header = this.el("div", { className: "library-workspace-card-header" }, [
                    this.el("div", { className: "library-workspace-icon-container" }, [iconEl]),
                    this.el("span", { className: "library-workspace-name", textContent: ws.name }),
                    editBtn
                ]);

                const listContainer = this.el("div", { className: "library-workspace-card-list" });
                const wsEl = window.gZenWorkspaces.workspaceElement(ws.uuid);
                if (wsEl) {
                    const pinnedContainer = wsEl.pinnedTabsContainer;
                    const normalContainer = wsEl.tabsContainer;

                    const items = [];
                    const collect = (container) => {
                        if (!container) return;
                        Array.from(container.children).forEach(child => {
                            if (child.hasAttribute('cloned') || child.hasAttribute('zen-empty-tab')) return;
                            if (window.gBrowser.isTab(child) || window.gBrowser.isTabGroup(child)) {
                                items.push(child);
                            }
                        });
                    };

                    collect(pinnedContainer);
                    const pinnedCount = items.length;
                    collect(normalContainer);

                    let separatorCreated = false;
                    const itemsLen = items.length;
                    for (let i = 0; i < itemsLen; i++) {
                        const item = items[i];
                        if (i === pinnedCount && !separatorCreated) {
                            const cleanupBtn = this.el("div", {
                                className: "library-workspace-cleanup-button",
                                title: "Clear unpinned tabs"
                            }, [this.el("span", { textContent: "Clear" })]);

                            cleanupBtn.addEventListener("click", (e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                this.closeWorkspaceUnpinnedTabs(ws.uuid);
                            });

                            const separatorContainer = this.el("div", { className: "library-workspace-separator-container" }, [
                                this.el("div", { className: "library-workspace-separator" }),
                                cleanupBtn
                            ]);
                            listContainer.appendChild(separatorContainer);
                            separatorCreated = true;
                        }
                        this.renderItemRecursive(item, listContainer, ws.uuid);
                    }

                    if (itemsLen === 0) {
                        listContainer.appendChild(this.el("div", {
                            className: "empty-state",
                            style: "padding: 20px; text-align:center; opacity:0.5; font-size: 12px;",
                            textContent: "Empty Workspace"
                        }));
                    }
                }

                const dragHandle = this.el("div", {
                    className: "library-workspace-drag-handle",
                    textContent: "⠿",
                    title: "Drag to reorder"
                });

                // Drag and Drop Logic
                dragHandle.addEventListener("mousedown", (e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    e.stopPropagation();

                    const grid = card.parentElement;
                    if (!grid) return;

                    const overlay = this.el("div", {
                        id: "library-drag-overlay",
                        style: "position: fixed; inset: 0; z-index: 9998; cursor: grabbing; pointer-events: auto;"
                    });
                    document.body.appendChild(overlay);

                    const preDragRect = card.getBoundingClientRect();
                    card.style.setProperty('--dragged-bg-color', ws.primaryColor);
                    card.setAttribute("dragged", "true");
                    grid.setAttribute("dragging-workspace", "true");

                    const placeholder = this.el("div", { className: "library-workspace-card-placeholder" });
                    grid.insertBefore(placeholder, card);

                    card.style.width = preDragRect.width + "px";
                    card.style.height = preDragRect.height + "px";

                    const gridRectAtStart = grid.getBoundingClientRect();
                    card.style.left = (preDragRect.left - gridRectAtStart.left) + "px";
                    card.style.top = (preDragRect.top - gridRectAtStart.top) + "px";

                    void card.offsetWidth;
                    const scaledRect = card.getBoundingClientRect();
                    const initialOffsetX = e.clientX - scaledRect.left;
                    const initialOffsetY = e.clientY - scaledRect.top;

                    const originalIndex = Array.from(grid.children).indexOf(placeholder);

                    let currentX = preDragRect.left;
                    let currentY = preDragRect.top;
                    let targetX = preDragRect.left;
                    let targetY = preDragRect.top;
                    let isDragging = true;
                    let isLanding = false;
                    let mouseX = e.clientX;
                    let mouseY = e.clientY;

                    const finalizeDrop = () => {
                        isDragging = false;
                        isLanding = false;
                        overlay.remove();

                        grid.removeAttribute("dragging-workspace");

                        Array.from(grid.children).forEach(s => {
                            s.style.transition = "";
                            s.style.transform = "";
                        });

                        grid.insertBefore(card, placeholder);
                        card.removeAttribute("dragged");
                        card.style.width = "";
                        card.style.height = "";
                        card.style.left = "";
                        card.style.top = "";
                        card.style.backgroundColor = "";

                        const newIndex = Array.from(grid.children).indexOf(card);
                        placeholder.remove();

                        if (newIndex !== originalIndex) {
                            if (window.gZenWorkspaces && window.gZenWorkspaces.reorderWorkspace) {
                                window.gZenWorkspaces.reorderWorkspace(ws.uuid, newIndex);
                                setTimeout(() => {
                                    if (this.library.update) this.library.update();
                                }, 100);
                            }
                        }

                        // Safety: Ensure create button is always last
                        const createBtn = grid.querySelector('.library-create-workspace-button');
                        if (createBtn && (card.compareDocumentPosition(createBtn) & Node.DOCUMENT_POSITION_PRECEDING)) {
                            grid.appendChild(createBtn);
                        }
                    };

                    const moveLoop = () => {
                        if (!isDragging && !isLanding) return;

                        const lerpFactor = isLanding ? 0.25 : 0.18;
                        currentX += (targetX - currentX) * lerpFactor;
                        currentY += (targetY - currentY) * lerpFactor;

                        const currentGridRect = grid.getBoundingClientRect();
                        card.style.left = (currentX - currentGridRect.left) + "px";
                        card.style.top = (currentY - currentGridRect.top) + "px";

                        if (isLanding) {
                            const dist = Math.hypot(targetX - currentX, targetY - currentY);
                            if (dist < 0.5) {
                                finalizeDrop();
                                return;
                            }
                        } else {
                            const scrollThreshold = 150;
                            if (mouseX < currentGridRect.left + scrollThreshold) {
                                const intensity = Math.pow((currentGridRect.left + scrollThreshold - mouseX) / scrollThreshold, 2);
                                grid.scrollLeft -= intensity * 25;
                            } else if (mouseX > currentGridRect.right - scrollThreshold) {
                                const intensity = Math.pow((mouseX - (currentGridRect.right - scrollThreshold)) / scrollThreshold, 2);
                                grid.scrollLeft += intensity * 25;
                            }
                        }

                        requestAnimationFrame(moveLoop);
                    };

                    const onMouseMove = (moveEvent) => {
                        mouseX = moveEvent.clientX;
                        mouseY = moveEvent.clientY;
                        targetX = mouseX - initialOffsetX;
                        targetY = mouseY - initialOffsetY;

                        const children = Array.from(grid.children).filter(c => !c.classList.contains('library-create-workspace-button'));
                        for (let i = 0; i < children.length; i++) {
                            const sib = children[i];
                            if (sib === card || sib === placeholder) continue;
                            const r = sib.getBoundingClientRect();
                            if (mouseX > r.left && mouseX < r.right) {
                                const halfway = r.left + r.width / 2;
                                let shouldSwap = false;
                                let swapTarget = null;
                                let insertBefore = false;

                                if (mouseX < halfway) {
                                    if (placeholder.nextSibling !== sib) {
                                        shouldSwap = true;
                                        swapTarget = sib;
                                        insertBefore = true;
                                    }
                                } else {
                                    if (sib.nextSibling !== placeholder) {
                                        shouldSwap = true;
                                        swapTarget = sib.nextSibling;
                                        insertBefore = true;
                                        // Wait, insertBefore sib.nextSibling effectively is insertAfter sib
                                    }
                                }

                                if (shouldSwap) {
                                    // 1. First: Capture current positions
                                    const siblings = Array.from(grid.children).filter(c => c !== card && c !== placeholder && c.classList.contains('library-workspace-card'));
                                    const firstForSiblings = new Map();
                                    siblings.forEach(s => {
                                        firstForSiblings.set(s, s.getBoundingClientRect());
                                    });

                                    // 2. Play (Move DOM)
                                    if (insertBefore) {
                                        grid.insertBefore(placeholder, swapTarget);
                                    } else {
                                        // Logic above covers all cases with swapTarget
                                    }

                                    // 3. Last & Invert: Calculate delta and apply transform
                                    siblings.forEach(s => {
                                        const first = firstForSiblings.get(s);
                                        const last = s.getBoundingClientRect();
                                        const deltaX = first.left - last.left;
                                        const deltaY = first.top - last.top;

                                        if (deltaX !== 0 || deltaY !== 0) {
                                            s.style.transition = 'none';
                                            s.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

                                            // Force layout
                                            void s.offsetWidth;

                                            // 4. Play: Remove transform to animate to new position
                                            requestAnimationFrame(() => {
                                                s.style.transition = 'transform 0.3s var(--zen-library-easing)';
                                                s.style.transform = '';
                                            });
                                        }
                                    });
                                }
                                break;
                            }
                        }
                    };

                    const onMouseUp = () => {
                        isDragging = false;
                        document.removeEventListener("mousemove", onMouseMove);
                        document.removeEventListener("mouseup", onMouseUp);

                        const finalRect = placeholder.getBoundingClientRect();
                        targetX = finalRect.left;
                        targetY = finalRect.top;
                        isLanding = true;
                    };

                    document.addEventListener("mousemove", onMouseMove);
                    document.addEventListener("mouseup", onMouseUp);
                    requestAnimationFrame(moveLoop);
                });

                const footer = this.el("div", { className: "library-card-footer" }, [
                    dragHandle,
                    this.el("div", { textContent: "⋯" })
                ]);

                card.appendChild(header);
                card.appendChild(listContainer);
                card.appendChild(footer);

                return card;
            } catch (e) {
                console.error("Error creating workspace card:", e);
                return null;
            }
        }

        closeWorkspaceUnpinnedTabs(workspaceId) {
            const wsEl = window.gZenWorkspaces.workspaceElement(workspaceId);
            const tabs = Array.from(wsEl?.tabsContainer?.children || []).filter(child =>
                window.gBrowser.isTab(child) && !child.hasAttribute("zen-essential")
            );

            if (tabs.length === 0) return;

            let closableTabs = tabs.filter(tab => {
                const attributes = ["selected", "multiselected", "pictureinpicture", "soundplaying"];
                for (const attr of attributes) if (tab.hasAttribute(attr)) return false;
                const browser = tab.linkedBrowser;
                if (window.webrtcUI?.browserHasStreams(browser) ||
                    browser?.browsingContext?.currentWindowGlobal?.hasActivePeerConnections()) return false;
                return true;
            });

            if (closableTabs.length === 0) closableTabs = tabs;

            window.gBrowser.removeTabs(closableTabs, {
                closeWindowWithLastTab: false,
            });

            if (window.gZenUIManager?.showToast) {
                const restoreKey = window.gZenKeyboardShortcutsManager?.getShortcutDisplayFromCommand(
                    "History:RestoreLastClosedTabOrWindowOrSession"
                ) || "Ctrl+Shift+T";

                window.gZenUIManager.showToast("zen-workspaces-close-all-unpinned-tabs-toast", {
                    l10nArgs: { shortcut: restoreKey },
                });
            }

            if (this.library.update) {
                setTimeout(() => this.library.update(), 200);
            }
        }

        renderItemRecursive(item, container, wsId) {
            if (window.gBrowser.isTabGroup(item)) {
                if (item.hasAttribute("split-view-group")) {
                    this.renderSplitView(item, container, wsId);
                } else {
                    this.renderFolder(item, container, wsId);
                }
            } else if (window.gBrowser.isTab(item)) {
                this.renderTab(item, container, wsId);
            }
        }

        renderSplitView(group, container, wsId) {
            const splitEl = this.el("div", { className: "library-split-view-group" });
            const tabs = (group.tabs || []).filter(child => {
                return !child.hasAttribute('cloned') && !child.hasAttribute('zen-empty-tab');
            });
            tabs.forEach(tab => this.renderTab(tab, splitEl, wsId));
            container.appendChild(splitEl);
        }

        renderFolder(folder, container, wsId) {
            const folderId = folder.id || `${wsId}:${folder.label}`;

            let isExpanded;
            if (this._folderExpansion.has(folderId)) {
                isExpanded = this._folderExpansion.get(folderId);
            } else {
                const isNativeCollapsed = folder.hasAttribute("zen-folder-collapsed") || folder.collapsed;
                isExpanded = !isNativeCollapsed;
                this._folderExpansion.set(folderId, isExpanded);
            }

            const allTabs = folder.allItemsRecursive || folder.tabs || [];
            const hasActive = allTabs.some(t => t.selected);

            const folderEl = this.el("div", { className: `library-workspace-folder ${isExpanded ? '' : 'collapsed'}` });

            const headerEl = this.el("div", {
                className: "library-workspace-item folder",
                onclick: (e) => {
                    e.stopPropagation();
                    const currentlyExpanded = this._folderExpansion.get(folderId);
                    const newlyExpanded = !currentlyExpanded;

                    this._folderExpansion.set(folderId, newlyExpanded);
                    folderEl.classList.toggle("collapsed", !newlyExpanded);

                    const chevron = headerEl.querySelector(".folder-chevron svg");
                    if (chevron) {
                        const rot = newlyExpanded ? "0deg" : "-90deg";
                        chevron.setAttribute("style", `transform: rotate(${rot}); transition: transform 0.2s;`);
                    }

                    const iconSvg = headerEl.querySelector(".folder-icon svg");
                    if (iconSvg) {
                        iconSvg.setAttribute("state", newlyExpanded ? "open" : "close");
                    }
                }
            });

            const rot = isExpanded ? '0deg' : '-90deg';
            const chevronSvg = this.svg(`<svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" style="transform: rotate(${rot}); transition: transform 0.2s;"><path d="M7 10l5 5 5-5z"/></svg>`);

            const folderIconSvg = this.createFolderIconSVG(folder.iconURL, isExpanded ? "open" : "close", hasActive && !isExpanded);

            headerEl.appendChild(this.el("span", { className: "folder-chevron" }, [chevronSvg]));

            const iconWrapper = this.el("span", { className: "item-icon folder-icon" });
            iconWrapper.appendChild(folderIconSvg);
            headerEl.appendChild(iconWrapper);

            headerEl.appendChild(this.el("span", { className: "item-label", textContent: folder.label || "Folder" }));

            folderEl.appendChild(headerEl);

            const contentEl = this.el("div", { className: "library-workspace-folder-content" });
            const children = (folder.allItems || folder.tabs || []).filter(child => {
                return !child.hasAttribute('cloned') && !child.hasAttribute('zen-empty-tab');
            });
            children.forEach(child => this.renderItemRecursive(child, contentEl, wsId));

            folderEl.appendChild(contentEl);
            container.appendChild(folderEl);
        }

        renderTab(tab, container, wsId) {
            const iconSrc = tab.image || tab.icon || "chrome://global/skin/icons/defaultFavicon.svg";
            const isPinned = tab.pinned;

            const itemEl = this.el("div", {
                className: `library-workspace-item ${tab.selected ? 'selected' : ''}`,
                onclick: () => {
                    if (window.gZenWorkspaces.activeWorkspace !== wsId) {
                        window.gZenWorkspaces.changeWorkspaceWithID(wsId);
                    }
                    window.gBrowser.selectedTab = tab;
                    window.gZenLibrary.close();
                }
            }, [
                this.el("img", { src: iconSrc, className: "item-icon", onerror: "this.src='chrome://global/skin/icons/defaultFavicon.svg'" }),
                this.el("span", { className: "item-label", textContent: tab.label })
            ]);

            const contextId = tab.getAttribute("usercontextid");
            if (contextId && contextId !== "0") {
                const computedStyle = window.getComputedStyle(tab);
                const identityColor = computedStyle.getPropertyValue("--identity-tab-color");
                const identityLine = this.el("div", {
                    className: "library-tab-identity-line",
                    style: `--identity-tab-color: ${identityColor || 'transparent'}`
                });
                itemEl.appendChild(identityLine);
            }

            const closeBtn = this.el("div", {
                className: `library-tab-close-button ${isPinned ? 'unpin' : 'close'}`,
                title: isPinned ? "Unpin Tab" : "Close Tab",
                onclick: (e) => {
                    e.stopPropagation();
                    if (isPinned) {
                        window.gBrowser.unpinTab(tab);
                    } else {
                        window.gBrowser.removeTab(tab);
                    }
                    if (this.library.update) setTimeout(() => this.library.update(), 150);
                }
            }, [this.el("div", { className: "icon-mask" })]);
            itemEl.appendChild(closeBtn);

            container.appendChild(itemEl);
        }
    }

    window.ZenLibrarySpaces = ZenLibrarySpaces;
})();
