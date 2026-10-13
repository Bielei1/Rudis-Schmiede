(function () {
    const currencyFormatter = new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'USD'
    });
    const dateFormatter = new Intl.DateTimeFormat('de-DE', {
        dateStyle: 'short',
        timeStyle: 'short'
    });

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[character]);
    }

    function formatBalance(entries) {
        return entries.reduce((balance, entry) => {
            const amount = Number(entry.amount);
            return balance + (entry.transaction_type === 'deposit' ? amount : -amount);
        }, 0);
    }

    function setStatus(message, isError) {
        const status = document.getElementById('cashbook-status');
        if (!status) return;
        status.textContent = message;
        status.classList.toggle('cashbook-status-error', !!isError);
    }

    async function fetchEntries() {
        const { data, error } = await window.supabaseClient
            .from('cashbook_entries')
            .select('id, transaction_type, amount, description, created_by_username, created_at')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    }

    function renderEntries(entries) {
        const body = document.getElementById('cashbook-entries-body');
        if (!body) return;
        body.innerHTML = entries.length
            ? entries.map(entry => {
                const isDeposit = entry.transaction_type === 'deposit';
                const amount = Number(entry.amount);
                const date = new Date(entry.created_at);
                return `<tr>
                    <td>${Number.isNaN(date.getTime()) ? '–' : escapeHtml(dateFormatter.format(date))}</td>
                    <td><span class="cashbook-type ${isDeposit ? 'cashbook-deposit' : 'cashbook-withdrawal'}">${isDeposit ? 'Einzahlung' : 'Auszahlung'}</span></td>
                    <td class="${isDeposit ? 'cashbook-positive' : 'cashbook-negative'}">${isDeposit ? '+' : '−'}${escapeHtml(currencyFormatter.format(amount))}</td>
                    <td>${escapeHtml(entry.description)}</td>
                    <td>${escapeHtml(entry.created_by_username || 'Unbekannt')}</td>
                </tr>`;
            }).join('')
            : '<tr><td colspan="5" class="cashbook-empty">Noch keine Buchungen vorhanden.</td></tr>';
    }

    async function loadCashbook() {
        const form = document.getElementById('cashbook-transaction-form');
        const allowedToEdit = typeof window.canEditTab === 'function' && window.canEditTab('kassenbuch');
        if (form) form.hidden = !allowedToEdit;
        setStatus('Kassenbuch wird geladen ...', false);

        try {
            const entries = await fetchEntries();
            const balance = formatBalance(entries);
            const balanceElement = document.getElementById('cashbook-current-balance');
            if (balanceElement) balanceElement.textContent = currencyFormatter.format(balance);
            renderEntries(entries);
            setStatus(`${entries.length} Buchung${entries.length === 1 ? '' : 'en'} geladen.`, false);
        } catch (error) {
            console.error('Kassenbuch konnte nicht geladen werden:', error);
            renderEntries([]);
            setStatus('Kassenbuch konnte nicht geladen werden. Bitte Datenbank-Setup und Leserechte prüfen.', true);
            if (typeof window.showToast === 'function') {
                window.showToast('Kassenbuch konnte nicht geladen werden.', 'danger');
            }
        }
    }

    async function loadCashbookDashboardBalance() {
        const balanceElement = document.getElementById('dashboard-cashbook-balance');
        if (!balanceElement) return;
        try {
            const { data, error } = await window.supabaseClient
                .from('cashbook_entries')
                .select('transaction_type, amount');
            if (error) throw error;
            const balance = formatBalance(data || []);
            balanceElement.textContent = currencyFormatter.format(balance);
        } catch (error) {
            console.error('Kassenstand für Übersicht konnte nicht geladen werden:', error);
            balanceElement.textContent = 'Nicht verfügbar';
        }
    }

    async function recordCashbookTransaction(event) {
        event.preventDefault();
        const typeInput = document.getElementById('cashbook-transaction-type');
        const amountInput = document.getElementById('cashbook-amount');
        const descriptionInput = document.getElementById('cashbook-description');
        const submitButton = document.getElementById('cashbook-submit-button');
        const amount = Number(amountInput.value);
        const description = descriptionInput.value.trim();

        if (!Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99) {
            setStatus('Bitte einen gültigen positiven Betrag eingeben.', true);
            return;
        }
        if (!description) {
            setStatus('Bitte einen Verwendungszweck eingeben.', true);
            return;
        }

        submitButton.disabled = true;
        setStatus('Buchung wird gespeichert ...', false);
        try {
            const { error } = await window.supabaseClient.rpc('cashbook_record_transaction', {
                p_transaction_type: typeInput.value,
                p_amount: amount,
                p_description: description
            });
            if (error) throw error;
            document.getElementById('cashbook-transaction-form').reset();
            await loadCashbook();
            if (typeof window.showToast === 'function') {
                window.showToast('Buchung wurde gespeichert.', 'success');
            }
        } catch (error) {
            console.error('Kassenbuch-Buchung konnte nicht gespeichert werden:', error);
            const message = error.message && error.message.includes('Insufficient cashbook balance')
                ? 'Die Auszahlung ist höher als der aktuelle Kassenstand.'
                : 'Buchung konnte nicht gespeichert werden. Bitte Buchungsrechte und Datenbank-Setup prüfen.';
            setStatus(message, true);
            if (typeof window.showToast === 'function') window.showToast(message, 'danger');
        } finally {
            submitButton.disabled = false;
        }
    }

    window.loadCashbook = loadCashbook;
    window.loadCashbookDashboardBalance = loadCashbookDashboardBalance;
    window.recordCashbookTransaction = recordCashbookTransaction;
})();
