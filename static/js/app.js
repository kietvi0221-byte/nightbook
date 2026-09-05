let currentMood = 'calm';
let skyLevel = 1;
let isLoginMode = true;
let currentChatUserId = null;

const socket = io();

socket.on('receive_message', (msg) => {
    if (currentChatUserId && (msg.sender_id === currentChatUserId || msg.receiver_id === currentChatUserId)) {
        appendSingleMessage(msg);
    }
});

document.addEventListener('DOMContentLoaded', () => {
    initSkyCanvas();
    checkAuth();
    setupEventListeners();
});

function setupEventListeners() {
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

    document.querySelectorAll('.mood-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMood = btn.getAttribute('data-mood');
        });
    });

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
        checkAuth();
    });

    document.getElementById('submit-btn').addEventListener('click', async () => {
        const content = document.getElementById('entry-content').value;
        const isPublic = document.getElementById('is-public').checked;

        if (!content.trim()) return alert('Hãy viết vài dòng tâm sự nhé!');

        const response = await fetch('/api/entries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, mood: currentMood, is_public: isPublic })
        });

        if (response.ok) {
            document.getElementById('entry-content').value = '';
            checkAuth();
        }
    });

    document.getElementById('send-msg-btn').addEventListener('click', sendMessage);
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
}

async function handleAuth() {
    const username = document.getElementById('auth-username').value;
    const password = document.getElementById('auth-password').value;
    const errorDiv = document.getElementById('auth-error');

    const url = isLoginMode ? '/api/login' : '/api/register';
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (res.ok) {
        errorDiv.style.display = 'none';
        document.getElementById('auth-username').value = '';
        document.getElementById('auth-password').value = '';
        checkAuth();
    } else {
        errorDiv.innerText = data.error || 'Có lỗi xảy ra!';
        errorDiv.style.display = 'block';
    }
}

async function checkAuth() {
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
        loadLeaderboard();
    } else {
        appContainer.style.display = 'none';
        modal.style.display = 'flex';
    }
}

async function loadPrivateEntries() {
    const res = await fetch('/api/entries/private');
    if (!res.ok) return;
    const entries = await res.json();
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
    const res = await fetch('/api/entries/public');
    if (!res.ok) return;
    const entries = await res.json();
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
    const data = await res.json();
    if (res.ok) {
        alert('Đã kết bạn thành công!');
    } else {
        alert(data.error || 'Không thể kết bạn');
    }
}

async function loadFriends() {
    const res = await fetch('/api/friends');
    if (!res.ok) return;
    const friends = await res.json();
    const container = document.getElementById('friends-list');

    if (friends.length === 0) {
        container.innerHTML = '<p class="text-muted" style="font-size: 0.85rem; padding: 15px; text-align: center;">Chưa có bạn đồng hành.<br>Hãy kết bạn ở Tab Bầu Trời Đêm nhé!</p>';
        return;
    }

    container.innerHTML = friends.map(f => {
        const firstLetter = f.username.charAt(0).toUpperCase();
        const isActive = currentChatUserId === f.id ? 'active' : '';
        return `
            <div class="friend-item ${isActive}" onclick="openChat(${f.id}, '${f.username}')">
                <div class="avatar-circle">${firstLetter}</div>
                <div class="friend-info">
                    <span class="friend-name">${f.username}</span>
                    <span class="friend-level">🌌 Cấp ${f.sky_level}</span>
                </div>
            </div>
        `;
    }).join('');
}

async function openChat(friendId, username) {
    currentChatUserId = friendId;
    
    document.getElementById('active-chat-user').innerText = username;
    document.getElementById('chat-header-avatar').innerText = username.charAt(0).toUpperCase();
    document.getElementById('chat-header-status').style.display = 'inline';
    
    document.getElementById('chat-input').disabled = false;
    document.getElementById('send-msg-btn').disabled = false;
    document.getElementById('chat-input').focus();
    
    loadFriends();
    loadMessages();
}

async function loadMessages() {
    if (!currentChatUserId) return;
    const res = await fetch(`/api/messages/${currentChatUserId}`);
    if (!res.ok) return;
    const messages = await res.json();
    const container = document.getElementById('chat-messages');

    if (messages.length === 0) {
        container.innerHTML = '<div class="empty-chat-placeholder"><span>Hãy gửi lời chào tới người bạn này nhé!</span></div>';
        return;
    }

    container.innerHTML = messages.map(m => {
        const isMe = m.sender_id !== currentChatUserId;
        return `
            <div class="message-bubble ${isMe ? 'me' : 'them'}">
                <div class="msg-content">${m.content}</div>
            </div>
        `;
    }).join('');

    container.scrollTop = container.scrollHeight;
}

function appendSingleMessage(msg) {
    const container = document.getElementById('chat-messages');
    
    const placeholder = container.querySelector('.empty-chat-placeholder');
    if (placeholder) placeholder.remove();

    const isMe = msg.sender_id !== currentChatUserId;
    
    const msgHTML = `
        <div class="message-bubble ${isMe ? 'me' : 'them'}">
            <div class="msg-content">${msg.content}</div>
        </div>
    `;
    container.innerHTML += msgHTML;
    container.scrollTop = container.scrollHeight;
}

function sendMessage() {
    const input = document.getElementById('chat-input');
    const content = input.value.trim();
    if (!content || !currentChatUserId) return;

    socket.emit('send_message', {
        receiver_id: currentChatUserId,
        content: content
    });

    input.value = '';
}

async function loadLeaderboard() {
    const res = await fetch('/api/leaderboard');
    if (!res.ok) return;
    const users = await res.json();
    const container = document.getElementById('leaderboard-list');
    
    if (!container) return;

    if (users.length === 0) {
        container.innerHTML = '<p class="text-muted">Chưa có dữ liệu xếp hạng.</p>';
        return;
    }

    container.innerHTML = users.map((u, index) => {
        let rankIcon = `#${index + 1}`;
        if (index === 0) rankIcon = '🥇';
        else if (index === 1) rankIcon = '🥈';
        else if (index === 2) rankIcon = '🥉';

        return `
            <div class="leaderboard-item">
                <div class="rank">${rankIcon}</div>
                <div class="user-details">
                    <span class="username">${u.username}</span>
                </div>
                <div class="stats">
                    <span class="badge">🔥 ${u.streak_count} ngày</span>
                    <span class="badge">🌌 Cấp ${u.sky_level}</span>
                </div>
            </div>
        `;
    }).join('');
}

function initSkyCanvas() {
    const canvas = document.getElementById('sky-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const stars = Array.from({ length: 150 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: Math.random() * 1.5,
        alpha: Math.random(),
        speed: 0.005 + Math.random() * 0.01
    }));

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const visibleStars = Math.min(stars.length, skyLevel * 30);
        for (let i = 0; i < visibleStars; i++) {
            const star = stars[i];
            star.alpha += star.speed;
            if (star.alpha > 1 || star.alpha < 0) star.speed = -star.speed;

            ctx.beginPath();
            ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${Math.abs(star.alpha)})`;
            ctx.fill();
        }

        requestAnimationFrame(animate);
    }
    animate();
}