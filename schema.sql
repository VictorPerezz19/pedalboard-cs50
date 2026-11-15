-- Ejecutar con: sqlite3 pedalboard.db < schema.sql
PRAGMA foreign_keys = ON;

CREATE TABLE users (
    id       INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    hash     TEXT NOT NULL
);

CREATE TABLE gear_catalog (
    id          INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    type        TEXT NOT NULL CHECK (type IN ('amp', 'pedal')),
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    image_url   TEXT
);

-- user_id NULL = preset predeterminado (aparece en /explore)
CREATE TABLE presets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    user_id     INTEGER,
    name        TEXT NOT NULL,
    description TEXT,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE preset_items (
    id        INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    preset_id INTEGER NOT NULL,
    gear_id   INTEGER NOT NULL,
    position  INTEGER NOT NULL,          -- orden en la cadena (1 = primero)
    settings  TEXT,                      -- JSON, ej. {"Dist": 8, "Tone": 5}
    FOREIGN KEY (preset_id) REFERENCES presets(id) ON DELETE CASCADE,
    FOREIGN KEY (gear_id)   REFERENCES gear_catalog(id)
);

CREATE INDEX idx_presets_user ON presets(user_id);
CREATE INDEX idx_items_preset ON preset_items(preset_id, position);

--  Catálogo de ejemplo
INSERT INTO gear_catalog (type, name, description) VALUES
 ('amp',   'Blackstar Debut 50R', 'Combo de 50 W con dos canales, reverb y emulación de altavoz.'),
 ('pedal', 'Boss DS-2',           'Distorsión Turbo con dos modos, muy ligada al sonido grunge.'),
 ('pedal', 'Mooer Pure Boost',    'Booster limpio y transparente para empujar la señal.'),
 ('pedal', 'Behringer UC200',     'Ultra Chorus analógico de estilo clásico.');

--  Presets predeterminados (user_id NULL) 
INSERT INTO presets (id, user_id, name, description) VALUES
 (1, NULL, 'Nirvana - Smells Like Teen Spirit', 'Aproximación: chorus en la intro y distorsión a tope en el estribillo.'),
 (2, NULL, 'Red Hot Chili Peppers - Funk limpio', 'Aproximación: limpio con un poco de empuje, brillante y con cuerpo.'),
 (3, NULL, 'The Beatles - Crunch años 60', 'Aproximación: crunch medio, mucho mid y reverb suave.');

INSERT INTO preset_items (preset_id, gear_id, position, settings) VALUES
 (1, (SELECT id FROM gear_catalog WHERE name = 'Behringer UC200'),       1, '{"Level":5,"EQ":5,"Rate":3,"Depth":6}'),
 (1, (SELECT id FROM gear_catalog WHERE name = 'Boss DS-2'),             2, '{"Level":7,"Tone":5,"Dist":8}'),
 (1, (SELECT id FROM gear_catalog WHERE name = 'Blackstar Debut 50R'),   3, '{"Gain":6,"Bass":6,"Middle":4,"Treble":6,"Volume":7,"Reverb":2}'),
 (2, (SELECT id FROM gear_catalog WHERE name = 'Mooer Pure Boost'),      1, '{"Gain":6}'),
 (2, (SELECT id FROM gear_catalog WHERE name = 'Blackstar Debut 50R'),   2, '{"Gain":3,"Bass":5,"Middle":6,"Treble":7,"Volume":6,"Reverb":3}'),
 (3, (SELECT id FROM gear_catalog WHERE name = 'Mooer Pure Boost'),      1, '{"Gain":4}'),
 (3, (SELECT id FROM gear_catalog WHERE name = 'Blackstar Debut 50R'),   2, '{"Gain":5,"Bass":5,"Middle":7,"Treble":6,"Volume":6,"Reverb":4}');
