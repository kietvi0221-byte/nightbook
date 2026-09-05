let currentMood = 'calm';
let skyLevel = 1;
let isLoginMode = true;
let currentChatUserId = null;
let currentChatFriendshipStatus = 'none'; // 'accepted', 'pending', 'received_request', 'none'
let currentUser = null; // Lưu thông tin người dùng đang đăng nhập

// Cache dữ liệu client
const dataCache = {
    privateEntries: null,
    publicEntries: null,
    friends: null,
    leaderboard: null
};

// Khởi tạo kết nối Socket.IO
const socket = io();

// ----------------------------------------------------
// CÁC SỰ KIỆN SOCKET.IO REALTIME
// ----------------------------------------------------

socket.on('connect', () => {
    socket.emit('join_room', {});
});

// Realtime nhận tin nhắn
socket.on('receive_message', (msg) => {
    if (currentChatUserId && (msg.sender_id === currentChatUserId || msg.receiver_id === currentChatUserId)) {
        appendSingleMessage(msg);
    }
});

// Realtime nhận lời mời kết bạn
socket.on('receive_friend_request', (data) => {
    alert(`📩 ${data.message || 'Bạn vừa nhận được một lời mời kết bạn mới!'}`);
    
    dataCache.friends = null;
    
    if (currentChatUserId === data.sender_id) {
        updateChatUIStatus('received_request', data.sender_id);
    }
});

// Realtime khi lời mời kết bạn được chấp nhận
socket.on('friend_request_accepted', (data) => {
    alert(`🎉 ${data.message || 'Lời mời kết bạn đã được chấp nhận!'}`);
    
    dataCache.friends = null;
    loadFriends();

    if (currentChatUserId === data.friend_id) {
        updateChatUIStatus('accepted', data.friend_id);
        loadMessages();
    }
});

// ----------------------------------------------------
// SETUP BAN ĐẦU & EVENT LISTENERS
// ----------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupEventListeners();
});

function setupEventListeners() {
    // Chuyển Tab
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            
            btn.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');

            if (tabId === 'tab-leaderboard') loadLeaderboard();
            if (tabId === 'tab-chat') loadFriends();
        });
    });

    // Chọn cảm xúc
    document.querySelectorAll('.mood-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMood = btn.getAttribute('data-mood');
        });
    });

    // Toggle Đăng nhập / Đăng ký
    document.getElementById('auth-toggle-link').addEventListener('click', (e) => {
        e.preventDefault();
        isLoginMode = !isLoginMode;
        document.getElementById('auth-title').innerText = isLoginMode ? '🌙 Chào mừng tới NightBook' : '✨ Tạo tài khoản mới';
        document.getElementById('auth-submit-btn').innerText = isLoginMode ? 'Đăng nhập' : 'Đăng ký';
        document.getElementById('auth-toggle-prompt').innerText = isLoginMode ? 'Chưa có tài khoản?' : 'Đã có tài khoản?';
        document.getElementById('auth-toggle-link').innerText = isLoginMode ? 'Đăng ký ngay' : 'Đăng nhập';
        document.getElementById('auth-error').style.display = 'none';
    });

    document.getElementById('auth-submit-btn').addEventListener('click', handleAuth);

    document.getElementById('logout-btn').addEventListener('click', async () => {
        await fetch('/api/logout', { method: 'POST' });
        location.reload();
    });

    // Đăng nhật ký - Optimistic UI
    document.getElementById('submit-btn').addEventListener('click', async () => {
        const contentInput = document.getElementById('entry-content');
        const content = contentInput.value.trim();
        const isPublic = document.getElementById('is-public').checked;

        if (!content) return alert('Hãy viết vài dòng tâm sự nhé!');

        const newEntry = {
            content,
            mood: currentMood,
            created_at: new Date().toISOString(),
            username: 'Bạn'
        };

        prependEntryToUI(newEntry, isPublic);
        contentInput.value = '';

        try {
            await fetch('/api/entries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, mood: currentMood, is_public: isPublic })
            });
        } catch (err) {
            console.error('Lỗi lưu nhật ký:', err);
        }
    });

    document.getElementById('send-msg-btn').addEventListener('click', sendMessage);
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
}

