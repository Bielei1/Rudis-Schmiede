// ============ VERKAUFSRECHNER ============
// Der Rechner verwendet die in "Verkaufspreise" hinterlegten Standard-VK-Preise.
// Alle Artikel stammen aus den vorhandenen Rezepten (recipesList).

let salesCalculatorCart = {};
let salesCalculatorSelectedItem = null;
let salesCalculatorQuantityBuffer = '';

function getSalesCalculatorPrice(itemName) {
    const priceItem = salesPricesList.find(item =>
        item.name && item.name.toLowerCase() === itemName.toLowerCase()
    );
    return priceItem ? Number(priceItem.price) || 0 : 0;
}

function getSalesCalculatorProducts() {
    const seen = new Set();
    return [...recipesList]
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
        container.innerHTML = `<div class="sales-calculator-empty">Keine herstellbaren Artikel vorhanden. Lege zuerst ein Rezept im Tab „Herstellung“ an.</div>`;
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
            const index = Number(card.dataset.salesProductIndex);
            const product = products[index];
            if (product) openSalesQuantityModal(product.outputName);
        });
    });
}

function escapeSalesCalculatorHtml(value) {
    return String(value).replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
}

function openSalesQuantityModal(itemName) {
    const price = getSalesCalculatorPrice(itemName);
    if (price <= 0) {
        showToast(`Für „${itemName}“ ist noch kein Verkaufspreis hinterlegt.`, 'warning', 'Kein Verkaufspreis');
        return;
    }

    salesCalculatorSelectedItem = itemName;
    salesCalculatorQuantityBuffer = '';
    document.getElementById('sales-modal-title').textContent = itemName;
    document.getElementById('sales-modal-price').textContent = `$${price.toFixed(2)} / Stk.`;
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
    if (salesCalculatorQuantityBuffer === '0') salesCalculatorQuantityBuffer = '';
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
    const existing = salesCalculatorCart[key];

    if (existing) {
        existing.quantity += quantity;
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
    delete salesCalculatorCart[key];
    renderSalesCalculatorCart();
}

function clearSalesCalculatorCart() {
    salesCalculatorCart = {};
    renderSalesCalculatorCart();
}

function getSalesCalculatorTotals() {
    const subtotal = Object.values(salesCalculatorCart).reduce((sum, item) =>
        sum + (item.quantity * item.unitPrice), 0
    );
    const productionCostTotal = Object.values(salesCalculatorCart).reduce((sum, item) => {
        const unitCost = typeof getRecipeCostPerUnit === 'function' ? getRecipeCostPerUnit(item.name) : 0;
        return sum + (item.quantity * unitCost);
    }, 0);

    const discountInput = document.getElementById('sales-cart-discount');
    let discountPercent = discountInput ? parseFloat(discountInput.value) : 0;
    if (isNaN(discountPercent)) discountPercent = 0;
    discountPercent = Math.min(100, Math.max(0, discountPercent));
    if (discountInput) discountInput.value = discountPercent;

    const discountValue = subtotal * (discountPercent / 100);
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
        container.innerHTML = `<div class="sales-cart-empty">Noch keine Artikel im Warenkorb.<br><span>Klicke links auf einen Artikel.</span></div>`;
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
                    <button type="button" class="sales-cart-minus" data-action="minus" aria-label="Menge verringern">−</button>
                    <span>${item.quantity}</span>
                    <button type="button" class="sales-cart-plus" data-action="plus" aria-label="Menge erhöhen">+</button>
                    <strong>$${lineTotal.toFixed(2)}</strong>
                    <button type="button" class="sales-remove-btn" data-action="remove" aria-label="Artikel entfernen">×</button>
                </div>
            </div>`;
    }).join('');

    container.querySelectorAll('[data-sales-cart-key]').forEach(actions => {
        actions.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-action]');
            if (!button) return;
            const key = actions.dataset.salesCartKey;
            const action = button.dataset.action;
            if (action === 'minus') changeSalesCartQuantity(key, -1);
            else if (action === 'plus') changeSalesCartQuantity(key, 1);
            else if (action === 'remove') removeSalesCartItem(key);
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
    if (!items.length) {
        showToast('Der Warenkorb ist leer.', 'warning', 'Keine Artikel');
        return;
    }

    const totals = getSalesCalculatorTotals();
    const createdAt = getCurrentTimeString();
    const payload = {
        customerName: 'Warenkorb',
        createdAt,
        items,
        discount: totals.discountPercent
    };

    const button = document.querySelector('.sales-cart-save-btn');
    if (button) button.disabled = true;

    const { data, error } = await supabaseClient.from('orders').insert([payload]).select();
    if (error) {
        if (button) button.disabled = false;
        alert('Fehler beim Aufnehmen des Warenkorbs: ' + error.message);
        return;
    }

    if (typeof ordersList !== 'undefined' && data && data[0]) {
        ordersList.push(data[0]);
        if (typeof updateOrderCustomerDropdown === 'function') updateOrderCustomerDropdown();
        if (typeof renderOrders === 'function') renderOrders();
    }

    if (typeof logActivity === 'function') {
        logActivity('Bestellung', `Warenkorb wurde von „${currentUser ? currentUser.username : 'Unbekannt'}“ als Bestellung aufgenommen (${items.length} Position(en), $${totals.total.toFixed(2)})`);
    }

    clearSalesCalculatorCart();
    showToast('Warenkorb wurde bei den Bestellungen aufgenommen.', 'success', 'Bestellung aufgenommen');
}

async function sellSalesCart() {
    const items = Object.values(salesCalculatorCart);
    if (!items.length) {
        showToast('Der Warenkorb ist leer.', 'warning', 'Keine Artikel');
        return;
    }

    const totals = getSalesCalculatorTotals();
    const archivedItems = items.map(item => {
        const productionCost = (typeof getRecipeCostPerUnit === 'function' ? getRecipeCostPerUnit(item.name) : 0) * item.quantity;
        return {
            name: item.name,
            qty: item.quantity,
            price: item.unitPrice,
            priceType: 'Standardpreis',
            total: item.quantity * item.unitPrice,
            productionCost
        };
    });

    const soldBy = currentUser ? currentUser.username : 'Unbekannt';
    const soldAt = getCurrentTimeString();

    // Die archive-Tabelle verwendet in deinem Projekt eine Pflichtspalte `id`,
    // die nicht automatisch von Supabase erzeugt wird. Beim direkten Verkauf
    // aus dem Verkaufsrechner existiert deshalb noch keine Bestell-ID.
    // Wir nehmen die nächste freie ID aus dem Archiv.
    const { data: lastArchiveRows, error: idLookupError } = await supabaseClient
        .from('archive')
        .select('id')
        .order('id', { ascending: false })
        .limit(1);

    if (idLookupError) {
        alert('Fehler beim Ermitteln der Archiv-ID: ' + idLookupError.message);
        return;
    }

    const nextArchiveId = lastArchiveRows && lastArchiveRows.length && Number.isFinite(Number(lastArchiveRows[0].id))
        ? Number(lastArchiveRows[0].id) + 1
        : 1;

    const payload = {
        id: nextArchiveId,
        customerName: 'Warenkorb',
        items: archivedItems,
        totalSum: totals.total,
        totalProductionCost: totals.productionCostTotal,
        createdAt: soldAt,
        deliveredAt: soldAt,
        soldBy
    };

    const button = document.querySelector('.sales-cart-sold-btn');
    if (button) button.disabled = true;

    const { data, error } = await supabaseClient.from('archive').insert([payload]).select();
    if (error) {
        if (button) button.disabled = false;
        alert('Fehler beim Archivieren des verkauften Warenkorbs: ' + error.message + '\n\nFalls die Spalte „soldBy“ noch nicht existiert, führe die mitgelieferte SQL-Datei einmal in Supabase aus.');
        return;
    }

    if (typeof archivedOrdersList !== 'undefined' && data && data[0]) {
        archivedOrdersList.unshift(data[0]);
        if (typeof renderArchive === 'function') renderArchive();
    }

    if (typeof logActivity === 'function') {
        logActivity('Archiv', `Warenkorb wurde von „${soldBy}“ als verkauft archiviert ($${totals.total.toFixed(2)})`);
    }

    clearSalesCalculatorCart();
    showToast('Warenkorb wurde als verkauft im Archiv gespeichert.', 'success', 'Verkauft');
}

function initSalesCalculatorEvents() {
    const confirmButton = document.querySelector('.sales-add-cart-btn');
    if (confirmButton && !confirmButton.dataset.salesBound) {
        confirmButton.dataset.salesBound = '1';
        confirmButton.addEventListener('click', (event) => {
            event.preventDefault();
            confirmSalesQuantity();
        });
    }
    renderSalesCalculatorCart();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSalesCalculatorEvents, { once: true });
} else {
    initSalesCalculatorEvents();
}

document.addEventListener('keydown', (event) => {
    const modal = document.getElementById('sales-quantity-modal');
    if (!modal || !modal.classList.contains('open')) return;
    if (event.key === 'Escape') closeSalesQuantityModal();
    if (/^[0-9]$/.test(event.key)) salesKeypadPress(event.key);
    if (event.key === 'Backspace') salesKeypadBackspace();
    if (event.key === 'Enter') confirmSalesQuantity();
});
