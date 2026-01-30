import os
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
from datetime import datetime, date
import pytz
import re
from rapidfuzz import fuzz, process

# --- DATABASE IMPORTS ---
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONFIGURATION ---
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:sahil@localhost:5433/waifu_db")
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# --- DATABASE SETUP ---
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Define the "Waifus" Table
class WaifuDB(Base):
    __tablename__ = "waifus"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    image_url = Column(String)
    about = Column(String) 
    birthday_month = Column(Integer, nullable=True)
    birthday_day = Column(Integer, nullable=True)
    owner_id = Column(String, index=True)

# Create the table automatically if it doesn't exist
Base.metadata.create_all(bind=engine)

# Dependency to get a database session per request
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Models ---
class WaifuRequest(BaseModel):
    name: str
    image: str | None = None
    about: str | None = None
    manual_month: int | None = None
    manual_day: int | None = None

# --- Helper: Intelligent Date Extraction ---
MONTH_MAP = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
}

def extract_birthday(bio_text: str):
    if not bio_text: return None, None
    text = bio_text.lower()
    
    # Pattern 1: "Birthday: August 21"
    match = re.search(r'birth(?:day|date):?\s*([a-z]{3})[a-z]*\s+(\d{1,2})', text)
    if match:
        month_str, day = match.groups()
        return MONTH_MAP.get(month_str), int(day)

    # Pattern 2: "Birthday: 21 August"
    match = re.search(r'birth(?:day|date):?\s*(\d{1,2})\s+([a-z]{3})', text)
    if match:
        day, month_str = match.groups()
        return MONTH_MAP.get(month_str), int(day)
        
    return None, None

def get_days_until_birthday(month, day):
    # .date() removes the time (2:00 AM) so it matches Midnight perfectly
    if not month or not day:
        return 999 
    today = datetime.now().date() 
    
    try:
        birthday = date(today.year, month, day)
    except ValueError:
        birthday = date(today.year, 3, 1)

    delta = (birthday - today).days

    # If the birthday has passed (negative), look at next year
    if delta < 0:
        try:
            next_birthday = date(today.year + 1, month, day)
        except ValueError:
            next_birthday = date(today.year + 1, 3, 1)
        delta = (next_birthday - today).days
    
    return delta

# --- 1. THE NICKNAME DICTIONARY ---
SEARCH_ALIASES = {
    # --- Sword Art Online ---
    "sinon": "Asada Shino", 
    "kirito": "Kazuto Kirigaya",
    "llenn": "Karen Kohiruimaki",
    "pito": "Elza Kanzaki",
    
    # --- Shangri-La Frontier ---
    "rei saiga": "Psyger-0",  
    "saiga rei": "Psyger-0",
    "Amane Towa": "arthur pencilgon",
    "Kei Uomi": "katzo",
    "Rakurou Hizutome": "sunraku"
}

# --- ROUTES ---

