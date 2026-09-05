import os
from flask import Flask
from flask_socketio import SocketIO

socketio = SocketIO()

def create_app():
    base_dir = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
    
    app = Flask(
        __name__,
        template_folder=os.path.join(base_dir, 'templates'),
        static_folder=os.path.join(base_dir, 'static')
    )

    app.config['SECRET_KEY'] = 'nightbook-secret-key'

    from app.models import close_db, init_db
    app.teardown_appcontext(close_db)
    init_db(app)

    from app.routes.main import main_bp
    from app.routes.auth import auth_bp
    from app.routes.messages import messages_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(messages_bp)

    socketio.init_app(app, cors_allowed_origins="*")

    return app