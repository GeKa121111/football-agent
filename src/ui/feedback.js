const KEY = "football-agent.sound";
let ctx = null;

export function isSoundOn(storage = globalThis.localStorage) {
  try { return storage.getItem(KEY) === "on"; } catch { return false; }
}

export function playTone(freq = 660, ms = 90) {
  try {
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (AudioContextClass) {
      ctx ??= new AudioContextClass();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.frequency.value = freq;
      gain.gain.value = 0.05;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + ms / 1000);
    }
  } catch {}
  try { globalThis.navigator?.vibrate?.(15); } catch {}
}

export function mountFeedback(doc = document, storage = globalThis.localStorage) {
  const btn = doc.createElement("button");
  btn.type = "button";
  btn.className = "backup-fab sound-fab";

  const label = () => {
    const enabled = isSoundOn(storage);
    btn.textContent = enabled ? "🔊 الصوت: يعمل" : "🔇 الصوت: مغلق";
    btn.setAttribute("aria-pressed", String(enabled));
  };

  btn.addEventListener("click", () => {
    try { storage.setItem(KEY, isSoundOn(storage) ? "off" : "on"); } catch {}
    label();
    if (isSoundOn(storage)) playTone(880, 120);
  });
  label();
  doc.body.append(btn);

  doc.addEventListener("click", (e) => {
    if (!isSoundOn(storage) || btn.contains(e.target)) return;
    if (e.target?.closest?.("button")) playTone(520, 50);
  }, true);
}
