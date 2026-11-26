-- Cuentas de lectores: entrar con un enlace por email, guardar noticias en todos sus dispositivos
-- y leer sin límite. Son gratis; no tienen nada que ver con las cuentas del panel.

CREATE TABLE lectores (
  email   TEXT PRIMARY KEY,
  creado  INTEGER NOT NULL,
  acepto  INTEGER NOT NULL,   -- cuándo confirmó que tiene 14 años o más y aceptó la privacidad
  ultimo  INTEGER NOT NULL    -- última vez que entró
);

-- Noticias guardadas por cada lector
CREATE TABLE guardadas (
  email   TEXT NOT NULL,
  noticia TEXT NOT NULL,
  creada  INTEGER NOT NULL,
  PRIMARY KEY (email, noticia)
);

-- Los enlaces y las sesiones dicen para qué sirven: el panel o la web de lectores.
-- Así una sesión de lector nunca abre el panel, aunque el email coincida.
ALTER TABLE enlaces ADD COLUMN para TEXT NOT NULL DEFAULT 'panel';
ALTER TABLE sesiones ADD COLUMN para TEXT NOT NULL DEFAULT 'panel';
