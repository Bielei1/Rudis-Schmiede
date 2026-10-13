(() => {
    const MAP_BUCKET = 'shared-family-map';
    const MAP_IMAGE_PATH = 'background-v2';
    const LEGACY_MAP_IMAGE_PATH = 'background';
    const DEFAULT_MAP_IMAGE_KEY = 'project-default';
    const DEFAULT_MAP_WIDTH = 9000;
    const DEFAULT_MAP_HEIGHT = 7004;
    const MAP_TILE_SIZE = 512;
    const MAP_TILE_LEVELS = [
        { width: 563, height: 438 },
        { width: 1125, height: 876 },
        { width: 2250, height: 1751 },
        { width: 4500, height: 3502 },
        { width: 9000, height: 7004 }
    ];
    const MAX_MAP_IMAGE_BYTES = 25 * 1024 * 1024;
    const ALLOWED_MAP_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    const MAP_CATEGORIES = [
        { name: 'Händler', icon: '🛒', color: '#d6a653' },
        { name: 'Ärzte & Medizin', icon: '✚', color: '#cf625c' },
        { name: 'Rohstoffe', icon: '🌿', color: '#6ea75c' },
        { name: 'Rezepte & Herstellung', icon: '⚗', color: '#9874b8' },
        { name: 'Anwesen & Lager', icon: '⌂', color: '#658fb3' },
        { name: 'Geheime Orte', icon: '★', color: '#c3944c' },
        { name: 'Kontakte', icon: '♟', color: '#bd7785' },
        { name: 'Sonstiges', icon: '●', color: '#858b7a' }
    ];
    let markers = [];
    let activeCategories = new Set(MAP_CATEGORIES.map(category => category.name));
    let addMode = false;
    let pendingPosition = null;
    let zoom = 1;
    let mapBaseWidth = 0;
    let mapBaseHeight = 0;
    let mapNaturalWidth = 0;
    let mapNaturalHeight = 0;
    let mapUsesTiles = false;
    let mapUsesUploadedImage = false;
    let mapTileRefreshFrame = 0;
    let mapTiles = new Map();
    let mapDesiredTileKeys = new Set();
    let imageLoadId = 0;
    let cachedMapImagePath = null;
    let cachedSignedMapUrl = null;
    let cachedSignedUrlExpiresAt = 0;
    let mapLoadInProgress = false;
    let mapDataLoadedAt = 0;
    let mapDataLoadedForUser = null;
    let mapResizeFrame = 0;
    let pendingWheelZoom = 0;
    let pendingWheelAnchor = null;
    let wheelZoomFrame = 0;
    let mapDrag = null;
    let suppressMapClick = false;

    function getElement(id) {
        return document.getElementById(id);
    }

    async function loadMapTab(forceRefresh = false) {
        if (!currentUser || !supabaseClient || mapLoadInProgress) return;
        if (!forceRefresh && mapDataLoadedForUser === currentUser.id
            && mapDataLoadedAt && Date.now() - mapDataLoadedAt < 30000) return;
        mapLoadInProgress = true;
        const status = getElement('map-status');
        const hasVisibleMap = !!getElement('map-stage')?.classList.contains('map-image-ready');
        if (status && !hasVisibleMap) status.textContent = 'Lade gemeinsame Karte ...';
        const currentImage = getElement('map-background-image');
        if (!hasVisibleMap && (!currentImage || currentImage.hidden || !currentImage.complete || !currentImage.naturalWidth)) {
            displayDefaultTiledMap();
        }

        try {
            const markerPromise = supabaseClient.from('map_markers')
                .select('id, title, category, notes, x, y, created_by, created_at')
                .order('created_at', { ascending: false });
            const settingsResult = await supabaseClient.from('map_settings')
                .select('image_path')
                .eq('id', 1)
                .maybeSingle();

            if (settingsResult.error) {
                if (status) status.textContent = 'Karteneinstellungen konnten nicht geladen werden.';
                console.error('Karteneinstellungen konnten nicht geladen werden:', settingsResult.error.message);
                showToast('Karteneinstellungen konnten nicht geladen werden: ' + settingsResult.error.message, 'danger');
            } else {
                const imagePath = settingsResult.data && settingsResult.data.image_path;
                if (!imagePath || imagePath === LEGACY_MAP_IMAGE_PATH) {
                    mapUsesUploadedImage = false;
                    cachedMapImagePath = null;
                    cachedSignedMapUrl = null;
                    cachedSignedUrlExpiresAt = 0;
                    displayDefaultTiledMap();
                } else {
                    mapUsesUploadedImage = true;
                    const image = getElement('map-background-image');
                    const imageAlreadyLoaded = imagePath === cachedMapImagePath
                        && image && image.complete && image.naturalWidth > 0;

                    if (!imageAlreadyLoaded) {
                        if (imagePath !== cachedMapImagePath || !cachedSignedMapUrl || Date.now() >= cachedSignedUrlExpiresAt) {
                            const { data, error } = await supabaseClient.storage.from(MAP_BUCKET).createSignedUrl(imagePath, 3600);
                            if (error) {
                                showToast('Hochgeladenes Kartenbild konnte nicht geladen werden: ' + error.message, 'danger');
                            } else {
                                cachedMapImagePath = imagePath;
                                cachedSignedMapUrl = data.signedUrl;
                                cachedSignedUrlExpiresAt = Date.now() + 55 * 60 * 1000;
                            }
                        }
                        if (imagePath === cachedMapImagePath && cachedSignedMapUrl) {
                            displayMapImage(cachedSignedMapUrl, imagePath);
                        }
                    }
                }
            }

            const markerResult = await markerPromise;
            if (markerResult.error) {
                if (status) status.textContent = 'Kartendatenbank fehlt oder ist nicht erreichbar. Bitte zuerst das Karten-SQL einrichten.';
                console.error('Kartenmarkierungen konnten nicht geladen werden:', markerResult.error.message);
                showToast('Kartenmarkierungen konnten nicht geladen werden: ' + markerResult.error.message, 'danger');
                return;
            }

            markers = markerResult.data || [];
            renderMapCategoryControls();
            if (status) {
                const imageMode = mapUsesUploadedImage ? 'Hochgeladenes Kartenbild' : 'Eingebaute Kachelkarte';
                status.textContent = `${markers.length} gemeinsame Markierung${markers.length === 1 ? '' : 'en'} · ${imageMode}`;
            }
            renderMapMarkers();
            mapDataLoadedAt = Date.now();
            mapDataLoadedForUser = currentUser.id;
        } catch (error) {
            if (status) status.textContent = 'Karte konnte nicht geladen werden.';
            console.error('Karte konnte nicht geladen werden:', error);
            showToast('Karte konnte nicht geladen werden.', 'danger');
        } finally {
            mapLoadInProgress = false;
        }
    }

    function showEmptyMap() {
        const image = getElement('map-background-image');
        if (image) image.hidden = true;
        const tileLayer = getElement('map-tile-layer');
        if (tileLayer) tileLayer.hidden = true;
        const stage = getElement('map-stage');
        if (stage) stage.classList.remove('map-image-ready');
        const empty = getElement('map-empty-state');
        if (empty) empty.hidden = false;
        const button = getElement('map-add-mode-button');
        if (button) button.disabled = true;
    }

    function displayMapImage(url, imagePath) {
        const image = getElement('map-background-image');
        if (!image) return;
        if (image.dataset.mapPath === imagePath && image.getAttribute('src') === url
            && (!image.complete || image.naturalWidth > 0)) return;
        const loadId = ++imageLoadId;
        mapUsesTiles = false;
        const tileLayer = getElement('map-tile-layer');
        if (tileLayer) tileLayer.hidden = true;
        image.onload = () => {
            if (loadId !== imageLoadId) return;
            const stage = getElement('map-stage');
            const viewport = getElement('map-viewport');
            if (!stage || !viewport) return;
            mapNaturalWidth = image.naturalWidth;
            mapNaturalHeight = image.naturalHeight;
            mapUsesTiles = false;
            const tileLayer = getElement('map-tile-layer');
            if (tileLayer) tileLayer.hidden = true;
            mapBaseWidth = viewport.clientWidth;
            mapBaseHeight = mapBaseWidth * mapNaturalHeight / mapNaturalWidth;
            image.style.width = `${mapBaseWidth}px`;
            image.style.height = `${mapBaseHeight}px`;
            const markerLayer = getElement('map-markers-layer');
            if (markerLayer) {
                markerLayer.style.width = `${mapBaseWidth}px`;
                markerLayer.style.height = `${mapBaseHeight}px`;
            }
            stage.style.width = `${mapBaseWidth * zoom}px`;
            stage.style.height = `${mapBaseHeight * zoom}px`;
            stage.classList.add('map-image-ready');
            image.hidden = false;
            const empty = getElement('map-empty-state');
            if (empty) empty.hidden = true;
            const button = getElement('map-add-mode-button');
            if (button) button.disabled = !canEditTab('karte');
            applyMapZoom(zoom);
            syncMapSurfaceZoom();
            updateAddModeButton();
            image.dataset.mapPath = imagePath;
        };
        image.onerror = () => {
            if (loadId !== imageLoadId) return;
            cachedMapImagePath = null;
            cachedSignedMapUrl = null;
            cachedSignedUrlExpiresAt = 0;
            if (imagePath !== DEFAULT_MAP_IMAGE_KEY) {
                displayDefaultTiledMap();
                showToast('Das hochgeladene Kartenbild konnte nicht geladen werden. Die eingebaute Karte wird angezeigt.', 'danger');
            } else {
                showEmptyMap();
                showToast('Die eingebaute Kartendatei konnte nicht geladen werden.', 'danger');
            }
        };
        image.dataset.mapPath = imagePath;
        image.decoding = 'async';
        image.src = url;
    }

    function displayDefaultTiledMap() {
        const viewport = getElement('map-viewport');
        const stage = getElement('map-stage');
        const image = getElement('map-background-image');
        const tileLayer = getElement('map-tile-layer');
        if (!viewport || !stage || !image || !tileLayer) return;

        imageLoadId++;
        image.onload = null;
        image.onerror = null;
        mapUsesTiles = true;
        mapUsesUploadedImage = false;
        mapNaturalWidth = DEFAULT_MAP_WIDTH;
        mapNaturalHeight = DEFAULT_MAP_HEIGHT;
        mapBaseWidth = viewport.clientWidth;
        mapBaseHeight = mapBaseWidth * DEFAULT_MAP_HEIGHT / DEFAULT_MAP_WIDTH;
        image.hidden = true;
        image.removeAttribute('src');
        tileLayer.hidden = false;
        tileLayer.style.width = `${mapBaseWidth}px`;
        tileLayer.style.height = `${mapBaseHeight}px`;
        const markerLayer = getElement('map-markers-layer');
        if (markerLayer) {
            markerLayer.style.width = `${mapBaseWidth}px`;
            markerLayer.style.height = `${mapBaseHeight}px`;
        }
        stage.style.width = `${mapBaseWidth * zoom}px`;
        stage.style.height = `${mapBaseHeight * zoom}px`;
        stage.classList.add('map-image-ready');
        const empty = getElement('map-empty-state');
        if (empty) empty.hidden = true;
        const button = getElement('map-add-mode-button');
        if (button) button.disabled = !canEditTab('karte');
        syncMapSurfaceZoom();
        queueMapTiles();
        updateAddModeButton();
    }

    async function uploadSharedMapImage(event) {
        const input = event.target;
        const file = input.files && input.files[0];
        if (!file) return;
        if (!currentUser || !currentUser.isAdmin) {
            showToast('Nur Administratoren dürfen das Kartenbild ändern oder hochladen.', 'danger');
            input.value = '';
            return;
        }
        if (!ALLOWED_MAP_IMAGE_TYPES.has(file.type)) {
            showToast('Bitte ein JPEG-, PNG-, WEBP- oder GIF-Bild auswählen.', 'danger');
            input.value = '';
            return;
        }
        if (file.size > MAX_MAP_IMAGE_BYTES) {
            showToast('Das Kartenbild darf höchstens 25 MB groß sein.', 'danger');
            input.value = '';
            return;
        }

        const status = getElement('map-status');
        if (status) status.textContent = 'Lade Kartenbild hoch ...';
        const { error: uploadError } = await supabaseClient.storage
            .from(MAP_BUCKET)
            .upload(MAP_IMAGE_PATH, file, { upsert: true, contentType: file.type, cacheControl: '0' });
        if (uploadError) {
            if (status) status.textContent = 'Kartenbild konnte nicht hochgeladen werden.';
            showToast('Kartenbild konnte nicht hochgeladen werden: ' + uploadError.message, 'danger');
            input.value = '';
            return;
        }

        const { error: settingsError } = await supabaseClient
            .from('map_settings')
            .upsert({ id: 1, image_path: MAP_IMAGE_PATH }, { onConflict: 'id' });
        if (settingsError) {
            if (status) status.textContent = 'Kartenbild wurde hochgeladen, konnte aber nicht aktiviert werden.';
            showToast('Karteneinstellung konnte nicht gespeichert werden: ' + settingsError.message, 'danger');
            input.value = '';
            return;
        }

        cachedMapImagePath = null;
        cachedSignedMapUrl = null;
        cachedSignedUrlExpiresAt = 0;
        const image = getElement('map-background-image');
        if (image) delete image.dataset.mapPath;
        input.value = '';
        if (status) status.textContent = `${markers.length} gemeinsame Markierung${markers.length === 1 ? '' : 'en'}`;
        showToast('Das gemeinsame Kartenbild wurde aktualisiert.', 'success');
        await loadMapTab(true);
    }

    function toggleMapAddMode() {
        if (!canEditTab('karte')) {
            showToast('Du hast keine Bearbeitungsrechte für die Karte.', 'danger');
            return;
        }
        addMode = !addMode;
        updateAddModeButton();
    }

    function updateAddModeButton() {
        const button = getElement('map-add-mode-button');
        const stage = getElement('map-stage');
        if (button) button.textContent = addMode ? 'Abbrechen' : '＋ Ort markieren';
        if (stage) stage.classList.toggle('map-add-mode', addMode);
        const status = getElement('map-status');
        if (status && addMode) status.textContent = 'Klicke auf die Karte, um den Ort zu setzen. Esc bricht ab.';
        else if (status && !addMode) status.textContent = `${markers.length} gemeinsame Markierung${markers.length === 1 ? '' : 'en'}`;
    }

    function handleMapClick(event) {
        if (!addMode || event.target.closest('.map-marker')) return;
        const stage = getElement('map-stage');
        if (!stage || !stage.classList.contains('map-image-ready')) return;
        const rect = stage.getBoundingClientRect();
        pendingPosition = {
            x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
            y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
        };
        addMode = false;
        updateAddModeButton();
        getElement('map-marker-name').value = '';
        getElement('map-marker-category').value = 'Sonstiges';
        getElement('map-marker-notes').value = '';
        getElement('map-marker-modal').classList.add('open');
        getElement('map-marker-name').focus();
    }

    async function saveMapMarker(event) {
        event.preventDefault();
        if (!pendingPosition || !currentUser || !canEditTab('karte')) return;
        const title = getElement('map-marker-name').value.trim();
        if (!title) return;

        const { error } = await supabaseClient.from('map_markers').insert([{
            title,
            category: getElement('map-marker-category').value,
            notes: getElement('map-marker-notes').value.trim(),
            x: pendingPosition.x,
            y: pendingPosition.y,
            created_by: currentUser.id
        }]);
        if (error) {
            showToast('Markierung konnte nicht gespeichert werden: ' + error.message, 'danger');
            return;
        }

        closeMapMarkerModal();
        await loadMapTab(true);
        showToast('Ort wurde auf der gemeinsamen Karte markiert.', 'success');
    }

    function closeMapMarkerModal() {
        const modal = getElement('map-marker-modal');
        if (modal) modal.classList.remove('open');
        pendingPosition = null;
    }

    function handleMapMarkerBackdropClick(event) {
        if (event.target && event.target.id === 'map-marker-modal') closeMapMarkerModal();
    }

    function setMapZoom(change) {
        applyMapZoom(zoom + change);
    }

    function applyMapZoom(nextZoom, anchorX, anchorY) {
        const viewport = getElement('map-viewport');
        const stage = getElement('map-stage');
        if (!stage || !viewport) return;

        const stageRect = stage.getBoundingClientRect();
        const oldWidth = stageRect.width;
        const oldHeight = stageRect.height;
        const viewportRect = viewport.getBoundingClientRect();
        const pointerX = anchorX ?? viewportRect.left + viewport.clientWidth / 2;
        const pointerY = anchorY ?? viewportRect.top + viewport.clientHeight / 2;
        const mapX = oldWidth ? (viewport.scrollLeft + pointerX - viewportRect.left) / oldWidth : 0;
        const mapY = oldHeight ? (viewport.scrollTop + pointerY - viewportRect.top) / oldHeight : 0;

        const previousZoom = zoom;
        zoom = Math.min(12, Math.max(0.5, nextZoom));
        if (zoom === previousZoom) return;
        const scale = zoom / previousZoom;
        syncMapSurfaceZoom();
        viewport.scrollLeft = mapX * oldWidth * scale - (pointerX - viewportRect.left);
        viewport.scrollTop = mapY * oldHeight * scale - (pointerY - viewportRect.top);
    }

    function syncMapSurfaceZoom() {
        const stage = getElement('map-stage');
        const image = getElement('map-background-image');
        const tileLayer = getElement('map-tile-layer');
        const markerLayer = getElement('map-markers-layer');
        if (!stage || !mapBaseWidth || !mapBaseHeight) return;
        stage.style.width = `${mapBaseWidth * zoom}px`;
        stage.style.height = `${mapBaseHeight * zoom}px`;
        if (image) image.style.transform = mapUsesTiles ? 'none' : `scale(${zoom})`;
        if (tileLayer) {
            tileLayer.style.width = `${mapBaseWidth * zoom}px`;
            tileLayer.style.height = `${mapBaseHeight * zoom}px`;
            tileLayer.style.transform = 'none';
        }
        if (markerLayer) {
            markerLayer.style.width = `${mapBaseWidth * zoom}px`;
            markerLayer.style.height = `${mapBaseHeight * zoom}px`;
            markerLayer.style.transform = 'none';
        }
        stage.style.setProperty('--map-marker-scale', String(Math.max(0.85, Math.min(zoom, 4))));
        if (mapUsesTiles) queueMapTiles();
    }

    function resizeMapSurface() {
        if (mapResizeFrame) return;
        mapResizeFrame = requestAnimationFrame(() => {
            mapResizeFrame = 0;
            const viewport = getElement('map-viewport');
            const image = getElement('map-background-image');
            const markerLayer = getElement('map-markers-layer');
            if (!viewport || !mapNaturalWidth || !mapBaseWidth) return;

            const oldWidth = mapBaseWidth * zoom;
            const oldHeight = mapBaseHeight * zoom;
            const centerX = oldWidth ? (viewport.scrollLeft + viewport.clientWidth / 2) / oldWidth : 0;
            const centerY = oldHeight ? (viewport.scrollTop + viewport.clientHeight / 2) / oldHeight : 0;
            mapBaseWidth = viewport.clientWidth;
            mapBaseHeight = mapBaseWidth * mapNaturalHeight / mapNaturalWidth;
            if (!mapUsesTiles && image) {
                image.style.width = `${mapBaseWidth}px`;
                image.style.height = `${mapBaseHeight}px`;
            }
            const tileLayer = getElement('map-tile-layer');
            if (tileLayer) {
                tileLayer.style.width = `${mapBaseWidth}px`;
                tileLayer.style.height = `${mapBaseHeight}px`;
            }
            if (markerLayer) {
                markerLayer.style.width = `${mapBaseWidth}px`;
                markerLayer.style.height = `${mapBaseHeight}px`;
            }
            syncMapSurfaceZoom();
            viewport.scrollLeft = centerX * mapBaseWidth * zoom - viewport.clientWidth / 2;
            viewport.scrollTop = centerY * mapBaseHeight * zoom - viewport.clientHeight / 2;
            if (mapUsesTiles) queueMapTiles();
        });
    }

    function queueMapTiles() {
        if (!mapUsesTiles || mapTileRefreshFrame) return;
        mapTileRefreshFrame = requestAnimationFrame(() => {
            mapTileRefreshFrame = 0;
            renderVisibleMapTiles();
        });
    }

    function renderVisibleMapTiles() {
        if (!mapUsesTiles || !mapBaseWidth || !mapBaseHeight) return;
        const viewport = getElement('map-viewport');
        const tileLayer = getElement('map-tile-layer');
        if (!viewport || !tileLayer) return;

        const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
        const desiredSourceWidth = mapBaseWidth * zoom * pixelRatio;
        const levelIndex = MAP_TILE_LEVELS.findIndex(level => level.width >= desiredSourceWidth * 1.3);
        const selectedLevel = Math.max(0, levelIndex < 0 ? MAP_TILE_LEVELS.length - 1 : levelIndex);
        const level = MAP_TILE_LEVELS[selectedLevel];
        const fractionPerTileX = MAP_TILE_SIZE / level.width;
        const fractionPerTileY = MAP_TILE_SIZE / level.height;
        const visibleLeft = Math.max(0, viewport.scrollLeft / (mapBaseWidth * zoom) - fractionPerTileX);
        const visibleTop = Math.max(0, viewport.scrollTop / (mapBaseHeight * zoom) - fractionPerTileY);
        const visibleRight = Math.min(1, (viewport.scrollLeft + viewport.clientWidth) / (mapBaseWidth * zoom) + fractionPerTileX);
        const visibleBottom = Math.min(1, (viewport.scrollTop + viewport.clientHeight) / (mapBaseHeight * zoom) + fractionPerTileY);
        const firstX = Math.floor(visibleLeft * level.width / MAP_TILE_SIZE);
        const firstY = Math.floor(visibleTop * level.height / MAP_TILE_SIZE);
        const lastX = Math.min(Math.ceil(level.width / MAP_TILE_SIZE) - 1, Math.floor(visibleRight * level.width / MAP_TILE_SIZE));
        const lastY = Math.min(Math.ceil(level.height / MAP_TILE_SIZE) - 1, Math.floor(visibleBottom * level.height / MAP_TILE_SIZE));
        const desired = new Set();
        const ensureTile = (tileLevel, x, y, tileDimensions, isFallback) => {
            const key = `${tileLevel}/${x}_${y}`;
            desired.add(key);
            let tile = mapTiles.get(key);
            if (!tile) {
                tile = document.createElement('img');
                tile.className = 'map-tile';
                tile.alt = '';
                tile.draggable = false;
                tile.decoding = 'async';
                tile.dataset.tileKey = key;
                tile.dataset.tileReady = 'false';
                tile.onload = () => {
                    tile.dataset.tileReady = 'true';
                    cleanupMapTiles();
                };
                tile.onerror = () => {
                    console.error(`Kartenkachel konnte nicht geladen werden: ${tile.src}`);
                    tile.remove();
                    mapTiles.delete(key);
                    if (isFallback) showToast('Eine Kartenkachel fehlt. Bitte den vollständigen Ordner map-tiles veröffentlichen.', 'danger');
                };
                tile.src = `./map-tiles/${tileLevel}/${x}_${y}.jpg?v=20261013-2`;
                mapTiles.set(key, tile);
            } else if (tile.complete && tile.naturalWidth) {
                tile.dataset.tileReady = 'true';
            }
            const tileX = x * MAP_TILE_SIZE;
            const tileY = y * MAP_TILE_SIZE;
            const tileWidth = Math.min(MAP_TILE_SIZE, tileDimensions.width - tileX);
            const tileHeight = Math.min(MAP_TILE_SIZE, tileDimensions.height - tileY);
            tile.style.left = `${tileX / tileDimensions.width * mapBaseWidth * zoom}px`;
            tile.style.top = `${tileY / tileDimensions.height * mapBaseHeight * zoom}px`;
            tile.style.width = `${tileWidth / tileDimensions.width * mapBaseWidth * zoom}px`;
            tile.style.height = `${tileHeight / tileDimensions.height * mapBaseHeight * zoom}px`;
            tile.style.zIndex = isFallback ? '0' : '1';
            if (tile.parentElement !== tileLayer) tileLayer.appendChild(tile);
        };

        if (selectedLevel > 0) {
            const fallbackLevel = MAP_TILE_LEVELS[0];
            const fallbackColumns = Math.ceil(fallbackLevel.width / MAP_TILE_SIZE);
            const fallbackRows = Math.ceil(fallbackLevel.height / MAP_TILE_SIZE);
            for (let y = 0; y < fallbackRows; y++) {
                for (let x = 0; x < fallbackColumns; x++) {
                    ensureTile(0, x, y, fallbackLevel, true);
                }
            }
        }

        for (let y = firstY; y <= lastY; y++) {
            for (let x = firstX; x <= lastX; x++) {
                ensureTile(selectedLevel, x, y, level, false);
            }
        }
        mapDesiredTileKeys = desired;
        cleanupMapTiles();
    }

    function cleanupMapTiles() {
        const desiredReady = [...mapDesiredTileKeys].every(key => {
            const tile = mapTiles.get(key);
            return tile && tile.dataset.tileReady === 'true';
        });
        if (!desiredReady) return;
        for (const [key, tile] of mapTiles) {
            if (!mapDesiredTileKeys.has(key)) {
                tile.remove();
                mapTiles.delete(key);
            }
        }
    }

    function handleMapWheel(event) {
        if (addMode) return;
        event.preventDefault();
        const deltaScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1;
        pendingWheelZoom += -event.deltaY * deltaScale / 400;
        pendingWheelAnchor = { x: event.clientX, y: event.clientY };
        if (!wheelZoomFrame) {
            wheelZoomFrame = requestAnimationFrame(() => {
                const anchor = pendingWheelAnchor;
                const change = pendingWheelZoom;
                pendingWheelZoom = 0;
                pendingWheelAnchor = null;
                wheelZoomFrame = 0;
                if (anchor) applyMapZoom(zoom + change, anchor.x, anchor.y);
            });
        }
    }

    function startMapDrag(event) {
        if (event.button !== 0 || addMode || event.target.closest('button, input, select, textarea')) return;
        const stage = getElement('map-stage');
        const viewport = getElement('map-viewport');
        if (!stage || !stage.classList.contains('map-image-ready') || !viewport) return;

        mapDrag = {
            startX: event.clientX,
            startY: event.clientY,
            scrollLeft: viewport.scrollLeft,
            scrollTop: viewport.scrollTop,
            moved: false
        };
        viewport.classList.add('map-dragging');
        event.preventDefault();
    }

    function moveMapDrag(event) {
        if (!mapDrag) return;
        const viewport = getElement('map-viewport');
        if (!viewport) return;
        const deltaX = event.clientX - mapDrag.startX;
        const deltaY = event.clientY - mapDrag.startY;
        if (!mapDrag.moved && Math.hypot(deltaX, deltaY) > 3) mapDrag.moved = true;
        if (!mapDrag.moved) return;
        viewport.scrollLeft = mapDrag.scrollLeft - deltaX;
        viewport.scrollTop = mapDrag.scrollTop - deltaY;
        if (mapUsesTiles) queueMapTiles();
        event.preventDefault();
    }

    function stopMapDrag() {
        if (!mapDrag) return;
        const viewport = getElement('map-viewport');
        if (viewport) viewport.classList.remove('map-dragging');
        if (mapDrag.moved) {
            suppressMapClick = true;
            setTimeout(() => { suppressMapClick = false; }, 0);
        }
        mapDrag = null;
    }

    function renderMapMarkers() {
        const markerLayer = getElement('map-markers-layer');
        const list = getElement('map-place-items');
        if (!markerLayer || !list) return;

        const search = (getElement('map-place-search')?.value || '').trim().toLocaleLowerCase('de');
        const category = getElement('map-category-filter')?.value || '';
        const filtered = markers.filter(marker =>
            activeCategories.has(getCategoryConfig(marker.category).name)
            && (!category || marker.category === category)
            && (!search || `${marker.title} ${marker.notes || ''} ${marker.category}`.toLocaleLowerCase('de').includes(search))
        );

        markerLayer.innerHTML = filtered.map(marker => `
            <button type="button" class="map-marker" data-map-marker-id="${Number(marker.id)}"
                style="left:${Number(marker.x) * 100}%;top:${Number(marker.y) * 100}%;--map-marker-color:${getCategoryConfig(marker.category).color}"
                title="${escapeHtml(marker.title)}" aria-label="${escapeHtml(marker.title)}">
                <span class="map-marker-pin"><span>${getCategoryConfig(marker.category).icon}</span></span><span class="map-marker-label">${escapeHtml(marker.title)}</span>
            </button>
        `).join('');
        const count = getElement('map-place-count');
        if (count) count.textContent = `${filtered.length} von ${markers.length} Ort${markers.length === 1 ? '' : 'e'}`;
        list.innerHTML = filtered.length ? filtered.map(marker => `
            <article class="map-place-card">
                <button type="button" class="map-place-open" data-map-place-id="${Number(marker.id)}">
                    <strong>${escapeHtml(marker.title)}</strong>
                    <span><span class="map-category-icon" style="--map-marker-color:${getCategoryConfig(marker.category).color}">${getCategoryConfig(marker.category).icon}</span>${escapeHtml(marker.category || 'Sonstiges')}</span>
                    ${marker.notes ? `<small>${escapeHtml(marker.notes)}</small>` : ''}
                </button>
                ${(currentUser?.isAdmin || (String(marker.created_by) === String(currentUser?.id) && canDeleteTab('karte')))
                    ? `<button type="button" class="map-place-delete" data-map-delete-id="${Number(marker.id)}" aria-label="Markierung löschen">×</button>`
                    : ''}
            </article>
        `).join('') : '<div class="map-empty-list">Keine passenden Markierungen.</div>';

    }

    function getCategoryConfig(name) {
        return MAP_CATEGORIES.find(category => category.name === name) || MAP_CATEGORIES[MAP_CATEGORIES.length - 1];
    }

    function renderMapCategoryControls() {
        const select = getElement('map-category-filter');
        const toggleContainer = getElement('map-category-toggles');
        if (select) {
            const selected = select.value;
            select.innerHTML = '<option value="">Alle Kategorien</option>' + MAP_CATEGORIES.map(category =>
                `<option value="${escapeHtml(category.name)}">${category.icon} ${escapeHtml(category.name)}</option>`
            ).join('');
            if (MAP_CATEGORIES.some(category => category.name === selected)) select.value = selected;
        }
        if (!toggleContainer) return;
        toggleContainer.innerHTML = MAP_CATEGORIES.map((category, index) => `
            <label class="map-category-toggle">
                <input type="checkbox" data-map-category="${index}" ${activeCategories.has(category.name) ? 'checked' : ''}>
                <span class="map-category-icon" style="--map-marker-color:${category.color}">${category.icon}</span>
                <span>${escapeHtml(category.name)}</span>
            </label>
        `).join('');
        toggleContainer.querySelectorAll('[data-map-category]').forEach(input => {
            input.addEventListener('change', () => {
                const category = MAP_CATEGORIES[Number(input.dataset.mapCategory)];
                if (!category) return;
                if (input.checked) activeCategories.add(category.name);
                else activeCategories.delete(category.name);
                renderMapMarkers();
            });
        });
    }

    function selectMapMarker(markerId) {
        const marker = markers.find(item => String(item.id) === String(markerId));
        if (!marker) return;
        const search = getElement('map-place-search');
        const category = getElement('map-category-filter');
        if (search) search.value = marker.title;
        if (category) category.value = '';
        renderMapMarkers();
        const markerButton = getElement('map-markers-layer')
            ?.querySelector(`[data-map-marker-id="${Number(marker.id)}"]`);
        if (markerButton) markerButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    async function deleteMapMarker(markerId) {
        if (!currentUser || (!currentUser.isAdmin && !canDeleteTab('karte'))) {
            showToast('Du hast keine Löschrechte für Kartenmarkierungen.', 'danger');
            return;
        }
        const marker = markers.find(item => String(item.id) === String(markerId));
        if (!marker || (!currentUser.isAdmin && String(marker.created_by) !== String(currentUser.id))) return;
        if (!await customConfirm(`Markierung „${marker.title}“ löschen?`)) return;
        const { error } = await supabaseClient.from('map_markers').delete().eq('id', marker.id);
        if (error) {
            showToast('Markierung konnte nicht gelöscht werden: ' + error.message, 'danger');
            return;
        }
        await loadMapTab(true);
        showToast('Markierung wurde gelöscht.', 'success');
    }

    document.addEventListener('click', event => {
        if (suppressMapClick) {
            event.preventDefault();
            event.stopPropagation();
            suppressMapClick = false;
            return;
        }
        const stage = getElement('map-stage');
        if (stage && stage.contains(event.target)) handleMapClick(event);
    });
    const mapViewport = getElement('map-viewport');
    window.addEventListener('resize', resizeMapSurface);
    if (mapViewport) {
        mapViewport.addEventListener('wheel', handleMapWheel, { passive: false });
        mapViewport.addEventListener('scroll', () => queueMapTiles(), { passive: true });
        mapViewport.addEventListener('mousedown', startMapDrag);
        document.addEventListener('mousemove', moveMapDrag);
        document.addEventListener('mouseup', stopMapDrag);
        const markerLayer = getElement('map-markers-layer');
        markerLayer.addEventListener('click', event => {
            const button = event.target.closest('[data-map-marker-id]');
            if (!button) return;
            event.stopPropagation();
            selectMapMarker(button.dataset.mapMarkerId);
        });
    }
    const placeItems = getElement('map-place-items');
    if (placeItems) {
        placeItems.addEventListener('click', event => {
            const deleteButton = event.target.closest('[data-map-delete-id]');
            if (deleteButton) {
                deleteMapMarker(deleteButton.dataset.mapDeleteId);
                return;
            }
            const placeButton = event.target.closest('[data-map-place-id]');
            if (placeButton) selectMapMarker(placeButton.dataset.mapPlaceId);
        });
    }
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && addMode) {
            addMode = false;
            updateAddModeButton();
        }
    });

    window.loadMapTab = loadMapTab;
    window.uploadSharedMapImage = uploadSharedMapImage;
    window.toggleMapAddMode = toggleMapAddMode;
    window.saveMapMarker = saveMapMarker;
    window.closeMapMarkerModal = closeMapMarkerModal;
    window.handleMapMarkerBackdropClick = handleMapMarkerBackdropClick;
    window.renderMapMarkers = renderMapMarkers;
    window.deleteMapMarker = deleteMapMarker;
    window.zoomMapIn = () => setMapZoom(0.25);
    window.zoomMapOut = () => setMapZoom(-0.25);
})();
