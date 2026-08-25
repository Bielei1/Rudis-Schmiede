// ============ VERKAUFSRECHNER ============
// Nutzt Rezepte als Produktliste und die Standard-Verkaufspreise als VK.

let salesCalculatorCart = {};
let salesCalculatorSelectedItem = null;
let salesCalculatorQuantityBuffer = '';

function escapeSalesCalculatorHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
}

function getSalesCalculatorPrice(itemName) {
    const priceItem = (salesPricesList || []).find(item =>
        item.name && item.name.toLowerCase() === String(itemName).toLowerCase()
    );
    return priceItem ? Number(priceItem.price) || 0 : 0;
}

function getSalesCalculatorProducts() {
    const seen = new Set();
    return [...(recipesList || [])]
        .filter(recipe => recipe && recipe.outputName)
        .filter(recipe => {
            const key = recipe.outputName.trim().toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => a.outputName.localeCompare(b.outputName, 'de'));
}

function renderSalesCalculatorProducts() {
    const container = document.getElementById('sales-calculator-products');
    const countEl = document.getElementById('sales-calculator-count');
    if (!container) return;

    const products = getSalesCalculatorProducts();
    if (countEl) countEl.textContent = `${products.length} Artikel`;

    if (!products.length) {
        container.innerHTML = '<div class="sales-calculator-empty">Keine herstellbaren Artikel vorhanden. Lege zuerst ein Rezept im Tab „Herstellung“ an.</div>';
        return;
    }

    container.innerHTML = products.map((recipe, index) => {
        const price = getSalesCalculatorPrice(recipe.outputName);
        const cost = typeof getRecipeCostPerUnit === 'function' ? getRecipeCostPerUnit(recipe.outputName) : 0;
        const hasPrice = price > 0;
        return `
            <button type="button" class="sales-product-card" data-sales-product-index="${index}">
                <span class="sales-product-name">${escapeSalesCalculatorHtml(recipe.outputName)}</span>
                <span class="sales-product-meta">${recipe.outputQty || 1} Stk. je Rezept</span>
                <span class="sales-product-price ${hasPrice ? '' : 'sales-price-missing'}">${hasPrice ? `$${price.toFixed(2)} / Stk.` : 'Kein VK hinterlegt'}</span>
                ${cost > 0 ? `<span class="sales-product-cost">Herstellung: $${cost.toFixed(2)}</span>` : ''}
            </button>`;
    }).join('');

    container.querySelectorAll('[data-sales-product-index]').forEach(card => {
        card.addEventListener('click', () => {
            const product = products[Number(card.dataset.salesProductIndex)];
            if (product) openSalesQuantityModal(product.outputName);
        });
    });
}

function openSalesQuantityModal(itemName) {
    const price = getSalesCalculatorPrice(itemName);
    if (price <= 0) {
        showToast(`Für „${itemName}“ ist noch kein Verkaufspreis hinterlegt.`, 'warning', 'Kein Verkaufspreis');
        return;
    }

    salesCalculatorSelectedItem = itemName;
    // Wichtig: bewusst leer starten, nicht mit 1.
    salesCalculatorQuantityBuffer = '';

    const title = document.getElementById('sales-modal-title');
    const priceEl = document.getElementById('sales-modal-price');
    if (title) title.textContent = itemName;
    if (priceEl) priceEl.textContent = `$${price.toFixed(2)} / Stk.`;
    updateSalesQuantityDisplay();

    const modal = document.getElementById('sales-quantity-modal');
    if (modal) {
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
    }
}

function closeSalesQuantityModal() {
    const modal = document.getElementById('sales-quantity-modal');
    if (modal) {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
    }
    salesCalculatorSelectedItem = null;
    salesCalculatorQuantityBuffer = '';
}

function updateSalesQuantityDisplay() {
    const display = document.getElementById('sales-quantity-display');
    if (display) display.textContent = salesCalculatorQuantityBuffer;
}

function salesKeypadPress(value) {
    value = String(value);
    if (!/^\d$/.test(value)) return;
    if (salesCalculatorQuantityBuffer.length >= 4) return;
    if (salesCalculatorQuantityBuffer === '' && value === '0') return;
    salesCalculatorQuantityBuffer += value;
    updateSalesQuantityDisplay();
}

function salesKeypadClear() {
    salesCalculatorQuantityBuffer = '';
    updateSalesQuantityDisplay();
}

function salesKeypadBackspace() {
    salesCalculatorQuantityBuffer = salesCalculatorQuantityBuffer.slice(0, -1);
    updateSalesQuantityDisplay();
}

function confirmSalesQuantity() {
    if (!salesCalculatorSelectedItem) return;
    const quantity = parseInt(salesCalculatorQuantityBuffer, 10);
    if (!Number.isFinite(quantity) || quantity < 1) {
        showToast('Bitte zuerst eine Menge eingeben.', 'warning', 'Menge fehlt');
        return;
    }

    const key = salesCalculatorSelectedItem.toLowerCase();
    if (salesCalculatorCart[key]) {
        salesCalculatorCart[key].quantity += quantity;
    } else {
        salesCalculatorCart[key] = {
            name: salesCalculatorSelectedItem,
            quantity,
            unitPrice: getSalesCalculatorPrice(salesCalculatorSelectedItem)
        };
    }

    closeSalesQuantityModal();
    renderSalesCalculatorCart();
}

function changeSalesCartQuantity(key, delta) {
    const item = salesCalculatorCart[key];
    if (!item) return;
    item.quantity += delta;
    if (item.quantity <= 0) delete salesCalculatorCart[key];
    renderSalesCalculatorCart();
}

function removeSalesCartItem(key) {
    if (!salesCalculatorCart[key]) return;
    delete salesCalculatorCart[key];
    renderSalesCalculatorCart();
}

function clearSalesCalculatorCart() {
    salesCalculatorCart = {};
    const discountInput = document.getElementById('sales-cart-discount');
    if (discountInput) discountInput.value = '0';
    renderSalesCalculatorCart();
}

function getSalesCalculatorTotals() {
    const items = Object.values(salesCalculatorCart);
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const productionCostTotal = items.reduce((sum, item) => {
        const unitCost = typeof getRecipeCostPerUnit === 'function' ? Number(getRecipeCostPerUnit(item.name)) || 0 : 0;
        return sum + item.quantity * unitCost;
    }, 0);

    const discountInput = document.getElementById('sales-cart-discount');
    let discountPercent = discountInput ? parseFloat(discountInput.value) : 0;
    if (!Number.isFinite(discountPercent)) discountPercent = 0;
    discountPercent = Math.min(100, Math.max(0, discountPercent));
    if (discountInput) discountInput.value = discountPercent;

    const discountValue = subtotal * discountPercent / 100;
    const total = subtotal - discountValue;
    return { subtotal, productionCostTotal, discountPercent, discountValue, total };
}

function updateSalesCalculatorTotals() {
    const totals = getSalesCalculatorTotals();
    const setMoney = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = `$${value.toFixed(2)}`;
    };

    setMoney('sales-cart-subtotal', totals.subtotal);
    setMoney('sales-cart-production-cost', totals.productionCostTotal);
    setMoney('sales-cart-discount-value', -totals.discountValue);
    setMoney('sales-cart-total', totals.total);

    const hasItems = Object.keys(salesCalculatorCart).length > 0;
    const saveButton = document.querySelector('.sales-cart-save-btn');
    const soldButton = document.querySelector('.sales-cart-sold-btn');
    if (saveButton) saveButton.disabled = !hasItems;
    if (soldButton) soldButton.disabled = !hasItems;
}

