    function switchTab(tabName, forceAllowed = false) {
        if ((tabName === 'log' || tabName === 'benutzer' || tabName === 'avatarlogs') && !(currentUser && currentUser.isAdmin)) return;
        if (!forceAllowed && tabName !== 'log' && tabName !== 'benutzer' && !canViewTab(tabName)) {
            showToast('Du hast für diesen Tab keinen Zugriff.', 'danger');
            return;
        }

        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        const targetBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
        const targetContent = document.getElementById(`tab-${tabName}`);

        if (targetBtn && targetContent) {
            targetBtn.classList.add('active');
            targetContent.classList.add('active');
        }

        applyPermissionUI();

        if (tabName === 'uebersicht') {
            renderDashboard();
        } else if (tabName === 'log') {
            renderActivityLog();
        } else if (tabName === 'benutzer') {
            loadAppUsers();
        } else if (tabName === 'avatarlogs') {
            loadAvatarLogs();
        } else if (tabName === 'herstellung') {
            updateRecipeSearchSelect();
            renderRecipes();
        } else if (tabName === 'herstellungskosten') {
            updateProductionCostSelect();
            renderProductionCostsTable();
        } else if (tabName === 'bestellungen') {
            updateOrderCustomerDropdown();
            updateOrderRecipeSelects();
            renderOrders();
            updateOrderTotalsPreview();
            markAllSeen(LS_KEY_ORDERS, ordersList);
            updateUnseenBadges();
        } else if (tabName === 'archiv') {
            renderArchive();
        } else if (tabName === 'kunden') {
            updateCustomerFilterOptions();
            updateCustomerPricesRecipeSelect();
            initCustomerPricePositionInputs();
            renderCustomerPricesTable();
        } else if (tabName === 'einkaufsliste') {
            updateShoppingBusinessFilterOptions();
            renderShoppingList();
        } else if (tabName === 'verkaufspreise') {
            updateSalesPriceRecipeDropdown();
            updateSalesPriceSearchSelect();
            renderCalculatedPricesTable();
            renderPriceTable();
        } else if (tabName === 'verkaufsrechner') {
            renderSalesCalculatorProducts();
            renderSalesCalculatorCart();
        } else if (tabName === 'notizen') {
            renderNotes();
            markAllSeen(LS_KEY_NOTES, notesList);
            updateUnseenBadges();
        }
    }

    const tabsContainer = document.getElementById('tabs-container');
    let draggedTab = null;

    tabsContainer.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('tab-btn')) {
            draggedTab = e.target;
            e.target.classList.add('dragging');
        }
    });

    tabsContainer.addEventListener('dragend', (e) => {
        if (e.target.classList.contains('tab-btn')) {
            e.target.classList.remove('dragging');
            draggedTab = null;
        }
    });

    tabsContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        const isVertical = getComputedStyle(tabsContainer).flexDirection === 'column';
        const afterElement = isVertical
            ? getDragAfterElementVertical(tabsContainer, e.clientY)
            : getDragAfterElement(tabsContainer, e.clientX);
        const currentActive = document.querySelector('.tab-btn.dragging');
        if (currentActive) {
            if (afterElement == null) {
                tabsContainer.appendChild(currentActive);
            } else {
                tabsContainer.insertBefore(currentActive, afterElement);
            }
        }
    });

    function getDragAfterElement(container, x) {
        const draggableElements = [...container.querySelectorAll('.tab-btn:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = x - box.left - box.width / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    function getDragAfterElementVertical(container, y) {
        const draggableElements = [...container.querySelectorAll('.tab-btn:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    async function loadDataFromSupabase() {
        try {
            const { data: inv } = await supabaseClient.from('inventory').select('*');
            if (inv) inventoryList = inv;

            const { data: ord } = await supabaseClient.from('orders').select('*');
            if (ord) ordersList = ord;

            const { data: arch } = await supabaseClient.from('archive').select('*');
            if (arch) archivedOrdersList = arch;

            const { data: custP } = await supabaseClient.from('customer_prices').select('*');
            if (custP) customerPricesList = custP;

            const { data: salesP } = await supabaseClient.from('sales_prices').select('*');
            if (salesP) salesPricesList = salesP;

            const { data: purchP } = await supabaseClient.from('purchase_prices').select('*');
            if (purchP) purchasePricesList = purchP;

            const { data: rec } = await supabaseClient.from('recipes').select('*');
            if (rec) recipesList = rec;

            const { data: nots } = await supabaseClient.from('notes').select('*');
            if (nots) notesList = nots;

            const { data: mems } = await supabaseClient.from('members').select('*');
            if (mems) membersList = mems;

            await loadMemberUsernames();

            await loadActivityLog(false);
            if (currentUser && currentUser.isAdmin) startActivityLogRefresh();

            renderTables();
			updateStockAddDropdown();
        } catch (error) {
            console.error("Fehler beim Laden der Supabase-Daten:", error);
        }
    }

    function renderTables() {
        renderStockTable();
		updateStockAddDropdown();
        updateProductionCostSelect();
        renderProductionCostsTable();
        updateOrderCustomerDropdown();
        updateOrderRecipeSelects();
        renderOrders();
        updateOrderTotalsPreview();
        renderArchive();
        updateCustomerFilterOptions();
        updateCustomerPricesRecipeSelect();
        initCustomerPricePositionInputs();
        renderCustomerPricesTable();
        updateSalesPriceRecipeDropdown();
        updateSalesPriceSearchSelect();
        renderCalculatedPricesTable();
        renderPriceTable();
        renderSalesCalculatorProducts();
        renderSalesCalculatorCart();
        updateBusinessFilterOptions();
        renderCostTable();
        updateShoppingBusinessFilterOptions();
        renderShoppingList();
        updateRecipeSearchSelect();
        renderRecipes();
        renderNotes();
        renderMembersTable();
        renderDashboard();
        renderPinboard();
        renderActivityLog();
    }

    // ============ ÜBERSICHT / DASHBOARD ============
    const LS_KEY_ORDERS = 'rudisSchmiede_lastSeenOrderId';
    const LS_KEY_NOTES = 'rudisSchmiede_lastSeenNoteId';

    function getLastSeenId(key, list) {
        const stored = localStorage.getItem(key);
        if (stored === null) {
            const initialMax = list.length ? Math.max(...list.map(i => i.id)) : 0;
            localStorage.setItem(key, String(initialMax));
            return initialMax;
        }
        return parseInt(stored, 10) || 0;
    }

    function markAllSeen(key, list) {
        const maxId = list.length ? Math.max(...list.map(i => i.id)) : 0;
        const current = getLastSeenId(key, list);
        localStorage.setItem(key, String(Math.max(maxId, current)));
    }

    function getNewOrders() {
        const lastSeen = getLastSeenId(LS_KEY_ORDERS, ordersList);
        return ordersList.filter(o => o.id > lastSeen);
    }

    function getNewNotes() {
        const lastSeen = getLastSeenId(LS_KEY_NOTES, notesList);
        return notesList.filter(n => n.id > lastSeen);
    }

    function updateUnseenBadges() {
        const orderBadge = document.getElementById('bestellungen-badge');
        if (orderBadge) {
            const count = getNewOrders().length;
            orderBadge.innerText = count;
            orderBadge.classList.toggle('visible', count > 0);
        }
        const noteBadge = document.getElementById('notizen-badge');
        if (noteBadge) {
            const count = getNewNotes().length;
            noteBadge.innerText = count;
            noteBadge.classList.toggle('visible', count > 0);
        }
    }

    function updateLagerBadge() {
        const badge = document.getElementById('lager-badge');
        if (!badge) return;
        const warnCount = inventoryList.filter(i => i.quantity < LOW_STOCK_THRESHOLD).length;
        badge.innerText = warnCount;
        badge.classList.toggle('visible', warnCount > 0);
    }

    function renderDashboard() {
        const grid = document.getElementById('dashboard-kpi-grid');
        const lowStockList = document.getElementById('dashboard-lowstock-list');
        if (!grid || !lowStockList) return;

        updateUnseenBadges();

        const newOrders = getNewOrders();
        const newNotes = getNewNotes();
        const banner = document.getElementById('dashboard-notify-banner');
        if (banner) {
            if (newOrders.length === 0 && newNotes.length === 0) {
                banner.style.display = 'none';
            } else {
                banner.style.display = 'flex';
                const parts = [];
                if (newOrders.length > 0) parts.push(`${newOrders.length} neue Bestellung${newOrders.length > 1 ? 'en' : ''}`);
                if (newNotes.length > 0) parts.push(`${newNotes.length} neue Notiz${newNotes.length > 1 ? 'en' : ''}`);
                const textEl = document.getElementById('dashboard-notify-text');
                if (textEl) textEl.innerText = parts.join(' · ') + ' seit deinem letzten Besuch';

                let actionsHtml = '';
                if (newOrders.length > 0) {
                    actionsHtml += `<button type="button" class="btn" style="height: 34px; font-size: 0.8rem;" onclick="switchTab('bestellungen')">Bestellungen ansehen</button>`;
                }
                if (newNotes.length > 0) {
                    actionsHtml += `<button type="button" class="btn" style="height: 34px; font-size: 0.8rem; background-color: var(--card-bg-raised); color: var(--text-color); border: 1px solid var(--border-color);" onclick="switchTab('notizen')">Notizen ansehen</button>`;
                }
                const actionsEl = document.getElementById('dashboard-notify-actions');
                if (actionsEl) actionsEl.innerHTML = actionsHtml;
            }
        }

        const openOrders = ordersList.length;
        const archivedRevenue = archivedOrdersList.reduce((sum, o) => sum + (o.totalSum || 0), 0);

        // Lagerbestand-Wert: Menge je Artikel × durchschnittlicher Einkaufspreis
        // (Durchschnitt über alle Gewerbe-Varianten desselben Artikels in den
        // Einkaufspreisen, damit kein Gewerbe bevorzugt und nichts doppelt gezählt wird)
        let stockValue = 0;
        inventoryList.forEach(invItem => {
            const matches = purchasePricesList.filter(p => p.name.toLowerCase() === invItem.name.toLowerCase());
            if (matches.length > 0) {
                const avgCost = matches.reduce((sum, m) => sum + (m.cost || 0), 0) / matches.length;
                stockValue += invItem.quantity * avgCost;
            }
        });

        grid.innerHTML = `
            <div class="kpi-card" style="--kpi-accent: var(--primary-color);">
                <div class="kpi-label">Offene Bestellungen</div>
                <div class="kpi-value">${openOrders}</div>
                <div class="kpi-sub">Noch nicht ausgeliefert</div>
            </div>
            <div class="kpi-card" style="--kpi-accent: var(--copper-color);">
                <div class="kpi-label">Lagerbestand-Wert</div>
                <div class="kpi-value">$${stockValue.toFixed(2)}</div>
                <div class="kpi-sub">Nach Ø Einkaufspreis</div>
            </div>
            <div class="kpi-card" style="--kpi-accent: var(--success-color);">
                <div class="kpi-label">Umsatz (Archiv gesamt)</div>
                <div class="kpi-value">$${archivedRevenue.toFixed(2)}</div>
                <div class="kpi-sub">${archivedOrdersList.length} ausgelieferte Bestellung(en)</div>
            </div>
        `;

        const warnItems = inventoryList
            .filter(i => i.quantity < LOW_STOCK_THRESHOLD)
            .sort((a, b) => a.quantity - b.quantity);

        if (warnItems.length === 0) {
            lowStockList.innerHTML = `<div class="dashboard-empty">Aktuell keine Engpässe – alle Bestände über dem Schwellenwert.</div>`;
        } else {
            lowStockList.innerHTML = warnItems.map(item => {
                const badge = item.quantity === 0
                    ? `<span class="stock-badge stock-badge-critical">Kritisch</span>`
                    : `<span class="stock-badge stock-badge-low">Niedrig</span>`;
                return `<div class="dashboard-list-row"><span>${item.name}</span><span>${item.quantity} Stk. ${badge}</span></div>`;
            }).join('');
        }
    }

    // ============ PINNWAND (Übersicht) ============
    // Nutzt bewusst dieselbe "notes"-Tabelle wie der Notizen-Tab, nur gefiltert
    // auf label === 'Pinnwand' - kein separates Supabase-Setup nötig, und
    // Einträge tauchen ergänzend auch in der vollständigen Notizen-Liste auf.
    function renderPinboard() {
        const container = document.getElementById('pinboard-list');
        if (!container) return;

        const pinned = notesList
            .filter(n => n.label === 'Pinnwand')
            .sort((a, b) => b.id - a.id);

        if (pinned.length === 0) {
            container.innerHTML = `<div class="dashboard-empty">Noch nichts angepinnt.</div>`;
            return;
        }

        container.innerHTML = pinned.map(note => `
            <div class="pinboard-row">
                <div class="pinboard-body">
                    <span class="pinboard-text">${escapeHtml(note.content)}</span>
                    <span class="pinboard-meta">${note.createdBy ? `von ${renderUsernameWithAvatar(note.createdBy, null, { size: 'small' })} · ` : ''}${note.updatedAt || ''}</span>
                </div>
                <button type="button" class="pinboard-delete-btn" title="Entfernen" onclick="deletePinboardNote(${note.id})">✕</button>
            </div>
        `).join('');
    }

    async function handlePinboardAdd(event) {
        event.preventDefault();
        const input = document.getElementById('pinboard-add-input');
        const content = input.value.trim();
        if (!content) return;

        const updatedAt = getCurrentTimeString();
        const { data, error } = await supabaseClient
            .from('notes')
            .insert([{ label: 'Pinnwand', content, updatedAt, createdBy: currentUser ? currentUser.username : null }])
            .select();

        if (!error && data) {
            notesList.unshift(data[0]);
            input.value = '';
            renderPinboard();
            logActivity('Pinnwand', `Neuer Pinnwand-Eintrag: "${content}"`, `Inhalt:\n${content}`);
        } else {
            showToast("Fehler beim Speichern: " + (error ? error.message : ''), 'danger');
        }
    }

    async function deletePinboardNote(id) {
        if (!canDeleteTab('notizen')) {
            showToast('Du hast für diesen Bereich keine Löschrechte.', 'danger', 'Löschen nicht erlaubt');
            return;
        }
        if (await customConfirm("Eintrag von der Pinnwand entfernen?")) {
            const note = notesList.find(n => n.id === id);
            const { error } = await supabaseClient.from('notes').delete().eq('id', id);
            if (!error) {
                notesList = notesList.filter(n => n.id !== id);
                renderPinboard();
                logActivity('Pinnwand', `Pinnwand-Eintrag entfernt.`, `Eintrag: ${id}\nInhalt:\n${note ? (note.content || '-') : '-'}`);
            } else {
                showToast("Fehler beim Löschen: " + error.message, 'danger');
            }
        }
    }

    function getPriceDetailsForCustomer(customerName, itemName) {
        if (!customerName) {
            const salesPriceObj = salesPricesList.find(sp => 
                sp.name.toLowerCase() === itemName.toLowerCase()
            );
            if (salesPriceObj) {
                const discountInput = document.getElementById('global-discount-input');
                let discountPercent = discountInput ? parseFloat(discountInput.value) || 0 : 0;
                let finalPrice = salesPriceObj.price * (1 - (discountPercent / 100));
                return { price: finalPrice, type: discountPercent > 0 ? `Standard-VK (${discountPercent}% Rabatt)` : 'Standard-VK' };
            }
            return { price: 0.00, type: 'Kein Preis' };
        }

        const custPriceObj = customerPricesList.find(cp => 
            cp.customerName.toLowerCase() === customerName.toLowerCase() && 
            cp.name.toLowerCase() === itemName.toLowerCase()
        );
        if (custPriceObj) {
            return { price: custPriceObj.price, type: 'Sonderpreis' };
        }

        const salesPriceObj = salesPricesList.find(sp => 
            sp.name.toLowerCase() === itemName.toLowerCase()
        );
        if (salesPriceObj) {
            const discountInput = document.getElementById('global-discount-input');
            let discountPercent = discountInput ? parseFloat(discountInput.value) || 0 : 0;
            let finalPrice = salesPriceObj.price * (1 - (discountPercent / 100));
            return { price: finalPrice, type: discountPercent > 0 ? `Standard-VK (${discountPercent}% Rabatt)` : 'Standard-VK' };
        }

        return { price: 0.00, type: 'Kein Preis' };
    }

    function getLowestPurchaseCost(itemName) {
        if (manualIngredientPrices[itemName] !== undefined) {
            return manualIngredientPrices[itemName];
        }
        const matches = purchasePricesList.filter(p => p.name.toLowerCase() === itemName.toLowerCase());
        if (matches.length === 0) {
            const recipe = recipesList.find(r => r.outputName.toLowerCase() === itemName.toLowerCase());
            if (recipe) {
                return getRecipeCostPerUnit(itemName);
            }
            return 0.00;
        }
        let lowest = matches[0].cost;
        matches.forEach(m => {
            if (m.cost < lowest) lowest = m.cost;
        });
        return lowest;
    }

    function saveManualIngredientPrice(ingredientName, inputId) {
        const inputEl = document.getElementById(inputId);
        if (!inputEl) return;
        const val = parseFloat(inputEl.value);
        if (isNaN(val) || val < 0) {
            delete manualIngredientPrices[ingredientName];
        } else {
            manualIngredientPrices[ingredientName] = val;
        }
        renderProductionCostsTable();
        renderCalculatedPricesTable();
        renderPriceTable();
        renderCustomerPricesTable();
        showToast(`Manueller Materialpreis für "${ingredientName}" wurde ${isNaN(val) || val < 0 ? 'entfernt' : 'gespeichert'}.`, 'success', 'Herstellungskosten geändert');
    }
