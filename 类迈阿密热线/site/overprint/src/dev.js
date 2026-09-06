// The recording rig. Only the copy served from localhost behaves differently:
// it runs at a third of real time, so a capture sped up 3x plays back as
// something no one could actually do, and it starts on the floor a real run
// ends on rather than making you grind up to it. The published 404 is
// untouched — `on` is false anywhere else.
//
// Overridable from the query string while developing: ?speed=1 plays at normal
// speed, ?floor=1 starts a normal run, ?floor=0 turns the difficulty pin off.
const local = typeof location !== 'undefined'
  && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const num = (k, dflt) => {
  const v = parseFloat(q.get(k));
  return Number.isFinite(v) ? v : dflt;
};

// 204 kills usually land on floor 12, so nothing past it is ever reached in a
// real run: that is the hardest floor the game actually has, and it is the one
// worth filming. Floors keep counting up; the difficulty stops there.
export const REC = {
  on: local,
  speed: local ? num('speed', 1 / 3) : 1,
  floor: local ? Math.max(0, Math.round(num('floor', 12))) : 0,

  // ?shot=N drops you into a run with N kills left instead of 204, so a take
  // opens mid-fight and ends on 200 OK a few seconds later rather than
  // twenty minutes later. 0 is off.
  shot: local ? Math.max(0, Math.round(num('shot', 0))) : 0,

  // A shot run is a re-enactment of the last few minutes of a run, so the clock
  // has to start where that run would be — otherwise the take ends on a time no
  // real run could produce, and the big readout says 00:04 through the whole
  // thing. ?clock=SECONDS to move it.
  clock: local ? Math.max(0, num('clock', 1020)) : 0,

  // Sound has to survive the edit. Footage taken at a third speed gets sped up
  // 3x afterwards, which pitches everything up an octave and a half and turns
  // gunfire into clicks — so in shot mode every sound is synthesised three
  // times as long and a third as high, and the speed-up lands it back where it
  // belongs. It sounds wrong while you record. That is correct.
  stretch: 1,
  // the status-code callout that floats up on 403, 402, 308 and the rest is
  // the one piece of chrome that keeps interrupting a capture — off while
  // recording, back with ?banner=1
  statusBanner: !local || q.get('banner') === '1',
};

if (REC.on && REC.shot) REC.stretch = 1 / REC.speed;

if (REC.on) {
  console.log(`[overprint] recording rig: ${REC.speed.toFixed(2)}x time`
    + (REC.floor ? `, floor ${REC.floor} difficulty` : '')
    + (REC.statusBanner ? '' : ', no status banners')
    + (REC.shot ? `, SHOT MODE: ${REC.shot} kills left, audio pre-stretched ${REC.stretch.toFixed(1)}x` : ''));
}
