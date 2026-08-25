    function initNoteContentEditor() {
        const editor = document.getElementById('note-add-content');
        if (!editor) return;
        editor.innerHTML = '';
    }

    function editNote(id) {
        const note = notesList.find(n => n.id === id);
        if (!note) return;

        document.getElementById('note-edit-id').value = note.id;
        document.getElementById('note-add-label').value = note.label || 'Notiz';
        document.getElementById('note-add-content').innerText = note.content || '';

        document.getElementById('note-form-title').innerText = `Notiz bearbeiten`;
        document.getElementById('note-form-summary').innerText = `✏️ Notiz bearbeiten`;
        document.getElementById('note-submit-btn').innerText = 'Änderungen speichern';
        document.getElementById('note-cancel-btn').style.display = 'inline-flex';

        document.getElementById('note-add-content').focus();
    }

    function cancelNoteEdit() {
        document.getElementById('note-edit-id').value = '';
        document.getElementById('note-add-label').value = 'Notiz';
        initNoteContentEditor();

        document.getElementById('note-form-title').innerText = '+ Neue Notiz hinzufügen';
        document.getElementById('note-form-summary').innerText = '+ Neue Notiz hinzufügen';
        document.getElementById('note-submit-btn').innerText = 'Notiz speichern';
        document.getElementById('note-cancel-btn').style.display = 'none';
    }

    async function handleAddNote(event) {
        event.preventDefault();
        const editId = document.getElementById('note-edit-id').value;
        const label = document.getElementById('note-add-label').value;
        const content = document.getElementById('note-add-content').innerText.trim();

        if (!content) return alert("Bitte Notiztext eingeben.");

        const updatedAt = getCurrentTimeString();

        if (editId) {
            const { error } = await supabaseClient
                .from('notes')
                .update({ label, content, updatedAt })
                .eq('id', editId);

            if (!error) {
                const existing = notesList.find(n => n.id == editId);
                if (existing) {
                    existing.label = label;
                    existing.content = content;
                    existing.updatedAt = updatedAt;
                }
                cancelNoteEdit();
                renderNotes();
                renderPinboard();
                logActivity('Notizen', `Notiz "${label}" wurde geändert.`);
            } else {
                alert("Fehler beim Aktualisieren: " + error.message);
            }
        } else {
            const { data, error } = await supabaseClient
                .from('notes')
                .insert([{ label, content, updatedAt, createdBy: currentUser ? currentUser.username : null }])
                .select();

            if (!error && data) {
                notesList.unshift(data[0]);
                cancelNoteEdit();
                renderNotes();
                renderPinboard();
                logActivity('Notizen', `Neue Notiz "${label}" wurde gespeichert.`);
            } else {
                alert("Fehler beim Speichern: " + (error ? error.message : ''));
            }
        }
    }

    async function deleteNote(id) {
        if (!canDeleteTab('notizen')) {
            showToast('Du hast für diesen Tab keine Löschrechte.', 'danger', 'Löschen nicht erlaubt');
            return;
        }
        if (await customConfirm("Notiz löschen?")) {
            const { error } = await supabaseClient.from('notes').delete().eq('id', id);
            if (!error) {
                notesList = notesList.filter(n => n.id !== id);
                renderNotes();
                renderPinboard();
                logActivity('Notizen', `Notiz "${id}" wurde gelöscht.`);
            }
        }
    }

    function renderNotes() {
        const container = document.getElementById('notes-container');
        if (!container) return;
        container.innerHTML = '';

        if (notesList.length === 0) {
            container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">Keine Notizen vorhanden.</div>`;
            return;
        }

        const sortedNotes = [...notesList].sort((a, b) => b.id - a.id);

        sortedNotes.forEach(note => {
            let labelColor = 'var(--label-blue)';
            if (note.label === 'Telegram') labelColor = 'var(--label-cyan)';
            if (note.label === 'Info') labelColor = 'var(--label-green)';
            if (note.label === 'Pinnwand') labelColor = 'var(--accent-amber)';

            const details = document.createElement('details');
            details.innerHTML = `
                <summary style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="background: ${labelColor}22; color: ${labelColor}; border: 1px solid ${labelColor}; padding: 2px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: 600;">${note.label}</span>
                        <span style="font-size: 0.95rem; color: var(--text-muted); font-weight: normal; display: inline-flex; align-items: center; gap: 4px;">${note.createdBy ? `von ${renderUsernameWithAvatar(note.createdBy, null, { size: 'small' })} · ` : ''}Zuletzt geändert: ${note.updatedAt || '-'}</span>
                    </div>
                </summary>
                <div style="margin-top: 12px; border-top: 1px solid var(--border-color); padding-top: 12px;">
                    <div style="font-size: 0.95rem; line-height: 1.5; white-space: pre-wrap; word-break: break-word; color: var(--text-color); margin-bottom: 14px;">${note.content}</div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary" style="height: 34px; font-size: 0.85rem;" onclick="editNote(${note.id})">Bearbeiten</button>
                        <button class="btn btn-danger delete-action" data-permission-action="delete" onclick="deleteNote(${note.id})">Löschen</button>
                    </div>
                </div>
            `;
            container.appendChild(details);
        });
    }
