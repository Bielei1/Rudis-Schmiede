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

