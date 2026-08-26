    // ============ ONLINE-STATUS (rechte Sidebar) ============
    // Nutzt Supabase Realtime Presence: rein flüchtiger Kanal, keine eigene
    // Datenbanktabelle nötig. Jeder verbundene Tab "meldet" sich mit seinem
    // Benutzernamen an; schließt jemand die Seite, verschwindet er automatisch
    // wieder aus der Liste (kein Cleanup/Timeout selbst programmiert nötig).
    let presenceChannel = null;
    let presenceHeartbeatTimer = null;

    function startPresence() {
        if (!currentUser || !supabaseClient) return;
        if (presenceChannel) return; // schon aktiv (z. B. nach Session-Restore)

        presenceChannel = supabaseClient.channel('online-users', {
            config: { presence: { key: currentUser.username } }
        });

        presenceChannel
            .on('presence', { event: 'sync' }, () => {
                syncPresenceAvatars();
                renderOnlineUsers();
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await presenceChannel.track({
                        username: currentUser.username,
                        isAdmin: !!currentUser.isAdmin,
                        avatar: currentUser.avatar || null, lastSeen: new Date().toISOString()
                    });
                    await updateLastSeen();
                    renderOnlineUsers();
                    presenceHeartbeatTimer = setInterval(updateLastSeen, 60000);
                }
            });
    }

    window.getOnlineUsersSnapshot = function() {
        if (!presenceChannel) return [];
        const state = presenceChannel.presenceState();
        return Object.keys(state).map(name => {
            const meta = state[name] && state[name][0] ? state[name][0] : {};
            return { username: meta.username || name, avatar: meta.avatar || null, isAdmin: !!meta.isAdmin, lastSeen: meta.lastSeen || null };
        }).sort((a,b) => a.username.localeCompare(b.username));
    };

    function renderOnlineUsers() {
        const container = document.getElementById('online-users-list');
        if (!container || !presenceChannel) return;

        const state = presenceChannel.presenceState();
        const onlineUsers = Object.keys(state).map(name => {
            const meta = state[name][0] || {};
            return { ...meta, username: meta.username || name };
        }).sort((a, b) => a.username.localeCompare(b.username));
        const allUsers = typeof memberUsernamesList !== 'undefined' && Array.isArray(memberUsernamesList)
            ? memberUsernamesList
            : (typeof appUsersList !== 'undefined' && Array.isArray(appUsersList) ? appUsersList : []);
        const onlineNames = new Set(onlineUsers.map(user => user.username.toLowerCase()));
        const offlineUsers = allUsers
            .filter(user => user.username && !onlineNames.has(user.username.toLowerCase()))
            .sort((a, b) => a.username.localeCompare(b.username, 'de'));
        const onlineHtml = onlineUsers.length
            ? onlineUsers.map(meta => {
                const isYou = currentUser && meta.username === currentUser.username;
                return `
                <div class="online-user-row">
                    <span class="online-dot"></span>
                    ${renderUsernameWithAvatar(meta.username, meta, { size: 'small', suffix: isYou ? ' (Du)' : '' })}
                </div>
                `;
            }).join('')
            : `<div class="dashboard-empty" style="padding: 8px 4px;">Niemand online</div>`;
        const offlineHtml = offlineUsers.length
            ? offlineUsers.map(user => `
                <div class="offline-user-row">
                    <span class="offline-dot"></span>
                    <div>
                        ${renderUsernameWithAvatar(user.username, user, { size: 'small' })}
                        <div class="offline-last-seen">${formatLastSeen(user.last_seen)}</div>
                    </div>
                </div>
            `).join('')
            : `<div class="dashboard-empty" style="padding: 8px 4px;">Keine Offline-Benutzer</div>`;
        container.innerHTML = `
            <div class="presence-section-title">Online</div>
            ${onlineHtml}
            <div class="presence-section-title presence-section-title-offline">Offline</div>
            ${offlineHtml}
        `;
    }

    function formatLastSeen(value) {
        if (!value) return 'Noch nie online';
        const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
        const minutes = Math.floor(elapsed / 60000);
        if (minutes < 1) return 'Zuletzt gerade eben';
        if (minutes < 60) return `Zuletzt vor ${minutes} Minute${minutes === 1 ? '' : 'n'}`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `Zuletzt vor ${hours} Stunde${hours === 1 ? '' : 'n'}`;
        const days = Math.floor(hours / 24);
        return `Zuletzt vor ${days} Tag${days === 1 ? '' : 'en'}`;
    }

    async function updateLastSeen() {
        if (!currentUser || !currentUser.id || !supabaseClient) return;
        const lastSeen = new Date().toISOString();
        const { error } = await supabaseClient
            .from('app_users')
            .update({ last_seen: lastSeen })
            .eq('id', currentUser.id);
        if (!error) {
            const lists = [];
            if (typeof memberUsernamesList !== 'undefined' && Array.isArray(memberUsernamesList)) lists.push(memberUsernamesList);
            if (typeof appUsersList !== 'undefined' && Array.isArray(appUsersList)) lists.push(appUsersList);
            lists.forEach(list => {
                const user = list.find(item => Number(item.id) === Number(currentUser.id));
                if (user) user.last_seen = lastSeen;
            });
        }
    }

    function syncPresenceAvatars() {
        if (!presenceChannel) return;
        const state = presenceChannel.presenceState();
        Object.keys(state).forEach(name => {
            const meta = state[name] && state[name][0];
            if (!meta || !meta.username) return;
            const lists = [];
            if (typeof appUsersList !== 'undefined' && Array.isArray(appUsersList)) lists.push(appUsersList);
            if (typeof memberUsernamesList !== 'undefined' && Array.isArray(memberUsernamesList)) lists.push(memberUsernamesList);
            lists.forEach(list => {
                const user = list.find(item => String(item.username || '').toLowerCase() === String(meta.username).toLowerCase());
                if (user && Object.prototype.hasOwnProperty.call(meta, 'avatar')) user.avatar = meta.avatar || null;
            });
        });
        if (typeof renderMembersTable === 'function') renderMembersTable();
        if (typeof renderPinboard === 'function') renderPinboard();
    }

    // ============ LIVE-SYNC (Daten anderer User automatisch übernehmen) ============
    // Lauscht auf Änderungen (Einfügen/Ändern/Löschen) in den zentralen Tabellen und
    // lädt bei einer Änderung einfach die komplette Datenmenge neu (loadDataFromSupabase()
    // holt eh alles auf einmal) - einfacher und robuster als jede Tabelle einzeln
    // im Speicher zu patchen. Mehrere Änderungen kurz hintereinander werden zu
    // einem einzigen Reload zusammengefasst (Debounce), damit es nicht flackert.
    const LIVE_SYNC_TABLES = [
        'inventory', 'orders', 'archive', 'customer_prices', 'sales_prices',
        'purchase_prices', 'recipes', 'notes', 'members', 'app_users',
        'app_user_tab_permissions', 'password_reset_requests'
    ];
    let liveSyncChannel = null;
    let liveSyncDebounceTimer = null;

    function startLiveSync() {
        if (!currentUser || !supabaseClient) return;
        if (liveSyncChannel) return; // schon aktiv (z. B. nach Session-Restore)

        liveSyncChannel = supabaseClient.channel('live-data-sync');
        LIVE_SYNC_TABLES.forEach(table => {
            liveSyncChannel.on(
                'postgres_changes',
                { event: '*', schema: 'public', table },
                () => handleRemoteDataChange(table)
            );
        });
        liveSyncChannel.subscribe();
    }

    function handleRemoteDataChange(table) {
        clearTimeout(liveSyncDebounceTimer);
        liveSyncDebounceTimer = setTimeout(async () => {
            try {
                await loadDataFromSupabase();
                renderOnlineUsers();
                if (table === 'app_users' && currentUser && currentUser.isAdmin) {
                    await loadAppUsers();
                }
                if (table === 'app_users') {
                    await loadMemberUsernames();
                    renderMembersTable();
                    if (currentUser && currentUser.isAdmin) {
                        renderUsersTab();
                        if (typeof renderAvatarLogs === 'function') renderAvatarLogs();
                    }
                }
                if (table === 'app_user_tab_permissions' && currentUser && !currentUser.isAdmin) {
                    await loadUserTabPermissions();
                    updateTabVisibility();
                    applyPermissionUI();
                    ensureAllowedTabSelected();
                }
                if (table === 'password_reset_requests' && currentUser && currentUser.isAdmin) {
                    await loadPasswordResetRequests();
                }
            } catch (e) {
                console.warn('Live-Sync: Daten konnten nicht aktualisiert werden:', e);
            }
        }, 400);
    }
