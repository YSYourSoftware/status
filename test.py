import flask as f

import os

app = f.Flask(__name__)

@app.route("/")
def route_index():
	return f.send_from_directory(os.path.dirname(__file__), "index.html")

@app.route("/<path:filename>")
def route_filename(filename):
	return f.send_from_directory(os.path.dirname(__file__), filename)

app.run(port=8000)