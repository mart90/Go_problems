import pymysql
from pymysql.constants import CLIENT
import os
from config import config


mysql_ip = config["mysql_address"]
mysql_db = config["mysql_db"]


class MySQL(object):
    user = "python"

    def __init__(self):
        self.conn = None
        self.cursor = None
        self.dbname = None

    def connect(self, host, dbname):
        self.dbname = dbname
        self.conn = pymysql.connect(
            host=host,
            user=self.user,
            passwd=config["mysql_pw"],
            db=dbname,
            client_flag=CLIENT.MULTI_STATEMENTS)
        self.cursor = self.conn.cursor()
        return self

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()

    def commit_and_close(self):
        self.conn.commit()
        self.conn.close()

    def query(self, query, *args):
        self.cursor.execute(query, *args)
