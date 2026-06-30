const MAX = 500;
const buffer = [];
export function logEvento(categoria, mensagem, dados, nivel = 'info') {
    const ev = { ts: Date.now(), nivel, categoria, mensagem, dados };
    buffer.push(ev);
    if (buffer.length > MAX)
        buffer.shift();
    const prefix = `[${categoria}]`;
    const extra = dados ? ` ${JSON.stringify(dados)}` : '';
    if (nivel === 'error')
        console.error(prefix, mensagem, extra);
    else if (nivel === 'warn')
        console.warn(prefix, mensagem, extra);
    else
        console.log(prefix, mensagem, extra);
}
export function obterLogsRecentes(limite = 100, categoria) {
    let lista = buffer;
    if (categoria)
        lista = lista.filter((e) => e.categoria === categoria);
    return lista.slice(-limite);
}
export function contarLogsPorNivel() {
    const c = { info: 0, warn: 0, error: 0, debug: 0 };
    for (const e of buffer)
        c[e.nivel]++;
    return c;
}
