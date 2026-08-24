    // ============ MITGLIEDER ============
    // Eigene Tabelle "members" (Name/Benutzername, Rang, Beitrittsdatum, Notiz).
    // Bewusst lose an bestehende Logins gekoppelt (kein hartes Foreign-Key-Constraint),
    // damit hier keine sensiblen Login-Daten (Passwort-Hashes etc.) mit angezeigt werden.
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

        if (membersList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">Noch keine Mitglieder angelegt.</td></tr>`;
            updateMemberRangSuggestions();
            return;
        }

        const sortedList = [...membersList].sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }));

        sortedList.forEach(member => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="material-name">${escapeHtml(member.name)}</td>
                <td><span class="business-badge">${escapeHtml(member.rang)}</span></td>
                <td class="time-text">${member.joinedAt ? escapeHtml(member.joinedAt) : '-'}</td>
                <td style="max-width: 320px; white-space: pre-wrap; word-break: break-word; color: var(--text-muted); font-size: 0.88rem;">${member.notiz ? escapeHtml(member.notiz) : '-'}</td>
                <td style="display: flex; gap: 8px;">
                    <button class="btn" style="background-color: var(--secondary-btn-bg); height: 36px; font-size: 0.85rem;" onclick="editMember(${member.id})">Bearbeiten</button>
                    <button class="btn btn-danger delete-action" data-permission-action="delete" onclick="deleteMember(${member.id})">Löschen</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        updateMemberRangSuggestions();
    }

    function editMember(id) {
        const member = membersList.find(m => m.id === id);
        if (!member) return;

        document.getElementById('member-edit-id').value = member.id;
        document.getElementById('member-add-name').value = member.name || '';
        document.getElementById('member-add-rang').value = member.rang || '';
        document.getElementById('member-add-joined').value = member.joinedAt || '';
        document.getElementById('member-add-note').value = member.notiz || '';

        document.getElementById('member-form-title').innerText = 'Mitglied bearbeiten';
        document.getElementById('member-form-summary').innerText = '✏️ Mitglied bearbeiten';
        document.getElementById('member-submit-btn').innerText = 'Änderungen speichern';
        document.getElementById('member-cancel-btn').style.display = 'inline-flex';

        const details = document.getElementById('member-add-form').closest('details');
        if (details) details.open = true;
        document.getElementById('member-add-name').focus();
    }

    function cancelMemberEdit() {
        document.getElementById('member-edit-id').value = '';
        document.getElementById('member-add-form').reset();

        document.getElementById('member-form-title').innerText = '+ Neues Mitglied hinzufügen';
        document.getElementById('member-form-summary').innerText = '+ Neues Mitglied hinzufügen';
        document.getElementById('member-submit-btn').innerText = 'Mitglied speichern';
        document.getElementById('member-cancel-btn').style.display = 'none';
    }

    async function handleAddMember(event) {
        event.preventDefault();
        const editId = document.getElementById('member-edit-id').value;
        const name = capitalizeText(document.getElementById('member-add-name').value.trim());
        const rang = document.getElementById('member-add-rang').value.trim();
        const joinedAt = document.getElementById('member-add-joined').value;
        const notiz = document.getElementById('member-add-note').value.trim();

        if (!name || !rang) return alert("Bitte Name und Rang angeben.");

        if (editId) {
            const { error } = await supabaseClient
                .from('members')
                .update({ name, rang, joinedAt, notiz })
                .eq('id', editId);

            if (!error) {
                const existing = membersList.find(m => m.id == editId);
                if (existing) {
                    existing.name = name;
                    existing.rang = rang;
                    existing.joinedAt = joinedAt;
                    existing.notiz = notiz;
                }
                cancelMemberEdit();
                renderMembersTable();
                logActivity('Mitglieder', `Mitglied "${name}" wurde geändert.`);
            } else {
                alert("Fehler beim Aktualisieren: " + error.message);
            }
        } else {
            const { data, error } = await supabaseClient
                .from('members')
                .insert([{ name, rang, joinedAt, notiz }])
                .select();

            if (!error && data) {
                membersList.push(data[0]);
                cancelMemberEdit();
                renderMembersTable();
                logActivity('Mitglieder', `Neues Mitglied "${name}" (${rang}) hinzugefügt.`);
            } else {
                alert("Fehler beim Speichern: " + (error ? error.message : ''));
            }
        }
    }

    async function deleteMember(id) {
        if (!canDeleteTab('mitglieder')) {
            showToast('Du hast für diesen Tab keine Löschrechte.', 'danger', 'Löschen nicht erlaubt');
            return;
        }
        if (await customConfirm("Mitglied wirklich löschen?")) {
            const member = membersList.find(m => m.id === id);
            const { error } = await supabaseClient.from('members').delete().eq('id', id);
            if (!error) {
                membersList = membersList.filter(m => m.id !== id);
                renderMembersTable();
                logActivity('Mitglieder', `Mitglied "${member ? member.name : id}" wurde entfernt.`);
            } else {
                alert("Fehler beim Löschen: " + error.message);
            }
        }
    }
