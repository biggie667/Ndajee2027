-- NDAGE 2026 - Systeme d accreditation : schema PostgreSQL
-- Cree automatiquement au premier demarrage (voir lib/store.js).

CREATE TABLE roles (
  name        text PRIMARY KEY,
  perms       text[] NOT NULL DEFAULT '{}'
);
CREATE TABLE users (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  email       text NOT NULL,
  pass_hash   text NOT NULL,
  role        text NOT NULL REFERENCES roles(name) ON UPDATE CASCADE,
  org         text NOT NULL DEFAULT '',
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

CREATE TABLE categories (
  code        text PRIMARY KEY,
  label       text NOT NULL,
  banner      text NOT NULL,
  color       text NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  population  text NOT NULL,
  meal        boolean NOT NULL DEFAULT false,
  sort        int  NOT NULL DEFAULT 0
);
CREATE TABLE zones (
  code        text PRIMARY KEY CHECK (code ~ '^[A-Z0-9]{1,3}$'),
  label       text NOT NULL,
  off_site    boolean NOT NULL DEFAULT false,
  sort        int  NOT NULL DEFAULT 0
);
CREATE TABLE privileges (
  code        text PRIMARY KEY CHECK (code ~ '^[A-Z0-9]$'),
  label       text NOT NULL,
  sort        int  NOT NULL DEFAULT 0
);
CREATE TABLE category_zones (
  category_code text NOT NULL REFERENCES categories(code) ON DELETE CASCADE,
  zone_code     text NOT NULL REFERENCES zones(code) ON DELETE CASCADE,
  PRIMARY KEY (category_code, zone_code)
);
CREATE TABLE category_privileges (
  category_code  text NOT NULL REFERENCES categories(code) ON DELETE CASCADE,
  privilege_code text NOT NULL REFERENCES privileges(code) ON DELETE CASCADE,
  PRIMARY KEY (category_code, privilege_code)
);

CREATE TABLE events (
  id          text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9]{1,16}$'),
  label       text NOT NULL,
  type        text NOT NULL DEFAULT 'Autre',
  starts_on   date,
  place       text NOT NULL DEFAULT '',
  group_label text NOT NULL DEFAULT 'Groupe',
  groups      text[] NOT NULL DEFAULT '{}',
  archived    boolean NOT NULL DEFAULT false,
  sort        int  NOT NULL DEFAULT 0
);

CREATE TABLE persons (
  id           text PRIMARY KEY,
  pos          bigserial NOT NULL,
  last_name    text NOT NULL,
  first_name   text NOT NULL,
  sex          char(1) CHECK (sex IN ('F','M')),
  birth_date   date,
  nationality  text NOT NULL DEFAULT '',
  category_code text NOT NULL REFERENCES categories(code),
  organisation text NOT NULL,
  function     text NOT NULL DEFAULT '',
  address      text NOT NULL DEFAULT '',
  phone        text NOT NULL DEFAULT '',
  email        text NOT NULL DEFAULT '',
  photo        text NOT NULL DEFAULT '',
  has_photo    boolean NOT NULL DEFAULT false,
  doc_ok       boolean NOT NULL DEFAULT false,
  bg_status    text NOT NULL DEFAULT 'PEND' CHECK (bg_status IN ('PEND','OK','FLAG')),
  status       text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUB','RET','APP','REJ','PRT','DLV')),
  meal_extra   boolean NOT NULL DEFAULT false,
  review_note  text NOT NULL DEFAULT '',
  event_id     text REFERENCES events(id) ON DELETE SET NULL,
  grp          text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX persons_status_idx   ON persons (status);
CREATE INDEX persons_category_idx ON persons (category_code);
CREATE INDEX persons_pos_idx      ON persons (pos DESC);
CREATE INDEX persons_event_idx    ON persons (event_id);
CREATE TABLE person_zones (
  person_id text NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  zone_code text NOT NULL REFERENCES zones(code) ON DELETE CASCADE,
  PRIMARY KEY (person_id, zone_code)
);
CREATE TABLE person_privileges (
  person_id      text NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  privilege_code text NOT NULL REFERENCES privileges(code) ON DELETE CASCADE,
  PRIMARY KEY (person_id, privilege_code)
);

CREATE TABLE access_requests (
  id           text PRIMARY KEY,
  person_id    text NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  type         text NOT NULL CHECK (type IN ('zone','priv','meal')),
  code         text NOT NULL DEFAULT '',
  reason       text NOT NULL,
  requested_by text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  status       text NOT NULL DEFAULT 'PEND' CHECK (status IN ('PEND','OK','NO')),
  decided_by   text NOT NULL DEFAULT ''
);
CREATE INDEX access_requests_person_idx ON access_requests (person_id);

CREATE TABLE invitations (
  id            bigserial PRIMARY KEY,
  token_hash    text NOT NULL UNIQUE,
  email         text NOT NULL,
  category_code text NOT NULL REFERENCES categories(code),
  organisation  text NOT NULL,
  person_id     text UNIQUE REFERENCES persons(id) ON DELETE SET NULL,
  event_id      text REFERENCES events(id) ON DELETE SET NULL,
  grp           text NOT NULL DEFAULT '',
  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_sent_at  timestamptz,
  submitted_at  timestamptz
);

CREATE TABLE audit_log (
  id         bigserial PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT now(),
  user_name  text NOT NULL,
  domain     text NOT NULL,
  detail     text NOT NULL,
  person_id  text NOT NULL DEFAULT ''
);
CREATE INDEX audit_log_at_idx ON audit_log (at DESC);

CREATE TABLE settings (
  key    text PRIMARY KEY,
  value  jsonb NOT NULL
);
