-- Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    nickname TEXT NOT NULL
);

-- Posts table
CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    views INTEGER DEFAULT 0,
    pinned BOOLEAN DEFAULT FALSE,
    edited BOOLEAN DEFAULT FALSE
);

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    edited BOOLEAN DEFAULT FALSE,
    pinned BOOLEAN DEFAULT FALSE
);

-- Bans table
CREATE TABLE IF NOT EXISTS bans (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    until TEXT NOT NULL,
    reason TEXT,
    duration INTEGER,
    banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    admin_id TEXT REFERENCES users(id)
);
