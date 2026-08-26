    // ============ ÄNDERUNGSPROTOKOLL (Log) ============
    // Dauerhaftes Protokoll in Supabase. Die lokale Liste ist nur für die
    // sofortige Darstellung zuständig; die Datenbank ist die eigentliche Quelle.
    let activityLogList = [];
    let activityLogRefreshTimer = null;
    let activityLogLoadInProgress = false;

    async function loadActivityLog(showError = false) {
        if (activityLogLoadInProgress) return false;
        activityLogLoadInProgress = true;
        try {
            const { data, error } = await supabaseClient
                .from('activity_log')
                .select('*')
                .order('id', { ascending: false })
                .limit(300);

            if (error) {
                console.error('Änderungsprotokoll konnte nicht geladen werden:', error.message);
                if (showError) showToast('Änderungsprotokoll konnte nicht geladen werden: ' + error.message, 'danger');
                return false;
            }

            activityLogList = Array.isArray(data) ? data : [];
            renderActivityLog();
            return true;
        } catch (e) {
            console.error('Änderungsprotokoll konnte nicht geladen werden:', e);
            if (showError) showToast('Änderungsprotokoll konnte nicht geladen werden.', 'danger');
            return false;
        } finally {
            activityLogLoadInProgress = false;
        }
    }

    function startActivityLogRefresh() {
        if (activityLogRefreshTimer) clearInterval(activityLogRefreshTimer);
        activityLogRefreshTimer = setInterval(() => {
            if (currentUser && currentUser.isAdmin) loadActivityLog(false);
        }, 5000);
    }

    async function logActivity(category, message) {
        // Sofortige Anzeige unten rechts.
        showToast(message, 'success', category + ' geändert');

        const entry = {
            category,
            message,
            createdAt: getCurrentTimeString(),
            username: (currentUser && currentUser.username) || 'Unbekannt'
        };

        // Optimistische Anzeige – anschließend wird immer aus Supabase neu geladen.
        activityLogList.unshift(entry);
        renderActivityLog();

        try {
            const { error } = await supabaseClient
                .from('activity_log')
                .insert([entry]);

            if (error) {
                console.error('Änderungsprotokoll wurde NICHT gespeichert:', error.message);
                showToast('Änderungsprotokoll konnte nicht gespeichert werden. Prüfe die Supabase-Tabelle "activity_log".', 'danger');
                return false;
            }

            // Echte DB-Version laden, damit ID und Reihenfolge stimmen.
            await loadActivityLog(false);
            return true;
        } catch (e) {
            console.error('Änderungsprotokoll wurde NICHT gespeichert:', e);
            showToast('Änderungsprotokoll konnte nicht dauerhaft gespeichert werden.', 'danger');
            return false;
        }
    }

    function categorySlug(cat) {
        return String(cat).toLowerCase()
            .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
            .replace(/[^a-z0-9]+/g, '-');
    }

    function updateLogAdminControls() {
        const btn = document.getElementById('log-clear-btn');
        if (!btn) return;
        btn.style.display = currentUser && currentUser.isAdmin ? '' : 'none';
    }

    async function clearActivityLog() {
        if (!currentUser || !currentUser.isAdmin) {
            showToast('Nur Administratoren können das Änderungsprotokoll leeren.', 'danger');
            return;
        }

        const confirmed = await customConfirm('Möchtest du das gesamte Änderungsprotokoll wirklich löschen?');
        if (!confirmed) return;

        try {
            const { error } = await supabaseClient
                .from('activity_log')
                .delete()
                .neq('id', 0);

            if (error) {
                console.error('Änderungsprotokoll konnte nicht geleert werden:', error.message);
                showToast('Das Änderungsprotokoll konnte nicht geleert werden: ' + error.message, 'danger');
                return;
            }

            activityLogList = [];
            renderActivityLog();
            showToast('Das Änderungsprotokoll wurde geleert.', 'success', 'Protokoll gelöscht');
        } catch (e) {
            console.error('Änderungsprotokoll konnte nicht geleert werden:', e);
            showToast('Das Änderungsprotokoll konnte nicht geleert werden.', 'danger');
        }
    }

    function clearActivityLogSearch() {
        const searchEl = document.getElementById('log-user-search');
        const clearBtn = document.getElementById('log-user-search-clear');
        if (searchEl) {
            searchEl.value = '';
        }
        if (clearBtn) {
            clearBtn.style.display = 'none';
        }
        renderActivityLog();
    }

    function getActivityActionLabel(message) {
        const text = String(message || '').trim().toLowerCase();
        if (!text) return 'Änderung';
        if (text.includes('angelegt') || text.includes('neu') || text.includes('erfasst') || text.includes('gespeichert')) return 'Erstellt';
        if (text.includes('gelöscht') || text.includes('entfernt')) return 'Gelöscht';
        if (text.includes('bearbeitet') || text.includes('geändert') || text.includes('aktualisiert') || text.includes('angepasst') || text.includes('freigeschaltet') || text.includes('gesperrt')) return 'Bearbeitet';
        return 'Änderung';
    }

    function splitLogMessage(message) {
        const raw = String(message || '').trim();
        if (!raw) return { summary: 'Keine weiteren Details verfügbar.', details: 'Keine weiteren Details verfügbar.' };

        const marker = '\n\nDetails:\n';
        const index = raw.indexOf(marker);
        if (index >= 0) {
            const summary = raw.slice(0, index).trim();
            const details = raw.slice(index + marker.length).trim();
            return { summary: summary || 'Änderung', details: details || summary || 'Änderung' };
        }

        const colonIndex = raw.indexOf(': ');
        const suffix = colonIndex >= 0 ? raw.slice(colonIndex + 2).trim() : '';
        const hasValueDetail = colonIndex > 0 && (
            suffix.includes('→') ||
            suffix.includes('->') ||
            /\d/.test(suffix) ||
            /\$/.test(suffix)
        );

        if (hasValueDetail) {
            const summary = raw.slice(0, colonIndex).trim();
            return { summary: summary || 'Änderung', details: raw };
        }

        return { summary: raw, details: raw };
    }

    function getLogDisplaySummary(message) {
        return splitLogMessage(message).summary;
    }

    function openLogDetailModal(entry) {
        const detail = entry || {};
        const user = detail.username || 'Unbekannt';
        const category = detail.category || 'Allgemein';
        const rawMessage = detail.message || 'Keine weiteren Details verfügbar.';
        const { summary, details } = splitLogMessage(rawMessage);
        const action = getActivityActionLabel(summary);

        const userEl = document.getElementById('log-detail-user');
        const categoryEl = document.getElementById('log-detail-category');
        const actionEl = document.getElementById('log-detail-action');
        const messageEl = document.getElementById('log-detail-message');
        const backdrop = document.getElementById('log-detail-backdrop');

        if (userEl) userEl.innerText = user;
        if (categoryEl) categoryEl.innerText = category;
        if (actionEl) actionEl.innerText = action;
        if (messageEl) {
            const detailText = details !== summary ? `${summary}\n\n${details}` : summary;
            messageEl.innerText = detailText;
        }
        if (backdrop) backdrop.classList.add('open');
    }

    function closeLogDetailModal() {
        const backdrop = document.getElementById('log-detail-backdrop');
        if (backdrop) backdrop.classList.remove('open');
    }

    function handleLogDetailBackdropClick(event) {
        if (event.target.id === 'log-detail-backdrop') closeLogDetailModal();
    }

    function renderActivityLog() {
        updateLogAdminControls();

        const tbody = document.getElementById('log-table-body');
        if (!tbody) return;
        const filterEl = document.getElementById('log-category-filter');
        const searchEl = document.getElementById('log-user-search');
        const clearBtn = document.getElementById('log-user-search-clear');
        const filterValue = filterEl ? filterEl.value : 'ALL';
        const searchValue = searchEl ? String(searchEl.value || '').trim().toLowerCase() : '';

        if (clearBtn) {
            clearBtn.style.display = searchValue ? '' : 'none';
        }

        let list = activityLogList;
        if (filterValue !== 'ALL') list = list.filter(e => e.category === filterValue);
        if (searchValue) {
            list = list.filter(entry => {
                const username = String(entry.username || '').trim().toLowerCase();
                return username.includes(searchValue);
            });
        }

        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">Noch keine Änderungen protokolliert.</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(entry => {
            const encodedEntry = encodeURIComponent(JSON.stringify(entry));
            const summaryText = getLogDisplaySummary(entry.message);
            return `
                <tr>
                    <td class="time-text" style="white-space: nowrap;">${entry.createdAt}</td>
                    <td>${renderUsernameWithAvatar(entry.username || '–', null, { size: 'small' })}</td>
                    <td><span class="log-badge log-badge-${categorySlug(entry.category)}">${entry.category}</span></td>
                    <td>${summaryText}</td>
                    <td style="text-align: center;">
                        <button type="button" class="btn log-detail-btn" data-log-entry="${encodedEntry}" aria-label="Änderungsdetails anzeigen">Änderung anzeigen</button>
                    </td>
                </tr>
            `;
        }).join('');

        tbody.querySelectorAll('.log-detail-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                try {
                    const entry = JSON.parse(decodeURIComponent(btn.dataset.logEntry));
                    openLogDetailModal(entry);
                } catch (e) {
                    console.error('Log-Eintrag konnte nicht geöffnet werden.', e);
                }
            });
        });
    }

    function capitalizeText(text) {
        if (!text) return "";
        return text.split(' ').map(word => {
            if (!word) return "";
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }).join(' ');
    }

    function makeTitleEditable() {
        const titleEl = document.getElementById('main-title');
        const currentText = titleEl.innerText;
        
        const inputEl = document.createElement('input');
        inputEl.type = 'text';
        inputEl.className = 'title-input';
        inputEl.value = currentText;
        
        titleEl.replaceWith(inputEl);
        inputEl.focus();
        inputEl.select();

        const saveTitle = () => {
            const newText = inputEl.value.trim() || DEFAULT_APP_NAME;
            const newH1 = document.createElement('h1');
            newH1.id = 'main-title';
            newH1.innerText = newText;
            newH1.setAttribute('onclick', 'makeTitleEditable()');
            newH1.setAttribute('title', 'Klicken zum Bearbeiten');
            inputEl.replaceWith(newH1);
            try { localStorage.setItem(APP_NAME_STORAGE_KEY, newText); } catch (e) {}
            applyAppName(newText);
            if (newText !== currentText) {
                showToast(`Der Anwendungsname wurde auf „${newText}“ geändert.`, 'success', 'Übersicht geändert');
            }
        };

        inputEl.addEventListener('blur', saveTitle);
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                saveTitle();
            }
        });
    }

    let inventoryList = [];
    let ordersList = [];
    let archivedOrdersList = [];
    let customerPricesList = [];
    let salesPricesList = [];
    let purchasePricesList = [];
    let shoppingListQuantities = {};
    let recipesList = [];
    let recipeMargins = {};
    let recipeTargetAmounts = {};
    let notesList = [];
    let manualIngredientPrices = {};
    let membersList = [];

    function getCurrentTimeString() {
        const now = new Date();
        const options = { day: 'numeric', month: 'long', year: 'numeric' };
        const dateStr = now.toLocaleDateString('de-DE', options);
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        return `${dateStr}, ${hours}:${minutes} Uhr`;
    }
	
	function updateStockAddDropdown() {
        const selectEl = document.getElementById('stock-add-name');
        if (!selectEl) return;
        const currentSelected = selectEl.value;

        let allItemsSet = new Set();
        recipesList.forEach(recipe => {
            if (recipe.outputName) allItemsSet.add(recipe.outputName);
            if (recipe.ingredients) {
                recipe.ingredients.forEach(ing => {
                    if (ing.name) allItemsSet.add(ing.name);
                });
            }
        });

        const sortedItems = [...allItemsSet].sort((a, b) => a.localeCompare(b, 'de'));

        selectEl.innerHTML = '<option value="" disabled selected>-- Artikel / Rohstoff wählen --</option>';
        sortedItems.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item;
            opt.innerText = item;
            selectEl.appendChild(opt);
        });

        if (sortedItems.includes(currentSelected)) {
            selectEl.value = currentSelected;
        }
    }

