from flask import Blueprint, render_template, request, jsonify, session
from werkzeug.security import generate_password_hash, check_password_hash
from app.models import get_db

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/login')
def login():
    return render_template('index.html')

@auth_bp.route('/api/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({'error': 'Vui lòng điền đầy đủ tên đăng nhập và mật khẩu!'}), 400

    db = get_db()
    cursor = db.cursor()

    cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
    if cursor.fetchone():
        return jsonify({'error': 'Tên tài khoản này đã tồn tại!'}), 400

    hashed_pw = generate_password_hash(password)
    cursor.execute("INSERT INTO users (username, password) VALUES (?, ?)", (username, hashed_pw))
    db.commit()

    new_user_id = cursor.lastrowid
    session['user_id'] = new_user_id
    session['username'] = username

    return jsonify({'message': 'Đăng ký thành công!'}), 201

@auth_bp.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json() or {}
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({'error': 'Vui lòng điền đầy đủ thông tin!'}), 400

    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
    user = cursor.fetchone()

    if user and check_password_hash(user['password'], password):
        session['user_id'] = user['id']
        session['username'] = user['username']
        return jsonify({'message': 'Đăng nhập thành công!'}), 200

    return jsonify({'error': 'Sai tên đăng nhập hoặc mật khẩu!'}), 401

@auth_bp.route('/api/user')
def get_user():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'logged_in': False})

    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT id, username, streak_count, sky_level FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()

    if not user:
        session.clear()
        return jsonify({'logged_in': False})

    return jsonify({
        'logged_in': True,
        'user_id': user['id'],
        'username': user['username'],
        'streak_count': user['streak_count'],
        'sky_level': user['sky_level']
    })

@auth_bp.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'message': 'Đã đăng xuất thành công!'})