import os, tempfile
os.environ["DB_URL"] = f"sqlite:///{tempfile.mkdtemp()}/t.db"
from datetime import date, timedelta
from fastapi.testclient import TestClient
from main import app
c = TestClient(app)
D = lambda n: str(date.today() + timedelta(days=n))

def tok(email, pw):
    return {"Authorization": "Bearer " + c.post("/api/login", json={"email": email, "password": pw}).json()["token"]}

def client_h():
    c.post("/api/register", json={"email": "a@b.co", "name": "Ann", "password": "secret1"})
    return tok("a@b.co", "secret1")

def test_register_validation():
    assert c.post("/api/register", json={"email": "bad", "name": "A", "password": "1"}).status_code == 422

def test_booking_total_and_overlap():
    h = client_h()
    r = c.post("/api/bookings", json={"equipment_id": 7, "start": D(1), "end": D(3), "qty": 4}, headers=h)
    assert r.status_code == 200 and r.json()["total"] == 3 * 4 * 700      # 3 суток
    # пересечение: осталось 0 свободных на 2-й день
    assert c.post("/api/bookings", json={"equipment_id": 7, "start": D(3), "end": D(5)}, headers=h).status_code == 409
    # граница: день после окончания свободен
    assert c.post("/api/bookings", json={"equipment_id": 7, "start": D(4), "end": D(5)}, headers=h).status_code == 200

def test_date_boundaries():
    h = client_h()
    assert c.post("/api/bookings", json={"equipment_id": 1, "start": D(3), "end": D(2)}, headers=h).status_code == 422
    assert c.post("/api/bookings", json={"equipment_id": 1, "start": D(-1), "end": D(1)}, headers=h).status_code == 422
    assert c.post("/api/bookings", json={"equipment_id": 1, "start": D(1), "end": D(1), "qty": 0}, headers=h).status_code == 422

def test_roles_and_flow():
    h = client_h(); m = tok("manager@rental.local", "manager123")
    assert c.get("/api/manager/bookings", headers=h).status_code == 403
    bid = c.post("/api/bookings", json={"equipment_id": 2, "start": D(1), "end": D(2)}, headers=h).json()["id"]
    assert c.post(f"/api/manager/bookings/{bid}/issue", headers=m).status_code == 409   # нельзя без подтверждения
    c.post(f"/api/manager/bookings/{bid}/confirm", headers=m); c.post(f"/api/manager/bookings/{bid}/issue", headers=m)
    r = c.post(f"/api/manager/bookings/{bid}/return", json={"condition": "царапина", "damage_fee": 5}, headers=m).json()
    assert r["status"] == "returned" and r["fine"] >= 5

def test_stock_constraint():
    a = tok("admin@rental.local", "admin123")
    assert c.put("/api/equipment/1/stock", json={"qty_total": 2, "qty_repair": 2, "qty_written_off": 1}, headers=a).status_code == 422

def test_five_year_limit():
    h = client_h()
    far = str(date.today() + timedelta(days=365 * 5 + 30))
    assert c.post("/api/bookings", json={"equipment_id": 1, "start": far, "end": far}, headers=h).status_code == 422

def test_cart_batch_is_atomic():
    h = client_h()
    ok = {"equipment_id": 5, "start": D(10), "end": D(11), "qty": 1}
    bad = {"equipment_id": 5, "start": D(10), "end": D(11), "qty": 999}
    assert c.post("/api/bookings/batch", json={"items": [ok, bad]}, headers=h).status_code == 409
    assert not [b for b in c.get("/api/bookings/my", headers=h).json() if b["equipment_id"] == 5]
    assert c.post("/api/bookings/batch", json={"items": [ok, ok]}, headers=h).status_code == 200

def test_photo_upload():
    a = tok("admin@rental.local", "admin123"); h = client_h()
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 50
    url = "/api/equipment/1/photo"
    assert c.post(url, content=png, headers={**h, "Content-Type": "image/png"}).status_code == 403   # клиент не может
    assert c.post(url, content=b"text", headers={**a, "Content-Type": "text/plain"}).status_code == 415
    assert c.post(url, content=b"not an image", headers={**a, "Content-Type": "image/png"}).status_code == 422
    r = c.post(url, content=png, headers={**a, "Content-Type": "image/png"})
    assert r.status_code == 200 and r.json()["photo"].startswith("/img/")
    assert c.get(r.json()["photo"]).status_code == 200          # файл отдаётся сервером
    assert c.delete(url, headers=a).status_code == 200          # удаляем, чтобы не оставлять тестовый файл
