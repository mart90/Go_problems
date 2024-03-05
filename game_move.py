class GameMove:
    def __init__(self, move_number, move):
        self.move_number = move_number
        self.move = move

    @staticmethod
    def get_by_game(mysql, game_id):
        mysql.query("select move_number, move from game_move where game_id = %s", (game_id))
        result = mysql.cursor.fetchall()
        return [GameMove(row[0], row[1]) for row in result]
