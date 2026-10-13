(function () {
    const templateTabId = 'template';
    let berufeTabs = [];
    let activeBerufeTabId = templateTabId;

    function canManageBerufe() {
        return typeof window.canManageBerufe === 'function' && window.canManageBerufe();
    }

    function setStatus(message, isError) {
        const status = document.getElementById('berufe-status');
        if (!status) return;
        status.textContent = message;
        status.hidden = !message;
        status.classList.toggle('cashbook-status-error', !!isError);
    }

    function renderBerufeTabs() {
        const nav = document.getElementById('berufe-subtabs');
        const form = document.getElementById('berufe-create-form');
        const title = document.getElementById('berufe-panel-title');
        const description = document.getElementById('berufe-panel-description');
        const panel = document.getElementById('berufe-panel');
        if (!nav || !title || !description || !panel) return;

        const isTemplate = activeBerufeTabId === templateTabId;
        if (form) {
            const canManage = isTemplate && canManageBerufe();
            form.hidden = !canManage;
            form.style.display = canManage ? 'flex' : 'none';
        }

        nav.querySelectorAll('[data-berufe-row]').forEach(row => row.remove());
        const orderedTabs = [...berufeTabs].sort((first, second) =>
            String(first.name).localeCompare(String(second.name), 'de', { sensitivity: 'base' })
        );
        orderedTabs.forEach(tab => {
            const row = document.createElement('div');
            row.className = 'berufe-subtab-row';
            row.dataset.berufeRow = String(tab.id);

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'berufe-subtab';
            button.setAttribute('role', 'tab');
            button.setAttribute('aria-controls', 'berufe-panel');
            button.setAttribute('aria-selected', String(String(tab.id) === String(activeBerufeTabId)));
            button.dataset.berufeTab = String(tab.id);
            button.id = `berufe-tab-${tab.id}`;
            button.textContent = tab.name;
            button.addEventListener('click', () => selectBerufeTab(String(tab.id)));
            row.appendChild(button);

            if (canManageBerufe()) {
                const deleteButton = document.createElement('button');
                deleteButton.type = 'button';
                deleteButton.className = 'berufe-subtab-delete';
                deleteButton.textContent = '×';
                deleteButton.setAttribute('aria-label', `Beruf-Untertab „${tab.name}“ löschen`);
                deleteButton.title = 'Untertab löschen';
                deleteButton.addEventListener('click', () => deleteBerufeTab(String(tab.id)));
                row.appendChild(deleteButton);
            }

            nav.appendChild(row);
        });

        const templateTab = document.getElementById('berufe-template-tab');
        if (templateTab) {
            templateTab.classList.toggle('active', isTemplate);
            templateTab.setAttribute('aria-selected', String(isTemplate));
            nav.appendChild(templateTab);
        }
        nav.querySelectorAll('[data-berufe-tab]').forEach(button => {
            button.classList.toggle('active', button.dataset.berufeTab === String(activeBerufeTabId));
        });
        const parentButton = document.querySelector('.berufe-parent-tab');
        if (parentButton) {
            const expanded = document.getElementById('tab-berufe').classList.contains('active');
            parentButton.setAttribute('aria-expanded', String(expanded));
            nav.hidden = !expanded;
        }

        const selectedTab = berufeTabs.find(tab => String(tab.id) === String(activeBerufeTabId));
        const selectedIsTemplate = isTemplate || !selectedTab;
        if (form && selectedIsTemplate && canManageBerufe()) {
            form.hidden = false;
            form.style.display = 'flex';
        }
        const activeTitle = selectedIsTemplate ? 'Vorlage' : selectedTab.name;
        title.textContent = activeTitle;
        panel.setAttribute('aria-labelledby', selectedIsTemplate ? 'berufe-template-tab' : `berufe-tab-${selectedTab.id}`);
        description.textContent = selectedIsTemplate
            ? 'Die Vorlage ist vorbereitet. Ihr Inhalt wird später ergänzt.'
            : 'Dieser Berufs-Untertab ist angelegt. Sein Inhalt wird später aus der Vorlage übernommen.';
    }

    function setBerufeNavigationExpanded(expanded) {
        const nav = document.getElementById('berufe-subtabs');
        const parentButton = document.querySelector('.berufe-parent-tab');
        if (nav) nav.hidden = !expanded;
        if (parentButton) parentButton.setAttribute('aria-expanded', String(expanded));
    }

    function selectBerufeTab(tabId) {
        const exists = tabId === templateTabId || berufeTabs.some(tab => String(tab.id) === String(tabId));
        if (!exists) return;
        if (!document.getElementById('tab-berufe').classList.contains('active')) {
            if (typeof window.switchTab === 'function') window.switchTab('berufe');
        }
        activeBerufeTabId = tabId;
        renderBerufeTabs();
    }

    function openBerufeNavigation() {
        if (typeof window.switchTab === 'function') window.switchTab('berufe');
        activeBerufeTabId = templateTabId;
        renderBerufeTabs();
    }

    async function loadBerufeTab() {
        const { data, error } = await window.supabaseClient
            .from('berufe_tabs')
            .select('id, name')
            .order('created_at', { ascending: true })
            .order('id', { ascending: true });
        if (error) {
            console.error('Berufe-Untertabs konnten nicht geladen werden:', error);
            setStatus('Berufe-Untertabs konnten nicht geladen werden. Bitte das Supabase-Setup prüfen.', true);
            renderBerufeTabs();
            return;
        }

        berufeTabs = Array.isArray(data) ? data : [];
        if (activeBerufeTabId !== templateTabId && !berufeTabs.some(tab => String(tab.id) === String(activeBerufeTabId))) {
            activeBerufeTabId = templateTabId;
        }
        setStatus('', false);
        renderBerufeTabs();
    }

    async function createBerufeTab(event) {
        event.preventDefault();
        if (!canManageBerufe()) {
            setStatus('Nur Administratoren dürfen Berufe-Untertabs erstellen.', true);
            return;
        }

        const input = document.getElementById('berufe-new-tab-name');
        const button = document.getElementById('berufe-create-button');
        const name = input.value.trim();
        if (!name || name.length > 50) {
            setStatus('Bitte einen Namen mit höchstens 50 Zeichen eingeben.', true);
            return;
        }

        button.disabled = true;
        setStatus('Untertab wird erstellt ...', false);
        try {
            const { data, error } = await window.supabaseClient.rpc('berufe_create_tab', {
                p_name: name
            });
            if (error) throw error;

            const createdTab = Array.isArray(data) ? data[0] : data;
            if (!createdTab || createdTab.id === undefined) {
                throw new Error('Supabase hat keinen neu erstellten Untertab zurückgegeben.');
            }
            input.value = '';
            activeBerufeTabId = String(createdTab.id);
            await loadBerufeTab();
            if (typeof window.showToast === 'function') {
                window.showToast(`Der Untertab „${createdTab.name}“ wurde erstellt.`, 'success');
            }
            if (typeof window.logActivity === 'function') {
                await window.logActivity('Berufe', `Berufe-Untertab „${createdTab.name}“ erstellt`);
            }
        } catch (error) {
            console.error('Berufe-Untertab konnte nicht erstellt werden:', error);
            const message = error && (error.code === '23505' || (error.message && error.message.includes('already exists')))
                ? 'Ein Untertab mit diesem Namen existiert bereits.'
                : 'Untertab konnte nicht erstellt werden. Bitte Administratorrechte und Supabase-Setup prüfen.';
            setStatus(message, true);
            if (typeof window.showToast === 'function') window.showToast(message, 'danger');
        } finally {
            button.disabled = false;
        }
    }

    async function deleteBerufeTab(tabId) {
        if (!canManageBerufe()) {
            setStatus('Nur Administratoren dürfen Berufs-Untertabs löschen.', true);
            return;
        }

        const tab = berufeTabs.find(item => String(item.id) === String(tabId));
        if (!tab) {
            setStatus('Der Beruf-Untertab wurde nicht gefunden.', true);
            return;
        }
        if (typeof window.customConfirm !== 'function'
            || !await window.customConfirm(`Möchtest du den Beruf-Untertab „${tab.name}“ wirklich löschen?`)) {
            return;
        }

        try {
            const { data: deleted, error } = await window.supabaseClient.rpc('berufe_delete_tab', {
                p_tab_id: tab.id
            });
            if (error) throw error;
            if (!deleted) {
                setStatus('Der Beruf-Untertab wurde nicht gefunden oder bereits gelöscht.', true);
                return;
            }

            if (String(activeBerufeTabId) === String(tabId)) activeBerufeTabId = templateTabId;
            await loadBerufeTab();
            if (typeof window.logActivity === 'function') {
                const logged = await window.logActivity('Berufe', `Berufe-Untertab „${tab.name}“ gelöscht`);
                if (!logged && typeof window.showToast === 'function') {
                    window.showToast('Der Untertab wurde gelöscht, aber die Aktion konnte nicht protokolliert werden.', 'danger');
                }
            }
        } catch (error) {
            console.error('Berufe-Untertab konnte nicht gelöscht werden:', error);
            setStatus('Beruf-Untertab konnte nicht gelöscht werden. Bitte Administratorrechte und Supabase-Setup prüfen.', true);
            if (typeof window.showToast === 'function') {
                window.showToast('Beruf-Untertab konnte nicht gelöscht werden.', 'danger');
            }
        }
    }

    window.loadBerufeTab = loadBerufeTab;
    window.selectBerufeTab = selectBerufeTab;
    window.openBerufeNavigation = openBerufeNavigation;
    window.setBerufeNavigationExpanded = setBerufeNavigationExpanded;
    window.createBerufeTab = createBerufeTab;
    window.deleteBerufeTab = deleteBerufeTab;
})();
