// ============ ERWEITERTE VERWALTUNGSFUNKTIONEN ============
// Bewusst separat gehalten: Dashboard, Benutzeraktivität, Sitzungen
// und schnelle Theme-Steuerung. Bestehende Kernmodule bleiben unverändert.

(function () {
    const SPECIAL_FALLBACK_KEY = 'rs_special_permissions_fallback';

    function money(v) { return '$' + (Number(v) || 0).toFixed(2); }
    function safe(v) { return typeof escapeHtml === 'function' ? escapeHtml(v) : String(v ?? ''); }

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
            if (currentUser.id && supabaseClient) {
                const { error } = await supabaseClient.from('app_users').update({theme: next}).eq('id', currentUser.id);
                if (!error && typeof broadcastDataChange === 'function') await broadcastDataChange('app_users');
            }
            if (typeof saveStoredUserProfile === 'function') saveStoredUserProfile(currentUser.username, {...currentUser, theme: next});
        } catch (e) { console.warn('Theme konnte nicht dauerhaft gespeichert werden:', e); }
    };

    // Sanfte Theme-Übergänge, ohne das Layout zu verändern.
    document.documentElement.classList.add('theme-ready');

    // Escape schließt das Benutzeraktivitätsfenster.
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeUserActivityModal();
    });
})();
