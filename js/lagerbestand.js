    function renderStockTable() {
        const tbody = document.getElementById('inventory-body');
        tbody.innerHTML = '';
        const sortedList = [...inventoryList].sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }));

        sortedList.forEach((item) => {
            const stockColor = item.quantity === 0 ? 'color: var(--danger-color) !important;' : '';
            let stockBadge = '';
            if (item.quantity === 0) {
                stockBadge = `<span class="stock-badge stock-badge-critical">Kritisch</span>`;
            } else if (item.quantity < LOW_STOCK_THRESHOLD) {
                stockBadge = `<span class="stock-badge stock-badge-low">Niedrig</span>`;
            }
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="material-name">${item.name}</td>
                <td class="current-stock" style="${stockColor}">${item.quantity}${stockBadge}</td>
                <td>
                    <div class="adjust-box">
                        <input type="number" id="stock-input-${item.id}" placeholder="Neuer Bestand" min="0" />
                        <button class="btn" onclick="updateStock(${item.id})">Bestätigen</button>
                    </div>
                </td>
                <td>
                    <button class="btn btn-danger delete-action" data-permission-action="delete" onclick="deleteStockItem(${item.id})">Löschen</button>
                </td>
                <td class="time-text">${item.stockupdated || '-'}</td>
            `;
            tbody.appendChild(tr);
        });

        updateLagerBadge();
    }

    async function updateStock(id) {
        const inputEl = document.getElementById(`stock-input-${id}`);
        const value = parseInt(inputEl.value, 10);
        if (isNaN(value) || value < 0) return alert("Bitte gültige Zahl eingeben.");

        const updatedTime = getCurrentTimeString();
        const { error } = await supabaseClient
            .from('inventory')
            .update({ quantity: value, stockupdated: updatedTime })
            .eq('id', id);

        if (!error) {
            const item = inventoryList.find(i => i.id === id);
            if (item) {
                const oldQty = item.quantity;
                item.quantity = value;
                item.stockupdated = updatedTime;
                renderStockTable();
                renderRecipes();
                renderOrders();
                if (typeof broadcastDataChange === 'function') await broadcastDataChange('inventory');
                logActivity('Lagerbestand', `Bestand von "${item.name}" geändert: ${oldQty} → ${value} Stk.`, `Artikel: ${item.name}\nBestand: ${oldQty} → ${value} Stk.`);
            }
        } else {
            alert("Fehler beim Aktualisieren: " + error.message);
        }
    }

    async function deleteStockItem(id) {
        if (!canDeleteTab('lagerbestand')) {
            showToast('Du hast für diesen Tab keine Löschrechte.', 'danger', 'Löschen nicht erlaubt');
            return;
        }
        if (await customConfirm("Artikel wirklich löschen?")) {
            const item = inventoryList.find(i => i.id === id);
            const { error } = await supabaseClient.from('inventory').delete().eq('id', id);
            if (!error) {
                inventoryList = inventoryList.filter(i => i.id !== id);
                renderStockTable();
                renderRecipes();
                renderOrders();
                if (typeof broadcastDataChange === 'function') await broadcastDataChange('inventory');
                logActivity('Lagerbestand', `Artikel "${item ? item.name : id}" aus dem Lager gelöscht`, `Artikel: ${item ? item.name : id}\nBestand: ${item ? item.qty : '-'} Stk.`);
            } else {
                alert("Fehler beim Löschen: " + error.message);
            }
        }
    }

    async function handleAddStockItem(event) {
        event.preventDefault();
        const nameInput = document.getElementById('stock-add-name');
        const qtyInput = document.getElementById('stock-add-qty');
        const name = capitalizeText(nameInput.value.trim());
        const qty = parseInt(qtyInput.value, 10);
        if (!name || isNaN(qty)) return;

        const updatedTime = getCurrentTimeString();
        const existing = inventoryList.find(i => i.name.toLowerCase() === name.toLowerCase());

        if (existing) {
            const oldQty = existing.quantity;
            const { error } = await supabaseClient
                .from('inventory')
                .update({ quantity: qty, stockupdated: updatedTime })
                .eq('id', existing.id);

            if (!error) {
                existing.quantity = qty;
                existing.stockupdated = updatedTime;
                if (typeof broadcastDataChange === 'function') await broadcastDataChange('inventory');
                logActivity('Lagerbestand', `Bestand von "${name}" geändert: ${oldQty} → ${qty} Stk.`, `Artikel: ${name}\nBestand: ${oldQty} → ${qty} Stk.`);
            }
        } else {
            const { data, error } = await supabaseClient
                .from('inventory')
                .insert([{ name, quantity: qty, stockupdated: updatedTime }])
                .select();

            if (!error && data) {
                inventoryList.push(data[0]);
                if (typeof broadcastDataChange === 'function') await broadcastDataChange('inventory');
                logActivity('Lagerbestand', `Neuer Artikel "${name}" mit Bestand ${qty} Stk. angelegt`, `Artikel: ${name}\nAnfangsbestand: ${qty} Stk.`);
            }
        }
        nameInput.value = '';
        qtyInput.value = '';
        renderStockTable();
        renderRecipes();
        renderOrders();
    }

    function updateOrderCustomerDropdown() {
        const selectEl = document.getElementById('order-customer-select');
        if (!selectEl) return;
        const currentSelected = selectEl.value;

        const customersFromPrices = customerPricesList.map(item => item.customerName);
        const allCustomers = [...new Set(customersFromPrices)].filter(c => c && c.trim() !== "").sort((a, b) => a.localeCompare(b, 'de'));

        selectEl.innerHTML = '<option value="">-- Kein Kunde gewählt --</option>';
        allCustomers.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.innerText = c;
            selectEl.appendChild(opt);
        });
        selectEl.value = allCustomers.includes(currentSelected) ? currentSelected : "";
    }

    function handleCustomerSelectChange() {
        const selectEl = document.getElementById('order-customer-select');
        const inputEl = document.getElementById('order-customer-input');
        if (selectEl && inputEl && selectEl.value) {
            inputEl.value = selectEl.value;
        }
    }

    function handleCustomerTextInput() {
        const selectEl = document.getElementById('order-customer-select');
        const inputEl = document.getElementById('order-customer-input');
        if (selectEl && inputEl) {
            const typedVal = inputEl.value.trim().toLowerCase();
            const matchingOption = [...selectEl.options].find(opt => opt.value.toLowerCase() === typedVal);
            if (matchingOption) {
                selectEl.value = matchingOption.value;
            } else {
                selectEl.value = "";
            }
        }
        updateOrderTotalsPreview();
    }
