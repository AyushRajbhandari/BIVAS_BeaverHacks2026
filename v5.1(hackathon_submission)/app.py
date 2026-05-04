import re
import sqlite3
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from flask import Flask, jsonify, request
from flask_cors import CORS


app = Flask(__name__)
CORS(app)

RMP_RATING_CACHE = {}
RMP_GRAPHQL_URL = "https://www.ratemyprofessors.com/graphql"
RMP_GRAPHQL_AUTH = "dGVzdDp0ZXN0"
RMP_OSU_SCHOOL_ID = "U2Nob29sLTc0Mg=="
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "classes.db"


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def format_class(row):
    class_data = {
        "crn": row["crn"],
        "name": row["name"],
        "title": row["title"],
        "building": row["building"],
        "room": row["room"],
        "days": row["days"],
        "start": row["start_time"],
        "end": row["end_time"],
    }

    for source, target in (
        ("professor", "professor"),
        ("instructor", "professor"),
        ("teacher", "professor"),
        ("professor_name", "professor"),
        ("rmp_rating", "rmpRating"),
        ("professor_rating", "rmpRating"),
        ("rating", "rmpRating"),
    ):
        if source in row.keys() and row[source] is not None:
            class_data[target] = row[source]

    return class_data


def attach_professor_rating(class_data):
    professor = class_data.get("professor")

    if not professor or class_data.get("rmpRating"):
        return class_data

    if professor not in RMP_RATING_CACHE:
        try:
            RMP_RATING_CACHE[professor] = get_rmp_rating(professor)
        except Exception as error:
            app.logger.warning("RMP rating lookup failed for %s: %s", professor, error)
            RMP_RATING_CACHE[professor] = None

    class_data["rmpRating"] = RMP_RATING_CACHE[professor]
    class_data["rmpRatingChecked"] = True
    return class_data


def normalize_professor_name(name):
    return re.sub(r"[^a-z ]+", "", name.lower()).split()


def professor_name_matches(search_name, first_name, last_name):
    search_tokens = normalize_professor_name(search_name)
    candidate_tokens = normalize_professor_name(f"{first_name} {last_name}")

    if not search_tokens or not candidate_tokens:
        return False

    if search_tokens == candidate_tokens:
        return True

    return search_tokens[0] == candidate_tokens[0] and search_tokens[-1] == candidate_tokens[-1]


def get_rmp_rating_from_graphql(professor_name):
    query = """
    query NewSearchTeachersQuery($query: TeacherSearchQuery!) {
      newSearch {
        teachers(query: $query) {
          edges {
            node {
              firstName
              lastName
              avgRating
              numRatings
              school {
                id
              }
            }
          }
        }
      }
    }
    """
    payload = {
        "query": query,
        "variables": {
            "query": {
                "schoolID": RMP_OSU_SCHOOL_ID,
                "text": professor_name,
            },
        },
    }
    headers = {
        "Authorization": f"Basic {RMP_GRAPHQL_AUTH}",
        "Content-Type": "application/json",
    }

    response = requests.post(RMP_GRAPHQL_URL, json=payload, headers=headers, timeout=10)
    response.raise_for_status()

    edges = (
        response.json()
        .get("data", {})
        .get("newSearch", {})
        .get("teachers", {})
        .get("edges", [])
    )
    matches = [
        edge.get("node", {}) for edge in edges
        if professor_name_matches(
            professor_name,
            edge.get("node", {}).get("firstName", ""),
            edge.get("node", {}).get("lastName", ""),
        )
    ]
    rated_matches = [
        match for match in matches
        if match.get("avgRating") is not None and match.get("numRatings", 0) > 0
    ]

    if not rated_matches:
        return None

    best_match = max(rated_matches, key=lambda match: match.get("numRatings", 0))
    return str(best_match["avgRating"])


def get_rmp_rating_from_html(professor_name):
    search_url = f"https://www.ratemyprofessors.com/search/professors/742?q={professor_name}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }

    response = requests.get(search_url, headers=headers, timeout=10)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    cards = soup.find_all("a", href=lambda href: href and "/professor/" in href)

    for card in cards:
        name_el = card.find("div", class_=lambda cls: cls and "CardName" in cls)
        if name_el:
            name_parts = normalize_professor_name(name_el.get_text(" "))
            first_name = name_parts[0] if name_parts else ""
            last_name = name_parts[-1] if name_parts else ""

            if not professor_name_matches(professor_name, first_name, last_name):
                continue

        match = re.search(r"QUALITY\s*(\d+(?:\.\d+)?)", card.get_text())
        if match:
            return match.group(1)

    return None


def get_rmp_rating(professor_name):
    try:
        rating = get_rmp_rating_from_graphql(professor_name)
    except Exception as error:
        app.logger.warning("RMP GraphQL lookup failed for %s: %s", professor_name, error)
        rating = None

    if rating is not None:
        return rating

    return get_rmp_rating_from_html(professor_name)


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
    except Exception as error:
        return jsonify({"error": "RMP request failed", "details": str(error)}), 502

    return jsonify({"rating": rating, "professor": professor})


if __name__ == "__main__":
    app.run(port=5000, debug=True, use_reloader=False)
