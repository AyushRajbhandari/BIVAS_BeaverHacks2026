import re
from datetime import datetime

def parse_course(raw_data):
    # 1. Safe Extraction with Defaults
    # Using .get() prevents KeyError if a field is missing
    crn = raw_data.get('crn')
    if not crn:
        return {} # Skip items with no CRN

    name = raw_data.get('code', 'N/A')
    course_title = raw_data.get('title', 'N/A')

    html = raw_data.get('meeting_html', '')
    campus = raw_data.get('campus', '')
    class_type = raw_data.get('sche_type_clss_fild', '')

    # 2. Set "Smart" Defaults based on Class Type
    # If it's Online or an Internship, we know there's no building
    default_bldg = "TBA"
    if "Ecampus" in campus or "Online" in class_type:
        default_bldg = "ONLINE"
    elif "Internship" in class_type:
        default_bldg = "INTERN"

    res = {
        "crn": crn,
        "name": name,
        "title": course_title,
        "building": default_bldg,
        "room": "TBA",
        "days": "TBA",
        "start_time": None,
        "end_time": None,
    }

    # 3. Only parse HTML if it's NOT empty
    if html and html.strip():
        # 2. Capture Building and Room (e.g., AUST 226)
        # This looks specifically for the pattern INSIDE the <a> tag: 
        # Uppercase letters, a space, then the room number, followed by a dash.
        room_match = re.search(r'>([A-Z]+)\s+([\w\d-]+)\s+-', html)
    
        if room_match:
            res["building"] = room_match.group(1) # AUST
            res["room"] = room_match.group(2)     # 226
        
        # Days and Times Search
        time_match = re.search(r'([MTWRFS]+)\s+([\d:apm]+)-([\d:apm]+)', html)
        if time_match:
            res["days"] = time_match.group(1)
            
            def clean_time(t_str):
                # Ensure 10am becomes 10:00am
                if ':' not in t_str:
                    t_str = re.sub(r'(\d+)', r'\1:00', t_str)
                return datetime.strptime(t_str, "%I:%M%p").strftime("%H:%M")

            try:
                res["start_time"] = clean_time(time_match.group(2))
                res["end_time"] = clean_time(time_match.group(3))
            except Exception:
                pass # If time is weirdly formatted, keep as None

    return {crn: res}