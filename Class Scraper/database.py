import sqlite3

def init_database():
    # Create the database and table
    conn = sqlite3.connect("classes.db")
    cursor = conn.cursor()

    cursor.execute("DROP TABLE IF EXISTS classes")
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS classes (
            crn TEXT PRIMARY KEY,
            name TEXT,
            title TEXT,
            building TEXT,
            room TEXT,
            days TEXT,
            start_time TEXT,
            end_time TEXT
        )
    """)
    conn.commit()
    conn.close()
    print("Database ready!")

def get_row_count():
    conn = sqlite3.connect('classes.db')
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM classes")
    count = cursor.fetchone()[0]
    conn.close()
    return count

# This function is what your scraper calls to save a class
def save_class(course_dict):
    conn = sqlite3.connect("classes.db")
    cursor = conn.cursor()
    
    for crn, info in course_dict.items():
        cursor.execute('''
            INSERT OR REPLACE INTO classes (crn, name, title, building, room, days, start_time, end_time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (info['crn'], info['name'], info["title"], info['building'], info["room"], info["days"], info['start_time'], info['end_time']))
    
    conn.commit()
    conn.close()