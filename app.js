const API_BASE = '/api';

// --- 유틸리티 ---
function isAdmin(userId) { return userId === 'admin'; }
function validatePassword(password) {
    const regex = /^(?=.*[0-9])(?=.*[!@#$%^&*?_]).{8,}$/;
    return regex.test(password);
}

// --- 정지(Ban) 로직 ---
async function getAllBans() {
    const res = await fetch(`${API_BASE}/bans`);
    return await res.json();
}

async function banUser(userId, days, reason) {
    const user = getCurrentUser();
    const res = await fetch(`${API_BASE}/bans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, days, reason, adminId: user?.id || 'admin' })
    });
    return (await res.json()).success;
}

async function unbanUser(userId) {
    const res = await fetch(`${API_BASE}/bans/${userId}`, { method: 'DELETE' });
    return (await res.json()).success;
}

async function getBanStatus(userId) {
    if (isAdmin(userId)) return { banned: false };
    const bans = await getAllBans();
    const ban = bans.find(b => b.user_id === userId);
    if (!ban) return { banned: false };

    const start = new Date(ban.banned_at).toLocaleString();
    const durStr = ban.duration === -1 ? '영구' : ban.duration + '일';

    if (ban.until === 'PERMANENT') {
        return { banned: true, until: '영구 정지', start, duration: durStr, reason: ban.reason };
    }
    
    const untilDate = new Date(ban.until);
    if (untilDate > new Date()) {
        return { banned: true, until: untilDate.toLocaleString(), start, duration: durStr, reason: ban.reason };
    } else {
        await unbanUser(userId);
        return { banned: false };
    }
}

async function getBannedList() {
    const bans = await getAllBans();
    const list = [];
    for (const b of bans) {
        list.push({
            ...b,
            userId: b.user_id,
            nickname: b.nickname,
            status: await getBanStatus(b.user_id)
        });
    }
    return list.filter(b => b.status.banned);
}

// --- 게시물 로직 ---
async function getPosts() {
    const res = await fetch(`${API_BASE}/posts`);
    const posts = await res.json();
    return posts.map(p => ({
        ...p,
        userId: p.user_id,
        date: new Date(p.date).toLocaleString()
    }));
}

async function createPost(title, content, userId) {
    const ban = await getBanStatus(userId);
    if (ban.banned) return { success: false, message: `정지된 계정입니다. (사유: ${ban.reason}, 기간: ${ban.until})` };
    
    const res = await fetch(`${API_BASE}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, userId })
    });
    return await res.json();
}

async function updatePost(id, newTitle, newContent) {
    const res = await fetch(`${API_BASE}/posts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, content: newContent })
    });
    return (await res.json()).success;
}

async function deletePost(id) {
    const res = await fetch(`${API_BASE}/posts/${id}`, { method: 'DELETE' });
    return (await res.json()).success;
}

async function getPost(id, increment = false) {
    const res = await fetch(`${API_BASE}/posts/${id}?increment=${increment}`);
    const p = await res.json();
    if (!p) return null;
    return {
        ...p,
        userId: p.user_id,
        date: new Date(p.date).toLocaleString()
    };
}

async function togglePin(postId) {
    const res = await fetch(`${API_BASE}/posts/${postId}/pin`, { method: 'POST' });
    return (await res.json()).success;
}

// --- 댓글 및 대댓글 로직 ---
async function getComments(postId) {
    const res = await fetch(`${API_BASE}/comments/${postId}`);
    const comments = await res.json();
    return comments.map(c => ({
        ...c,
        userId: c.user_id,
        postId: c.post_id,
        parentId: c.parent_id,
        date: new Date(c.date).toLocaleString()
    })).sort((a, b) => {
        if (!a.parentId && !b.parentId) {
            if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
        }
        return a.id - b.id;
    });
}

async function getCommentCount(postId) {
    const comments = await getComments(postId);
    return comments.length;
}

async function createComment(postId, userId, content, parentId = null) {
    const ban = await getBanStatus(userId);
    if (ban.banned) {
        alert(`정지된 계정입니다. (사유: ${ban.reason}, 기간: ${ban.until})`);
        return null;
    }
    const res = await fetch(`${API_BASE}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, userId, content, parentId })
    });
    return await res.json();
}

