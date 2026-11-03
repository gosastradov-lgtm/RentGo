import hashlib, secrets, os
from datetime import date
from typing import Optional
from pathlib import Path
from fastapi import FastAPI, Depends, HTTPException, Header, Request
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, Column, Integer, String, Float, Date, ForeignKey, CheckConstraint, func
from sqlalchemy.orm import declarative_base, sessionmaker, Session, relationship
from dotenv import load_dotenv

load_dotenv()

DB = os.getenv("DB_URL", "sqlite:///rental.db")  # для PostgreSQL: postgresql://user:pass@host/db
engine = create_engine(DB, connect_args={"check_same_thread": False} if DB.startswith("sqlite") else {})
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()
ACTIVE = ("booked", "confirmed", "issued")

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    pw = Column(String, nullable=False)
    role = Column(String, nullable=False, default="client")  # client|manager|admin
    token = Column(String, index=True)

class Category(Base):
    __tablename__ = "categories"
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)

class Equipment(Base):
    __tablename__ = "equipment"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    photo = Column(String, default="")
    price_per_day = Column(Float, nullable=False)
    late_fee_per_day = Column(Float, nullable=False)
    qty_total = Column(Integer, nullable=False, default=1)
    qty_repair = Column(Integer, nullable=False, default=0)
    qty_written_off = Column(Integer, nullable=False, default=0)
    category = relationship("Category")
    __table_args__ = (CheckConstraint("price_per_day > 0"), CheckConstraint("qty_total >= 0"),
                      CheckConstraint("qty_repair + qty_written_off <= qty_total"))

class Booking(Base):
    __tablename__ = "bookings"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    equipment_id = Column(Integer, ForeignKey("equipment.id"), nullable=False)
    qty = Column(Integer, nullable=False, default=1)
    date_from = Column(Date, nullable=False)
    date_to = Column(Date, nullable=False)
    status = Column(String, nullable=False, default="booked")
    total = Column(Float, nullable=False)
    fine = Column(Float, nullable=False, default=0)
    condition = Column(String, default="")
    returned_on = Column(Date)
    user = relationship("User")
    equipment = relationship("Equipment")
    __table_args__ = (CheckConstraint("date_to >= date_from"), CheckConstraint("qty > 0"))

def hp(p): return hashlib.pbkdf2_hmac("sha256", p.encode(), b"rental-salt", 100_000).hex()

def seed():
    Base.metadata.create_all(engine)
    with SessionLocal() as s:
        if s.query(User).count(): return
        s.add_all([User(email="admin@rental.local", name="Admin", pw=hp("admin123"), role="admin"),
                   User(email="manager@rental.local", name="Manager", pw=hp("manager123"), role="manager")])
        cats = [Category(name=n) for n in ("Спорт", "Туризм", "Строительство")]
        s.add_all(cats); s.flush()
        for n, c, p, q in [("Горный велосипед", 0, 500, 5), ("Сноуборд", 0, 600, 6), ("Беговые лыжи", 0, 400, 6),
                           ("Палатка 4-местная", 1, 350, 8), ("Спальный мешок", 1, 200, 10), ("Туристический рюкзак 80 л", 1, 250, 7),
                           ("Перфоратор", 2, 700, 4), ("Бензопила", 2, 900, 3), ("Бетономешалка", 2, 1200, 2)]:
            s.add(Equipment(name=n, category_id=cats[c].id, price_per_day=p, late_fee_per_day=p * 1.5, qty_total=q))
        s.commit()

def get_db():
    with SessionLocal() as s: yield s

def user_of(authorization: str = Header(None), db: Session = Depends(get_db)):
    u = db.query(User).filter(User.token == authorization.replace("Bearer ", "")).first() if authorization else None
    if not u: raise HTTPException(401, "Нужна авторизация")
    return u

def role(*roles):
    def dep(u: User = Depends(user_of)):
        if u.role not in roles: raise HTTPException(403, "Недостаточно прав")
        return u
    return dep

