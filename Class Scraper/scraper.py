import csv
import requests
import os
import re
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from parse_data import parse_course
from database import save_class, init_database

SEARCH_URL = "https://classes.oregonstate.edu/api/?page=fose&route=search"
DETAILS_URL = "https://classes.oregonstate.edu/api/?page=fose&route=details"
SUBJECTS_URL = "https://catalog.oregonstate.edu/courses/"
SRCDB = "202603"
DEFAULT_WORKERS = 16
REQUEST_TIMEOUT = 30

thread_local = threading.local()


def get_session():
    session = getattr(thread_local, "session", None)
    if session is None:
        session = requests.Session()
        session.headers.update({
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        })
        thread_local.session = session
    return session


def get_max_workers():
    raw_workers = os.getenv("SCRAPER_WORKERS")
    if raw_workers:
        try:
            return max(1, int(raw_workers))
        except ValueError:
            print(f"Ignoring invalid SCRAPER_WORKERS value: {raw_workers}")
    return DEFAULT_WORKERS

def get_subjects():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(script_dir, "data.csv")
    subjects = []
    
    if not os.path.exists(file_path):
        print(f"'data.csv' not found at {file_path}. Fetching subject codes from OSU catalog...")
        return get_subjects_from_catalog()

    with open(file_path, mode='r', newline='', encoding='utf-8') as file:
        reader = csv.reader(file)
        next(reader, None) 
        for row in reader:
            if len(row) >= 2 and row[1].strip():
                subjects.append(row[1].strip())
            elif row and row[0].strip():
                subjects.append(row[0].strip())
    return subjects


def get_subjects_from_catalog():
    res = get_session().get(SUBJECTS_URL, timeout=REQUEST_TIMEOUT)
    res.raise_for_status()

    subjects = set()
    for match in re.finditer(r"\(([A-Z]{1,5})\)", res.text):
        subjects.add(match.group(1))

    subjects = sorted(subjects)
    print(f"  -> Loaded {len(subjects)} subject codes from catalog.")
    return subjects


def search_subject(subject):
    payload = {
        "other": {"srcdb": SRCDB},
        "criteria": [{"field": "subject", "value": subject}]
    }

    res = get_session().post(SEARCH_URL, json=payload, timeout=REQUEST_TIMEOUT)
    res.raise_for_status()
    return subject, res.json().get("results", [])


def fetch_course_details(item):
    crn = item.get("crn")
    code = item.get("code")

    if not crn or not code:
        return None

    details_payload = {
        "group": f"code:{code}",
        "key": f"crn:{crn}",
        "srcdb": SRCDB
    }

    res = get_session().post(DETAILS_URL, json=details_payload, timeout=REQUEST_TIMEOUT)
    res.raise_for_status()
    return parse_course(res.json())

def main():
    init_database()

    subjects = get_subjects()
    if not subjects: return

    max_workers = get_max_workers()
    all_final_results = []

    print(f"Using {max_workers} worker threads.")

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        search_futures = {
            executor.submit(search_subject, subject): subject
            for subject in subjects
        }

        detail_futures = []
        for future in as_completed(search_futures):
            subject = search_futures[future]
            try:
                _, search_results = future.result()
                print(f"Searching subject: {subject}...")
                print(f"  -> Found {len(search_results)} courses. Fetching details...")

                for item in search_results:
                    detail_futures.append(executor.submit(fetch_course_details, item))
            except Exception as e:
                print(f"  -> Error searching {subject}: {e}")

        for count, future in enumerate(as_completed(detail_futures), start=1):
            try:
                data = future.result()
                if not data:
                    continue

                save_class(data)
                all_final_results.append(data)

                if count % 100 == 0:
                    print(f"  -> Saved {len(all_final_results)} detailed records...")
            except Exception as e:
                print(f"  -> Error fetching course details: {e}")

    # Output the results
    print("\n--- Final Extraction Results ---")
    for course in all_final_results[:10]:
        for crn, info in course.items():
            print(f"Code: {info['name']} | CRN: {crn} | Room: {info['building']} {info['room']}")
    
    
    print(f"\nTotal detailed records gathered: {len(all_final_results)}")

if __name__ == "__main__":
    main()
