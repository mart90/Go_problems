import jwt
import random
import datetime
from flask import Flask, request, Response, make_response, jsonify, render_template
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

app = Flask(__name__, template_folder="frontend/templates", static_folder="frontend", static_url_path="")
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
        where pa.user_id = %s
        group by p.id
        union
        select p.id, p.game_id, p.rating, p.kfactor, p.move_number, 0 as attempts
        from problem p""", (current_user.id))

    result = mysql.cursor.fetchall()

    problems = [Problem(row[0], row[1], row[2], row[3], row[4], row[5]) for row in result]

    problem_ids_attempted = [p.id for p in problems if p.attempts > 0]
    problems = [p for p in problems if p.id not in problem_ids_attempted or p.attempts > 0]

    problems = [p for p in problems if p.id == 1068]

    problems_min_attempts = [p for p in problems if p.attempts == min([pr.attempts for pr in problems])]
    problems_in_rating_range = [p for p in problems_min_attempts if current_user.rating + 200 > p.rating > current_user.rating - 200]

    if not problems_in_rating_range:
        problems_in_rating_range = [p for p in problems_min_attempts if current_user.rating + 500 > p.rating > current_user.rating - 500]
        if not problems_in_rating_range:
            problems_in_rating_range = problems

    problem = problems_in_rating_range[random.randint(0, len(problems_in_rating_range) - 1)]

    problem.game_moves = GameMove.get_by_game(mysql, problem.game_id)

    mysql.commit_and_close()

    return {
        "game_id": problem.game_id,
        "move_number": problem.move_number,
        "rating": problem.rating,
        "kfactor": problem.kfactor,
        "game_moves": [{
            "move_number": gm.move_number,
            "move": gm.move
        } for gm in problem.game_moves]
    }


@app.route("/backend/get_new_problem_anonymous", methods=["POST"])
def get_new_problem_anonymous():
    mysql = MySQL().connect(mysql_ip, mysql_db)

    rating = float(request.json["rating"])

    mysql.query("""
        select
            p.id,
            g.id as game_id,
            p.rating,
            p.move_number,
            g.title as game_title,
            g.date_played as game_date_played
        from problem p
        join game g on g.id = p.game_id""")

    result = mysql.cursor.fetchall()

    problems = [Problem(row[0], row[1], row[2], 0, row[3], 0, row[4], row[5]) for row in result]
    problems_in_rating_range = [p for p in problems if rating + 200 > p.rating > rating - 200]

    if not problems_in_rating_range:
        problems_in_rating_range = [p for p in problems if rating + 500 > p.rating > rating - 500]
        if not problems_in_rating_range:
            problems_in_rating_range = problems

    problem = problems_in_rating_range[random.randint(0, len(problems_in_rating_range) - 1)]

    problem.set_solutions(mysql)
    problem.game_moves = GameMove.get_by_game(mysql, problem.game_id)

    mysql.commit_and_close()

    return {
        "id": problem.id,
        "move_number": problem.move_number,
        "rating": problem.rating,
        "game_id": problem.game_id,
        "game_title": problem.game_title,
        "game_date": problem.game_date,
        "game_moves": [{
            "move_number": gm.move_number,
            "move": gm.move
        } for gm in problem.game_moves],
        "solutions": [{
            "move": row[0],
            "winrate": row[1],
            "score_lead": row[2]
        } for row in problem.solutions]
    }


@app.route("/backend/make_attempt", methods=["POST"])
@token_required
def make_attempt(current_user):
    mysql = MySQL().connect(mysql_ip, mysql_db)
    body = request.json

    game_id = body["gameId"]
    move_number = body["moveNumber"]
    move = body["move"]

    mysql.query("""
        select p.id, p.rating, p.kfactor, g.title, g.date_played, p.user_rating,
            (select count(*) from problem_attempt pa where pa.problem_id = p.id) as total_attempts,
            (select rating from problem_rating pr where pr.problem_id = p.id and pr.user_id = %s) as my_rating
        from problem p
        join game g on g.id = p.game_id
        where
            p.game_id = %s
            and p.move_number = %s""", (current_user.id, game_id, move_number))

    result = mysql.cursor.fetchone()
    problem = Problem(result[0], None, result[1], result[2], None, None, result[3], result[4])
    user_rating = result[5]
    total_attempts = result[6]
    my_rating = result[7]

    problem.set_solutions(mysql)

    success = False
    for row in problem.solutions:
        if move == row[0]:
            success = True

    old_rating = current_user.rating
    problem_old_rating = problem.rating

    current_user.rating = calculate_new_rating(old_rating, problem_old_rating, success, current_user.kfactor)
    problem.rating = calculate_new_rating(problem_old_rating, old_rating, not success, problem.kfactor)

    if current_user.kfactor > 24:
        current_user.kfactor -= 1
    if problem.kfactor > 4:
        problem.kfactor -= 1

    current_user.update_rating(mysql)
    problem.update_rating(mysql)

    mysql.query("insert into problem_attempt (problem_id, user_id, move, success, user_new_rating, problem_new_rating) values (%s, %s, %s, %s, %s, %s)", (
        problem.id,
        current_user.id,
        move,
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
        "total_attempts": total_attempts + 1,  # +1 because we just added this attempt
        "user_rating": user_rating,
        "my_rating": my_rating,
        "solutions": [{
            "move": row[0],
            "winrate": row[1],
            "score_lead": row[2]
        } for row in problem.solutions]
    }


@app.route("/backend/make_attempt_anonymous", methods=["POST"])
def make_attempt_anonymous():
    mysql = MySQL().connect(mysql_ip, mysql_db)
    body = request.json

    game_id = body["gameId"]
    move_number = body["moveNumber"]
    move = body["move"]

    mysql.query("""
        select p.id, p.rating, p.kfactor, g.title, g.date_played 
        from problem p
        join game g on g.id = p.game_id
        where 
            p.game_id = %s
            and p.move_number = %s""", (game_id, move_number))
    
    result = mysql.cursor.fetchone()
    problem = Problem(result[0], None, result[1], result[2], None, None, result[3], result[4])

    problem.set_solutions(mysql)

    success = False
    for row in problem.solutions:
        if move == row[0]:
            success = True

    mysql.query("insert into problem_attempt (problem_id, user_id, move, success) values (%s, null, %s, %s)", (
        problem.id,
        move,
        1 if success else 0
    ))

    mysql.commit_and_close()
    return Response("", 200)


@app.route("/problems/<id>", methods=["GET"])
def get_problem_view(id):
    return render_template("problem.html", problemId=id)


@app.route("/backend/problems/<id>", methods=["GET"])
@token_required
def get_problem_by_id(current_user, id):
    mysql = MySQL().connect(mysql_ip, mysql_db)

    mysql.query("""
        select
            p.rating,
            g.id as game_id,
            g.title as game_title,
            g.date_played as game_date_played,
            (select count(*) from problem_attempt pa where pa.problem_id = p.id) as attempts,
            p.move_number,
            p.user_rating,
            (select rating from problem_rating pr where pr.problem_id = p.id and pr.user_id = %s) as my_rating
        from problem p
        join game g on g.id = p.game_id
        where p.id = %s""", (current_user.id, id))
    
    result = mysql.cursor.fetchone()

    if (result is None):
        return make_response('There is no problem with this id', 404)

    problem = Problem(id, result[1], result[0], None, result[5], result[4], result[2], result[3])
    user_rating = result[6]
    my_rating = result[7]
    problem.set_solutions(mysql)
    problem.game_moves = GameMove.get_by_game(mysql, problem.game_id)

    mysql.commit_and_close()

    return {
        "id": problem.id,
        "move_number": problem.move_number,
        "rating": problem.rating,
        "total_attempts": problem.attempts,
        "user_rating": user_rating,
        "my_rating": my_rating,
        "game_id": problem.game_id,
        "game_title": problem.game_title,
        "game_date": problem.game_date,
        "game_moves": [{
            "move_number": gm.move_number,
            "move": gm.move
        } for gm in problem.game_moves],
        "solutions": [{
            "move": row[0],
            "winrate": row[1],
            "score_lead": row[2]
        } for row in problem.solutions]
    }


@app.route("/backend/my_attempts", methods=["POST"])
@token_required
def get_my_attempts(current_user):
    mysql = MySQL().connect(mysql_ip, mysql_db)
    body = request.json

    start_index = body["startIndex"]
    amount = body["amount"]
    sort_column = body["sortColumn"]

    mysql.query("""
        select
            pa.date_attempted,
            p.id,
            p.rating,
            pa.success,
            pa.user_new_rating,
            g.title as game_title,
            p.move_number
        from problem_attempt pa
        join problem p on pa.problem_id = p.id
        join game g on g.id = p.game_id
        where pa.user_id = %s
        order by {}
        limit %s, %s""".format(sort_column), (current_user.id, start_index, amount))
    
    results = mysql.cursor.fetchall()

    mysql.commit_and_close()

    return [{
            "date_attempted": row[0],
            "problem_id": row[1],
            "problem_rating": round(row[2]),
            "success": True if row[3] == 1 else False,
            "user_new_rating": round(row[4]),
            "game_title": row[5],
            "game_move_number": row[6]
        }
        for row in results]


@app.route("/backend/problems", methods=["POST"])
@token_required
def get_problems(current_user):
    mysql = MySQL().connect(mysql_ip, mysql_db)
    body = request.json

    rating_start = body["rating_start"]
    rating_end = body["rating_end"]

    start_index = body["startIndex"]
    amount = body["amount"]
    sort_column = body["sortColumn"]

    mysql.query("""
        select
            p.id,
            p.rating,
            g.title as game_title,
            p.move_number,
            count(*) as attempts
        from problem p
        join problem_attempt pa on pa.problem_id = p.id
        join game g on g.id = p.game_id
        where p.rating between %s and %s
        group by p.id
        order by {}
        limit %s, %s""".format(sort_column), (rating_start, rating_end, start_index, amount))
    
    results = mysql.cursor.fetchall()

    mysql.commit_and_close()

    return [{
            "id": row[0],
            "rating": round(row[1]),
            "game_title": row[2],
            "move_number": row[3],
            "attempts": row[4]
        }
        for row in results]


@app.route("/backend/problem_count", methods=["GET"])
@token_required
def get_problem_count(current_user):
    mysql = MySQL().connect(mysql_ip, mysql_db)

    mysql.query("select count(*) from problem")
    
    result = mysql.cursor.fetchone()

    mysql.commit_and_close()

    return str(result[0])


@app.route("/backend/rate_problem", methods=["POST"])
@token_required
def rate_problem(current_user):
    mysql = MySQL().connect(mysql_ip, mysql_db)
    body = request.json

    rating = body["rating"]
    problem_id = body["problem_id"]

    if rating > 5 or rating < 1:
        return Response("", 400)
    
    mysql.query("SELECT id FROM problem_rating WHERE user_id = %s and problem_id = %s", (current_user.id, problem_id))

    result = mysql.cursor.fetchone()

    if result:
        mysql.query("UPDATE problem_rating SET rating = %s WHERE user_id = %s and problem_id = %s", (rating, current_user.id, problem_id))
    else:
        mysql.query("INSERT INTO problem_rating (user_id, problem_id, rating) values (%s, %s, %s)", (current_user.id, problem_id, rating))
    
    mysql.query("UPDATE problem SET user_rating = (SELECT avg(rating) from problem_rating WHERE problem_id = %s) where id = %s", (problem_id, problem_id))

    mysql.commit_and_close()
    return Response("", 200)


@app.route("/backend/add_comment", methods=["POST"])
@token_required
def add_comment(current_user):
    mysql = MySQL().connect(mysql_ip, mysql_db)
    body = request.json

    comment = body["rating"]
    problem_id = body["problem_id"]

    mysql.query("INSERT INTO problem_comment (user_id, problem_id, comment) values (%s, %s, %s)", (current_user.id, problem_id, comment))
    mysql.commit_and_close()
    return Response("", 200)
