/**
 * 最小静态开发服务器，模拟生产主机的简洁 URL
 * （因此 `/import` 会解析到 `import.html`，与 orogen.studio 一致）。
 *
 * 用法：node tuning/dev-server.mjs [端口]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.argv[2] || 8000);

const MIME = {
    '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
    '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain',
    '.xml': 'application/xml', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm',
};

function resolveFile(urlPath) {
    let p = decodeURIComponent(new URL(urlPath, 'http://x').pathname);
    if (p === '/' || p === '') p = '/index.html';
    const candidates = [p];
    if (!path.extname(p)) { candidates.push(p + '.html', path.join(p, 'index.html')); }
    for (const c of candidates) {
        const fp = path.join(ROOT, c);
        if (fp.startsWith(ROOT) && fs.existsSync(fp) && fs.statSync(fp).isFile()) return fp;
    }
    return null;
}

http.createServer((req, res) => {
    const fp = resolveFile(req.url);
    if (!fp) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404 Not Found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
}).listen(PORT, () => console.log(`World Orogen 开发服务器 → http://localhost:${PORT}  （简洁 URL 可用，/import 可访问）`));
