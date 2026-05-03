import re
import sqlite3

import requests
from bs4 import BeautifulSoup
from flask import Flask, jsonify, request
from flask_cors import CORS


app = Flask(__name__)
CORS(app)


def get_db_connection():
    conn = sqlite3.connect("classes.db")
    conn.row_factory = sqlite3.Row
    return conn


def format_class(row):
    return {
        "crn": row["crn"],
        "name": row["name"],
        "title": row["title"],
        "building": row["building"],
        "room": row["room"],
        "days": row["days"],
        "start": row["start_time"],
        "end": row["end_time"],
    }


def get_rmp_rating(professor_name):
    search_url = f"https://www.ratemyprofessors.com/search/professors/742?q={professor_name}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }

    response = requests.get(search_url, headers=headers, timeout=10)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    cards = soup.find_all("a", href=lambda href: href and "/professor/" in href)

    for card in cards:
        match = re.search(r"QUALITY(\d+\.\d+)", card.get_text())
        if match:
            return match.group(1)

    return None


@app.route("/class/<crn>")
def get_class(crn):
    conn = get_db_connection()
    course = conn.execute("SELECT * FROM classes WHERE crn = ?", (crn,)).fetchone()
    conn.close()

    if course is None:
        return jsonify({"error": "Class not found"}), 404

    return jsonify(format_class(course))


@app.route("/test")
def test_db():
    conn = get_db_connection()
    count = conn.execute("SELECT count(*) FROM classes").fetchone()[0]
    conn.close()
    return f"I see {count} classes in the database."


@app.route("/api/rmp")
def rmp():
    professor = request.args.get("professor")

    if not professor:
        return jsonify({"error": "No professor name provided"}), 400

    try:
        rating = get_rmp_rating(professor)
    except requests.RequestException as error:
        return jsonify({"error": "RMP request failed", "details": str(error)}), 502

    return jsonify({"rating": rating, "professor": professor})


if __name__ == "__main__":
    app.run(port=5000, debug=True, use_reloader=False)
