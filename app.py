import os
import sqlite3
from datetime import datetime, date

from flask import Flask, render_template, request, jsonify, session
from werkzeug.security import generate_password_hash, check_password_hash


# ==================================================
# CẤU HÌNH FLASK
# ==================================================

app = Flask(__name__)

app.secret_key = os.environ.get(
    "SECRET_KEY",
    "nightbook_secret_key_night_traveler"
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE = os.path.join(BASE_DIR, "database.db")
SCHEMA_FILE = os.path.join(BASE_DIR, "schema.sql")


# ==================================================
# DATABASE
# ==================================================

def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Tạo database và các bảng nếu chưa tồn tại."""

    if not os.path.exists(SCHEMA_FILE):
        print("ERROR: Không tìm thấy schema.sql")
        return

    db = None

    try:
        db = get_db()

        with open(SCHEMA_FILE, "r", encoding="utf-8") as f:
            schema = f.read()

        db.executescript(schema)
        db.commit()

        print("Database initialized successfully.")

    except Exception as e:
        print("Database initialization error:", e)

    finally:
        if db:
            db.close()


# Quan trọng:
# Render chạy Gunicorn bằng cách import app.py,
# nên phải khởi tạo database ở đây.
init_db()


# ==================================================
# TRANG CHỦ
# ==================================================

@app.route("/")
def index():
    return render_template("index.html")


# ==================================================
# API AUTHENTICATION
# ==================================================

@app.route("/api/register", methods=["POST"])
def register():

    data = request.get_json(silent=True) or {}

    username = str(data.get("username", "")).strip()
    password = str(data.get("password", "")).strip()

    if not username or not password:
        return jsonify({
            "error": "Tên đăng nhập và mật khẩu không được trống"
        }), 400

    db = get_db()

    try:
        existing_user = db.execute(
            "SELECT id FROM users WHERE username = ?",
            (username,)
        ).fetchone()

        if existing_user:
            return jsonify({
                "error": "Tên tài khoản đã tồn tại"
            }), 400

        hashed_pw = generate_password_hash(password)

        cursor = db.execute(
            """
            INSERT INTO users (username, password_hash)
            VALUES (?, ?)
            """,
            (username, hashed_pw)
        )

        db.commit()

        session["user_id"] = cursor.lastrowid
        session["username"] = username

        return jsonify({
            "status": "success",
            "username": username
        })

    except sqlite3.Error as e:

        db.rollback()

        print("REGISTER DATABASE ERROR:", e)

        return jsonify({
            "error": "Lỗi cơ sở dữ liệu khi đăng ký"
        }), 500

    finally:
        db.close()


@app.route("/api/login", methods=["POST"])
def login():

    data = request.get_json(silent=True) or {}

    username = str(data.get("username", "")).strip()
    password = str(data.get("password", "")).strip()

    if not username or not password:
        return jsonify({
            "error": "Vui lòng nhập tên đăng nhập và mật khẩu"
        }), 400

    db = get_db()

    try:

        user = db.execute(
            "SELECT * FROM users WHERE username = ?",
            (username,)
        ).fetchone()

        if not user:
            return jsonify({
                "error": "Tên đăng nhập hoặc mật khẩu không đúng"
            }), 401

        if not check_password_hash(
            user["password_hash"],
            password
        ):
            return jsonify({
                "error": "Tên đăng nhập hoặc mật khẩu không đúng"
            }), 401

        session["user_id"] = user["id"]
        session["username"] = user["username"]

        return jsonify({
            "status": "success",
            "username": user["username"]
        })

    except sqlite3.Error as e:

        print("LOGIN DATABASE ERROR:", e)

        return jsonify({
            "error": "Lỗi cơ sở dữ liệu khi đăng nhập"
        }), 500

    finally:
        db.close()


@app.route("/api/logout", methods=["POST"])
def logout():

    session.clear()

    return jsonify({
        "status": "success"
    })


@app.route("/api/user", methods=["GET"])
def get_user():

    if "user_id" not in session:
        return jsonify({
            "logged_in": False
        })

    db = get_db()

    try:

        user_id = session["user_id"]

        user = db.execute(
            """
            SELECT id, username, streak_count, sky_level
            FROM users
            WHERE id = ?
            """,
            (user_id,)
        ).fetchone()

        if not user:

            session.clear()

            return jsonify({
                "logged_in": False
            })

        last_entry = db.execute(
            """
            SELECT created_at
            FROM entries
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (user_id,)
        ).fetchone()

        current_streak = user["streak_count"] or 0
        current_level = user["sky_level"] or 1

        if last_entry and last_entry["created_at"]:

            last_date_str = last_entry["created_at"].split()[0]

            try:

                last_date = datetime.strptime(
                    last_date_str,
                    "%Y-%m-%d"
                ).date()

                delta_days = (date.today() - last_date).days

                if delta_days > 1 and current_streak > 0:

                    current_streak = 0
                    current_level = 1

                    db.execute(
                        """
                        UPDATE users
                        SET streak_count = 0,
                            sky_level = 1
                        WHERE id = ?
                        """,
                        (user_id,)
                    )

                    db.commit()

            except ValueError:
                pass

        result = dict(user)

        result["streak_count"] = current_streak
        result["sky_level"] = current_level
        result["logged_in"] = True

        return jsonify(result)

    finally:
        db.close()


