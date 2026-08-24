    // ============ MITGLIEDER ============
    // Zeigt automatisch ALLE bestehenden Login-Benutzer (aus "app_users") an -
    // kein doppeltes Anlegen nötig. Pro Zeile lassen sich nur Rang, Beitrittsdatum
    // und Notiz eintragen; das landet in der separaten Tabelle "members" (nur
    // Username, Rang, Beitrittsdatum, Notiz - bewusst OHNE Passwort-Hash o.ä.),
    // verknüpft über den Benutzernamen.
    let memberUsernamesList = [];

    async function loadMemberUsernames() {
        // Bewusst ein schlanker Extra-Request (nur id + username), damit auch
        // Nicht-Admins die Mitgliederliste sehen können, ohne die volle,
        // sensiblere app_users-Liste (inkl. Passwort-Hash) zu laden.
        const { data, error } = await supabaseClient.from('app_users').select('id, username').order('username', { ascending: true });
        if (!error && data) {
            memberUsernamesList = data;
        }
    }

    function updateMemberRangSuggestions() {
        const datalist = document.getElementById('member-rang-suggestions');
        if (!datalist) return;
        const ranks = [...new Set(membersList.map(m => m.rang).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
        datalist.innerHTML = ranks.map(r => `<option value="${escapeHtml(r)}">`).join('');
    }

    function renderMembersTable() {
        const tbody = document.getElementById('members-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (memberUsernamesList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">Keine Benutzer vorhanden. Lege zuerst im Tab „Benutzer" einen Account an.</td></tr>`;
            updateMemberRangSuggestions();
            return;
        }

        const sortedUsers = [...memberUsernamesList].sort((a, b) => a.username.localeCompare(b.username, 'de', { sensitivity: 'base' }));

        tbody.innerHTML = sortedUsers.map(user => {
            const existing = membersList.find(m => m.name.toLowerCase() === user.username.toLowerCase());
            const rang = existing ? existing.rang || '' : '';
            const joinedAt = existing ? existing.joinedAt || '' : '';
            const notiz = existing ? existing.notiz || '' : '';

            return `
                <tr>
                    <td class="material-name">${escapeHtml(user.username)}</td>
                    <td><input type="text" id="member-rang-${user.id}" list="member-rang-suggestions" value="${escapeHtml(rang)}" placeholder="z. B. Chef" style="width: 160px;" /></td>
                    <td><input type="date" id="member-joined-${user.id}" value="${escapeHtml(joinedAt)}" style="width: 160px;" /></td>
                    <td><input type="text" id="member-note-${user.id}" value="${escapeHtml(notiz)}" placeholder="Notiz (optional)" style="width: 220px;" /></td>
                    <td><button class="btn" onclick="saveMemberRow('${escapeHtml(user.username)}', ${user.id})">Speichern</button></td>
                </tr>
            `;
        }).join('');

        updateMemberRangSuggestions();
    }

    async function saveMemberRow(username, userId) {
        const rang = document.getElementById(`member-rang-${userId}`).value.trim();
        const joinedAt = document.getElementById(`member-joined-${userId}`).value;
        const notiz = document.getElementById(`member-note-${userId}`).value.trim();

        const existing = membersList.find(m => m.name.toLowerCase() === username.toLowerCase());

        if (existing) {
            const { error } = await supabaseClient
                .from('members')
                .update({ rang, joinedAt, notiz })
                .eq('id', existing.id);

            if (!error) {
                existing.rang = rang;
                existing.joinedAt = joinedAt;
                existing.notiz = notiz;
                renderMembersTable();
                logActivity('Mitglieder', `Mitgliedsdaten von "${username}" aktualisiert.`);
            } else {
                alert("Fehler beim Speichern: " + error.message);
            }
        } else {
            const { data, error } = await supabaseClient
                .from('members')
                .insert([{ name: username, rang, joinedAt, notiz }])
                .select();

            if (!error && data) {
                membersList.push(data[0]);
                renderMembersTable();
                logActivity('Mitglieder', `Mitgliedsdaten für "${username}" angelegt (Rang: ${rang || '-'}).`);
            } else {
                alert("Fehler beim Speichern: " + (error ? error.message : ''));
            }
        }
    }
