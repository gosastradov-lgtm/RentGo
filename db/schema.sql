-- Схема БД «Прокат оборудования» (PostgreSQL). Совпадает с моделями в main.py.
-- Приложение создаёт таблицы само, этот файл нужен для ручного развёртывания и отчёта.

CREATE TABLE IF NOT EXISTS users (
    id       SERIAL PRIMARY KEY,
    email    VARCHAR UNIQUE NOT NULL,
    name     VARCHAR NOT NULL,
    pw       VARCHAR NOT NULL,                 -- PBKDF2-хеш пароля
    role     VARCHAR NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'manager', 'admin')),
    token    VARCHAR
);
CREATE INDEX IF NOT EXISTS ix_users_token ON users (token);

CREATE TABLE IF NOT EXISTS categories (
    id   SERIAL PRIMARY KEY,
    name VARCHAR UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS equipment (
    id                SERIAL PRIMARY KEY,
    name              VARCHAR NOT NULL,
    category_id       INTEGER NOT NULL REFERENCES categories (id),
    photo             VARCHAR DEFAULT '',
    price_per_day     DOUBLE PRECISION NOT NULL CHECK (price_per_day > 0),
    late_fee_per_day  DOUBLE PRECISION NOT NULL CHECK (late_fee_per_day >= 0),
    qty_total         INTEGER NOT NULL DEFAULT 1 CHECK (qty_total >= 0),
    qty_repair        INTEGER NOT NULL DEFAULT 0,
    qty_written_off   INTEGER NOT NULL DEFAULT 0,
    CHECK (qty_repair + qty_written_off <= qty_total)
);

CREATE TABLE IF NOT EXISTS bookings (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users (id),
    equipment_id  INTEGER NOT NULL REFERENCES equipment (id),
    qty           INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
    date_from     DATE NOT NULL,
    date_to       DATE NOT NULL,
    status        VARCHAR NOT NULL DEFAULT 'booked'
                  CHECK (status IN ('booked', 'confirmed', 'issued', 'returned', 'cancelled')),
    total         DOUBLE PRECISION NOT NULL,
    fine          DOUBLE PRECISION NOT NULL DEFAULT 0,
    condition     VARCHAR DEFAULT '',
    returned_on   DATE,
    CHECK (date_to >= date_from)
);
CREATE INDEX IF NOT EXISTS ix_bookings_equipment_dates ON bookings (equipment_id, date_from, date_to);
