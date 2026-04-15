const path = require('path');
const ffmpegPath = require('ffmpeg-static');
const { spawnSync } = require('child_process');
const { tmpdir } = require('os');
const fs = require('fs');
const mp4box = require('mp4box');

(function () {
    // args input file, output file
    const inputFile = process.argv[2];
    const outputFile = process.argv[3];
    const maxWidth = process.argv[4] || 1080;
    const type = process.argv[5] || 'h264'; // h264, h265
    const gop = process.argv[6] || 5;
    const crf = process.argv[7] || 28;

    if (!inputFile || !outputFile) {
        console.error('Usage: node af.js <input file> <output file> <max width> <type> <gop> <crf>');
        process.exit(1);
    }

    const tmpMp4 = path.join(tmpdir(), `${Math.random().toString(36).substring(2, 15)}.mp4`);

    let cv = null;
    let tag = null;

    if (type === 'h264') {
        cv = 'libx264';
        tag = 'avc1';
    } else if (type === 'h265') {
        cv = 'libx265';
        tag = 'hvc1';
    }

    const ffmpeg = spawnSync(ffmpegPath, [
        '-i', inputFile,
        '-c:v', cv,
        '-tag:v', tag,
        '-vf', `scale='min(${maxWidth},iw)':-2`,
        '-crf', crf,
        '-map_metadata', '-1',
        '-refs', '1',
        '-sc_threshold', '0',
        '-level:v', '5.1',
        '-tune', 'fastdecode',
        '-preset', 'slower',
        '-profile:v', 'main',
        '-pix_fmt', 'yuv420p',
        '-g', gop,
        '-bf', '0',
        '-movflags', '+faststart',
        '-an',
        '-y',
        tmpMp4
    ]);

    if (ffmpeg.status !== 0) {
        console.error('Failed to generate video');
        console.error(ffmpeg.stderr.toString());
        process.exit(1);
    }

    const mp4Buffer = new Uint8Array(fs.readFileSync(tmpMp4)).buffer;
    mp4Buffer.fileStart = 0;

    // Remove the actual file
    fs.unlinkSync(tmpMp4);

    const mp4boxfile = mp4box.createFile();

    mp4boxfile.onReady = function (info) {
        const videoTrack = info.videoTracks[0];

        const trak = mp4boxfile.getTrackById(videoTrack.id);
        const sampleEntry = trak.mdia.minf.stbl.stsd.entries[0];
        let descriptionBase64 = null;
        const codecConfigBox = sampleEntry.hvcC || sampleEntry.avcC || sampleEntry.av1C;
        if (codecConfigBox) {
            const stream = new mp4box.DataStream(null, 0, mp4box.DataStream.BIG_ENDIAN);
            codecConfigBox.write(stream);
            // First 8 bytes are the MP4 box header (4 size + 4 type), skip them
            const descriptionBuffer = new Uint8Array(stream.buffer, 8);
            descriptionBase64 = Buffer.from(descriptionBuffer).toString('base64');
        } else {
            console.error('Missing codec configuration box (expected hvcC or avcC)');
            process.exit(1);
        }

        let offset = 0;
        let databuf = new Buffer.alloc(0);
        let jsonbuf = [];
        let frameKey = 0;

        mp4boxfile.onSamples = function (id, user, samples) {
            for (const sample of samples) {
                const chunkData = Buffer.from(sample.data.buffer || sample.data, sample.data.byteOffset || 0, sample.data.byteLength || sample.data.length);
                databuf = Buffer.concat([databuf, chunkData]);
                // fs.writeSync(binFd, chunkData);

                jsonbuf.push({
                    o: offset,
                    l: chunkData.length,
                    t: Math.round((sample.cts / sample.timescale) * 1000000),
                    ty: sample.is_sync ? 'key' : 'delta',
                    i: frameKey
                });

                offset += chunkData.length;
                frameKey += 1;
            }

            let manifest = {
                codec: videoTrack.codec,
                fps: videoTrack.nb_samples / (videoTrack.duration / videoTrack.timescale),
                totalFrames: videoTrack.nb_samples,
                frames: jsonbuf,
                width: videoTrack.width,
                height: videoTrack.height,
                gop,
                type,
                description: descriptionBase64
            };

            // add description to the end of the data buffer
            databuf = Buffer.concat([databuf, Buffer.from(JSON.stringify(manifest))]);

            const footer = Buffer.alloc(4);
            footer.writeUInt32LE(offset, 0);
            databuf = Buffer.concat([databuf, footer]);

            fs.writeFileSync(outputFile, databuf);

            console.log('✅ Video generated successfully!');
        };
        mp4boxfile.setExtractionOptions(videoTrack.id);
        mp4boxfile.start();
    };

    mp4boxfile.onError = function (e) {
        console.error(`Error: ${e}`);
    };

    mp4boxfile.appendBuffer(mp4Buffer);
    mp4boxfile.flush();
})();