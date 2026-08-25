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

    function renderActivityLog() {
        const tbody = document.getElementById('log-table-body');
        if (!tbody) return;
        const filterEl = document.getElementById('log-category-filter');
        const filterValue = filterEl ? filterEl.value : 'ALL';

        let list = activityLogList;
        if (filterValue !== 'ALL') list = list.filter(e => e.category === filterValue);

        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">Noch keine Änderungen protokolliert.</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(entry => `
            <tr>
                <td class="time-text" style="white-space: nowrap;">${entry.createdAt}</td>
                <td><span style="display:inline-flex;align-items:center;gap:7px;">${userAvatarHtml(entry.username || '–', 'user-avatar-sm')} ${escapeHtml(entry.username || '–')}</span></td>
                <td><span class="log-badge log-badge-${categorySlug(entry.category)}">${entry.category}</span></td>
                <td>${entry.message}</td>
            </tr>
        `).join('');
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

