class Problem:
    def __init__(self, id, game_id, rating, kfactor, move_number, attempts, game_title=None, game_date=None):
        self.id = id
        self.game_id = game_id
        self.move_number = move_number
        self.rating = rating
        self.kfactor = kfactor
        self.attempts = attempts
        self.game_moves = []
        self.solutions = []
        self.game_title = game_title
        self.game_date = game_date

    def update_rating(self, mysql):
        values = (
            self.rating,
            self.kfactor,
            self.id
        )
        mysql.query("update problem set rating = %s, kfactor = %s where id = %s", values)
