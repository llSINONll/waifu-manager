import os
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, date
import pytz
import re

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
    if not month or not day:
        return 999 
    today = datetime.now().date() 
    
    try:
        birthday = date(today.year, month, day)
    except ValueError:
        birthday = date(today.year, 3, 1)

    delta = (birthday - today).days

    if delta < 0:
        try:
            next_birthday = date(today.year + 1, month, day)
        except ValueError:
            next_birthday = date(today.year + 1, 3, 1)
        delta = (next_birthday - today).days
    
    return delta

# --- ROUTES ---

@app.post("/add")
def add_waifu(waifu: WaifuRequest, db: Session = Depends(get_db), x_user_id: str = Header(...)):
    exists = db.query(WaifuDB).filter(WaifuDB.name == waifu.name, WaifuDB.owner_id == x_user_id).first()
    if exists:
        return {"message": f"{waifu.name} is already in your list!"}

    if waifu.manual_month and waifu.manual_day:
        month, day = waifu.manual_month, waifu.manual_day
    else:
        month, day = extract_birthday(waifu.about)

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
            "status": status,
            "birth_month": w.birthday_month, 
            "birth_day": w.birthday_day,
            "manual_month": w.birthday_month,
            "manual_day": w.birthday_day
        })
    return sorted(dashboard_data, key=lambda x: x['days_until'])

@app.delete("/delete/{waifu_id}")
def delete_waifu(waifu_id: int, db: Session = Depends(get_db), x_user_id: str = Header(...)):
    waifu = db.query(WaifuDB).filter(WaifuDB.id == waifu_id, WaifuDB.owner_id == x_user_id).first()
    
    if not waifu:
        raise HTTPException(status_code=404, detail="Waifu not found (or you don't own it)")
    
    db.delete(waifu)
    db.commit()
    return {"message": "Deleted successfully"}