import csv
import requests
import os
import pathlib
from parse_data import parse_course
from database import save_class, init_database

def get_subjects():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(script_dir, "data.csv")
    subjects = []
    
    if not os.path.exists(file_path):
        print(f"Error: 'data.csv' not found at {file_path}")
        return subjects

    with open(file_path, mode='r', newline='', encoding='utf-8') as file:
        reader = csv.reader(file)
        next(reader, None) 
        for row in reader:
            if len(row) >= 2:
                subjects.append(row[1].strip())
    return subjects

def main():
    init_database()

    subjects = get_subjects()
    if not subjects: return

    session = requests.Session()
    session.headers.update({"Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"})

    # Move these outside the loops so they aren't redefined constantly
    search_url = "https://classes.oregonstate.edu/api/?page=fose&route=search"
    details_url = "https://classes.oregonstate.edu/api/?page=fose&route=details"

    # GLOBAL list to store all results across all subjects
    all_final_results = []

    for subject in subjects:
        print(f"Searching subject: {subject}...")
        
        payload = {
            "other": {"srcdb": "202603"},
            "criteria": [{"field": "subject", "value": subject}]
        }

        try:
            res = session.post(search_url, json=payload)
            if res.status_code == 200:
                search_results = res.json().get("results", [])
                print(f"  -> Found {len(search_results)} courses. Fetching details...")

                for item in search_results:
                    crn = item.get("crn")
                    code = item.get("code")

                    # Now get the specific details for this CRN
                    details_payload = {
                        "group": f"code:{code}",
                        "key": f"crn:{crn}",
                        "srcdb": "202603"
                    }

                    res_details = session.post(details_url, json=details_payload)

                    if res_details.status_code == 200:
                        res_details = res_details.json()
                        data = parse_course(res_details)

                        print(data)

                        save_class(data)
                        
                        # Optional: print progress
                        # print(f"    Fetched: {code}")

        except Exception as e:
            print(f"  -> Error processing {subject}: {e}")

    # Output the results
    print("\n--- Final Extraction Results ---")
    for course in all_final_results[:10]: 
        print(f"Code: {course['code']} | CRN: {course['crn']} | Meetings: {course['meeting_html']}")
    
    
    print(f"\nTotal detailed records gathered: {len(all_final_results)}")

if __name__ == "__main__":
    main()