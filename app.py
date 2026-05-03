from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
from bs4 import BeautifulSoup
import re
import sqlite3

app = Flask(__name__)
CORS(app)

# ── RMP scraper ──────────────────────────────────────
def get_rmp_rating(professor_name):
    search_url = f"https://www.ratemyprofessors.com/search/professors/742?q={professor_name}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
    response = requests.get(search_url, headers=headers)
    soup = BeautifulSoup(response.text, "html.parser")
    cards = soup.find_all("a", href=lambda x: x and "/professor/" in x)
    for card in cards:
        text = card.get_text()
        match = re.search(r'QUALITY(\d+\.\d+)', text)
        if match:
            return match.group(1)
    return None

# ── Routes ───────────────────────────────────────────
@app.route("/class/<crn>")
def get_class(crn):
    conn = sqlite3.connect("classes.db")
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM classes WHERE crn = ?", (crn,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return jsonify(dict(row))
    return jsonify({"error": "CRN not found"}), 404

@app.route("/api/rmp")
def rmp():
    professor = request.args.get("professor")
    if not professor:
        return jsonify({"error": "No professor name"}), 400
    rating = get_rmp_rating(professor)
    return jsonify({"rating": rating, "professor": professor})

# ── Run ──────────────────────────────────────────────
if __name__ == "__main__":
    app.run(debug=True)