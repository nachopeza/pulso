-- Estadísticas propias, sin cookies: contadores por día.
-- tipo: 'pagina' (entradas en la web), 'unicos' (personas distintas ese día), 'lectura' (fichas abiertas,
-- clave = id de la noticia), 'compartir' (clave = id), 'origen' (clave = bluesky, x, google…),
-- 'disp' (clave = movil | ordenador)
CREATE TABLE visitas (
  dia   TEXT NOT NULL,
  tipo  TEXT NOT NULL,
  clave TEXT NOT NULL DEFAULT '',
  n     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, tipo, clave)
);

-- Huellas del día para contar personas distintas. La huella mezcla IP, navegador y una sal que
-- cambia cada día, así que no se puede seguir a nadie de un día a otro. Se borran a los 2 días.
CREATE TABLE unicos (
  dia TEXT NOT NULL,
  h   TEXT NOT NULL,
  PRIMARY KEY (dia, h)
);
