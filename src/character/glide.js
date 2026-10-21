// Glide (BRIEF §9.3, PLAN.md M7): the Gale's traversal — off a ridge, a jump at speed or an
// Updraft, the robe spread like wings. Pure logic over plain numbers like the surf (testable in
// Node, allocation-free): while engaged the capsule controller takes the whole velocity from it.
//
// Model: a heading, an airspeed and a vertical speed. Sink is least near the best-glide speed
// and grows either side of it (a ratio near 7:1 at best); diving (W) trades height for speed at
// the rate energy demands, flaring (S) sheds speed and then stalls. Steering banks the robe, and
// the bank sets the turn rate (g·tan(bank)/speed: wide when fast, tight when slow), each turn
// costing a little speed. Rising air — the wind up a windward slope, a gust front, an Updraft —
// lifts it (the owner supplies `rise`, m/s, and `lift`, m/s²). Letting go, or touching down,
// hands the velocity back to the controller, so a landing runs on (or surfs on) at speed.

export const glideTuning = {
  best: 13,            // m/s: best-glide airspeed
  minSink: 1.8,        // m/s sink at best speed (≈ 7:1)
  sinkCurve: 0.022,    // m/s of sink per (m/s)² away from best
  stall: 7,            // m/s: slower than this the robe stalls and drops
  stallSink: 7,        // m/s sink when fully stalled
  maxSpeed: 30,        // m/s
  trim: 0.6,           // 1/s: airspeed settles back to best (the sink pays for it)
  drag: 0.0016,        // 1/m (a = drag·(v² − best²)): extra losses above best
  dive: 7,             // m/s² gained diving (throttle +1), paid for in height
  flare: 5,            // m/s² shed flaring (throttle −1)
  noseDown: 3,         // m/s² regained when slow (the robe falls into speed)
  sinkResponse: 2.2,   // 1/s: vertical speed eases to its target (no snaps)
  liftShare: 0.75,     // of an updraft's accel the spread robe takes
  climbMax: 11,        // m/s
  bankMax: 0.62,       // rad
  bankResponse: 3.5,   // 1/s
  turnCost: 0.05,      // fraction of the turn's lateral accel lost as speed
  enterHeight: 1.6,    // m above the ground to open the robe
  enterSpeed: 5.5,     // m/s horizontal, or a fall faster than enterFall, or rising air
  enterFall: 2.5,      // m/s
  enterBoost: 0.8,     // fraction of best the airspeed starts at, at least
  ease: 3,             // 1/s engagement blend (pose, camera, cloth)
};

export class Glide {
  constructor() {
    /** Engaged (the controller takes its velocity from here). */
    this.active = false;
    this.heading = 0.5 - 0.5;   // rad (yaw: 0 = +z, left-handed like the camera)
    this.speed = 0.5 - 0.5;     // m/s horizontal airspeed along the heading
    this.vy = 0.5 - 0.5;        // m/s vertical
    this.bank = 0.5 - 0.5;      // rad, + = banking right
    this.turnRate = 0.5 - 0.5;  // rad/s
    /** 0..1 eased engagement (pose, camera, cloth, streaks). */
    this.blend = 0.5 - 0.5;
    // Inputs (fields, set by the owner each substep / frame).
    this.want = false;          // traversal held
    this.airborne = false;      // not on the ground, not swimming
    this.height = 0.5 - 0.5;    // m above the ground under the body
    this.steer = 0.5 - 0.5;     // −1..1: bank left … right
    this.throttle = 0.5 - 0.5;  // −1 flare … +1 dive
    this.rise = 0.5 - 0.5;      // m/s of rising air here (ridge lift, gust fronts)
    this.lift = 0.5 - 0.5;      // m/s² from updrafts (the Gale's)
    // Outputs: velocity for the controller.
    this.vx = 0.5 - 0.5; this.vz = 0.5 - 0.5;
  }

  /** Engage or let go, from the inputs and the body's velocity and facing. Once per substep, before step(). */
  engage(vx, vy, vz, facing) {
    const T = glideTuning;
    if (!this.active) {
      if (!this.want || !this.airborne || this.height < T.enterHeight) return;
      const hs = Math.sqrt(vx * vx + vz * vz);
      if (hs < T.enterSpeed && vy > -T.enterFall && this.lift <= 0 && this.rise <= 0.5) return;
      this.active = true;
      this.heading = hs > 1 ? Math.atan2(vx, vz) : facing;
      this.speed = Math.max(hs, T.best * T.enterBoost);
      this.vy = vy;
      this.turnRate = 0;
      return;
    }
    if (!this.want || !this.airborne) this.active = false;
  }

  /** One substep of h seconds. Writes vx, vy, vz while active. */
  step(h) {
    const T = glideTuning;
    this.blend += ((this.active ? 1 : 0) - this.blend) * (1 - Math.exp(-h * T.ease));
    if (!this.active) { this.bank += (0 - this.bank) * (1 - Math.exp(-h * T.bankResponse)); return; }
    const th = Math.max(-1, Math.min(1, this.throttle));
    // Airspeed: losses, a dive or a flare, and a stalled robe falling back into speed.
    let a = T.trim * (T.best - this.speed) - T.drag * Math.max(0, this.speed * this.speed - T.best * T.best);
    if (th > 0) a += T.dive * th; else a += T.flare * th;
    if (this.speed < T.stall) a += T.noseDown * (1 - this.speed / T.stall);
    // Bank and turn (a coordinated turn: g·tan(bank)/v), each turn costing a little speed.
    const s = Math.max(this.speed, 5);
    this.bank += (Math.max(-1, Math.min(1, this.steer)) * T.bankMax - this.bank) * (1 - Math.exp(-h * T.bankResponse));
    this.turnRate = 9.81 * Math.tan(this.bank) / s;
    this.heading += this.turnRate * h;
    a -= T.turnCost * Math.abs(this.turnRate * this.speed);
    this.speed = Math.min(T.maxSpeed, Math.max(0, this.speed + a * h));
    // Sink: least at best speed; a dive pays for its speed in height (energy: dh = v·dv/g); a
    // stall drops. Rising air carries it all up; updrafts push on the spread robe.
    const off = this.speed - T.best;
    const stalled = Math.min(1, Math.max(0, (T.stall - this.speed) / (0.4 * T.stall))); // bites fast below stall
    let sink = T.minSink + T.sinkCurve * off * off;
    if (th > 0) sink += this.speed * T.dive * th / 9.81;
    sink += (T.stallSink - sink) * stalled;
    const target = Math.min(T.climbMax, this.rise - sink);
    this.vy += (target - this.vy) * (1 - Math.exp(-h * T.sinkResponse));
    this.vy = Math.min(T.climbMax, this.vy + this.lift * T.liftShare * h);
    this.vx = Math.sin(this.heading) * this.speed;
    this.vz = Math.cos(this.heading) * this.speed;
  }
}
