    // ============ AUTHENTIFIZIERUNG / BENUTZERVERWALTUNG ============
    const ADMIN_USERNAME = 'admin';
    const AUTH_STORAGE_KEY = 'rs_auth_session';
    const APP_NAME_STORAGE_KEY = 'rs_app_name';
    const DEFAULT_APP_NAME = 'Rudis Schmiede';
    const AUTH_EMAIL_DOMAIN = 'cobndqlftctyaihzqatt.supabase.co';
    function getAuthEmailForUsername(username) {
        const normalized = String(username || '').trim().toLowerCase();
        return `${normalized.replace(/[^a-z0-9._-]/g, '-') }@${AUTH_EMAIL_DOMAIN}`;
    }

    function getUserProfileStorageKey(username) {
        const key = String(username || '').trim();
        return key ? `rs_user_profile_${key}` : 'rs_user_profile_default';
    }

    function readStoredUserProfile(username, fallback = {}) {
        try {
            const key = getUserProfileStorageKey(username);
            const raw = localStorage.getItem(key);
            if (!raw) return fallback;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? { ...fallback, ...parsed } : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function saveStoredUserProfile(username, profile) {
        try {
            localStorage.setItem(getUserProfileStorageKey(username), JSON.stringify(profile || {}));
        } catch (e) {}
    }

    function getStoredAppName() {
        try {
            return localStorage.getItem(APP_NAME_STORAGE_KEY) || DEFAULT_APP_NAME;
        } catch (e) {
            return DEFAULT_APP_NAME;
        }
    }

    function applyAppName(name) {
        const finalName = (name || '').trim() || DEFAULT_APP_NAME;
        const loginTitleEl = document.getElementById('login-hero-title');
        if (loginTitleEl) loginTitleEl.innerText = finalName;
        const mainTitleEl = document.getElementById('main-title');
        if (mainTitleEl) mainTitleEl.innerText = finalName;
        document.title = finalName;
    }

    // Gespeicherten Namen sofort anwenden (auch vor dem Login)
    applyAppName(getStoredAppName());

    const TAB_DEFINITIONS = [
        { key: 'uebersicht', label: 'Übersicht' },
        { key: 'lagerbestand', label: 'Lagerbestand' },
        { key: 'herstellung', label: 'Herstellung' },
        { key: 'bestellungen', label: 'Bestellungen' },
        { key: 'verkaufspreise', label: 'Verkaufspreise' },
        { key: 'verkaufsrechner', label: 'Verkaufsrechner' },
        { key: 'kunden', label: 'Kunden-Preise' },
        { key: 'einkaufspreise', label: 'Einkaufspreise' },
        { key: 'einkaufsliste', label: 'Einkaufsliste' },
        { key: 'herstellungskosten', label: 'Herstellungskosten' },
        { key: 'archiv', label: 'Bestellung Archiv' },
        { key: 'notizen', label: 'Notizen' },
        { key: 'mitglieder', label: 'Mitglieder' }
    ];
    // Tabs, in denen es tatsächlich gespeicherte Löschaktionen gibt.
    // Diese Rechte sind bewusst unabhängig von „Bearbeiten“.
    const DELETE_PERMISSION_TABS = new Set([
        'lagerbestand', 'bestellungen', 'archiv', 'kunden',
        'verkaufspreise', 'einkaufspreise', 'herstellung', 'notizen'
    ]);
    const ADMIN_ONLY_TABS = new Set(['log', 'benutzer', 'avatarlogs']);

    const SPECIAL_PERMISSION_DEFINITIONS = [
        { key: 'administrator_rechte', label: 'Administratorrechte (Vollzugriff)' },
        { key: 'bestellungen_ausliefern', label: 'Bestellungen ausliefern' },
        { key: 'verkaufsrechner_verkaufen', label: 'Warenkorb als verkauft archivieren' },
        { key: 'verkaufsrechner_aufnehmen', label: 'Warenkorb in Bestellungen aufnehmen' },
        { key: 'benutzer_sperren', label: 'Benutzer sperren / freischalten' },
        { key: 'benutzer_loeschen', label: 'Benutzer löschen' },
        { key: 'archiv_loeschen', label: 'Archiv-Einträge löschen' },
        { key: 'log_leeren', label: 'Änderungsprotokoll leeren' }
    ];
    const DEFAULT_SPECIAL_PERMISSIONS = { administrator_rechte: false, bestellungen_ausliefern: true, verkaufsrechner_verkaufen: true, verkaufsrechner_aufnehmen: true, benutzer_sperren: false, benutzer_loeschen: false, archiv_loeschen: true, log_leeren: false };
    function normalizeSpecialPermissions(raw, isAdmin = false) {
        const result = { ...DEFAULT_SPECIAL_PERMISSIONS };
        SPECIAL_PERMISSION_DEFINITIONS.forEach(item => {
            result[item.key] = item.key === 'administrator_rechte'
                ? isAdmin
                : (isAdmin ? true : !!(raw && raw[item.key]));
        });
        return result;
    }

    const DEFAULT_TAB_PERMISSIONS = Object.fromEntries(
        TAB_DEFINITIONS.map(t => [t.key, { view: true, edit: false, del: false }])
    );

    let currentUser = null;   // { username, isAdmin, permission, tabPermissions }
    let appUsersList = [];    // nur für Admin geladen
    let editingPermissionUser = null;
    let editingPermissionDraft = null;

    function showLoginForm() {
        document.getElementById('register-form').style.display = 'none';
        document.getElementById('forgot-password-form').style.display = 'none';
        document.getElementById('login-form').style.display = 'block';
        hideAuthMsg('login-error');
    }

    function showRegisterForm() {
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('forgot-password-form').style.display = 'none';
        document.getElementById('register-form').style.display = 'block';
        hideAuthMsg('register-error');
        document.getElementById('register-info').classList.remove('show');
    }

    function showForgotPasswordForm() {
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('register-form').style.display = 'none';
        document.getElementById('forgot-password-form').style.display = 'block';
        hideAuthMsg('forgot-error');
        hideAuthMsg('forgot-info');
        document.getElementById('forgot-request-step').style.display = 'block';
        document.getElementById('forgot-code-step').style.display = 'none';
        document.getElementById('forgot-code').value = '';
        document.getElementById('forgot-new-password').value = '';
        document.getElementById('forgot-new-password2').value = '';
    }

    function showAuthMsg(id, message) {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerText = message;
        el.classList.add('show');
    }

    function hideAuthMsg(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('show');
    }

    async function handleLogin(event) {
        event.preventDefault();
        hideAuthMsg('login-error');
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        if (!username || !password) return;

        const submitBtn = event.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;

        try {
            // Der frühere fest eingebaute Admin-Zugang wurde entfernt.
            if (username.toLowerCase() === ADMIN_USERNAME) {
                showAuthMsg('login-error', 'Der reservierte Admin-Benutzer muss im Supabase-Testprojekt eingerichtet werden.');
                return;
            }

            const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
                email: getAuthEmailForUsername(username),
                password
            });
            if (authError || !authData || !authData.user) {
                showAuthMsg('login-error', authError && authError.message || 'Benutzername oder Passwort falsch.');
                return;
            }
            const { data: user, error: userError } = await supabaseClient
                .from('app_users')
                .select('id, username, auth_user_id, permission, approved, is_admin, avatar, theme, bio, avatar_history, special_permissions')
                .eq('auth_user_id', authData.user.id)
                .maybeSingle();
            if (userError || !user) {
                await supabaseClient.auth.signOut();
                showAuthMsg('login-error', userError
                    ? `Benutzerprofil konnte nicht geladen werden: ${userError.message}`
                    : 'Benutzerprofil wurde für diesen Auth-Benutzer nicht gefunden.');
                return;
            }
            if (!user.approved) {
                await supabaseClient.auth.signOut();
                showAuthMsg('login-error', 'Dein Konto wartet noch auf Freischaltung durch den Admin.');
                return;
            }

            const localProfile = readStoredUserProfile(user.username, {});
            await completeLogin({ username: user.username, id: user.id, authUserId: user.auth_user_id, isAdmin: !!user.is_admin, isSystemAdmin: false, permission: user.permission || 'view', avatar: user.avatar !== undefined ? user.avatar : (localProfile.avatar || null), avatarHistory: Array.isArray(user.avatar_history) ? user.avatar_history : (localProfile.avatarHistory || []), theme: user.theme || localProfile.theme || 'dark', bio: user.bio || localProfile.bio || '', specialPermissions: normalizeSpecialPermissions(user.special_permissions, !!user.is_admin) }, password, !!user.is_admin);
        } finally {
            submitBtn.disabled = false;
        }
    }


    let activePasswordResetRequestId = null;

    function generateResetCode() {
        return String(Math.floor(10000000 + Math.random() * 90000000));
    }

    async function handleForgotPassword(event) {
        event.preventDefault();
        hideAuthMsg('forgot-error');
        hideAuthMsg('forgot-info');

        const username = document.getElementById('forgot-username').value.trim();
        const codeStep = document.getElementById('forgot-code-step');
        const requestStep = document.getElementById('forgot-request-step');
        const code = document.getElementById('forgot-code').value.trim();
        const newPassword = document.getElementById('forgot-new-password').value;
        const newPassword2 = document.getElementById('forgot-new-password2').value;
        if (!username) return showAuthMsg('forgot-error', 'Bitte deinen Benutzernamen eingeben.');

        const submitBtn = event.target.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        try {
            // 1. Anfrage stellen / bestehenden Status prüfen
            if (codeStep.style.display === 'none') {
                if (username.toLowerCase() === ADMIN_USERNAME) {
                    showAuthMsg('forgot-error', 'Für den fest eingebauten Admin kann kein Passwort-Reset angefordert werden.');
                    return;
                }
                const { data: users, error: userError } = await supabaseClient
                    .from('app_users').select('id, username').ilike('username', username).limit(1);
                if (userError) return showAuthMsg('forgot-error', 'Benutzer konnte nicht geprüft werden: ' + userError.message);
                const user = users && users[0];
                if (!user) return showAuthMsg('forgot-error', 'Benutzername wurde nicht gefunden.');

                const { data: existing, error: existingError } = await supabaseClient
                    .from('password_reset_requests').select('id,status,request_code')
                    .eq('user_id', user.id).in('status',['pending','approved'])
                    .order('created_at',{ascending:false}).limit(1).maybeSingle();
                if (existingError) return showAuthMsg('forgot-error', 'Die Reset-Funktion ist noch nicht mit Supabase verbunden. Bitte die Tabelle "password_reset_requests" anlegen.');

                if (existing) {
                    activePasswordResetRequestId = existing.id;
                    document.getElementById('forgot-code').value = existing.request_code || '';
                    if (existing.status === 'approved') {
                        requestStep.style.display='none'; codeStep.style.display='block';
                        showAuthMsg('forgot-info','Deine Anfrage wurde vom Admin freigegeben. Du kannst jetzt ein neues Passwort festlegen.');
                    } else {
                        requestStep.style.display='block'; codeStep.style.display='none';
                        showAuthMsg('forgot-info','Deine Reset-Anfrage wartet noch auf die Bestätigung durch einen Admin.');
                    }
                    return;
                }

                const requestCode = generateResetCode();
                const { data: request, error: requestError } = await supabaseClient
                    .from('password_reset_requests')
                    .insert([{user_id:user.id,username:user.username,request_code:requestCode,status:'pending'}])
                    .select('id,request_code').single();
                if (requestError) return showAuthMsg('forgot-error','Reset-Anfrage konnte nicht erstellt werden: '+requestError.message);
                if (typeof broadcastDataChange === 'function') await broadcastDataChange('password_reset_requests');
                activePasswordResetRequestId = request.id;
                document.getElementById('forgot-code').value = request.request_code;
                showAuthMsg('forgot-info','Reset-Anfrage wurde an den Admin gesendet. Bitte warte auf die Freigabe.');
                return;
            }

            // 2. Nach Admin-Freigabe Passwort ändern
            if (!code) return showAuthMsg('forgot-error','Bitte den Reset-Code eingeben.');
            if (newPassword.length < 6) return showAuthMsg('forgot-error','Das neue Passwort muss mindestens 6 Zeichen lang sein.');
            if (newPassword !== newPassword2) return showAuthMsg('forgot-error','Die neuen Passwörter stimmen nicht überein.');

            let query = supabaseClient.from('password_reset_requests')
                .select('id,user_id,username,request_code,status')
                .eq('status','approved').eq('request_code',code).ilike('username',username);
            if (activePasswordResetRequestId) query=query.eq('id',activePasswordResetRequestId);
            const { data: requests, error: requestError } = await query.limit(1);
            if (requestError) return showAuthMsg('forgot-error','Reset konnte nicht geprüft werden: '+requestError.message);
            const request=requests && requests[0];
            if (!request) return showAuthMsg('forgot-error','Reset-Code ist ungültig oder wurde noch nicht vom Admin freigegeben.');

            showAuthMsg('forgot-error', 'Die sichere Passwort-Reset-Funktion wird nach Einrichtung der serverseitigen Reset-Funktion aktiviert.');
            return;
        } finally { if (submitBtn) submitBtn.disabled=false; }
    }

    async function handleRegister(event) {
        event.preventDefault();
        hideAuthMsg('register-error');
        document.getElementById('register-info').classList.remove('show');

        const username = document.getElementById('register-username').value.trim();
        const password = document.getElementById('register-password').value;
        const password2 = document.getElementById('register-password2').value;

        if (!username) return;
        if (password.length < 6) return showAuthMsg('register-error', 'Passwort muss mindestens 6 Zeichen lang sein.');
        if (password !== password2) return showAuthMsg('register-error', 'Die Passwörter stimmen nicht überein.');
        if (username.toLowerCase() === ADMIN_USERNAME) return showAuthMsg('register-error', 'Dieser Benutzername ist reserviert.');

        const submitBtn = event.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;

        try {
            const { data: authData, error: authError } = await supabaseClient.auth.signUp({
                email: getAuthEmailForUsername(username),
                password
            });
            if (authError || !authData.user) {
                const authMessage = String(authError && authError.message || '').toLowerCase();
                if (authMessage.includes('rate limit')) {
                    showAuthMsg('register-error', 'Zu viele Registrierungsversuche. Bitte später erneut versuchen oder den Testbenutzer direkt im Supabase-Dashboard anlegen.');
                } else if (authError && (authMessage.includes('already') || String(authError.code) === 'user_already_exists')) {
                    showAuthMsg('register-error', 'Dieser Benutzername ist bereits vergeben.');
                } else {
                    showAuthMsg('register-error', 'Registrierung fehlgeschlagen: ' + (authError ? authError.message : 'Auth-Benutzer konnte nicht angelegt werden.'));
                }
                return;
            }
            const { data: createdUser, error } = await supabaseClient
                .from('app_users')
                .insert([{ username, auth_user_id: authData.user.id, permission: 'view', is_admin: false, approved: false }])
                .select('id')
                .single();
            if (error) {
                await supabaseClient.auth.signOut();
                showAuthMsg('register-error', 'Benutzerprofil konnte nicht angelegt werden: ' + error.message);
                return;
            }
            if (typeof broadcastDataChange === 'function') await broadcastDataChange('app_users');
            if (createdUser && createdUser.id) await saveDefaultTabPermissionsForUser(createdUser.id);
            await supabaseClient.auth.signOut();

            event.target.reset();
            showAuthMsg('register-info', '');
            const infoEl = document.getElementById('register-info');
            infoEl.innerText = 'Konto erstellt! Bitte warte, bis der Admin dich freischaltet.';
            infoEl.classList.add('show');
        } finally {
            submitBtn.disabled = false;
        }
    }

    async function completeLogin(user, plainPassword, isAdmin) {
        currentUser = user;
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ username: user.username }));
        await enterApp();
    }

    async function tryRestoreSession() {
        const { data: sessionData } = await supabaseClient.auth.getSession();
        if (!sessionData.session) return false;

        try {
            const { data, error } = await supabaseClient
                .from('app_users')
                .select('id, username, auth_user_id, permission, approved, is_admin, avatar, theme, bio, avatar_history, special_permissions')
                .eq('auth_user_id', sessionData.session.user.id)
                .maybeSingle();
            if (error || !data || !data.approved) return false;
            const user = data;
            const localProfile = readStoredUserProfile(user.username, {});
            currentUser = { username: user.username, id: user.id, isAdmin: !!user.is_admin, isSystemAdmin: false, permission: user.permission || 'view', avatar: user.avatar !== undefined ? user.avatar : (localProfile.avatar || null), avatarHistory: Array.isArray(user.avatar_history) ? user.avatar_history : (localProfile.avatarHistory || []), theme: user.theme || localProfile.theme || 'dark', bio: user.bio || localProfile.bio || '', specialPermissions: normalizeSpecialPermissions(user.special_permissions, !!user.is_admin) };
            await enterApp();
            return true;
        } catch (e) {
            return false;
        }
    }

    async function enterApp() {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app-content').style.display = 'block';
        const loadingOverlay = document.getElementById('app-loading-overlay');
        if (loadingOverlay) loadingOverlay.classList.add('visible');

        if (!currentUser) {
            if (loadingOverlay) loadingOverlay.classList.remove('visible');
            return;
        }

        // Nur der fest eingebaute Hauptadministrator benötigt keine Rechteabfrage.
        if (currentUser.isSystemAdmin) {
            currentUser.tabPermissions = getAdminTabPermissions();
        } else {
            await loadUserTabPermissions();
        }

        document.body.classList.toggle('is-admin', !!currentUser.isAdmin);
        document.body.classList.toggle('view-only-mode', false);

        const nameEl = document.getElementById('sidebar-username');
        const roleEl = document.getElementById('sidebar-userrole');
        if (nameEl) nameEl.innerText = currentUser.username;
        if (roleEl) roleEl.innerText = currentUser.isAdmin
            ? 'Administrator'
            : (currentUser.isAdmin ? 'Administrator' : 'Benutzer – Tab-Rechte individuell');

        if (typeof applyTheme === 'function') applyTheme(currentUser.theme || 'dark');
        if (typeof updateSidebarAvatar === 'function') updateSidebarAvatar();
        if (typeof updateSidebarProfileInfo === 'function') updateSidebarProfileInfo();

        // Daten laden: Fehler dürfen den Login nicht blockieren.
        try {
            await loadDataFromSupabase();
        } catch (e) {
            console.warn('Daten konnten nach dem Login nicht vollständig geladen werden:', e);
        }

        if (currentUser.isAdmin || canViewTab('benutzer')) {
            try { await loadAppUsers(); } catch (e) { console.warn('Benutzer konnten nicht geladen werden:', e); }
            if (currentUser.isAdmin) {
                try { await loadPasswordResetRequests(); } catch (e) { console.warn('Passwort-Reset-Anfragen konnten nicht geladen werden:', e); }
            }
        }

        if (loadingOverlay) loadingOverlay.classList.remove('visible');

        updateTabVisibility();
        ensureAllowedTabSelected();
        applyPermissionUI();
        startPresence();
        startLiveSync();
    }

    async function logoutUser() {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        currentUser = null;
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
            console.error('Supabase-Abmeldung fehlgeschlagen:', error);
        }
        location.reload();
    }

    function getAdminTabPermissions() {
        return Object.fromEntries(
            TAB_DEFINITIONS.map(t => [t.key, { view: true, edit: true, del: true }])
        );
    }

    function normalizeTabPermissions(raw) {
        const result = {};
        TAB_DEFINITIONS.forEach(tab => {
            const p = raw && raw[tab.key] ? raw[tab.key] : DEFAULT_TAB_PERMISSIONS[tab.key];
            result[tab.key] = {
                view: !!p.view,
                edit: !!p.edit,
                del: DELETE_PERMISSION_TABS.has(tab.key) ? !!(p.del ?? p.delete ?? p.can_delete) : false
            };
            if (result[tab.key].edit) result[tab.key].view = true;
            if (result[tab.key].del) result[tab.key].view = true;
        });
        return result;
    }

    function canViewTab(tabName) {
        if (!currentUser) return false;
        if (currentUser.isSystemAdmin || canSpecialAction('administrator_rechte')) return true;
        if (tabName === 'benutzer') {
            return canSpecialAction('benutzer_sperren') || canSpecialAction('benutzer_loeschen');
        }
        if (tabName === 'log') return canSpecialAction('log_leeren');
        if (tabName === 'avatarlogs') return canSpecialAction('administrator_rechte');
        const p = currentUser.tabPermissions && currentUser.tabPermissions[tabName];
        return !!(p && p.view);
    }

    function canEditTab(tabName) {
        if (!currentUser) return false;
        if (currentUser.isSystemAdmin || canSpecialAction('administrator_rechte')) return true;
        if (ADMIN_ONLY_TABS.has(tabName)) return false;
        const p = currentUser.tabPermissions && currentUser.tabPermissions[tabName];
        return !!(p && p.edit);
    }

    function canDeleteTab(tabName) {
        if (!currentUser) return false;
        if (currentUser.isSystemAdmin || canSpecialAction('administrator_rechte')) return true;
        if (ADMIN_ONLY_TABS.has(tabName)) return false;
        const p = currentUser.tabPermissions && currentUser.tabPermissions[tabName];
        return !!(p && p.del);
    }

    function canSpecialAction(actionKey) {
        if (!currentUser) return false;
        if (currentUser.isSystemAdmin || !!(currentUser.specialPermissions && currentUser.specialPermissions.administrator_rechte)) return true;
        return !!(currentUser.specialPermissions && currentUser.specialPermissions[actionKey]);
    }

    function canEdit() {
        const active = document.querySelector('.tab-content.active');
        const tabName = active ? active.id.replace(/^tab-/, '') : 'uebersicht';
        return canEditTab(tabName);
    }

    async function loadUserTabPermissions() {
        currentUser.tabPermissions = normalizeTabPermissions(null);
        if (!currentUser.id) return;

        try {
            const { data, error } = await supabaseClient
                .from('app_user_tab_permissions')
                .select('tab_key, can_view, can_edit, can_delete')
                .eq('user_id', currentUser.id);

            if (error) {
                console.warn('Tab-Rechte konnten nicht geladen werden. Standard: nur Ansicht.', error.message);
                return;
            }

            if (data) {
                data.forEach(row => {
                    if (currentUser.tabPermissions[row.tab_key]) {
                        currentUser.tabPermissions[row.tab_key] = {
                            view: !!row.can_view || !!row.can_edit || !!row.can_delete,
                            edit: !!row.can_edit,
                            del: !!row.can_delete
                        };
                    }
                });
            }
        } catch (e) {
            console.warn('Tab-Rechte konnten nicht geladen werden.', e);
        }
    }

    function getFirstAllowedTab() {
        const first = TAB_DEFINITIONS.find(t => canViewTab(t.key));
        return first ? first.key : null;
    }

    function ensureAllowedTabSelected() {
        const active = document.querySelector('.tab-content.active');
        const activeName = active ? active.id.replace(/^tab-/, '') : null;
        if (activeName && canViewTab(activeName)) {
            updateTabVisibility();
            return;
        }
        const fallback = getFirstAllowedTab();
        if (fallback) switchTab(fallback, true);
        else {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        }
    }

    function updateTabVisibility() {
        document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
            const tab = btn.dataset.tab;
            const allowed = canViewTab(tab);
            btn.style.display = allowed ? '' : 'none';
        });
    }

    function lockElementIfNeeded(el) {
        if (!(el instanceof HTMLElement)) return;
        const tabContent = el.closest('.tab-content');
        if (!tabContent) return;
        const tabName = tabContent.id.replace(/^tab-/, '');
        const specialAction = el.dataset.permissionSpecial;
        if (specialAction && canSpecialAction(specialAction)) {
            el.classList.remove('view-locked');
            if (el.dataset.permissionDisabled === 'true') {
                el.disabled = false;
                delete el.dataset.permissionDisabled;
            }
            return;
        }
        if (canEditTab(tabName)) {
            el.classList.remove('view-locked');
            if (el.dataset.permissionDisabled === 'true') {
                el.disabled = false;
                delete el.dataset.permissionDisabled;
            }
            return;
        }
        const tag = el.tagName;
        const isControl = tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
        const isContentEditable = el.getAttribute && el.getAttribute('contenteditable') === 'true';
        if (!isControl && !isContentEditable) return;
        if (el.classList.contains('tab-btn')) return;

        const isDeleteAction = el.dataset.permissionAction === 'delete' || el.classList.contains('delete-action');
        const allowed = isDeleteAction ? canDeleteTab(tabName) : canEditTab(tabName);

        if (allowed) {
            el.classList.remove('view-locked');
            if (el.dataset.permissionDisabled === 'true') {
                el.disabled = false;
                delete el.dataset.permissionDisabled;
            }
            el.removeAttribute('title');
            return;
        }

        if (isContentEditable) {
            el.setAttribute('contenteditable', 'false');
        } else if (!el.matches('#log-category-filter, .filter-card select, .filter-card input')) {
            el.disabled = true;
            el.dataset.permissionDisabled = 'true';
        }
        el.classList.add('view-locked');
        el.title = isDeleteAction ? 'Keine Löschrechte für diesen Tab.' : 'Keine Bearbeitungsrechte für diesen Tab.';
    }

    function applyPermissionUI() {
        updateTabVisibility();
        document.querySelectorAll('main.content-area .tab-content').forEach(tabContent => {
            const tabName = tabContent.id.replace(/^tab-/, '');
            if (!canViewTab(tabName) && !ADMIN_ONLY_TABS.has(tabName)) {
                tabContent.classList.remove('active');
                return;
            }
            tabContent.querySelectorAll('button, input, select, textarea, [contenteditable="true"]')
                .forEach(lockElementIfNeeded);
        });
    }

    let viewOnlyObserverStarted = false;
    function setupViewOnlyObserver() {
        if (viewOnlyObserverStarted) return;
        viewOnlyObserverStarted = true;
        const target = document.querySelector('main.content-area');
        if (!target) return;
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(m => {
                m.addedNodes.forEach(node => {
                    if (!(node instanceof HTMLElement)) return;
                    lockElementIfNeeded(node);
                    node.querySelectorAll && node.querySelectorAll('button, input, select, textarea, [contenteditable="true"]').forEach(lockElementIfNeeded);
                });
            });
        });
        observer.observe(target, { childList: true, subtree: true });
    }


    function openPermissionModal(userId) {
        if (!currentUser || !currentUser.isAdmin) return;
        const user = appUsersList.find(u => String(u.id) === String(userId));
        if (!user) return;

        editingPermissionUser = user;
        editingPermissionDraft = normalizeTabPermissions(null);

        loadPermissionsForAdminUser(user.id).then(perms => {
            const normalized = Object.keys(perms).length
                ? normalizeTabPermissions(perms)
                : (user.is_admin ? getAdminTabPermissions() : normalizeTabPermissions(perms));
            normalized.special = normalizeSpecialPermissions(editingPermissionUser.special_permissions, !!editingPermissionUser.is_admin);
            editingPermissionUser.tabPermissions = normalized;
            editingPermissionDraft = normalized;
            renderPermissionModal();
            document.getElementById('permission-modal-backdrop').classList.add('open');
        });
    }

    async function loadPermissionsForAdminUser(userId) {
        const result = {};
        try {
            const { data, error } = await supabaseClient
                .from('app_user_tab_permissions')
                .select('tab_key, can_view, can_edit, can_delete')
                .eq('user_id', userId);
            if (!error && data) {
                data.forEach(row => {
                    result[row.tab_key] = {
                        view: !!row.can_view || !!row.can_edit || !!row.can_delete,
                        edit: !!row.can_edit,
                        del: !!row.can_delete
                    };
                });
            }
        } catch (e) {
            console.warn('Rechte konnten nicht geladen werden.', e);
        }
        return result;
    }

    function renderPermissionModal() {
        const grid = document.getElementById('permission-grid');
        const userEl = document.getElementById('permission-modal-user');
        if (!grid || !editingPermissionUser) return;

        userEl.innerHTML = `Benutzer: ${renderUsernameWithAvatar(editingPermissionUser.username, editingPermissionUser, { size: 'small' })}`;
        grid.innerHTML = '<div class="head">Tab</div><div class="head">Anschauen</div><div class="head">Bearbeiten</div><div class="head">Löschen</div>';
        renderSpecialPermissionModal();

        TAB_DEFINITIONS.forEach(tab => {
            const p = editingPermissionDraft[tab.key] || { view: false, edit: false, del: false };
            const supportsDelete = DELETE_PERMISSION_TABS.has(tab.key);
            grid.insertAdjacentHTML('beforeend', `
                <div class="tab-name">${tab.label}</div>
                <div>
                    <input type="checkbox" id="perm-view-${tab.key}" ${p.view ? 'checked' : ''}
                           onchange="syncPermissionCheckboxes('${tab.key}')">
                </div>
                <div>
                    <input type="checkbox" id="perm-edit-${tab.key}" ${p.edit ? 'checked' : ''}
                           onchange="syncPermissionCheckboxes('${tab.key}')">
                </div>
                <div>
                    ${supportsDelete ? `<input type="checkbox" id="perm-delete-${tab.key}" ${p.del ? 'checked' : ''}
                           onchange="syncPermissionDeleteCheckbox('${tab.key}')" title="Löschen erlauben">` : '<span style="color:var(--text-muted);">—</span>'}
                </div>
            `);
        });
    }

    function renderSpecialPermissionModal() {
        const grid = document.getElementById('special-permission-grid');
        if (!grid || !editingPermissionUser) return;
        const current = editingPermissionDraft.special || normalizeSpecialPermissions(editingPermissionUser.special_permissions, !!editingPermissionUser.is_admin);
        grid.innerHTML = SPECIAL_PERMISSION_DEFINITIONS.map(item => `
            <label class="special-permission-item">
                <input type="checkbox" id="special-perm-${item.key}" ${current[item.key] ? 'checked' : ''} ${item.key === 'administrator_rechte' && editingPermissionUser.username === ADMIN_USERNAME ? 'disabled' : ''}>
                <span>${item.label}</span>
            </label>`).join('');
    }

    function collectSpecialPermissions() {
        const result = {};
        SPECIAL_PERMISSION_DEFINITIONS.forEach(item => {
            const el = document.getElementById(`special-perm-${item.key}`);
            result[item.key] = !!(el && el.checked);
        });
        return result;
    }

    function syncPermissionCheckboxes(tabKey) {
        const view = document.getElementById(`perm-view-${tabKey}`);
        const edit = document.getElementById(`perm-edit-${tabKey}`);
        if (!view || !edit) return;
        if (edit.checked) view.checked = true;
        if (!view.checked) edit.checked = false;
    }

    function syncPermissionDeleteCheckbox(tabKey) {
        const view = document.getElementById(`perm-view-${tabKey}`);
        const del = document.getElementById(`perm-delete-${tabKey}`);
        if (!view || !del) return;
        if (del.checked) view.checked = true;
    }

    function closePermissionModal() {
        const modal = document.getElementById('permission-modal-backdrop');
        if (modal) modal.classList.remove('open');
        editingPermissionUser = null;
        editingPermissionDraft = null;
    }

    function closePermissionModalOnBackdrop(event) {
        if (event.target && event.target.id === 'permission-modal-backdrop') closePermissionModal();
    }

    function summarizePermissionChanges(previousPermissions, nextPermissions) {
        const changes = [];
        TAB_DEFINITIONS.forEach(tab => {
            const oldp = previousPermissions && previousPermissions[tab.key]
                ? previousPermissions[tab.key]
                : { view: false, edit: false, del: false };
            const newp = nextPermissions && nextPermissions[tab.key]
                ? nextPermissions[tab.key]
                : { view: false, edit: false, del: false };

            const changed = [];
            const compare = [
                { key: 'view', label: 'ansehen' },
                { key: 'edit', label: 'bearbeiten' },
                { key: 'del', label: 'löschen' }
            ];

            compare.forEach(item => {
                const oldValue = !!oldp[item.key];
                const newValue = !!newp[item.key];
                if (newValue && !oldValue) changed.push(`${item.label} hinzugefügt`);
                if (!newValue && oldValue) changed.push(`${item.label} entfernt`);
            });

            if (changed.length) {
                changes.push(`${tab.label}: ${changed.join(', ')}`);
            }
        });

        return changes;
    }

    async function saveCurrentTabPermissions() {
        if (!editingPermissionUser || !currentUser || !currentUser.isAdmin) return;
        if (saveCurrentTabPermissions.inProgress) return;
        saveCurrentTabPermissions.inProgress = true;

        const permissionUserId = editingPermissionUser.id;
        const savedUsername = editingPermissionUser.username;

        const previousPermissions = editingPermissionUser.tabPermissions
            ? JSON.parse(JSON.stringify(editingPermissionUser.tabPermissions))
            : normalizeTabPermissions(await loadPermissionsForAdminUser(permissionUserId));

        const permissions = {};
        TAB_DEFINITIONS.forEach(tab => {
            const view = document.getElementById(`perm-view-${tab.key}`);
            const edit = document.getElementById(`perm-edit-${tab.key}`);
            const del = document.getElementById(`perm-delete-${tab.key}`);
            permissions[tab.key] = {
                view: !!(view && view.checked),
                edit: !!(edit && edit.checked),
                del: DELETE_PERMISSION_TABS.has(tab.key) ? !!(del && del.checked) : false
            };
            if (permissions[tab.key].edit || permissions[tab.key].del) permissions[tab.key].view = true;
        });

        permissions.special = collectSpecialPermissions();

        const rows = TAB_DEFINITIONS.map(tab => ({
            user_id: permissionUserId,
            tab_key: tab.key,
            can_view: permissions[tab.key].view,
            can_edit: permissions[tab.key].edit,
            can_delete: permissions[tab.key].del
        }));

        try {
            const { error: deleteError } = await supabaseClient
                .from('app_user_tab_permissions')
                .delete()
                .eq('user_id', permissionUserId);
            if (deleteError) throw deleteError;

            const { error: insertError } = await supabaseClient
                .from('app_user_tab_permissions')
                .insert(rows);
            if (insertError) throw insertError;

            const isAdmin = !!permissions.special.administrator_rechte;
            const { error: userError } = await supabaseClient
                .from('app_users')
                .update({ is_admin: isAdmin, special_permissions: permissions.special })
                .eq('id', permissionUserId);
            if (userError) throw userError;

            const changedTabSummary = summarizePermissionChanges(previousPermissions, permissions);
            const specialChanges = SPECIAL_PERMISSION_DEFINITIONS.map(item => {
                const oldValue = !!(previousPermissions.special && previousPermissions.special[item.key]);
                const newValue = !!(permissions.special && permissions.special[item.key]);
                return oldValue === newValue ? null : `${item.label}: ${newValue ? 'hinzugefügt' : 'entfernt'}`;
            }).filter(Boolean);
            changedTabSummary.push(...specialChanges);
            const detailText = changedTabSummary.length ? `Tab-Rechte für Benutzer „${savedUsername}“ geändert\n\nDetails:\n${changedTabSummary.join('\n')}` : `Tab-Rechte für Benutzer „${savedUsername}“ geändert`;

            if (editingPermissionUser && String(editingPermissionUser.id) === String(permissionUserId)) {
                editingPermissionUser.tabPermissions = permissions;
                editingPermissionUser.is_admin = isAdmin;
                editingPermissionUser.special_permissions = permissions.special;
                editingPermissionUser.specialPermissions = permissions.special;
            }
            if (typeof broadcastPermissionsUpdated === 'function') {
                try {
                    await broadcastPermissionsUpdated(permissionUserId);
                } catch (broadcastError) {
                    console.warn('Berechtigungsänderung konnte nicht live verteilt werden:', broadcastError);
                }
            }
            closePermissionModal();
            renderUsersTab();
            showToast(`Die Tab-Rechte für „${savedUsername}“ wurden gespeichert.`, 'success', 'Tab-Rechte geändert');
            if (typeof broadcastDataChange === 'function') {
                await broadcastDataChange('app_user_tab_permissions');
                await broadcastDataChange('app_users');
            }
            try {
                await logActivity('Benutzerverwaltung', detailText);
            } catch (logError) {
                console.warn('Berechtigungsänderung konnte nicht protokolliert werden:', logError);
            }
        } catch (e) {
            showToast('Tab-Rechte konnten nicht gespeichert werden: ' + e.message, 'danger');
        } finally {
            saveCurrentTabPermissions.inProgress = false;
        }
    }

    // ---- Benutzerverwaltung (nur Admin) ----
    async function handleAdminCreateUser(event) {
        event.preventDefault();
        const username = document.getElementById('admin-new-username').value.trim();
        const password = document.getElementById('admin-new-password').value;
        const role = document.getElementById('admin-new-role').value;
        const memberRang = document.getElementById('admin-new-member-rang').value;
        const memberNotiz = document.getElementById('admin-new-member-notiz').value.trim();
        const isAdmin = role === 'admin';

        if (!username || password.length < 6) {
            showToast('Bitte Benutzername und Passwort (mind. 4 Zeichen) angeben.', 'danger');
            return;
        }
        if (username.toLowerCase() === ADMIN_USERNAME) {
            showToast('Der fest eingebaute Admin-Benutzername "admin" ist reserviert.', 'danger');
            return;
        }

        const submitBtn = event.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        try {
            showToast('Benutzer werden nach Einrichtung der serverseitigen Auth-Funktion durch den Admin angelegt.', 'warning');
            return;
        } finally {
            submitBtn.disabled = false;
        }
    }

    async function saveDefaultTabPermissionsForUser(userId) {
        const rows = TAB_DEFINITIONS.map(tab => ({
            user_id: userId,
            tab_key: tab.key,
            can_view: true,
            can_edit: false,
            can_delete: false
        }));
        try {
            const { error } = await supabaseClient.from('app_user_tab_permissions').insert(rows);
            if (!error && typeof broadcastDataChange === 'function') await broadcastDataChange('app_user_tab_permissions');
        } catch (e) {
            console.warn('Standard-Tab-Rechte konnten nicht angelegt werden.', e);
        }
    }

    async function loadAppUsers() {
        const { data, error } = await supabaseClient.from('app_users')
            .select('id, username, auth_user_id, permission, approved, created_at, is_admin, avatar, theme, bio, avatar_history, special_permissions, last_seen')
            .order('created_at', { ascending: false });
        if (!error && data) {
            appUsersList = data;
            renderUsersTab();
        }
    }


    async function loadPasswordResetRequests() {
        if (!currentUser || !currentUser.isAdmin) return;
        const { data, error } = await supabaseClient.from('password_reset_requests').select('*').order('created_at', { ascending: false });
        const body = document.getElementById('password-reset-requests-body');
        if (error) {
            if (body) body.innerHTML = `<tr><td colspan="5" style="color:var(--danger-color);padding:16px;">Die Tabelle "password_reset_requests" fehlt oder ist nicht erreichbar.</td></tr>`;
            return;
        }
        renderPasswordResetRequests(data || []);
    }

    function renderPasswordResetRequests(requests) {
        const body = document.getElementById('password-reset-requests-body');
        if (!body) return;
        const countEl = document.getElementById('password-reset-count');
        const openCount = (requests || []).filter(r => r.status === 'pending').length;
        if (countEl) {
            countEl.textContent = `${openCount} offen`;
            countEl.style.display = openCount ? 'inline-flex' : 'none';
        }
        if (!requests.length) {
            body.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:16px;">Keine Passwort-Zurücksetzungen vorhanden.</td></tr>`;
            return;
        }
        body.innerHTML = requests.map(r => {
            const created = r.created_at ? new Date(r.created_at).toLocaleString('de-DE') : '-';
            const statusHtml = r.status === 'approved'
                ? `<span class="status-pill approved">Freigegeben</span>`
                : r.status === 'completed'
                    ? `<span class="status-pill completed">Erledigt</span>`
                    : `<span class="status-pill pending">Wartet auf Admin</span>`;
            const actionHtml = r.status === 'pending'
                ? `<button class="btn btn-success" style="height:34px;font-size:.8rem;" onclick="approvePasswordReset(${r.id})">Freigeben</button>`
                : r.status === 'approved'
                    ? `<button class="btn" style="height:34px;font-size:.8rem;background-color:var(--card-bg-raised);color:var(--text-color);border:1px solid var(--border-color);" onclick="revokePasswordReset(${r.id})">Freigabe zurücknehmen</button>`
                    : `<span style="color:var(--text-muted);font-size:.8rem;">Abgeschlossen</span>`;
            return `<tr><td>${renderUsernameWithAvatar(r.username || '-', null, { size: 'small' })}</td><td><span class="time-text" style="letter-spacing:1px;">${r.request_code || '-'}</span></td><td>${statusHtml}</td><td class="time-text">${created}</td><td>${actionHtml}</td></tr>`;
        }).join('');
    }

    async function approvePasswordReset(id) {
        if (!currentUser || !currentUser.isAdmin) return;
        const { error } = await supabaseClient.from('password_reset_requests')
            .update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: currentUser.username })
            .eq('id', id).eq('status', 'pending');
        if (error) return showToast('Reset-Anfrage konnte nicht freigegeben werden: ' + error.message, 'danger');
        if (typeof broadcastDataChange === 'function') await broadcastDataChange('password_reset_requests');
        await loadPasswordResetRequests();
        showToast('Die Passwort-Zurücksetzung wurde für den Benutzer freigegeben.', 'success', 'Passwort-Zurücksetzung freigegeben');
    }

    async function revokePasswordReset(id) {
        if (!currentUser || !currentUser.isAdmin) return;
        const { error } = await supabaseClient.from('password_reset_requests')
            .update({ status: 'pending', approved_at: null, approved_by: null })
            .eq('id', id).eq('status', 'approved');
        if (error) return showToast('Freigabe konnte nicht zurückgenommen werden: ' + error.message, 'danger');
        if (typeof broadcastDataChange === 'function') await broadcastDataChange('password_reset_requests');
        await loadPasswordResetRequests();
        showToast('Die Freigabe wurde zurückgenommen. Der Benutzer kann noch kein neues Passwort setzen.', 'success', 'Passwort-Zurücksetzung geändert');
    }

    function renderUsersTab() {
        const tbody = document.getElementById('users-table-body');
        if (!tbody) return;

        if (appUsersList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="empty-state-cell">Noch keine Benutzer registriert.</td></tr>`;
            return;
        }

        tbody.innerHTML = appUsersList.map(u => {
            const registeredDate = u.created_at ? new Date(u.created_at).toLocaleDateString('de-DE') : '-';
            const statusHtml = u.approved
                ? `<span class="status-pill approved">Freigeschaltet</span>`
                : `<span class="status-pill pending">Wartet</span>`;
            const roleHtml = u.is_admin
                ? `<span class="status-pill approved">Administrator</span>`
                : `<span class="status-pill">Benutzer</span>`;
            const permissionButton = `<button class="btn" style="height:34px;font-size:.8rem;background-color:var(--primary-soft);color:var(--primary-bright);border:1px solid rgba(255,106,26,.35);" onclick="openPermissionModal(${u.id})">Tab-Rechte</button>`;
            return `
                <tr>
                    <td>${renderUsernameWithAvatar(u.username, u, { size: 'small' })}</td>
                    <td>
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            <span style="color:var(--text-muted);font-size:.78rem;">Aus Sicherheitsgründen nicht auslesbar</span>
                            <button type="button" class="btn" style="height:34px;font-size:.78rem;padding:6px 12px;background-color:var(--card-bg-raised);color:var(--text-color);border:1px solid var(--border-color);" onclick="openResetPasswordModal(${u.id}, decodeURIComponent('${encodeURIComponent(String(u.username))}'))">Passwort setzen / anzeigen</button>
                        </div>
                    </td>
                    <td>${statusHtml}</td>
                    <td>${roleHtml}</td>
                    <td class="time-text">${registeredDate}</td>
                    <td>
                        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                            ${permissionButton}
                            <button class="btn ${u.approved ? '' : 'btn-success'}" data-permission-special="benutzer_sperren" style="height:34px;font-size:.8rem;${u.approved ? 'background-color:var(--card-bg-raised);color:var(--text-color);border:1px solid var(--border-color);' : ''}" onclick="toggleUserApproval(${u.id}, ${!u.approved})">${u.approved ? 'Sperren' : 'Freischalten'}</button>
                            <button class="btn btn-danger" data-permission-special="benutzer_loeschen" onclick="deleteAppUser(${u.id})">Löschen</button>
                        </div>
                    </td>
                </tr>`;
        }).join('');
    }

    let resetPasswordTargetUserId = null;

    function openResetPasswordModal(id, username) {
        resetPasswordTargetUserId = id;
        document.getElementById('reset-password-modal-user').innerText = `Für Benutzer „${username}“`;
        const passwordInput = document.getElementById('reset-password-input');
        passwordInput.value = '';
        passwordInput.type = 'password';
        const visibilityBtn = document.getElementById('toggle-reset-password-visibility');
        if (visibilityBtn) {
            visibilityBtn.textContent = '👁';
            visibilityBtn.setAttribute('aria-label', 'Passwort anzeigen');
            visibilityBtn.setAttribute('title', 'Passwort anzeigen');
        }
        document.getElementById('reset-password-modal-backdrop').classList.add('open');
        setTimeout(() => document.getElementById('reset-password-input').focus(), 50);
    }

    function toggleResetPasswordVisibility() {
        const input = document.getElementById('reset-password-input');
        const btn = document.getElementById('toggle-reset-password-visibility');
        if (!input) return;
        const visible = input.type === 'text';
        input.type = visible ? 'password' : 'text';
        if (btn) {
            btn.textContent = visible ? '👁' : '🙈';
            btn.setAttribute('aria-label', visible ? 'Passwort anzeigen' : 'Passwort ausblenden');
            btn.setAttribute('title', visible ? 'Passwort anzeigen' : 'Passwort ausblenden');
        }
    }

    function closeResetPasswordModal() {
        document.getElementById('reset-password-modal-backdrop').classList.remove('open');
        resetPasswordTargetUserId = null;
    }

    function handleResetPasswordBackdropClick(event) {
        if (event.target.id === 'reset-password-modal-backdrop') closeResetPasswordModal();
    }

    async function submitResetPassword(event) {
        event.preventDefault();
        if (!resetPasswordTargetUserId) return;
        const newPassword = document.getElementById('reset-password-input').value;
        if (!newPassword || newPassword.length < 6) {
            showToast('Das Passwort muss mindestens 6 Zeichen lang sein.', 'danger');
            return;
        }
        const submitBtn = event.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        try {
            showToast('Passwortänderungen werden nach Einrichtung der serverseitigen Auth-Funktion aktiviert.', 'warning');
        } finally {
            submitBtn.disabled = false;
        }
    }

    async function toggleUserApproval(id, approve) {
        if (typeof canSpecialAction === 'function' && !canSpecialAction('benutzer_sperren')) { showToast('Du hast kein Sonderrecht zum Sperren/Freischalten von Benutzern.', 'danger', 'Aktion nicht erlaubt'); return; }
        const { error } = await supabaseClient.from('app_users').update({ approved: approve }).eq('id', id);
        if (!error) {
            const u = appUsersList.find(x => x.id === id);
            if (u) u.approved = approve;
            renderUsersTab();
            if (typeof broadcastDataChange === 'function') await broadcastDataChange('app_users');
            showToast(approve ? 'Der Benutzer kann sich wieder anmelden.' : 'Der Benutzer kann sich nicht mehr anmelden.', 'success', approve ? 'Benutzer freigeschaltet' : 'Benutzer gesperrt');
            await logActivity('Benutzerverwaltung', `Benutzer „${u ? u.username : id}“ wurde ${approve ? 'freigeschaltet' : 'gesperrt'}`, `Benutzer: ${u ? u.username : id}\nStatus: ${approve ? 'freigeschaltet' : 'gesperrt'}`);
        } else {
            showToast('Fehler: ' + error.message, 'danger');
        }
    }

    async function deleteAppUser(id) {
        if (typeof canSpecialAction === 'function' && !canSpecialAction('benutzer_loeschen')) { showToast('Du hast kein Sonderrecht zum Löschen von Benutzern.', 'danger', 'Löschen nicht erlaubt'); return; }
        if (!(await customConfirm('Diesen Benutzer wirklich löschen?'))) return;
        const deletedUser = appUsersList.find(x => x.id === id);
        const { error } = await supabaseClient.from('app_users').delete().eq('id', id);
        if (!error) {
            if (typeof broadcastDataChange === 'function') await broadcastDataChange('app_users');
            try {
                const { error: permissionsError } = await supabaseClient.from('app_user_tab_permissions').delete().eq('user_id', id);
                if (!permissionsError && typeof broadcastDataChange === 'function') await broadcastDataChange('app_user_tab_permissions');
            } catch (e) {}
            // Den zugehörigen Mitglieder-Datensatz ebenfalls entfernen.
            if (deletedUser && deletedUser.username) {
                const { error: memberDeleteError } = await supabaseClient
                    .from('members')
                    .delete()
                    .eq('name', deletedUser.username);
                if (memberDeleteError) {
                    console.warn('Mitgliedsdatensatz konnte nicht gelöscht werden:', memberDeleteError);
                } else if (typeof broadcastDataChange === 'function') {
                    await broadcastDataChange('members');
                }
            }

            appUsersList = appUsersList.filter(x => x.id !== id);
            if (typeof memberUsernamesList !== 'undefined') {
                memberUsernamesList = memberUsernamesList.filter(x => x.id !== id);
            }
            renderUsersTab();
            if (typeof renderMembersTable === 'function') renderMembersTable();
            showToast('Der Benutzer und seine gespeicherten Tab-Rechte wurden entfernt.', 'success', 'Benutzer gelöscht');
            await logActivity('Benutzerverwaltung', `Benutzer „${deletedUser ? deletedUser.username : id}“ wurde gelöscht`, `Benutzer: ${deletedUser ? deletedUser.username : id}\nAktion: gelöscht\nTab-Rechte: entfernt`);
        } else {
            showToast('Fehler: ' + error.message, 'danger');
        }
    }
