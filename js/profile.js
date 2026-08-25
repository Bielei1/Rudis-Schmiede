    // ============ PROFIL (Avatar + Theme) ============
    // Avatar wird client-seitig auf 200x200 verkleinert und als JPEG-Base64
    // direkt in app_users.avatar gespeichert (kein Supabase-Storage-Bucket
    // nötig - für kleine Profilbilder reicht das völlig).
    let pendingAvatarBase64 = null;
    let profileModalOriginalTheme = 'dark';

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

    function openProfileModal() {
        if (!currentUser) return;
        pendingAvatarBase64 = currentUser.avatar || null;
        profileModalOriginalTheme = currentUser.theme || 'dark';

        document.getElementById('profile-modal-username').innerText = currentUser.username;
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

                // Quadratisch zuschneiden (kürzere Seite füllt das Quadrat, Rest wird abgeschnitten).
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

    async function saveProfileChanges() {
        if (!currentUser) return;
        const chosenTheme = document.getElementById('theme-choice-light').classList.contains('active') ? 'light' : 'dark';

        const updatePayload = { avatar: pendingAvatarBase64, theme: chosenTheme };

        // Der fest eingebaute Super-Admin ist kein echter app_users-Datensatz -
        // für ihn wird nur lokal gespeichert (localStorage), sonst in Supabase.
        if (currentUser.id) {
            const { error } = await supabaseClient
                .from('app_users')
                .update(updatePayload)
                .eq('id', currentUser.id);

            if (error) {
                showToast('Profil konnte nicht gespeichert werden: ' + error.message, 'danger');
                return;
            }
        } else {
            try { localStorage.setItem('rs_admin_profile', JSON.stringify(updatePayload)); } catch (e) {}
        }

        currentUser.avatar = pendingAvatarBase64;
        currentUser.theme = chosenTheme;
        applyTheme(chosenTheme);
        updateSidebarAvatar();
        closeProfileModal(false);
        showToast('Dein Profil wurde aktualisiert.', 'success', 'Profil geändert');
    }
