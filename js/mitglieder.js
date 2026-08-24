// ============ MITGLIEDER ============
// Die Mitgliederliste zeigt automatisch alle bestehenden Login-Benutzer.
// Pro Mitglied werden ausschließlich Name, Rang, automatisch ermitteltes
// Beitrittsdatum und eine optionale Notiz angezeigt.
let memberUsernamesList = [];

async function loadMemberUsernames() {
    const { data, error } = await supabaseClient
        .from('app_users')
        .select('id, username, created_at')
        .order('username', { ascending: true });
    if (!error && data) {
        memberUsernamesList = data;
    }
}

function updateMemberRangSuggestions() {
    const datalist = document.getElementById('member-rang-suggestions');
    if (!datalist) return;
    const ranks = [...new Set(membersList.map(m => m.rang).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'de'));
    datalist.innerHTML = ranks.map(r => `<option value="${escapeHtml(r)}">`).join('');
}

function getMemberJoinedDate(user, existing) {
    // Das Datum kommt ausschließlich vom Erstellungsdatum des Login-Benutzers.
    // Ein bereits gespeichertes joinedAt bleibt erhalten.
    if (existing && existing.joinedAt) return existing.joinedAt;
    if (user.created_at) return new Date(user.created_at).toISOString().slice(0, 10);
    return '';
}

function formatMemberDate(dateValue) {
    if (!dateValue) return '-';
    const date = new Date(`${dateValue}T00:00:00`);
    return Number.isNaN(date.getTime()) ? escapeHtml(dateValue) : date.toLocaleDateString('de-DE');
}

function getMemberSalesStats(username) {
    const normalizedUsername = String(username || '').trim().toLowerCase();
    const stats = { orders: 0, productionCost: 0, total: 0 };

    if (!normalizedUsername || !Array.isArray(archivedOrdersList)) return stats;

    archivedOrdersList.forEach(order => {
        const soldBy = String(order.soldBy || '').trim().toLowerCase();
        if (!soldBy || soldBy !== normalizedUsername) return;

        stats.orders += 1;
        stats.total += Number(order.totalSum) || 0;

        if (order.totalProductionCost !== undefined && order.totalProductionCost !== null) {
            stats.productionCost += Number(order.totalProductionCost) || 0;
        } else if (Array.isArray(order.items)) {
            order.items.forEach(item => {
                const storedCost = item.productionCost !== undefined && item.productionCost !== null
                    ? Number(item.productionCost) || 0
                    : (typeof getRecipeCostPerUnit === 'function' ? (Number(getRecipeCostPerUnit(item.name)) || 0) * (Number(item.qty) || 0) : 0);
                stats.productionCost += storedCost;
            });
        }
    });

    return stats;
}

function formatMemberMoney(value) {
    return `$${(Number(value) || 0).toFixed(2)}`;
}

function renderMembersTable() {
    const tbody = document.getElementById('members-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (memberUsernamesList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 20px;">Keine Benutzer vorhanden. Lege zuerst im Tab „Benutzer" einen Account an.</td></tr>`;
        updateMemberRangSuggestions();
        return;
    }

    const sortedUsers = [...memberUsernamesList].sort((a, b) =>
        a.username.localeCompare(b.username, 'de', { sensitivity: 'base' })
    );

    tbody.innerHTML = sortedUsers.map(user => {
        const existing = membersList.find(m =>
            m.name.toLowerCase() === user.username.toLowerCase()
        );
        const rang = existing ? existing.rang || '' : '';
        const joinedAt = getMemberJoinedDate(user, existing);
        const notiz = existing ? existing.notiz || '' : '';
        const stats = getMemberSalesStats(user.username);

        return `
            <tr>
                <td class="material-name">${escapeHtml(user.username)}</td>
                <td><input type="text" id="member-rang-${user.id}" list="member-rang-suggestions" value="${escapeHtml(rang)}" placeholder="z. B. Chef" style="width: 160px;" /></td>
                <td>${formatMemberDate(joinedAt)}</td>
                <td><input type="text" id="member-note-${user.id}" value="${escapeHtml(notiz)}" placeholder="Notiz (optional)" style="width: 220px;" /></td>
                <td><strong>${stats.orders}</strong></td>
                <td><span class="current-cost">${formatMemberMoney(stats.productionCost)}</span></td>
                <td><span class="current-price">${formatMemberMoney(stats.total)}</span></td>
                <td><button class="btn" onclick="saveMemberRow('${escapeHtml(user.username)}', ${user.id})">Speichern</button></td>
            </tr>
        `;
    }).join('');

    updateMemberRangSuggestions();
}

async function saveMemberRow(username, userId) {
    const rang = document.getElementById(`member-rang-${userId}`).value.trim();
    const notiz = document.getElementById(`member-note-${userId}`).value.trim();
    const user = memberUsernamesList.find(u => u.id === userId);
    const existing = membersList.find(m =>
        m.name.toLowerCase() === username.toLowerCase()
    );
    const joinedAt = getMemberJoinedDate(user || {}, existing);

    if (existing) {
        const { error } = await supabaseClient
            .from('members')
            .update({ rang, notiz })
            .eq('id', existing.id);

        if (!error) {
            existing.rang = rang;
            existing.notiz = notiz;
            // joinedAt bleibt unverändert und wird nicht mehr vom Benutzer bearbeitet.
            renderMembersTable();
            logActivity('Mitglieder', `Mitgliedsdaten von "${username}" aktualisiert.`);
        } else {
            alert("Fehler beim Speichern: " + error.message);
        }
    } else {
        const { data, error } = await supabaseClient
            .from('members')
            .insert([{ name: username, rang, joinedAt, notiz }])
            .select();

        if (!error && data) {
            membersList.push(data[0]);
            renderMembersTable();
            logActivity('Mitglieder', `Mitgliedsdaten für "${username}" angelegt (Rang: ${rang || '-'}).`);
        } else {
            alert("Fehler beim Speichern: " + (error ? error.message : ''));
        }
    }
}
