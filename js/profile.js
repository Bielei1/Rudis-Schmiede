    // ============ PROFIL (Avatar + Theme) ============
    // Avatar wird client-seitig auf 200x200 verkleinert und als JPEG-Base64
    // direkt in app_users.avatar gespeichert (kein Supabase-Storage-Bucket
    // nötig - für kleine Profilbilder reicht das völlig).
    let pendingAvatarBase64 = null;
    let pendingProfileBio = '';
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

        const localProfile = {
            avatar: pendingAvatarBase64,
            theme: chosenTheme,
            bio: bioValue
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
        currentUser.theme = chosenTheme;
        currentUser.bio = bioValue;
        applyTheme(chosenTheme);
        updateSidebarAvatar();
        updateSidebarProfileInfo();
        closeProfileModal(false);
        showToast('Dein Profil wurde aktualisiert.', 'success', 'Profil geändert');
    }
