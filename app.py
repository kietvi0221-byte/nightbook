import os
import sqlite3
from datetime import datetime, date
from flask import Flask, render_template, request, jsonify, session
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.secret_key = 'nightbook_secret_key_night_traveler'
DATABASE = 'database.db'

def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with app.app_context():
        db = get_db()
        schema_path = os.path.join(os.path.dirname(__file__), 'schema.sql')
        with open(schema_path, mode='r', encoding='utf-8') as f:
            db.cursor().executescript(f.read())
        db.commit()

@app.route('/')
def index():
    return render_template('index.html')

# --- API AUTHENTICATION ---

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json or {}
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()

    if not username or not password:
        return jsonify({'error': 'Tên đăng nhập và mật khẩu không được trống'}), 400

    db = get_db()
    existing_user = db.execute('SELECT id FROM users WHERE username = ?', (username,)).fetchone()
    if existing_user:
        return jsonify({'error': 'Tên tài khoản đã tồn tại'}), 400

    hashed_pw = generate_password_hash(password)
    cursor = db.execute('INSERT INTO users (username, password_hash) VALUES (?, ?)', (username, hashed_pw))
    db.commit()

    session['user_id'] = cursor.lastrowid
    session['username'] = username
    return jsonify({'status': 'success', 'username': username})

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json or {}
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()

    db = get_db()
    user = db.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()

    if not user or not check_password_hash(user['password_hash'], password):
        return jsonify({'error': 'Tên đăng nhập hoặc mật khẩu không đúng'}), 401

    session['user_id'] = user['id']
    session['username'] = user['username']
    return jsonify({'status': 'success', 'username': user['username']})

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'status': 'success'})

@app.route('/api/user', methods=['GET'])
def get_user():
    if 'user_id' not in session:
        return jsonify({'logged_in': False})

    db = get_db()
    user_id = session['user_id']
    user = db.execute('SELECT id, username, streak_count, sky_level FROM users WHERE id = ?', (user_id,)).fetchone()
    
    if not user:
        session.clear()
        return jsonify({'logged_in': False})

    # Cập nhật đứt chuỗi theo thời gian thực tế
    last_entry = db.execute(
        'SELECT created_at FROM entries WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
        (user_id,)
    ).fetchone()

    current_streak = user['streak_count']
    current_level = user['sky_level']

    if last_entry and last_entry['created_at']:
        last_date_str = last_entry['created_at'].split()[0]
        last_date = datetime.strptime(last_date_str, '%Y-%m-%d').date()
        delta_days = (date.today() - last_date).days

        if delta_days > 1 and current_streak > 0:
            current_streak = 0
            current_level = 1
            db.execute('UPDATE users SET streak_count = 0, sky_level = 1 WHERE id = ?', (user_id,))
            db.commit()

    data = dict(user)
    data['streak_count'] = current_streak
    data['sky_level'] = current_level
    data['logged_in'] = True
    return jsonify(data)

# --- API ENTRIES & LEADERBOARD ---

@app.route('/api/entries/private', methods=['GET'])
def get_private_entries():
    if 'user_id' not in session:
        return jsonify([])

    db = get_db()
    entries = db.execute('SELECT * FROM entries WHERE user_id = ? AND is_public = 0 ORDER BY created_at DESC', (session['user_id'],)).fetchall()
    return jsonify([dict(row) for row in entries])

@app.route('/api/entries/public', methods=['GET'])
def get_public_entries():
    db = get_db()
    entries = db.execute('''
        SELECT entries.*, users.username 
        FROM entries 
        JOIN users ON entries.user_id = users.id 
        WHERE is_public = 1 
        ORDER BY created_at DESC
    ''').fetchall()
    return jsonify([dict(row) for row in entries])

