from flask import Blueprint, request, jsonify, session
from flask_socketio import emit, join_room

from app import socketio
from app.models import get_db


messages_bp = Blueprint("messages", __name__)


# =========================================================
# HỖ TRỢ
# =========================================================

def get_current_user_id():
    return session.get("user_id")


def user_room(user_id):
    return f"user_{user_id}"


# =========================================================
# DANH SÁCH BẠN BÈ
# =========================================================

@messages_bp.route("/api/friends")
def get_friends():
    user_id = get_current_user_id()

    if not user_id:
        return jsonify([]), 401

    db = get_db()
    cursor = db.cursor()

    cursor.execute("""
        SELECT
            u.id,
            u.username,
            u.sky_level
        FROM friends f
        JOIN users u
            ON f.friend_id = u.id
        WHERE f.user_id = ?
        ORDER BY u.username COLLATE NOCASE ASC
    """, (user_id,))

    friends = [dict(row) for row in cursor.fetchall()]

    return jsonify(friends)


# =========================================================
# THÊM BẠN
# =========================================================

@messages_bp.route("/api/friends/add", methods=["POST"])
def add_friend():
    user_id = get_current_user_id()

    if not user_id:
        return jsonify({
            "error": "Chưa đăng nhập"
        }), 401

    data = request.get_json(silent=True) or {}

    try:
        friend_id = int(data.get("friend_id"))
    except (TypeError, ValueError):
        return jsonify({
            "error": "ID người dùng không hợp lệ"
        }), 400

    if friend_id == user_id:
        return jsonify({
            "error": "Không thể kết bạn với chính mình"
        }), 400

    db = get_db()
    cursor = db.cursor()

    cursor.execute(
        """
        SELECT id
        FROM friends
        WHERE user_id = ?
          AND friend_id = ?
        """,
        (user_id, friend_id)
    )

    if cursor.fetchone():
        return jsonify({
            "error": "Đã là bạn bè từ trước"
        }), 400

    # Kiểm tra người nhận có tồn tại
    cursor.execute(
        "SELECT id FROM users WHERE id = ?",
        (friend_id,)
    )

    if not cursor.fetchone():
        return jsonify({
            "error": "Người dùng không tồn tại"
        }), 404

    cursor.execute(
        """
        INSERT INTO friends (user_id, friend_id)
        VALUES (?, ?)
        """,
        (user_id, friend_id)
    )

    cursor.execute(
        """
        INSERT INTO friends (user_id, friend_id)
        VALUES (?, ?)
        """,
        (friend_id, user_id)
    )

    db.commit()

    return jsonify({
        "message": "Kết bạn thành công"
    })


# =========================================================
# LỊCH SỬ CHAT
# =========================================================

@messages_bp.route("/api/messages/<int:friend_id>")
def get_messages(friend_id):
    user_id = get_current_user_id()

    if not user_id:
        return jsonify([]), 401

    if friend_id == user_id:
        return jsonify([]), 400

    db = get_db()
    cursor = db.cursor()

    # Chỉ lấy 100 tin nhắn gần nhất.
    # Sau đó đảo lại để giao diện hiển thị từ cũ -> mới.
    cursor.execute("""
        SELECT *
        FROM messages
        WHERE
            (sender_id = ? AND receiver_id = ?)
            OR
            (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at DESC
        LIMIT 100
    """, (
        user_id,
        friend_id,
        friend_id,
        user_id
    ))

    messages = [dict(row) for row in cursor.fetchall()]

    messages.reverse()

    return jsonify(messages)


# =========================================================
# SOCKET.IO
# =========================================================

@socketio.on("connect")
def handle_connect():
    """
    Socket.IO tự sử dụng session Flask hiện tại.
    Không nhận user_id từ trình duyệt để tránh giả mạo.
    """
    user_id = get_current_user_id()

    if user_id:
        join_room(user_room(user_id))


@socketio.on("register_user")
def handle_register_user():
    user_id = get_current_user_id()

    if user_id:
        join_room(user_room(user_id))


@socketio.on("join_room")
def handle_join_room(data=None):
    user_id = get_current_user_id()

    if user_id:
        join_room(user_room(user_id))


# =========================================================
# GỬI TIN NHẮN REALTIME
# =========================================================

