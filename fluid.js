/*
 * WebGL Fluid Simulation, Hero integration for Hexara
 * Original: https://github.com/PavelDoGreat/WebGL-Fluid-Simulation
 * MIT License, Copyright (c) 2017 Pavel Dobryakov
 * Modified: transparent canvas, Hexara brand palette, no GUI/promo/GA
 */
(function () {
'use strict';

const canvas = document.getElementById('fluidCanvas');
if (!canvas) return;
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

resizeCanvas();

let config = {
    SIM_RESOLUTION: 128,
    DYE_RESOLUTION: 1024,
    DENSITY_DISSIPATION: 1.4,
    VELOCITY_DISSIPATION: 0.12,
    PRESSURE: 0.8,
    PRESSURE_ITERATIONS: 20,
    CURL: 11,
    SPLAT_RADIUS: 0.15,
    SPLAT_FORCE: 3000,
    COLOR_UPDATE_SPEED: 0.6,
    // --- Obstacle mask: confine the fluid to the dark areas of the hero art ---
    OBSTACLES: true,                       // master switch
    OBSTACLE_IMAGE: 'assets/hero-bg.jpg',  // must match the .hero-art background
    OBSTACLE_THRESHOLD: 0.08,              // brightness (0..1) at/above which a pixel is wall
    OBSTACLE_SEAL: 5,                      // mask px: close crevices/gaps between lines (0 = off)
    OBSTACLE_MIN_REGION: 0.04,            // keep any open area ≥ this fraction of the frame (+ the largest)
    OBSTACLE_FEATHER: 2,                   // mask px: soft-edge blur on the final wall
};

function pointerPrototype () {
    this.id = -1;
    this.texcoordX = 0;
    this.texcoordY = 0;
    this.prevTexcoordX = 0;
    this.prevTexcoordY = 0;
    this.deltaX = 0;
    this.deltaY = 0;
    this.down = false;
    this.moved = false;
    this.color = [30, 0, 300];
}

let pointers = [];
pointers.push(new pointerPrototype());

const { gl, ext } = getWebGLContext(canvas);

if (isMobile()) {
    config.DYE_RESOLUTION = 512;
}
if (!ext.supportLinearFiltering) {
    config.DYE_RESOLUTION = 512;
}

function getWebGLContext (canvas) {
    const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
    let gl = canvas.getContext('webgl2', params);
    const isWebGL2 = !!gl;
    if (!isWebGL2)
        gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);

    let halfFloat;
    let supportLinearFiltering;
    if (isWebGL2) {
        gl.getExtension('EXT_color_buffer_float');
        supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
    } else {
        halfFloat = gl.getExtension('OES_texture_half_float');
        supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
    }

    gl.clearColor(0.0, 0.0, 0.0, 1.0);

    const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : halfFloat.HALF_FLOAT_OES;
    let formatRGBA;
    let formatRG;
    let formatR;

    if (isWebGL2) {
        formatRGBA = getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, halfFloatTexType);
        formatRG   = getSupportedFormat(gl, gl.RG16F,   gl.RG,   halfFloatTexType);
        formatR    = getSupportedFormat(gl, gl.R16F,    gl.RED,  halfFloatTexType);
    } else {
        formatRGBA = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
        formatRG   = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
        formatR    = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
    }

    return {
        gl,
        ext: { formatRGBA, formatRG, formatR, halfFloatTexType, supportLinearFiltering }
    };
}

function getSupportedFormat (gl, internalFormat, format, type) {
    if (!supportRenderTextureFormat(gl, internalFormat, format, type)) {
        switch (internalFormat) {
            case gl.R16F:  return getSupportedFormat(gl, gl.RG16F,   gl.RG,   type);
            case gl.RG16F: return getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, type);
            default:       return null;
        }
    }
    return { internalFormat, format };
}

function supportRenderTextureFormat (gl, internalFormat, format, type) {
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
    let fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return gl.checkFramebufferStatus(gl.FRAMEBUFFER) == gl.FRAMEBUFFER_COMPLETE;
}

function isMobile () {
    return /Mobi|Android/i.test(navigator.userAgent);
}

class Program {
    constructor (vertexShader, fragmentShader) {
        this.uniforms = {};
        this.program = createProgram(vertexShader, fragmentShader);
        this.uniforms = getUniforms(this.program);
    }
    bind () { gl.useProgram(this.program); }
}

