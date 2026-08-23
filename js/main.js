    window.addEventListener('DOMContentLoaded', () => {
        initOrderPositionInputs();
        initCustomerPricePositionInputs();
        initRecipeIngredientInputs();
        tryRestoreSession();
    });

    // Live-Uhr: zeigt die lokale Uhrzeit des Geräts an und aktualisiert sich jede Sekunde.
    function updateLiveClock() {
        const clock = document.getElementById('live-clock');
        if (!clock) return;

        const now = new Date();
        const dateEl = document.getElementById('live-date');
        const timeEl = document.getElementById('live-time');

        if (dateEl) {
            dateEl.textContent = now.toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        }

        if (timeEl) {
            timeEl.textContent = now.toLocaleTimeString('de-DE', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
        }
    }

    updateLiveClock();
    setInterval(updateLiveClock, 1000);

