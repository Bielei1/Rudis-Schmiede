// ============ VERKAUFSRECHNER ============
// Der Rechner verwendet die in "Verkaufspreise" hinterlegten Standard-VK-Preise.
// Alle Artikel stammen aus den vorhandenen Rezepten (recipesList).

let salesCalculatorCart = {};
let salesCalculatorSelectedItem = null;
let salesCalculatorQuantityBuffer = '1';

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

    container.innerHTML = products.map(recipe => {
        const price = getSalesCalculatorPrice(recipe.outputName);
        const cost = typeof getRecipeCostPerUnit === 'function' ? getRecipeCostPerUnit(recipe.outputName) : 0;
        const hasPrice = price > 0;
        return `
            <button type="button" class="sales-product-card" onclick="openSalesQuantityModal(${JSON.stringify(recipe.outputName)})">
                <span class="sales-product-name">${escapeSalesCalculatorHtml(recipe.outputName)}</span>
                <span class="sales-product-meta">${recipe.outputQty || 1} Stk. je Rezept</span>
                <span class="sales-product-price ${hasPrice ? '' : 'sales-price-missing'}">${hasPrice ? `$${price.toFixed(2)} / Stk.` : 'Kein VK hinterlegt'}</span>
                ${cost > 0 ? `<span class="sales-product-cost">Herstellung: $${cost.toFixed(2)}</span>` : ''}
            </button>`;
    }).join('');
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
    salesCalculatorQuantityBuffer = '1';
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
    salesCalculatorQuantityBuffer = '1';
}

function updateSalesQuantityDisplay() {
    const display = document.getElementById('sales-quantity-display');
    if (display) display.textContent = salesCalculatorQuantityBuffer || '0';
}

function salesKeypadPress(value) {
    if (salesCalculatorQuantityBuffer === '0') salesCalculatorQuantityBuffer = '';
    if (salesCalculatorQuantityBuffer.length >= 4) return;
    salesCalculatorQuantityBuffer += value;
    updateSalesQuantityDisplay();
}

function salesKeypadClear() {
    salesCalculatorQuantityBuffer = '1';
    updateSalesQuantityDisplay();
}

function salesKeypadBackspace() {
    salesCalculatorQuantityBuffer = salesCalculatorQuantityBuffer.slice(0, -1);
    if (!salesCalculatorQuantityBuffer) salesCalculatorQuantityBuffer = '0';
    updateSalesQuantityDisplay();
}

function confirmSalesQuantity() {
    if (!salesCalculatorSelectedItem) return;
    const quantity = Math.max(1, parseInt(salesCalculatorQuantityBuffer, 10) || 1);
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

function updateSalesCalculatorTotals() {
    const subtotal = Object.values(salesCalculatorCart).reduce((sum, item) =>
        sum + (item.quantity * item.unitPrice), 0
    );
    const discountInput = document.getElementById('sales-cart-discount');
    let discountPercent = discountInput ? parseFloat(discountInput.value) : 0;
    if (isNaN(discountPercent)) discountPercent = 0;
    discountPercent = Math.min(100, Math.max(0, discountPercent));
    if (discountInput) discountInput.value = discountPercent;

    const discountValue = subtotal * (discountPercent / 100);
    const total = subtotal - discountValue;
    const setMoney = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = `$${value.toFixed(2)}`;
    };

    setMoney('sales-cart-subtotal', subtotal);
    setMoney('sales-cart-discount-value', -discountValue);
    setMoney('sales-cart-total', total);
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
                <div class="sales-cart-item-actions">
                    <button type="button" onclick="changeSalesCartQuantity(${JSON.stringify(key)}, -1)">−</button>
                    <span>${item.quantity}</span>
                    <button type="button" onclick="changeSalesCartQuantity(${JSON.stringify(key)}, 1)">+</button>
                    <strong>$${lineTotal.toFixed(2)}</strong>
                    <button type="button" class="sales-remove-btn" onclick="removeSalesCartItem(${JSON.stringify(key)})">×</button>
                </div>
            </div>`;
    }).join('');

    updateSalesCalculatorTotals();
}

document.addEventListener('keydown', (event) => {
    const modal = document.getElementById('sales-quantity-modal');
    if (!modal || !modal.classList.contains('open')) return;
    if (event.key === 'Escape') closeSalesQuantityModal();
    if (/^[0-9]$/.test(event.key)) salesKeypadPress(event.key);
    if (event.key === 'Backspace') salesKeypadBackspace();
    if (event.key === 'Enter') confirmSalesQuantity();
});
