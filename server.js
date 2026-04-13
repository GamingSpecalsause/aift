const express = require('express');
const cors = require('cors');
const db = require('./db');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const ADMIN_ID = 'admin';

// --- Users ---
app.get('/api/users/:id', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
        res.json(rows[0] || null);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/register', async (req, res) => {
    const { id, password, nickname } = req.body;
    try {
        const check = await db.query('SELECT id FROM users WHERE id = $1', [id]);
        if (check.rows.length > 0) return res.json({ success: false, message: '이미 존재하는 아이디입니다.' });
        
        await db.query('INSERT INTO users (id, password, nickname) VALUES ($1, $2, $3)', [id, password, nickname]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/login', async (req, res) => {
    const { id, password } = req.body;
    try {
        // Admin auto-creation
        if (id === ADMIN_ID) {
            const adminCheck = await db.query('SELECT * FROM users WHERE id = $1', [ADMIN_ID]);
            if (adminCheck.rows.length === 0) {
                await db.query('INSERT INTO users (id, password, nickname) VALUES ($1, $2, $3)', [ADMIN_ID, 'admin123!', '최고관리자']);
            }
        }

        const { rows } = await db.query('SELECT * FROM users WHERE id = $1 AND password = $2', [id, password]);
        if (rows.length > 0) {
            const ban = await db.query('SELECT * FROM bans WHERE user_id = $1', [id]);
            if (ban.rows.length > 0) {
                const until = new Date(ban.rows[0].until);
                if (until > new Date() || ban.rows[0].until === 'PERMANENT') {
                    return res.json({ success: false, isBanned: true, ban: ban.rows[0] });
                } else {
                    await db.query('DELETE FROM bans WHERE user_id = $1', [id]);
                }
            }
            res.json({ success: true, user: rows[0] });
        } else {
            res.json({ success: false, message: '로그인 실패' });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Posts ---
app.get('/api/posts', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM posts ORDER BY pinned DESC, id DESC');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/posts/:id', async (req, res) => {
    const { increment } = req.query;
    try {
        if (increment === 'true') {
            await db.query('UPDATE posts SET views = views + 1 WHERE id = $1', [req.params.id]);
        }
        const { rows } = await db.query('SELECT * FROM posts WHERE id = $1', [req.params.id]);
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/posts', async (req, res) => {
    const { title, content, userId } = req.body;
    const id = Date.now().toString();
    try {
        await db.query('INSERT INTO posts (id, title, content, user_id) VALUES ($1, $2, $3, $4)', [id, title, content, userId]);
        res.json({ success: true, id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/posts/:id', async (req, res) => {
    const { title, content } = req.body;
    try {
        await db.query('UPDATE posts SET title = $1, content = $2, edited = true WHERE id = $3', [title, content, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/posts/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM posts WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/posts/:id/pin', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT pinned FROM posts WHERE id = $1', [req.params.id]);
        const newPin = !rows[0].pinned;
        await db.query('UPDATE posts SET pinned = $1 WHERE id = $2', [newPin, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Comments ---
app.get('/api/comments/:postId', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM comments WHERE post_id = $1 ORDER BY id ASC', [req.params.postId]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/comments', async (req, res) => {
    const { postId, userId, content, parentId } = req.body;
    const id = Date.now().toString();
    try {
        await db.query('INSERT INTO comments (id, post_id, user_id, content, parent_id) VALUES ($1, $2, $3, $4, $5)', [id, postId, userId, content, parentId]);
        res.json({ success: true, id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/comments/:id', async (req, res) => {
    const { content } = req.body;
    try {
        await db.query('UPDATE comments SET content = $1, edited = true WHERE id = $2', [content, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/comments/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM comments WHERE id = $1 OR parent_id = $2', [req.params.id, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/comments/:id/pin', async (req, res) => {
    try {
        const commentRes = await db.query('SELECT post_id, pinned FROM comments WHERE id = $1', [req.params.id]);
        const { post_id, pinned } = commentRes.rows[0];
        const newPinned = !pinned;
        
        await db.query('UPDATE comments SET pinned = false WHERE post_id = $1', [post_id]);
        if (newPinned) {
            await db.query('UPDATE comments SET pinned = true WHERE id = $1', [req.params.id]);
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Bans ---
app.get('/api/bans', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT b.*, u.nickname FROM bans b JOIN users u ON b.user_id = u.id');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/bans', async (req, res) => {
    const { userId, days, reason, adminId } = req.body;
    const until = days === -1 ? 'PERMANENT' : new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    try {
        await db.query('INSERT INTO bans (user_id, until, reason, duration, admin_id) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id) DO UPDATE SET until = $2, reason = $3, duration = $4, admin_id = $5', 
            [userId, until, reason, days, adminId]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/bans/:userId', async (req, res) => {
    try {
        await db.query('DELETE FROM bans WHERE user_id = $1', [req.params.userId]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/users/:id', async (req, res) => {
    const { newId, nickname, password } = req.body;
    const currentId = req.params.id;
    try {
        if (newId !== currentId) {
            const check = await db.query('SELECT id FROM users WHERE id = $1', [newId]);
            if (check.rows.length > 0) return res.json({ success: false, message: '이미 존재하는 아이디입니다.' });
            
            await db.query('BEGIN');
            await db.query('UPDATE users SET id = $1, nickname = $2' + (password ? ', password = $3' : '') + ' WHERE id = $4', 
                password ? [newId, nickname, password, currentId] : [newId, nickname, currentId]);
            // cascade takes care of foreign keys if set up correctly, but let's be safe if needed
            // Actually our schema has ON DELETE CASCADE but for ID updates we might need manual handling if not ON UPDATE CASCADE
            await db.query('COMMIT');
        } else {
            await db.query('UPDATE users SET nickname = $1' + (password ? ', password = $2' : '') + ' WHERE id = $3', 
                password ? [nickname, password, currentId] : [nickname, currentId]);
        }
        const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [newId]);
        res.json({ success: true, user: rows[0] });
    } catch (err) { 
        await db.query('ROLLBACK');
        res.status(500).json({ error: err.message }); 
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
