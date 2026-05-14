const PAGE_SELECTOR = '.page--tech-capability';
const HOST_SELECTOR = '.homepage-bg-animation-host[data-homepage-bg-animation="tech-capability"]';

const shadertoy = `
vec3 colorA = vec3(0.05);
vec3 colorB = vec3(0.15);
vec3 colorC = vec3(0.30);
float random(vec2 st){
    return fract(sin(dot(st,vec2(12.9898,78.233))) * 43758.5453123);
}

vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x,289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
vec3 fade(vec3 t){return t*t*t*(t*(t*6.0-15.0)+10.0);}

float cnoise(vec3 P){
    vec3 Pi0 = floor(P);
    vec3 Pi1 = Pi0 + 1.0;
    Pi0 = mod(Pi0,289.0);
    Pi1 = mod(Pi1,289.0);
    vec3 Pf0 = fract(P);
    vec3 Pf1 = Pf0 - 1.0;

    vec4 ix = vec4(Pi0.x,Pi1.x,Pi0.x,Pi1.x);
    vec4 iy = vec4(Pi0.yy,Pi1.yy);
    vec4 iz0 = Pi0.zzzz;
    vec4 iz1 = Pi1.zzzz;

    vec4 ixy = permute(permute(ix)+iy);
    vec4 ixy0 = permute(ixy+iz0);
    vec4 ixy1 = permute(ixy+iz1);

    vec4 gx0 = ixy0/7.0;
    vec4 gy0 = fract(floor(gx0)/7.0)-0.5;
    gx0 = fract(gx0);
    vec4 gz0 = 0.5-abs(gx0)-abs(gy0);
    vec4 sz0 = step(gz0,vec4(0.0));
    gx0 -= sz0*(step(0.0,gx0)-0.5);
    gy0 -= sz0*(step(0.0,gy0)-0.5);

    vec4 gx1 = ixy1/7.0;
    vec4 gy1 = fract(floor(gx1)/7.0)-0.5;
    gx1 = fract(gx1);
    vec4 gz1 = 0.5-abs(gx1)-abs(gy1);
    vec4 sz1 = step(gz1,vec4(0.0));
    gx1 -= sz1*(step(0.0,gx1)-0.5);
    gy1 -= sz1*(step(0.0,gy1)-0.5);

    vec3 g000 = vec3(gx0.x,gy0.x,gz0.x);
    vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
    vec3 g010 = vec3(gx0.z,gy0.z,gz0.z);
    vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
    vec3 g001 = vec3(gx1.x,gy1.x,gz1.x);
    vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
    vec3 g011 = vec3(gx1.z,gy1.z,gz1.z);
    vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);

    vec4 norm0 = taylorInvSqrt(vec4(dot(g000,g000),dot(g010,g010),dot(g100,g100),dot(g110,g110)));
    g000 *= norm0.x;
    g010 *= norm0.y;
    g100 *= norm0.z;
    g110 *= norm0.w;

    vec4 norm1 = taylorInvSqrt(vec4(dot(g001,g001),dot(g011,g011),dot(g101,g101),dot(g111,g111)));
    g001 *= norm1.x;
    g011 *= norm1.y;
    g101 *= norm1.z;
    g111 *= norm1.w;

    float n000 = dot(g000,Pf0);
    float n100 = dot(g100,vec3(Pf1.x,Pf0.yz));
    float n010 = dot(g010,vec3(Pf0.x,Pf1.y,Pf0.z));
    float n110 = dot(g110,vec3(Pf1.xy,Pf0.z));
    float n001 = dot(g001,vec3(Pf0.xy,Pf1.z));
    float n101 = dot(g101,vec3(Pf1.x,Pf0.y,Pf1.z));
    float n011 = dot(g011,vec3(Pf0.x,Pf1.yz));
    float n111 = dot(g111,Pf1);

    vec3 f = fade(Pf0);
    vec4 nz = mix(vec4(n000,n100,n010,n110),vec4(n001,n101,n011,n111),f.z);
    vec2 nyz = mix(nz.xy,nz.zw,f.y);
    return 2.2 * mix(nyz.x,nyz.y,f.x);
}

vec2 rotate(vec2 p, float a){
    float c = cos(a), s = sin(a);
    return vec2(p.x*c - p.y*s, p.x*s + p.y*c);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord){
    vec3 bgColor = vec3(43.0, 43.0, 43.0) / 255.0;

    vec2 center = iResolution * 0.5;
    vec2 uv = fragCoord - center;
    float r = length(uv);

    float twist =
        r * 0.002 +
        cnoise(vec3(r * 0.06 - iTime * 3.0, 0.0, iTime * 0.25)) +
        iTime * 0.5;

    uv = rotate(uv, twist);

    const float PI = 3.1415926;
    float angle = atan(uv.y, uv.x);
    float sector = floor((angle + PI) / (2.0 * PI / 5.0));

    float t = sector / 5.0;
    t += random(fragCoord * 0.5) * 0.15;
    t = fract(t);

    vec3 fgColor;
    if (t < 0.5) {
        fgColor = mix(colorA, colorB, t * 2.0);
    } else {
        fgColor = mix(colorB, colorC, (t - 0.5) * 2.0);
    }

    float weight = smoothstep(
        0.0,
        min(iResolution.x, iResolution.y) * 0.7,
        r
    );

    vec3 color = mix(bgColor, fgColor, weight);
    fragColor = vec4(color, 1.0);
}
`;

