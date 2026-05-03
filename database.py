import sqlite3

# Create the database and table
conn = sqlite3.connect("classes.db")
cursor = conn.cursor()

cursor.execute("""
    CREATE TABLE IF NOT EXISTS classes (
        crn TEXT PRIMARY KEY,
        code TEXT,
        building TEXT,
        start_time TEXT,
        end_time TEXT,
        days TEXT
    )
""")
conn.commit()
print("Database ready!")

# This function is what your scraper calls to save a class
def save_class(crn, code, title, subject, days, time, building, room, instructor, term):
    cursor.execute("""
        INSERT OR IGNORE INTO classes 
        (crn, code, title, subject, days, time, building, room, instructor, term)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (crn, code, title, subject, days, time, building, room, instructor, term))
    conn.commit()
    print(f"Saved {code} CRN {crn}")