function renderSalesCalculatorCart() {
    const container = document.getElementById('sales-cart-items');
    const countEl = document.getElementById('sales-cart-item-count');
    if (!container) return;

    const items = Object.entries(salesCalculatorCart);
    const positionCount = items.reduce((sum, [, item]) => sum + item.quantity, 0);
    if (countEl) countEl.textContent = `${positionCount} ${positionCount === 1 ? 'Position' : 'Positionen'}`;

    if (!items.length) {
        container.innerHTML = '<div class="sales-cart-empty">Noch keine Artikel im Warenkorb.<br><span>Klicke links auf einen Artikel.</span></div>';
        updateSalesCalculatorTotals();
        return;
    }

    container.innerHTML = items.map(([key, item]) => {
        const lineTotal = item.quantity * item.unitPrice;
        return `
            <div class="sales-cart-item">
                <div class="sales-cart-item-main">
                    <strong>${escapeSalesCalculatorHtml(item.name)}</strong>
                    <span>$${item.unitPrice.toFixed(2)} × ${item.quantity}</span>
                </div>
                <div class="sales-cart-item-actions" data-sales-cart-key="${escapeSalesCalculatorHtml(key)}">
                    <button type="button" data-action="minus" aria-label="Menge verringern">−</button>
                    <span class="sales-cart-qty">${item.quantity}</span>
                    <button type="button" data-action="plus" aria-label="Menge erhöhen">+</button>
                    <strong>$${lineTotal.toFixed(2)}</strong>
                    <button type="button" class="sales-remove-btn" data-action="remove" aria-label="Artikel entfernen">×</button>
                </div>
            </div>`;
    }).join('');

    // Event-Delegation auf dem Warenkorb: funktioniert auch nach jedem Neurendern.
    container.querySelectorAll('[data-sales-cart-key]').forEach(actions => {
        actions.addEventListener('click', event => {
            const button = event.target.closest('button[data-action]');
            if (!button) return;
            const key = actions.dataset.salesCartKey;
            if (button.dataset.action === 'minus') changeSalesCartQuantity(key, -1);
            if (button.dataset.action === 'plus') changeSalesCartQuantity(key, 1);
            if (button.dataset.action === 'remove') removeSalesCartItem(key);
        });
    });

    updateSalesCalculatorTotals();
}