function createProgram (vertexShader, fragmentShader) {
    let program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        console.trace(gl.getProgramInfoLog(program));
    return program;
}

function getUniforms (program) {
    let uniforms = [];
    let uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < uniformCount; i++) {
        let uniformName = gl.getActiveUniform(program, i).name;
        uniforms[uniformName] = gl.getUniformLocation(program, uniformName);
    }
    return uniforms;
}

function compileShader (type, source, keywords) {
    source = addKeywords(source, keywords);
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        console.trace(gl.getShaderInfoLog(shader));
    return shader;
}

function addKeywords (source, keywords) {
    if (keywords == null) return source;
    let keywordsString = '';
    keywords.forEach(keyword => { keywordsString += '#define ' + keyword + '\n'; });
    return keywordsString + source;
}

const baseVertexShader = compileShader(gl.VERTEX_SHADER, `
    precision highp float;
    attribute vec2 aPosition;
    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform vec2 texelSize;
    void main () {
        vUv = aPosition * 0.5 + 0.5;
        vL = vUv - vec2(texelSize.x, 0.0);
        vR = vUv + vec2(texelSize.x, 0.0);
        vT = vUv + vec2(0.0, texelSize.y);
        vB = vUv - vec2(0.0, texelSize.y);
        gl_Position = vec4(aPosition, 0.0, 1.0);
    }
`);


const copyShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv;
    uniform sampler2D uTexture;
    void main () { gl_FragColor = texture2D(uTexture, vUv); }
`);

const clearShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv;
    uniform sampler2D uTexture;
    uniform float value;
    void main () { gl_FragColor = value * texture2D(uTexture, vUv); }
`);


// Standard smooth-dye display, renders the fluid as soft glowing smoke
// (no grid). This is the look the Hexera hero uses.
const displayShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;
    varying vec2 vUv;
    uniform sampler2D uTexture;   // dye / colour field
    uniform sampler2D uObstacle;  // walls = 1.0, open fluid = 0.0
    void main () {
        vec3 c = texture2D(uTexture, vUv).rgb;
        float a = max(c.r, max(c.g, c.b));
        // never let the dye render over the coloured art, fade it out at walls
        float free = 1.0 - smoothstep(0.35, 0.65, texture2D(uObstacle, vUv).x);
        c *= free; a *= free;
        gl_FragColor = vec4(c, a);
    }
`);




const splatShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;
    varying vec2 vUv;
    uniform sampler2D uTarget;
    uniform sampler2D uObstacle;
    uniform float aspectRatio;
    uniform vec3 color;
    uniform vec2 point;
    uniform float radius;
    void main () {
        vec2 p = vUv - point.xy;
        p.x *= aspectRatio;
        vec3 splat = exp(-dot(p, p) / radius) * color;
        splat *= 1.0 - step(0.5, texture2D(uObstacle, vUv).x);  // not into walls
        vec3 base = texture2D(uTarget, vUv).xyz;
        gl_FragColor = vec4(base + splat, 1.0);
    }
`);

const advectionShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;
    varying vec2 vUv;
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform sampler2D uObstacle;
    uniform vec2 texelSize;
    uniform vec2 dyeTexelSize;
    uniform float dt;
    uniform float dissipation;
    vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
        vec2 st = uv / tsize - 0.5;
        vec2 iuv = floor(st);
        vec2 fuv = fract(st);
        vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
        vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
        vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
        vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
        return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
    }
    void main () {
    #ifdef MANUAL_FILTERING
        vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
        vec4 result = bilerp(uSource, coord, dyeTexelSize);
    #else
        vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
        vec4 result = texture2D(uSource, coord);
    #endif
        float decay = 1.0 + dissipation * dt;
        vec4 outColor = result / decay;
        if (texture2D(uObstacle, vUv).x > 0.5) outColor = vec4(0.0);  // walls stay empty
        gl_FragColor = outColor;
    }`,
    ext.supportLinearFiltering ? null : ['MANUAL_FILTERING']
);

const divergenceShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uVelocity;
    uniform sampler2D uObstacle;
    void main () {
        float L = texture2D(uVelocity, vL).x;
        float R = texture2D(uVelocity, vR).x;
        float T = texture2D(uVelocity, vT).y;
        float B = texture2D(uVelocity, vB).y;
        vec2 C = texture2D(uVelocity, vUv).xy;
        if (vL.x < 0.0) { L = -C.x; }
        if (vR.x > 1.0) { R = -C.x; }
        if (vT.y > 1.0) { T = -C.y; }
        if (vB.y < 0.0) { B = -C.y; }
        // solid walls behave just like the screen edge: mirror the normal flow
        if (texture2D(uObstacle, vL).x > 0.5) { L = -C.x; }
        if (texture2D(uObstacle, vR).x > 0.5) { R = -C.x; }
        if (texture2D(uObstacle, vT).x > 0.5) { T = -C.y; }
        if (texture2D(uObstacle, vB).x > 0.5) { B = -C.y; }
        float div = 0.5 * (R - L + T - B);
        if (texture2D(uObstacle, vUv).x > 0.5) { div = 0.0; }
        gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
    }
`);

const curlShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uVelocity;
    void main () {
        float L = texture2D(uVelocity, vL).y;
        float R = texture2D(uVelocity, vR).y;
        float T = texture2D(uVelocity, vT).x;
        float B = texture2D(uVelocity, vB).x;
        float vorticity = R - L - T + B;
        gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
    }
`);

const vorticityShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;
    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uVelocity;
    uniform sampler2D uCurl;
    uniform float curl;
    uniform float dt;
    void main () {
        float L = texture2D(uCurl, vL).x;
        float R = texture2D(uCurl, vR).x;
        float T = texture2D(uCurl, vT).x;
        float B = texture2D(uCurl, vB).x;
        float C = texture2D(uCurl, vUv).x;
        vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
        force /= length(force) + 0.0001;
        force *= curl * C;
        force.y *= -1.0;
        vec2 velocity = texture2D(uVelocity, vUv).xy;
        velocity += force * dt;
        velocity = min(max(velocity, -1000.0), 1000.0);
        gl_FragColor = vec4(velocity, 0.0, 1.0);
    }
`);

const pressureShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uDivergence;
    uniform sampler2D uObstacle;
    void main () {
        float L = texture2D(uPressure, vL).x;
        float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x;
        float B = texture2D(uPressure, vB).x;
        float C = texture2D(uPressure, vUv).x;
        // Neumann condition at walls: no pressure gradient across a solid face
        if (texture2D(uObstacle, vL).x > 0.5) { L = C; }
        if (texture2D(uObstacle, vR).x > 0.5) { R = C; }
        if (texture2D(uObstacle, vT).x > 0.5) { T = C; }
        if (texture2D(uObstacle, vB).x > 0.5) { B = C; }
        float divergence = texture2D(uDivergence, vUv).x;
        float pressure = (L + R + B + T - divergence) * 0.25;
        gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
    }
`);

const gradientSubtractShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uVelocity;
    uniform sampler2D uObstacle;
    void main () {
        float L = texture2D(uPressure, vL).x;
        float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x;
        float B = texture2D(uPressure, vB).x;
        float C = texture2D(uPressure, vUv).x;
        if (texture2D(uObstacle, vL).x > 0.5) { L = C; }
        if (texture2D(uObstacle, vR).x > 0.5) { R = C; }
        if (texture2D(uObstacle, vT).x > 0.5) { T = C; }
        if (texture2D(uObstacle, vB).x > 0.5) { B = C; }
        vec2 velocity = texture2D(uVelocity, vUv).xy;
        velocity.xy -= vec2(R - L, T - B);
        if (texture2D(uObstacle, vUv).x > 0.5) { velocity = vec2(0.0); }  // static wall
        gl_FragColor = vec4(velocity, 0.0, 1.0);
    }
`);

