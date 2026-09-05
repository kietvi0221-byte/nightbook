let currentMood = 'calm';
let skyLevel = 1;
let isLoginMode = true;
let currentChatUserId = null;

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
    const friends = await res.json();
    const container = document.getElementById('friends-list');

    if (friends.length === 0) {
        container.innerHTML = '<p class="text-muted" style="font-size: 0.85rem; padding: 10px;">Chưa có bạn bè. Hãy kết bạn ở Tab Bầu Trời Đêm!</p>';
        return;
    }

    container.innerHTML = friends.map(f => `
        <div class="friend-item ${currentChatUserId === f.id ? 'active' : ''}" onclick="openChat(${f.id}, '${f.username}')">
            <span>🌙 ${f.username}</span>
            <span class="badge-sm">Cấp ${f.sky_level}</span>
        </div>
    `).join('');
}

async function openChat(friendId, username) {
    currentChatUserId = friendId;
    document.getElementById('active-chat-user').innerText = `💬 Trò chuyện với ${username}`;
    document.getElementById('chat-input').disabled = false;
    document.getElementById('send-msg-btn').disabled = false;
    
    loadFriends();
    loadMessages();
}

async function loadMessages() {
    if (!currentChatUserId) return;
    const res = await fetch(`/api/messages/${currentChatUserId}`);
    const messages = await res.json();
    const container = document.getElementById('chat-messages');

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

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const content = input.value.trim();
    if (!content || !currentChatUserId) return;

    const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiver_id: currentChatUserId, content })
    });

    if (res.ok) {
        input.value = '';
        loadMessages();
    }
}

async function loadLeaderboard() {
    const res = await fetch('/api/leaderboard');
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