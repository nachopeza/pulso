// Reloj de pulso: un Worker de Cloudflare que cada 5 minutos avisa a la web para que publique
// en Bluesky las piezas aprobadas a las que ya les ha llegado la hora.
// Sustituye al workflow programado de GitHub, que se saltaba la mayoría de las vueltas.
// La clave va como secreto CLAVE del Worker (la misma AGENTE_KEY de la web).
export default {
  async scheduled(evento, env) {
    const r = await fetch('https://pulso.com.es/api/agente/redes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.CLAVE}` }
    });
    const texto = await r.text();
    if (!r.ok) throw new Error(`La web respondió ${r.status}: ${texto.slice(0, 200)}`);
    console.log(texto.slice(0, 500));
  }
};
