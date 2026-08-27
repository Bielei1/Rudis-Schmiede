// ============ GLOBALE SUCHE ============
(() => {
    const input = document.getElementById('global-search-input');
    const resultsEl = document.getElementById('global-search-results');
    if (!input || !resultsEl) return;

    const sources = [
        { key: 'lagerbestand', label: 'Lagerbestand', list: () => inventoryList, title: item => item.name, detail: item => `Bestand: ${item.qty ?? item.quantity ?? 0}` },
        { key: 'bestellungen', label: 'Bestellungen', list: () => ordersList, title: item => item.customerName, detail: item => item.createdAt || 'Aktive Bestellung' },
        { key: 'archiv', label: 'Bestellung Archiv', list: () => archivedOrdersList, title: item => item.customerName, detail: item => item.createdAt || 'Archivierte Bestellung' },
        { key: 'kunden', label: 'Kunden-Preise', list: () => customerPricesList, title: item => item.name, detail: item => item.business || 'Kundenpreis' },
        { key: 'verkaufspreise', label: 'Verkaufspreise', list: () => salesPricesList, title: item => item.name, detail: item => item.price != null ? `$${Number(item.price).toFixed(2)}` : 'Verkaufspreis' },
        { key: 'einkaufspreise', label: 'Einkaufspreise', list: () => purchasePricesList, title: item => item.name, detail: item => item.business || 'Einkaufspreis' },
        { key: 'herstellung', label: 'Herstellung', list: () => recipesList, title: item => item.outputName, detail: item => 'Rezept' },
        { key: 'notizen', label: 'Notizen', list: () => notesList, title: item => item.title || item.content, detail: item => item.label || 'Notiz' },
        { key: 'mitglieder', label: 'Mitglieder', list: () => memberUsernamesList, title: item => item.username, detail: item => item.bio || 'Mitglied' }
    ];

    function normalize(value) {
        return String(value ?? '').toLocaleLowerCase('de-DE').trim();
    }

    function getResults(query) {
        const normalizedQuery = normalize(query);
        if (!normalizedQuery) return [];
        const matches = [];
        sources.forEach(source => {
            if (typeof canViewTab === 'function' && !canViewTab(source.key)) return;
            const list = source.list();
            if (!Array.isArray(list)) return;
            list.forEach(item => {
                if (!normalize(JSON.stringify(item)).includes(normalizedQuery)) return;
                matches.push({ source, title: String(source.title(item) || 'Ohne Bezeichnung'), detail: String(source.detail(item) || '') });
            });
        });
        return matches.slice(0, 30);
    }

    function renderResults(query) {
        const matches = getResults(query);
        resultsEl.hidden = !query.trim();
        if (!query.trim()) {
            resultsEl.innerHTML = '';
            return;
        }
        if (!matches.length) {
            resultsEl.innerHTML = '<div class="global-search-empty">Keine passenden Einträge gefunden.</div>';
            return;
        }
        resultsEl.innerHTML = matches.map((match, index) => `
            <button type="button" class="global-search-result" data-search-index="${index}">
                <span class="global-search-result-title">${escapeHtml(match.title)}</span>
                <span class="global-search-result-meta">${escapeHtml(match.source.label)}${match.detail ? ` · ${escapeHtml(match.detail)}` : ''}</span>
            </button>
        `).join('');
        resultsEl.querySelectorAll('[data-search-index]').forEach(button => {
            button.addEventListener('click', () => {
                const match = matches[Number(button.dataset.searchIndex)];
                if (!match) return;
                switchTab(match.source.key);
                input.value = '';
                resultsEl.hidden = true;
                resultsEl.innerHTML = '';
            });
        });
    }

    input.addEventListener('input', () => renderResults(input.value));
    input.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            input.value = '';
            renderResults('');
            input.blur();
        }
    });
    document.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            input.focus();
            input.select();
        }
    });
})();
