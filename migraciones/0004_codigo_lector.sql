-- Entrar en la cuenta de lector con un código de 6 cifras además del enlace:
-- en el móvil, el enlace del email se abre a veces en otro navegador (el de la app de correo)
-- y la sesión se queda allí. Con el código, entras en la misma pestaña donde estabas.
ALTER TABLE enlaces ADD COLUMN codigo TEXT;                      -- huella del código (nunca el código)
ALTER TABLE enlaces ADD COLUMN intentos INTEGER NOT NULL DEFAULT 0;
