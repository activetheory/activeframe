# ActiveFrame 🖼️ (beta)

![ActiveFrame sample](./docs/assets/sample.gif)
![ActiveFrame sample2](./docs/assets/sample2.gif)

Demo: https://activetheory.github.io/activeframe/  
[More Context](https://x.com/luruke/status/2037511335257223626?s=20)

ActiveFrame is a small pipeline and javascript library for turning a video into a **single binary `.af` file** and decoding it in the browser with the **Web Codec API** — without a `<video>` element and **without third-party dependencies** such as FFmpeg.wasm, Mediabunny, or other JS demuxers/decoders.

The file packs **raw encoded samples** (H.264 / H.265) plus a **JSON manifest**. The runtime loads the buffer, configures the decoder from the manifest, and exposes **frame-accurate** navigation via `setFrame(index)`.

---

## Why use this instead of “regular” video?

- Frame-accurate control and random access
- Feed the frame natively to WebGL/WebGPU and Canvas 2D
- Hardware accelerated**
- Optimized for interactive scrubbing, 3D, image-like control over which frame is shown
- You can keep multiple videos "in sync"
- Predictable loading times, buffering, etc

---

## Why use this instead of “regular” spritesheet?

- Smaller file size, leveraging H.264 / H.265 intra frame compression
- Better memory management


---

## Generating an `.af` file

```bash
node af.js <input video> <output.af> [maxWidth] [h264|h265] [gop] [crf]
```

---

## Roadmap / ideas

- Surface **codec support** before loading (e.g. companion manifest or a tiny probe).
- **Streaming** or partial fetch (range requests), LOD, adaptive quality.
- **Runtime tuning** of hardware vs software decode based on performance.
- **Benchmark suite** to calibrate and fine tune performance and hw support.


---

Demo video is from [Netflix Open Content](https://opencontent.netflix.com/) – Meridian. Under Creative Commons Attribution 4.0 International Public License.
