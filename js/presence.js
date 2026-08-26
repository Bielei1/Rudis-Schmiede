    // ============ ONLINE-STATUS (rechte Sidebar) ============
    // Nutzt Supabase Realtime Presence: rein flüchtiger Kanal, keine eigene
    // Datenbanktabelle nötig. Jeder verbundene Tab "meldet" sich mit seinem
    // Benutzernamen an; schließt jemand die Seite, verschwindet er automatisch
    // wieder aus der Liste (kein Cleanup/Timeout selbst programmiert nötig).
    let presenceChannel = null;
    let presenceHeartbeatTimer = null;
    let permissionsRefreshTimer = null;

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
            .on('broadcast', { event: 'permissions-updated' }, ({ payload }) => {
                if (!currentUser || !payload || String(payload.userId) !== String(currentUser.id)) return;
                refreshCurrentUserPermissions();
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
                    startPermissionsRefresh();
                }
            });
    }

    async function refreshCurrentUserPermissions() {
        if (!currentUser || !currentUser.id || !supabaseClient) return;
        const { data, error } = await supabaseClient
            .from('app_users')
            .select('is_admin, special_permissions')
            .eq('id', currentUser.id)
            .maybeSingle();
        if (error) {
            console.warn('Benutzerrechte konnten live nicht geladen werden:', error.message);
            return;
        }
        if (!data) return;

        const nextIsAdmin = !!data.is_admin;
        const nextSpecialPermissions = normalizeSpecialPermissions(data.special_permissions, nextIsAdmin);
        const previousState = JSON.stringify({
            isAdmin: !!currentUser.isAdmin,
            specialPermissions: currentUser.specialPermissions || {},
            tabPermissions: currentUser.tabPermissions || {}
        });
        currentUser.isAdmin = nextIsAdmin;
        currentUser.specialPermissions = nextSpecialPermissions;
        await loadUserTabPermissions();
        const nextState = JSON.stringify({
            isAdmin: currentUser.isAdmin,
            specialPermissions: currentUser.specialPermissions,
            tabPermissions: currentUser.tabPermissions
        });
        if (previousState === nextState) return;

        document.body.classList.toggle('is-admin', !!currentUser.isAdmin);
        const roleEl = document.getElementById('sidebar-userrole');
        if (roleEl) roleEl.innerText = currentUser.isAdmin ? 'Administrator' : 'Benutzer – Tab-Rechte individuell';
        updateTabVisibility();
        applyPermissionUI();
        ensureAllowedTabSelected();
    }

    function startPermissionsRefresh() {
        if (permissionsRefreshTimer || !currentUser || !currentUser.id) return;
        permissionsRefreshTimer = setInterval(() => {
            refreshCurrentUserPermissions().catch(error => {
                console.warn('Rechte konnten nicht automatisch aktualisiert werden:', error.message);
            });
        }, 3000);
    }

    async function broadcastPermissionsUpdated(userId) {
        if (!presenceChannel || !userId) return;
        await presenceChannel.send({
            type: 'broadcast',
            event: 'permissions-updated',
            payload: { userId }
        });
    }

    window.getOnlineUsersSnapshot = function() {
        if (!presenceChannel) return [];
        const state = presenceChannel.presenceState();
        return Object.keys(state).map(name => {
            const entries = state[name] || [];
            const meta = entries.length ? entries[entries.length - 1] : {};
            return { username: meta.username || name, avatar: meta.avatar || null, isAdmin: !!meta.isAdmin, lastSeen: meta.lastSeen || null };
        }).sort((a,b) => a.username.localeCompare(b.username));
    };

    function renderOnlineUsers() {
        const container = document.getElementById('online-users-list');
        if (!container || !presenceChannel) return;

        const state = presenceChannel.presenceState();
        const onlineUsers = Object.keys(state).map(name => {
            const entries = state[name] || [];
            const meta = entries.length ? entries[entries.length - 1] : {};
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
            const entries = state[name] || [];
            const meta = entries.length ? entries[entries.length - 1] : null;
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
        'app_user_tab_permissions', 'password_reset_requests', 'activity_log'
    ];
    let liveSyncChannel = null;
    let liveSyncDebounceTimer = null;
    let liveDataRefreshInProgress = false;
    let liveDataRefreshQueued = false;
    let liveSyncStatus = 'Verbinde...';

    function updateLiveSyncStatus(status, isError = false) {
        liveSyncStatus = status;
        const onlineList = document.getElementById('online-users-list');
        if (onlineList) onlineList.dataset.syncStatus = status;
        const statusEl = document.getElementById('live-sync-status');
        if (statusEl) {
            statusEl.textContent = status;
            statusEl.classList.toggle('is-error', isError);
        }
    }

    function startLiveSync() {
        if (!currentUser || !supabaseClient) return;
        if (liveSyncChannel) return; // schon aktiv (z. B. nach Session-Restore)

        liveSyncChannel = supabaseClient.channel('live-data-sync');
        LIVE_SYNC_TABLES.forEach(table => {
            liveSyncChannel.on(
                'postgres_changes',
                { event: '*', schema: 'public', table },
                (payload) => handleRemoteDataChange(table, payload)
            );
        });
        liveSyncChannel.on('broadcast', { event: 'data-updated' }, ({ payload }) => {
            if (!payload || !LIVE_SYNC_TABLES.includes(payload.table)) return;
            handleRemoteDataChange(payload.table, payload);
        });
        liveSyncChannel.subscribe((status) => {
            if (status === 'SUBSCRIBED') updateLiveSyncStatus('Live');
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') updateLiveSyncStatus('Sync-Fehler', true);
        });
    }

    function hasPendingFormInput() {
        const activeElement = document.activeElement;
        return !!(activeElement && activeElement.matches(
            'input:not([type="button"]):not([type="submit"]), select, textarea, [contenteditable="true"]'
        ));
    }

    async function runLiveDataRefresh(force = false) {
        if (!currentUser || !supabaseClient) return false;
        if (liveDataRefreshInProgress) {
            liveDataRefreshQueued = true;
            return false;
        }
        if (!force && document.hidden) return false;
        if (!force && hasPendingFormInput()) {
            liveDataRefreshQueued = true;
            clearTimeout(liveSyncDebounceTimer);
            liveSyncDebounceTimer = setTimeout(() => runLiveDataRefresh(), 1000);
            return false;
        }
        liveDataRefreshInProgress = true;
        updateLiveSyncStatus('Synchronisiere...');
        try {
            await loadDataFromSupabase();
            if (currentUser.isAdmin && typeof loadAppUsers === 'function') {
                await loadAppUsers();
            }
            renderOnlineUsers();
            updateLiveSyncStatus(`Live · ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
            return true;
        } catch (error) {
            updateLiveSyncStatus('Sync-Fehler', true);
            console.warn('Automatische Live-Aktualisierung fehlgeschlagen:', error.message);
            return false;
        } finally {
            liveDataRefreshInProgress = false;
            if (liveDataRefreshQueued) {
                liveDataRefreshQueued = false;
                setTimeout(() => runLiveDataRefresh(), 0);
            }
        }
    }

    async function broadcastDataChange(table) {
        if (!table) return;
        if (liveSyncChannel) {
            await liveSyncChannel.send({
                type: 'broadcast',
                event: 'data-updated',
                payload: { table }
            });
        }
    }

    function handleRemoteDataChange(table, payload) {
        clearTimeout(liveSyncDebounceTimer);
        liveSyncDebounceTimer = setTimeout(async () => {
            try {
                const refreshed = await runLiveDataRefresh();
                if (!refreshed) return;
                if (table === 'app_users' && currentUser && currentUser.isAdmin) {
                    await loadAppUsers();
                }
                if (table === 'app_users') {
                    const changedUser = payload && (payload.new || payload.old);
                    if (changedUser && currentUser && String(changedUser.id) === String(currentUser.id)) {
                        if (payload.new) {
                            currentUser.isAdmin = !!payload.new.is_admin;
                            currentUser.specialPermissions = normalizeSpecialPermissions(payload.new.special_permissions, currentUser.isAdmin);
                        }
                        const refreshedUser = typeof appUsersList !== 'undefined' && Array.isArray(appUsersList)
                            ? appUsersList.find(user => String(user.id) === String(currentUser.id))
                            : null;
                        if (refreshedUser) {
                            currentUser.avatar = refreshedUser.avatar || null;
                            currentUser.avatarHistory = Array.isArray(refreshedUser.avatar_history) ? refreshedUser.avatar_history : [];
                            currentUser.theme = refreshedUser.theme || currentUser.theme || 'dark';
                            currentUser.bio = refreshedUser.bio || '';
                            if (typeof updateSidebarAvatar === 'function') updateSidebarAvatar();
                            if (typeof updateSidebarProfileInfo === 'function') updateSidebarProfileInfo();
                            if (typeof applyTheme === 'function') applyTheme(currentUser.theme);
                            if (presenceChannel) {
                                await presenceChannel.track({
                                    username: currentUser.username,
                                    isAdmin: !!currentUser.isAdmin,
                                    avatar: currentUser.avatar || null,
                                    lastSeen: new Date().toISOString()
                                });
                            }
                        }
                        await loadUserTabPermissions();
                        document.body.classList.toggle('is-admin', !!currentUser.isAdmin);
                        const roleEl = document.getElementById('sidebar-userrole');
                        if (roleEl) roleEl.innerText = currentUser.isAdmin
                            ? 'Administrator'
                            : 'Benutzer – Tab-Rechte individuell';
                        updateTabVisibility();
                        applyPermissionUI();
                        ensureAllowedTabSelected();
                    }
                    await loadMemberUsernames();
                    renderMembersTable();
                    if (currentUser && currentUser.isAdmin) {
                        renderUsersTab();
                        if (typeof loadAvatarLogs === 'function') await loadAvatarLogs();
                    }
                }
                if (table === 'app_user_tab_permissions' && currentUser) {
                    const changedPermission = payload && (payload.new || payload.old);
                    if (changedPermission && String(changedPermission.user_id) !== String(currentUser.id)) return;
                    await loadUserTabPermissions();
                    updateTabVisibility();
                    applyPermissionUI();
                    ensureAllowedTabSelected();
                }
                if (table === 'password_reset_requests' && currentUser && currentUser.isAdmin) {
                    await loadPasswordResetRequests();
                }
                if (table === 'activity_log') {
                    await loadActivityLog(false);
                }
            } catch (e) {
                console.warn('Live-Sync: Daten konnten nicht aktualisiert werden:', e);
            }
        }, 400);
    }
