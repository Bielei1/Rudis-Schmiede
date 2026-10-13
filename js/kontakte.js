(function () {
    let contacts = [];

    const CONTACT_FIELDS = 'id, first_name, last_name, nickname, notes, telegram_number';

    function contactError(message, error) {
        console.error(message, error);
        const detail = error && error.message ? error.message : String(error || '');
        showToast(`${message} ${detail}`.trim(), 'danger');
    }

    function showContactsMessage(message) {
        const body = document.getElementById('contacts-table-body');
        if (!body) return;
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 5;
        cell.textContent = message;
        cell.style.color = 'var(--text-muted)';
        row.appendChild(cell);
        body.replaceChildren(row);
    }

    async function loadContacts() {
        if (!currentUser || !canViewTab('kontakte')) return;
        document.getElementById('contact-form-details').hidden = !canEditTab('kontakte');

        try {
            const { data, error } = await supabaseClient
                .from('contacts')
                .select(CONTACT_FIELDS)
                .order('last_name', { ascending: true })
                .order('first_name', { ascending: true });
            if (error) throw error;

            contacts = data || [];
            renderContacts();
        } catch (error) {
            showContactsMessage('Kontakte konnten nicht geladen werden.');
            contactError('Kontakte konnten nicht geladen werden.', error);
        }
    }

    function renderContacts() {
        const body = document.getElementById('contacts-table-body');
        if (!body) return;
        document.getElementById('contact-form-details').hidden = !canEditTab('kontakte');

        body.replaceChildren();
        if (!contacts.length) {
            showContactsMessage('Noch keine Kontakte vorhanden.');
            return;
        }

        contacts.forEach(contact => {
            const row = document.createElement('tr');
            const nameCell = document.createElement('td');
            nameCell.textContent = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.nickname || '–';
            row.appendChild(nameCell);
            row.appendChild(createContactCell(contact.nickname));
            row.appendChild(createContactCell(contact.telegram_number));

            const notesCell = document.createElement('td');
            notesCell.textContent = contact.notes || '–';
            notesCell.style.whiteSpace = 'pre-wrap';
            row.appendChild(notesCell);

            const actionsCell = document.createElement('td');
            if (canEditTab('kontakte')) {
                const editButton = document.createElement('button');
                editButton.type = 'button';
                editButton.className = 'btn btn-secondary';
                editButton.textContent = 'Bearbeiten';
                editButton.addEventListener('click', () => editContact(contact.id));
                actionsCell.appendChild(editButton);
            }
            if (canDeleteTab('kontakte')) {
                const deleteButton = document.createElement('button');
                deleteButton.type = 'button';
                deleteButton.className = 'btn delete-action';
                deleteButton.dataset.permissionAction = 'delete';
                deleteButton.textContent = 'Löschen';
                deleteButton.style.marginLeft = '6px';
                deleteButton.addEventListener('click', () => deleteContact(contact.id));
                actionsCell.appendChild(deleteButton);
            }
            row.appendChild(actionsCell);
            body.appendChild(row);
        });
    }

    function createContactCell(value) {
        const cell = document.createElement('td');
        cell.textContent = value || '–';
        return cell;
    }

    function editContact(id) {
        if (!canEditTab('kontakte')) {
            showToast('Du hast für diesen Tab keine Bearbeitungsrechte.', 'danger');
            return;
        }
        const contact = contacts.find(item => String(item.id) === String(id));
        if (!contact) return;

        document.getElementById('contact-edit-id').value = contact.id;
        document.getElementById('contact-first-name').value = contact.first_name || '';
        document.getElementById('contact-last-name').value = contact.last_name || '';
        document.getElementById('contact-nickname').value = contact.nickname || '';
        document.getElementById('contact-telegram').value = contact.telegram_number || '';
        document.getElementById('contact-notes').value = contact.notes || '';
        document.getElementById('contact-form-title').textContent = 'Kontakt bearbeiten';
        document.getElementById('contact-form-summary').textContent = 'Kontakt bearbeiten';
        document.getElementById('contact-submit-btn').textContent = 'Änderungen speichern';
        document.getElementById('contact-cancel-btn').hidden = false;
        document.getElementById('contact-form-details').open = true;
        document.getElementById('contact-first-name').focus();
    }

    async function saveContact(event) {
        event.preventDefault();
        if (!canEditTab('kontakte')) {
            showToast('Du hast für diesen Tab keine Bearbeitungsrechte.', 'danger');
            return;
        }

        const contactId = document.getElementById('contact-edit-id').value;
        const values = {
            first_name: document.getElementById('contact-first-name').value.trim(),
            last_name: document.getElementById('contact-last-name').value.trim(),
            nickname: document.getElementById('contact-nickname').value.trim() || null,
            telegram_number: document.getElementById('contact-telegram').value.trim() || null,
            notes: document.getElementById('contact-notes').value.trim() || null
        };
        values.first_name = values.first_name || null;
        values.last_name = values.last_name || null;
        values.nickname = values.nickname || null;
        if (!values.first_name && !values.last_name && !values.nickname) {
            showToast('Bitte mindestens Vorname, Nachname oder Spitzname eingeben.', 'danger');
            return;
        }

        try {
            const request = contactId
                ? supabaseClient.from('contacts').update(values).eq('id', contactId).select(CONTACT_FIELDS).single()
                : supabaseClient.from('contacts').insert(values).select(CONTACT_FIELDS).single();
            const { data, error } = await request;
            if (error) throw error;

            if (contactId) {
                contacts = contacts.map(contact => String(contact.id) === String(contactId) ? data : contact);
                showToast('Kontakt wurde aktualisiert.', 'success');
            } else {
                contacts.push(data);
                showToast('Kontakt wurde hinzugefügt.', 'success');
            }
            contacts.sort((a, b) =>
                (a.last_name || a.nickname || a.first_name || '').localeCompare(b.last_name || b.nickname || b.first_name || '', 'de')
                || (a.first_name || '').localeCompare(b.first_name || '', 'de')
            );
            renderContacts();
            resetContactForm();
            await broadcastDataChange('contacts');
        } catch (error) {
            contactError('Kontakt konnte nicht gespeichert werden.', error);
        }
    }

    async function deleteContact(id) {
        if (!canDeleteTab('kontakte')) {
            showToast('Du hast für diesen Tab keine Löschrechte.', 'danger');
            return;
        }
        const contact = contacts.find(item => String(item.id) === String(id));
        const contactName = [contact && contact.first_name, contact && contact.last_name].filter(Boolean).join(' ')
            || (contact && contact.nickname) || id;
        if (!contact || !confirm(`Kontakt „${contactName}“ wirklich löschen?`)) return;

        try {
            const { data, error } = await supabaseClient.from('contacts').delete().eq('id', id).select('id').maybeSingle();
            if (error) throw error;
            if (!data) throw new Error('Der Kontakt wurde nicht gefunden oder es fehlen die Löschrechte.');

            contacts = contacts.filter(item => String(item.id) !== String(id));
            renderContacts();
            showToast('Kontakt wurde gelöscht.', 'success');
            await broadcastDataChange('contacts');
        } catch (error) {
            contactError('Kontakt konnte nicht gelöscht werden.', error);
        }
    }

    function resetContactForm() {
        document.getElementById('contact-form').reset();
        document.getElementById('contact-edit-id').value = '';
        document.getElementById('contact-form-title').textContent = '+ Kontakt hinzufügen';
        document.getElementById('contact-form-summary').textContent = '+ Kontakt hinzufügen';
        document.getElementById('contact-submit-btn').textContent = 'Kontakt speichern';
        document.getElementById('contact-cancel-btn').hidden = true;
    }

    function cancelContactEdit() {
        resetContactForm();
    }

    window.loadContacts = loadContacts;
    window.renderContacts = renderContacts;
    window.saveContact = saveContact;
    window.cancelContactEdit = cancelContactEdit;
})();
