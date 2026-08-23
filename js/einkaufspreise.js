    function renderCostTable() {
        const tbody = document.getElementById('costs-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        const selectedFilter = document.getElementById('business-filter').value;

        let filteredList = purchasePricesList;
        if (selectedFilter !== "ALL") filteredList = purchasePricesList.filter(item => item.business === selectedFilter);
        const sortedList = [...filteredList].sort((a, b) => a.name.localeCompare(b.name, 'de'));

        if (sortedList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">Keine Einträge.</td></tr>`;
            return;
        }

        sortedList.forEach((item) => {
            const costClass = item.cost === 0 ? "current-cost zero-cost" : "current-cost";
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="material-name">${item.name}</td>
                <td><span class="business-badge">${item.business}</span></td>
                <td><span class="${costClass}">$${item.cost.toFixed(2)}</span></td>
                <td>
                    <div class="adjust-box">
                        <input type="number" step="0.01" id="cost-input-${item.id}" placeholder="Preis ($)" min="0" style="width: 130px;" />
                        <button class="btn" onclick="updateCost(${item.id})">Speichern</button>
                    </div>
                </td>
                <td><button class="btn btn-danger delete-action" data-permission-action="delete" onclick="deletePurchaseItem(${item.id})">Löschen</button></td>
                <td class="time-text">${item.costUpdated || '-'}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    async function updateCost(id) {
        const inputCostEl = document.getElementById(`cost-input-${id}`);
        const costValue = parseFloat(inputCostEl.value);

        const item = purchasePricesList.find(i => i.id === id);
        if (item) {
            if (!isNaN(costValue) && costValue >= 0) {
                const costUpdated = getCurrentTimeString();
                const oldCost = item.cost;
                const updatePayload = { cost: costValue, costUpdated };

                const { error } = await supabaseClient
                    .from('purchase_prices')
                    .update(updatePayload)
                    .eq('id', id);

                if (!error) {
                    item.cost = costValue;
                    item.costUpdated = costUpdated;
                    inputCostEl.value = '';
                    renderCostTable();
                    renderProductionCostsTable();
                    renderCalculatedPricesTable();
                    renderPriceTable();
                    logActivity('Einkaufspreis', `Einkaufspreis von "${item.name}" (${item.business}) geändert: $${Number(oldCost).toFixed(2)} → $${costValue.toFixed(2)}`);
                } else {
                    alert("Fehler beim Aktualisieren: " + error.message);
                }
            } else {
                alert("Bitte einen gültigen Preis eingeben.");
            }
        }
    }

    async function deletePurchaseItem(id) {
        if (!canDeleteTab('einkaufspreise')) {
            showToast('Du hast für diesen Tab keine Löschrechte.', 'danger', 'Löschen nicht erlaubt');
            return;
        }
        if (await customConfirm("Eintrag löschen?")) {
            const item = purchasePricesList.find(i => i.id === id);
            const { error } = await supabaseClient.from('purchase_prices').delete().eq('id', id);
            if (!error) {
                purchasePricesList = purchasePricesList.filter(i => i.id !== id);
                updateBusinessFilterOptions();
                renderCostTable();
                updateShoppingBusinessFilterOptions();
                renderShoppingList();
                renderProductionCostsTable();
                renderCalculatedPricesTable();
                renderPriceTable();
                logActivity('Einkaufspreis', `Einkaufspreis für "${item ? item.name : id}" gelöscht`);
            }
        }
    }

    async function handleAddPurchaseItem(event) {
        event.preventDefault();
        const nameInput = document.getElementById('cost-add-name');
        const businessInput = document.getElementById('cost-add-business');
        const costInput = document.getElementById('cost-add-cost');

        const name = capitalizeText(nameInput.value.trim());
        const business = capitalizeText(businessInput.value.trim());
        const cost = parseFloat(costInput.value);

        if (!name || !business || isNaN(cost)) return;

        const costUpdated = getCurrentTimeString();
        const existing = purchasePricesList.find(i => i.name.toLowerCase() === name.toLowerCase() && i.business.toLowerCase() === business.toLowerCase());

        if (existing) {
            const oldCost = existing.cost;
            const { error } = await supabaseClient
                .from('purchase_prices')
                .update({ cost, costUpdated })
                .eq('id', existing.id);

            if (!error) {
                existing.cost = cost;
                existing.costUpdated = costUpdated;
                logActivity('Einkaufspreis', `Einkaufspreis von "${name}" (${business}) geändert: $${Number(oldCost).toFixed(2)} → $${cost.toFixed(2)}`);
            }
        } else {
            const { data, error } = await supabaseClient
                .from('purchase_prices')
                .insert([{ name, business, cost, costUpdated }])
                .select();

            if (!error && data) {
                purchasePricesList.push(data[0]);
                logActivity('Einkaufspreis', `Neuer Einkaufspreis für "${name}" bei "${business}" angelegt: $${cost.toFixed(2)}`);
            }
        }

        nameInput.value = '';
        businessInput.value = '';
        costInput.value = '';
        updateBusinessFilterOptions();
        renderCostTable();
        updateShoppingBusinessFilterOptions();
        renderShoppingList();
        renderProductionCostsTable();
        renderCalculatedPricesTable();
        renderPriceTable();
    }