const blit = (() => {
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);
    return (target, clear = false) => {
        if (target == null) {
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        } else {
            gl.viewport(0, 0, target.width, target.height);
            gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
        }
        if (clear) {
            gl.clearColor(0.0, 0.0, 0.0, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    };
})();

let dye, velocity, divergence, curl, pressure;


const copyProgram            = new Program(baseVertexShader, copyShader);
const clearProgram           = new Program(baseVertexShader, clearShader);
const splatProgram           = new Program(baseVertexShader, splatShader);
const advectionProgram       = new Program(baseVertexShader, advectionShader);
const divergenceProgram      = new Program(baseVertexShader, divergenceShader);
const curlProgram            = new Program(baseVertexShader, curlShader);
const vorticityProgram       = new Program(baseVertexShader, vorticityShader);
const pressureProgram        = new Program(baseVertexShader, pressureShader);
const gradienSubtractProgram = new Program(baseVertexShader, gradientSubtractShader);
const displayProgram         = new Program(baseVertexShader, displayShader);

function initFramebuffers () {
    let simRes = getResolution(config.SIM_RESOLUTION);
    let dyeRes = getResolution(config.DYE_RESOLUTION);
    const texType   = ext.halfFloatTexType;
    const rgba      = ext.formatRGBA;
    const rg        = ext.formatRG;
    const r         = ext.formatR;
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
    gl.disable(gl.BLEND);

    if (dye == null)
        dye = createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
    else
        dye = resizeDoubleFBO(dye, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);

    if (velocity == null)
        velocity = createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
    else
        velocity = resizeDoubleFBO(velocity, simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);

    divergence = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    curl       = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    pressure   = createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
}

function createFBO (w, h, internalFormat, format, type, param) {
    gl.activeTexture(gl.TEXTURE0);
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
    let fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);
    let texelSizeX = 1.0 / w;
    let texelSizeY = 1.0 / h;
    return {
        texture, fbo, width: w, height: h, texelSizeX, texelSizeY,
        attach (id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, texture); return id; }
    };
}

function createDoubleFBO (w, h, internalFormat, format, type, param) {
    let fbo1 = createFBO(w, h, internalFormat, format, type, param);
    let fbo2 = createFBO(w, h, internalFormat, format, type, param);
    return {
        width: w, height: h,
        texelSizeX: fbo1.texelSizeX, texelSizeY: fbo1.texelSizeY,
        get read  () { return fbo1; }, set read  (v) { fbo1 = v; },
        get write () { return fbo2; }, set write (v) { fbo2 = v; },
        swap () { let t = fbo1; fbo1 = fbo2; fbo2 = t; }
    };
}

function resizeFBO (target, w, h, internalFormat, format, type, param) {
    let newFBO = createFBO(w, h, internalFormat, format, type, param);
    copyProgram.bind();
    gl.uniform1i(copyProgram.uniforms.uTexture, target.attach(0));
    blit(newFBO);
    return newFBO;
}

function resizeDoubleFBO (target, w, h, internalFormat, format, type, param) {
    if (target.width == w && target.height == h) return target;
    target.read  = resizeFBO(target.read, w, h, internalFormat, format, type, param);
    target.write = createFBO(w, h, internalFormat, format, type, param);
    target.width = w; target.height = h;
    target.texelSizeX = 1.0 / w; target.texelSizeY = 1.0 / h;
    return target;
}

// ---------------------------------------------------------------
// OBSTACLE MASK
// Confines the fluid to the dark areas of the hero background. Bright /
// coloured pixels of the art (gold ribbons, teal marble) become solid
// walls the fluid bounces off, exactly like the edges of the screen.
// The mask is built in the same `center / cover` + 1.06 zoom framing the
// CSS uses for .hero-art, so mask UV lines up 1:1 with the fluid canvas.
// ---------------------------------------------------------------
function createMaskTexture () {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // start fully open (all-free) until the image decodes / if disabled
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                  new Uint8Array([0, 0, 0, 255]));
    return {
        texture,
        attach (id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, texture); return id; }
    };
}

const obstacle = createMaskTexture();
let obstacleImage = null;

if (config.OBSTACLES) {
    obstacleImage = new Image();
    obstacleImage.onload = buildObstacleMask;
    obstacleImage.src = config.OBSTACLE_IMAGE;
}

