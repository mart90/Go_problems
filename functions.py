def calculate_new_rating(old_rating, opponent_rating, win, kfactor):
    win_int = 1 if win is True else 0
    win_chance = 1 / (1 + pow(10, (opponent_rating - old_rating) / 400.0))
    return old_rating + kfactor * (win_int - win_chance)