// ----------------------------------------------------
// QUẢN LÝ TÀI KHOẢN & XÁC THỰC
// ----------------------------------------------------

async function handleAuth() {
    const username = document.getElementById('auth-username').value;
    const password = document.getElementById('auth-password').value;
    const errorDiv = document.getElementById('auth-error');
    const submitBtn = document.getElementById('auth-submit-btn');

    if (!username.trim() || !password.trim()) {
        errorDiv.innerText = 'Vui lòng điền đầy đủ thông tin!';
        errorDiv.style.display = 'block';
        return;
    }

    submitBtn.innerText = 'Đang xử lý...';
    submitBtn.disabled = true;

    const url = isLoginMode ? '/api/login' : '/api/register';
    
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();
        if (res.ok) {
            errorDiv.style.display = 'none';
            checkAuth();
        } else {
            errorDiv.innerText = data.error || 'Có lỗi xảy ra!';
            errorDiv.style.display = 'block';
        }
    } catch (err) {
        errorDiv.innerText = 'Lỗi kết nối máy chủ!';
        errorDiv.style.display = 'block';
    } finally {
        submitBtn.innerText = isLoginMode ? 'Đăng nhập' : 'Đăng ký';
        submitBtn.disabled = false;
    }
}

async function checkAuth() {
    try {
        const res = await fetch('/api/user');
        const data = await res.json();
        
        const modal = document.getElementById('auth-modal');
        const appContainer = document.querySelector('.app-container');

        if (data.logged_in) {
            currentUser = data;
            modal.style.display = 'none';
            appContainer.style.display = 'block';
            
            document.getElementById('streak-val').innerText = data.streak_count;
            document.getElementById('sky-level-val').innerText = `Cấp ${data.sky_level}`;
            skyLevel = data.sky_level;
            
            socket.emit('join_room', {});

            loadPrivateEntries();
            loadPublicEntries();
        } else {
            appContainer.style.display = 'none';
            modal.style.display = 'flex';
        }
    } catch (err) {
        console.error("Lỗi xác thực:", err);
    }
}

// ----------------------------------------------------
// HIỂN THỊ VÀ TẢI NHẬT KÝ
// ----------------------------------------------------

function prependEntryToUI(entry, isPublic) {
    const containerId = isPublic ? 'public-entries-list' : 'private-entries-list';
    const container = document.getElementById(containerId);
    
    const div = document.createElement('div');
    div.className = 'entry-card';
    div.innerHTML = `
        <div class="entry-header">
            <span>${isPublic ? '👤 ' + entry.username : 'Cảm xúc: ' + entry.mood}</span>
            <span>Vừa xong</span>
        </div>
        <p>${entry.content}</p>
    `;
    container.insertBefore(div, container.firstChild);
}

async function loadPrivateEntries() {
    if (dataCache.privateEntries) renderPrivateEntries(dataCache.privateEntries);
    
    const res = await fetch('/api/entries/private');
    if (res.ok) {
        const entries = await res.json();
        dataCache.privateEntries = entries;
        renderPrivateEntries(entries);
    }
}

function renderPrivateEntries(entries) {
    const container = document.getElementById('private-entries-list');
    container.innerHTML = entries.map(e => `
        <div class="entry-card">
            <div class="entry-header">
                <span>Cảm xúc: ${e.mood}</span>
                <span>${new Date(e.created_at).toLocaleString('vi-VN')}</span>
            </div>
            <p>${e.content}</p>
        </div>
    `).join('');
}

async function loadPublicEntries() {
    if (dataCache.publicEntries) renderPublicEntries(dataCache.publicEntries);
    
    const res = await fetch('/api/entries/public');
    if (res.ok) {
        const entries = await res.json();
        dataCache.publicEntries = entries;
        renderPublicEntries(entries);
    }
}