function buildObstacleMask () {
    if (!config.OBSTACLES || !obstacleImage ||
        !obstacleImage.complete || obstacleImage.naturalWidth === 0) return;

    const vw = canvas.clientWidth  || window.innerWidth;
    const vh = canvas.clientHeight || window.innerHeight;
    const aspect = vw / vh;

    const mh = 512;
    const mw = Math.max(2, Math.min(1024, Math.round(mh * aspect)));

    const off = document.createElement('canvas');
    off.width = mw; off.height = mh;
    const ctx = off.getContext('2d', { willReadFrequently: true });

    // replicate CSS `center / cover` + the 1.06 hero zoom, centred
    const iw = obstacleImage.naturalWidth, ih = obstacleImage.naturalHeight;
    const scale = Math.max(mw / iw, mh / ih) * 1.06;
    const dw = iw * scale, dh = ih * scale;
    ctx.clearRect(0, 0, mw, mh);
    ctx.drawImage(obstacleImage, (mw - dw) / 2, (mh - dh) / 2, dw, dh);

    const px = ctx.getImageData(0, 0, mw, mh).data;
    const N = mw * mh;

    // 1) Raw walls: bright/coloured art = wall (1), black field = open (0).
    let wall = new Uint8Array(N);
    const t = config.OBSTACLE_THRESHOLD * 255;
    for (let i = 0; i < N; i++) {
        const j = i * 4;
        if (Math.max(px[j], px[j + 1], px[j + 2]) >= t) wall[i] = 1;
    }

    // 2) Seal: a morphological close (dilate then erode) fills the thin
    //    crevices/gaps between the fanned lines so they join the solid band,
    //    without pulling the outer boundary inward.
    const seal = config.OBSTACLE_SEAL | 0;
    if (seal > 0) wall = erode(dilate(wall, mw, mh, seal), mw, mh, seal);

    // 3) Keep the meaningfully-large open regions (the main black field plus
    //    e.g. the bottom-right pocket); wall off the small slivers between
    //    lines and other tiny pockets past the first wall.
    const keep = keepOpenRegions(wall, mw, mh, config.OBSTACLE_MIN_REGION);

    // 4) Feather the wall edges so the fluid fades softly at the boundary.
    const soft = featherWall(keep, mw, mh, config.OBSTACLE_FEATHER | 0);

    const out = new Uint8Array(N * 4);
    for (let i = 0; i < N; i++) {
        const v = soft[i];                 // 255 = solid wall, 0 = open
        const j = i * 4;
        out[j] = v; out[j + 1] = v; out[j + 2] = v; out[j + 3] = 255;
    }

    gl.bindTexture(gl.TEXTURE_2D, obstacle.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);  // canvas row 0 = top → v = 1 = top of screen
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, mw, mh, 0, gl.RGBA, gl.UNSIGNED_BYTE, out);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
}

// --- mask helpers (CPU-side, run once per build on the small grid) ---
const clampi = (v, hi) => (v < 0 ? 0 : v > hi ? hi : v);

// Separable square max-filter = binary dilation (grows walls). Border is
// clamped (replicate) so walls touching the screen edge are preserved.
function dilate (src, w, h, r) {
    const tmp = new Uint8Array(w * h), dst = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
            let m = 0;
            for (let d = -r; d <= r; d++) { if (src[row + clampi(x + d, w - 1)]) { m = 1; break; } }
            tmp[row + x] = m;
        }
    }
    for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
            let m = 0;
            for (let d = -r; d <= r; d++) { if (tmp[clampi(y + d, h - 1) * w + x]) { m = 1; break; } }
            dst[y * w + x] = m;
        }
    }
    return dst;
}

// Separable square min-filter = binary erosion (shrinks walls back).
function erode (src, w, h, r) {
    const tmp = new Uint8Array(w * h), dst = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
            let m = 1;
            for (let d = -r; d <= r; d++) { if (!src[row + clampi(x + d, w - 1)]) { m = 0; break; } }
            tmp[row + x] = m;
        }
    }
    for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
            let m = 1;
            for (let d = -r; d <= r; d++) { if (!tmp[clampi(y + d, h - 1) * w + x]) { m = 0; break; } }
            dst[y * w + x] = m;
        }
    }
    return dst;
}

