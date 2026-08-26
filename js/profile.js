    // ============ PROFIL (Avatar + Theme) ============
    // Avatar wird client-seitig auf 200x200 verkleinert und als JPEG-Base64
    // direkt in app_users.avatar gespeichert (kein Supabase-Storage-Bucket
    // nötig - für kleine Profilbilder reicht das völlig).
    let pendingAvatarBase64 = null;
    let pendingProfileBio = '';
    let profileModalOriginalTheme = 'dark';
    let profileModalOriginalAvatar = null;
    let profileModalOriginalBio = '';
    let avatarLogsUsers = [];

    function getAvatarHistory(user) {
        const history = Array.isArray(user.avatar_history) ? user.avatar_history : (Array.isArray(user.avatarHistory) ? user.avatarHistory : []);
        return [...new Set(history.filter(avatar => typeof avatar === 'string' && avatar))];
    }

    function applyTheme(theme) {
        const value = theme === 'light' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', value);
        try { localStorage.setItem('rs_last_theme', value); } catch (e) {}
    }

    function getInitial(name) {
        return name ? name.trim().charAt(0).toUpperCase() : '?';
    }

    function renderAvatarInto(el, avatarBase64, username) {
        if (!el) return;
        if (avatarBase64) {
            el.style.backgroundImage = `url(${avatarBase64})`;
            el.innerText = '';
        } else {
            el.style.backgroundImage = 'none';
            el.innerText = getInitial(username);
        }
    }

    function updateSidebarAvatar() {
        renderAvatarInto(document.getElementById('sidebar-avatar'), currentUser ? currentUser.avatar : null, currentUser ? currentUser.username : '');
    }

    function updateSidebarProfileInfo() {
        const bioEl = document.getElementById('sidebar-user-bio');
        if (!bioEl) return;
        const bio = currentUser && currentUser.bio ? String(currentUser.bio).trim() : '';
        bioEl.textContent = bio;
        bioEl.style.display = bio ? 'block' : 'none';
    }

    function openProfileModal() {
        if (!currentUser) return;
        pendingAvatarBase64 = currentUser.avatar || null;
        pendingProfileBio = currentUser.bio || '';
        profileModalOriginalTheme = currentUser.theme || 'dark';
        profileModalOriginalAvatar = currentUser.avatar || null;
        profileModalOriginalBio = String(currentUser.bio || '').replace(/\s+/g, ' ').trim();

        document.getElementById('profile-modal-username').innerText = currentUser.username;
        document.getElementById('profile-bio-input').value = pendingProfileBio;
        renderAvatarInto(document.getElementById('profile-avatar-preview'), pendingAvatarBase64, currentUser.username);
        updateThemeChoiceButtons(profileModalOriginalTheme);

        document.getElementById('profile-modal-backdrop').classList.add('open');
    }

    function closeProfileModal(revertTheme) {
        if (revertTheme) {
            applyTheme(profileModalOriginalTheme);
        }
        document.getElementById('profile-modal-backdrop').classList.remove('open');
        pendingAvatarBase64 = null;
        pendingProfileBio = '';
        profileModalOriginalAvatar = null;
        profileModalOriginalBio = '';
        const fileInput = document.getElementById('profile-avatar-input');
        if (fileInput) fileInput.value = '';
    }

    function handleProfileModalBackdropClick(event) {
        if (event.target.id === 'profile-modal-backdrop') closeProfileModal(true);
    }

    function updateThemeChoiceButtons(activeTheme) {
        document.getElementById('theme-choice-dark').classList.toggle('active', activeTheme !== 'light');
        document.getElementById('theme-choice-light').classList.toggle('active', activeTheme === 'light');
    }

    function applyThemeChoice(theme) {
        // Live-Vorschau: sofort anwenden, gespeichert wird erst bei "Speichern".
        applyTheme(theme);
        updateThemeChoiceButtons(theme);
    }

    function handleAvatarFileSelected(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            showToast('Bitte eine Bilddatei auswählen.', 'danger');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const size = 200;
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');

                const minSide = Math.min(img.width, img.height);
                const sx = (img.width - minSide) / 2;
                const sy = (img.height - minSide) / 2;
                ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);

                pendingAvatarBase64 = canvas.toDataURL('image/jpeg', 0.75);
                renderAvatarInto(document.getElementById('profile-avatar-preview'), pendingAvatarBase64, currentUser.username);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function resetProfileAvatar() {
        pendingAvatarBase64 = null;
        const input = document.getElementById('profile-avatar-input');
        if (input) input.value = '';
        renderAvatarInto(document.getElementById('profile-avatar-preview'), null, currentUser ? currentUser.username : '');
    }

    async function saveProfileChanges() {
        if (!currentUser) return;
        const chosenTheme = document.getElementById('theme-choice-light').classList.contains('active') ? 'light' : 'dark';
        const bioValue = String(document.getElementById('profile-bio-input').value || '').replace(/\s+/g, ' ').trim();
        pendingProfileBio = bioValue;
        const avatarChanged = pendingAvatarBase64 !== profileModalOriginalAvatar;
        const bioChanged = bioValue !== profileModalOriginalBio;
        const previousAvatar = profileModalOriginalAvatar;
        const newAvatar = pendingAvatarBase64;
        const previousBio = profileModalOriginalBio;

        const localProfile = {
            avatar: pendingAvatarBase64,
            theme: chosenTheme,
            bio: bioValue,
            avatarHistory: [...new Set([
                ...getAvatarHistory(currentUser),
                profileModalOriginalAvatar,
                pendingAvatarBase64
            ].filter(Boolean))]
        };

        if (currentUser.id) {
            const dbPayload = { avatar: pendingAvatarBase64, theme: chosenTheme, bio: bioValue };
            try {
                const { error } = await supabaseClient
                    .from('app_users')
                    .update(dbPayload)
                    .eq('id', currentUser.id);

                if (error) {
                    showToast('Profil konnte nicht in Supabase gespeichert werden: ' + error.message + '. Prüfe, ob in app_users die Spalte "bio" existiert.', 'danger');
                    return;
                }
                const { error: historyError } = await supabaseClient
                    .from('app_users')
                    .update({ avatar_history: localProfile.avatarHistory })
                    .eq('id', currentUser.id);
                if (historyError) {
                    console.warn('Avatar-Historie konnte nicht gespeichert werden:', historyError.message);
                }
            } catch (e) {
                console.warn('Profil-DB-Update fehlgeschlagen.', e);
                showToast('Profil konnte nicht in Supabase gespeichert werden.', 'danger');
                return;
            }

            try {
                saveStoredUserProfile(currentUser.username, localProfile);
            } catch (e) {}
        } else {
            try {
                localStorage.setItem('rs_admin_profile', JSON.stringify(localProfile));
                saveStoredUserProfile(currentUser.username, localProfile);
            } catch (e) {}
        }

        currentUser.avatar = pendingAvatarBase64;
        currentUser.avatarHistory = localProfile.avatarHistory;
        currentUser.theme = chosenTheme;
        currentUser.bio = bioValue;
        applyTheme(chosenTheme);
        updateSidebarAvatar();
        updateSidebarProfileInfo();
        if (typeof presenceChannel !== 'undefined' && presenceChannel) {
            await presenceChannel.track({
                username: currentUser.username,
                isAdmin: !!currentUser.isAdmin,
                avatar: currentUser.avatar || null
            });
            if (typeof syncPresenceAvatars === 'function') syncPresenceAvatars();
            renderOnlineUsers();
        }
        closeProfileModal(false);
        showToast('Dein Profil wurde aktualisiert.', 'success', 'Profil geändert');

        if (avatarChanged || bioChanged) {
            const changed = [];
            if (avatarChanged) {
                changed.push('Avatar geändert');
                changed.push(`Avatar vorher: ${previousAvatar || '__NO_AVATAR__'}`);
                changed.push(`Avatar nachher: ${newAvatar || '__NO_AVATAR__'}`);
            }
            if (bioChanged) {
                changed.push(`Bio geändert: „${previousBio || '-'}“ → „${bioValue || '-'}“`);
            }
            await logActivity(
                'Profil',
                `Profil von „${currentUser.username}“ wurde geändert`,
                changed.join('\n')
            );
        }
    }

    async function loadAvatarLogs() {
        if (!currentUser || !currentUser.isAdmin) return;
        const { data, error } = await supabaseClient
            .from('app_users')
            .select('id, username, avatar, avatar_history')
            .order('username', { ascending: true });
        if (error) {
            const grid = document.getElementById('avatar-logs-grid');
            if (grid) grid.innerHTML = `<div class="avatar-logs-empty">Avatar-Historie konnte nicht geladen werden. Prüfe die Spalte „avatar_history“ in app_users.</div>`;
            return;
        }
        avatarLogsUsers = data || [];

        renderAvatarLogs();
    }

    function renderAvatarLogs() {
        const grid = document.getElementById('avatar-logs-grid');
        if (!grid) return;
        grid.innerHTML = '';
        let count = 0;
        avatarLogsUsers.forEach(user => {
            const avatars = getAvatarHistory(user);
            if (user.avatar && !avatars.includes(user.avatar)) avatars.push(user.avatar);
            if (!avatars.length) return;
            const card = document.createElement('section');
            card.className = 'avatar-log-card';
            const title = document.createElement('h3');
            title.textContent = user.username || 'Unbekannt';
            card.appendChild(title);
            const list = document.createElement('div');
            list.className = 'avatar-log-list';
            avatars.forEach((avatar, index) => {
                count++;
                const item = document.createElement('div');
                item.className = 'avatar-log-item';
                const image = document.createElement('div');
                image.className = 'avatar-log-image';
                image.style.backgroundImage = `url(${avatar})`;
                const status = document.createElement('span');
                const isCurrent = user.avatar === avatar;
                status.className = `avatar-log-status ${isCurrent ? 'is-current' : 'is-archived'}`;
                status.textContent = isCurrent ? 'Aktuell gesetzt' : 'Nicht aktuell';
                const button = document.createElement('button');
                button.className = 'btn btn-danger';
                button.textContent = 'Avatar löschen';
                button.type = 'button';
                button.addEventListener('click', () => deleteAvatarLog(user, avatar));
                item.append(image, status, button);
                list.appendChild(item);
            });
            card.appendChild(list);
            grid.appendChild(card);
        });
        if (!count) grid.innerHTML = '<div class="avatar-logs-empty">Noch keine gespeicherten Avatare vorhanden.</div>';
    }

    async function deleteAvatarLog(user, avatar) {
        if (!currentUser || !currentUser.isAdmin) return;
        if (!await customConfirm(`Diesen Avatar von „${user.username}“ wirklich löschen?`)) return;
        const history = getAvatarHistory(user).filter(item => item !== avatar);
        const isCurrent = user.avatar === avatar;
        const { error } = await supabaseClient
            .from('app_users')
            .update({ avatar_history: history, ...(isCurrent ? { avatar: null } : {}) })
            .eq('id', user.id);
        if (error) {
            showToast('Avatar konnte nicht gelöscht werden: ' + error.message, 'danger');
            return;
        }
        user.avatar_history = history;
        if (isCurrent) user.avatar = null;
        if (typeof appUsersList !== 'undefined' && Array.isArray(appUsersList)) {
            const appUser = appUsersList.find(item => Number(item.id) === Number(user.id));
            if (appUser) {
                appUser.avatar_history = history;
                if (isCurrent) appUser.avatar = null;
            }
        }
        if (typeof memberUsernamesList !== 'undefined' && Array.isArray(memberUsernamesList)) {
            const memberUser = memberUsernamesList.find(item => Number(item.id) === Number(user.id));
            if (memberUser && isCurrent) memberUser.avatar = null;
        }
        if (currentUser.id === user.id && isCurrent) {
            currentUser.avatar = null;
            currentUser.avatarHistory = history;
            updateSidebarAvatar();
        }
        if (typeof renderMembersTable === 'function') renderMembersTable();
        if (typeof renderUsersTab === 'function') renderUsersTab();
        renderAvatarLogs();
        await logActivity(
            'Profil',
            `Avatar von „${user.username}“ wurde gelöscht`,
            `Benutzer: ${user.username}\nAktion: Avatar aus Avatar-Logs entfernt${isCurrent ? ' und beim Benutzer zurückgesetzt' : ''}`
        );
        showToast('Avatar wurde gelöscht.', 'success', 'Avatar gelöscht');
    }
