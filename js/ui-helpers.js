    // ============ EIGENES BESTÄTIGUNGS-MODAL (ersetzt Browser-confirm()) ============
    let confirmModalResolver = null;
    function customConfirm(message) {
        return new Promise((resolve) => {
            confirmModalResolver = resolve;
            document.getElementById('confirm-modal-message').innerText = message;
            document.getElementById('confirm-modal-backdrop').classList.add('open');
            setTimeout(() => document.getElementById('confirm-modal-confirm-btn').focus(), 50);
        });
    }
    function resolveConfirmModal(result) {
        document.getElementById('confirm-modal-backdrop').classList.remove('open');
        if (confirmModalResolver) {
            confirmModalResolver(result);
            confirmModalResolver = null;
        }
    }
    function handleConfirmBackdropClick(event) {
        if (event.target.id === 'confirm-modal-backdrop') resolveConfirmModal(false);
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('confirm-modal-backdrop').classList.contains('open')) {
            resolveConfirmModal(false);
        }
    });

    // ============ TOAST-BENACHRICHTIGUNGEN (ersetzt Browser-alert()) ============
    // Zeigt unten rechts verständlich an, WAS geändert wurde.
    function showToast(message, type, title) {
        const text = String(message);
        if (!type) {
            type = /fehler|nicht|fehlgeschlagen/i.test(text) ? 'danger' : 'success';
        }

        const titles = {
            success: title || 'Änderung gespeichert',
            danger: title || 'Änderung nicht durchgeführt',
            info: title || 'Information'
        };
        const icons = {
            success: '✓',
            danger: '!',
            info: 'i'
        };

        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-header">
                <span class="toast-icon">${icons[type] || 'i'}</span>
                <span>${escapeHtml(titles[type] || 'Information')}</span>
            </div>
            <div class="toast-message">${escapeHtml(text)}</div>
            <div class="toast-progress"></div>
        `;
        container.appendChild(toast);

        requestAnimationFrame(() => toast.classList.add('toast-visible'));

        setTimeout(() => {
            toast.classList.remove('toast-visible');
            setTimeout(() => toast.remove(), 300);
        }, 4200);
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function getUserByUsername(username) {
        const raw = String(username ?? '').trim();
        if (!raw || raw === '-' || raw === '–') return null;
        const normalized = raw.toLowerCase();

        const userLists = [];
        if (typeof currentUser !== 'undefined' && currentUser && String(currentUser.username || '').trim().toLowerCase() === normalized) {
            return currentUser;
        }
        if (typeof appUsersList !== 'undefined' && Array.isArray(appUsersList)) userLists.push(appUsersList);
        if (typeof memberUsernamesList !== 'undefined' && Array.isArray(memberUsernamesList)) userLists.push(memberUsernamesList);

        for (const list of userLists) {
            const match = list.find(user => String(user && user.username || '').trim().toLowerCase() === normalized);
            if (match) return match;
        }
        return null;
    }

    function renderUsernameWithAvatar(username, user = null, options = {}) {
        const raw = String(username ?? '').trim();
        const safeName = (!raw || raw === '-' || raw === '–') ? 'Unbekannt' : raw;
        const resolvedUser = user && String(user.username || '').trim()
            ? user
            : getUserByUsername(safeName);
        const avatarSource = resolvedUser && typeof resolvedUser.avatar === 'string'
            ? resolvedUser.avatar.trim()
            : '';
        const size = options.size || 'small';
        const suffix = options.suffix || '';
        const className = options.className ? ` ${options.className}` : '';
        const initials = safeName ? safeName.charAt(0).toUpperCase() : '?';

        const avatarHtml = avatarSource
            ? `<span class="user-tag-avatar user-tag-avatar--image user-tag-avatar--${escapeHtml(size)}">`
                + `<img src="${escapeHtml(avatarSource)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'; this.parentElement.classList.add('user-tag-avatar--fallback'); this.parentElement.textContent='${escapeHtml(initials)}';">`
              + `</span>`
            : `<span class="user-tag-avatar user-tag-avatar--fallback user-tag-avatar--${escapeHtml(size)}" aria-label="${escapeHtml(safeName)}">${escapeHtml(initials)}</span>`;

        return `<span class="user-tag user-tag--${escapeHtml(size)}${className}">${avatarHtml}<span class="user-tag-name">${escapeHtml(safeName)}${escapeHtml(suffix)}</span></span>`;
    }

    async function archiveInsertWithDiscountFallback(payload) {
        const preferredPayload = {
            ...payload,
            discount_percent: payload.discount_percent ?? payload.discountPercent ?? payload.discount ?? 0
        };
        delete preferredPayload.discountPercent;
        delete preferredPayload.discount;

        const { data, error } = await supabaseClient.from('archive').insert([preferredPayload]).select();
        if (!error) return { data, error: null };

        const missingDiscountColumn = /discount/i.test(error.message || '') || /column .*discount/i.test(error.message || '');
        if (!missingDiscountColumn) throw error;

        const fallbackPayload = { ...payload };
        delete fallbackPayload.discount_percent;
        delete fallbackPayload.discountPercent;
        delete fallbackPayload.discount;

        const { data: fallbackData, error: fallbackError } = await supabaseClient.from('archive').insert([fallbackPayload]).select();
        if (fallbackError) throw fallbackError;
        return { data: fallbackData, error: null };
    }
    window.alert = function (message) {
        showToast(message);
    };

    // Gemeinsamer Helfer für die "Rohstoffe vorhanden/fehlen"-Badges,
    // vorher an 3 Stellen (bestellungen.js, herstellung.js) fast identisch dupliziert.
    function buildStatusBadge(ok, okText, missingText) {
        return ok
            ? `<span class="req-status status-ok">✓ ${okText}</span>`
            : `<span class="req-status status-missing">✕ ${missingText}</span>`;
    }
