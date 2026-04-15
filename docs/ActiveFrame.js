const cacheActiveFrameList = new Map();

Promise.create = function () {
    let resolve = null;
    let reject = null;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });

    promise.resolve = resolve;
    promise.reject = reject;
    return promise;
};

window.ActiveFrame = class ActiveFrame {
    file = null;
    manifest = null;
    data = null;
    decoder = null;
    frame = null;
    desideredFrame = 0;
    enabled = true;
    framesByTimestamp = new Map();
    frameProcessed = null;

    constructor(file, {
        process = () => {},
        // texture = null,
        hardwareAcceleration = 'prefer-hardware'
    }) {
        this.loading = Promise.create();
        this.process = process;
        // this.texture = texture;
        this.hardwareAcceleration = hardwareAcceleration;

        this.file = file;
        this.init();
    }

    async init() {
        cacheActiveFrameList.set(this.file, this.loadBinary(this.file));

        const loading = await cacheActiveFrameList.get(this.file);
        const { manifest, data } = loading;

        this.manifest = manifest;
        this.data = data;

        this.manifest.frames.forEach(frame => {
            // preallocate data view for faster access
            frame.data = new Uint8Array(this.data, frame.o, frame.l);
            this.framesByTimestamp.set(frame.t, frame.i);
        });

        await this.initDecoder();
        this.loading.resolve();
    }

    async loadBinary(file) {
        const res = await fetch(file);
        const fullBuffer = await res.arrayBuffer();

        // Last 4 bytes = LE uint32 offset where JSON starts
        const footer = new DataView(fullBuffer, fullBuffer.byteLength - 4);
        const manifestOffset = footer.getUint32(0, true);

        const manifestBytes = new Uint8Array(fullBuffer, manifestOffset, fullBuffer.byteLength - 4 - manifestOffset);
        const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));

        return {
            manifest,
            data: fullBuffer
        };
    }

    decodeDescription(description) {
        const binaryString = atob(description);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }

    async initDecoder() {
        const baseConfig = {
            codec: this.manifest.codec,
            codedWidth: this.manifest.width,
            codedHeight: this.manifest.height,
            colorSpace: {
                primaries: 'bt709',
                transfer: 'bt709',
                matrix: 'bt709',
                fullRange: false
            },
            description: this.decodeDescription(this.manifest.description)
        };

        const candidates = [
            { ...baseConfig, hardwareAcceleration: this.hardwareAcceleration, optimizeForLatency: true },
            { ...baseConfig, hardwareAcceleration: this.hardwareAcceleration },
            { ...baseConfig, optimizeForLatency: true },
            { ...baseConfig }
        ];

        this.config = null;

        for (const candidate of candidates) {
            const support = await VideoDecoder.isConfigSupported(candidate);
            if (support.supported) {
                this.config = candidate;
                break;
            }
        }

        if (!this.config) {
            throw new Error('Decoder not supported');
        }

        this.decoder = new VideoDecoder({
            output: this.outputFrame.bind(this),
            error: (e) => {
                console.log(this.file);
                console.log(this.config);
                console.error('Decoder error:', e);
            }
        });

        // this.decoder.reset();
        this.decoder.configure(this.config);
    }

    async outputFrame(frame) {
        if (!this.enabled) {
            frame.close();
            return;
        };

        const timestampToFrameId = this.framesByTimestamp.get(frame.timestamp);

        if (this.desideredFrame !== timestampToFrameId) {
            frame.close();
            return;
        }

        this.frame = timestampToFrameId;

        if (this.process) {
            await this.process(frame);
        }

        // if (this.texture) {
        //     this.texture.image = frame;
        //     Texture.renderer.manualUpdateDynamic(this.texture);
        // }

        this.frameProcessed = timestampToFrameId;

        frame.close();
    }

    setFrame(desideredFrame) {
        if (!this.manifest) return;
        if (!this.enabled) return;

        desideredFrame = Math.round(Number(desideredFrame));
        const maxFrame = Math.max(0, this.manifest.totalFrames - 1);
        desideredFrame = Math.min(Math.max(desideredFrame, 0), maxFrame);
        this.desideredFrame = desideredFrame;

        if (this.desideredFrame === this.frame) return;
        if (this.desideredFrame === this._pendingFrame) return;

        this._pendingFrame = desideredFrame;

        const frameMeta = this.manifest.frames[this.desideredFrame];

        if (!frameMeta) {
            return;
        }

        const isSequential = this.frame !== null
        && this.desideredFrame === this.frame + 1
        && frameMeta.ty === 'delta';

        if (isSequential) {
            this.decoder.decode(new EncodedVideoChunk({
                type: frameMeta.ty,
                timestamp: frameMeta.t,
                data: frameMeta.data
            }));
            return;
        }


        if (this.decoder.decodeQueueSize > 0) {
            this.decoder.reset();
            this.decoder.configure(this.config);
        }

        if (frameMeta.ty === 'key') {
            this.decoder.decode(new EncodedVideoChunk({
                type: frameMeta.ty,
                timestamp: frameMeta.t,
                data: frameMeta.data
            }));

        } else {
            let keyFrame = null;
            for (let i = this.desideredFrame; i >= 0; i--) {
                const f = this.manifest.frames[i];
                if (f.ty === 'key') {
                    keyFrame = f;
                    break;
                }
            }

            if (!keyFrame || !keyFrame.data) {
                console.error('No key frame found');
                return;
            }

            this.decoder.decode(new EncodedVideoChunk({
                type: keyFrame.ty,
                timestamp: keyFrame.t,
                data: keyFrame.data
            }));

            for (let i = keyFrame.i + 1; i <= this.desideredFrame; i++) {
                const f = this.manifest.frames[i];
                if (f.ty === 'delta') {
                    this.decoder.decode(new EncodedVideoChunk({
                        type: f.ty,
                        timestamp: f.t,
                        data: f.data
                    }));
                } else {
                    break;
                }
            }
        }
    }

    destroy() {
        cacheActiveFrameList.delete(this.file);
        this.stop();
        this.decoder.close();
        this.decoder = null;
        this.data = null;
        this.manifest = null;
        this.file = null;
        // this.texture?.destroy?.();
        // this.texture = null;
        this.process = null;
        this.frameProcessed = null;
        this.enabled = false;
        this.framesByTimestamp.clear();
    }
}