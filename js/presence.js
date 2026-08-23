    // ============ ONLINE-STATUS (rechte Sidebar) ============
    // Nutzt Supabase Realtime Presence: rein flüchtiger Kanal, keine eigene
    // Datenbanktabelle nötig. Jeder verbundene Tab "meldet" sich mit seinem
    // Benutzernamen an; schließt jemand die Seite, verschwindet er automatisch
    // wieder aus der Liste (kein Cleanup/Timeout selbst programmiert nötig).
    let presenceChannel = null;

    function startPresence() {
        if (!currentUser || !supabaseClient) return;
        if (presenceChannel) return; // schon aktiv (z. B. nach Session-Restore)

        presenceChannel = supabaseClient.channel('online-users', {
            config: { presence: { key: currentUser.username } }
        });

        presenceChannel
            .on('presence', { event: 'sync' }, renderOnlineUsers)
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await presenceChannel.track({
                        username: currentUser.username,
                        isAdmin: !!currentUser.isAdmin
                    });
                }
            });
    }

    function renderOnlineUsers() {
        const container = document.getElementById('online-users-list');
        if (!container || !presenceChannel) return;

        const state = presenceChannel.presenceState();
        const usernames = Object.keys(state).sort((a, b) => a.localeCompare(b));

        if (usernames.length === 0) {
            container.innerHTML = `<div class="dashboard-empty" style="padding: 12px 4px;">Niemand online</div>`;
            return;
        }

        container.innerHTML = usernames.map(name => {
            const meta = state[name][0];
            const isYou = currentUser && name === currentUser.username;
            return `
                <div class="online-user-row">
                    <span class="online-dot"></span>
                    <span class="online-user-name">${escapeHtml(meta.username || name)}${isYou ? ' (Du)' : ''}</span>
                </div>
            `;
        }).join('');
    }

    // ============ LIVE-SYNC (Daten anderer User automatisch übernehmen) ============
    // Lauscht auf Änderungen (Einfügen/Ändern/Löschen) in den zentralen Tabellen und
    // lädt bei einer Änderung einfach die komplette Datenmenge neu (loadDataFromSupabase()
    // holt eh alles auf einmal) - einfacher und robuster als jede Tabelle einzeln
    // im Speicher zu patchen. Mehrere Änderungen kurz hintereinander werden zu
    // einem einzigen Reload zusammengefasst (Debounce), damit es nicht flackert.
    const LIVE_SYNC_TABLES = ['inventory', 'orders', 'archive', 'customer_prices', 'sales_prices', 'purchase_prices', 'recipes', 'notes'];
    let liveSyncChannel = null;
    let liveSyncDebounceTimer = null;

    function startLiveSync() {
        if (!currentUser || !supabaseClient) return;
        if (liveSyncChannel) return; // schon aktiv (z. B. nach Session-Restore)

        liveSyncChannel = supabaseClient.channel('live-data-sync');
        LIVE_SYNC_TABLES.forEach(table => {
            liveSyncChannel.on('postgres_changes', { event: '*', schema: 'public', table }, handleRemoteDataChange);
        });
        liveSyncChannel.subscribe();
    }

    function handleRemoteDataChange() {
        clearTimeout(liveSyncDebounceTimer);
        liveSyncDebounceTimer = setTimeout(async () => {
            try {
                await loadDataFromSupabase();
            } catch (e) {
                console.warn('Live-Sync: Daten konnten nicht aktualisiert werden:', e);
            }
        }, 400);
    }

