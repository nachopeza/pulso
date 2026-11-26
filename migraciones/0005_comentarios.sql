-- Comentarios de lectores registrados: salen al momento; se pueden denunciar y moderar en el panel.

-- Nombre público del lector (lo que se ve junto a sus comentarios; su email nunca se enseña)
ALTER TABLE lectores ADD COLUMN nombre TEXT;

CREATE TABLE comentarios (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  noticia   TEXT NOT NULL,
  email     TEXT NOT NULL,
  nombre    TEXT NOT NULL,
  texto     TEXT NOT NULL,
  estado    TEXT NOT NULL DEFAULT 'visible' CHECK (estado IN ('visible', 'oculto')),
  denuncias INTEGER NOT NULL DEFAULT 0,
  creado    INTEGER NOT NULL
);
CREATE INDEX comentarios_noticia ON comentarios (noticia, estado, creado);
CREATE INDEX comentarios_email ON comentarios (email, creado);

-- Quién ha denunciado qué (una denuncia por persona y comentario)
CREATE TABLE denuncias (
  comentario INTEGER NOT NULL,
  email      TEXT NOT NULL,
  creada     INTEGER NOT NULL,
  PRIMARY KEY (comentario, email)
);
