let currentMood = 'calm';
let skyLevel = 1;
let isLoginMode = true;
let currentChatUserId = null;
let currentChatFriendshipStatus = 'none';
let currentUser = null;


// =====================================================
// CACHE
// =====================================================

const dataCache = {
    privateEntries: null,
    publicEntries: null,
    friends: null,
    leaderboard: null
};


// =====================================================
// CHAT
// =====================================================

const pendingMessages = new Set();

const socket = io({
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 3000
});


// =====================================================
// HỖ TRỢ
// =====================================================

function escapeHTML(value) {
    const div = document.createElement('div');
    div.textContent = value ?? '';
    return div.innerHTML;
}


function normalizeId(value) {
    return Number(value);
}


async function apiRequest(url, options = {}) {
    try {
        return await fetch(url, {
            ...options,
            credentials: 'same-origin',
            headers: {
                ...(options.body ? {
                    'Content-Type': 'application/json'
                } : {}),
                ...(options.headers || {})
            }
        });
    } catch (error) {
        console.error(`API error: ${url}`, error);
        throw error;
    }
}


// =====================================================
// SOCKET.IO
// =====================================================

socket.on('connect', () => {
    socket.emit('join_room', {});
});


socket.on('receive_message', (msg) => {

    if (!msg) return;

    // Tin nhắn do chính tab này vừa gửi.
    // Đã được optimistic UI hiển thị rồi.
    if (
        msg.client_id &&
        pendingMessages.has(msg.client_id)
    ) {
        pendingMessages.delete(msg.client_id);
        return;
    }

    if (!currentChatUserId) return;

    const senderId = normalizeId(msg.sender_id);
    const receiverId = normalizeId(msg.receiver_id);
    const currentId = normalizeId(currentChatUserId);

    if (
        senderId === currentId ||
        receiverId === currentId
    ) {
        appendSingleMessage(msg);
    }
});


socket.on('receive_friend_request', (data) => {

    alert(
        `📩 ${
            data?.message ||
            'Bạn vừa nhận được một lời mời kết bạn mới!'
        }`
    );

    dataCache.friends = null;

    if (
        currentChatUserId &&
        normalizeId(currentChatUserId) ===
        normalizeId(data.sender_id)
    ) {
        updateChatUIStatus(
            'received_request',
            data.sender_id
        );
    }
});


socket.on('friend_request_accepted', (data) => {

    alert(
        `🎉 ${
            data?.message ||
            'Lời mời kết bạn đã được chấp nhận!'
        }`
    );

    dataCache.friends = null;

    loadFriends();

    if (
        currentChatUserId &&
        normalizeId(currentChatUserId) ===
        normalizeId(data.friend_id)
    ) {
        updateChatUIStatus(
            'accepted',
            data.friend_id
        );

        loadMessages();
    }
});


// =====================================================
// KHỞI ĐỘNG
// =====================================================

document.addEventListener('DOMContentLoaded', () => {

    checkAuth();

    setupEventListeners();
});


// =====================================================
// EVENT LISTENERS
// =====================================================

