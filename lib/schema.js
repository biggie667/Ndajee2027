// Schéma PostgreSQL. La même définition est fournie en clair dans db/schema.sql.
module.exports = `
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

CREATE TABLE persons (
  id           text PRIMARY KEY,
  pos          bigserial NOT NULL,
  last_name    text NOT NULL,
  first_name   text NOT NULL,
  sex          char(1) NOT NULL CHECK (sex IN ('F','M')),
  birth_date   date,
  nationality  text NOT NULL DEFAULT '',
  category_code text NOT NULL REFERENCES categories(code),
  organisation text NOT NULL,
  function     text NOT NULL DEFAULT '',
  photo        text NOT NULL DEFAULT '',
  has_photo    boolean NOT NULL DEFAULT false,
  doc_ok       boolean NOT NULL DEFAULT false,
  bg_status    text NOT NULL DEFAULT 'PEND' CHECK (bg_status IN ('PEND','OK','FLAG')),
  status       text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUB','RET','APP','REJ','PRT','DLV')),
  meal_extra   boolean NOT NULL DEFAULT false,
  review_note  text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX persons_status_idx   ON persons (status);
CREATE INDEX persons_category_idx ON persons (category_code);
CREATE INDEX persons_pos_idx      ON persons (pos DESC);
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
`;