function getSalesCartOrderItems() {
    return Object.values(salesCalculatorCart).map(item => ({
        name: item.name,
        qty: item.quantity,
        produced: false
    }));
}

async function saveSalesCartAsOrder() {
    const items = getSalesCartOrderItems();
    if (!items.length) return showToast('Der Warenkorb ist leer.', 'warning', 'Keine Artikel');

    const totals = getSalesCalculatorTotals();
    const button = document.querySelector('.sales-cart-save-btn');
    if (button) button.disabled = true;

    try {
        const payload = {
            customerName: 'Warenkorb',
            createdAt: getCurrentTimeString(),
            items,
            discount: totals.discountPercent
        };
        const { data, error } = await supabaseClient.from('orders').insert([payload]).select();
        if (error) throw error;

        if (data && data[0]) {
            ordersList.push(data[0]);
            updateOrderCustomerDropdown();
            renderOrders();
        }

        logActivity('Bestellung', `Warenkorb wurde von „${currentUser ? currentUser.username : 'Unbekannt'}“ als Bestellung aufgenommen ($${totals.total.toFixed(2)})`);
        clearSalesCalculatorCart();
        showToast('Warenkorb wurde bei den Bestellungen aufgenommen.', 'success', 'Bestellung aufgenommen');
    } catch (error) {
        showToast('Fehler beim Aufnehmen des Warenkorbs: ' + error.message, 'danger', 'Änderung nicht durchgeführt');
        if (button) button.disabled = false;
    }
}

async function sellSalesCart() {
    const items = Object.values(salesCalculatorCart);
    if (!items.length) return showToast('Der Warenkorb ist leer.', 'warning', 'Keine Artikel');

    const totals = getSalesCalculatorTotals();
    const button = document.querySelector('.sales-cart-sold-btn');
    if (button) button.disabled = true;

    try {
        const archivedItems = items.map(item => {
            const unitCost = typeof getRecipeCostPerUnit === 'function' ? Number(getRecipeCostPerUnit(item.name)) || 0 : 0;
            return {
                name: item.name,
                qty: item.quantity,
                price: item.unitPrice,
                priceType: 'Standardpreis',
                total: item.quantity * item.unitPrice,
                productionCost: item.quantity * unitCost
            };
        });

        // Die bestehende archive-Tabelle hat eine Pflicht-ID. Daher die nächste
        // freie ID bestimmen, statt null zu senden.
        const { data: lastArchiveRows, error: idLookupError } = await supabaseClient
            .from('archive')
            .select('id')
            .order('id', { ascending: false })
            .limit(1);
        if (idLookupError) throw idLookupError;

        const nextArchiveId = lastArchiveRows?.length
            ? Number(lastArchiveRows[0].id) + 1
            : 1;
        const soldBy = currentUser && currentUser.username ? currentUser.username : 'Unbekannt';
        const soldAt = getCurrentTimeString();

        const payload = {
            id: nextArchiveId,
            customerName: 'Warenkorb',
            items: archivedItems,
            totalSum: totals.total,
            totalProductionCost: totals.productionCostTotal,
            createdAt: soldAt,
            deliveredAt: soldAt,
            soldBy,
            discountPercent: totals.discountPercent,
            discount: totals.discountPercent
        };

        const { data, error } = await supabaseClient.from('archive').insert([payload]).select();
        if (error) throw error;

        if (data && data[0]) {
            archivedOrdersList.unshift(data[0]);
            renderArchive();
            if (typeof renderMembersTable === 'function') renderMembersTable();
        }

        logActivity('Archiv', `Warenkorb wurde von „${soldBy}“ als verkauft archiviert ($${totals.total.toFixed(2)})`);
        clearSalesCalculatorCart();
        showToast('Warenkorb wurde als verkauft im Archiv gespeichert.', 'success', 'Verkauft');
    } catch (error) {
        showToast('Fehler beim Archivieren des verkauften Warenkorbs: ' + error.message, 'danger', 'Änderung nicht durchgeführt');
        if (button) button.disabled = false;
    }
}

function initSalesCalculatorEvents() {
    renderSalesCalculatorCart();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSalesCalculatorEvents, { once: true });
} else {
    initSalesCalculatorEvents();
}

document.addEventListener('keydown', event => {
    const modal = document.getElementById('sales-quantity-modal');
    if (!modal || !modal.classList.contains('open')) return;
    if (event.key === 'Escape') closeSalesQuantityModal();
    else if (/^[0-9]$/.test(event.key)) salesKeypadPress(event.key);
    else if (event.key === 'Backspace') salesKeypadBackspace();
    else if (event.key === 'Enter') confirmSalesQuantity();
});