function renderPublicEntries(entries) {
    const container = document.getElementById('public-entries-list');
    container.innerHTML = entries.map(e => `
        <div class="entry-card">
            <div class="entry-header">
                <span>👤 ${e.username}</span>
                <div>
                    <button class="add-friend-btn" onclick="sendFriendRequest(${e.user_id})">➕ Kết bạn</button>
                    <span>${new Date(e.created_at).toLocaleString('vi-VN')}</span>
                </div>
            </div>
            <p>${e.content}</p>
        </div>
    `).join('');
}

// ----------------------------------------------------
// KẾT BẠN & KHUNG CHAT REALTIME
// ----------------------------------------------------

async function sendFriendRequest(friendId) {
    try {
        const res = await fetch('/api/friends/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ friend_id: friendId })
        });
        const data = await res.json();
        
        if (res.ok) {
            socket.emit('send_friend_request', {
                sender_id: currentUser ? currentUser.id : null,
                sender_name: currentUser ? currentUser.username : 'Bạn',
                receiver_id: friendId
            });

            alert(data.message || 'Đã gửi yêu cầu kết bạn!');
            if (currentChatUserId === friendId) {
                updateChatUIStatus('pending', friendId);
            }
        } else {
            alert(data.error || 'Không thể gửi kết bạn');
        }
    } catch (err) {
        alert('Có lỗi kết nối khi gửi kết bạn!');
    }
}

async function acceptFriendRequest(senderId) {
    try {
        const res = await fetch('/api/friends/accept', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sender_id: senderId })
        });
        const data = await res.json();

        if (res.ok) {
            socket.emit('accept_friend_request', {
                user_id: currentUser ? currentUser.id : null,
                user_name: currentUser ? currentUser.username : 'Bạn',
                friend_id: senderId
            });

            alert(data.message || 'Đã đồng ý kết bạn!');
            dataCache.friends = null;
            loadFriends();

            if (currentChatUserId === senderId) {
                updateChatUIStatus('accepted', senderId);
                loadMessages();
            }
        } else {
            alert(data.error || 'Không thể chấp nhận lời mời');
        }
    } catch (err) {
        alert('Có lỗi kết nối khi chấp nhận kết bạn!');
    }
}

async function loadFriends() {
    if (dataCache.friends) renderFriends(dataCache.friends);

    const res = await fetch('/api/friends');
    if (res.ok) {
        const friends = await res.json();
        dataCache.friends = friends;
        renderFriends(friends);
    }
}

function renderFriends(friends) {
    const container = document.getElementById('friends-list');
    if (!container) return;

    if (friends.length === 0) {
        container.innerHTML = '<p style="font-size:0.85rem; padding:15px; text-align:center; color:#94a3b8;">Chưa có bạn bè.</p>';
        return;
    }

    container.innerHTML = friends.map(f => `
        <div class="friend-item ${currentChatUserId === f.id ? 'active' : ''}" onclick="openChat(${f.id}, '${f.username}', '${f.status || 'accepted'}')">
            <div class="avatar-circle">${f.username.charAt(0).toUpperCase()}</div>
            <div class="friend-info">
                <span class="friend-name">${f.username}</span>
                <span class="friend-level">🌌 Cấp ${f.sky_level}</span>
            </div>
        </div>
    `).join('');
}

async function openChat(friendId, username, status = 'accepted') {
    currentChatUserId = friendId;
    document.getElementById('active-chat-user').innerText = username;
    document.getElementById('chat-header-avatar').innerText = username.charAt(0).toUpperCase();
    document.getElementById('chat-header-status').style.display = 'inline';
    
    document.querySelectorAll('.friend-item').forEach(el => el.classList.remove('active'));
    
    updateChatUIStatus(status, friendId);

    if (status === 'accepted') {
        loadMessages();
    } else {
        document.getElementById('chat-messages').innerHTML = '';
    }
}