@app.get("/search/{name}")
async def search_waifu(name: str):
    print(f"\n--- Smart Search for: '{name}' ---") 
    
    # 1. PREPARE QUERIES
    queries_to_try = []
    clean_name = name.strip().lower()
    
    # A. Alias
    if clean_name in SEARCH_ALIASES:
        queries_to_try.append(SEARCH_ALIASES[clean_name])
    
    # B. Original
    queries_to_try.append(name)
    
    # C. Permutations
    parts = name.strip().split()
    if len(parts) >= 2:
        queries_to_try.append(f"{parts[-1]}, {' '.join(parts[:-1])}") # "Saiga, Rei"
        queries_to_try.append(f"{parts[-1]} {' '.join(parts[:-1])}")   # "Saiga Rei"
    
    # Remove duplicates
    final_queries = list(dict.fromkeys(queries_to_try))
    print(f"-> Queries: {final_queries}")

    async with httpx.AsyncClient() as client:
        all_candidates = {} 
        
        # 2. FETCH FROM API
        for query in final_queries:
            for page in [1, 2]: 
                try:
                    url = f"https://api.jikan.moe/v4/characters?q={query}&limit=25&page={page}"
                    response = await client.get(url)
                    
                    if response.status_code == 429: break
                        
                    data = response.json()
                    items = data.get('data', [])
                    if not items: break 
                        
                    for item in items:
                        all_candidates[item['mal_id']] = item
                        
                except Exception as e:
                    print(f"API Error: {e}")
        
        raw_results = list(all_candidates.values())
        processed_results = []
        
        # 3. SCORING
        for item in raw_results:
            char_name = item['name']
            nicknames = item.get('nicknames', []) or []
            about = item.get('about', '') or ''
            
            # comparisons
            query_lower = clean_name
            name_lower = char_name.lower()
            
            # A. Name Match
            name_score = fuzz.token_sort_ratio(query_lower, name_lower)
            
            # B. Nickname Match
            nick_score = 0
            if nicknames:
                best_nick = process.extractOne(query_lower, nicknames, scorer=fuzz.token_sort_ratio)
                if best_nick: nick_score = best_nick[1]
            
            # C. Bio Match
            bio_score = fuzz.partial_ratio(query_lower, about.lower())
            
            processed_results.append({
                "mal_id": item['mal_id'],
                "name": char_name,
                "nicknames": ", ".join(nicknames[:3]),
                "image": item['images']['jpg']['image_url'],
                "about": about,
                "score": max(name_score, nick_score, bio_score)
            })

        # Sort by Score
        sorted_results = sorted(processed_results, key=lambda x: x['score'], reverse=True)
        
        if sorted_results:
             print(f"-> Top: {sorted_results[0]['name']} ({sorted_results[0]['score']})")

        return sorted_results[:10]

@app.post("/add")
def add_waifu(waifu: WaifuRequest, db: Session = Depends(get_db), x_user_id: str = Header(...)):
    # 1. Check for duplicate
    exists = db.query(WaifuDB).filter(WaifuDB.name == waifu.name, WaifuDB.owner_id == x_user_id).first()
    if exists:
        return {"message": f"{waifu.name} is already in your list!"}

    # 2. DETERMINE BIRTHDAY
    # Priority A: Did the user type it manually?
    if waifu.manual_month and waifu.manual_day:
        month, day = waifu.manual_month, waifu.manual_day
    else:
        # Priority B: Try to extract it from the Bio
        month, day = extract_birthday(waifu.about)

    # 3. Save to DB
    new_waifu = WaifuDB(
        name=waifu.name,
        image_url=waifu.image,
        about=waifu.about,
        birthday_month=month,
        birthday_day=day,
        owner_id=x_user_id
    )
    db.add(new_waifu)
    db.commit()
    db.refresh(new_waifu)
    
    msg = f"Saved {waifu.name}!"
    if month: msg += f" (Birthday: {month}/{day}) 🎉"
    else: msg += " (Date set to Unknown)"
    return {"message": msg}

@app.get("/dashboard")
def get_dashboard(db: Session = Depends(get_db), x_user_id: str = Header(...)):
    # 1. Get all waifus from REAL Database
    waifus = db.query(WaifuDB).filter(WaifuDB.owner_id == x_user_id).all()
    
    dashboard_data = []
    for w in waifus:
        days = get_days_until_birthday(w.birthday_month, w.birthday_day)
        
        status = f"in {days} days"
        if days == 999: status = "Unknown Date"
        if days == 0: status = "🎉 Birthday Today!"
        
        dashboard_data.append({
            "id": w.id,
            "name": w.name,
            "image": w.image_url,
            "days_until": days,
            "status": status
        })
    return sorted(dashboard_data, key=lambda x: x['days_until'])

@app.delete("/delete/{waifu_id}")
def delete_waifu(waifu_id: int, db: Session = Depends(get_db), x_user_id: str = Header(...)):
    # Find the waifu by ID
    waifu = db.query(WaifuDB).filter(WaifuDB.id == waifu_id, WaifuDB.owner_id == x_user_id).first()
    
    if not waifu:
        raise HTTPException(status_code=404, detail="Waifu not found (or you don't own it)")
    
    # Delete from DB
    db.delete(waifu)
    db.commit()
    return {"message": "Deleted successfully"}