    function updateShoppingBusinessFilterOptions() {
        const filterSelect = document.getElementById('shopping-business-filter');
        if (!filterSelect) return;
        const currentSelected = filterSelect.value;
        const businesses = [...new Set(purchasePricesList.map(item => item.business))].sort((a, b) => a.localeCompare(b, 'de'));

        filterSelect.innerHTML = '<option value="ALL">Alle Gewerbe anzeigen</option>';
        businesses.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b;
            opt.innerText = b;
            filterSelect.appendChild(opt);
        });
        filterSelect.value = businesses.includes(currentSelected) ? currentSelected : "ALL";
    }

    function updateShoppingQty(purchaseItemId, inputEl) {
        let val = parseInt(inputEl.value, 10);
        if (isNaN(val) || val < 0) val = 0;
        
        if (val === 0) {
            delete shoppingListQuantities[purchaseItemId];
        } else {
            shoppingListQuantities[purchaseItemId] = val;
        }

        const item = purchasePricesList.find(i => i.id === purchaseItemId);
        const itemTotalEl = document.getElementById(`shop-item-total-${purchaseItemId}`);
        if (item && itemTotalEl) {
            const itemTotal = val * item.cost;
            itemTotalEl.innerText = `$${itemTotal.toFixed(2)}`;
        }

        updateShoppingTotalSum();
    }

    function updateShoppingTotalSum() {
        let totalSum = 0;
        purchasePricesList.forEach(item => {
            const qty = shoppingListQuantities[item.id] || 0;
            totalSum += qty * item.cost;
        });
        const totalSumEl = document.getElementById('shopping-total-sum');
        if (totalSumEl) {
            totalSumEl.innerText = `$${totalSum.toFixed(2)}`;
        }
    }

    function clearShoppingList() {
        const hadQuantities = Object.values(shoppingListQuantities).some(q => Number(q) > 0);
        shoppingListQuantities = {};
        renderShoppingList();
        if (hadQuantities) {
            showToast('Alle eingetragenen Einkaufsmengen wurden zurückgesetzt.', 'success', 'Einkaufsliste geändert');
        }
    }

    function renderShoppingList() {
        const tbody = document.getElementById('shopping-list-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const selectedFilter = document.getElementById('shopping-business-filter').value;
        let filteredList = purchasePricesList;
        if (selectedFilter !== "ALL") {
            filteredList = purchasePricesList.filter(item => item.business === selectedFilter);
        }

        const sortedList = [...filteredList].sort((a, b) => a.name.localeCompare(b.name, 'de'));

        if (sortedList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">Keine Einkaufspreise für dieses Gewerbe hinterlegt.</td></tr>`;
            updateShoppingTotalSum();
            return;
        }

        sortedList.forEach(item => {
            const currentQty = shoppingListQuantities[item.id] || '';
            const itemTotal = (shoppingListQuantities[item.id] || 0) * item.cost;
            const costClass = item.cost === 0 ? "current-cost zero-cost" : "current-cost";

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="material-name">${item.name}</td>
                <td><span class="business-badge">${item.business}</span></td>
                <td><span class="${costClass}">$${item.cost.toFixed(2)}</span></td>
                <td>
                    <input type="number" min="0" placeholder="Menge" value="${currentQty}" oninput="updateShoppingQty(${item.id}, this)" style="width: 120px;" />
                </td>
                <td><span id="shop-item-total-${item.id}" class="current-price">$${itemTotal.toFixed(2)}</span></td>
            `;
            tbody.appendChild(tr);
        });

        updateShoppingTotalSum();
    }