function updateChatUIStatus(status, friendId) {
    currentChatFriendshipStatus = status;
    
    const inputContainer = document.querySelector('.chat-input-container') || document.getElementById('chat-input-area');
    let noticeArea = document.getElementById('friend-notice-area');

    if (!noticeArea && inputContainer) {
        noticeArea = document.createElement('div');
        noticeArea.id = 'friend-notice-area';
        noticeArea.className = 'friend-notice-box';
        inputContainer.parentNode.insertBefore(noticeArea, inputContainer);
    }

    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-msg-btn');

    if (status === 'accepted') {
        if (chatInput) chatInput.disabled = false;
        if (sendBtn) sendBtn.disabled = false;
        if (noticeArea) noticeArea.style.display = 'none';
        if (inputContainer) inputContainer.style.display = 'flex';
    } else {
        if (chatInput) chatInput.disabled = true;
        if (sendBtn) sendBtn.disabled = true;
        if (inputContainer) inputContainer.style.display = 'none';

        if (noticeArea) {
            noticeArea.style.display = 'block';
            if (status === 'pending') {
                noticeArea.innerHTML = `<p class="notice-text">⏳ Đã gửi lời mời kết bạn. Đang chờ đối phương đồng ý...</p>`;
            } else if (status === 'received_request') {
                noticeArea.innerHTML = `
                    <p class="notice-text">Người này đã gửi lời mời kết bạn cho cậu.</p>
                    <button onclick="acceptFriendRequest(${friendId})" class="btn-accept">✅ Chấp nhận lời mời</button>
                `;
            } else {
                noticeArea.innerHTML = `
                    <p class="notice-text">🔒 Cần trở thành bạn bè để nhắn tin cho nhau.</p>
                    <button onclick="sendFriendRequest(${friendId})" class="btn-add-friend">➕ Gửi lời mời kết bạn</button>
                `;
            }
        }
    }
}

async function loadMessages() {
    if (!currentChatUserId) return;
    const res = await fetch(`/api/messages/${currentChatUserId}`);
    if (!res.ok) return;
    const messages = await res.json();
    const container = document.getElementById('chat-messages');

    container.innerHTML = messages.map(m => `
        <div class="message-bubble ${m.sender_id !== currentChatUserId ? 'me' : 'them'}">
            <div class="msg-content">${m.content}</div>
        </div>
    `).join('');
    
    container.scrollTop = container.scrollHeight;
}

function sendMessage() {
    const input = document.getElementById('chat-input');
    const content = input.value.trim();
    
    if (!content || !currentChatUserId) return;

    if (currentChatFriendshipStatus !== 'accepted') {
        return alert('🔒 Cậu cần trở thành bạn bè với người này mới có thể nhắn tin!');
    }

    appendSingleMessage({
        sender_id: 'me',
        content: content
    });

    socket.emit('send_message', {
        receiver_id: currentChatUserId,
        content: content
    });

    input.value = '';
}

function appendSingleMessage(msg) {
    const container = document.getElementById('chat-messages');
    const isMe = msg.sender_id !== currentChatUserId;
    
    const div = document.createElement('div');
    div.className = `message-bubble ${isMe ? 'me' : 'them'}`;
    div.innerHTML = `<div class="msg-content">${msg.content}</div>`;
    
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// ----------------------------------------------------
// BẢNG XẾP HẠNG (LEADERBOARD)
// ----------------------------------------------------

async function loadLeaderboard() {
    if (dataCache.leaderboard) renderLeaderboard(dataCache.leaderboard);

    const res = await fetch('/api/leaderboard');
    if (res.ok) {
        const users = await res.json();
        dataCache.leaderboard = users;
        renderLeaderboard(users);
    }
}

function renderLeaderboard(users) {
    const container = document.getElementById('leaderboard-list');
    if (!container) return;

    container.innerHTML = users.map((u, index) => {
        let rankIcon = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;
        return `
            <div class="leaderboard-item">
                <div class="rank">${rankIcon}</div>
                <div class="user-details"><span class="username">${u.username}</span></div>
                <div class="stats">
                    <span class="badge">🔥 ${u.streak_count} ngày</span>
                    <span class="badge">🌌 Cấp ${u.sky_level}</span>
                </div>
            </div>
        `;
    }).join('');
}