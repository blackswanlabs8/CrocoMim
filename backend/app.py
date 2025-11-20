from flask import Flask, jsonify

app = Flask(__name__)

@app.route("/")
def index():
    return jsonify({"message": "Flask backend is alive"})

@app.route("/healthz")
def healthz():
    return jsonify({"ok": True})
