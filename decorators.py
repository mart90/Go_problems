from functools import wraps
import jwt
from config import config
from flask import request, jsonify
from mysql import *
from user import User


def token_required(f):
    @wraps(f)
    def decorator(*args, **kwargs):
        bearer = request.headers.get("authorization")
        if not bearer:
            return jsonify({'message': 'a valid token is missing'})
        token = bearer.split()[1]

        try:
            data = jwt.decode(token, config["secret"], algorithms=["HS256"])
            mysql = MySQL().connect(mysql_ip, mysql_db)
            mysql.query("SELECT id, name, rating, kfactor FROM user WHERE id = %s", (data['user_id']))
            result = mysql.cursor.fetchone()
            current_user = User(result[0], result[1], result[2], result[3])
            mysql.commit_and_close()
        except:
            return jsonify({'message': 'token is invalid'})

        return f(current_user, *args, **kwargs)

    return decorator
