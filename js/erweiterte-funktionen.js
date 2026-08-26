// ============ ERWEITERTE VERWALTUNGSFUNKTIONEN ============
// Bewusst separat gehalten: Dashboard, Verkaufsstatistik, Benutzeraktivität,
// Sitzungen und schnelle Theme-Steuerung. Bestehende Kernmodule bleiben unverändert.

(function () {
    const SPECIAL_FALLBACK_KEY = 'rs_special_permissions_fallback';

    function money(v) { return '$' + (Number(v) || 0).toFixed(2); }
    function safe(v) { return typeof escapeHtml === 'function' ? escapeHtml(v) : String(v ?? ''); }

    function getRecentSales(days = 30) {
        const since = Date.now() - days * 86400000;
        return (Array.isArray(archivedOrdersList) ? archivedOrdersList : []).filter(order => {
            const raw = order.deliveredAt || order.createdAt;
            const t = raw ? new Date(raw).getTime() : 0;
            return !t || t >= since;
        });
    }

    function calculateSalesStats() {
        const orders = getRecentSales(30);
        const stats = { orders: orders.length, revenue: 0, cost: 0, profit: 0, sellers: {} };
        orders.forEach(order => {
            const revenue = Number(order.totalSum) || 0;
            const cost = Number(order.totalProductionCost) || 0;
            const seller = order.soldBy || 'Unbekannt';
            stats.revenue += revenue;
            stats.cost += cost;
            stats.profit += revenue - cost;
            if (!stats.sellers[seller]) stats.sellers[seller] = { orders: 0, revenue: 0, cost: 0, profit: 0 };
            stats.sellers[seller].orders++;
            stats.sellers[seller].revenue += revenue;
            stats.sellers[seller].cost += cost;
            stats.sellers[seller].profit += revenue - cost;
        });
        return stats;
    }

    function renderExtendedDashboard() {
        const salesEl = document.getElementById('dashboard-sales-stats');
        const sessionsEl = document.getElementById('dashboard-session-stats');
        if (!salesEl || !sessionsEl) return;

        const stats = calculateSalesStats();
        const sellers = Object.entries(stats.sellers).sort((a,b) => b[1].revenue - a[1].revenue).slice(0, 5);
        const avg = stats.orders ? stats.revenue / stats.orders : 0;
        salesEl.innerHTML = `
            <div class="dashboard-stat-highlight"><span>Umsatz</span><strong>${money(stats.revenue)}</strong></div>
            <div class="dashboard-stat-row"><span>Herstellungskosten</span><strong>${money(stats.cost)}</strong></div>
            <div class="dashboard-stat-row"><span>Gewinn</span><strong class="stat-positive">${money(stats.profit)}</strong></div>
            <div class="dashboard-stat-row"><span>Bestellungen</span><strong>${stats.orders}</strong></div>
            <div class="dashboard-stat-row"><span>Ø Bestellung</span><strong>${money(avg)}</strong></div>
            <div class="dashboard-stat-divider"></div>
            ${sellers.length ? sellers.map(([name, data], i) => `
                <div class="dashboard-seller-row">
                    <span class="dashboard-rank">${i + 1}</span>
                    ${typeof renderUsernameWithAvatar === 'function' ? renderUsernameWithAvatar(name, null, {size:'small'}) : safe(name)}
                    <span class="dashboard-seller-value">${money(data.revenue)}</span>
                </div>`).join('') : '<div class="dashboard-empty">Noch keine Verkäufe in den letzten 30 Tagen.</div>'}
        `;

        const online = typeof getOnlineUsersSnapshot === 'function' ? getOnlineUsersSnapshot() : [];
        sessionsEl.innerHTML = online.length ? online.map(user => `
            <div class="dashboard-session-row">
                <span class="online-dot"></span>
                ${typeof renderUsernameWithAvatar === 'function' ? renderUsernameWithAvatar(user.username, user, {size:'small'}) : safe(user.username)}
                <span class="dashboard-session-time">${user.lastSeen ? new Date(user.lastSeen).toLocaleTimeString('de-DE', {hour:'2-digit',minute:'2-digit'}) : 'aktiv'}</span>
            </div>
        `).join('') : '<div class="dashboard-empty">Keine aktive Sitzung gefunden.</div>';
    }

    const originalRenderUsersTab = window.renderUsersTab;
    window.renderUsersTab = function () {
        if (typeof originalRenderUsersTab === 'function') originalRenderUsersTab();
        const body = document.getElementById('users-table-body');
        if (!body) return;
        const online = typeof getOnlineUsersSnapshot === 'function' ? getOnlineUsersSnapshot() : [];
        const map = new Map(online.map(u => [String(u.username).toLowerCase(), u]));
        body.querySelectorAll('tr').forEach(row => {
            const nameEl = row.querySelector('.user-tag-name');
            if (!nameEl || row.children.length < 6) return;
            const username = String(nameEl.textContent || '').replace(/\s*\(.*$/, '').trim();
            const session = map.get(username.toLowerCase());
            const cell = document.createElement('td');
            cell.innerHTML = session
                ? '<span class="session-pill session-online"><span class="online-dot"></span>Online</span>'
                : '<span class="session-pill session-offline">Offline</span>';
            row.insertBefore(cell, row.lastElementChild);
        });
    };

    const originalRenderDashboard = window.renderDashboard;
    window.renderDashboard = function () {
        if (typeof originalRenderDashboard === 'function') originalRenderDashboard();
        renderExtendedDashboard();
    };

    // ============ BENUTZERAKTIVITÄT ============
    window.openUserActivityModal = function (userId) {
        const user = Array.isArray(appUsersList) ? appUsersList.find(u => String(u.id) === String(userId)) : null;
        if (!user) return;
        const modal = document.getElementById('user-activity-modal-backdrop');
        const userEl = document.getElementById('user-activity-user');
        const summary = document.getElementById('user-activity-summary');
        const listEl = document.getElementById('user-activity-list');
        if (!modal || !listEl) return;
        const logs = typeof getActivityLogSnapshot === 'function' ? getActivityLogSnapshot() : [];
        const mine = logs.filter(entry => String(entry.username || '').toLowerCase() === String(user.username).toLowerCase());
        const recent = mine.slice(0, 50);
        userEl.innerHTML = typeof renderUsernameWithAvatar === 'function' ? renderUsernameWithAvatar(user.username, user, {size:'small'}) : safe(user.username);
        summary.innerHTML = `<span><strong>${mine.length}</strong> protokollierte Aktionen</span><span>Registriert: ${user.created_at ? new Date(user.created_at).toLocaleDateString('de-DE') : '-'}</span><span>Status: ${user.approved ? 'Freigeschaltet' : 'Gesperrt'}</span>`;
        listEl.innerHTML = recent.length ? recent.map(entry => `
            <div class="user-activity-row">
                <div class="user-activity-time">${safe(entry.createdAt || '-')}</div>
                <div><span class="log-badge">${safe(entry.category || 'Änderung')}</span><div class="user-activity-message">${safe(String(entry.message || '').split('\n\nDetails:')[0])}</div></div>
            </div>`).join('') : '<div class="dashboard-empty">Für diesen Benutzer sind noch keine Aktivitäten protokolliert.</div>';
        modal.classList.add('open');
    };

    window.closeUserActivityModal = function () {
        const modal = document.getElementById('user-activity-modal-backdrop');
        if (modal) modal.classList.remove('open');
    };
    window.handleUserActivityBackdropClick = function (event) {
        if (event.target && event.target.id === 'user-activity-modal-backdrop') closeUserActivityModal();
    };

    // ============ BENUTZERRECHTE-FALLBACK ============
    // Falls die neue Supabase-Spalte noch nicht angelegt wurde, wird die UI nicht
    // unbrauchbar. Admins behalten Vollzugriff; normale Benutzer bleiben bei den
    // vorhandenen Tab-Rechten.
    window.getSpecialPermissionFallback = function (username) {
        try { return JSON.parse(localStorage.getItem(SPECIAL_FALLBACK_KEY + '_' + username) || '{}'); } catch (e) { return {}; }
    };

    // ============ THEME ============
    window.toggleThemeQuick = async function () {
        if (!currentUser) return;
        const next = (currentUser.theme || document.documentElement.getAttribute('data-theme') || 'dark') === 'dark' ? 'light' : 'dark';
        if (typeof applyTheme === 'function') applyTheme(next);
        currentUser.theme = next;
        if (typeof updateThemeChoiceButtons === 'function') updateThemeChoiceButtons(next);
        try {
            if (currentUser.id && supabaseClient) await supabaseClient.from('app_users').update({theme: next}).eq('id', currentUser.id);
            if (typeof saveStoredUserProfile === 'function') saveStoredUserProfile(currentUser.username, {...currentUser, theme: next});
        } catch (e) { console.warn('Theme konnte nicht dauerhaft gespeichert werden:', e); }
    };

    // Sanfte Theme-Übergänge, ohne das Layout zu verändern.
    document.documentElement.classList.add('theme-ready');

    // Aktualisierung der Live-Kennzahlen.
    setInterval(() => {
        if (document.getElementById('tab-uebersicht')?.classList.contains('active')) {
            renderExtendedDashboard();
        }
    }, 5000);

    // Escape schließt das Benutzeraktivitätsfenster.
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeUserActivityModal();
    });
})();
