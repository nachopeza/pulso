-- Fase 3: orden calculado de la portada y escaletas de redes en el panel

-- Importancia de 1 a 5: la pone el agente y se puede cambiar en el panel.
-- Junto con la edad de la noticia decide el orden de la portada.
ALTER TABLE noticias ADD COLUMN importancia INTEGER NOT NULL DEFAULT 3;

-- La escaleta de redes de cada día (resumen, alertas, vídeo, comunidad, ideas)
CREATE TABLE escaletas (
  dia         TEXT PRIMARY KEY,          -- "2026-11-26"
  datos       TEXT NOT NULL,             -- JSON: { manana: {...}, tarde: {...}, noche: {...} }
  actualizada INTEGER NOT NULL
);

-- Cada publicación propuesta para redes
CREATE TABLE piezas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  dia         TEXT NOT NULL,
  tanda       TEXT NOT NULL DEFAULT 'manana',   -- qué envío del agente la trajo
  hora        TEXT NOT NULL DEFAULT '',         -- "07:45"
  red         TEXT NOT NULL CHECK (red IN ('bluesky', 'x', 'tiktok', 'instagram')),
  serie       TEXT NOT NULL DEFAULT '',
  noticia     TEXT,                             -- id de la noticia enlazada
  texto       TEXT NOT NULL,
  visual      TEXT NOT NULL DEFAULT '',
  alt         TEXT NOT NULL DEFAULT '',
  estado      TEXT NOT NULL DEFAULT 'revisar'
              CHECK (estado IN ('revisar', 'aprobada', 'cambiar', 'descartada', 'publicada')),
  nota        TEXT NOT NULL DEFAULT '',
  enlace      TEXT NOT NULL DEFAULT '',         -- dónde quedó publicada
  autor       TEXT NOT NULL,
  creada      INTEGER NOT NULL,
  actualizada INTEGER NOT NULL
);
CREATE INDEX piezas_dia ON piezas (dia, hora);