async function toggleCommentPin(commentId) {
    const res = await fetch(`${API_BASE}/comments/${commentId}/pin`, { method: 'POST' });
    return (await res.json()).success;
}

async function updateComment(commentId, newContent) {
    const res = await fetch(`${API_BASE}/comments/${commentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent })
    });
    return (await res.json()).success;
}

async function deleteComment(commentId) {
    const res = await fetch(`${API_BASE}/comments/${commentId}`, { method: 'DELETE' });
    return (await res.json()).success;
}

// --- 사용자 로직 ---
async function registerUser(id, password) {
    if (id.toLowerCase() === 'admin') return { success: false, message: 'admin 아이디는 사용할 수 없습니다.' };
    if (!validatePassword(password)) return { success: false, message: '비밀번호는 숫자와 특수문자를 포함하여 8자 이상으로 입력해주세요.' };
    
    const res = await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password, nickname: '회원_' + id })
    });
    return await res.json();
}

// --- 세션 관리 ---
const SESSION_KEY = 'gemini_community_session';
function getSession() {
    const data = localStorage.getItem(SESSION_KEY);
    return data ? JSON.parse(data) : { activeId: null, accounts: [] };
}
function saveSession(session) { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); }

async function loginUser(id, password) {
    const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password })
    });
    const data = await res.json();
    if (data.success) {
        const session = getSession();
        if (!session.accounts.includes(id)) session.accounts.push(id);
        session.activeId = id;
        saveSession(session);
        // Store user info for quick access (nickname etc)
        localStorage.setItem(`user_${id}`, JSON.stringify(data.user));
    } else if (data.isBanned) {
        const ban = data.ban;
        const start = new Date(ban.banned_at).toLocaleString();
        const until = ban.until === 'PERMANENT' ? '영구 정지' : new Date(ban.until).toLocaleString();
        const duration = ban.duration === -1 ? '영구' : ban.duration + '일';
        data.message = `[계정 정지 안내]\n\n` +
                 `• 사유: ${ban.reason}\n` +
                 `• 시작 일시: ${start}\n` +
                 `• 종료 일시: ${until}\n` +
                 `• 정지 기간: ${duration}\n\n` +
                 `해당 기간 동안 서비스 이용이 제한됩니다.`;
    }
    return data;
}

async function switchUser(id) {
    const session = getSession();
    if (session.accounts.includes(id)) {
        const ban = await getBanStatus(id);
        if (ban.banned) {
            alert(`[전환 실패] 해당 계정은 정지 상태입니다.\n\n사유: ${ban.reason}\n종료: ${ban.until}`);
            return false;
        }
        session.activeId = id;
        saveSession(session);
        return true;
    }
    return false;
}

function logoutUser() {
    localStorage.removeItem(SESSION_KEY);
    location.href = 'index.html';
}

function getCurrentUser() {
    const session = getSession();
    if (!session.activeId) return null;
    const userData = localStorage.getItem(`user_${session.activeId}`);
    return userData ? JSON.parse(userData) : { id: session.activeId, nickname: '회원' };
}

function getAllLoggedInUsers() {
    const session = getSession();
    return session.accounts.map(accId => {
        const userData = localStorage.getItem(`user_${accId}`);
        return userData ? JSON.parse(userData) : { id: accId, nickname: '회원' };
    });
}

async function updateUserInfo(currentId, newNickname, newPassword) {
    const session = getSession();
    if (!currentId) return { success: false };

    const res = await fetch(`${API_BASE}/users/${currentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: newNickname, password: newPassword })
    });
    const data = await res.json();
    if (data.success) {
        localStorage.setItem(`user_${currentId}`, JSON.stringify(data.user));
    }
    return data;
}

async function getNickname(userId) {
    const res = await fetch(`${API_BASE}/users/${userId}`);
    const user = await res.json();
    return user ? user.nickname : '탈퇴 회원';
}

