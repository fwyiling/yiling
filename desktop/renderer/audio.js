// What your PC is playing, as levels for audio-reactive wallpapers. Captures system audio only
// ("loopback"; Windows), never the microphone. The main process grants this to the wallpaper only.
let ctx = null, analyser = null, data = null, stream = null, starting = null;

export async function startAudio() {
  if (analyser) return true;
  if (starting) return starting;
  starting = (async () => {
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: { width: 1, height: 1, frameRate: 1 } });
      stream.getVideoTracks().forEach((t) => t.stop()); // only the sound is needed
      if (!stream.getAudioTracks().length) throw new Error('no system audio');
      ctx = new AudioContext();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.78;
      ctx.createMediaStreamSource(stream).connect(analyser);
      data = new Uint8Array(analyser.frequencyBinCount);
      return true;
    } catch (e) {
      console.warn('audio-reactive wallpaper unavailable:', e.message);
      stopAudio();
      return false;
    } finally { starting = null; }
  })();
  return starting;
}

export function stopAudio() {
  stream?.getTracks().forEach((t) => t.stop());
  ctx?.close().catch(() => {});
  ctx = analyser = data = stream = null;
}

const band = (from, to) => { let s = 0; for (let i = from; i < to; i++) s += data[i]; return s / ((to - from) * 255); };
/** { bass, mid, treble, level } in 0..1, plus the raw spectrum (bins) for visualizers. Silent when off. */
export function levels() {
  if (!analyser) return { bass: 0, mid: 0, treble: 0, level: 0, bins: null };
  analyser.getByteFrequencyData(data);
  const bass = band(1, 10), mid = band(10, 60), treble = band(60, 160);
  return { bass, mid, treble, level: (bass * 2 + mid + treble) / 4, bins: data };
}
