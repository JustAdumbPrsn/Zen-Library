(function () {
    // Cleanup previous instance
    if (window.gZenLibrary && window.gZenLibrary.destroy) {
        window.gZenLibrary.destroy();
    }

    const CSS_CONTENT = `
:host {
    --zen-library-width: 340px;
    --zen-library-sidebar-width: 90px;
    --zen-library-easing: cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    height: 100%;
    /* LOCK WIDTH to start-width so browser layout doesn't shrink webview */
    width: var(--zen-library-start-width, 0px) !important; 
    flex-direction: row;
    overflow: visible; /* Allow library to spill out */
    box-sizing: border-box;
    min-height: 0; /* Prevention of flex expansion */

    --tab-label-mask-size: 2em;
    --zen-folder-front-bgcolor: light-dark(color-mix(in srgb, var(--zen-primary-color), white 70%), color-mix(in srgb, var(--zen-primary-color), black 40%));
    --zen-folder-behind-bgcolor: light-dark(color-mix(in srgb, var(--zen-primary-color) 60%, gray), color-mix(in srgb, var(--zen-primary-color) 60%, #c1c1c1));
    --zen-folder-stroke: light-dark(color-mix(in srgb, var(--zen-primary-color) 50%, black), color-mix(in srgb, var(--zen-primary-color) 15%, #ebebeb));
}

/* LIST VIEW STYLES (Refactored from History) */
.library-list-wrapper {
    position: relative;
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.library-list-panes {
    display: flex;
    flex: 1;
    width: 200%;
    transition: transform 0.25s var(--zen-library-easing);
    will-change: transform;
}

.history-pane {
    width: 50%;
    display: flex;
    flex-direction: column;
    height: 100%;
    position: relative;
}

.library-list-container, .library-closed-windows-container {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none; /* Hidden by default */
    padding: 0;
}

.scrollbar-visible {
    scrollbar-width: auto !important; /* Normal width as requested */
}

/* Custom WebKit Scrollbar (applied to list containers and spaces grid) */
.library-list-container::-webkit-scrollbar,
.library-workspace-grid::-webkit-scrollbar,
.library-closed-windows-container::-webkit-scrollbar {
    width: 4px;
}

.library-list-container::-webkit-scrollbar-thumb,
.library-workspace-grid::-webkit-scrollbar-thumb,
.library-closed-windows-container::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, currentColor, transparent 50%);
    border-radius: 10px;
}

.library-list-container::-webkit-scrollbar-track,
.library-workspace-grid::-webkit-scrollbar-track,
.library-closed-windows-container::-webkit-scrollbar-track {
    background: transparent;
}


.library-list-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px;
    height: 40px;
    margin: 0 8px;
    border-radius: var(--border-radius-medium);
    cursor: pointer;
    transition: all 0.2s; /* Sync with workspace item */
    position: relative;
    user-select: none;
    flex-shrink: 0;
    opacity: 0.9; /* Sync with workspace item */
    box-sizing: border-box;
}

.library-list-item:hover {
    background: var(--zen-library-hover-bg, var(--ws-tab-hover-color, rgba(255, 255, 255, 0.08)));
}

.library-list-item:active {
    transform: scale(0.98);
}

.library-list-item .item-icon-container {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    opacity: 0.8;
}

.library-list-item .item-icon {
    width: 16px;
    height: 16px;
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
}

.library-list-item .item-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.library-list-item .item-title {
    font-size: 13px; /* Match Spaces UI */
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: 0.95;
}

.library-list-item .item-url {
    font-size: 10px; /* Slightly smaller to fit 40px height */
    opacity: 0.5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: -1px; /* Tighter spacing */
}

.library-list-item .item-time {
    font-size: 9px;
    opacity: 0.35;
    font-variant-numeric: tabular-nums;
    margin-left: 0; /* Removed manual margin gap */
    flex-shrink: 0;
    display: block;
}

/* Hover Interaction: Timestamp <-> Folder Icon */
.library-list-item:hover .item-time {
    display: none; 
}

.library-list-item .item-folder-icon {
    display: none;
    width: 24px;
    height: 24px;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    cursor: pointer;
    flex-shrink: 0;
    opacity: 0.6;
    margin-right: -4px; /* Align slightly right */
}

.library-list-item:hover .item-folder-icon {
    display: flex;
}

.library-list-item .item-folder-icon:hover {
    background: rgba(255, 255, 255, 0.1);
    opacity: 1;
}

.library-list-item .item-folder-icon svg {
    width: 14px;
    height: 14px;
    fill: currentColor;
}

:host(.closing) {
    /* No special width needed, offset animation handles exit */
}

@keyframes blockSlideIn {
    from { transform: translateX(-90px); }
    to { transform: translateX(0); }
}

@keyframes blockSlideOut {
    from { transform: translateX(0); }
    to { transform: translateX(-90px); }
}

@keyframes contentFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

@keyframes blockSlideInRight {
    from { transform: translateX(90px); }
    to { transform: translateX(0); }
}

@keyframes blockSlideOutRight {
    from { transform: translateX(0); }
    to { transform: translateX(90px); }
}

@keyframes contentFadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
}

#zen-library-sidebar-new {
    width: var(--zen-library-sidebar-width);
    min-width: var(--zen-library-sidebar-width);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 15px 0 6px 0;
    box-sizing: border-box;
    box-shadow: 0 0 16px rgba(0, 0, 0, 0.15);
    border-right: 1px solid var(--zen-border-color, rgba(129, 129, 129, 0.1));
    z-index: 2;
    position: relative;
    background: transparent !important;
    animation: blockSlideIn 0.2s var(--zen-library-easing) 0s both;
}

:host([right-side]) #zen-library-sidebar-new {
    border-right: none;
    border-left: 1px solid var(--zen-border-color, rgba(129, 129, 129, 0.1));
    animation-name: blockSlideInRight;
}

:host([right-side]) {
    flex-direction: row-reverse;
}

:host(.closing) #zen-library-sidebar-new {
    animation: blockSlideOut 0.15s var(--zen-library-easing) both;
}

:host([right-side].closing) #zen-library-sidebar-new {
    animation-name: blockSlideOutRight;
}

.zen-library-sidebar-items {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
    justify-content: center;
    width: 100%;
}

.sidebar-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px; /* Increased gap between icon and label */
    cursor: pointer;
    width: 76px;
    padding: 10px 0;
    border-radius: var(--border-radius-medium);
    opacity: 0.6;
}

.sidebar-item:hover {
    opacity: 0.75;
    background: var(--tab-hover-background-color, rgba(255, 255, 255, 0.1));
}

.sidebar-item.active {
    opacity: 0.8;
    background: rgba(255, 255, 255, 0.15);
    font-weight: 600;
}

.sidebar-item .icon {
    width: 32px;
    height: 32px;
    transition: transform 0.3s var(--zen-library-easing);
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
}

.sidebar-item .icon svg {
    width: 100%;
    height: 100%;
    overflow: visible;
}

.sidebar-item.active .icon {
    /* Static selection: no scale or displacement */
}

.sidebar-item .icon path, 
.sidebar-item .icon rect,
.sidebar-item .icon circle {
    transition: all 0.3s var(--zen-library-easing);
    vector-effect: non-scaling-stroke;
}

.sidebar-item .label {
    font-size: 11px; /* Increased from 10px */
    text-align: center;
    font-weight: 600 !important;
    opacity: 0.9;
    margin-top: 2px;
}

.sidebar-item.active .label {
    font-weight: 800 !important;
    opacity: 1;
}

/* Idle state: 0.7 opacity for all SVG elements */
.sidebar-item .icon {
    opacity: 0.7;
    transition: opacity 0.3s var(--zen-library-easing);
}

.sidebar-item.active .icon {
    opacity: 1;
}

.sidebar-item.active .icon circle,
.sidebar-item.active .icon .front-rect,
.sidebar-item.active .icon .back-rect {
    fill-opacity: 1 !important;
}

/* Mountain always visible */
.media-icon .mountain {
    fill-opacity: 0.7;
}
.sidebar-item.active .media-icon .mountain {
    fill-opacity: 1 !important;
}


.back-icon {
    mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='19' y1='12' x2='5' y2='12'%3E%3C/line%3E%3Cpolyline points='12 19 5 12 12 5'%3E%3C/polyline%3E%3C/svg%3E");
    background-color: currentColor !important;
    width: 24px !important;
    height: 24px !important;
}

#zen-library-main-panel {
    /* Explicitly sizing because host is visually collapsed (0px/small) */
    width: calc(var(--zen-library-width) - var(--zen-library-sidebar-width));
    min-width: 250px;
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 16px 0 0 0; /* 16px top, 0px horizontal/bottom */
    box-sizing: border-box;
    z-index: 1;
    animation: blockSlideIn 0.2s var(--zen-library-easing) 0s both;
    /* CRITICAL: Do not shrink, allow overflow out of host */
    flex-shrink: 0;
    flex-grow: 0;
    min-height: 0; /* Prevention of flex expansion */
}

:host([right-side]) #zen-library-main-panel {
    animation-name: blockSlideInRight;
}

:host([active-tab="spaces"]) #zen-library-main-panel { padding: 0; }

:host(.closing) #zen-library-main-panel {
    animation: blockSlideOut 0.15s var(--zen-library-easing) both;
}

:host([right-side].closing) #zen-library-main-panel {
    animation-name: blockSlideOutRight;
}

.library-header, .library-content {
    opacity: 0;
    animation: contentFadeIn 0.2s ease-in both;
}

:host(.closing) .library-header, :host(.closing) .library-content {
    animation: contentFadeOut 0.15s ease-in both;
}

.library-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
    min-height: 0; /* Prevention of flex expansion */
}

.library-content-fade-in {
    animation: contentFadeIn 0.3s var(--zen-library-easing);
}

@keyframes contentFadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}

@keyframes emptyStateFadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 0.7; transform: translateY(0); }
}

.library-list-wrapper {
    position: relative;
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.library-list-panes {
    display: flex;
    flex: 1;
    width: 200%;
    transition: transform 0.25s var(--zen-library-easing);
    will-change: transform;
}

.history-pane {
    width: 50%;
    display: flex;
    flex-direction: column;
    height: 100%;
    position: relative;
}

.library-list-container, .library-closed-windows-container {
    flex: 1;
    overflow-y: hidden; /* Hide by default to prevent 1px lines */
    overflow-x: hidden;
    padding: 0;
}

.scrollbar-visible {
    scrollbar-width: auto !important; /* Restore native width */
    overflow-y: auto !important; /* Only scroll when visible */
}

.view-switcher-container {
    display: flex;
    align-items: center;
    padding: 4px 16px;
    margin-bottom: 4px;
    gap: 8px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    opacity: 0.6;
    transition: opacity 0.2s;
    user-select: none;
}

.view-switcher-container:hover {
    opacity: 1;
}

.view-switcher-arrow {
    width: 14px;
    height: 14px;
    background-color: currentColor;
    mask-image: url("chrome://global/skin/icons/arrow-down.svg");
    mask-size: contain;
    mask-repeat: no-repeat;
    mask-position: center;
    transition: transform 0.3s var(--zen-library-easing);
}

.panes-shifted .view-switcher-arrow {
    transform: rotate(-90deg);
}

.panes-shifted .library-list-panes {
    transform: translateX(-50%);
}

.history-nav-item {
    display: flex;
    align-items: center;
    gap: 8px; /* Match library-list-item */
    padding: 0 8px; /* Match library-list-item */
    height: 40px; /* Match library-list-item */
    cursor: pointer;
    transition: all 0.2s var(--zen-library-easing);
    border-radius: var(--border-radius-medium);
    margin: 0 8px; /* Match library-list-item */
    color: var(--ws-text-color);
    flex-shrink: 0;
    opacity: 0.9;
}

.history-nav-item:hover {
    background: var(--zen-library-hover-bg, rgba(255, 255, 255, 0.08));
}

.history-nav-item .nav-icon {
    width: 16px; /* Match history favicon size */
    height: 16px; /* Match history favicon size */
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    opacity: 0.8;
}

.history-nav-item .nav-label {
    flex: 1;
    font-size: 14px;
    font-weight: 500;
}

.history-nav-item .nav-arrow {
    width: 16px;
    height: 16px;
    background-color: currentColor;
    mask-image: url("chrome://global/skin/icons/arrow-right.svg");
    mask-size: contain;
    mask-repeat: no-repeat;
    mask-position: center;
    opacity: 0.5;
}

.history-back-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    opacity: 0.6;
    transition: opacity 0.2s;
    margin-bottom: 0px; /* Reduced from 8px */
}

.history-back-button:hover {
    opacity: 1;
}

.history-back-button .back-arrow {
    width: 14px;
    height: 14px;
    background-color: currentColor;
    mask-image: url("chrome://global/skin/icons/arrow-left.svg");
    mask-size: contain;
    mask-repeat: no-repeat;
    mask-position: center;
}

.history-separator {
    height: 1px;
    background: currentColor;
    opacity: 0.1;
    margin: 4px 16px; /* Tighter margins */
}

.search-container {
    background: var(--zen-toolbar-element-bg) !important;
    border-radius: var(--border-radius-medium);
    display: flex;
    align-items: center;
    padding: 0; 
    margin: 0 8px 8px 8px; /* Added 8px bottom margin for spacing */
    gap: 0;
    width: auto;
    outline: none !important;
    overflow: hidden;
    position: relative;
    height: 40px; 
}

.search-container input {
    background: none;
    border: none;
    flex: 1;
    font-size: 13.5px;
    outline: none;
    padding-left: 8px;
    padding-right: 4px;
    height: 100%;
    color: inherit;
}

.search-icon-wrapper {
    width: 40px; /* Match height */
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    opacity: 0.5;
}


.search-icon {
    width: 18px;
    height: 18px;
    mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'%3E%3C/circle%3E%3Cline x1='21' y1='21' x2='16.65' y2='16.65'%3E%3C/line%3E%3C/svg%3E");
    mask-size: contain;
    mask-repeat: no-repeat;
    background-color: currentColor;
    opacity: 0.5;
}

.search-container input {
    background: none;
    border: none;
    flex: 1;
    font-size: 15px;
    outline: none;
}

.empty-state {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 24px;
    height: 100%;
    width: 100%;
}



.empty-state h3 { font-size: 22px; font-weight: 600; opacity: 0.5; margin: 0; }
.empty-state p { font-size: 14px; opacity: 0.5; line-height: 1.6; margin: 0; }

.learn-more {
    border: none;
    padding: 10px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    background: var(--zen-primary-color, #3b82f6);
    color: white;
}

/* SPACES GRID & CARD */
.library-workspace-grid {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    gap: 16px;
    padding: 0 20px;
    align-items: center;
    height: 100%;
    overflow-x: hidden;
    overflow-y: hidden;
    /* Inheritance of library scrollbar styles */
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, currentColor, transparent 50%) transparent;
}

.library-workspace-grid::-webkit-scrollbar {
    width: 4px;
    height: 4px; /* Ensure horizontal scrollbar is styled */
}

.library-workspace-grid::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, currentColor, transparent 50%);
    border-radius: 10px;
}

.library-workspace-grid::-webkit-scrollbar-track {
    background: transparent;
}

.library-workspace-grid.scrollbar-visible {
    overflow-x: auto;
}



/* Create Workspace Button */
.library-create-workspace-button {
    width: 36px;
    height: 36px;
    min-width: 36px;
    border-radius: 50%;
    background: light-dark(
        color-mix(in srgb, var(--zen-primary-color, #3b82f6), white 70%),
        color-mix(in srgb, var(--zen-primary-color, #3b82f6), black 40%)
    );
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: opacity 0.2s ease, transform 0.15s cubic-bezier(0.07, 0.95, 0, 1);
    opacity: 0.7;
    color: var(--toolbarbutton-icon-fill, rgba(255, 255, 255, 0.85));
    margin-left: 2px; /* Shifted back left to feel even with last card spacing */
}

.library-create-workspace-button:hover {
    opacity: 1;
    transform: scale(1.05);
}

.library-create-workspace-button:active {
    transform: scale(0.95);
    transition: transform 0.1s ease-out;
    opacity: 0.9;
}

.library-create-workspace-button span {
    font-size: 22px;
    font-weight: 300;
    line-height: 0; /* Align using line-height 0 and small margin */
    color: inherit;
    user-select: none;
    transition: transform 0.2s ease;
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: -1.5px; /* Fine-tuned for pixel-perfect centering */
}

.library-create-workspace-button:active span {
    transform: scale(0.95);
}

.library-workspace-card {
    width: 240px;
    min-width: 240px;
    height: calc(100% - (var(--zen-element-separation, 4px) * 10));
    max-height: calc(100% - (var(--zen-element-separation, 4px) * 10));
    flex-shrink: 0;
    flex-grow: 0;
    margin: 0; 
    border-radius: var(--border-radius-medium);
    padding: 8px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: var(--ws-gradient, var(--zen-primary-color));
    color: var(--ws-text-color, inherit);
    position: relative;
    overflow: hidden;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
    contain: strict; /* Isolation from layout changes */
    transition: opacity 0.3s var(--zen-library-easing);
}

.library-workspace-card::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image: url("chrome://browser/content/zen-images/grain-bg.png");
    opacity: var(--ws-grain, 0);
    pointer-events: none;
    mix-blend-mode: overlay;
}

.library-workspace-card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    position: relative;
    z-index: 2; /* Staying above grain/overlay */
    padding: 6px 10px; /* Reduced top/bottom padding by 4px */
    opacity: 0.9;
    flex-shrink: 0;
}

.library-workspace-separator-container {
    margin: 8px 10px; 
    display: flex;
    align-items: center;
}

.library-workspace-icon-container { width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; opacity: 0.8; color: var(--ws-text-color); }
.library-workspace-icon { 
    width: 100%; 
    height: 100%; 
    object-fit: contain; 
    /* If it's an image SVG, use mask to apply theme color */
    background-color: currentColor;
    mask-size: contain;
    mask-repeat: no-repeat;
    mask-position: center;
}
.library-workspace-icon-text { font-size: 16px; color: var(--ws-text-color); }
.library-workspace-icon-empty { width: 100%; height: 100%; border: 1px dashed var(--ws-text-color); border-radius: 4px; opacity: 0.5; }
.library-workspace-name { font-size: 14px; font-weight: 600; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ws-text-color); }

/* SPACES UI ITEMS - Adopted from Nebula */
.library-workspace-card-list {
    flex: 1;
    overflow-y: auto;
    scrollbar-width: none;
    min-height: 0;
}

.library-workspace-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-left: var(--tab-inline-padding);
    min-height: var(--tab-min-height);
    margin-block: 4px;
    margin-bottom: 2px;
    border-radius: var(--border-radius-medium) !important;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 13px;
    opacity: 0.9;
    box-sizing: border-box;
    flex-shrink: 0;
    position: relative;
    overflow: hidden;
}

.library-workspace-item:hover {
    background: var(--zen-library-hover-bg, var(--ws-tab-hover-color, rgba(255, 255, 255, 0.08)));
}

.library-workspace-item.selected {
    background: var(--ws-tab-selected-color, rgba(255, 255, 255, 0.12));
    box-shadow: var(--ws-tab-selected-shadow, none);
}

.library-workspace-item .item-icon {
    width: 16px;
    height: 16px;
    border-radius: 3px;
    flex-shrink: 0;
}

.library-workspace-item .item-label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
    direction: ltr;
    mask-image: linear-gradient(to left, transparent, black var(--tab-label-mask-size));
    transition: mask-image 0.15s ease;
}

.library-workspace-item:hover .item-label {
    /* Occlude text behind the close button */
    mask-image: linear-gradient(to left, transparent 32px, black 44px);
}

.library-workspace-item.folder .item-label {
    font-weight: 600 !important;
}

.library-tab-close-button {
    position: absolute;
    right: 6px; /* Moved 2px more to the right */
    top: 50%;
    transform: translateY(-50%);
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--border-radius-small, 4px);
    opacity: 0;
    pointer-events: none;
    cursor: pointer;
    background: transparent;
    color: var(--ws-text-color, inherit);
    transition: all 0.15s ease;
}

.library-tab-close-button .icon-mask {
    width: 14px;
    height: 14px;
    background-color: currentColor;
    mask-size: contain;
    mask-repeat: no-repeat;
    mask-position: center;
    -moz-context-properties: fill, stroke;
}

.library-tab-close-button.unpin .icon-mask {
    mask-image: url("chrome://browser/skin/zen-icons/unpin.svg");
}

.library-tab-close-button.close .icon-mask {
    mask-image: url("chrome://browser/skin/zen-icons/close.svg") !important;
}

.library-workspace-item:hover .library-tab-close-button {
    opacity: 0.7;
    pointer-events: auto;
}

.library-tab-close-button:hover {
    opacity: 1 !important;
    background: var(--ws-tab-hover-color, rgba(128, 128, 128, 0.3));
}


/* FOLDER STYLES - Exact copy from Nebula */
.library-workspace-folder {
    flex-shrink: 0; /* Prevention of layout shift */
    width: 100%;
}

.library-workspace-folder.collapsed > .library-workspace-folder-content {
    max-height: 0;
    opacity: 0;
    transform: translateY(-10px);
    pointer-events: none;
}

.library-workspace-folder-content {
    margin-inline-start: 16px;
    transition: max-height 0.15s cubic-bezier(0.4, 0, 0.2, 1), 
                opacity 0.1s ease, 
                transform 0.15s cubic-bezier(0.4, 0, 0.2, 1);
    max-height: 1000px; /* Safe large value for expansion */
    overflow: hidden;
}

.library-workspace-separator-container {
    display: flex;
    align-items: center;
    gap: 0;
    margin: 8px 0 0px 2px; /* No right margin to allow separator to reach the edge */
    position: relative;
    z-index: 10;
}

.library-workspace-separator {
    flex: 1;
    height: 1px;
    background: var(--ws-text-color, rgba(255, 255, 255, 0.08));
    opacity: 0.15;
    transition: all 0.2s ease;
}

.library-workspace-cleanup-button {
    height: 18px;
    padding: 0;
    width: 0;
    opacity: 0;
    border-radius: 4px;
    cursor: pointer;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    color: var(--ws-text-color);
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 500;
    pointer-events: none;
    margin-left: 0; 
    transition: opacity 0.2s ease;
}

.library-workspace-card:hover .library-workspace-cleanup-button {
    width: 48px;
    padding: 0 4px;
    margin-left: 4px;
    opacity: 0.6;
    pointer-events: auto;
}

.library-workspace-cleanup-button:hover {
    opacity: 1 !important;
    background-color: transparent !important;
    box-shadow: none !important;
}

.library-workspace-edit-button {
    margin-left: auto;
    cursor: pointer;
    opacity: 0.7; /* Match drag handle opacity */
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 6px;
    margin-right: -2px; /* Align with right edge like drag handle */
    transition: opacity 0.2s ease;
    border-radius: 4px;
    color: var(--ws-text-color);
}

.library-workspace-edit-button:hover {
    opacity: 1;
    background: transparent; /* Match drag handle hover */
}

.library-workspace-edit-button div {
    width: 14px;
    height: 14px;
    background-color: currentColor;
    mask-size: contain;
    mask-repeat: no-repeat;
    mask-position: center;
    mask-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 122.88 103.78' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0,103.78c11.7-8.38,30.46.62,37.83-14a16.66,16.66,0,0,0,.62-13.37,10.9,10.9,0,0,0-3.17-4.35,11.88,11.88,0,0,0-2.11-1.35c-9.63-4.78-19.67,1.91-25,10-4.9,7.43-7,16.71-8.18,23.07ZM54.09,43.42a54.31,54.31,0,0,1,15,18.06l50.19-49.16c3.17-3,5-5.53,2.3-10.13A6.5,6.5,0,0,0,117.41,0,7.09,7.09,0,0,0,112.8,1.6L54.09,43.42Zm-16.85,22c2.82,1.52,6.69,5.25,7.61,9.32L65.83,64c-3.78-7.54-8.61-14-15.23-18.58-6.9,9.27-5.5,11.17-13.36,20Z' fill='black' fill-rule='evenodd'/%3E%3C/svg%3E");
    pointer-events: none;
}

.library-workspace-cleanup-button::before {
    content: "";
    width: 12px;
    height: 12px;
    background-color: currentColor;
    mask-image: url("data:image/svg+xml,%3Csvg fill='none' stroke='currentColor' stroke-width='1.5' height='12' width='12' viewBox='0 0 12 12' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M 2.75,7.75 6,11 9.25,7.75 M 6,1 v 9.75'/%3E%3C/svg%3E");
    mask-size: contain;
    mask-repeat: no-repeat;
    mask-position: center;
}

.library-card-footer {
    padding: 6px 10px; /* Reduced top/bottom padding by 4px */
    display: flex;
    justify-content: space-between;
    align-items: center;
    opacity: 0.7;
    border-top: none;
    margin-top: auto;
    font-size: 14px;
    flex-shrink: 0;
    color: var(--ws-text-color);
}

.library-workspace-drag-handle {
    cursor: grab;
    padding: 6px 8px 8px 8px; /* Balanced padding */
    margin: -2px -4px -4px -4px; /* Equal visual spacing from edges */
    border-radius: 4px;
    transition: opacity 0.2s;
    user-select: none;
    font-size: 18px;
    line-height: 1;
    opacity: 0.7; /* Match edit button */
}

.library-workspace-drag-handle:hover {
    background: transparent; /* Remove background on hover */
    opacity: 1;
}

.library-workspace-drag-handle:active {
    cursor: grabbing;
}

.library-workspace-grid[dragging-workspace="true"] .library-workspace-card:not([dragged="true"]) {
    opacity: 0.7;
    filter: none;
    pointer-events: none;
}

/* Ensure placeholder also has sizing and flex properities */
.library-workspace-card-placeholder {
    width: 240px;
    min-width: 240px;
    height: calc(100% - (var(--zen-element-separation, 4px) * 10));
    background: rgba(255, 255, 255, 0.05);
    border: 2px dashed var(--zen-folder-stroke, rgba(255, 255, 255, 0.3));
    border-radius: var(--border-radius-medium);
    flex-shrink: 0;
    opacity: 0.7;
    animation: placeholderPopIn 0.3s var(--zen-library-easing) forwards;
}

@keyframes placeholderPopIn {
    from {
        opacity: 0;
        transform: scale(0.9);
    }
    to {
        opacity: 0.7;
        transform: scale(1);
    }
}

.library-workspace-card[dragged="true"] {
    position: fixed !important;
    z-index: 2 !important;
    pointer-events: none;
    transform-origin: center center;
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
    opacity: 1 !important;
    margin: 0 !important;
    /* Disable transitions while dragged to ensure instant scaling for offset calculation and smooth lerp */
    transition: none !important; 
    /* User requested: var(--zen-primary-color) as solid base behind gradient */
    background-color: var(--dragged-bg-color, var(--zen-colors-tertiary, #222)) !important;
    background-image: none !important; /* Ensure solid base is visible */
}

/* Layer the gradient on top of the solid primary color */
.library-workspace-card[dragged="true"]::before {
    content: "" !important;
    position: absolute !important;
    inset: 0 !important;
    background: var(--ws-gradient) !important;
    opacity: 1 !important;
    z-index: 1 !important;
    border-radius: inherit;
}

/* Restore grain/noise visibility on dragged card */
.library-workspace-card[dragged="true"]::after {
    content: "" !important;
    position: absolute !important;
    inset: 0 !important;
    background-image: url("chrome://browser/content/zen-images/grain-bg.png") !important;
    opacity: var(--ws-grain, 0.45) !important;
    pointer-events: none !important;
    mix-blend-mode: overlay !important;
    z-index: 2 !important;
    border-radius: inherit;
}

.folder-icon {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
}

/* FOLDER SVG FIXES - NEBULA EXACT COPY */
.folder-icon svg {
    overflow: visible !important;
    margin-left: -18px; 

}

.folder-icon svg image {
    fill: var(--ws-folder-stroke);
    -moz-context-properties: fill, fill-opacity;
}

.folder-icon svg g, 
.folder-icon svg rect, 
.folder-icon svg path {
    transition: transform 0.3s cubic-bezier(0.42, 0, 0, 1), opacity 0.3s cubic-bezier(0.42, 0, 0, 1);
}

.folder-icon svg[state='open'] .back {
    transform: skewX(16deg) translate(-2px, 3.4px) scale(0.85);
}

.folder-icon svg[state='open'] :is(.front, .dots, .icon) {
    transform: skewX(-16deg) translate(11.1px, 3.4px) scale(0.85);
}

/* SPLIT VIEW STYLES - 1:1 with Zen Native */
.library-split-view-group {
    display: flex;
    flex-direction: row;
    align-items: center;
    margin-block: 4px;
    margin-inline: 0;
    border-radius: var(--border-radius-medium);
    transition: background-color 0.2s, box-shadow 0.2s;
    position: relative;
    padding: 0 2px;
    min-height: var(--tab-min-height);
}

.library-split-view-group:hover {
    background: var(--ws-tab-hover-color, rgba(255, 255, 255, 0.08));
}

.library-split-view-group:has(.selected) {
    background: var(--ws-tab-selected-color, rgba(255, 255, 255, 0.12));
    box-shadow: var(--ws-tab-selected-shadow, none);
}

.library-split-view-group .library-workspace-item {
    flex: 1;
    min-width: 0; /* Ensures equal distribution regardless of text length */
    margin: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    padding-inline: 8px;
    justify-content: center;
}

.library-split-view-group .library-workspace-item .item-label {
    /* Optional: Hide labels in split view if they are too cramped, 
       but Zen usually shows them if there's space. 
       For now, let's keep them and let the mask handles it. */
}

.library-split-view-group .library-workspace-item:not(:last-child)::after {
    content: '';
    width: 1px;
    height: 16px;
    background-color: var(--ws-text-color);
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    opacity: 0.3; /* Subtle separator */
}

.library-tab-identity-line {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background-color: var(--identity-tab-color, transparent);
    z-index: 5;
    pointer-events: none;
    opacity: 0.8;
}

.library-split-view-group .library-workspace-item:hover .item-label {
     mask-image: linear-gradient(to left, transparent 28px, black 40px);
}

.library-list-container {
    position: absolute;
    inset: 0;
    flex-direction: column;
    padding: 0;
    overflow-y: hidden; /* defer to .scrollbar-visible */
    gap: 4px; /* Slightly tighter gap */
    min-height: 0;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, currentColor, transparent 50%) transparent;
}

.library-list-container::-webkit-scrollbar {
    width: 4px;
}

.library-list-container::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, currentColor, transparent 50%);
    border-radius: 10px;
}

.library-list-container::-webkit-scrollbar-track {
    background: transparent;
}

.history-bottom-spacer {
    height: 16px;
    flex-shrink: 0;
}

.history-section-header {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.5;
    margin: 8px 8px 8px 8px; /* 8px horizontal padding */
    display: flex;
    align-items: center;
    gap: 8px;
}

.history-section-header::after {
    content: "";
    flex: 1;
    height: 1px;
    background: currentColor;
    opacity: 0.2;
}

.library-list-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px;
    height: 40px;
    margin: 0 8px;
    border-radius: var(--border-radius-medium);
    cursor: pointer;
    transition: all 0.2s; /* Sync with workspace item */
    position: relative;
    user-select: none;
    flex-shrink: 0;
    opacity: 0.9; /* Sync with workspace item */
    box-sizing: border-box;
}


.library-list-item:hover {
    background: var(--zen-library-hover-bg, var(--ws-tab-hover-color, rgba(255, 255, 255, 0.08)));
}

.library-list-item:active {
    transform: scale(0.98);
}

.library-list-item .item-icon-container {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    opacity: 0.8;
}

.library-list-item .item-icon {
    width: 16px;
    height: 16px;
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
}

.library-list-item .item-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.library-list-item .item-title {
    font-size: 13px; /* Match Spaces UI */
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: 0.95;
}

.library-list-item .item-url {
    font-size: 10px; /* Slightly smaller to fit 40px height */
    opacity: 0.5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: -1px; /* Tighter spacing */
}

.library-list-item .item-time {
    font-size: 9px;
    opacity: 0.35;
    font-variant-numeric: tabular-nums;
    margin-left: 0; /* Removed manual margin gap */
    flex-shrink: 0;
}


/* Hover Interaction: Timestamp <-> Folder Icon */
.library-list-item:hover .item-time {
    display: none; 
}

.library-list-item .item-folder-icon {
    display: none;
    width: 24px;
    height: 24px;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    cursor: pointer;
    flex-shrink: 0;
    opacity: 0.6; /* Reduced opacity */
    margin-right: 0; /* Reset manual margin to rely on container padding (8px) */
    color: var(--ws-text-color, inherit); /* Ensure currentColor is valid */
}

.library-list-item:hover .item-folder-icon {
    display: flex;
}

.library-list-item .item-folder-icon:hover {
    background: rgba(255, 255, 255, 0.1);
    opacity: 1;
}

/* Replicate .library-tab-close-button .icon-mask pattern */
.library-list-item .item-folder-mask {
    width: 16px; /* Smaller size */
    height: 16px;
    background-color: currentColor;
    mask-size: contain;
    mask-repeat: no-repeat;
    mask-position: center;
    /* Zen Native "Folder" path (Modified to black for masking) */
    mask-image: url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 6H12L10 4H4C2.89543 4 2 4.89543 2 6V18C2 19.1046 2.89543 20 4 20H20C21.1046 20 22 19.1046 22 18V8C22 6.89543 21.1046 6 20 6Z' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
}

.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
    padding: 20px;
    gap: 10px;
    box-sizing: border-box;
    animation: emptyStateFadeIn 0.3s var(--zen-library-easing) both;
}

.empty-state h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    opacity: 0.9;
}

.empty-state p {
    margin: 0;
    font-size: 13px;
    opacity: 0.6;
    max-width: 250px;
}

.empty-icon {
    width: 64px;
    height: 64px;
    background-color: currentColor;
    opacity: 0.2;
    margin-bottom: 8px;
    mask-size: contain;
    mask-repeat: no-repeat;
    mask-position: center;
    -moz-context-properties: fill, stroke;
}

.empty-icon.downloads-icon {
    mask-image: url("chrome://browser/skin/downloads/downloads.svg");
}

.empty-icon.history-icon {
    mask-image: url("chrome://browser/skin/history.svg");
}

.empty-icon.spaces-icon {
    mask-image: url("chrome://browser/skin/window.svg");
}

.empty-icon.media-icon {
    mask-image: url("chrome://global/skin/media/audio.svg"); /* Fallback guess */
}
`;

    const GLOBAL_CSS = `
:root[zen-library-open="true"] #navigator-toolbox,
:root[zen-library-open-compact="true"] #navigator-toolbox,
:root[zen-library-open="true"] #zen-sidebar-splitter,
:root[zen-library-open-compact="true"] #zen-sidebar-splitter {
    display: none !important;
}
:root[zen-library-open="true"] #browser,
:root[zen-library-open-compact="true"] #browser {
    overflow: hidden !important;
}
:root[zen-library-open="true"] #zen-appcontent-wrapper,
:root[zen-library-open-compact="true"] #zen-appcontent-wrapper,
:root[zen-library-open="true"] #urlbar:not([open]),
:root[zen-library-open-compact="true"] #urlbar:not([open]) {
    transform: translateX(var(--zen-library-offset, 0px)) !important;
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    /* Ensure it doesn't try to be clever with width */
    width: 100% !important; 
}
:root[zen-right-side="true"][zen-library-open="true"] #zen-appcontent-wrapper,
:root[zen-right-side="true"][zen-library-open-compact="true"] #zen-appcontent-wrapper,
:root[zen-right-side="true"][zen-library-open="true"] #urlbar:not([open]),
:root[zen-right-side="true"][zen-library-open-compact="true"] #urlbar:not([open]) {
    /* Negative translate for right side */
    transform: translateX(calc(-1 * var(--zen-library-offset, 0px))) !important;
}
:root.zen-toolbox-fading-in #navigator-toolbox {
    animation: zen-fade-in 0.3s cubic-bezier(0.25, 1, 0.5, 1) !important;
}
@keyframes zen-fade-in { from { opacity: 0; } to { opacity: 1; } }
`;

    function escapeHTML(str) {
        if (!str) return "";
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    class ZenLibrarySpaces {
        static getWorkspaces() { return window.gZenWorkspaces ? window.gZenWorkspaces.getWorkspaces() : []; }
        static calculatePanelWidth(count) {
            const total = 90 + 40 + (count * 240) + ((count - 1) * 16);
            return Math.min(total, window.innerWidth * 0.8);
        }
        static getData() {
            const ws = this.getWorkspaces();
            return { workspaces: ws, width: ws.length ? this.calculatePanelWidth(ws.length) : 340 };
        }
    }

    class ZenLibraryElement extends HTMLElement {
        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
            this._activeTab = (window.gZenLibrary && window.gZenLibrary.lastActiveTab) || "downloads";
            this._initialized = false;
            this._sidebarItemEls = {};
            this._lastWorkspaceIds = null;
            this._folderExpansion = new Map(); // Local state: Map<id, isExpanded>

            // History State
            this._historyItems = [];
            this._renderedItems = [];
            this._historySearchTerm = "";
            this._downloadsSearchTerm = ""; // Initialize to empty string
            this._historyBatchSize = 30; // Reduced for smoother first render
            this._isHistoryLoading = false;
            this._renderedCount = 0;

            try {
                this._sessionStart = Services.startup.getStartupInfo().process.getTime();
            } catch (e) {
                this._sessionStart = Date.now();
            }
        }

        get activeTab() { return this._activeTab; }
        set activeTab(val) {
            if (this._activeTab === val) return;
            this._activeTab = val;
            if (window.gZenLibrary) window.gZenLibrary.lastActiveTab = val;
            this.setAttribute("active-tab", val);
            this.update();
        }

        connectedCallback() {
            try {
                if (!this._initialized) {
                    const style = document.createElement("style");
                    style.textContent = CSS_CONTENT;
                    this.shadowRoot.appendChild(style);

                    // Pull real Zen colors from the global scope into our shadow DOM
                    const updateColors = () => {
                        const rootStyle = window.getComputedStyle(document.documentElement);
                        const hoverBg = rootStyle.getPropertyValue("--zen-hover-background") ||
                            rootStyle.getPropertyValue("--tab-hover-background-color");
                        if (hoverBg) {
                            this.style.setProperty("--zen-library-hover-bg", hoverBg);
                        }
                    };
                    updateColors();
                    // Also update when theme might change
                    window.matchMedia("(prefers-color-scheme: dark)").addListener(updateColors);

                    const sidebar = document.createElement("div");
                    sidebar.id = "zen-library-sidebar-new";

                    const sidebarTop = document.createElement("div");
                    sidebarTop.className = "zen-library-sidebar-top";
                    sidebar.appendChild(sidebarTop);

                    const sidebarItemsContainer = document.createElement("div");
                    sidebarItemsContainer.className = "zen-library-sidebar-items";
                    const sidebarItems = ["downloads", "media", "history", "spaces"];
                    const parser = new DOMParser();

                    sidebarItems.forEach(id => {
                        const item = document.createElement("div");
                        item.className = "sidebar-item";
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

                        item.onclick = () => { this.activeTab = id; };
                        sidebarItemsContainer.appendChild(item);
                        this._sidebarItemEls[id] = item;
                    });
                    sidebar.appendChild(sidebarItemsContainer);

                    const sidebarBottom = document.createElement("div");
                    sidebarBottom.className = "zen-library-sidebar-bottom";
                    const exitBtn = document.createElement("div");
                    exitBtn.className = "sidebar-item exit-btn";
                    exitBtn.dataset.id = "exit";
                    exitBtn.innerHTML = `<div class="icon back-icon"></div><span class="label">Exit Library</span>`;
                    exitBtn.onclick = () => window.gZenLibrary.close();
                    sidebarBottom.appendChild(exitBtn);
                    sidebar.appendChild(sidebarBottom);
                    this.shadowRoot.appendChild(sidebar);

                    const panel = document.createElement("div");
                    panel.id = "zen-library-main-panel";
                    panel.innerHTML = `
                        <header class="library-header"></header>
                        <div class="library-content"></div>
                    `;
                    this.shadowRoot.appendChild(panel);

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

        renderHistory() {
            // Main wrapper for switcher and panes
            const wrapper = this.el("div", {
                className: "library-list-wrapper"
            });

            const panes = this.el("div", { className: "library-list-panes" });
            wrapper.appendChild(panes);

            // History Pane
            const historyPane = this.el("div", { className: "history-pane" });
            const historyContainer = this.el("div", {
                className: "library-list-container",
                onscroll: (e) => {
                    const el = e.target;
                    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
                        this.loadMoreHistory();
                    }
                }
            });
            this._historyContainer = historyContainer;
            historyPane.appendChild(historyContainer);
            panes.appendChild(historyPane);

            // Closed Windows Pane
            const closedPane = this.el("div", { className: "history-pane" });
            const closedContainer = this.el("div", { className: "library-closed-windows-container" });
            this._closedWindowsContainer = closedContainer;

            const backBtn = this.el("div", {
                className: "history-back-button",
                onclick: () => wrapper.classList.remove("panes-shifted")
            }, [
                this.el("div", { className: "back-arrow" }),
                this.el("span", { textContent: "Back to History" })
            ]);
            closedPane.appendChild(backBtn);
            closedPane.appendChild(closedContainer);
            panes.appendChild(closedPane);

            const startLoading = () => {
                const onLoaded = () => {
                    historyContainer.classList.add("library-content-fade-in");
                    // Delay scrollbar visibility until history loads
                    setTimeout(() => historyContainer.classList.add("scrollbar-visible"), 100);
                };

                // Add navigation items at the top of historyContainer
                const navItems = document.createDocumentFragment();

                const closedTabsItem = this.el("div", {
                    className: "history-nav-item history-nav-static",
                    onclick: () => {
                        wrapper.classList.add("panes-shifted");
                        this.renderClosedTabs();
                    }
                }, [
                    this.el("div", { className: "nav-icon", style: "background-image: url('chrome://browser/skin/history.svg')" }),
                    this.el("span", { className: "nav-label", textContent: "Recently closed tabs" }),
                    this.el("div", { className: "nav-arrow" })
                ]);

                const closedWindowsItem = this.el("div", {
                    className: "history-nav-item history-nav-static",
                    onclick: () => {
                        wrapper.classList.add("panes-shifted");
                        this.renderClosedWindows();
                    }
                }, [
                    this.el("div", { className: "nav-icon", style: "background-image: url('chrome://browser/skin/window.svg')" }),
                    this.el("span", { className: "nav-label", textContent: "Recently closed windows" }),
                    this.el("div", { className: "nav-arrow" })
                ]);

                navItems.appendChild(closedTabsItem);
                navItems.appendChild(closedWindowsItem);

                const clearItem = this.el("div", {
                    className: "history-nav-item history-nav-static",
                    onclick: () => {
                        const win = Services.wm.getMostRecentWindow("browser:pure") || window;

                        // 1. Try to trigger the command if found (most native way)
                        const cmd = win.document.getElementById("Tools:Sanitize") ||
                            win.document.getElementById("cmd_sanitizeHistory");
                        if (cmd) {
                            cmd.doCommand();
                            return;
                        }

                        // 2. Fallback to global observer notification
                        try {
                            Services.obs.notifyObservers(null, "sanitize", "");
                        } catch (e) { }

                        // 3. Last resort fallback: open the dialog directly
                        try {
                            win.openDialog(
                                "chrome://browser/content/sanitize.xhtml",
                                "Sanitize",
                                "chrome,modal,resizable=yes,centerscreen"
                            );
                        } catch (e) {
                            console.error("ZenLibrary: Failed to open clear history dialog", e);
                        }
                    }
                }, [
                    this.el("div", { className: "nav-icon", style: "background-image: url('chrome://global/skin/icons/delete.svg')" }),
                    this.el("span", { className: "nav-label", textContent: "Clear recent history..." })
                ]);
                navItems.appendChild(clearItem);

                historyContainer.appendChild(navItems);

                if (this._historyItems.length === 0 && !this._isHistoryLoading) {
                    this.fetchHistory().then(() => {
                        this.renderHistoryBatch(true); // Reset counters for new container
                        onLoaded();
                    });
                } else {
                    this.renderHistoryBatch(true); // Reset counters for new container
                    onLoaded();
                }
            };

            // Show centered loading placeholder
            const isTransitioning = window.gZenLibrary && window.gZenLibrary._isTransitioning;
            const loading = this.el("div", { className: "empty-state library-content-fade-in" }, [
                this.el("div", { className: "empty-icon history-icon" }),
                this.el("h3", { textContent: "Preparing history..." }),
                this.el("p", { textContent: "Hang tight, we're gathering your recent browsing history." })
            ]);
            historyContainer.appendChild(loading);

            const delay = isTransitioning ? 400 : 250;
            setTimeout(() => {
                const l = historyContainer.querySelector(".empty-state");
                if (l) l.remove();
                startLoading();
            }, delay);

            return wrapper;
        }

        renderDownloads() {
            // Main wrapper for switcher and panes
            const wrapper = this.el("div", {
                className: "library-list-wrapper"
            });
            const container = this.el("div", { className: "library-list-container" });
            wrapper.appendChild(container);
            this._downloadsContainer = container;

            const startLoading = () => {
                this.fetchDownloads().then(downloads => {
                    this.renderDownloadsList(downloads);
                    this._downloadsContainer.classList.add("library-content-fade-in");
                    setTimeout(() => this._downloadsContainer.classList.add("scrollbar-visible"), 100);
                });
            };

            // Show centered loading placeholder
            const isTransitioning = window.gZenLibrary && window.gZenLibrary._isTransitioning;
            const loading = this.el("div", { className: "empty-state library-content-fade-in" }, [
                this.el("div", { className: "empty-icon downloads-icon" }),
                this.el("h3", { textContent: "Loading downloads..." }),
                this.el("p", { textContent: "Hang tight, we're gathering your download history." })
            ]);
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

                return allDownloadsRaw.map(d => {
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
                    let progressBytes = Number(d.bytesTransferredSoFar) || 0;
                    let totalBytes = Number(d.totalBytes) || 0;

                    if (d.succeeded) {
                        status = "completed";
                        if (d.target && d.target.size && Number(d.target.size) > totalBytes) {
                            totalBytes = Number(d.target.size);
                        }
                        progressBytes = totalBytes;
                    } else if (d.error || d.canceled) {
                        status = "failed";
                    } else if (d.stopped || d.hasPartialData || d.state === Downloads.STATE_PAUSED || d.state === Downloads.STATE_DOWNLOADING) {
                        status = "paused";
                    }

                    if (status === "completed" && totalBytes === 0 && progressBytes > 0) {
                        totalBytes = progressBytes;
                    }

                    if (d.target && d.target.path && !fileExists) {
                        status = "deleted";
                    }

                    return {
                        id: d.id,
                        filename: String(filename || "FN_MISSING"),
                        size: totalBytes,
                        status: status,
                        url: String(d.source?.url || "URL_MISSING"),
                        timestamp: d.endTime || d.startTime || Date.now(),
                        targetPath: String(targetPath || ""),
                        raw: d
                    };
                }).filter(d => d.timestamp && (this._downloadsSearchTerm ? d.filename.toLowerCase().includes(this._downloadsSearchTerm.toLowerCase()) : true));

            } catch (e) {
                console.error("ZenLibrary: Error fetching downloads", e);
                return [];
            }
        }

        renderDownloadsList(downloads) {
            if (!this._downloadsContainer) return;
            this._downloadsContainer.innerHTML = "";
            this._downloadsContainer.classList.add("scrollbar-visible");

            if (downloads.length === 0) {
                const emptyState = this.el("div", { className: "empty-state" }, [
                    this.el("div", { className: "empty-icon downloads-icon" }),
                    this.el("h3", { textContent: "No downloads found" }),
                    this.el("p", { textContent: this._downloadsSearchTerm ? "Try a different search term." : "Your download history is empty." })
                ]);
                this._downloadsContainer.appendChild(emptyState);
                return;
            }

            // Group by date
            const groups = {};
            const now = new Date();
            downloads.forEach(d => {
                const date = new Date(d.timestamp);
                const diffTime = now - date;
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                let key = "Earlier";
                if (diffDays === 0 && now.getDate() === date.getDate()) key = "Today";
                else if (diffDays === 1) key = "Yesterday";
                else if (diffDays < 7) key = date.toLocaleDateString(undefined, { weekday: "long" });
                else if (diffDays < 30) key = "Last Month";

                if (!groups[key]) groups[key] = [];
                groups[key].push(d);
            });

            const order = ["Today", "Yesterday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Last Month", "Earlier"];

            order.forEach(key => {
                if (!groups[key]) return;

                this._downloadsContainer.appendChild(this.el("div", { className: "history-section-header", textContent: key }));

                groups[key].sort((a, b) => b.timestamp - a.timestamp).forEach(item => {
                    const timeStr = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    const row = this.el("div", {
                        className: "library-list-item",
                        onclick: (e) => {
                            // Ignore clicks on the folder icon, handled separately
                            if (e.target.closest('.item-folder-icon')) return;
                            this.handleDownloadAction(item, "open");
                        },
                        oncontextmenu: (e) => {
                            e.preventDefault();
                            this.handleDownloadContextMenu(e, item);
                        }
                    }, [
                        this.el("div", { className: "item-icon-container" }, [
                            this.el("div", {
                                className: "item-icon",
                                style: `background-image: url('moz-icon://${item.targetPath}?size=32'); opacity: 1;`
                            })
                        ]),
                        this.el("div", { className: "item-info" }, [
                            this.el("div", { className: "item-title", textContent: item.filename }),
                            this.el("div", { className: "item-url", textContent: `${this.formatBytes(item.size)} • ${item.status}` })
                        ]),
                        this.el("div", { className: "item-time", textContent: timeStr }),
                        this.el("div", {
                            className: "item-folder-icon",
                            title: "Show in Folder",
                            onclick: (e) => {
                                e.stopPropagation();
                                this.handleDownloadAction(item, "show");
                            },
                            innerHTML: `<div class="item-folder-mask"></div>`
                        })
                    ]);
                    this._downloadsContainer.appendChild(row);
                });
            });

            this._downloadsContainer.appendChild(this.el("div", { className: "history-bottom-spacer" }));
        }

        handleDownloadAction(item, action) {
            try {
                const file = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsIFile);
                file.initWithPath(item.targetPath);

                if (action === "open") {
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

        handleDownloadContextMenu(event, item) {
            // Create a simple custom context menu or leverage a XUL one if possible.
            // For now, simpler is better for stability.
            // We can rely on right-click -> show in folder behavior?
            // Or just make clicking it open it, and maybe a small button for folder?
            // Let's keep it simple: Click = Open.
        }

        formatBytes(bytes, decimals = 2) {
            if (!+bytes || bytes === 0) return "0 Bytes";
            const k = 1024;
            const dm = decimals < 0 ? 0 : decimals;
            const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
        }


        renderClosedWindows() {
            if (!this._closedWindowsContainer) return;
            this._closedWindowsContainer.innerHTML = "";
            this._closedWindowsContainer.classList.remove("scrollbar-visible");

            const closedData = SessionStore.getClosedWindowData();
            if (closedData.length === 0) {
                this._closedWindowsContainer.appendChild(this.el("div", { className: "empty-state" }, [
                    this.el("div", { className: "empty-icon history-icon" }),
                    this.el("h3", { textContent: "No recently closed windows" }),
                    this.el("p", { textContent: "Closed windows will appear here." })
                ]));
                return;
            }

            const fragment = document.createDocumentFragment();
            fragment.appendChild(this.el("div", { className: "history-section-header", textContent: "Closed Windows" }));

            closedData.forEach((win, index) => {
                const tabsCount = win.tabs.length;
                const title = win.title || `Window with ${tabsCount} tabs`;

                const row = this.el("div", {
                    className: "library-list-item",
                    onclick: () => {
                        SessionStore.undoCloseWindow(index);
                        window.gZenLibrary.close();
                    }
                }, [
                    this.el("div", { className: "item-icon-container" }, [
                        this.el("div", { className: "item-icon", style: "background-image: url('chrome://browser/skin/window.svg'); opacity: 0.6;" })
                    ]),
                    this.el("div", { className: "item-info" }, [
                        this.el("div", { className: "item-title", textContent: title }),
                        this.el("div", { className: "item-url", textContent: `${tabsCount} tabs` })
                    ])
                ]);
                fragment.appendChild(row);
            });

            this._closedWindowsContainer.appendChild(fragment);
            this._closedWindowsContainer.appendChild(this.el("div", { className: "history-bottom-spacer" }));

            // Fade in and show scrollbar after render
            this._closedWindowsContainer.classList.add("library-content-fade-in");
            setTimeout(() => this._closedWindowsContainer.classList.add("scrollbar-visible"), 100);
        }

        renderClosedTabs() {
            if (!this._closedWindowsContainer) return;
            const container = this._closedWindowsContainer;
            container.innerHTML = "";
            container.classList.remove("scrollbar-visible");

            const closedData = SessionStore.getClosedTabData(window);
            if (closedData.length === 0) {
                container.appendChild(this.el("div", { className: "empty-state" }, [
                    this.el("div", { className: "empty-icon history-icon" }),
                    this.el("h3", { textContent: "No recently closed tabs" }),
                    this.el("p", { textContent: "Tabs you close will appear here." })
                ]));
                return;
            }

            const fragment = document.createDocumentFragment();
            fragment.appendChild(this.el("div", { className: "history-section-header", textContent: "Closed Tabs" }));

            closedData.forEach((tabData, index) => {
                const title = tabData.title || tabData.state.entries[tabData.state.index - 1].title;
                const url = tabData.state.entries[tabData.state.index - 1].url;

                const row = this.el("div", {
                    className: "library-list-item",
                    onclick: () => {
                        SessionStore.undoCloseTab(window, index);
                        window.gZenLibrary.close();
                    }
                }, [
                    this.el("div", { className: "item-icon-container" }, [
                        this.el("div", { className: "item-icon", style: `background-image: url('page-icon:${url}');` })
                    ]),
                    this.el("div", { className: "item-info" }, [
                        this.el("div", { className: "item-title", textContent: title }),
                        this.el("div", { className: "item-url", textContent: url })
                    ])
                ]);
                fragment.appendChild(row);
            });

            container.appendChild(fragment);
            container.appendChild(this.el("div", { className: "history-bottom-spacer" }));

            container.classList.add("library-content-fade-in");
            setTimeout(() => container.classList.add("scrollbar-visible"), 100);
        }

        async fetchHistory() {
            this._isHistoryLoading = true;
            try {
                const { PlacesUtils } = ChromeUtils.importESModule("resource://gre/modules/PlacesUtils.sys.mjs");
                const query = PlacesUtils.history.getNewQuery();
                const options = PlacesUtils.history.getNewQueryOptions();
                options.sortingMode = options.SORT_BY_DATE_DESCENDING;
                options.maxResults = 500;

                const result = PlacesUtils.history.executeQuery(query, options);
                const root = result.root;
                root.containerOpen = true;

                this._historyItems = [];
                for (let i = 0; i < root.childCount; i++) {
                    const node = root.getChild(i);
                    this._historyItems.push({
                        uri: node.uri,
                        title: node.title || node.uri,
                        time: node.time,
                        timeStr: new Date(node.time / 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                        dateStr: new Date(node.time / 1000).toLocaleDateString("en-GB", { day: '2-digit', month: '2-digit', year: 'numeric' }) // DD/MM/YYYY
                    });
                }
                root.containerOpen = false;
            } catch (e) {
                console.error("ZenLibrary History Fetch Error:", e);
            } finally {
                this._isHistoryLoading = false;
            }
        }

        renderHistoryBatch(reset = true) {
            if (!this._historyContainer) return;

            if (reset) {
                // Keep ONLY the static navigation items
                const navItems = this._historyContainer.querySelectorAll(".history-nav-static");
                this._historyContainer.innerHTML = "";
                navItems.forEach(i => this._historyContainer.appendChild(i));
                this._renderedCount = 0;
                this._lastGroupLabel = null;
            }

            const filtered = this._historySearchTerm
                ? this._historyItems.filter(i =>
                    i.title.toLowerCase().includes(this._historySearchTerm.toLowerCase()) ||
                    i.uri.toLowerCase().includes(this._historySearchTerm.toLowerCase())
                )
                : this._historyItems;

            if (filtered.length === 0 && !this._isHistoryLoading) {
                this._historyContainer.innerHTML = `<div class="history-section-header">No results found</div>`;
                return;
            }

            const nextBatch = filtered.slice(this._renderedCount, this._renderedCount + this._historyBatchSize);
            if (nextBatch.length === 0) return;

            const fragment = document.createDocumentFragment();
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            nextBatch.forEach(item => {
                const timeMs = item.time / 1000;
                let groupLabel = "";

                if (this._historySearchTerm) {
                    groupLabel = "Search Results";
                } else if (timeMs >= this._sessionStart) {
                    groupLabel = "Recently Visited (Session)";
                } else {
                    const d = new Date(timeMs);
                    d.setHours(0, 0, 0, 0);
                    if (d.getTime() === today.getTime()) groupLabel = "Today";
                    else if (d.getTime() === yesterday.getTime()) groupLabel = "Yesterday";
                    else groupLabel = new Date(timeMs).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
                }

                if (groupLabel !== this._lastGroupLabel) {
                    fragment.appendChild(this.el("div", {
                        className: "history-section-header",
                        textContent: groupLabel
                    }));
                    this._lastGroupLabel = groupLabel;
                }

                const displayTime = (this._historySearchTerm || (this._lastGroupLabel !== "Recently Visited (Session)" && this._lastGroupLabel !== "Today" && this._lastGroupLabel !== "Yesterday"))
                    ? item.dateStr
                    : item.timeStr;

                const row = this.el("div", {
                    className: "library-list-item",
                    onclick: () => {
                        window.gBrowser.selectedTab = window.gBrowser.addTab(item.uri, {
                            triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
                        });
                    }
                }, [
                    this.el("div", { className: "item-icon-container" }, [
                        this.el("div", {
                            className: "item-icon",
                            style: `background-image: url("page-icon:${item.uri}");`
                        })
                    ]),
                    this.el("div", { className: "item-info" }, [
                        this.el("div", { className: "item-title", textContent: item.title }),
                        this.el("div", { className: "item-url", textContent: item.uri })
                    ]),
                    this.el("div", { className: "item-time", textContent: displayTime })
                ]);
                fragment.appendChild(row);
            });

            this._renderedCount += nextBatch.length;

            // Remove old spacer
            const oldSpacer = this._historyContainer.querySelector(".history-bottom-spacer");
            if (oldSpacer) oldSpacer.remove();

            this._historyContainer.appendChild(fragment);

            // Add new spacer at the end
            this._historyContainer.appendChild(this.el("div", { className: "history-bottom-spacer" }));
        }

        loadMoreHistory() {
            this.renderHistoryBatch(false);
        }


        update() {
            try {
                const { workspaces, width } = ZenLibrarySpaces.getData();
                const targetWidth = this.activeTab === "spaces" ? width : 340;

                const startWidthStyle = this.style.getPropertyValue("--zen-library-start-width");
                const startWidth = startWidthStyle ? parseInt(startWidthStyle) : 0;
                const offset = targetWidth - startWidth;

                this.style.setProperty("--zen-library-width", `${targetWidth}px`);
                document.documentElement.style.setProperty("--zen-library-offset", `${offset}px`);

                for (const id in this._sidebarItemEls) {
                    this._sidebarItemEls[id].classList.toggle("active", id === this.activeTab);
                }

                // Incremental Update: Only clear if tab changed or content is missing
                const content = this.shadowRoot.querySelector(".library-content");
                const header = this.shadowRoot.querySelector(".library-header");

                const tabChanged = this._lastRenderedTab !== this.activeTab;
                this._lastRenderedTab = this.activeTab;

                if (this.activeTab !== "spaces") {
                    if (tabChanged || !header.firstElementChild) {
                        header.innerHTML = "";
                        const searchInput = this.el("input", {
                            type: "text",
                            placeholder: `Search ${this.activeTab.charAt(0).toUpperCase() + this.activeTab.slice(1)}...`,
                            value: this.activeTab === "history" ? this._historySearchTerm : (this.activeTab === "downloads" ? this._downloadsSearchTerm : ""),
                            oninput: (e) => {
                                if (this.activeTab === "history") {
                                    this._historySearchTerm = e.target.value;
                                    this.renderHistoryBatch(true);
                                } else if (this.activeTab === "downloads") {
                                    this._downloadsSearchTerm = e.target.value;
                                    this.fetchDownloads().then(downloads => this.renderDownloadsList(downloads));
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
                    }
                } else {
                    header.innerHTML = "";
                }

                if (this.activeTab === "spaces") {
                    const workspaceHash = workspaces.map(ws => ws.uuid + (ws.tabsLength || 0)).join("|");
                    if (!tabChanged && this._lastWorkspaceHash === workspaceHash) {
                        return; // Nothing to do
                    }
                    this._lastWorkspaceHash = workspaceHash;

                    // Capture existing scroll position
                    const oldGrid = this.shadowRoot.querySelector(".library-workspace-grid");
                    const oldScroll = oldGrid ? oldGrid.scrollLeft : 0;

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

                    // Optimized wheel handling
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

                    content.innerHTML = "";
                    content.appendChild(grid);
                    grid.classList.add("library-content-fade-in");

                    // Restore scroll position
                    if (oldScroll > 0) {
                        requestAnimationFrame(() => { grid.scrollLeft = oldScroll; });
                    }

                    requestAnimationFrame(() => grid.classList.add("scrollbar-visible"));
                } else if (this.activeTab === "history") {
                    if (!content.querySelector(".library-list-container") || tabChanged) {
                        const historyEl = this.renderHistory();
                        content.innerHTML = "";
                        content.appendChild(historyEl);
                    }
                } else if (this.activeTab === "downloads") {
                    if (!content.querySelector(".library-list-container") || tabChanged) {
                        const downloadsEl = this.renderDownloads();
                        content.innerHTML = "";
                        content.appendChild(downloadsEl);
                    }
                } else {
                    content.innerHTML = `<div class="empty-state library-content-fade-in">
                        <div class="empty-icon ${this.activeTab}-icon"></div>
                        <h3>Nothing here yet!</h3>
                        <p>Content for ${this.activeTab} will be displayed here once available.</p>
                      </div>`;
                }
            } catch (e) {
                console.error("ZenLibrary Error in update:", e);
                // content is already declared in function scope
                if (content) content.innerHTML = `<div style="color:red; padding:20px;">Error loading library content. Check console.</div>`;
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

            // Remaining props (mostly event listeners or attributes)
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

        // --- LITERAL 1:1 MIRROR FROM ZenFolder.mjs/Nebula ---
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

                // Native Zen Tab Highlights (formula from Zen vertical-tabs.css and zen-theme.css)
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
                    // For SVG icons, we use background+mask to allow theme coloring
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
                        // Crucially set the workspace ID so the popup knows which one to edit
                        popup.setAttribute("workspace-id", ws.uuid);
                        popup.openPopup(e.currentTarget, "after_start");
                        console.log("[ZenLib v2.7] Opening edit menu for:", ws.uuid);
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

                dragHandle.addEventListener("mousedown", (e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    e.stopPropagation();

                    const grid = card.parentElement;
                    if (!grid) return;

                    // Create GLOBAL DRAG OVERLAY to capture events across webviews
                    const overlay = this.el("div", {
                        id: "library-drag-overlay",
                        style: "position: fixed; inset: 0; z-index: 9998; cursor: grabbing; pointer-events: auto;"
                    });
                    document.body.appendChild(overlay);

                    // Capture pre-drag dimensions
                    const preDragRect = card.getBoundingClientRect();

                    // Apply dragged state to trigger CSS transition/scale
                    card.style.setProperty('--dragged-bg-color', ws.primaryColor);
                    card.setAttribute("dragged", "true");
                    grid.setAttribute("dragging-workspace", "true");

                    // Create placeholder
                    const placeholder = this.el("div", { className: "library-workspace-card-placeholder" });
                    grid.insertBefore(placeholder, card);

                    // Pin card to original dimensions (CSS transform handles the 1.05 scale)
                    card.style.width = preDragRect.width + "px";
                    card.style.height = preDragRect.height + "px";

                    const gridRectAtStart = grid.getBoundingClientRect();
                    // Initial local position relative to grid frame
                    card.style.left = (preDragRect.left - gridRectAtStart.left) + "px";
                    card.style.top = (preDragRect.top - gridRectAtStart.top) + "px";

                    // Force reflow and calculate offset based on the NEW SCALED dimensions (instantly scaled due to transition: none)
                    void card.offsetWidth;
                    const scaledRect = card.getBoundingClientRect();
                    const initialOffsetX = e.clientX - scaledRect.left;
                    const initialOffsetY = e.clientY - scaledRect.top;

                    const originalIndex = Array.from(grid.children).indexOf(placeholder);

                    // FLIP Animation helper
                    const animateSiblings = () => {
                        const siblings = Array.from(grid.children).filter(s => s !== card);
                        const firstRects = new Map();
                        siblings.forEach(s => firstRects.set(s, s.getBoundingClientRect()));

                        // Placeholder has already moved or about to move
                        // This function should be called AFTER DOM movement

                        requestAnimationFrame(() => {
                            siblings.forEach(s => {
                                const lastRect = s.getBoundingClientRect();
                                const firstRect = firstRects.get(s);
                                if (!firstRect) return;

                                const dx = firstRect.left - lastRect.left;
                                const dy = firstRect.top - lastRect.top;

                                if (dx || dy) {
                                    s.style.transition = "none";
                                    s.style.transform = `translate(${dx}px, ${dy}px)`;
                                    s.getBoundingClientRect(); // force reflow
                                    s.style.transition = "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
                                    s.style.transform = "";
                                }
                            });
                        });
                    };

                    // Initial follow variables
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

                        // Clean up sibling transitions
                        Array.from(grid.children).forEach(s => {
                            s.style.transition = "";
                            s.style.transform = "";
                        });

                        // Final placement
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
                            console.log(`[ZenLib v5.6] Reordering workspace ${ws.uuid} to index ${newIndex}`);
                            if (window.gZenWorkspaces && window.gZenWorkspaces.reorderWorkspace) {
                                window.gZenWorkspaces.reorderWorkspace(ws.uuid, newIndex);
                                setTimeout(() => this.update(), 100);
                            }
                        }
                    };

                    const moveLoop = () => {
                        if (!isDragging && !isLanding) return;

                        // Lerp for smooth follow
                        const lerpFactor = isLanding ? 0.25 : 0.18;
                        currentX += (targetX - currentX) * lerpFactor;
                        currentY += (targetY - currentY) * lerpFactor;

                        // Compensate for transformed containing block
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
                            // Smooth velocity-based auto-scroll
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

                        const children = grid.children;
                        for (let i = 0; i < children.length; i++) {
                            const sib = children[i];
                            if (sib === card || sib === placeholder) continue;
                            const r = sib.getBoundingClientRect();
                            if (mouseX > r.left && mouseX < r.right) {
                                const halfway = r.left + r.width / 2;
                                if (mouseX < halfway) {
                                    if (placeholder.nextSibling !== sib) {
                                        const sibItems = Array.from(grid.children).filter(s => s !== card);
                                        const firstRects = new Map();
                                        for (const s of sibItems) firstRects.set(s, s.getBoundingClientRect());

                                        grid.insertBefore(placeholder, sib);

                                        for (const s of sibItems) {
                                            const lastRect = s.getBoundingClientRect();
                                            const firstRect = firstRects.get(s);
                                            const dx = firstRect.left - lastRect.left;
                                            const dy = firstRect.top - lastRect.top;
                                            if (dx || dy) {
                                                const sStyle = s.style;
                                                sStyle.transition = "none";
                                                sStyle.transform = `translate(${dx}px, ${dy}px)`;
                                                s.getBoundingClientRect();
                                                sStyle.transition = "transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)";
                                                sStyle.transform = "translate(0,0)";
                                            }
                                        }
                                    }
                                } else {
                                    if (sib.nextSibling !== placeholder) {
                                        const sibItems = Array.from(grid.children).filter(s => s !== card);
                                        const firstRects = new Map();
                                        for (const s of sibItems) firstRects.set(s, s.getBoundingClientRect());

                                        grid.insertBefore(placeholder, sib.nextSibling);

                                        for (const s of sibItems) {
                                            const lastRect = s.getBoundingClientRect();
                                            const firstRect = firstRects.get(s);
                                            const dx = firstRect.left - lastRect.left;
                                            const dy = firstRect.top - lastRect.top;
                                            if (dx || dy) {
                                                const sStyle = s.style;
                                                sStyle.transition = "none";
                                                sStyle.transform = `translate(${dx}px, ${dy}px)`;
                                                s.getBoundingClientRect();
                                                sStyle.transition = "transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)";
                                                sStyle.transform = "translate(0,0)";
                                            }
                                        }
                                    }
                                }
                                break;
                            }
                        }
                    };

                    const onMouseUp = () => {
                        isDragging = false;
                        document.removeEventListener("mousemove", onMouseMove);
                        document.removeEventListener("mouseup", onMouseUp);

                        // Capture final position from placeholder
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
            console.log("[ZenLib v5.1] Starting cleanup for:", workspaceId);

            const wsEl = window.gZenWorkspaces.workspaceElement(workspaceId);
            const tabs = Array.from(wsEl?.tabsContainer?.children || []).filter(child =>
                window.gBrowser.isTab(child) && !child.hasAttribute("zen-essential")
            );

            console.log(`[ZenLib v4.6] Found ${tabs.length} tabs in DOM for purge.`);

            if (tabs.length === 0) {
                console.warn("[ZenLib v4.6] No unpinned tabs found in the native container.");
                return;
            }

            // Zen's "#getClosableTabs" logic: filter out tabs with side effects
            let closableTabs = tabs.filter(tab => {
                const attributes = ["selected", "multiselected", "pictureinpicture", "soundplaying"];
                for (const attr of attributes) if (tab.hasAttribute(attr)) return false;
                const browser = tab.linkedBrowser;
                if (window.webrtcUI?.browserHasStreams(browser) ||
                    browser?.browsingContext?.currentWindowGlobal?.hasActivePeerConnections()) return false;
                return true;
            });

            if (closableTabs.length === 0) closableTabs = tabs;

            console.log(`[ZenLib v4.3] Purging ${closableTabs.length} tabs...`);
            window.gBrowser.removeTabs(closableTabs, {
                closeWindowWithLastTab: false,
            });

            if (window.gZenUIManager?.showToast) {
                const restoreKey = window.gZenKeyboardShortcutsManager?.getShortcutDisplayFromCommand(
                    "History:RestoreLastClosedTabOrWindowOrSession"
                ) || "Ctrl+Shift+T";

                window.gZenUIManager.showToast("zen-workspaces-close-all-unpinned-tabs-toast", {
                    l10nArgs: {
                        shortcut: restoreKey,
                    },
                });
            }

            if (this.update) {
                // Small delay to ensure browser removes tabs before refresh
                setTimeout(() => {
                    console.log("[ZenLib v4.3] Triggering immediate refresh...");
                    this.update();
                }, 200);
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

            // Priority: Local state > Native expanded state
            let isExpanded;
            if (this._folderExpansion.has(folderId)) {
                isExpanded = this._folderExpansion.get(folderId);
            } else {
                const isNativeCollapsed = folder.hasAttribute("zen-folder-collapsed") || folder.collapsed;
                isExpanded = !isNativeCollapsed;
                this._folderExpansion.set(folderId, isExpanded);
            }

            // Check for active tab inside collapsed folder (Nebula logic)
            const allTabs = folder.allItemsRecursive || folder.tabs || [];
            const hasActive = allTabs.some(t => t.selected);

            const folderEl = this.el("div", { className: `library-workspace-folder ${isExpanded ? '' : 'collapsed'}` });

            const headerEl = this.el("div", {
                className: "library-workspace-item folder",
                onclick: (e) => {
                    e.stopPropagation();
                    const currentlyExpanded = this._folderExpansion.get(folderId);
                    const newlyExpanded = !currentlyExpanded;

                    // Update Local State
                    this._folderExpansion.set(folderId, newlyExpanded);

                    // Update DOM Classes
                    folderEl.classList.toggle("collapsed", !newlyExpanded);

                    // If newly expanded, we might want to ensure the parent grid doesn't jump
                    // but the CSS transition should handle the smooth shift.

                    // Update SVG Attributes and Styles
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

            // Add container identity line (content line)
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

            // Add close/unpin button (same position for both)
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
                    if (this.update) setTimeout(() => this.update(), 150);
                }
            }, [this.el("div", { className: "icon-mask" })]);
            itemEl.appendChild(closeBtn);

            container.appendChild(itemEl);
        }
    }

    if (!customElements.get("zen-library")) customElements.define("zen-library", ZenLibraryElement);

    // Initial Controller Logic (retained from successful restoration)
    class ZenLibrary {
        constructor() {
            this._isOpen = false;
            this.lastActiveTab = "downloads";
            this._isTransitioning = false;
            this._lastToggleTime = 0;
            this._onKeyDown = this._onKeyDown.bind(this);
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
                const s = document.createElement("style"); s.id = "zen-library-global-style"; s.textContent = GLOBAL_CSS; document.head.appendChild(s);
            }
        }
        _onKeyDown(e) {
            if (e.altKey && e.shiftKey && e.code === "KeyB") {
                e.preventDefault();
                e.stopPropagation();
                this.toggle();
            }
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
                const b = document.getElementById("sidebar-box");

                // Measure all potential sidebar elements
                startWidth = (t ? t.getBoundingClientRect().width : 0) +
                    (s ? s.getBoundingClientRect().width : 0) +
                    (b ? b.getBoundingClientRect().width : 0);

                // If DOM is not ready or collapsed, use the system variable (source of truth)
                if (startWidth === 0) {
                    const cssWidth = getComputedStyle(document.documentElement).getPropertyValue('--zen-sidebar-width').trim();
                    if (cssWidth && cssWidth.endsWith('px')) {
                        startWidth = parseInt(cssWidth);
                    }
                }
            }

            this._element.style.width = startWidth + "px"; // LOCK IT
            this._element.style.setProperty("--zen-library-start-width", startWidth + "px");

            if (isRightSide) b.append(this._element);
            else b.prepend(this._element);

            if (!isCompactHidden) {
                document.documentElement.setAttribute("zen-library-open", "true");
            } else {
                document.documentElement.setAttribute("zen-library-open-compact", "true");
            }

            // Trigger the visual shift
            requestAnimationFrame(() => requestAnimationFrame(() => {
                this._element.update(); // Recalculate offset and apply
            }));

            setTimeout(() => { this._isTransitioning = false; }, 400);
        }

        close() {
            if (!this._isOpen || !this._element || this._isTransitioning) return;
            const el = this._element;
            this._isTransitioning = true;
            this._isOpen = false;
            el.classList.add("closing");

            const wasNormalOpen = document.documentElement.hasAttribute("zen-library-open");

            // Reset translation to 0 to slide back
            document.documentElement.style.setProperty("--zen-library-offset", "0px");

            const end = () => {
                if (el.parentNode) el.remove();
                if (this._element === el) this._element = null;

                if (!this._isOpen) {
                    document.documentElement.removeAttribute("zen-library-open");
                    document.documentElement.removeAttribute("zen-library-open-compact");
                    document.documentElement.style.removeProperty("--zen-library-offset"); // Cleanup

                    if (wasNormalOpen) {
                        document.documentElement.classList.add("zen-toolbox-fading-in");
                        setTimeout(() => {
                            if (!this._isOpen) document.documentElement.classList.remove("zen-toolbox-fading-in");
                        }, 400);
                    }
                    this._isTransitioning = false;
                }
            };

            // Wait for transform transition (0.25s) + safety
            setTimeout(end, 300);
        }
    }

    window.gZenLibrary = new ZenLibrary();

})();
