    function updateOrderRecipeSelects() {
        const selects = document.querySelectorAll('.ord-name-select');
        const sortedRecipes = [...recipesList].sort((a, b) => a.outputName.localeCompare(b.outputName, 'de'));

        selects.forEach(select => {
            const currentValue = select.value;
            select.innerHTML = '<option value="" disabled selected>-- Artikel wählen --</option>';
            sortedRecipes.forEach(rec => {
                const opt = document.createElement('option');
                opt.value = rec.outputName;
                opt.innerText = rec.outputName;
                if (rec.outputName === currentValue) opt.selected = true;
                select.appendChild(opt);
            });
        });
    }

    function initOrderPositionInputs() {
        const container = document.getElementById('order-items-container');
        container.innerHTML = '';
        addOrderPositionInput();
    }

    function addOrderPositionInput(defaultName = "", defaultQty = "") {
        const container = document.getElementById('order-items-container');
        const div = document.createElement('div');
        div.className = 'order-item-row';
        
        const sortedRecipes = [...recipesList].sort((a, b) => a.outputName.localeCompare(b.outputName, 'de'));
        let optionsHtml = '<option value="" disabled selected>-- Artikel wählen --</option>';
        sortedRecipes.forEach(rec => {
            const isSelected = rec.outputName === defaultName ? 'selected' : '';
            optionsHtml += `<option value="${rec.outputName}" ${isSelected}>${rec.outputName}</option>`;
        });

        div.innerHTML = `
            <select class="ord-name-select" onchange="updateOrderTotalsPreview()" required style="flex:2;">
                ${optionsHtml}
            </select>
            <input type="number" class="ord-qty" placeholder="Anzahl" min="1" value="${defaultQty || 1}" oninput="updateOrderTotalsPreview()" required style="flex:1; max-width: 100px;" />
            <button type="button" class="btn btn-danger" onclick="this.parentElement.remove(); updateOrderTotalsPreview();" style="height: 40px;">✕</button>
        `;
        container.appendChild(div);
        updateOrderTotalsPreview();
    }

    function updateOrderTotalsPreview() {
        const subtotalEl = document.getElementById('order-preview-subtotal');
        const totalEl = document.getElementById('order-preview-total');
        const productionCostEl = document.getElementById('order-preview-production-cost');
        const discountInput = document.getElementById('order-discount-input');
        const customerInput = document.getElementById('order-customer-input');

        if (!subtotalEl || !totalEl || !productionCostEl) return;

        const customerName = customerInput ? customerInput.value.trim() : "";
        const rows = document.querySelectorAll('.order-item-row');
        let subtotal = 0;
        let totalProductionCost = 0;

        rows.forEach(row => {
            const nameSelect = row.querySelector('.ord-name-select');
            const qtyInput = row.querySelector('.ord-qty');
            if (nameSelect && qtyInput) {
                const itemName = nameSelect.value;
                const qty = parseInt(qtyInput.value, 10);
                if (itemName && !isNaN(qty) && qty > 0) {
                    const priceInfo = getPriceDetailsForCustomer(customerName, itemName);
                    subtotal += priceInfo.price * qty;

                    const unitCost = getRecipeCostPerUnit(itemName);
                    totalProductionCost += unitCost * qty;
                }
            }
        });

        let discountPercent = discountInput ? parseFloat(discountInput.value) || 0 : 0;
        let finalTotal = subtotal * (1 - (discountPercent / 100));

        subtotalEl.innerText = `$${subtotal.toFixed(2)}`;
        totalEl.innerText = `$${finalTotal.toFixed(2)}`;
        productionCostEl.innerText = `$${totalProductionCost.toFixed(2)}`;
    }

    async function handleAddOrder(event) {
        event.preventDefault();
        const rawCustomerName = document.getElementById('order-customer-input').value.trim();
        const customerName = rawCustomerName ? capitalizeText(rawCustomerName) : "Laufkundschaft";

        const discountInput = document.getElementById('order-discount-input');
        const discount = discountInput ? parseFloat(discountInput.value) || 0 : 0;

        const rows = document.querySelectorAll('.order-item-row');
        const items = [];

        rows.forEach(row => {
            const nameSelect = row.querySelector('.ord-name-select');
            const qtyInput = row.querySelector('.ord-qty');
            if (nameSelect && qtyInput) {
                const name = nameSelect.value;
                const qty = parseInt(qtyInput.value, 10);
                if (name && !isNaN(qty) && qty > 0) items.push({ name, qty, produced: false });
            }
        });

        if (items.length === 0) return alert("Mindestens einen Artikel aus dem Dropdown angeben.");

        const createdAt = getCurrentTimeString();
        const { data, error } = await supabaseClient
            .from('orders')
            .insert([{ customerName, createdAt, items, discount }])
            .select();

        if (!error && data) {
            ordersList.push(data[0]);
            document.getElementById('order-customer-input').value = '';
            if (discountInput) discountInput.value = '0';
            const selectEl = document.getElementById('order-customer-select');
            if (selectEl) selectEl.value = '';
            initOrderPositionInputs();
            updateOrderCustomerDropdown();
            renderOrders();
            updateOrderTotalsPreview();
            logActivity('Bestellung', `Neue Bestellung von "${customerName}" mit ${items.length} Position(en) erfasst`);
        } else {
            alert("Fehler beim Speichern der Bestellung: " + (error ? error.message : ''));
        }
    }

    async function toggleOrderProductionStatus(orderId, itemIndex, checkboxEl) {
        const order = ordersList.find(o => o.id === orderId);
        if (!order || !order.items[itemIndex]) return;

        order.items[itemIndex].produced = checkboxEl.checked;

        const { error } = await supabaseClient
            .from('orders')
            .update({ items: order.items })
            .eq('id', orderId);

        if (error) {
            alert("Fehler beim Aktualisieren des Produktionsstatus: " + error.message);
            checkboxEl.checked = !checkboxEl.checked;
            order.items[itemIndex].produced = checkboxEl.checked;
        } else {
            renderOrders();
            logActivity('Bestellung', `Produktionsstatus einer Bestellung geändert: ${checkboxEl.checked ? 'produziert' : 'nicht produziert'}`);
        }
    }

    async function deleteOrder(id) {
        if (!canDeleteTab('bestellungen')) {
            showToast('Du hast für diesen Tab keine Löschrechte.', 'danger', 'Löschen nicht erlaubt');
            return;
        }
        if (await customConfirm("Bestellung löschen?")) {
            const order = ordersList.find(o => o.id === id);
            const { error } = await supabaseClient.from('orders').delete().eq('id', id);
            if (!error) {
                ordersList = ordersList.filter(o => o.id !== id);
                updateOrderCustomerDropdown();
                renderOrders();
                logActivity('Bestellung', `Bestellung von "${order ? order.customerName : id}" gelöscht`);
            }
        }
    }

    async function fulfillOrder(orderId) {
        const orderIndex = ordersList.findIndex(o => o.id === orderId);
        if (orderIndex === -1) return;

        const order = ordersList[orderIndex];

        let subtotalSum = 0;
        let totalProductionCostSum = 0;

        const archivedItems = order.items.map(item => {
            const priceInfo = getPriceDetailsForCustomer(order.customerName, item.name);
            const itemTotal = priceInfo.price * item.qty;
            subtotalSum += itemTotal;

            const unitCost = getRecipeCostPerUnit(item.name);
            const itemProductionCost = unitCost * item.qty;
            totalProductionCostSum += itemProductionCost;

            return {
                name: item.name,
                qty: item.qty,
                price: priceInfo.price,
                priceType: priceInfo.type,
                total: itemTotal,
                productionCost: itemProductionCost
            };
        });

        let orderDiscount = order.discount !== undefined ? order.discount : 0;
        let totalSum = subtotalSum * (1 - (orderDiscount / 100));

        const deliveredAt = getCurrentTimeString();
        const archivedPayload = {
            id: order.id,
            customerName: order.customerName,
            items: archivedItems,
            totalSum: totalSum,
            totalProductionCost: totalProductionCostSum,
            createdAt: order.createdAt,
            deliveredAt: deliveredAt,
            soldBy: currentUser && currentUser.username ? currentUser.username : 'Unbekannt'
        };

        const { error: archiveError } = await supabaseClient.from('archive').insert([archivedPayload]);
        if (archiveError) {
            return alert("Fehler beim Archivieren: " + archiveError.message);
        }

        const { error: deleteError } = await supabaseClient.from('orders').delete().eq('id', orderId);
        if (deleteError) {
            return alert("Fehler beim Entfernen der aktiven Bestellung: " + deleteError.message);
        }

        archivedOrdersList.unshift(archivedPayload);
        ordersList.splice(orderIndex, 1);

        updateOrderCustomerDropdown();
        renderOrders();
        renderArchive();
        if (typeof renderMembersTable === 'function') renderMembersTable();
        logActivity('Bestellung', `Bestellung von "${order.customerName}" ausgeliefert und archiviert (Verkauft von: ${archivedPayload.soldBy}, Summe $${totalSum.toFixed(2)})`);
    }

    function renderOrders() {
        const tbody = document.getElementById('orders-table-body');
        tbody.innerHTML = '';
        if (ordersList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">Keine aktiven Bestellungen.</td></tr>`;
            return;
        }

        const sortedOrders = [...ordersList].sort((a, b) => b.id - a.id);

        sortedOrders.forEach(order => {
            const tr = document.createElement('tr');
            let itemsHtml = '';
            let allOk = true;
            let subtotalOrderSum = 0;
            let totalProductionCostSum = 0;

            let rawMaterialMap = {};

            order.items.forEach((ordItem, idx) => {
                const available = getStockAmount(ordItem.name);
                const isEnough = available >= ordItem.qty;
                if (!isEnough) allOk = false;

                const priceInfo = getPriceDetailsForCustomer(order.customerName, ordItem.name);
                const itemTotal = priceInfo.price * ordItem.qty;
                subtotalOrderSum += itemTotal;

                const unitCost = getRecipeCostPerUnit(ordItem.name);
                totalProductionCostSum += unitCost * ordItem.qty;

                let badgeColor = priceInfo.type === 'Sonderpreis' ? 'var(--accent-blue)' : 'var(--accent-gray)';
                let isChecked = ordItem.produced ? 'checked' : '';
                let textDecoration = ordItem.produced ? 'text-decoration: line-through; opacity: 0.7;' : '';

                itemsHtml += `
                    <div style="margin-bottom: 6px; display: flex; align-items: center; gap: 8px; ${textDecoration}">
                        <input type="checkbox" ${isChecked} onchange="toggleOrderProductionStatus(${order.id}, ${idx}, this)" title="Artikel fertig produziert" style="width: 16px; height: 16px; cursor: pointer;" />
                        <span>• <strong>${ordItem.qty}x</strong> ${ordItem.name} à $${priceInfo.price.toFixed(2)} 
                        <span style="font-size: 0.75rem; background: ${badgeColor}22; color: ${badgeColor}; padding: 1px 6px; border-radius: 4px; border: 1px solid ${badgeColor};">${priceInfo.type}</span> = 
                        <span style="color: var(--accent-green); font-weight: 600;">$${itemTotal.toFixed(2)}</span> 
                        <span style="font-size: 0.8rem; color: var(--text-muted);">(Lager: <span style="color: ${isEnough ? 'var(--accent-green)' : 'var(--accent-red)'}">${available}</span>)</span></span>
                    </div>`;

                resolveRawMaterials(ordItem.name, ordItem.qty, rawMaterialMap);
            });

            let orderDiscount = order.discount !== undefined ? order.discount : 0;
            let finalOrderSum = subtotalOrderSum * (1 - (orderDiscount / 100));

            if (orderDiscount > 0) {
                itemsHtml += `<div style="margin-top: 6px; font-size: 0.85rem; color: var(--text-muted);">Zwischensumme: $${subtotalOrderSum.toFixed(2)} (abzgl. ${orderDiscount}% Rabatt)</div>`;
            }
            itemsHtml += `<div style="margin-top: 4px; border-top: 1px solid var(--border-color); padding-top: 6px; font-weight: 700; color: #f59e0b;">Der Kunde bezahlt die Gesamtsumme der Bestellung: $${finalOrderSum.toFixed(2)}</div>`;
            itemsHtml += `<div style="margin-top: 4px; font-weight: 700; color: #ef4444;">Die Herstellungskosten werden in die Kasse eingezahlt: $${totalProductionCostSum.toFixed(2)}</div>`;

            let rawMaterialsHtml = '';
            const rawKeys = Object.keys(rawMaterialMap);
            if (rawKeys.length > 0) {
                rawKeys.forEach(matName => {
                    let reqQty = rawMaterialMap[matName];
                    let stockQty = getStockAmount(matName);
                    let hasEnoughMat = stockQty >= reqQty;
                    if (!hasEnoughMat) allOk = false;

                    let stockColorStyle = stockQty === 0 ? 'color: var(--danger-color); font-weight: bold;' : (hasEnoughMat ? 'var(--accent-green)' : 'var(--accent-red)');
                    rawMaterialsHtml += `<div>• <strong>${reqQty}x</strong> ${matName} <span style="font-size: 0.8rem; color: var(--text-muted);">(Lager: <span style="color: ${stockColorStyle}">${stockQty}</span>)</span></div>`;
                });
            } else {
                rawMaterialsHtml = `<span style="color: var(--text-muted); font-style: italic;">Keine Rohmaterialien definiert</span>`;
            }

            let statusHtml = buildStatusBadge(allOk, 'Alles im Lager', 'Material fehlt');

            tr.innerHTML = `
                <td><div class="material-name" style="color: var(--accent-blue); font-size: 1.05rem;">${order.customerName}</div></td>
                <td><div style="font-size: 0.9rem; line-height: 1.4;">${itemsHtml}</div></td>
                <td><div style="font-size: 0.9rem; line-height: 1.4;">${rawMaterialsHtml}</div></td>
                <td class="time-text">${order.createdAt || '-'}</td>
                <td>${statusHtml}</td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-success" onclick="fulfillOrder(${order.id})">Ausliefern</button>
                        <button class="btn btn-danger delete-action" data-permission-action="delete" onclick="deleteOrder(${order.id})">Löschen</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    function splitDateTimeDisplay(value) {
        // Format aus getCurrentTimeString(): "1. August 2026, 17:42 Uhr"
        if (!value) return '-';
        const commaIndex = value.lastIndexOf(', ');
        if (commaIndex === -1) return value;
        const datePart = value.slice(0, commaIndex);
        const timePart = value.slice(commaIndex + 2);
        return `${datePart}<br><span>${timePart}</span>`;
    }

    function getArchiveOrderDate(order) {
        const rawValue = order && (order.deliveredAt || order.createdAt);
        if (!rawValue) return null;

        if (rawValue instanceof Date && !Number.isNaN(rawValue.getTime())) return rawValue;

        const value = String(rawValue).trim();
        if (!value) return null;

        if (!Number.isNaN(Date.parse(value))) {
            const parsed = new Date(value);
            if (!Number.isNaN(parsed.getTime())) return parsed;
        }

        const germanMatch = value.match(/^(\d{1,2})\.\s*([A-Za-zäöüÄÖÜ]+)\s+(\d{4}),\s*(\d{2}):(\d{2})(?:\s*Uhr)?$/);
        if (germanMatch) {
            const monthMap = {
                Januar: 0,
                Februar: 1,
                März: 2,
                April: 3,
                Mai: 4,
                Juni: 5,
                Juli: 6,
                August: 7,
                September: 8,
                Oktober: 9,
                November: 10,
                Dezember: 11,
                Jan: 0,
                Feb: 1,
                Mar: 2,
                Apr: 3,
                Jun: 5,
                Jul: 6,
                Aug: 7,
                Sep: 8,
                Okt: 9,
                Nov: 10,
                Dez: 11
            };
            const month = monthMap[germanMatch[2]];
            if (month !== undefined) {
                const dateObj = new Date(Number(germanMatch[3]), month, Number(germanMatch[1]), Number(germanMatch[4]), Number(germanMatch[5]));
                if (!Number.isNaN(dateObj.getTime())) return dateObj;
            }
        }

        return null;
    }

    function getWeekNumber(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const day = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - day);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return week;
    }

    function getWeekRange(date) {
        const target = new Date(date);
        target.setHours(0, 0, 0, 0);
        const day = (target.getDay() + 6) % 7;
        const start = new Date(target);
        start.setDate(target.getDate() - day);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        return {
            key: `${start.getFullYear()}-W${String(getWeekNumber(start)).padStart(2, '0')}`,
            start,
            end,
            label: `KW ${getWeekNumber(start)}`
        };
    }

    function groupArchivedOrdersByWeek(orders) {
        const grouped = new Map();

        orders.forEach(order => {
            const orderDate = getArchiveOrderDate(order) || new Date();
            const week = getWeekRange(orderDate);
            const key = week.key;

            if (!grouped.has(key)) {
                grouped.set(key, {
                    key,
                    start: week.start,
                    end: week.end,
                    label: week.label,
                    orders: []
                });
            }

            grouped.get(key).orders.push(order);
        });

        return [...grouped.values()].sort((a, b) => b.start.getTime() - a.start.getTime());
    }

    function formatWeekRangeLabel(group) {
        const start = group.start;
        const end = group.end;
        return `${group.label} · ${start.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })} bis ${end.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
    }

    function renderArchive() {
        const tbody = document.getElementById('archive-table-body');
        const summaryBox = document.getElementById('archive-summary-box');
        const totalSumEl = document.getElementById('archive-total-sum');
        const totalCostEl = document.getElementById('archive-total-cost');
        
        tbody.innerHTML = '';

        if (archivedOrdersList.length > 0) {
            let combinedSum = 0;
            let combinedCost = 0;

            archivedOrdersList.forEach(archivedOrder => {
                combinedSum += archivedOrder.totalSum || 0;
                
                let orderProdCost = 0;
                if (archivedOrder.totalProductionCost !== undefined && archivedOrder.totalProductionCost !== null) {
                    orderProdCost = archivedOrder.totalProductionCost;
                } else {
                    archivedOrder.items.forEach(item => {
                        if (item.productionCost !== undefined && item.productionCost !== null) {
                            orderProdCost += item.productionCost;
                        } else {
                            orderProdCost += getRecipeCostPerUnit(item.name) * item.qty;
                        }
                    });
                }
                combinedCost += orderProdCost;
            });

            totalSumEl.innerText = `$${combinedSum.toFixed(2)}`;
            totalCostEl.innerText = `$${combinedCost.toFixed(2)}`;
            summaryBox.style.display = 'flex';
        } else {
            summaryBox.style.display = 'none';
        }

        if (archivedOrdersList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 20px;">Noch keine ausgelieferten Bestellungen im Archiv.</td></tr>`;
            return;
        }

        const groupedOrders = groupArchivedOrdersByWeek(archivedOrdersList);

        groupedOrders.forEach(group => {
            const groupTotal = group.orders.reduce((sum, order) => sum + (Number(order.totalSum) || 0), 0);
            const groupCost = group.orders.reduce((sum, order) => {
                if (order.totalProductionCost !== undefined && order.totalProductionCost !== null) return sum + (Number(order.totalProductionCost) || 0);
                return sum + order.items.reduce((itemSum, item) => itemSum + ((item.productionCost !== undefined && item.productionCost !== null) ? Number(item.productionCost) || 0 : (Number(getRecipeCostPerUnit(item.name)) || 0) * (Number(item.qty) || 0)), 0);
            }, 0);

            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="8">
                    <details class="archive-week-folder" open>
                        <summary>
                            <span class="archive-week-title">${formatWeekRangeLabel(group)}</span>
                            <span class="archive-week-meta">${group.orders.length} Bestellung${group.orders.length === 1 ? '' : 'en'} · Gesamt $${groupTotal.toFixed(2)} · Kosten $${groupCost.toFixed(2)}</span>
                        </summary>
                        <div class="archive-week-body">
                            <table class="archive-week-orders-table">
                                <thead>
                                    <tr>
                                        <th>Kunde</th>
                                        <th>Positionen</th>
                                        <th>Gesamt</th>
                                        <th>Herstellungskosten</th>
                                        <th>Erstellt</th>
                                        <th>Ausgeliefert</th>
                                        <th>Verkauft von</th>
                                        <th>Aktion</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${group.orders.map(archivedOrder => {
                                        let itemsHtml = '';
                                        let totalProdCost = 0;
                                        if (archivedOrder.totalProductionCost !== undefined && archivedOrder.totalProductionCost !== null) {
                                            totalProdCost = archivedOrder.totalProductionCost;
                                        } else {
                                            archivedOrder.items.forEach(item => {
                                                if (item.productionCost !== undefined && item.productionCost !== null) {
                                                    totalProdCost += item.productionCost;
                                                } else {
                                                    totalProdCost += getRecipeCostPerUnit(item.name) * item.qty;
                                                }
                                            });
                                        }

                                        archivedOrder.items.forEach(item => {
                                            let badgeColor = item.priceType === 'Sonderpreis' ? 'var(--accent-blue)' : 'var(--accent-gray)';
                                            itemsHtml += `<div style="margin-bottom: 4px;">• <strong>${item.qty}x</strong> ${item.name} à $${item.price.toFixed(2)} <span style="font-size: 0.75rem; background: ${badgeColor}22; color: ${badgeColor}; padding: 1px 6px; border-radius: 4px; border: 1px solid ${badgeColor};">${item.priceType}</span> = <span style="color: var(--accent-green); font-weight: 600;">$${item.total.toFixed(2)}</span></div>`;
                                        });

                                        return `
                                            <tr>
                                                <td><div class="material-name" style="color: var(--accent-blue); font-size: 1.05rem;">${archivedOrder.customerName}</div></td>
                                                <td><div style="font-size: 0.9rem; line-height: 1.4;">${itemsHtml}</div></td>
                                                <td><span class="current-price">$${(Number(archivedOrder.totalSum) || 0).toFixed(2)}</span></td>
                                                <td><span class="current-cost">$${totalProdCost.toFixed(2)}</span></td>
                                                <td class="time-text">${splitDateTimeDisplay(archivedOrder.createdAt)}</td>
                                                <td class="time-text">${splitDateTimeDisplay(archivedOrder.deliveredAt)}</td>
                                                <td class="time-text">${renderUsernameWithAvatar(archivedOrder.soldBy || '-', null, { size: 'small' })}</td>
                                                <td>
                                                    <button class="btn btn-danger delete-action" data-permission-action="delete" onclick="deleteArchivedOrder(${archivedOrder.id})">Eintrag löschen</button>
                                                </td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </details>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    async function deleteArchivedOrder(id) {
        if (!canDeleteTab('archiv')) {
            showToast('Du hast für diesen Tab keine Löschrechte.', 'danger', 'Löschen nicht erlaubt');
            return;
        }
        if (await customConfirm("Archivierte Bestellung löschen?")) {
            const { error } = await supabaseClient.from('archive').delete().eq('id', id);
            if (!error) {
                archivedOrdersList = archivedOrdersList.filter(o => o.id !== id);
                renderArchive();
                if (typeof renderMembersTable === 'function') renderMembersTable();
                logActivity('Archiv', `Archivierter Auftrag "${id}" wurde gelöscht.`);
            }
        }
    }

    async function clearArchive() {
        if (!canDeleteTab('archiv')) {
            showToast('Du hast für diesen Tab keine Löschrechte.', 'danger', 'Löschen nicht erlaubt');
            return;
        }
        if (archivedOrdersList.length === 0) return alert("Das Archiv ist bereits leer.");
        if (await customConfirm("Möchtest du wirklich das gesamte Archiv leeren?")) {
            const { error } = await supabaseClient.from('archive').delete().neq('id', 0);
            if (!error) {
                archivedOrdersList = [];
                renderArchive();
                if (typeof renderMembersTable === 'function') renderMembersTable();
                logActivity('Archiv', 'Das komplette Archiv wurde geleert.');
            }
        }
    }

    function updateCustomerFilterOptions() {
        const filterSelect = document.getElementById('customer-filter');
        const businessFilterSelect = document.getElementById('customer-business-filter');
        
        if (!filterSelect || !businessFilterSelect) return;

        const currentSelectedCustomer = filterSelect.value;
        const currentSelectedBusiness = businessFilterSelect.value;

        const customers = [...new Set(customerPricesList.map(item => item.customerName))].filter(c => c && c.trim() !== "").sort((a, b) => a.localeCompare(b, 'de'));
        const businesses = [...new Set(customerPricesList.map(item => item.business))].filter(b => b && b.trim() !== "").sort((a, b) => a.localeCompare(b, 'de'));

        filterSelect.innerHTML = '<option value="ALL">Alle Kunden anzeigen</option>';
        customers.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.innerText = c;
            filterSelect.appendChild(opt);
        });
        filterSelect.value = customers.includes(currentSelectedCustomer) ? currentSelectedCustomer : "ALL";

        businessFilterSelect.innerHTML = '<option value="ALL">Alle Gewerbe anzeigen</option>';
        businesses.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b;
            opt.innerText = b;
            businessFilterSelect.appendChild(opt);
        });
        businessFilterSelect.value = businesses.includes(currentSelectedBusiness) ? currentSelectedBusiness : "ALL";
    }

