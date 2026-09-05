import sqlite3

conn = sqlite3.connect('nightbook.db')

# Tạo Index cho bảng entries
conn.execute('CREATE INDEX IF NOT EXISTS idx_entries_user_id ON entries(user_id);')
conn.execute('CREATE INDEX IF NOT EXISTS idx_entries_created_at ON entries(created_at);')

conn.commit()
conn.close()

print("✅ Đã tạo Index cho bảng entries thành công!")