function setupEventListeners() {

    document.querySelectorAll('.nav-btn')
        .forEach(btn => {

            btn.addEventListener('click', () => {

                document
                    .querySelectorAll('.nav-btn')
                    .forEach(b =>
                        b.classList.remove('active')
                    );

                document
                    .querySelectorAll('.tab-panel')
                    .forEach(p =>
                        p.classList.remove('active')
                    );

                btn.classList.add('active');

                const tabId =
                    btn.getAttribute('data-tab');

                const panel =
                    document.getElementById(tabId);

                if (panel) {
                    panel.classList.add('active');
                }

                if (tabId === 'tab-leaderboard') {
                    loadLeaderboard();
                }

                if (tabId === 'tab-chat') {
                    loadFriends();
                }
            });
        });


    document.querySelectorAll('.mood-btn')
        .forEach(btn => {

            btn.addEventListener('click', () => {

                document
                    .querySelectorAll('.mood-btn')
                    .forEach(b =>
                        b.classList.remove('active')
                    );

                btn.classList.add('active');

                currentMood =
                    btn.getAttribute('data-mood') ||
                    'calm';
            });
        });


    const authToggle =
        document.getElementById('auth-toggle-link');

    if (authToggle) {

        authToggle.addEventListener('click', e => {

            e.preventDefault();

            isLoginMode = !isLoginMode;

            document.getElementById(
                'auth-title'
            ).innerText =
                isLoginMode
                    ? '🌙 Chào mừng tới NightBook'
                    : '✨ Tạo tài khoản mới';

            document.getElementById(
                'auth-submit-btn'
            ).innerText =
                isLoginMode
                    ? 'Đăng nhập'
                    : 'Đăng ký';

            document.getElementById(
                'auth-toggle-prompt'
            ).innerText =
                isLoginMode
                    ? 'Chưa có tài khoản?'
                    : 'Đã có tài khoản?';

            document.getElementById(
                'auth-toggle-link'
            ).innerText =
                isLoginMode
                    ? 'Đăng ký ngay'
                    : 'Đăng nhập';

            document.getElementById(
                'auth-error'
            ).style.display = 'none';
        });
    }


    const authButton =
        document.getElementById('auth-submit-btn');

    if (authButton) {
        authButton.addEventListener(
            'click',
            handleAuth
        );
    }


    const logoutButton =
        document.getElementById('logout-btn');

    if (logoutButton) {

        logoutButton.addEventListener(
            'click',
            async () => {

                try {
                    await apiRequest(
                        '/api/logout',
                        {
                            method: 'POST'
                        }
                    );
                } finally {
                    location.reload();
                }
            }
        );
    }


    const submitButton =
        document.getElementById('submit-btn');

    if (submitButton) {

        submitButton.addEventListener(
            'click',
            submitJournal
        );
    }


    const sendButton =
        document.getElementById('send-msg-btn');

    if (sendButton) {
        sendButton.addEventListener(
            'click',
            sendMessage
        );
    }


    const chatInput =
        document.getElementById('chat-input');

    if (chatInput) {

        chatInput.addEventListener(
            'keydown',
            e => {

                if (
                    e.key === 'Enter' &&
                    !e.shiftKey
                ) {
                    e.preventDefault();
                    sendMessage();
                }
            }
        );
    }
}


// =====================================================
// ĐĂNG NHẬP / ĐĂNG KÝ
// =====================================================

async function handleAuth() {

    const usernameInput =
        document.getElementById('auth-username');

    const passwordInput =
        document.getElementById('auth-password');

    const errorDiv =
        document.getElementById('auth-error');

    const submitBtn =
        document.getElementById('auth-submit-btn');

    const username =
        usernameInput.value.trim();

    const password =
        passwordInput.value;

    if (!username || !password) {

        errorDiv.innerText =
            'Vui lòng điền đầy đủ thông tin!';

        errorDiv.style.display = 'block';

        return;
    }


    submitBtn.innerText =
        'Đang xử lý...';

    submitBtn.disabled = true;


    const url =
        isLoginMode
            ? '/api/login'
            : '/api/register';


    try {

        const res = await apiRequest(
            url,
            {
                method: 'POST',
                body: JSON.stringify({
                    username,
                    password
                })
            }
        );


        const data =
            await res.json();


        if (res.ok) {

            errorDiv.style.display =
                'none';

            await checkAuth();

        } else {

            errorDiv.innerText =
                data.error ||
                'Có lỗi xảy ra!';

            errorDiv.style.display =
                'block';
        }

    } catch (error) {

        errorDiv.innerText =
            'Lỗi kết nối máy chủ!';

        errorDiv.style.display =
            'block';

    } finally {

        submitBtn.innerText =
            isLoginMode
                ? 'Đăng nhập'
                : 'Đăng ký';

        submitBtn.disabled = false;
    }
}


// =====================================================
// KIỂM TRA AUTH
// =====================================================

async function checkAuth() {

    try {

        const res =
            await apiRequest('/api/user');

        const data =
            await res.json();


        const modal =
            document.getElementById('auth-modal');

        const appContainer =
            document.querySelector('.app-container');


        if (data.logged_in) {

            currentUser = data;

            modal.style.display =
                'none';

            appContainer.style.display =
                'block';


            document.getElementById(
                'streak-val'
            ).innerText =
                data.streak_count;


            document.getElementById(
                'sky-level-val'
            ).innerText =
                `Cấp ${data.sky_level}`;


            skyLevel =
                data.sky_level;


            socket.emit(
                'join_room',
                {}
            );


            // 🚀 Load song song
            await Promise.all([
                loadPrivateEntries(),
                loadPublicEntries()
            ]);

        } else {

            appContainer.style.display =
                'none';

            modal.style.display =
                'flex';
        }

    } catch (error) {

        console.error(
            'Lỗi xác thực:',
            error
        );
    }
}


// =====================================================
// NHẬT KÝ
// =====================================================

async function submitJournal() {

    const contentInput =
        document.getElementById(
            'entry-content'
        );

    const content =
        contentInput.value.trim();

    const isPublic =
        document.getElementById(
            'is-public'
        ).checked;


    if (!content) {

        alert(
            'Hãy viết vài dòng tâm sự nhé!'
        );

        return;
    }


    const newEntry = {

        content,

        mood: currentMood,

        created_at:
            new Date().toISOString(),

        username:
            currentUser?.username ||
            'Bạn'
    };


    // 🚀 Hiển thị ngay
    prependEntryToUI(
        newEntry,
        isPublic
    );


    contentInput.value = '';


    // Cache cập nhật ngay
    if (isPublic &&
        Array.isArray(
            dataCache.publicEntries
        )
    ) {

        dataCache.publicEntries.unshift(
            newEntry
        );

    } else if (
        !isPublic &&
        Array.isArray(
            dataCache.privateEntries
        )
    ) {

        dataCache.privateEntries.unshift(
            newEntry
        );
    }


    try {

        const res =
            await apiRequest(
                '/api/entries',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        content,
                        mood: currentMood,
                        is_public: isPublic
                    })
                }
            );


        if (!res.ok) {

            console.error(
                'Không thể lưu nhật ký'
            );
        }

    } catch (error) {

        console.error(
            'Lỗi lưu nhật ký:',
            error
        );
    }
}


function prependEntryToUI(
    entry,
    isPublic
) {

    const containerId =
        isPublic
            ? 'public-entries-list'
            : 'private-entries-list';


    const container =
        document.getElementById(
            containerId
        );


    if (!container) return;


    const div =
        document.createElement('div');


    div.className =
        'entry-card';


    const header =
        document.createElement('div');

    header.className =
        'entry-header';


    const left =
        document.createElement('span');

    left.textContent =
        isPublic
            ? `👤 ${entry.username || 'Bạn'}`
            : `Cảm xúc: ${entry.mood || currentMood}`;


    const right =
        document.createElement('span');

    right.textContent =
        'Vừa xong';


    header.appendChild(left);
    header.appendChild(right);


    const paragraph =
        document.createElement('p');

    paragraph.textContent =
        entry.content || '';


    div.appendChild(header);
    div.appendChild(paragraph);


    container.insertBefore(
        div,
        container.firstChild
    );
}


// =====================================================
// LOAD NHẬT KÝ CÁ NHÂN
// =====================================================

async function loadPrivateEntries() {

    if (dataCache.privateEntries) {

        renderPrivateEntries(
            dataCache.privateEntries
        );
    }


    try {

        const res =
            await apiRequest(
                '/api/entries/private'
            );


        if (res.ok) {

            const entries =
                await res.json();

            dataCache.privateEntries =
                entries;

            renderPrivateEntries(
                entries
            );
        }

    } catch (error) {

        console.error(
            'Lỗi tải nhật ký:',
            error
        );
    }
}


function renderPrivateEntries(entries) {

    const container =
        document.getElementById(
            'private-entries-list'
        );

    if (!container) return;


    container.innerHTML = '';


    entries.forEach(e => {

        const card =
            document.createElement('div');

        card.className =
            'entry-card';


        const header =
            document.createElement('div');

        header.className =
            'entry-header';


        const mood =
            document.createElement('span');

        mood.textContent =
            `Cảm xúc: ${e.mood || ''}`;


        const date =
            document.createElement('span');

        date.textContent =
            new Date(
                e.created_at
            ).toLocaleString('vi-VN');


        header.appendChild(mood);
        header.appendChild(date);


        const content =
            document.createElement('p');

        content.textContent =
            e.content || '';


        card.appendChild(header);
        card.appendChild(content);

        container.appendChild(card);
    });
}


// =====================================================
// NHẬT KÝ CÔNG KHAI
// =====================================================

async function loadPublicEntries() {

    if (dataCache.publicEntries) {

        renderPublicEntries(
            dataCache.publicEntries
        );
    }


    try {

        const res =
            await apiRequest(
                '/api/entries/public'
            );


        if (res.ok) {

            const entries =
                await res.json();

            dataCache.publicEntries =
                entries;

            renderPublicEntries(
                entries
            );
        }

    } catch (error) {

        console.error(
            'Lỗi tải nhật ký công khai:',
            error
        );
    }
}


function renderPublicEntries(entries) {

    const container =
        document.getElementById(
            'public-entries-list'
        );

    if (!container) return;


    container.innerHTML = '';


    entries.forEach(e => {

        const card =
            document.createElement('div');

        card.className =
            'entry-card';


        const header =
            document.createElement('div');

        header.className =
            'entry-header';


        const user =
            document.createElement('span');

        user.textContent =
            `👤 ${e.username || 'Người dùng'}`;


        const right =
            document.createElement('div');


        const addButton =
            document.createElement('button');

        addButton.className =
            'add-friend-btn';

        addButton.textContent =
            '➕ Kết bạn';


        addButton.addEventListener(
            'click',
            () => sendFriendRequest(e.user_id)
        );


        const date =
            document.createElement('span');

        date.textContent =
            new Date(
                e.created_at
            ).toLocaleString('vi-VN');


        right.appendChild(addButton);
        right.appendChild(date);


        header.appendChild(user);
        header.appendChild(right);


        const content =
            document.createElement('p');

        content.textContent =
            e.content || '';


        card.appendChild(header);
        card.appendChild(content);


        container.appendChild(card);
    });
}


// =====================================================
// KẾT BẠN
// =====================================================

async function sendFriendRequest(friendId) {

    try {

        const res =
            await apiRequest(
                '/api/friends/request',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        friend_id: friendId
                    })
                }
            );


        const data =
            await res.json();


        if (res.ok) {

            socket.emit(
                'send_friend_request',
                {
                    receiver_id: friendId
                }
            );


            alert(
                data.message ||
                'Đã gửi yêu cầu kết bạn!'
            );


            if (
                currentChatUserId &&
                normalizeId(currentChatUserId) ===
                normalizeId(friendId)
            ) {

                updateChatUIStatus(
                    'pending',
                    friendId
                );
            }

        } else {

            alert(
                data.error ||
                'Không thể gửi kết bạn'
            );
        }

    } catch (error) {

        alert(
            'Có lỗi kết nối khi gửi kết bạn!'
        );
    }
}


// =====================================================
// CHẤP NHẬN BẠN
// =====================================================

async function acceptFriendRequest(
    senderId
) {

    try {

        const res =
            await apiRequest(
                '/api/friends/accept',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        sender_id: senderId
                    })
                }
            );


        const data =
            await res.json();


        if (res.ok) {

            socket.emit(
                'accept_friend_request',
                {
                    friend_id: senderId
                }
            );


            alert(
                data.message ||
                'Đã đồng ý kết bạn!'
            );


            dataCache.friends =
                null;


            await loadFriends();


            if (
                currentChatUserId &&
                normalizeId(currentChatUserId) ===
                normalizeId(senderId)
            ) {

                updateChatUIStatus(
                    'accepted',
                    senderId
                );

                loadMessages();
            }

        } else {

            alert(
                data.error ||
                'Không thể chấp nhận lời mời'
            );
        }

    } catch (error) {

        alert(
            'Có lỗi kết nối khi chấp nhận lời mời!'
        );
    }
}


// =====================================================
// DANH SÁCH BẠN
// =====================================================

async function loadFriends() {

    if (dataCache.friends) {

        renderFriends(
            dataCache.friends
        );
    }


    try {

        const res =
            await apiRequest(
                '/api/friends'
            );


        if (res.ok) {

            const friends =
                await res.json();

            dataCache.friends =
                friends;

            renderFriends(
                friends
            );
        }

    } catch (error) {

        console.error(
            'Lỗi tải bạn bè:',
            error
        );
    }
}


function renderFriends(friends) {

    const container =
        document.getElementById(
            'friends-list'
        );

    if (!container) return;


    if (!friends.length) {

        container.innerHTML =
            '<p style="font-size:0.85rem; padding:15px; text-align:center; color:#94a3b8;">Chưa có bạn bè.</p>';

        return;
    }


    container.innerHTML = '';


    friends.forEach(friend => {

        const item =
            document.createElement('div');

        item.className =
            `friend-item ${
                normalizeId(currentChatUserId) ===
                normalizeId(friend.id)
                    ? 'active'
                    : ''
            }`;


        const avatar =
            document.createElement('div');

        avatar.className =
            'avatar-circle';

        avatar.textContent =
            (friend.username || '?')
                .charAt(0)
                .toUpperCase();


        const info =
            document.createElement('div');

        info.className =
            'friend-info';


        const name =
            document.createElement('span');

        name.className =
            'friend-name';

        name.textContent =
            friend.username;


        const level =
            document.createElement('span');

        level.className =
            'friend-level';

        level.textContent =
            `🌌 Cấp ${friend.sky_level}`;


        info.appendChild(name);
        info.appendChild(level);


        item.appendChild(avatar);
        item.appendChild(info);


        item.addEventListener(
            'click',
            () => openChat(
                friend.id,
                friend.username,
                friend.status || 'accepted'
            )
        );


        container.appendChild(item);
    });
}


