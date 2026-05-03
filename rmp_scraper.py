import requests
from bs4 import BeautifulSoup
import re

def get_rmp_rating(professor_name):
    search_url = f"https://www.ratemyprofessors.com/search/professors/742?q={professor_name}"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    response = requests.get(search_url, headers=headers)
    soup = BeautifulSoup(response.text, "html.parser")
    
    cards = soup.find_all("a", href=lambda x: x and "/professor/" in x)
    
    for card in cards:
        text = card.get_text()
        # Look for a number like 2.36 or 4.5 in the text
        match = re.search(r'QUALITY(\d+\.\d+)', text)
        if match:
            rating = match.group(1)
            print(f"Rating found: {rating}/5")
            return rating
    
    print("No rating found")
    return None

get_rmp_rating("Clevette")