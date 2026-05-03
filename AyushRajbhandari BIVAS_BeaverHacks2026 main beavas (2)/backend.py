from flask import Flask, jsonify
from flask_cors import CORS
import sqlite3

app = Flask(__name__)
CORS(app)

def get_db_connection():
    conn = sqlite3.connect('classes.db')
    conn.row_factory = sqlite3.Row  # This allows us to access columns by name
    return conn

@app.route('/class/<crn>')
def get_class(crn):
    conn = get_db_connection()
    course = conn.execute('SELECT * FROM classes WHERE crn = ?', (crn,)).fetchone()
    conn.close()

    if course is None:
        return jsonify({"error": "Class not found"}), 404

    # Convert the SQLite Row object back into the dictionary format your frontend expects
    return jsonify({
        "crn": course['crn'],
        "name": course['name'],
        "title": course["title"],
        "building": course['building'],
        "room": course["room"],
        "days": course['days'],
        "start": course['start_time'],
        "end": course['end_time'],
    })

@app.route('/test')
def test_db():
    conn = get_db_connection()
    # This will tell you exactly what tables and how many rows Python sees
    count = conn.execute("SELECT count(*) FROM classes").fetchone()[0]
    conn.close()
    return f"I see {count} classes in the database."

if __name__ == '__main__':
    app.run(port=5000)