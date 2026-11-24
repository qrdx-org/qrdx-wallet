// The wallet's icon: the QRDX mark (components/QrdxMark.tsx, the same geometry) as a piece of
// Liquid Glass, in the wallet's monochrome. Each stroke is a rounded glass tube: clear in the
// middle, bright at its edges, darker inside the far edge where it bends light away. A light from
// the upper left catches the rims; a soft shadow sits under it.
//
// Rendered once into PNGs by scripts/icon/README.md. With `tile` 0 the background is transparent
// (browser, extension, Android, desktop); with `tile` 1 it sits on black, which iOS requires of a
// home-screen icon (it fills transparent pixels with black).

struct Params {
  resolution: vec2f,
  // 1: draw the ink tile behind the mark; 0: transparent.
  tile: f32,
  // 1: draw the soft shadow (large sizes); 0: none (16 and 32 px, where it only blurs).
  shadow: f32,
  ink: vec3f,
  // How much of the image the mark spans (0 to 1).
  size: f32,
  // How solid the glass is: 0 clear (large icons), 1 nearly opaque smoked glass (16 to 48 px, so
  // it reads on light toolbars and dark).
  density: f32,
}

@group(0) @binding(0) var<uniform> params: Params;

fn sdRoundBox(p: vec2f, b: vec2f, r: f32) -> f32 {
  let q = abs(p) - b + r;
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

/** Signed distance to a quadrilateral (Inigo Quilez's polygon distance). */
fn sdQuad(p: vec2f, a: vec2f, b: vec2f, c: vec2f, d: vec2f) -> f32 {
  var v = array<vec2f, 4>(a, b, c, d);
  var dist = dot(p - v[0], p - v[0]);
  var s = 1.0;
  var j = 3;
  for (var i = 0; i < 4; i++) {
    let e = v[j] - v[i];
    let w = p - v[i];
    let k = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    dist = min(dist, dot(k, k));
    let c1 = p.y >= v[i].y;
    let c2 = p.y < v[j].y;
    let c3 = e.x * w.y > e.y * w.x;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) {
      s = -s;
    }
    j = i;
  }
  return s * sqrt(dist);
}

/** The mark, in its SVG's 64-unit space (y down): a rounded square broken by the diagonal tail. */
fn mark(p: vec2f) -> f32 {
  var ring = abs(sdRoundBox(p - vec2f(28.0, 28.5), vec2f(20.5, 19.0), 8.0)) - 3.75;
  ring = max(ring, -sdQuad(p, vec2f(22.0, 25.0), vec2f(40.0, 25.0), vec2f(66.0, 57.0), vec2f(48.0, 57.0)));
  let tail = sdQuad(p, vec2f(26.0, 27.0), vec2f(36.0, 27.0), vec2f(59.0, 55.0), vec2f(49.0, 55.0));
  // Glass has no knife edges: every corner is softened a little.
  return min(ring, tail + 0.6) - 0.6;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  // The mark's visual centre sits at the image's centre.
  let unit = 64.0 / params.size;
  let p = (uv - 0.5) * unit + vec2f(31.4, 31.4);
  let px = unit / params.resolution.x;

  let d = mark(p);
  // Half a stroke: how far inside a point can be.
  let half = 3.75;
  let s = clamp(-d / half, 0.0, 1.0);
  // A round tube: its height across the stroke, and how steeply it falls at that point.
  let rise = sqrt(max(1.0 - (1.0 - s) * (1.0 - s), 0.0));
  let slope = (1.0 - s) / max(rise, 0.08);
  let e = vec2f(0.05, 0.0);
  let g = normalize(vec2f(mark(p + e.xy) - mark(p - e.xy), mark(p + e.yx) - mark(p - e.yx)) + 1e-5);
  // z toward the viewer; x right, y down.
  let n = normalize(vec3f(g * slope * 0.9, 1.0));
  let v = vec3f(0.0, 0.0, 1.0);
  let cosI = clamp(dot(n, v), 0.0, 1.0);

  // Light comes from the upper left. In the image plane: which way is "toward the light".
  let toKey = normalize(vec2f(-0.6, -0.8));
  // How much this point's slope faces the light (1), or faces away (-1).
  let facing = dot(-g, toKey);
  let r = reflect(-v, n);
  let key = normalize(vec3f(-0.5, -0.65, 0.6));
  let spec = pow(max(dot(r, key), 0.0), 80.0) * 1.4;

  // A crisp white line just inside the edge on the lit side, a dimmer one on the far side, and
  // a darker band inside the far edge where the glass bends light away: what makes it read as
  // thick, clear glass rather than plastic.
  let edge = exp(-pow((s - 0.08) / 0.07, 2.0));
  let litRim = edge * smoothstep(-0.2, 0.9, facing);
  let farRim = edge * smoothstep(0.2, -0.9, facing) * 0.45;
  let shade = exp(-pow((s - 0.24) / 0.12, 2.0)) * smoothstep(0.0, -0.8, facing);

  // Frosted white glass, a little greyer toward the edges, lit from the upper left through its
  // volume, with a broad diagonal sheen across the mark.
  let across = dot(uv, vec2f(0.6, 0.8));
  let lit = 0.7 + 0.45 * max(dot(n, key), 0.0);
  let sheen = smoothstep(0.75, 0.2, across) * 0.45;
  var col = vec3f(mix(1.0, 0.78, smoothstep(0.6, 0.05, s) * (1.0 - cosI * 0.5))) * lit + vec3f(sheen);
  col = col * (1.0 - 0.35 * shade) + vec3f(litRim * 1.2 + farRim + spec);
  // Dense (small) glass is smoked graphite with white rims, so a 16 px icon reads on light
  // toolbars and dark.
  col = mix(col, mix(vec3f(0.08), col, 0.15 + 0.6 * litRim), params.density * 0.95);
  let clear = mix(0.16, 0.92, params.density);
  var alpha = mix(clear + sheen * 0.4, 0.92, smoothstep(0.6, 0.02, s)) + litRim * 0.5 + spec * 0.4 + shade * 0.15;

  alpha = clamp(alpha, 0.0, 1.0) * smoothstep(px, -px, d);

  // The soft shadow under the glass, offset down and a little right.
  let sd = mark(p - vec2f(0.8, 2.2));
  let drop = params.shadow * 0.26 * exp(-max(sd, 0.0) * max(sd, 0.0) / 10.0) * smoothstep(-2.0, 1.5, sd);

  if (params.tile > 0.5) {
    // Through the glass the tile is seen bent along the slope, and a little brighter.
    let seen = uv - n.xy * 0.035 * (1.0 - s * 0.5);
    let bg = tileAt(uv) * (1.0 - drop * 1.4);
    let behind = tileAt(seen) * 1.25 + vec3f(0.04);
    let glass = mix(behind, col, alpha);
    return vec4f(mix(bg, glass, smoothstep(px, -px, d)), 1.0);
  }
  // Transparent: straight (not premultiplied) alpha, the shadow where the glass is not.
  let outA = alpha + drop * (1.0 - alpha);
  let outC = (col * alpha) / max(outA, 1e-4);
  return vec4f(outC, outA);
}

/** The black tile, lit faintly from above. */
fn tileAt(uv: vec2f) -> vec3f {
  return params.ink + vec3f(0.07) * smoothstep(0.95, 0.0, distance(uv, vec2f(0.5, 0.12)));
}
