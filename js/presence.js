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
