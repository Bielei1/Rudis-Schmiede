// ============ PRIVATE NACHRICHTEN ============
(() => {
    let selectedChatUser = null;
    let chatRefreshTimer = null;
    let chatUsers = [];
    let chatGroups = [];
    let selectedChatGroup = null;
    let previousUnreadCount = null;
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
        setChatMode('direct');
        document.getElementById('chat-user-picker').hidden = false;
        document.getElementById('chat-group-picker').hidden = true;
        document.getElementById('chat-conversation').hidden = true;
        document.querySelector('.chat-delete-button').hidden = true;
        document.getElementById('chat-modal-title').textContent = 'Nachrichten';
        document.getElementById('chat-modal-subtitle').textContent = 'Wähle einen Benutzer aus.';
        renderChatUserPicker();
        modal.classList.add('open');
        loadUnreadChatCount();
    }

    function setChatMode(mode) {
        document.getElementById('chat-mode-direct').classList.toggle('active', mode === 'direct');
        document.getElementById('chat-mode-groups').classList.toggle('active', mode === 'groups');
    }

    function showDirectChatList() {
        setChatMode('direct');
        document.getElementById('chat-user-picker').hidden = false;
        document.getElementById('chat-group-picker').hidden = true;
        document.getElementById('chat-conversation').hidden = true;
        document.getElementById('chat-modal-title').textContent = 'Nachrichten';
        document.getElementById('chat-modal-subtitle').textContent = 'Wähle einen Benutzer aus.';
        renderChatUserPicker();
    }

    async function showGroupChatList() {
        setChatMode('groups');
        document.getElementById('chat-user-picker').hidden = true;
        document.getElementById('chat-group-picker').hidden = false;
        document.getElementById('chat-conversation').hidden = true;
        document.getElementById('chat-modal-title').textContent = 'Gruppenchat';
        document.getElementById('chat-modal-subtitle').textContent = 'Wähle eine Gruppe aus.';
        const picker = document.getElementById('chat-group-picker');
        const { data, error } = await supabaseClient.rpc('get_my_chat_groups');
        chatGroups = data || [];
        if (error || !chatGroups.length) {
            picker.innerHTML = '<div class="chat-empty">Du bist noch keiner Gruppe zugeordnet.</div>';
            return;
        }
        picker.innerHTML = chatGroups.map(group => `
            <button type="button" class="chat-user-option" data-chat-group-id="${Number(group.id)}">
                <span class="chat-group-name"># ${escapeHtml(group.name)}</span>
                <span class="chat-user-option-arrow">Öffnen</span>
            </button>
        `).join('');
        picker.querySelectorAll('[data-chat-group-id]').forEach(button => {
            button.addEventListener('click', () => {
                const group = chatGroups.find(item => String(item.id) === button.dataset.chatGroupId);
                if (group) openGroupConversation(group);
            });
        });
    }

    function closeChatModal() {
        const modal = document.getElementById('chat-modal-backdrop');
        if (modal) modal.classList.remove('open');
        selectedChatUser = null;
        if (chatRefreshTimer) {
            clearInterval(chatRefreshTimer);
            chatRefreshTimer = null;
        }
    }

    function handleChatBackdropClick(event) {
        if (event.target && event.target.id === 'chat-modal-backdrop') closeChatModal();
    }

    function renderChatUserPicker() {
        const picker = document.getElementById('chat-user-picker');
        if (!picker) return;
        if (!chatUsers.length) {
            picker.innerHTML = '<div class="chat-empty">Keine anderen Benutzer verfügbar.</div>';
            return;
        }
        picker.innerHTML = chatUsers.map(user => `
            <button type="button" class="chat-user-option" data-chat-user-id="${Number(user.id)}">
                ${renderUsernameWithAvatar(user.username, user, { size: 'small' })}
                <span class="chat-user-option-arrow">Öffnen</span>
            </button>
        `).join('');
        picker.querySelectorAll('[data-chat-user-id]').forEach(button => {
            button.addEventListener('click', () => {
                const user = chatUsers.find(item => String(item.id) === button.dataset.chatUserId);
                if (user) openConversation(user);
            });
        });
    }

    async function openConversation(user) {
        selectedChatUser = user;
        selectedChatGroup = null;
        document.getElementById('chat-user-picker').hidden = true;
        document.getElementById('chat-conversation').hidden = false;
        document.getElementById('chat-user-picker').hidden = true;
        document.getElementById('chat-group-picker').hidden = true;
        setChatMode('direct');
        document.getElementById('chat-modal-title').textContent = `Chatverlauf mit ${user.username}`;
        document.getElementById('chat-modal-subtitle').textContent = 'Private Unterhaltung';
        await loadConversation();
        if (chatRefreshTimer) clearInterval(chatRefreshTimer);
        chatRefreshTimer = setInterval(loadConversation, 5000);
        document.getElementById('chat-message-input').focus();
    }

    async function openGroupConversation(group) {
        selectedChatGroup = group;
        selectedChatUser = null;
        document.getElementById('chat-user-picker').hidden = true;
        document.getElementById('chat-group-picker').hidden = true;
        document.getElementById('chat-conversation').hidden = false;
        document.getElementById('chat-modal-title').textContent = `Chatverlauf in # ${group.name}`;
        document.getElementById('chat-modal-subtitle').textContent = 'Gruppenunterhaltung';
        document.querySelector('.chat-delete-button').hidden = true;
        await loadGroupConversation();
        if (chatRefreshTimer) clearInterval(chatRefreshTimer);
        chatRefreshTimer = setInterval(loadGroupConversation, 5000);
        document.getElementById('chat-message-input').focus();
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
            .select('id, group_id, sender_id, message, created_at, sender:app_users(username), chat_group_message_reads(user_id, read_at)')
            .eq('group_id', selectedChatGroup.id)
            .order('created_at', { ascending: true });
        if (error) {
            showToast('Gruppennachrichten konnten nicht geladen werden: ' + error.message, 'danger');
            return;
        }
        renderConversation((data || []).map(item => ({
            ...item,
            read_at: (item.chat_group_message_reads || []).find(read => String(read.user_id) === String(currentUser.id))?.read_at,
            sender_name: item.sender?.username || 'Unbekannt'
        })));
        const unread = (data || []).filter(item => String(item.sender_id) !== String(currentUser.id)
            && !(item.chat_group_message_reads || []).some(read => String(read.user_id) === String(currentUser.id)));
        if (unread.length) {
            await supabaseClient.from('chat_group_message_reads').upsert(
                unread.map(item => ({ message_id: item.id, user_id: currentUser.id, read_at: new Date().toISOString() })),
                { onConflict: 'message_id,user_id' }
            );
        }
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
        await loadConversation();
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
        if (!selectedChatUser || !currentUser) return;
        const confirmed = await customConfirm('Dein Chatverlauf wird gelöscht.');
        if (!confirmed) return;
        const { error } = await supabaseClient.rpc('delete_user_chat', { other_user_id: selectedChatUser.id });
        if (error) {
            showToast('Chat konnte nicht gelöscht werden: ' + error.message, 'danger');
            return;
        }
        await loadConversation();
        showToast('Der Chat wurde nur für dich gelöscht.', 'success');
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
    window.showDirectChatList = showDirectChatList;
    window.showGroupChatList = showGroupChatList;
    window.openChatWithUserId = openChatWithUserId;
    window.closeChatModal = closeChatModal;
    window.handleChatBackdropClick = handleChatBackdropClick;
    window.sendChatMessage = sendChatMessage;
    window.deleteCurrentChat = deleteCurrentChat;
    window.toggleChatEmojiPicker = toggleChatEmojiPicker;
    window.loadUnreadChatCount = loadUnreadChatCount;
    window.refreshChatUserBadges = refreshChatUserBadges;
    setInterval(() => {
        if (currentUser) loadUnreadChatCount();
    }, 10000);
})();