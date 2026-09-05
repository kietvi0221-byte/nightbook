from flask import Blueprint, request, jsonify, session
from flask_socketio import emit, join_room
from app import socketio
from app.models import get_db

messages_bp = Blueprint('messages', __name__)

@messages_bp.route('/api/friends')
def get_friends():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify([]), 401

    db = get_db()
    cursor = db.cursor()
    cursor.execute('''
        SELECT u.id, u.username, u.sky_level
        FROM friends f
        JOIN users u ON f.friend_id = u.id
        WHERE f.user_id = ?
    ''', (user_id,))
    friends = [dict(row) for row in cursor.fetchall()]
    return jsonify(friends)

@messages_bp.route('/api/friends/add', methods=['POST'])
def add_friend():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Chưa đăng nhập'}), 401

    data = request.get_json() or {}
    friend_id = data.get('friend_id')

    if not friend_id or friend_id == user_id:
        return jsonify({'error': 'Không thể kết bạn với chính mình'}), 400

    db = get_db()
    cursor = db.cursor()
    cursor.execute('SELECT id FROM friends WHERE user_id = ? AND friend_id = ?', (user_id, friend_id))
    if cursor.fetchone():
        return jsonify({'error': 'Đã là bạn bè từ trước'}), 400

    cursor.execute('INSERT INTO friends (user_id, friend_id) VALUES (?, ?)', (user_id, friend_id))
    cursor.execute('INSERT INTO friends (user_id, friend_id) VALUES (?, ?)', (friend_id, user_id))
    db.commit()

    return jsonify({'message': 'Kết bạn thành công'})

@messages_bp.route('/api/messages/<int:friend_id>')
def get_messages(friend_id):
    user_id = session.get('user_id')
    if not user_id:
        return jsonify([]), 401

    db = get_db()
    cursor = db.cursor()
    cursor.execute('''
        SELECT * FROM messages 
        WHERE (sender_id = ? AND receiver_id = ?) 
           OR (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at ASC
    ''', (user_id, friend_id, friend_id, user_id))
    
    messages = [dict(row) for row in cursor.fetchall()]
    return jsonify(messages)

# ================= Socket.IO Realtime Events =================

@socketio.on('register_user')
@socketio.on('join_room')
def handle_join_room(data=None):
    user_id = session.get('user_id')
    if not user_id and isinstance(data, dict):
        user_id = data.get('user_id')
    
    if user_id:
        join_room(f"user_{user_id}")

@socketio.on('send_message')
def handle_send_message(data):
    sender_id = session.get('user_id')
    receiver_id = data.get('receiver_id')
    content = data.get('content')

    if not sender_id or not receiver_id or not content:
        return

    db = get_db()
    cursor = db.cursor()
    cursor.execute('''
        INSERT INTO messages (sender_id, receiver_id, content)
        VALUES (?, ?, ?)
    ''', (sender_id, receiver_id, content))
    db.commit()

    msg_data = {
        'id': cursor.lastrowid,
        'sender_id': sender_id,
        'receiver_id': receiver_id,
        'content': content
    }

    emit('receive_message', msg_data, room=f"user_{receiver_id}")
    emit('receive_message', msg_data, room=f"user_{sender_id}")

# 1. Sự kiện Gửi lời mời kết bạn Realtime
@socketio.on('send_friend_request')
def handle_friend_request(data):
    sender_id = session.get('user_id') or data.get('sender_id')
    sender_name = data.get('sender_name', 'Người dùng')
    receiver_id = data.get('receiver_id')

    if sender_id and receiver_id:
        emit('receive_friend_request', {
            'sender_id': sender_id,
            'sender_name': sender_name,
            'message': f"{sender_name} đã gửi cho bạn một lời mời kết bạn!"
        }, room=f"user_{receiver_id}")

# 2. Sự kiện Đồng ý kết bạn Realtime
@socketio.on('accept_friend_request')
def handle_accept_request(data):
    user_id = session.get('user_id') or data.get('user_id')
    friend_id = data.get('friend_id')
    user_name = data.get('user_name', 'Người dùng')

    if user_id and friend_id:
        db = get_db()
        cursor = db.cursor()
        
        # Kiểm tra nếu chưa là bạn bè thì thêm vào DB
        cursor.execute('SELECT id FROM friends WHERE user_id = ? AND friend_id = ?', (user_id, friend_id))
        if not cursor.fetchone():
            cursor.execute('INSERT INTO friends (user_id, friend_id) VALUES (?, ?)', (user_id, friend_id))
            cursor.execute('INSERT INTO friends (user_id, friend_id) VALUES (?, ?)', (friend_id, user_id))
            db.commit()

        # Báo realtime cho người gửi lời mời ban đầu
        emit('friend_request_accepted', {
            'friend_id': user_id,
            'friend_name': user_name,
            'message': f"{user_name} đã chấp nhận lời mời kết bạn!"
        }, room=f"user_{friend_id}")
    