// =====================================================
// MỞ CHAT
// =====================================================

async function openChat(
    friendId,
    username,
    status = 'accepted'
) {

    currentChatUserId =
        normalizeId(friendId);


    document.getElementById(
        'active-chat-user'
    ).textContent =
        username;


    document.getElementById(
        'chat-header-avatar'
    ).textContent =
        username.charAt(0).toUpperCase();


    document.getElementById(
        'chat-header-status'
    ).style.display =
        'inline';


    document
        .querySelectorAll('.friend-item')
        .forEach(el =>
            el.classList.remove('active')
        );


    updateChatUIStatus(
        status,
        friendId
    );


    if (status === 'accepted') {

        await loadMessages();

    } else {

        const container =
            document.getElementById(
                'chat-messages'
            );

        if (container) {
            container.innerHTML = '';
        }
    }
}


// =====================================================
// TRẠNG THÁI CHAT
// =====================================================

function updateChatUIStatus(
    status,
    friendId
) {

    currentChatFriendshipStatus =
        status;


    const inputContainer =
        document.querySelector(
            '.chat-input-container'
        ) ||
        document.getElementById(
            'chat-input-area'
        );


    let noticeArea =
        document.getElementById(
            'friend-notice-area'
        );


    if (
        !noticeArea &&
        inputContainer
    ) {

        noticeArea =
            document.createElement('div');

        noticeArea.id =
            'friend-notice-area';

        noticeArea.className =
            'friend-notice-box';


        inputContainer.parentNode.insertBefore(
            noticeArea,
            inputContainer
        );
    }


    const chatInput =
        document.getElementById(
            'chat-input'
        );

    const sendBtn =
        document.getElementById(
            'send-msg-btn'
        );


    if (status === 'accepted') {

        if (chatInput)
            chatInput.disabled = false;

        if (sendBtn)
            sendBtn.disabled = false;

        if (noticeArea)
            noticeArea.style.display = 'none';

        if (inputContainer)
            inputContainer.style.display = 'flex';

        return;
    }


    if (chatInput)
        chatInput.disabled = true;

    if (sendBtn)
        sendBtn.disabled = true;

    if (inputContainer)
        inputContainer.style.display = 'none';


    if (!noticeArea) return;


    noticeArea.style.display =
        'block';


    if (status === 'pending') {

        noticeArea.innerHTML =
            `<p class="notice-text">
                ⏳ Đã gửi lời mời kết bạn. Đang chờ đối phương đồng ý...
            </p>`;

    } else if (
        status === 'received_request'
    ) {

        noticeArea.innerHTML =
            `<p class="notice-text">
                Người này đã gửi cho cậu một lời mời kết bạn.
            </p>
            <button
                onclick="acceptFriendRequest(${Number(friendId)})"
                class="btn-accept">
                ✅ Chấp nhận lời mời
            </button>`;

    } else {

        noticeArea.innerHTML =
            `<p class="notice-text">
                🔒 Cần trở thành bạn bè để nhắn tin cho nhau.
            </p>
            <button
                onclick="sendFriendRequest(${Number(friendId)})"
                class="btn-add-friend">
                ➕ Gửi lời mời kết bạn
            </button>`;
    }
}


// =====================================================
// LOAD TIN NHẮN
// =====================================================