@app.route('/api/entries', methods=['POST'])
def add_entry():
    if 'user_id' not in session:
        return jsonify({'error': 'Vui lòng đăng nhập'}), 401

    data = request.json or {}
    content = data.get('content')
    mood = data.get('mood', 'calm')
    is_public = 1 if data.get('is_public') else 0

    if not content or not content.strip():
        return jsonify({'error': 'Nội dung không được để trống'}), 400

    db = get_db()
    user_id = session['user_id']

    last_entry = db.execute(
        'SELECT created_at FROM entries WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
        (user_id,)
    ).fetchone()

    user = db.execute('SELECT streak_count FROM users WHERE id = ?', (user_id,)).fetchone()
    current_streak = user['streak_count'] if user else 0
    today = date.today()

    if last_entry and last_entry['created_at']:
        last_date_str = last_entry['created_at'].split()[0]
        last_date = datetime.strptime(last_date_str, '%Y-%m-%d').date()
        delta_days = (today - last_date).days

        if delta_days == 0:
            new_streak = max(1, current_streak)
        elif delta_days == 1:
            new_streak = current_streak + 1
        else:
            new_streak = 1
    else:
        new_streak = 1

    new_level = min(5, (new_streak // 3) + 1)

    db.execute(
        'INSERT INTO entries (user_id, content, mood, is_public) VALUES (?, ?, ?, ?)',
        (user_id, content, mood, is_public)
    )
    db.execute(
        'UPDATE users SET streak_count = ?, sky_level = ? WHERE id = ?',
        (new_streak, new_level, user_id)
    )
    db.commit()

    return jsonify({'status': 'success', 'streak': new_streak, 'sky_level': new_level})

@app.route('/api/leaderboard', methods=['GET'])
def get_leaderboard():
    db = get_db()
    users = db.execute('''
        SELECT username, streak_count, sky_level 
        FROM users 
        ORDER BY streak_count DESC, sky_level DESC 
        LIMIT 10
    ''').fetchall()
    return jsonify([dict(row) for row in users])

# --- API FRIENDS & MESSAGES ---

@app.route('/api/friends/add', methods=['POST'])
def add_friend():
    if 'user_id' not in session:
        return jsonify({'error': 'Vui lòng đăng nhập'}), 401
    
    data = request.json or {}
    friend_id = data.get('friend_id')
    user_id = session['user_id']

    if user_id == friend_id:
        return jsonify({'error': 'Không thể tự kết bạn với chính mình'}), 400

    db = get_db()
    try:
        db.execute('INSERT INTO friendships (user_id, friend_id) VALUES (?, ?)', (user_id, friend_id))
        db.execute('INSERT INTO friendships (user_id, friend_id) VALUES (?, ?)', (friend_id, user_id))
        db.commit()
        return jsonify({'status': 'success'})
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Đã là bạn bè từ trước'}), 400

@app.route('/api/friends', methods=['GET'])
def get_friends():
    if 'user_id' not in session:
        return jsonify([])

    db = get_db()
    friends = db.execute('''
        SELECT users.id, users.username, users.sky_level 
        FROM friendships 
        JOIN users ON friendships.friend_id = users.id 
        WHERE friendships.user_id = ?
    ''', (session['user_id'],)).fetchall()
    return jsonify([dict(row) for row in friends])

@app.route('/api/messages/<int:friend_id>', methods=['GET'])
def get_messages(friend_id):
    if 'user_id' not in session:
        return jsonify([])

    user_id = session['user_id']
    db = get_db()
    messages = db.execute('''
        SELECT * FROM messages 
        WHERE (sender_id = ? AND receiver_id = ?) 
           OR (sender_id = ? AND receiver_id = ?) 
        ORDER BY created_at ASC
    ''', (user_id, friend_id, friend_id, user_id)).fetchall()
    
    return jsonify([dict(row) for row in messages])

@app.route('/api/messages/send', methods=['POST'])
def send_message():
    if 'user_id' not in session:
        return jsonify({'error': 'Vui lòng đăng nhập'}), 401

    data = request.json or {}
    receiver_id = data.get('receiver_id')
    content = data.get('content', '').strip()

    if not content or not receiver_id:
        return jsonify({'error': 'Nội dung không được để trống'}), 400

    db = get_db()
    db.execute('INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)',
               (session['user_id'], receiver_id, content))
    db.commit()
    return jsonify({'status': 'success'})

if __name__ == '__main__':
    if not os.path.exists(DATABASE):
        init_db()
    app.run(debug=True, port=5000)