// Flood-fill the open cells and return a wall mask that keeps every open
// region at least `minFrac` of the frame (and always the single largest);
// all smaller pockets become wall (1).
function keepOpenRegions (wall, w, h, minFrac) {
    const N = w * h;
    const label = new Int32Array(N);   // 0 = wall or unvisited
    const stack = new Int32Array(N);
    const sizes = [0];                 // sizes[label]; index 0 unused
    let cur = 0;
    for (let s = 0; s < N; s++) {
        if (wall[s] || label[s]) continue;
        cur++;
        let sp = 0, size = 0;
        label[s] = cur; stack[sp++] = s;
        while (sp > 0) {
            const p = stack[--sp]; size++;
            const x = p % w, y = (p / w) | 0;
            if (x > 0)     { const q = p - 1; if (!wall[q] && !label[q]) { label[q] = cur; stack[sp++] = q; } }
            if (x < w - 1) { const q = p + 1; if (!wall[q] && !label[q]) { label[q] = cur; stack[sp++] = q; } }
            if (y > 0)     { const q = p - w; if (!wall[q] && !label[q]) { label[q] = cur; stack[sp++] = q; } }
            if (y < h - 1) { const q = p + w; if (!wall[q] && !label[q]) { label[q] = cur; stack[sp++] = q; } }
        }
        sizes[cur] = size;
    }
    const minSize = Math.max(1, Math.floor(minFrac * N));
    let biggest = 0;
    for (let c = 1; c <= cur; c++) if (sizes[c] > sizes[biggest]) biggest = c;
    const keepLabel = new Uint8Array(cur + 1);
    for (let c = 1; c <= cur; c++) if (sizes[c] >= minSize || c === biggest) keepLabel[c] = 1;
    const out = new Uint8Array(N);
    for (let i = 0; i < N; i++) out[i] = (label[i] && keepLabel[label[i]]) ? 0 : 1;
    return out;
}

// Box-blur the binary wall (1=wall) into a soft 0..255 ramp for gentle edges.
function featherWall (wall, w, h, r) {
    const N = w * h;
    const out = new Uint8Array(N);
    if (r <= 0) { for (let i = 0; i < N; i++) out[i] = wall[i] ? 255 : 0; return out; }
    const tmp = new Float32Array(N), acc = new Float32Array(N);
    const win = 2 * r + 1;
    for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
            let sum = 0;
            for (let d = -r; d <= r; d++) sum += wall[row + clampi(x + d, w - 1)];
            tmp[row + x] = sum / win;
        }
    }
    for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
            let sum = 0;
            for (let d = -r; d <= r; d++) sum += tmp[clampi(y + d, h - 1) * w + x];
            acc[y * w + x] = sum / win;
        }
    }
    for (let i = 0; i < N; i++) { const v = acc[i] * 255; out[i] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }
    return out;
}

initFramebuffers();
// start calm, no intro splats; the effect only wakes on cursor movement

let lastUpdateTime = Date.now();
let colorUpdateTimer = 0.0;
/* the fixed hero canvas is fully covered by opaque sections once the page
   scrolls past the hero, skip the whole sim there (battery/thermal win) */
let heroGone = false;
window.addEventListener("scroll", () => {
    heroGone = window.scrollY > window.innerHeight * 1.3;
}, { passive: true });
update();

function update () {
    if (document.hidden || heroGone) { lastUpdateTime = Date.now(); requestAnimationFrame(update); return; }
    const dt = calcDeltaTime();
    if (resizeCanvas()) { initFramebuffers(); buildObstacleMask(); }
    updateColors(dt);
    applyInputs();
    step(dt);
    render(null);
    requestAnimationFrame(update);
}

function calcDeltaTime () {
    let now = Date.now();
    let dt = (now - lastUpdateTime) / 1000;
    dt = Math.min(dt, 0.016666);
    lastUpdateTime = now;
    return dt;
}

function resizeCanvas () {
    let width  = scaleByPixelRatio(canvas.clientWidth  || window.innerWidth);
    let height = scaleByPixelRatio(canvas.clientHeight || window.innerHeight);
    if (canvas.width != width || canvas.height != height) {
        canvas.width = width;
        canvas.height = height;
        return true;
    }
    return false;
}

function updateColors (dt) {
    colorUpdateTimer += dt * config.COLOR_UPDATE_SPEED;
    if (colorUpdateTimer >= 1) {
        colorUpdateTimer = wrap(colorUpdateTimer, 0, 1);
        pointers.forEach(p => { p.color = generateColor(); });
    }
}

function applyInputs () {
    pointers.forEach(p => {
        if (p.moved) { p.moved = false; splatPointer(p); }
    });
}