async function loadMessages() {

    if (!currentChatUserId)
        return;


    const chatUserId =
        currentChatUserId;


    const container =
        document.getElementById(
            'chat-messages'
        );


    try {

        const res =
            await apiRequest(
                `/api/messages/${chatUserId}`
            );


        if (!res.ok)
            return;


        const messages =
            await res.json();


        // Người dùng có thể đã chuyển sang chat khác
        // trong lúc request đang chạy.
        if (
            normalizeId(currentChatUserId) !==
            normalizeId(chatUserId)
        ) {
            return;
        }


        container.innerHTML = '';


        const fragment =
            document.createDocumentFragment();


        messages.forEach(message => {

            fragment.appendChild(
                createMessageElement(
                    message
                )
            );
        });


        container.appendChild(
            fragment
        );


        requestAnimationFrame(() => {

            container.scrollTop =
                container.scrollHeight;
        });


    } catch (error) {

        console.error(
            'Lỗi tải tin nhắn:',
            error
        );
    }
}


// =====================================================
// TẠO BONG BÓNG CHAT
// =====================================================

function createMessageElement(msg) {

    const div =
        document.createElement('div');


    const senderId =
        normalizeId(msg.sender_id);


    const currentUserId =
        normalizeId(
            currentUser?.id
        );


    const isMe =
        senderId === currentUserId ||
        msg.sender_id === 'me';


    div.className =
        `message-bubble ${
            isMe ? 'me' : 'them'
        }`;


    const content =
        document.createElement('div');

    content.className =
        'msg-content';


    content.textContent =
        msg.content || '';


    div.appendChild(content);


    return div;
}


// =====================================================
// APPEND TIN NHẮN
// =====================================================

function appendSingleMessage(msg) {

    const container =
        document.getElementById(
            'chat-messages'
        );


    if (!container)
        return;


    container.appendChild(
        createMessageElement(msg)
    );


    container.scrollTop =
        container.scrollHeight;
}


// =====================================================
// GỬI TIN NHẮN
// =====================================================

function sendMessage() {

    const input =
        document.getElementById(
            'chat-input'
        );


    if (!input)
        return;


    const content =
        input.value.trim();


    if (
        !content ||
        !currentChatUserId
    ) {
        return;
    }


    if (
        currentChatFriendshipStatus !==
        'accepted'
    ) {

        alert(
            '🔒 Cậu cần trở thành bạn bè với người này mới có thể nhắn tin!'
        );

        return;
    }


    const clientId =
        `${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}`;


    // Đánh dấu tin nhắn đang chờ server
    pendingMessages.add(
        clientId
    );


    // 🚀 Hiện ngay lập tức
    appendSingleMessage({
        sender_id: 'me',
        receiver_id: currentChatUserId,
        content
    });


    socket.emit(
        'send_message',
        {
            receiver_id:
                currentChatUserId,

            content,

            client_id:
                clientId
        }
    );


    input.value = '';


    input.focus();
}


// =====================================================
// LEADERBOARD
// =====================================================

async function loadLeaderboard() {

    if (dataCache.leaderboard) {

        renderLeaderboard(
            dataCache.leaderboard
        );
    }


    try {

        const res =
            await apiRequest(
                '/api/leaderboard'
            );


        if (res.ok) {

            const users =
                await res.json();

            dataCache.leaderboard =
                users;

            renderLeaderboard(
                users
            );
        }

    } catch (error) {

        console.error(
            'Lỗi tải BXH:',
            error
        );
    }
}


function renderLeaderboard(users) {

    const container =
        document.getElementById(
            'leaderboard-list'
        );


    if (!container)
        return;


    container.innerHTML = '';


    const fragment =
        document.createDocumentFragment();


    users.forEach((u, index) => {

        const item =
            document.createElement('div');

        item.className =
            'leaderboard-item';


        const rank =
            document.createElement('div');

        rank.className =
            'rank';

        rank.textContent =
            index === 0
                ? '🥇'
                : index === 1
                    ? '🥈'
                    : index === 2
                        ? '🥉'
                        : `#${index + 1}`;


        const details =
            document.createElement('div');

        details.className =
            'user-details';


        const username =
            document.createElement('span');

        username.className =
            'username';

        username.textContent =
            u.username;


        details.appendChild(
            username
        );


        const stats =
            document.createElement('div');

        stats.className =
            'stats';


        const streak =
            document.createElement('span');

        streak.className =
            'badge';

        streak.textContent =
            `🔥 ${u.streak_count} ngày`;


        const level =
            document.createElement('span');

        level.className =
            'badge';

        level.textContent =
            `🌌 Cấp ${u.sky_level}`;


        stats.appendChild(streak);
        stats.appendChild(level);


        item.appendChild(rank);
        item.appendChild(details);
        item.appendChild(stats);


        fragment.appendChild(item);
    });


    container.appendChild(
        fragment
    );
}