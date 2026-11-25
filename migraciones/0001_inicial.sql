-- Base de datos de pulso (Cloudflare D1, que es SQLite).
-- Las horas se guardan como milisegundos desde 1970 (UTC): así comparar es restar.

-- Cada noticia. El contenido completo (titular, puntos, fuentes, foto…) va en "datos"
-- con el mismo formato que tenía data/noticias.json; las columnas sueltas sirven para buscar y ordenar.
CREATE TABLE noticias (
  id          TEXT PRIMARY KEY,
  estado      TEXT NOT NULL DEFAULT 'borrador'
              CHECK (estado IN ('borrador', 'publicada', 'retirada', 'descartada')),
  publicar_en INTEGER,              -- una "publicada" solo se ve a partir de esta hora (así se programa)
  retirar_en  INTEGER,              -- y deja de verse a partir de esta (null = nunca)
  revisada    INTEGER NOT NULL DEFAULT 1, -- 0 = la ha propuesto el agente y nadie la ha mirado
  propuesta   INTEGER NOT NULL DEFAULT 0, -- 1 = el agente recomienda publicarla
  destacado   INTEGER NOT NULL DEFAULT 0,
  fijada      INTEGER NOT NULL DEFAULT 0, -- se queda en portada aunque pasen 48 horas (guías)
  orden       INTEGER,              -- orden manual en portada (null = por fecha)
  categoria   TEXT NOT NULL,
  titular     TEXT NOT NULL,
  datos       TEXT NOT NULL,
  edicion     TEXT,                 -- "2026-11-26" si llegó en la edición del agente
  autor       TEXT,
  creada      INTEGER NOT NULL,
  actualizada INTEGER NOT NULL
);
CREATE INDEX noticias_visibles ON noticias (estado, publicar_en);
CREATE INDEX noticias_edicion ON noticias (edicion);

-- Historial: una fila por cada cambio, con cómo quedó la noticia después
CREATE TABLE versiones (
  n       INTEGER PRIMARY KEY AUTOINCREMENT,
  noticia TEXT NOT NULL,
  fecha   INTEGER NOT NULL,
  autor   TEXT NOT NULL,
  accion  TEXT NOT NULL,
  fila    TEXT NOT NULL
);
CREATE INDEX versiones_noticia ON versiones (noticia, n);

-- "Mañana, tarde y noche". Cada edición trae los suyos y se ven desde la hora "desde".
CREATE TABLE momentos (
  desde INTEGER PRIMARY KEY,
  datos TEXT NOT NULL,
  autor TEXT,
  actualizado INTEGER NOT NULL
);

-- Ajustes sueltos (por ejemplo, el anuncio de la portada)
CREATE TABLE ajustes (
  clave TEXT PRIMARY KEY,
  valor TEXT,
  autor TEXT,
  actualizado INTEGER NOT NULL
);

-- Personas que entran al panel
CREATE TABLE usuarios (
  email  TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  rol    TEXT NOT NULL CHECK (rol IN ('admin', 'editor', 'redactor')),
  activo INTEGER NOT NULL DEFAULT 1,
  creado INTEGER NOT NULL
);

-- Enlaces de acceso que se mandan por email (se guarda solo su huella, nunca el enlace)
CREATE TABLE enlaces (
  huella TEXT PRIMARY KEY,
  email  TEXT NOT NULL,
  expira INTEGER NOT NULL,
  usado  INTEGER NOT NULL DEFAULT 0,
  creado INTEGER NOT NULL
);
CREATE INDEX enlaces_email ON enlaces (email, creado);

-- Sesiones abiertas (cookie del panel; también solo la huella)
CREATE TABLE sesiones (
  huella TEXT PRIMARY KEY,
  email  TEXT NOT NULL,
  expira INTEGER NOT NULL,
  creada INTEGER NOT NULL
);

INSERT INTO usuarios (email, nombre, rol, activo, creado)
VALUES ('hola@pulsomedio.es', 'Redacción pulso', 'admin', 1, 1795600000000);
