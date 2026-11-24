// The wallet's backdrop: a sphere of liquid chrome mirroring a plain studio, printed as 1-bit
// ordered dither in the theme's ink: dots are light on black, and shadow on white. One pixel of the canvas is one dither cell (dither-field.ts's CELL);
// the browser enlarges it, crisp, so the dots stay square.
//
// It moves with the account, and a little with the visitor (the pointer tilts the studio it mirrors,
// scrolling turns it): swells drift across the surface all the time, they stir while
// one of the account's transactions waits to confirm (`busy`), a transaction that appears sends a
// ripple out from a point its hash chooses, and funds coming in send a ring of dots out across
// the screen. dither-field.ts draws the still frame with the same surface and light (keep the two
// in step).

struct Params {
  resolution: vec2f,
  time: f32,
  // 0 to 1: a transaction of the account's is waiting to confirm.
  busy: f32,
  // The orb's centre (x, y) and radius, in cells.
  orb: vec3f,
  // Seconds since funds last came in (99: not while the wallet has been open).
  waveAge: f32,
  bg: vec3f,
  // How strongly a dot shows over the background (0 to 1).
  ink: f32,
  fg: vec3f,
  // 1: dark theme (dots are light); 0: light theme (dots are shadow).
  dark: f32,
  // Where the visitor is: the pointer (xy, -1 to 1 from the centre, eased), which turns the studio
  // the orb mirrors toward it, and how far the page has scrolled (z, radians), which turns the
  // surface. All 0 at rest.
  look: vec4f,
  // Each new transaction's ripple: its origin on the surface (xyz) and its age in seconds (w).
  ripples: array<vec4f, 6>,
}

@group(0) @binding(0) var<uniform> params: Params;

/** The 8x8 Bayer threshold for a cell, from 0 to 1. */
fn bayer(c: vec2u) -> f32 {
  let x = c.x ^ c.y;
  var v = 0u;
  for (var b = 0u; b < 3u; b++) {
    v |= ((x >> b) & 1u) << (5u - 2u * b);
    v |= ((c.y >> b) & 1u) << (4u - 2u * b);
  }
  return (f32(v) + 0.5) / 64.0;
}

