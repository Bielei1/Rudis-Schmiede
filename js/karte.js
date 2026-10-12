(() => {
    const MAP_BUCKET = 'shared-family-map';
    const MAP_IMAGE_PATH = 'background';
    const MAX_MAP_IMAGE_BYTES = 25 * 1024 * 1024;
    const ALLOWED_MAP_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    let markers = [];
    let addMode = false;
    let pendingPosition = null;
    let zoom = 1;
    let imageLoadId = 0;

    function getElement(id) {
        return document.getElementById(id);
    }

    async function loadMapTab() {
        if (!currentUser || !supabaseClient) return;
        const status = getElement('map-status');
        if (status) status.textContent = 'Lade gemeinsame Karte ...';

        const [markerResult, settingsResult] = await Promise.all([
            supabaseClient.from('map_markers')
                .select('id, title, category, notes, x, y, created_by, created_at')
                .order('created_at', { ascending: false }),
            supabaseClient.from('map_settings')
                .select('image_path')
                .eq('id', 1)
                .maybeSingle()
        ]);

        if (markerResult.error) {
            if (status) status.textContent = 'Kartendatenbank fehlt oder ist nicht erreichbar. Bitte zuerst das Karten-SQL einrichten.';
            console.error('Kartenmarkierungen konnten nicht geladen werden:', markerResult.error.message);
            return showToast('Kartenmarkierungen konnten nicht geladen werden: ' + markerResult.error.message, 'danger');
        }
        if (settingsResult.error) {
            if (status) status.textContent = 'Karteneinstellungen konnten nicht geladen werden.';
            console.error('Karteneinstellungen konnten nicht geladen werden:', settingsResult.error.message);
            return showToast('Karteneinstellungen konnten nicht geladen werden: ' + settingsResult.error.message, 'danger');
        }

        markers = markerResult.data || [];
        if (status) status.textContent = `${markers.length} gemeinsame Markierung${markers.length === 1 ? '' : 'en'}`;
        renderMapMarkers();

        const imagePath = settingsResult.data && settingsResult.data.image_path;
        if (!imagePath) {
            showEmptyMap();
            return;
        }

        const { data, error } = await supabaseClient.storage.from(MAP_BUCKET).createSignedUrl(imagePath, 3600);
        if (error) {
            showEmptyMap();
            showToast('Kartenbild konnte nicht geladen werden: ' + error.message, 'danger');
            return;
        }
        displayMapImage(data.signedUrl);
    }

    function showEmptyMap() {
        const image = getElement('map-background-image');
        if (image) image.hidden = true;
        const stage = getElement('map-stage');
        if (stage) stage.classList.remove('map-image-ready');
        const empty = getElement('map-empty-state');
        if (empty) empty.hidden = false;
        const button = getElement('map-add-mode-button');
        if (button) button.disabled = true;
    }

    function displayMapImage(url) {
        const image = getElement('map-background-image');
        if (!image) return;
        const loadId = ++imageLoadId;
        image.onload = () => {
            if (loadId !== imageLoadId) return;
            const stage = getElement('map-stage');
            if (stage) stage.style.aspectRatio = `${image.naturalWidth} / ${image.naturalHeight}`;
            if (stage) stage.classList.add('map-image-ready');
            image.hidden = false;
            const empty = getElement('map-empty-state');
            if (empty) empty.hidden = true;
            const button = getElement('map-add-mode-button');
            if (button) button.disabled = !canEditTab('karte');
            applyMapZoom(zoom);
            updateAddModeButton();
            renderMapMarkers();
        };
        image.onerror = () => {
            if (loadId !== imageLoadId) return;
            showEmptyMap();
            showToast('Das Kartenbild ist beschädigt oder nicht lesbar.', 'danger');
        };
        image.src = url;
    }

    async function uploadSharedMapImage(event) {
        const input = event.target;
        const file = input.files && input.files[0];
        if (!file) return;
        if (!canEditTab('karte')) {
            showToast('Du hast keine Bearbeitungsrechte für die Karte.', 'danger');
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

        input.value = '';
        if (status) status.textContent = `${markers.length} gemeinsame Markierung${markers.length === 1 ? '' : 'en'}`;
        showToast('Das gemeinsame Kartenbild wurde aktualisiert.', 'success');
        await loadMapTab();
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
        const image = getElement('map-background-image');
        const stage = getElement('map-stage');
        if (!image || image.hidden || !stage) return;
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
        await loadMapTab();
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

        const oldWidth = stage.getBoundingClientRect().width;
        const oldHeight = stage.getBoundingClientRect().height;
        const viewportRect = viewport.getBoundingClientRect();
        const pointerX = anchorX ?? viewportRect.left + viewport.clientWidth / 2;
        const pointerY = anchorY ?? viewportRect.top + viewport.clientHeight / 2;
        const mapX = oldWidth ? (viewport.scrollLeft + pointerX - viewportRect.left) / oldWidth : 0;
        const mapY = oldHeight ? (viewport.scrollTop + pointerY - viewportRect.top) / oldHeight : 0;

        zoom = Math.min(2.5, Math.max(0.5, nextZoom));
        stage.style.width = `${zoom * 100}%`;
        viewport.scrollLeft = mapX * stage.getBoundingClientRect().width - (pointerX - viewportRect.left);
        viewport.scrollTop = mapY * stage.getBoundingClientRect().height - (pointerY - viewportRect.top);
    }

    function handleMapWheel(event) {
        if (addMode) return;
        event.preventDefault();
        const direction = event.deltaY < 0 ? 1 : -1;
        const step = event.deltaMode === 0 ? 0.12 : 0.2;
        applyMapZoom(zoom + direction * step, event.clientX, event.clientY);
    }

    function renderMapMarkers() {
        const markerLayer = getElement('map-markers-layer');
        const list = getElement('map-place-items');
        if (!markerLayer || !list) return;

        const search = (getElement('map-place-search')?.value || '').trim().toLocaleLowerCase('de');
        const category = getElement('map-category-filter')?.value || '';
        const filtered = markers.filter(marker =>
            (!category || marker.category === category)
            && (!search || `${marker.title} ${marker.notes || ''} ${marker.category}`.toLocaleLowerCase('de').includes(search))
        );

        markerLayer.innerHTML = filtered.map(marker => `
            <button type="button" class="map-marker" data-map-marker-id="${Number(marker.id)}"
                style="left:${Number(marker.x) * 100}%;top:${Number(marker.y) * 100}%"
                title="${escapeHtml(marker.title)}" aria-label="${escapeHtml(marker.title)}">
                <span class="map-marker-pin"></span><span class="map-marker-label">${escapeHtml(marker.title)}</span>
            </button>
        `).join('');
        markerLayer.querySelectorAll('[data-map-marker-id]').forEach(button => {
            button.addEventListener('click', event => {
                event.stopPropagation();
                const marker = filtered.find(item => String(item.id) === button.dataset.mapMarkerId);
                if (marker) selectMapMarker(marker.id);
            });
        });

        const count = getElement('map-place-count');
        if (count) count.textContent = `${filtered.length} von ${markers.length} Ort${markers.length === 1 ? '' : 'e'}`;
        list.innerHTML = filtered.length ? filtered.map(marker => `
            <article class="map-place-card">
                <button type="button" class="map-place-open" data-map-place-id="${Number(marker.id)}">
                    <strong>${escapeHtml(marker.title)}</strong>
                    <span>${escapeHtml(marker.category || 'Sonstiges')}</span>
                    ${marker.notes ? `<small>${escapeHtml(marker.notes)}</small>` : ''}
                </button>
                ${String(marker.created_by) === String(currentUser?.id) && canDeleteTab('karte')
                    ? `<button type="button" class="map-place-delete" data-map-delete-id="${Number(marker.id)}" aria-label="Markierung löschen">×</button>`
                    : ''}
            </article>
        `).join('') : '<div class="map-empty-list">Keine passenden Markierungen.</div>';

        list.querySelectorAll('[data-map-place-id]').forEach(button => {
            button.addEventListener('click', () => selectMapMarker(button.dataset.mapPlaceId));
        });
        list.querySelectorAll('[data-map-delete-id]').forEach(button => {
            button.addEventListener('click', () => deleteMapMarker(button.dataset.mapDeleteId));
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
        if (!canDeleteTab('karte')) {
            showToast('Du hast keine Löschrechte für Kartenmarkierungen.', 'danger');
            return;
        }
        const marker = markers.find(item => String(item.id) === String(markerId));
        if (!marker || String(marker.created_by) !== String(currentUser.id)) return;
        if (!await customConfirm(`Markierung „${marker.title}“ löschen?`)) return;
        const { error } = await supabaseClient.from('map_markers').delete().eq('id', marker.id);
        if (error) {
            showToast('Markierung konnte nicht gelöscht werden: ' + error.message, 'danger');
            return;
        }
        await loadMapTab();
        showToast('Markierung wurde gelöscht.', 'success');
    }

    document.addEventListener('click', event => {
        const stage = getElement('map-stage');
        if (stage && stage.contains(event.target)) handleMapClick(event);
    });
    const mapViewport = getElement('map-viewport');
    if (mapViewport) mapViewport.addEventListener('wheel', handleMapWheel, { passive: false });
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
