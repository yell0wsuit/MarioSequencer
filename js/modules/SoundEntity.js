/**
 * SoundEntity class for handling sound playback
 */
class SoundEntity {
    constructor(path) {
        this.path = path;
        this.buffer = null;
        this.prevChord = [];
        this.diff = [14, 12, 11, 9, 7, 6, 4, 2, 0, -1, -3, -5, -6];
    }

    play(scale, delay = 0) {
        const source = audioContext.createBufferSource();
        const tmps = scale & 0x0f;
        let semitone = this.diff[tmps];

        if ((scale & 0x80) !== 0) semitone++;
        else if ((scale & 0x40) !== 0) semitone--;

        source.buffer = this.buffer;
        source.playbackRate.value = Math.pow(SEMITONERATIO, semitone);
        source.connect(audioContext.destination);
        source.start(delay);
    }

    playChord(noteList, delay = 0) {
        // Cancel previous chord first
        this.prevChord.forEach((source) => source.stop());
        this.prevChord = [];

        noteList.forEach((note) => {
            // Dynamic tempo change
            if (typeof note === "string") {
                const tempo = note.split("=")[1];
                curScore.tempo = tempo;
                DOM.tempo.value = tempo;
                return;
            }

            const source = audioContext.createBufferSource();
            const scale = note & 0x0f;
            let semitone = this.diff[scale];

            if ((note & 0x80) !== 0) semitone++;
            else if ((note & 0x40) !== 0) semitone--;

            source.buffer = this.buffer;
            source.playbackRate.value = Math.pow(SEMITONERATIO, semitone);
            source.connect(audioContext.destination);
            source.start(delay);
            this.prevChord.push(source);
        });
    }

    async load() {
        try {
            const response = await fetch(this.path);
            const arrayBuffer = await response.arrayBuffer();
            this.buffer = await audioContext.decodeAudioData(arrayBuffer);
            return this.buffer;
        } catch (error) {
            throw new Error(`Failed to load audio: ${this.path} - ${error.message}`);
        }
    }
}

export default SoundEntity;