@socketio.on("send_message")
def handle_send_message(data):
    user_id = get_current_user_id()

    if not user_id:
        return

    data = data or {}

    receiver_id = data.get("receiver_id")
    content = data.get("content")
    client_id = data.get("client_id")

    try:
        receiver_id = int(receiver_id)
    except (TypeError, ValueError):
        return

    if receiver_id == user_id:
        return

    if not isinstance(content, str):
        return

    content = content.strip()

    if not content:
        return

    # Giới hạn tin nhắn để tránh request quá lớn.
    if len(content) > 5000:
        return

    db = get_db()
    cursor = db.cursor()

    # Kiểm tra người nhận tồn tại
    cursor.execute(
        "SELECT id FROM users WHERE id = ?",
        (receiver_id,)
    )

    if not cursor.fetchone():
        return

    # Kiểm tra hai người có phải bạn bè không
    cursor.execute("""
        SELECT id
        FROM friends
        WHERE user_id = ?
          AND friend_id = ?
        LIMIT 1
    """, (
        user_id,
        receiver_id
    ))

    if not cursor.fetchone():
        return

    cursor.execute("""
        INSERT INTO messages (
            sender_id,
            receiver_id,
            content
        )
        VALUES (?, ?, ?)
    """, (
        user_id,
        receiver_id,
        content
    ))

    db.commit()

    message_id = cursor.lastrowid

    # Lấy created_at thật từ database
    cursor.execute("""
        SELECT *
        FROM messages
        WHERE id = ?
        LIMIT 1
    """, (message_id,))

    row = cursor.fetchone()

    if row:
        msg_data = dict(row)
    else:
        msg_data = {
            "id": message_id,
            "sender_id": user_id,
            "receiver_id": receiver_id,
            "content": content
        }

    # client_id chỉ dùng để chống tin nhắn trùng
    if client_id:
        msg_data["client_id"] = client_id

    # Gửi cho người nhận.
    emit(
        "receive_message",
        msg_data,
        to=user_room(receiver_id)
    )

    # Gửi lại cho các tab khác của người gửi.
    # Tab hiện tại sẽ tự nhận diện client_id và không append lần 2.
    emit(
        "receive_message",
        msg_data,
        to=user_room(user_id),
        include_self=False
    )


# =========================================================
# LỜI MỜI KẾT BẠN REALTIME
# =========================================================

@socketio.on("send_friend_request")
def handle_friend_request(data):
    sender_id = get_current_user_id()

    if not sender_id:
        return

    data = data or {}

    receiver_id = data.get("receiver_id")

    try:
        receiver_id = int(receiver_id)
    except (TypeError, ValueError):
        return

    if receiver_id == sender_id:
        return

    db = get_db()
    cursor = db.cursor()

    # Lấy username thật từ database,
    # không tin sender_name do client gửi.
    cursor.execute(
        """
        SELECT username
        FROM users
        WHERE id = ?
        """,
        (sender_id,)
    )

    sender = cursor.fetchone()

    if not sender:
        return

    sender_name = sender["username"]

    emit(
        "receive_friend_request",
        {
            "sender_id": sender_id,
            "sender_name": sender_name,
            "message": f"{sender_name} đã gửi cho bạn một lời mời kết bạn!"
        },
        to=user_room(receiver_id)
    )


# =========================================================
# CHẤP NHẬN LỜI MỜI
# =========================================================

@socketio.on("accept_friend_request")
def handle_accept_request(data):
    user_id = get_current_user_id()

    if not user_id:
        return

    data = data or {}

    friend_id = data.get("friend_id")

    try:
        friend_id = int(friend_id)
    except (TypeError, ValueError):
        return

    if friend_id == user_id:
        return

    db = get_db()
    cursor = db.cursor()

    # Kiểm tra người kia tồn tại
    cursor.execute(
        "SELECT id FROM users WHERE id = ?",
        (friend_id,)
    )

    if not cursor.fetchone():
        return

    # Kiểm tra quan hệ hiện tại
    cursor.execute("""
        SELECT id
        FROM friends
        WHERE user_id = ?
          AND friend_id = ?
        LIMIT 1
    """, (
        user_id,
        friend_id
    ))

    if not cursor.fetchone():

        cursor.execute("""
            INSERT INTO friends (
                user_id,
                friend_id
            )
            VALUES (?, ?)
        """, (
            user_id,
            friend_id
        ))

    cursor.execute("""
        SELECT id
        FROM friends
        WHERE user_id = ?
          AND friend_id = ?
        LIMIT 1
    """, (
        friend_id,
        user_id
    ))

    if not cursor.fetchone():

        cursor.execute("""
            INSERT INTO friends (
                user_id,
                friend_id
            )
            VALUES (?, ?)
        """, (
            friend_id,
            user_id
        ))

    db.commit()

    # Lấy username thật
    cursor.execute(
        """
        SELECT username
        FROM users
        WHERE id = ?
        """,
        (user_id,)
    )

    user = cursor.fetchone()

    user_name = (
        user["username"]
        if user
        else "Người dùng"
    )

    emit(
        "friend_request_accepted",
        {
            "friend_id": user_id,
            "friend_name": user_name,
            "message": f"{user_name} đã chấp nhận lời mời kết bạn!"
        },
        to=user_room(friend_id)
    )