const frag = `
#ifdef GL_ES
precision mediump float;
#endif

uniform vec2 iResolution;
uniform vec2 iMouse;
uniform float iTime;

${shadertoy}

void main(){
    mainImage(gl_FragColor, gl_FragCoord.xy);
}
`;

const vert = `
#ifdef GL_ES
precision highp float;
#endif

attribute vec3 aPosition;

uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;

void main(){
    gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
}
`;

let instance = null;

function initTechCapabilityBackground() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const page = document.querySelector(PAGE_SELECTOR);
    const host = document.querySelector(HOST_SELECTOR);
    if (!page || !host || typeof window.p5 !== 'function') return;
    if (instance) return;

    const sketch = (p) => {
        let shaderProgram;
        let resizeObserver = null;
        let hostWidth = 1;
        let hostHeight = 1;
        let mouseX = 0;
        let mouseY = 0;

        const syncCanvasSize = () => {
            const rect = host.getBoundingClientRect();
            hostWidth = Math.max(1, Math.floor(rect.width));
            hostHeight = Math.max(1, Math.floor(rect.height));
            p.resizeCanvas(hostWidth, hostHeight);
        };

        const syncLoopState = () => {
            const isActive = page.classList.contains('active') && !document.hidden;
            if (isActive) {
                p.loop();
            } else {
                p.noLoop();
            }
        };

        p.setup = () => {
            const rect = host.getBoundingClientRect();
            hostWidth = Math.max(1, Math.floor(rect.width));
            hostHeight = Math.max(1, Math.floor(rect.height));

            const canvas = p.createCanvas(hostWidth, hostHeight, p.WEBGL);
            canvas.parent(host);
            canvas.style('position', 'absolute');
            canvas.style('inset', '0');
            canvas.style('pointer-events', 'none');
            canvas.style('width', '100%');
            canvas.style('height', '100%');
            p.noStroke();
            shaderProgram = p.createShader(vert, frag);

            if ('ResizeObserver' in window) {
                resizeObserver = new ResizeObserver(syncCanvasSize);
                resizeObserver.observe(host);
            }

            window.addEventListener('kappa:pager-change', syncLoopState);
            window.addEventListener('resize', syncCanvasSize);
            document.addEventListener('visibilitychange', syncLoopState);
            host.addEventListener('pointermove', (event) => {
                const bounds = host.getBoundingClientRect();
                mouseX = event.clientX - bounds.left;
                mouseY = event.clientY - bounds.top;
            }, { passive: true });

            syncLoopState();
        };

        p.draw = () => {
            p.shader(shaderProgram);
            shaderProgram.setUniform('iResolution', [p.width, p.height]);
            shaderProgram.setUniform('iTime', p.millis() * 0.001);
            shaderProgram.setUniform('iMouse', [mouseX, hostHeight - mouseY]);
            p.rect(-p.width / 2, -p.height / 2, p.width, p.height);
        };

        p.windowResized = syncCanvasSize;

        p.remove = ((originalRemove) => () => {
            window.removeEventListener('kappa:pager-change', syncLoopState);
            window.removeEventListener('resize', syncCanvasSize);
            document.removeEventListener('visibilitychange', syncLoopState);
            resizeObserver?.disconnect();
            originalRemove.call(p);
        })(p.remove);
    };

    instance = new window.p5(sketch);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTechCapabilityBackground, { once: true });
} else {
    initTechCapabilityBackground();
}

window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        initTechCapabilityBackground();
    }
});
