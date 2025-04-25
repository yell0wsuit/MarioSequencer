/**
 * Mario character class for animation and gameplay
 */

import marioSequencer from "../appState.js";

import { EasyTimer } from "./EasyTimer.js";
import { drawScore } from "./UIManager.js";

class MarioClass {
    constructor() {
        // Initialize Mario's properties
        this.resetProperties();
        this.images = null; // Mario sprite images
        // Animation timer that alternates Mario's walking state
        this.timer = new EasyTimer(100, () => (this.state = this.state === 1 ? 0 : 1));
        this.timer.switch = true; // Keep timer running
    }

    // Reset Mario's properties to initial state
    resetProperties = () => {
        this.marioOffset = this.marioX = -16; // X offset and position in dots
        this.marioScroll = 0; // Scroll amount in dots
        this.marioPosition = 0; // Position in bar number
        this.state = 0; // Animation state
        this.startTime = this.lastTime = 0; // Animation timestamps
        this.isJumping = false; // Whether Mario is jumping
    };

    // Reset Mario to initial state
    init = () => {
        this.resetProperties();
        this.timer.switch = true;
    };

    // Animate Mario entering the stage
    enter = (timeStamp) => {
        if (this.startTime === 0) this.startTime = timeStamp; // Set start time if not set
        const timeDifference = timeStamp - this.startTime;
        this.marioX = Math.min(Math.floor(timeDifference / 5) + this.marioOffset, 40); // Cap position at 40
        this.state = Math.floor(timeDifference / 100) % 2 === 0 ? 1 : 0; // Alternate state
        this.draw();
    };

    // Initialize for leaving the stage
    init4leaving = () => {
        this.marioOffset = this.marioX; // Set offset to current position
        this.startTime = 0;
        this.isJumping = false;
    };

    // Initialize for playing the music
    init4playing = (timeStamp) => {
        this.lastTime = timeStamp;
        this.marioOffset = this.marioX;
        this.marioScroll = 0;
        this.marioPosition = 1;
        this.state = 1;
        this.checkMarioShouldJump();
    };

    // Determine if Mario should jump based on notes at current position
    checkMarioShouldJump = () => {
        const notes = marioSequencer.curScore.notes[this.marioPosition - 1];
        // Jump if there are notes and either there's more than one note or the note isn't a string (tempo)
        this.isJumping = notes && notes.length > 0 && (notes.length > 1 || typeof notes[0] !== "string");
    };

    // Main play animation loop
    play = (timeStamp) => {
        const scheduleAndPlay = (notes, time) => {
            if (time < 0) time = 0;
            if (!notes || notes.length === 0) return;

            const noteDictionary = {};
            notes.forEach((note) => {
                if (typeof note === "string") {
                    const tempo = note.split("=")[1];
                    marioSequencer.curScore.tempo = tempo;
                    marioSequencer.DOM.tempo.value = tempo;
                    return;
                }

                const soundNumber = note >> 8;
                const scale = note & 0xff;
                if (!noteDictionary[soundNumber]) noteDictionary[soundNumber] = [scale];
                else noteDictionary[soundNumber].push(scale);
            });

            Object.entries(noteDictionary).forEach(([soundIndex, scales]) => {
                marioSequencer.SOUNDS[soundIndex].playChord(scales, time / 1000); // Convert ms to seconds
            });
        };

        const tempo = marioSequencer.curScore.tempo;
        let timeDifference = timeStamp - this.lastTime;
        if (timeDifference > 32) timeDifference = 16; // Cap time difference
        this.lastTime = timeStamp;
        const step = (32 * timeDifference * tempo) / 60000; // Calculate movement step based on tempo

        this.timer.checkAndFire(timeStamp);

        const nextBar = 16 + 32 * (this.marioPosition - marioSequencer.curPos + 1) - 8; // Calculate position of next bar

        if (this.marioX < 120) {
            this.marioX += step;
            if (this.marioX >= nextBar) {
                this.marioPosition++;
                scheduleAndPlay(marioSequencer.curScore.notes[this.marioPosition - 2], 0);
                this.checkMarioShouldJump();
            } else if (this.marioX >= 120) {
                this.marioScroll = this.marioX - 120;
                this.marioX = 120;
            }
        } else if (marioSequencer.curPos <= marioSequencer.curScore.end - 6) {
            this.marioX = 120;
            if (this.marioScroll < 16 && this.marioScroll + step > 16) {
                this.marioPosition++;
                this.marioScroll += step;
                scheduleAndPlay(marioSequencer.curScore.notes[this.marioPosition - 2], 0);
                this.checkMarioShouldJump();
            } else {
                this.marioScroll += step;
                if (this.marioScroll > 32) {
                    this.marioScroll -= 32;
                    marioSequencer.curPos++;
                    marioSequencer.DOM.scrollBar.value = marioSequencer.curPos;
                    if (marioSequencer.curPos > marioSequencer.curScore.end - 6) {
                        this.marioX += this.marioScroll;
                        this.marioScroll = 0;
                    }
                }
            }
        } else {
            this.marioX += step;
            if (this.marioX >= nextBar) {
                this.marioPosition++;
                scheduleAndPlay(marioSequencer.curScore.notes[this.marioPosition - 2], 0);
                this.checkMarioShouldJump();
            }
        }
        drawScore(marioSequencer.curPos, marioSequencer.curScore.notes, this.marioScroll);
        this.draw();
    };

