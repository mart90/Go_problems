# 1. git clean -f
# 2. git reset --hard
# 3. git pull
# 4. Update version number for JS and CSS files
# 5. Update references in html files with the version number
# 6. Restart gunicorn
# 7. Update version number in config

import subprocess
import time
import os
from config import config


print("Pulling latest version")
subprocess.run("git clean -f; git reset --hard; git pull", shell=True)

os.rename("frontend/wgo/" + str(config["cache_version"] - 1) + "_serverAddress.js", "frontend/wgo/serverAddress.js")

print("Updating filenames")
filenames = []
for filename in [f for f in os.listdir("frontend/wgo") if os.path.isfile("frontend/wgo/" + f)]:
    filenames.append("/" + filename)
    os.rename("frontend/wgo/" + filename, "frontend/wgo/" + str(config["cache_version"]) + "_" + filename)
for filename in [f for f in os.listdir("frontend/wgo/themes") if os.path.isfile("frontend/wgo/themes/" + f)]:
    filenames.append("/" + filename)
    os.rename("frontend/wgo/themes/" + filename, "frontend/wgo/themes/" + str(config["cache_version"]) + "_" + filename)
for filename in [f for f in os.listdir("frontend/css") if os.path.isfile("frontend/css/" + f)]:
    filenames.append("/" + filename)
    os.rename("frontend/css/" + filename, "frontend/css/" + str(config["cache_version"]) + "_" + filename)

print("Updating references")
for filename in [f for f in os.listdir("frontend") if os.path.isfile("frontend/" + f)]:
    with open("frontend/" + filename, 'r') as file:
        filedata = file.read()

    for file_ref in filenames:
        filedata = filedata.replace(file_ref, "/" + str(config["cache_version"]) + "_" + file_ref)

    with open("frontend/" + filename, 'w') as file:
        file.write(filedata)

for filename in [f for f in os.listdir("frontend/templates") if os.path.isfile("frontend/templates" + f)]:
    with open("frontend/templates/" + filename, 'r') as file:
        filedata = file.read()

    for file_ref in filenames:
        filedata = filedata.replace(file_ref, "/" + str(config["cache_version"]) + "_" + file_ref)

    with open("frontend/templates/" + filename, 'w') as file:
        file.write(filedata)

print("Restarting gunicorn")
subprocess.run("pkill gunicorn; gunicorn -b 127.0.0.1:5000 app:app --daemon --log-file /var/log/gunicorn_error.log", shell=True)

print("Updating version number in config")
with open("config.py", "r") as file:
    configdata = file.read()

configdata = configdata.replace('"cache_version": ' + str(config["cache_version"]), '"cache_version": ' + str(config["cache_version"] + 1))

with open("config.py", "w") as file:
    file.write(configdata)

print("Done")
