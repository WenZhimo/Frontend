export function createProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error(`WebGL program link failed: ${message}`);
  }
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  return program;
}

export function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`WebGL shader compile failed: ${message}`);
  }
  return shader;
}

export function createTexture(gl, width, height, options = {}) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, options.filter || gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, options.filter || gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, Math.max(1, width), Math.max(1, height), 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  return texture;
}

export function resizeTexture(gl, texture, width, height) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, Math.max(1, width), Math.max(1, height), 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
}

export function createFramebuffer(gl, texture) {
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteFramebuffer(framebuffer);
    throw new Error(`WebGL framebuffer incomplete: ${status}`);
  }
  return framebuffer;
}

export function setTextureImage(gl, texture, source) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
}

export function createFullscreenGeometry(gl) {
  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
    -1,  1,
     1, -1,
     1,  1,
  ]), gl.STATIC_DRAW);
  return { vao, buffer };
}

export function bindFullscreenAttribute(gl, program, geometry) {
  const location = gl.getAttribLocation(program, "a_position");
  gl.bindVertexArray(geometry.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, geometry.buffer);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
}

export function setUniforms(gl, program, uniforms) {
  Object.entries(uniforms).forEach(([name, value]) => {
    const location = gl.getUniformLocation(program, name);
    if (location === null) return;
    if (typeof value === "number") gl.uniform1f(location, value);
    else if (Array.isArray(value) && value.length === 2) gl.uniform2f(location, value[0], value[1]);
    else if (Array.isArray(value) && value.length === 3) gl.uniform3f(location, value[0], value[1], value[2]);
    else if (Number.isInteger(value?.unit)) gl.uniform1i(location, value.unit);
  });
}

export function bindTextureUnit(gl, unit, texture) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
}