    // Calculate jump height based on position in jump arc
    jump = (position) => {
        const jumpHeights = [
            0, 2, 4, 6, 8, 10, 12, 13, 14, 15, 16, 17, 18, 18, 19, 19, 19, 19, 19, 18, 18, 17, 16, 15, 14, 13, 12, 10,
            8, 6, 4, 2, 0,
        ];
        return jumpHeights[Math.round(position) % 32];
    };

    // Draw Mario at current position and state
    draw = () => {
        let verticalPosition = 41 - 22; // Base Y position
        let state = this.state;

        if (this.isJumping) {
            state = 2; // Jumping sprite
            if (this.marioX === 120) {
                if (this.marioScroll !== 16) {
                    verticalPosition -= this.jump(
                        this.marioScroll > 16 ? this.marioScroll - 16 : this.marioScroll + 16
                    );
                }
            } else {
                verticalPosition -= this.jump(Math.round((this.marioX - 8) % 32));
            }
        }

        marioSequencer.L2C.drawImage(
            this.images[state],
            this.marioX * marioSequencer.MAGNIFY,
            verticalPosition * marioSequencer.MAGNIFY
        );
    };

    // Animate Mario leaving the stage
    leave = (timeStamp) => {
        if (this.startTime === 0) this.startTime = timeStamp;

        const diff = timeStamp - this.startTime;
        if (this.marioScroll > 0 && this.marioScroll < 32) {
            this.marioScroll += Math.floor(diff / 4);
            if (this.marioScroll > 32) {
                this.marioX += this.marioScroll - 32;
                this.marioScroll = 0;
                marioSequencer.curPos++;
            }
        } else {
            this.marioX = Math.floor(diff / 4) + this.marioOffset;
        }

        if (Math.floor(diff / 100) % 2 === 0) {
            this.state = 8;
            this.draw();
            marioSequencer.L2C.drawImage(
                marioSequencer.sweatImg,
                0,
                0,
                marioSequencer.sweatImg.width,
                marioSequencer.sweatImg.height,
                (this.marioX - (marioSequencer.sweatImg.width + 1)) * marioSequencer.MAGNIFY,
                (41 - 22) * marioSequencer.MAGNIFY,
                marioSequencer.sweatImg.width * marioSequencer.MAGNIFY,
                marioSequencer.sweatImg.height * marioSequencer.MAGNIFY
            );
        } else {
            this.state = 9;
            this.draw();
        }
    };
}

export default MarioClass;
