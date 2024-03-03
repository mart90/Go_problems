class User:
    def __init__(self, id, username, rating, kfactor):
        self.id = id
        self.username = username
        self.hashedPassword = None
        self.rating = rating
        self.kfactor = kfactor

    def insert(self, mysql):
        values = (
            self.username,
            self.hashedPassword
        )
        mysql.query("INSERT INTO user (username, password_hash) VALUES (%s, %s)", values)

    def update_rating(self, mysql):
        values = (
            self.rating,
            self.kfactor,
            self.id
        )
        mysql.query("update user set rating = %s, kfactor = %s where id = %s", values)