/** Turns `v` about the vertical axis: the surface's slow rotation. */
fn spin(v: vec3f, a: f32) -> vec3f {
  let c = cos(a);
  let s = sin(a);
  return vec3f(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
}

/** Turns `v` by `a.x` about the vertical axis and `a.y` about the horizontal, scaled down: a tilt. */
fn tilt(v: vec3f, a: vec2f) -> vec3f {
  let h = spin(v, -0.4 * a.x);
  let c = cos(0.3 * a.y);
  let s = sin(0.3 * a.y);
  return vec3f(h.x, c * h.y - s * h.z, s * h.y + c * h.z);
}

// Four swells on the surface: direction (xyz) and frequency (w); their amplitude, speed and phase.
const WAVES = array<vec4f, 4>(
  vec4f(0.62, 0.55, 0.56, 4.2),
  vec4f(-0.70, 0.24, 0.67, 6.1),
  vec4f(0.15, -0.88, 0.45, 7.7),
  vec4f(-0.33, -0.41, -0.85, 9.6),
);
const MOTION = array<vec3f, 4>(
  vec3f(0.11, 0.45, 0.0),
  vec3f(0.07, -0.6, 1.7),
  vec3f(0.05, 0.75, 3.1),
  vec3f(0.035, -0.9, 4.4),
);
const LIGHT = vec3f(-0.5, 0.58, 0.64);
const STRIP = vec3f(0.72, -0.5, 0.48);

/** How much of the cell is ink, from 0 (none) to above 1 (solid). `q`: the cell relative to the orb, in radii, y up. */
fn tone(q: vec2f) -> f32 {
  let t = params.time;
  let busy = params.busy;
  let d = length(q);

  // The edge wobbles like a drop, more while something is pending.
  let a = atan2(q.y, q.x);
  let wob = (0.022 * sin(3.0 * a + 0.5 * t) + 0.014 * sin(5.0 * a - 0.37 * t + 1.3) + 0.008 * sin(8.0 * a + 0.8 * t + 0.4)) * (1.0 + 2.0 * busy);
  let r = 1.0 + wob;

  // Funds arrived: a ring of dots runs out from the orb across the screen.
  let wa = params.waveAge;
  let ring = 0.6 * exp(-0.5 * wa) * exp(-pow((d - r - 0.9 * wa) * 4.0, 2.0));

  if (d >= r) {
    // A faint dotted aura just outside the edge.
    return mix(0.6, 1.0, params.dark) * 0.09 * exp(-(d - r) * 8.0) + ring;
  }

  let s = q / r;
  let n = vec3f(s, sqrt(max(1.0 - dot(s, s), 0.0)));
  let turn = 0.05 * t + params.look.z;
  let m = spin(n, turn);

  // The swells' slope on the surface (in the surface's own frame, turning with it).
  var g = vec3f(0.0);
  let warp = 0.9 * sin(dot(m, vec3f(1.3, -0.7, 0.9)) * 2.3 + 0.21 * t);
  for (var i = 0; i < 4; i++) {
    let w = WAVES[i];
    let k = MOTION[i];
    let dir = normalize(w.xyz);
    g += k.x * (1.0 + 0.8 * busy) * w.w * cos(w.w * dot(m, dir) - k.y * (1.0 + busy) * t + k.z + warp) * dir;
  }
  g *= 0.8;

  // Transactions' ripples, each a ring running out from its origin and fading.
  var lift = 0.0;
  for (var i = 0; i < 6; i++) {
    let o = params.ripples[i].xyz;
    let age = params.ripples[i].w;
    if (age > 9.0) {
      continue;
    }
    let theta = acos(clamp(dot(m, o), -1.0, 1.0));
    let off = theta - 0.5 * age;
    let env = exp(-0.45 * age) * exp(-pow(off * 6.0, 2.0)) * smoothstep(0.0, 0.25, age);
    let toward = normalize(o - dot(o, m) * m + vec3f(1e-5));
    g -= toward * env * cos(off * 26.0) * 0.9;
    lift += 0.25 * env;
  }

  // Tilt the normal by the slope (only its part along the surface), back in the view's frame.
  let gv = spin(g, -turn);
  let nn = normalize(n - (gv - dot(gv, n) * n));
  let l = normalize(LIGHT);
  let diff = max(dot(nn, l), 0.0);
  // Chrome: it mirrors a studio (bright above, a horizon line, a dim floor, a softbox at the upper
  // left and a strip light low on the right), over a little of its own shading.
  // The studio turns a little toward the pointer: the reflections slide as it moves.
  let rv = tilt(reflect(vec3f(0.0, 0.0, -1.0), nn), params.look.xy);
  let sky = smoothstep(-0.15, 0.85, rv.y);
  let env = 0.1 + 0.56 * sky * sky + 0.3 * exp(-pow((rv.y + 0.04) * 10.0, 2.0)) + 1.1 * pow(max(dot(rv, l), 0.0), 48.0) + 0.5 * pow(max(dot(rv, STRIP), 0.0), 10.0);
  let rim = pow(1.0 - n.z, 3.0);
  let lit = 0.6 * env + 0.3 * diff * diff + 0.15 * rim;
  // On white the dots are shadow: the light's opposite, the edge drawn in.
  let shade = mix(0.7 * clamp(0.95 - lit, 0.0, 1.0) + 0.25 * rim, lit, params.dark);
  return shade + lift + 0.35 * exp(-2.0 * wa) + ring;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let cell = floor(uv * params.resolution);
  let orb = params.orb;
  let q = (cell + 0.5 - orb.xy) * vec2f(1.0, -1.0) / orb.z;
  let on = step(bayer(vec2u(cell)), tone(q));
  return vec4f(mix(params.bg, params.fg, on * params.ink), 1.0);
}