function step (dt) {
    gl.disable(gl.BLEND);

    curlProgram.bind();
    gl.uniform2f(curlProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0));
    blit(curl);

    vorticityProgram.bind();
    gl.uniform2f(vorticityProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(vorticityProgram.uniforms.uCurl, curl.attach(1));
    gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL);
    gl.uniform1f(vorticityProgram.uniforms.dt, dt);
    blit(velocity.write);
    velocity.swap();

    divergenceProgram.bind();
    gl.uniform2f(divergenceProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(divergenceProgram.uniforms.uObstacle, obstacle.attach(1));
    blit(divergence);

    clearProgram.bind();
    gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0));
    gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE);
    blit(pressure.write);
    pressure.swap();

    pressureProgram.bind();
    gl.uniform2f(pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0));
    gl.uniform1i(pressureProgram.uniforms.uObstacle, obstacle.attach(2));
    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
        gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1));
        blit(pressure.write);
        pressure.swap();
    }

    gradienSubtractProgram.bind();
    gl.uniform2f(gradienSubtractProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(gradienSubtractProgram.uniforms.uPressure, pressure.read.attach(0));
    gl.uniform1i(gradienSubtractProgram.uniforms.uVelocity, velocity.read.attach(1));
    gl.uniform1i(gradienSubtractProgram.uniforms.uObstacle, obstacle.attach(2));
    blit(velocity.write);
    velocity.swap();

    advectionProgram.bind();
    gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    if (!ext.supportLinearFiltering)
        gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
    let velocityId = velocity.read.attach(0);
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocityId);
    gl.uniform1i(advectionProgram.uniforms.uSource, velocityId);
    gl.uniform1i(advectionProgram.uniforms.uObstacle, obstacle.attach(2));
    gl.uniform1f(advectionProgram.uniforms.dt, dt);
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION);
    blit(velocity.write);
    velocity.swap();

    if (!ext.supportLinearFiltering)
        gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(1));
    gl.uniform1i(advectionProgram.uniforms.uObstacle, obstacle.attach(2));
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
    blit(dye.write);
    dye.swap();
}

// Modified render: transparent canvas, no checkerboard
function render (target) {
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);

    if (target == null) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }

    drawDisplay(target);
}

function drawDisplay (target) {
    let width  = target == null ? gl.drawingBufferWidth  : target.width;
    let height = target == null ? gl.drawingBufferHeight : target.height;
    displayProgram.bind();
    gl.uniform1i(displayProgram.uniforms.uTexture,  dye.read.attach(0));
    gl.uniform1i(displayProgram.uniforms.uObstacle, obstacle.attach(1));
    blit(target);
}

function splatPointer (pointer) {
    let dx = pointer.deltaX * config.SPLAT_FORCE;
    let dy = pointer.deltaY * config.SPLAT_FORCE;
    splat(pointer.texcoordX, pointer.texcoordY, dx, dy, pointer.color);
}

function splat (x, y, dx, dy, color) {
    splatProgram.bind();
    gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
    gl.uniform1i(splatProgram.uniforms.uObstacle, obstacle.attach(1));
    gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
    gl.uniform2f(splatProgram.uniforms.point, x, y);
    gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0.0);
    gl.uniform1f(splatProgram.uniforms.radius, correctRadius(config.SPLAT_RADIUS / 100.0));
    blit(velocity.write);
    velocity.swap();

    gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0));
    gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b);
    blit(dye.write);
    dye.swap();
}

function correctRadius (radius) {
    let aspectRatio = canvas.width / canvas.height;
    if (aspectRatio > 1) radius *= aspectRatio;
    return radius;
}

// Mouse: trigger on move without requiring click.
// Listen on window (canvas is pointer-events:none) using viewport coords -
// the canvas is fixed and fills the viewport, so clientX/Y map 1:1.
window.addEventListener('mousemove', e => {
    let pointer = pointers[0];
    let posX = scaleByPixelRatio(e.clientX);
    let posY = scaleByPixelRatio(e.clientY);
    if (!pointer.down) {
        pointer.down = true;
        pointer.texcoordX = posX / canvas.width;
        pointer.texcoordY = 1.0 - posY / canvas.height;
        pointer.prevTexcoordX = pointer.texcoordX;
        pointer.prevTexcoordY = pointer.texcoordY;
        pointer.color = generateColor();
        return;
    }
    updatePointerMoveData(pointer, posX, posY);
});

