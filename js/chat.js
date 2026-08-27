// ============ PRIVATE NACHRICHTEN ============
(() => {
    let selectedChatUser = null;
    let chatRefreshTimer = null;
    let chatUsers = [];
    let chatGroups = [];
    let selectedChatGroup = null;
    let previousUnreadCount = null;
    let previousGroupUnreadCount = null;
    const chatEmojis = [
        '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣',
        '😉', '😊', '🙂', '🙃', '😌', '😍', '🥰', '😘',
        '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪',
        '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒',
        '👍', '👋', '🤝',
        '❤️', '💔', '💥', '🔥', '✨', '🎉', '✅', '❌'
    ];

    function getUsers() {
        const users = typeof memberUsernamesList !== 'undefined' && Array.isArray(memberUsernamesList)
            ? memberUsernamesList
            : [];
        return users.filter(user => user.username && (!currentUser || String(user.id) !== String(currentUser.id)));
    }

    function openChatPicker() {
        const modal = document.getElementById('chat-modal-backdrop');
        if (!modal) return;
        chatUsers = getUsers();
        selectedChatUser = null;
        selectedChatGroup = null;
        document.getElementById('chat-user-picker').hidden = false;
        document.getElementById('chat-conversation').hidden = true;
        document.querySelector('.chat-delete-button').hidden = true;
        document.querySelector('.chat-leave-button').hidden = true;
        document.getElementById('chat-group-members').hidden = true;
        document.getElementById('chat-modal-title').textContent = 'Nachrichten';
        document.getElementById('chat-modal-subtitle').textContent = 'Wähle einen Benutzer aus.';
        renderChatUserPicker();
        modal.classList.add('open');
        loadUnreadChatCount();
    }

    function closeChatModal() {
        const modal = document.getElementById('chat-modal-backdrop');
        if (modal) modal.classList.remove('open');
        selectedChatUser = null;
        selectedChatGroup = null;
        if (chatRefreshTimer) {
            clearInterval(chatRefreshTimer);
            chatRefreshTimer = null;
        }
    }

    function handleChatBackdropClick(event) {
        if (event.target && event.target.id === 'chat-modal-backdrop') closeChatModal();
    }

    async function renderChatUserPicker() {
        const picker = document.getElementById('chat-user-picker');
        if (!picker) return;
        const { data: groups, error } = await supabaseClient.rpc('get_my_chat_groups');
        if (error) {
            showToast('Gruppenchats konnten nicht geladen werden: ' + error.message, 'danger');
            return;
        }
        chatGroups = groups || [];
        const directHtml = chatUsers.length ? chatUsers.map(user => `
            <button type="button" class="chat-user-option" data-chat-user-id="${Number(user.id)}">
                ${renderUsernameWithAvatar(user.username, user, { size: 'small' })}
                <span class="chat-user-option-arrow">Öffnen</span>
            </button>
        `).join('') : '<div class="chat-empty">Keine anderen Benutzer verfügbar.</div>';
        const groupHtml = `
            <div class="chat-list-heading">Gruppenchats</div>
            ${chatGroups.length ? chatGroups.map(group => `
                <button type="button" class="chat-user-option chat-group-option" data-chat-group-id="${Number(group.id)}">
                    <span class="chat-group-name"># ${escapeHtml(group.name)}</span>
                    ${Number(group.unread_count) > 0 ? `<span class="chat-user-unread-badge">${Number(group.unread_count) > 99 ? '99+' : Number(group.unread_count)}</span>` : ''}
                </button>
            `).join('') : '<div class="chat-empty">Noch keine Gruppenchats.</div>'}
            <button type="button" class="chat-create-group-button" onclick="openGroupCreateModal()">+ Gruppe erstellen</button>
        `;
        picker.innerHTML = `<div class="chat-list-heading">Direktchats</div>${directHtml}${groupHtml}`;
        picker.querySelectorAll('[data-chat-user-id]').forEach(button => {
            button.addEventListener('click', () => {
                const user = chatUsers.find(item => String(item.id) === button.dataset.chatUserId);
                if (user) openConversation(user);
            });
        });
        picker.querySelectorAll('[data-chat-group-id]').forEach(button => {
            button.addEventListener('click', () => {
                const group = chatGroups.find(item => String(item.id) === button.dataset.chatGroupId);
                if (group) openGroupConversation(group);
            });
        });
    }

    async function renderSidebarGroups() {
        const container = document.getElementById('chat-groups-sidebar');
        if (!container || !currentUser || !supabaseClient) return;

        const { data: groups, error } = await supabaseClient.rpc('get_my_chat_groups');
        if (error) {
            container.innerHTML = '';
            console.warn('Gruppenchats konnten nicht geladen werden:', error.message);
            return;
        }

        const groupUnreadCount = (groups || []).reduce((total, group) => total + Number(group.unread_count || 0), 0);
        if (previousGroupUnreadCount !== null && groupUnreadCount > previousGroupUnreadCount) {
            showToast('Neue Nachricht in einem Gruppenchat.', 'info');
        }
        previousGroupUnreadCount = groupUnreadCount;

        container.innerHTML = (groups || []).map(group => `
            <button type="button" class="chat-sidebar-group" data-chat-group-id="${Number(group.id)}">
                <span class="chat-group-name"># ${escapeHtml(group.name)}</span>
                ${Number(group.unread_count) > 0 ? `<span class="chat-user-unread-badge">${Number(group.unread_count) > 99 ? '99+' : Number(group.unread_count)}</span>` : ''}
            </button>
        `).join('');
        container.querySelectorAll('[data-chat-group-id]').forEach(button => {
            button.addEventListener('click', () => {
                const group = (groups || []).find(item => String(item.id) === button.dataset.chatGroupId);
                if (!group) return;
                const modal = document.getElementById('chat-modal-backdrop');
                if (modal) modal.classList.add('open');
                openGroupConversation(group);
            });
        });
    }

    async function openConversation(user) {
        selectedChatUser = user;
        selectedChatGroup = null;
        document.getElementById('chat-user-picker').hidden = true;
        document.getElementById('chat-conversation').hidden = false;
        document.getElementById('chat-user-picker').hidden = true;
        document.getElementById('chat-modal-title').textContent = `Chatverlauf mit ${user.username}`;
        document.getElementById('chat-modal-subtitle').textContent = 'Private Unterhaltung';
        document.querySelector('.chat-delete-button').hidden = false;
        document.querySelector('.chat-leave-button').hidden = true;
        document.getElementById('chat-group-members').hidden = true;
        await loadConversation();
        if (chatRefreshTimer) clearInterval(chatRefreshTimer);
        chatRefreshTimer = setInterval(loadConversation, 5000);
        document.getElementById('chat-message-input').focus();
    }

    async function openGroupConversation(group) {
        selectedChatGroup = group;
        selectedChatUser = null;
        document.getElementById('chat-user-picker').hidden = true;
        document.getElementById('chat-conversation').hidden = false;
        document.getElementById('chat-modal-title').textContent = `Chatverlauf in # ${group.name}`;
        document.getElementById('chat-modal-subtitle').textContent = 'Gruppenunterhaltung';
        document.querySelector('.chat-delete-button').hidden = false;
        document.querySelector('.chat-leave-button').hidden = false;
        await loadGroupMembers(group.id);
        await loadGroupConversation();
        if (chatRefreshTimer) clearInterval(chatRefreshTimer);
        chatRefreshTimer = setInterval(loadGroupConversation, 5000);
        document.getElementById('chat-message-input').focus();
    }

    async function loadGroupMembers(groupId) {
        const membersEl = document.getElementById('chat-group-members');
        if (!membersEl) return;
        const { data: memberships, error } = await supabaseClient
            .from('chat_group_members')
            .select('user_id')
            .eq('group_id', groupId);
        if (error) {
            membersEl.hidden = true;
            showToast('Gruppenmitglieder konnten nicht geladen werden: ' + error.message, 'danger');
            return;
        }
        const userIds = (memberships || []).map(item => item.user_id).filter(Boolean);
        const { data: users, error: usersError } = userIds.length
            ? await supabaseClient.from('app_users').select('id, username, avatar').in('id', userIds)
            : { data: [], error: null };
        if (usersError) {
            membersEl.hidden = true;
            showToast('Gruppenmitglieder konnten nicht geladen werden: ' + usersError.message, 'danger');
            return;
        }
        const names = (users || []).map(user => user.username).join(', ');
        membersEl.textContent = `Mitglieder: ${names || 'Keine Mitglieder'}`;
        membersEl.hidden = false;
    }

    function openGroupCreateModal() {
        const modal = document.getElementById('group-create-modal-backdrop');
        const picker = document.getElementById('group-member-picker');
        if (!modal || !picker) return;
        picker.innerHTML = getUsers().map(user => `
            <label class="group-member-option"><input type="checkbox" name="group-member" value="${Number(user.id)}"><span>${renderUsernameWithAvatar(user.username, user, { size: 'small' })}</span></label>
        `).join('') || '<div class="chat-empty">Keine weiteren Benutzer verfügbar.</div>';
        modal.classList.add('open');
    }

    function closeGroupCreateModal() {
        const modal = document.getElementById('group-create-modal-backdrop');
        if (modal) modal.classList.remove('open');
    }

    function handleGroupCreateBackdropClick(event) {
        if (event.target && event.target.id === 'group-create-modal-backdrop') closeGroupCreateModal();
    }

    async function createChatGroup(event) {
        event.preventDefault();
        const name = document.getElementById('group-name-input').value.trim();
        const memberIds = [...document.querySelectorAll('input[name="group-member"]:checked')].map(input => Number(input.value));
        if (!name) return;
        const { error } = await supabaseClient.rpc('create_chat_group', { group_name: name, member_ids: memberIds });
        if (error) {
            showToast('Gruppe konnte nicht erstellt werden: ' + error.message, 'danger');
            return;
        }
        closeGroupCreateModal();
        document.getElementById('group-name-input').value = '';
        showToast(`Gruppe „${name}“ wurde erstellt.`, 'success');
        await renderSidebarGroups();
    }

    function openChatWithUserId(userId) {
        const user = getUsers().find(item => String(item.id) === String(userId));
        if (!user) return openChatPicker();
        const modal = document.getElementById('chat-modal-backdrop');
        if (!modal) return;
        chatUsers = getUsers();
        modal.classList.add('open');
        openConversation(user);
    }

    async function loadConversation() {
        if (!selectedChatUser || !currentUser) return;
        const { data, error } = await supabaseClient
            .from('user_messages')
            .select('id, sender_id, recipient_id, message, created_at, read_at, deleted_by_sender, deleted_by_recipient')
            .or(`and(sender_id.eq.${currentUser.id},recipient_id.eq.${selectedChatUser.id}),and(sender_id.eq.${selectedChatUser.id},recipient_id.eq.${currentUser.id})`)
            .order('created_at', { ascending: true });
        if (error) {
            showToast('Nachrichten konnten nicht geladen werden: ' + error.message, 'danger');
            return;
        }
        const visibleMessages = (data || []).filter(item => String(item.sender_id) === String(currentUser.id)
            ? !item.deleted_by_sender
            : !item.deleted_by_recipient);
        renderConversation(visibleMessages);
        const unreadIds = visibleMessages.filter(item => String(item.recipient_id) === String(currentUser.id) && !item.read_at).map(item => item.id);
        if (unreadIds.length) {
            await supabaseClient.from('user_messages').update({ read_at: new Date().toISOString() }).in('id', unreadIds);
            loadUnreadChatCount();
        }
    }

    async function loadGroupConversation() {
        if (!selectedChatGroup || !currentUser) return;
        const { data, error } = await supabaseClient
            .from('chat_group_messages')
            .select('id, group_id, sender_id, message, created_at, chat_group_message_reads(user_id, read_at), chat_group_message_deletions(user_id)')
            .eq('group_id', selectedChatGroup.id)
            .order('created_at', { ascending: true });
        if (error) {
            showToast('Gruppennachrichten konnten nicht geladen werden: ' + error.message, 'danger');
            return;
        }

        const senderIds = [...new Set((data || []).map(item => item.sender_id).filter(Boolean))];
        let senderNames = new Map();
        if (senderIds.length) {
            const { data: senders, error: senderError } = await supabaseClient
                .from('app_users')
                .select('id, username')
                .in('id', senderIds);
            if (senderError) {
                showToast('Absender der Gruppennachrichten konnten nicht geladen werden: ' + senderError.message, 'danger');
                return;
            }
            senderNames = new Map((senders || []).map(sender => [String(sender.id), sender.username]));
        }

        const visibleData = (data || []).filter(item =>
            !(item.chat_group_message_deletions || []).some(read => String(read.user_id) === String(currentUser.id))
        );
        renderConversation(visibleData.map(item => ({
            ...item,
            read_at: (item.chat_group_message_reads || []).find(read => String(read.user_id) === String(currentUser.id))?.read_at,
            sender_name: senderNames.get(String(item.sender_id)) || 'Unbekannt'
        })));
        const unread = visibleData.filter(item => String(item.sender_id) !== String(currentUser.id)
            && !(item.chat_group_message_reads || []).some(read => String(read.user_id) === String(currentUser.id)));
        if (unread.length) {
            await supabaseClient.from('chat_group_message_reads').upsert(
                unread.map(item => ({ message_id: item.id, user_id: currentUser.id, read_at: new Date().toISOString() })),
                { onConflict: 'message_id,user_id' }
            );
        }
        await renderSidebarGroups();
    }

    function renderConversation(messages) {
        const container = document.getElementById('chat-messages');
        if (!container) return;
        container.innerHTML = messages.length ? messages.map(item => {
            const own = String(item.sender_id) === String(currentUser.id);
            const date = item.created_at ? new Date(item.created_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '';
            const sender = !own && item.sender_name ? `${escapeHtml(item.sender_name)} · ` : '';
            return `<div class="chat-message ${own ? 'chat-message-own' : 'chat-message-other'}"><div class="chat-message-text">${sender}${escapeHtml(item.message)}</div><div class="chat-message-meta">${date}${own ? (item.read_at ? ' · Gelesen' : ' · Gesendet') : ''}</div></div>`;
        }).join('') : '<div class="chat-empty">Noch keine Nachrichten.</div>';
        container.scrollTop = container.scrollHeight;
    }

    async function sendChatMessage(event) {
        event.preventDefault();
        if ((!selectedChatUser && !selectedChatGroup) || !currentUser) return;
        const input = document.getElementById('chat-message-input');
        const message = input.value.trim();
        if (!message) return;
        const { error } = selectedChatGroup
            ? await supabaseClient.from('chat_group_messages').insert([{ group_id: selectedChatGroup.id, sender_id: currentUser.id, message }])
            : await supabaseClient.from('user_messages').insert([{ sender_id: currentUser.id, recipient_id: selectedChatUser.id, message }]);
        if (error) {
            showToast('Nachricht konnte nicht gesendet werden: ' + error.message, 'danger');
            return;
        }
        input.value = '';
        await (selectedChatGroup ? loadGroupConversation() : loadConversation());
    }

    function toggleChatEmojiPicker(event) {
        event.stopPropagation();
        const picker = document.getElementById('chat-emoji-picker');
        if (!picker) return;
        if (!picker.innerHTML) {
            picker.innerHTML = chatEmojis.map(emoji => `<button type="button" class="chat-emoji" aria-label="${emoji}">${emoji}</button>`).join('');
            picker.querySelectorAll('.chat-emoji').forEach(button => {
                button.addEventListener('click', () => insertChatEmoji(button.textContent));
            });
        }
        picker.hidden = !picker.hidden;
    }

    function insertChatEmoji(emoji) {
        const input = document.getElementById('chat-message-input');
        const picker = document.getElementById('chat-emoji-picker');
        if (!input) return;
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? start;
        input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
        input.focus();
        input.selectionStart = input.selectionEnd = start + emoji.length;
        if (picker) picker.hidden = true;
    }

    document.addEventListener('click', event => {
        const picker = document.getElementById('chat-emoji-picker');
        const toggle = document.getElementById('chat-emoji-toggle');
        if (picker && !picker.hidden && event.target !== picker && !picker.contains(event.target) && event.target !== toggle) picker.hidden = true;
    });

    document.addEventListener('keydown', event => {
        if (event.target && event.target.id === 'chat-message-input' && event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            document.getElementById('chat-message-form').requestSubmit();
        }
    });

    async function deleteCurrentChat() {
        if ((!selectedChatUser && !selectedChatGroup) || !currentUser) return;
        const confirmed = await customConfirm('Dein Chatverlauf wird gelöscht.');
        if (!confirmed) return;
        const { error } = selectedChatGroup
            ? await supabaseClient.rpc('delete_my_chat_group_history', { target_group_id: selectedChatGroup.id })
            : await supabaseClient.rpc('delete_user_chat', { other_user_id: selectedChatUser.id });
        if (error) {
            showToast('Chat konnte nicht gelöscht werden: ' + error.message, 'danger');
            return;
        }
        await (selectedChatGroup ? loadGroupConversation() : loadConversation());
        showToast('Der Chat wurde nur für dich gelöscht.', 'success');
    }

    async function leaveCurrentGroup() {
        if (!selectedChatGroup || !currentUser) return;
        const groupId = selectedChatGroup.id;
        const groupName = selectedChatGroup.name;
        const confirmed = await customConfirm(`Möchtest du die Gruppe „${groupName}“ wirklich verlassen?`);
        if (!confirmed) return;

        const { error } = await supabaseClient.rpc('leave_chat_group', {
            target_group_id: groupId
        });
        if (error) {
            showToast('Gruppe konnte nicht verlassen werden: ' + error.message, 'danger');
            return;
        }

        closeChatModal();
        await renderSidebarGroups();
        showToast(`Du hast die Gruppe „${groupName}“ verlassen.`, 'success');
    }

    async function loadUnreadChatCount() {
        if (!currentUser) return;
        const { count, error } = await supabaseClient
            .from('user_messages')
            .select('id', { count: 'exact', head: true })
            .eq('recipient_id', currentUser.id)
            .is('read_at', null);
        if (error) return;
        const unreadCount = count || 0;
        previousUnreadCount = unreadCount;
        await refreshChatUserBadges();
        await renderSidebarGroups();
    }

    async function refreshChatUserBadges() {
        if (!currentUser) return;
        const { data, error } = await supabaseClient
            .from('user_messages')
            .select('sender_id')
            .eq('recipient_id', currentUser.id)
            .is('read_at', null);
        if (error) return;
        const counts = {};
        (data || []).forEach(item => { counts[item.sender_id] = (counts[item.sender_id] || 0) + 1; });
        document.querySelectorAll('[data-chat-user-id]').forEach(row => {
            const badge = row.querySelector('.chat-user-unread-badge');
            if (!badge) return;
            const count = counts[row.dataset.chatUserId] || 0;
            badge.textContent = count > 99 ? '99+' : String(count);
            badge.hidden = count === 0;
            badge.title = `${count} ungelesene Nachricht${count === 1 ? '' : 'en'} von diesem Benutzer`;
        });
    }

    window.openChatPicker = openChatPicker;
    window.renderSidebarGroups = renderSidebarGroups;
    window.openGroupCreateModal = openGroupCreateModal;
    window.closeGroupCreateModal = closeGroupCreateModal;
    window.handleGroupCreateBackdropClick = handleGroupCreateBackdropClick;
    window.createChatGroup = createChatGroup;
    window.openChatWithUserId = openChatWithUserId;
    window.closeChatModal = closeChatModal;
    window.handleChatBackdropClick = handleChatBackdropClick;
    window.sendChatMessage = sendChatMessage;
    window.deleteCurrentChat = deleteCurrentChat;
    window.leaveCurrentGroup = leaveCurrentGroup;
    window.toggleChatEmojiPicker = toggleChatEmojiPicker;
    window.loadUnreadChatCount = loadUnreadChatCount;
    window.refreshChatUserBadges = refreshChatUserBadges;
    setInterval(() => {
        if (currentUser) loadUnreadChatCount();
    }, 10000);
})();