# ==================================================
# API ENTRIES
# ==================================================

@app.route("/api/entries/private", methods=["GET"])
def get_private_entries():

    if "user_id" not in session:
        return jsonify([])

    db = get_db()

    try:

        entries = db.execute(
            """
            SELECT *
            FROM entries
            WHERE user_id = ?
              AND is_public = 0
            ORDER BY created_at DESC
            """,
            (session["user_id"],)
        ).fetchall()

        return jsonify([
            dict(row) for row in entries
        ])

    finally:
        db.close()


@app.route("/api/entries/public", methods=["GET"])
def get_public_entries():

    db = get_db()

    try:

        entries = db.execute(
            """
            SELECT
                entries.*,
                users.username
            FROM entries
            JOIN users
                ON entries.user_id = users.id
            WHERE entries.is_public = 1
            ORDER BY entries.created_at DESC
            """
        ).fetchall()

        return jsonify([
            dict(row) for row in entries
        ])

    finally:
        db.close()


@app.route("/api/entries", methods=["POST"])
def add_entry():

    if "user_id" not in session:
        return jsonify({
            "error": "Vui lòng đăng nhập"
        }), 401

    data = request.get_json(silent=True) or {}

    content = data.get("content")
    mood = data.get("mood", "calm")
    is_public = 1 if data.get("is_public") else 0

    if not content or not str(content).strip():
        return jsonify({
            "error": "Nội dung không được để trống"
        }), 400

    content = str(content).strip()

    db = get_db()
    user_id = session["user_id"]

    try:

        last_entry = db.execute(
            """
            SELECT created_at
            FROM entries
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (user_id,)
        ).fetchone()

        user = db.execute(
            """
            SELECT streak_count
            FROM users
            WHERE id = ?
            """,
            (user_id,)
        ).fetchone()

        current_streak = (
            user["streak_count"]
            if user else 0
        )

        today = date.today()

        if last_entry and last_entry["created_at"]:

            last_date_str = last_entry["created_at"].split()[0]

            try:

                last_date = datetime.strptime(
                    last_date_str,
                    "%Y-%m-%d"
                ).date()

                delta_days = (today - last_date).days

                if delta_days == 0:
                    new_streak = max(1, current_streak)

                elif delta_days == 1:
                    new_streak = current_streak + 1

                else:
                    new_streak = 1

            except ValueError:

                new_streak = 1

        else:

            new_streak = 1

        new_level = min(
            5,
            (new_streak // 3) + 1
        )

        db.execute(
            """
            INSERT INTO entries
            (user_id, content, mood, is_public)
            VALUES (?, ?, ?, ?)
            """,
            (
                user_id,
                content,
                mood,
                is_public
            )
        )

        db.execute(
            """
            UPDATE users
            SET streak_count = ?,
                sky_level = ?
            WHERE id = ?
            """,
            (
                new_streak,
                new_level,
                user_id
            )
        )

        db.commit()

        return jsonify({
            "status": "success",
            "streak": new_streak,
            "sky_level": new_level
        })

    except sqlite3.Error as e:

        db.rollback()

        print("ENTRY DATABASE ERROR:", e)

        return jsonify({
            "error": "Không thể lưu nhật ký"
        }), 500

    finally:
        db.close()


# ==================================================
# LEADERBOARD
# ==================================================

@app.route("/api/leaderboard", methods=["GET"])
def get_leaderboard():

    db = get_db()

    try:

        users = db.execute(
            """
            SELECT
                username,
                streak_count,
                sky_level
            FROM users
            ORDER BY
                streak_count DESC,
                sky_level DESC
            LIMIT 10
            """
        ).fetchall()

        return jsonify([
            dict(row) for row in users
        ])

    finally:
        db.close()


# ==================================================
# FRIENDS
# ==================================================

@app.route("/api/friends/add", methods=["POST"])
def add_friend():

    if "user_id" not in session:
        return jsonify({
            "error": "Vui lòng đăng nhập"
        }), 401

    data = request.get_json(silent=True) or {}

    friend_id = data.get("friend_id")
    user_id = session["user_id"]

    if not friend_id:
        return jsonify({
            "error": "Không tìm thấy người dùng"
        }), 400

    try:
        friend_id = int(friend_id)

    except (ValueError, TypeError):

        return jsonify({
            "error": "ID người dùng không hợp lệ"
        }), 400

    if user_id == friend_id:

        return jsonify({
            "error": "Không thể tự kết bạn với chính mình"
        }), 400

    db = get_db()

    try:

        friend_exists = db.execute(
            "SELECT id FROM users WHERE id = ?",
            (friend_id,)
        ).fetchone()

        if not friend_exists:

            return jsonify({
                "error": "Người dùng không tồn tại"
            }), 404

        db.execute(
            """
            INSERT INTO friendships
            (user_id, friend_id)
            VALUES (?, ?)
            """,
            (user_id, friend_id)
        )

        db.execute(
            """
            INSERT INTO friendships
            (user_id, friend_id)
            VALUES (?, ?)
            """,
            (friend_id, user_id)
        )

        db.commit()

        return jsonify({
            "status": "success"
        })

    except sqlite3.IntegrityError:

        db.rollback()

        return jsonify({
            "error": "Đã là bạn bè từ trước"
        }), 400

    finally:
        db.close()


@app.route("/api/friends", methods=["GET"])
def get_friends():

    if "user_id" not in session:
        return jsonify([])

    db = get_db()

    try:

        friends = db.execute(
            """
            SELECT
                users.id,
                users.username,
                users.sky_level
            FROM friendships
            JOIN users
                ON friendships.friend_id = users.id
            WHERE friendships.user_id = ?
            """,
            (session["user_id"],)
        ).fetchall()

        return jsonify([
            dict(row) for row in friends
        ])

    finally:
        db.close()


# ==================================================
# MESSAGES
# ==================================================

@app.route("/api/messages/<int:friend_id>", methods=["GET"])
def get_messages(friend_id):

    if "user_id" not in session:
        return jsonify([])

    user_id = session["user_id"]

    db = get_db()

    try:

        messages = db.execute(
            """
            SELECT *
            FROM messages
            WHERE
                (sender_id = ? AND receiver_id = ?)
                OR
                (sender_id = ? AND receiver_id = ?)
            ORDER BY created_at ASC
            """,
            (
                user_id,
                friend_id,
                friend_id,
                user_id
            )
        ).fetchall()

        return jsonify([
            dict(row) for row in messages
        ])

    finally:
        db.close()


@app.route("/api/messages/send", methods=["POST"])
def send_message():

    if "user_id" not in session:
        return jsonify({
            "error": "Vui lòng đăng nhập"
        }), 401

    data = request.get_json(silent=True) or {}

    receiver_id = data.get("receiver_id")

    content = str(
        data.get("content", "")
    ).strip()

    if not receiver_id or not content:

        return jsonify({
            "error": "Nội dung không được để trống"
        }), 400

    try:

        receiver_id = int(receiver_id)

    except (ValueError, TypeError):

        return jsonify({
            "error": "Người nhận không hợp lệ"
        }), 400

    db = get_db()

    try:

        receiver = db.execute(
            "SELECT id FROM users WHERE id = ?",
            (receiver_id,)
        ).fetchone()

        if not receiver:

            return jsonify({
                "error": "Người nhận không tồn tại"
            }), 404

        db.execute(
            """
            INSERT INTO messages
            (sender_id, receiver_id, content)
            VALUES (?, ?, ?)
            """,
            (
                session["user_id"],
                receiver_id,
                content
            )
        )

        db.commit()

        return jsonify({
            "status": "success"
        })

    except sqlite3.Error as e:

        db.rollback()

        print("MESSAGE DATABASE ERROR:", e)

        return jsonify({
            "error": "Không thể gửi tin nhắn"
        }), 500

    finally:
        db.close()


# ==================================================
# CHẠY LOCAL
# ==================================================

if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )