import jwt
import random
import datetime
from flask import Flask, request, Response, make_response, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from mysql import *
from decorators import token_required
from config import config
from functions import *
from werkzeug.middleware.proxy_fix import ProxyFix
from user import User
from problem import Problem
from game_move import GameMove


# python -m flask run

app = Flask(__name__)
app.wsgi_app = ProxyFix(
    app.wsgi_app, 
    x_for=1, 
    x_proto=1, 
    x_host=1, 
    x_prefix=1
)
if os.name == "nt":
    from flask_cors import CORS
    cors = CORS(app)


@app.route("/backend/login", methods=["POST"])
def login():
    auth = request.authorization
    if not auth or not auth.username or not auth.password:
        print(auth.username)
        return make_response('Missing credentials', 400, {'Authentication': 'login required'})

    mysql = MySQL().connect(mysql_ip, mysql_db)
    mysql.query("SELECT id, password_hash, name, rating, kfactor FROM user WHERE name = %s", (auth.username))
    result = mysql.cursor.fetchone()

    if result is None:
        return make_response('Invalid credentials', 401, {'Authentication': 'login required'})

    user = User(result[0], result[2], result[3], result[4])
    mysql.commit_and_close()

    if check_password_hash(result[1], auth.password):
        expires_at = datetime.datetime.utcnow() + datetime.timedelta(hours=24)
        token = jwt.encode({
            'user_id': user.id,
            'exp': expires_at
        }, config["secret"], "HS256")

        return jsonify({
            'token': token,
            'expires_at': expires_at
        })

    return make_response('Invalid credentials', 401, {'Authentication': 'login required'})


@app.route("/backend/register", methods=["POST"])
def register():
    mysql = MySQL().connect(mysql_ip, mysql_db)
    body = request.json

    values = (
        body["username"],
        generate_password_hash(body["password"]),
        body["email"],
        int(body["rating"])
    )

    mysql.query("INSERT INTO user (name, password_hash, email, rating) values (%s, %s, %s, %s)", values)
    mysql.commit_and_close()
    return Response("", 200)


@app.route("/backend/refresh_token", methods=["GET"])
@token_required
def refresh_token(current_user):
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(hours=24)
    token = jwt.encode({
        'user_id': current_user.id,
        'exp': expires_at
    }, config["secret"], "HS256")

    return jsonify({
        'token': token,
        'expires_at': expires_at
    })


@app.route("/backend/get_current_rating", methods=["GET"])
@token_required
def get_current_rating(current_user):
    return jsonify(current_user.rating)


@app.route("/backend/get_new_problem", methods=["GET"])
@token_required
def get_new_problem(current_user):
    mysql = MySQL().connect(mysql_ip, mysql_db)

    mysql.query("""
        select p.id, p.game_id, p.rating, p.kfactor, p.move_number, count(*) as attempts
        from problem p
        left join problem_attempt pa on p.id = pa.problem_id
        where 
            pa.user_id = %s
            and p.flag = 2
        group by p.id
        union
        select p.id, p.game_id, p.rating, p.kfactor, p.move_number, 0 as attempts
        from problem p
        where 
            p.flag = 2
            and %s not in (select user_id from problem_attempt pa where p.id = pa.problem_id)""", (current_user.id, current_user.id))

    result = mysql.cursor.fetchall()

    problems = [Problem(row[0], row[1], row[2], row[3], row[4], row[5]) for row in result]
    problems_min_attempts = [p for p in problems if p.attempts == min([pr.attempts for pr in problems])]
    problems_in_rating_range = [p for p in problems_min_attempts if current_user.rating + 200 > p.rating > current_user.rating - 200]

    if not problems_in_rating_range:
        problems_in_rating_range = [p for p in problems_min_attempts if current_user.rating + 500 > p.rating > current_user.rating - 500]
        if not problems_in_rating_range:
            problems_in_rating_range = problems

    problem = problems_in_rating_range[random.randint(0, len(problems_in_rating_range) - 1)]
    #problem = problems_in_rating_range[0]

    mysql.query("select move_number, move from game_move where game_id = %s", (problem.game_id))
    result = mysql.cursor.fetchall()
    problem.game_moves = [GameMove(row[0], row[1]) for row in result]

    mysql.commit_and_close()

    return {
        "id": problem.id,
        "game_id": problem.game_id,
        "move_number": problem.move_number,
        "rating": problem.rating,
        "kfactor": problem.kfactor,
        "game_moves": [{
            "move_number": gm.move_number,
            "move": gm.move
        } for gm in problem.game_moves if gm.move_number < problem.move_number]
    }


@app.route("/backend/make_attempt", methods=["POST"])
@token_required
def make_attempt(current_user):
    mysql = MySQL().connect(mysql_ip, mysql_db)
    body = request.json

    problem_id = body["problemId"]
    move = body["move"]

    mysql.query("""
        select p.id, p.rating, p.kfactor, g.title, g.date_played 
        from problem p
        join game g on g.id = p.game_id
        where p.id = %s""", (problem_id))
    
    result = mysql.cursor.fetchone()
    problem = Problem(result[0], None, result[1], result[2], None, None, result[3], result[4])

    mysql.query("""select kgm.move, kgm.winrate, kgm.score_lead
        from katago_move kgm
        join problem p on p.id = %s
        where 
            kgm.game_id = p.game_id
            and kgm.move_number = p.move_number
        union
        select gm.move, 0, 0
        from game_move gm
        join problem p on p.id = %s
        where 
            gm.game_id = p.game_id
            and gm.move_number = p.move_number""", (problem_id, problem_id))

    result = mysql.cursor.fetchall()

    success = False
    for row in result:
        if move == row[0]:
            success = True

    old_rating = current_user.rating
    problem_old_rating = problem.rating

    current_user.rating = calculate_new_rating(old_rating, problem_old_rating, success, current_user.kfactor)
    problem.rating = calculate_new_rating(problem_old_rating, old_rating, not success, problem.kfactor)

    if current_user.kfactor > 16:
        current_user.kfactor -= 1
    if problem.kfactor > 4:
        problem.kfactor -= 1

    current_user.update_rating(mysql)
    problem.update_rating(mysql)

    mysql.query("insert into problem_attempt (problem_id, user_id, success, user_new_rating, problem_new_rating) values (%s, %s, %s, %s, %s)", (
        problem_id,
        current_user.id,
        1 if success else 0,
        current_user.rating,
        problem.rating
    ))

    mysql.commit_and_close()

    return {
        "problem_id": problem.id,
        "success": success,
        "game_title": problem.game_title,
        "game_date": problem.game_date,
        "new_rating": current_user.rating,
        "rating_change": current_user.rating - old_rating,
        "problem_rating": problem.rating,
        "problem_rating_change": problem.rating - problem_old_rating,
        "solutions": [{
            "move": row[0],
            "winrate": row[1],
            "score_lead": row[2]
        } for row in result]
    }
