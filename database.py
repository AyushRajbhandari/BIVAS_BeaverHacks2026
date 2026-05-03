import sqlite3

def init_database():
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
    conn.close()
    print("Database ready!")

# This function is what your scraper calls to save a class
def save_class(course_dict):
    conn = sqlite3.connect("classes.db")
    cursor = conn.cursor()
    
    for crn, info in course_dict.items():
        cursor.execute('''
            INSERT OR REPLACE INTO courses (crn, name, building, start_time, end_time, days)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (info['crn'], info['code'], info['building'], info['start_time'], info['end_time'], info['days']))
    conn.commit()
    conn.close()
