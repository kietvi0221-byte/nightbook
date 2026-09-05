let currentMood = 'calm';
let skyLevel = 1;
let isLoginMode = true;
let currentChatUserId = null;

// Cache dữ liệu client để đổi Tab không bị giật/lag
const dataCache = {
    privateEntries: null,
    publicEntries: null,
    friends: null,
    leaderboard: null
};

const socket = io();

// Real-time nhận tin nhắn
socket.on('receive_message', (msg) => {
    if (currentChatUserId && (msg.sender_id === currentChatUserId || msg.receiver_id === currentChatUserId)) {
        appendSingleMessage(msg);
    }
});

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupEventListeners();
});

function setupEventListeners() {
    // Chuyển Tab tức thì (Instant Tab Swap)
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

    // Đăng nhật ký - Optimistic UI (Hiện ngay lập tức)
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

        // Render lên màn hình NGAY LẬP TỨC
        prependEntryToUI(newEntry, isPublic);
        contentInput.value = '';

        // Gửi ngầm lên Server
        try {
            await fetch('/api/entries', {
                method: 'POST',
                headers: { 'Content-Type': 'Application/json' },
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

// Xử lý Auth mượt mà
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
    const container = document.getElementById('private-entries-list');
    if (dataCache.privateEntries) {
        renderPrivateEntries(dataCache.privateEntries);
    }
    
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
    if (dataCache.publicEntries) {
        renderPublicEntries(dataCache.publicEntries);
    }
    
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
                    <button class="add-friend-btn" onclick="addFriend(${e.user_id})">➕ Kết bạn</button>
                    <span>${new Date(e.created_at).toLocaleString('vi-VN')}</span>
                </div>
            </div>
            <p>${e.content}</p>
        </div>
    `).join('');
}

async function addFriend(friendId) {
    const res = await fetch('/api/friends/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friend_id: friendId })
    });
    if (res.ok) alert('Đã gửi yêu cầu kết bạn!');
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
    if (friends.length === 0) {
        container.innerHTML = '<p style="font-size:0.85rem; padding:15px; text-align:center; color:#94a3b8;">Chưa có bạn bè.</p>';
        return;
    }

    container.innerHTML = friends.map(f => `
        <div class="friend-item ${currentChatUserId === f.id ? 'active' : ''}" onclick="openChat(${f.id}, '${f.username}')">
            <div class="avatar-circle">${f.username.charAt(0).toUpperCase()}</div>
            <div class="friend-info">
                <span class="friend-name">${f.username}</span>
                <span class="friend-level">🌌 Cấp ${f.sky_level}</span>
            </div>
        </div>
    `).join('');
}

async function openChat(friendId, username) {
    currentChatUserId = friendId;
    document.getElementById('active-chat-user').innerText = username;
    document.getElementById('chat-header-avatar').innerText = username.charAt(0).toUpperCase();
    document.getElementById('chat-header-status').style.display = 'inline';
    document.getElementById('chat-input').disabled = false;
    document.getElementById('send-msg-btn').disabled = false;
    
    document.querySelectorAll('.friend-item').forEach(el => el.classList.remove('active'));
    loadMessages();
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

// Nhắn tin Optimistic UI - Bấm gửi là hiện lên khung chat ngay lập tức!
function sendMessage() {
    const input = document.getElementById('chat-input');
    const content = input.value.trim();
    if (!content || !currentChatUserId) return;

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