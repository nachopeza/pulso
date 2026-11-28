// Páginas sueltas (legales, hemeroteca y noticia): el enlace «Configurar cookies»
// vuelve a abrir el aviso de privacidad de Google para cambiar lo que elegiste.
// Si el aviso no está cargado (por ejemplo, con un bloqueador), el enlace lleva a la página de cookies.
document.addEventListener('click', function (e) {
  var a = e.target.closest && e.target.closest('[data-config-cookies]');
  if (!a || !window.googlefc || !window.googlefc.callbackQueue) return;
  e.preventDefault();
  window.googlefc.callbackQueue.push(window.googlefc.showRevocationMessage);
});