window.addEventListener('mouseleave', () => { pointers[0].down = false; });

canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const touches = e.targetTouches;
    while (touches.length >= pointers.length) pointers.push(new pointerPrototype());
    for (let i = 0; i < touches.length; i++) {
        let posX = scaleByPixelRatio(touches[i].pageX);
        let posY = scaleByPixelRatio(touches[i].pageY);
        updatePointerDownData(pointers[i + 1], touches[i].identifier, posX, posY);
    }
});

canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const touches = e.targetTouches;
    for (let i = 0; i < touches.length; i++) {
        let pointer = pointers[i + 1];
        if (!pointer.down) continue;
        let posX = scaleByPixelRatio(touches[i].pageX);
        let posY = scaleByPixelRatio(touches[i].pageY);
        updatePointerMoveData(pointer, posX, posY);
    }
}, false);

window.addEventListener('touchend', e => {
    const touches = e.changedTouches;
    for (let i = 0; i < touches.length; i++) {
        let pointer = pointers.find(p => p.id == touches[i].identifier);
        if (pointer == null) continue;
        updatePointerUpData(pointer);
    }
});

function updatePointerDownData (pointer, id, posX, posY) {
    pointer.id = id;
    pointer.down = true;
    pointer.moved = false;
    pointer.texcoordX = posX / canvas.width;
    pointer.texcoordY = 1.0 - posY / canvas.height;
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.deltaX = 0;
    pointer.deltaY = 0;
    pointer.color = generateColor();
}

function updatePointerMoveData (pointer, posX, posY) {
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.texcoordX = posX / canvas.width;
    pointer.texcoordY = 1.0 - posY / canvas.height;
    pointer.deltaX = correctDeltaX(pointer.texcoordX - pointer.prevTexcoordX);
    pointer.deltaY = correctDeltaY(pointer.texcoordY - pointer.prevTexcoordY);
    pointer.moved = Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0;
}

function updatePointerUpData (pointer) { pointer.down = false; }

function correctDeltaX (delta) {
    let aspectRatio = canvas.width / canvas.height;
    if (aspectRatio < 1) delta *= aspectRatio;
    return delta;
}

function correctDeltaY (delta) {
    let aspectRatio = canvas.width / canvas.height;
    if (aspectRatio > 1) delta /= aspectRatio;
    return delta;
}

// Brand-coloured fluid: strictly alternates the line colour and the accent
// (no random runs, so it never dwells on one colour). Themed via the
// --fluid-line-rgb / --fluid-accent-rgb tokens; falls back to teal/gold.
let nextGold = true;
let fluidPalette = null;
function generateColor () {
    if (!fluidPalette) {
        const cs = getComputedStyle(document.documentElement);
        const rgb = (name, fb) => {
            const m = cs.getPropertyValue(name).trim().match(/^(\d+)\s*,\s*(\d+)\s*,\s*(\d+)$/);
            return m ? { r: m[1] / 255, g: m[2] / 255, b: m[3] / 255 } : fb;
        };
        fluidPalette = {
            line: rgb("--fluid-line-rgb", { r: 0.10, g: 0.78, b: 0.72 }),
            accent: rgb("--fluid-accent-rgb", { r: 1.00, g: 0.72, b: 0.10 }),
        };
    }
    const c = nextGold ? fluidPalette.accent : fluidPalette.line;
    nextGold = !nextGold;
    const i = 0.3; // vivid, bright, saturated glow
    return { r: c.r * i, g: c.g * i, b: c.b * i };
}

function wrap (value, min, max) {
    let range = max - min;
    if (range == 0) return min;
    return (value - min) % range + min;
}

function getResolution (resolution) {
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio;
    let min = Math.round(resolution);
    let max = Math.round(resolution * aspectRatio);
    if (gl.drawingBufferWidth > gl.drawingBufferHeight)
        return { width: max, height: min };
    else
        return { width: min, height: max };
}


function scaleByPixelRatio (input) {
    let pixelRatio = window.devicePixelRatio || 1;
    return Math.floor(input * pixelRatio);
}

})();
