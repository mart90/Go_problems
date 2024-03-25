# 1. git reset --hard
# 2. git pull
# 3. Update version number for JS and CSS files
# 4. Update references in html files with the version number
# 5. Restart gunicorn
# 6. Update version number in config

import subprocess
import time
import os
from config import config


print("Pulling latest version")
subprocess.run("git reset --hard; git pull", shell=True)
time.sleep(5)

print("Updating filenames")
filenames = []
for filename in os.listdir("frontend/wgo"):
    filenames.append(filename)
    os.rename(filename, str(config["cache_version"]) + "_" + filename)
for filename in os.listdir("frontend/wgo/themes"):
    filenames.append(filename)
    os.rename(filename, str(config["cache_version"]) + "_" + filename)
for filename in os.listdir("frontend/css"):
    filenames.append(filename)
    os.rename(filename, str(config["cache_version"]) + "_" + filename)

print("Updating references")
for filename in os.listdir("frontend"):
    with open(filename, 'r') as file:
        filedata = file.read()

    for file_ref in filenames:
        filedata = filedata.replace(file_ref, str(config["cache_version"]) + "_" + file_ref)

    with open(filename, 'w') as file:
        file.write(filedata)

for filename in os.listdir("frontend/templates"):
    with open(filename, 'r') as file:
        filedata = file.read()

    for file_ref in filenames:
        filedata = filedata.replace(file_ref, str(config["cache_version"]) + "_" + file_ref)

    with open(filename, 'w') as file:
        file.write(filedata)

print("Restarting gunicorn")
subprocess.run("pkill gunicorn; gunicorn -b 127.0.0.1:5000 app:app --daemon --log-file /var/log/gunicorn_error.log", shell=True)

print("Done")