def available(db, eq, start, end, exclude=None):
    q = db.query(func.coalesce(func.sum(Booking.qty), 0)).filter(
        Booking.equipment_id == eq.id, Booking.status.in_(ACTIVE), Booking.date_from <= end, Booking.date_to >= start)
    busy = q.scalar()
    return eq.qty_total - eq.qty_repair - eq.qty_written_off - busy

def bview(b: Booking):
    st = "overdue" if b.status == "issued" and b.date_to < date.today() else b.status
    return {"id": b.id, "user_id": b.user_id, "user_name": b.user.name, "equipment_id": b.equipment_id,
            "equipment_name": b.equipment.name, "qty": b.qty, "start": str(b.date_from),
            "end": str(b.date_to), "status": st, "total": b.total, "fine": b.fine, "condition": b.condition}

app = FastAPI(title="Прокат оборудования")
seed()

class Reg(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$"); name: str = Field(min_length=2); password: str = Field(min_length=6)
class Login(BaseModel): email: str; password: str
class EqIn(BaseModel):
    name: str = Field(min_length=2); category_id: int; photo: str = ""; price_per_day: float = Field(gt=0)
    late_fee_per_day: float = Field(ge=0); qty_total: int = Field(ge=0)
class Stock(BaseModel): qty_total: int = Field(ge=0); qty_repair: int = Field(ge=0); qty_written_off: int = Field(ge=0)
class Book(BaseModel): equipment_id: int; start: date; end: date; qty: int = Field(1, ge=1)
class Ret(BaseModel): condition: str = "ok"; damage_fee: float = Field(0, ge=0)
class RoleIn(BaseModel): role: str = Field(pattern="^(client|manager|admin)$")

def auth_resp(u, db):
    u.token = secrets.token_hex(24); db.commit()
    return {"token": u.token, "role": u.role, "name": u.name}

@app.post("/api/register")
def register(d: Reg, db: Session = Depends(get_db)):
    if db.query(User).filter_by(email=d.email).first(): raise HTTPException(409, "Email уже занят")
    u = User(email=d.email, name=d.name, pw=hp(d.password)); db.add(u); db.commit()
    return auth_resp(u, db)

@app.post("/api/login")
def login(d: Login, db: Session = Depends(get_db)):
    u = db.query(User).filter_by(email=d.email, pw=hp(d.password)).first()
    if not u: raise HTTPException(401, "Неверный email или пароль")
    return auth_resp(u, db)

@app.get("/api/categories")
def cats(db: Session = Depends(get_db)): return [{"id": c.id, "name": c.name} for c in db.query(Category)]

@app.post("/api/categories")
def add_cat(name: str, db: Session = Depends(get_db), _=Depends(role("admin"))):
    c = Category(name=name); db.add(c); db.commit(); return {"id": c.id, "name": c.name}

@app.get("/api/equipment")
def catalog(q: str = "", category_id: Optional[int] = None, max_price: Optional[float] = None,
            start: Optional[date] = None, end: Optional[date] = None, db: Session = Depends(get_db)):
    r = db.query(Equipment).filter(Equipment.name.ilike(f"%{q}%"))
    if category_id: r = r.filter(Equipment.category_id == category_id)
    if max_price: r = r.filter(Equipment.price_per_day <= max_price)
    out = []
    for e in r:
        d = {c.name: getattr(e, c.name) for c in Equipment.__table__.columns}
        d["category"] = e.category.name
        d["available"] = available(db, e, start, end) if start and end else e.qty_total - e.qty_repair - e.qty_written_off
        out.append(d)
    return out

@app.get("/api/equipment/{id}/availability")
def availability(id: int, start: date, end: date, db: Session = Depends(get_db)):
    e = db.get(Equipment, id)
    if not e: raise HTTPException(404)
    return {"available": max(available(db, e, start, end), 0), "price_per_day": e.price_per_day}

@app.post("/api/equipment")
def add_eq(d: EqIn, db: Session = Depends(get_db), _=Depends(role("admin"))):
    e = Equipment(**d.model_dump()); db.add(e); db.commit(); return {"id": e.id}

@app.put("/api/equipment/{id}")
def upd_eq(id: int, d: EqIn, db: Session = Depends(get_db), _=Depends(role("admin"))):
    e = db.get(Equipment, id)
    if not e: raise HTTPException(404)
    for k, v in d.model_dump().items(): setattr(e, k, v)
    db.commit(); return {"ok": True}

@app.put("/api/equipment/{id}/stock")
def stock(id: int, d: Stock, db: Session = Depends(get_db), _=Depends(role("admin"))):
    e = db.get(Equipment, id)
    if not e: raise HTTPException(404)
    if d.qty_repair + d.qty_written_off > d.qty_total: raise HTTPException(422, "Ремонт + списание превышает общее количество")
    e.qty_total, e.qty_repair, e.qty_written_off = d.qty_total, d.qty_repair, d.qty_written_off
    db.commit(); return {"ok": True}

# ---------- Фотографии оборудования ----------
IMG_DIR = Path(__file__).parent / "static" / "img"
PHOTO_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
PHOTO_SIGNATURES = (b"\xff\xd8\xff", b"\x89PNG", b"RIFF")  # JPEG, PNG, WebP: проверяем реальное содержимое файла
MAX_PHOTO_BYTES = 3 * 1024 * 1024

def delete_photo_file(photo: str):
    """Удаляет файл, только если он лежит в нашей папке static/img."""
    if photo and photo.startswith("/img/"):
        (IMG_DIR / Path(photo).name).unlink(missing_ok=True)

@app.post("/api/equipment/{id}/photo")
async def upload_photo(id: int, request: Request, db: Session = Depends(get_db), _=Depends(role("admin"))):
    """Принимает файл картинки в теле запроса и привязывает его к оборудованию."""
    e = db.get(Equipment, id)
    if not e: raise HTTPException(404)
    ext = PHOTO_TYPES.get(request.headers.get("content-type", "").split(";")[0])
    if not ext: raise HTTPException(415, "Допустимы только изображения JPG, PNG и WebP")
    data = await request.body()
    if not data: raise HTTPException(422, "Файл пустой")
    if len(data) > MAX_PHOTO_BYTES: raise HTTPException(413, "Файл больше 3 МБ")
    if not data.startswith(PHOTO_SIGNATURES): raise HTTPException(422, "Файл не является изображением")
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    name = f"eq{id}_{secrets.token_hex(4)}{ext}"  # случайный суффикс, чтобы браузер не показывал старую картинку из кэша
    (IMG_DIR / name).write_bytes(data)
    delete_photo_file(e.photo)
    e.photo = f"/img/{name}"; db.commit()
    return {"photo": e.photo}

@app.delete("/api/equipment/{id}/photo")
def remove_photo(id: int, db: Session = Depends(get_db), _=Depends(role("admin"))):
    e = db.get(Equipment, id)
    if not e: raise HTTPException(404)
    delete_photo_file(e.photo)
    e.photo = ""; db.commit()
    return {"ok": True}

def max_booking_date():
    """Последняя допустимая дата аренды: сегодня + 5 лет."""
    t = date.today()
    try: return t.replace(year=t.year + 5)
    except ValueError: return t.replace(year=t.year + 5, day=28)  # 29 февраля

def create_booking(db, user, d: Book):
    if d.end < d.start: raise HTTPException(422, "Дата окончания раньше даты начала")
    if d.start < date.today(): raise HTTPException(422, "Дата начала в прошлом")
    if d.end > max_booking_date():
        raise HTTPException(422, f"Бронировать можно не более чем на 5 лет вперёд (до {max_booking_date():%d.%m.%Y})")
    e = db.get(Equipment, d.equipment_id)
    if not e: raise HTTPException(404, "Оборудование не найдено")
    if available(db, e, d.start, d.end) < d.qty:
        raise HTTPException(409, f"«{e.name}»: нет свободных единиц на выбранные даты")
    days = (d.end - d.start).days + 1
    b = Booking(user_id=user.id, equipment_id=e.id, qty=d.qty, date_from=d.start, date_to=d.end, total=days * d.qty * e.price_per_day)
    db.add(b); db.flush()  # flush, чтобы следующие позиции корзины учитывали эту бронь
    return b

class Batch(BaseModel): items: list[Book] = Field(min_length=1, max_length=20)

@app.post("/api/bookings")
def book(d: Book, db: Session = Depends(get_db), u: User = Depends(user_of)):
    b = create_booking(db, u, d); db.commit(); return bview(b)

@app.post("/api/bookings/batch")
def book_batch(d: Batch, db: Session = Depends(get_db), u: User = Depends(user_of)):
    """Оформление корзины: либо бронируются все позиции, либо ни одной."""
    try:
        created = [create_booking(db, u, item) for item in d.items]
        db.commit()
    except HTTPException:
        db.rollback(); raise
    return [bview(b) for b in created]

@app.get("/api/bookings/my")
def my(db: Session = Depends(get_db), u: User = Depends(user_of)):
    return [bview(b) for b in db.query(Booking).filter_by(user_id=u.id).order_by(Booking.id.desc())]

@app.post("/api/bookings/{id}/cancel")
def cancel(id: int, db: Session = Depends(get_db), u: User = Depends(user_of)):
    b = db.get(Booking, id)
    if not b or (b.user_id != u.id and u.role == "client"): raise HTTPException(404)
    if b.status not in ("booked", "confirmed"): raise HTTPException(409, "Отмена невозможна")
    b.status = "cancelled"; db.commit(); return bview(b)

@app.get("/api/manager/bookings")
def all_b(db: Session = Depends(get_db), _=Depends(role("manager", "admin"))):
    return [bview(b) for b in db.query(Booking).order_by(Booking.id.desc())]

def _step(id, frm, to, db):
    b = db.get(Booking, id)
    if not b: raise HTTPException(404)
    if b.status not in frm: raise HTTPException(409, f"Недопустимый статус: {b.status}")
    b.status = to; db.commit(); return b

@app.post("/api/manager/bookings/{id}/confirm")
def confirm(id: int, db: Session = Depends(get_db), _=Depends(role("manager", "admin"))): return bview(_step(id, ("booked",), "confirmed", db))

@app.post("/api/manager/bookings/{id}/issue")
def issue(id: int, db: Session = Depends(get_db), _=Depends(role("manager", "admin"))): return bview(_step(id, ("confirmed",), "issued", db))

@app.post("/api/manager/bookings/{id}/return")
def ret(id: int, d: Ret, db: Session = Depends(get_db), _=Depends(role("manager", "admin"))):
    b = _step(id, ("issued",), "returned", db)
    e = db.get(Equipment, b.equipment_id)
    late = max((date.today() - b.date_to).days, 0)
    b.fine = late * b.qty * e.late_fee_per_day + d.damage_fee
    b.condition, b.returned_on = d.condition, date.today(); db.commit(); return bview(b)

@app.get("/api/admin/users")
def users(db: Session = Depends(get_db), _=Depends(role("admin"))):
    return [{"id": u.id, "email": u.email, "name": u.name, "role": u.role} for u in db.query(User)]

@app.put("/api/admin/users/{id}/role")
def set_role(id: int, d: RoleIn, db: Session = Depends(get_db), _=Depends(role("admin"))):
    u = db.get(User, id)
    if not u: raise HTTPException(404)
    u.role = d.role; db.commit(); return {"ok": True}

@app.get("/api/admin/stats")
def stats(db: Session = Depends(get_db), _=Depends(role("admin"))):
    bs = db.query(Booking).filter(Booking.status != "cancelled").all()
    by_status, by_eq, by_month = {}, {}, {}
    for b in bs:
        v = bview(b)["status"]; by_status[v] = by_status.get(v, 0) + 1
        n = db.get(Equipment, b.equipment_id).name; by_eq[n] = by_eq.get(n, 0) + b.total
        m = str(b.date_from)[:7]; by_month[m] = by_month.get(m, 0) + b.total + b.fine
    return {"by_status": by_status, "revenue_by_equipment": by_eq, "revenue_by_month": dict(sorted(by_month.items()))}

app.mount("/", StaticFiles(directory="static", html=True), name="static")
