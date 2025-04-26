/**
 * Module for handling user interactions and events
 */

import marioSequencer from "../appState.js";

import { toGrid } from "./UIManager.js";
import { readFileAsync } from "./Utils.js";

/**
 * Handle mouse clicks on the score area
 * @param {MouseEvent} event - The mouse event
 */
const mouseClickListener = (event) => {
    if (marioSequencer.gameStatus !== 0) return;
    event.preventDefault();

    const mouseRealX = event.clientX - marioSequencer.offsetLeft;
    const mouseRealY = event.clientY - marioSequencer.offsetTop;

    const gridPosition = toGrid(mouseRealX, mouseRealY);
    if (gridPosition === false) return;
    const gridX = gridPosition[0];
    let gridY = gridPosition[1];

    // Map logical x to real bar number
    const barNumber = marioSequencer.curPos + gridX - 2;

    // process End Mark
    if (marioSequencer.curChar === 15) {
        // Store the old end mark position before changing it
        marioSequencer.undoHistory.push({
            type: "endmark",
            oldEnd: marioSequencer.curScore.end,
            newEnd: barNumber,
        });
        marioSequencer.curScore.end = barNumber;
        updateUndoButtonState();
        // Play sound16.wav when placing the end mark on the bar
        marioSequencer.SOUNDS[marioSequencer.SOUND_INDEX.END_MARK_ON_BAR].play(8);
        return;
    }

    if (barNumber >= marioSequencer.curScore.end) return;

    const barNotes = marioSequencer.curScore["notes"][barNumber];
    // Delete
    if (marioSequencer.curChar === 16 || event.button === 2) {
        // Delete Top of the stack
        for (let i = barNotes.length - 1; i >= 0; i--) {
            if ((barNotes[i] & 0x3f) === gridY) {
                // Store in undo history before deleting
                marioSequencer.undoHistory.push({
                    type: "delete",
                    barNumber: barNumber,
                    note: barNotes[i],
                });
                barNotes.splice(i, 1);
                marioSequencer.curScore.notes[barNumber] = barNotes;
                marioSequencer.SOUNDS[17].play(8);
                updateUndoButtonState();
                break;
            }
        }
        return;
    }

    let note = (marioSequencer.curChar << 8) | gridY;
    if (barNotes.indexOf(note) !== -1) return;
    //
    // Handle semitone
    if (event.shiftKey) gridY |= 0x80;
    if (event.ctrlKey || event.metaKey) gridY |= 0x40;

    // Prevent duplicate semitone notes (same base note, any semitone)
    if (barNotes.some((n) => n >> 8 === marioSequencer.curChar && (n & 0x3f) === (gridY & 0x3f))) return;

    marioSequencer.SOUNDS[marioSequencer.curChar].play(gridY);
    note = (marioSequencer.curChar << 8) | gridY;
    // Store in undo history before adding
    marioSequencer.undoHistory.push({
        type: "add",
        barNumber: barNumber,
        note: note,
    });
    barNotes.push(note);
    marioSequencer.curScore["notes"][barNumber] = barNotes;
    updateUndoButtonState();
};

/**
 * Handle file drops on the screen
 * @param {DragEvent} e - The drag event
 * @returns {boolean} False to prevent default handling
 */
const handleFileDrop = async (e) => {
    e.preventDefault();
    clearSongButtons();
    fullInitScore();

    try {
        // Convert FileList to Array and sort files by numeric order
        const files = Array.from(e.dataTransfer.files).sort((a, b) => {
            // Extract numeric parts from filenames (supports decimal numbers like "15.5")
            const getNumericPart = (name) => {
                const match = /\d+\.\d+|\d+/.exec(name);
                return match ? parseFloat(match[0]) : 0;
            };
            return getNumericPart(a.name) - getNumericPart(b.name);
        });

        // Process files sequentially
        for (const file of files) {
            const fileContent = await readFileAsync(file);
            const extension = file.name.slice(-3).toLowerCase();

            if (extension === "msq") {
                addMSQ(fileContent);
            } else {
                addJSON(fileContent);
            }
        }

        closing();
    } catch (err) {
        alert("Loading file failed: " + err.message);
        console.error(err);
    }

    return false;
};

/**
 * Update undo button state based on history length
 */
const updateUndoButtonState = () => {
    marioSequencer.DOM.undoButton.disabled = marioSequencer.undoHistory.length === 0;
    marioSequencer.DOM.undoButton.style.cursor = marioSequencer.DOM.undoButton.disabled ? "not-allowed" : "pointer";
};

/**
 * Add MSQ format to score
 * @param {string} text - MSQ file content
 */
const addMSQ = (text) => {
    const lines = text.split(/\r\n|\r|\n/);
    const keyword = ["SCORE", "TEMPO", "LOOP", "END", "TIME44"];
    const values = {};
    lines.forEach((line, i) => {
        if (line === "") return;
        const kv = line.split("=");
        const k = kv[0];
        const v = kv[1];
        if (i < keyword.length && k !== keyword[i]) {
            throw new Error("Line " + i + " must start with '" + keyword[i] + "'");
        }
        values[k] = v;
    });

    const oldEnd = marioSequencer.curScore.end;
    const s = values.SCORE;
    let i = 0,
        count = marioSequencer.curScore.end;
    // MSQ format is variable length string.
    out: while (i < s.length) {
        const bar = [];
        for (let j = 0; j < 3; j++) {
            if (s[i] === "\r" || s[i] === undefined) break out;
            let scale = parseInt(s[i++], 16);
            if (scale !== 0) {
                scale -= 1;
                const tone = parseInt(s[i++], 16) - 1;
                const note = (tone << 8) | scale;
                bar.push(note);
            }
        }
        marioSequencer.curScore.notes[count++] = bar;
    }

    marioSequencer.curScore.end += parseInt(values.END) - 1;
    if (marioSequencer.curScore.tempo !== values.TEMPO)
        marioSequencer.curScore.notes[oldEnd].splice(0, 0, "TEMPO=" + values.TEMPO);
    marioSequencer.curScore.tempo = values.TEMPO;
    const beats = values.TIME44 === "TRUE" ? 4 : 3;
    marioSequencer.curScore.beats = beats;

    // Set loop button state
    values.LOOP === "TRUE" ? marioSequencer.DOM.loopButton.set() : marioSequencer.DOM.loopButton.reset();
};

/**
 * Add JSON format to score
 * @param {string} text - JSON file content
 */
const addJSON = (text) => {
    const json = JSON.parse(text);
    for (let i = 0; i < json.end; i++) marioSequencer.curScore.notes.push(json.notes[i]);

    const notes = marioSequencer.curScore.notes[marioSequencer.curScore.end];
    if (marioSequencer.curScore.tempo !== json.tempo && notes.length !== 0) {
        const tempostr = notes[0];
        if (typeof tempostr !== "string") {
            notes.splice(0, 0, "TEMPO=" + json.tempo);
        }
    }
    marioSequencer.curScore.tempo = json.tempo;

    marioSequencer.curScore.end += json.end;

    // Update curScore.loop with json.loop value
    marioSequencer.curScore.loop = json.loop;

    // Use json.loop instead of curScore.loop to determine button state
    if (json.loop) marioSequencer.DOM.loopButton.set();
    else marioSequencer.DOM.loopButton.reset();
};

/**
 * Configure score parameters after loading
 */
function closing() {
    // Finally, after reducing, set parameters to Score
    const beatButton = marioSequencer.DOM[marioSequencer.curScore.beats === 3 ? "beats3Button" : "beats4Button"];
    const e = new Event("click");
    e.soundOff = true;
    beatButton.dispatchEvent(e);

    marioSequencer.curMaxBars = marioSequencer.curScore.end + 1;
    marioSequencer.DOM.scrollBar.max = marioSequencer.curMaxBars - 6;
    marioSequencer.DOM.scrollBar.value = 0;
    marioSequencer.curPos = 0;

    const tempo = marioSequencer.curScore.notes[0][0];
    if (typeof tempo === "string" && tempo.slice(0, 5) === "TEMPO") {
        const tempoValue = tempo.split("=")[1];
        marioSequencer.curScore.tempo = tempoValue;
        marioSequencer.DOM.tempo.value = tempoValue;
    }
}

/**
 * Setup keyboard event handlers
 */
const setupKeyboardControls = () => {
    document.addEventListener("keydown", (event) => {
        switch (event.code) {
            case "Space": // space -> play/stop or restart with shift
                if (marioSequencer.DOM.playButton.disabled === false || event.shiftKey) {
                    playListener.call(marioSequencer.DOM.playButton, event);
                } else {
                    stopListener.call(marioSequencer.DOM.stopButton, event);
                }
                event.preventDefault();
                break;

            case "ArrowLeft": // left -> scroll left
                if (marioSequencer.gameStatus === 0) {
                    // Only allow scrolling in edit mode
                    if (marioSequencer.DOM.scrollBar.value > 0)
                        marioSequencer.curPos = --marioSequencer.DOM.scrollBar.value;
                    event.preventDefault();
                }
                break;

            case "ArrowRight": // right -> scroll right
                if (marioSequencer.gameStatus === 0) {
                    // Only allow scrolling in edit mode
                    if (marioSequencer.DOM.scrollBar.value < marioSequencer.curMaxBars - 6)
                        marioSequencer.curPos = ++marioSequencer.DOM.scrollBar.value;
                    event.preventDefault();
                }
                break;

            case "KeyZ": // Ctrl+Z or Command+Z for undo
                if ((event.ctrlKey || event.metaKey) && !event.shiftKey && marioSequencer.gameStatus === 0) {
                    if (!marioSequencer.DOM.undoButton.disabled) {
                        marioSequencer.DOM.undoButton.click();
                        event.preventDefault();
                    }
                }
                break;
        }
    });
};

/**
 * Clear song buttons
 */
const clearSongButtons = () => {
    // Reset all song button states
    marioSequencer.DOM.songButtons.frog.disabled = false;
    marioSequencer.DOM.songButtons.frog.style.backgroundImage = `url(${marioSequencer.DOM.songButtons.frog.images[0].src})`;

    marioSequencer.DOM.songButtons.beak.disabled = false;
    marioSequencer.DOM.songButtons.beak.style.backgroundImage = `url(${marioSequencer.DOM.songButtons.beak.images[0].src})`;

    marioSequencer.DOM.songButtons["1up"].disabled = false;
    marioSequencer.DOM.songButtons[
        "1up"
    ].style.backgroundImage = `url(${marioSequencer.DOM.songButtons["1up"].images[0].src})`;

    marioSequencer.curSong = undefined;
};

/**
 * Clear eraser button selection
 */
const clearEraserButton = () => {
    marioSequencer.DOM.eraserButton.style.backgroundImage = `url(${marioSequencer.DOM.eraserButton.images[0].src})`;
    marioSequencer.eraserTimer.switch = false;
};

/**
 * Full initialize score for file loading
 */
const fullInitScore = () => {
    marioSequencer.curScore.notes = [];
    marioSequencer.curMaxBars = 0;
    marioSequencer.curScore.beats = 4;
    // Loop button itself has a state, so keep current value;
    // curScore.loop = false;
    marioSequencer.curScore.end = 0;
    marioSequencer.curScore.tempo = 0;
};

/**
 * Initialize score to defaults
 */
const initScore = () => {
    const emptyBars = [];
    for (let barIndex = 0; barIndex < marioSequencer.DEFAULT_MAX_BARS; barIndex++) emptyBars[barIndex] = [];
    marioSequencer.curScore.notes = emptyBars;
    marioSequencer.curMaxBars = marioSequencer.DEFAULT_MAX_BARS;
    marioSequencer.DOM.scrollBar.max = marioSequencer.DEFAULT_MAX_BARS - 6;
    marioSequencer.DOM.scrollBar.value = 0;
    marioSequencer.curScore.loop = false;
    marioSequencer.DOM.loopButton.reset();
    marioSequencer.curScore.end = marioSequencer.DEFAULT_MAX_BARS - 1;
    marioSequencer.curScore.tempo = marioSequencer.DEFAULT_TEMPO;
    marioSequencer.DOM.tempo.value = marioSequencer.DEFAULT_TEMPO;
    marioSequencer.curScore.beats = 4;
    const clickEvent = new Event("click");
    clickEvent.soundOff = true;
    marioSequencer.DOM.beats4Button.dispatchEvent(clickEvent);
};

/**
 * Play button event handler
 */
function playListener() {
    this.style.backgroundImage = `url(${this.images[1].src})`;
    marioSequencer.SOUNDS[17].play(8);
    marioSequencer.DOM.stopButton.style.backgroundImage = `url(${marioSequencer.DOM.stopButton.images[0].src})`;
    marioSequencer.DOM.stopButton.disabled = false;
    this.disabled = true; // Would be unlocked by stop button

    // Disable UI controls during playback
    marioSequencer.DOM.leftButton.disabled = true;
    marioSequencer.DOM.rightButton.disabled = true;
    marioSequencer.DOM.scrollBar.disabled = true;
    marioSequencer.DOM.clearButton.disabled = true;
    marioSequencer.DOM.songButtons.frog.disabled = true;
    marioSequencer.DOM.songButtons.beak.disabled = true;
    marioSequencer.DOM.songButtons["1up"].disabled = true;

    // Reset scroll position to beginning
    marioSequencer.DOM.scrollBar.value = 0;
    marioSequencer.curPos = 0;

    marioSequencer.gameStatus = 1; // Mario Entering the stage
    marioSequencer.mario.init();
    requestAnimationFrame(doMarioEnter);
}

/**
 * Stop button event handler
 */
function stopListener(event) {
    this.style.backgroundImage = `url(${this.images[1].src})`;
    // Sound ON: click, OFF: called by doMarioPlay
    if (event !== undefined) marioSequencer.SOUNDS[17].play(8);
    marioSequencer.DOM.playButton.style.backgroundImage = `url(${marioSequencer.DOM.playButton.images[0].src})`;
    //DOM.playButton.disabled = false; // Do after Mario left the stage
    this.disabled = true; // Would be unlocked by play button

    marioSequencer.gameStatus = 3; // Mario leaves from the stage
    marioSequencer.mario.init4leaving();
    if (marioSequencer.animationFrameId !== 0) cancelAnimationFrame(marioSequencer.animationFrameId);
    requestAnimationFrame(doMarioLeave);
}

/**
 * Clear button event handler
 */
function clearListener() {
    this.style.backgroundImage = `url(${this.images[1].src})`;
    marioSequencer.SOUNDS[19].play(8);
    const self = this;
    const makePromise = (num) => {
        return new Promise((resolve) => {
            setTimeout(() => {
                self.style.backgroundImage = `url(${self.images[num].src})`;
                resolve();
            }, 150);
        });
    };

    (async () => {
        await makePromise(2);
        await makePromise(1);
        await makePromise(0);
        initScore();
        marioSequencer.curPos = 0;
        marioSequencer.undoHistory = []; // Clear undo history
        updateUndoButtonState(); // Update undo button state
    })();

    clearSongButtons();
}

/**
 * Let Mario run on the stage
 */
const doMarioEnter = (timeStamp) => {
    marioSequencer.bombTimer.checkAndFire(timeStamp);
    marioSequencer.drawScore(0, marioSequencer.curScore.notes, 0);
    marioSequencer.mario.enter(timeStamp);

    if (marioSequencer.mario.marioX < 40) {
        marioSequencer.animationFrameId = requestAnimationFrame(doMarioEnter);
    } else {
        marioSequencer.mario.init4playing(timeStamp);
        marioSequencer.gameStatus = 2;
        marioSequencer.animationFrameId = requestAnimationFrame(doMarioPlay);
    }
};

/**
 * Let Mario play the music
 */
const doMarioPlay = (timeStamp) => {
    marioSequencer.bombTimer.checkAndFire(timeStamp);
    marioSequencer.mario.play(timeStamp);
    if (marioSequencer.gameStatus === 2) {
        if (marioSequencer.mario.marioPosition - 2 !== marioSequencer.curScore.end - 1) {
            marioSequencer.animationFrameId = requestAnimationFrame(doMarioPlay);
        } else if (marioSequencer.curScore.loop) {
            marioSequencer.curPos = 0;
            marioSequencer.mario.marioPosition = 1;
            marioSequencer.mario.marioX = 40;
            marioSequencer.mario.init4playing(timeStamp);
            marioSequencer.animationFrameId = requestAnimationFrame(doMarioPlay);
        } else {
            // Calls stopListener without a event arg
            stopListener.call(marioSequencer.DOM.stopButton);
        }
    }
};

/**
 * Let Mario leave the stage
 */
const doMarioLeave = (timeStamp) => {
    marioSequencer.bombTimer.checkAndFire(timeStamp);
    marioSequencer.drawScore(marioSequencer.curPos, marioSequencer.curScore.notes, marioSequencer.mario.marioScroll);
    marioSequencer.mario.leave(timeStamp);

    if (marioSequencer.mario.marioX < 247) {
        requestAnimationFrame(doMarioLeave);
    } else {
        marioSequencer.gameStatus = 0;

        // Re-enable all controls
        marioSequencer.DOM.leftButton.disabled = false;
        marioSequencer.DOM.rightButton.disabled = false;
        marioSequencer.DOM.scrollBar.disabled = false;
        marioSequencer.DOM.playButton.disabled = false;
        marioSequencer.DOM.clearButton.disabled = false;
        marioSequencer.DOM.songButtons.frog.disabled = false;
        marioSequencer.DOM.songButtons.beak.disabled = false;
        marioSequencer.DOM.songButtons["1up"].disabled = false;

        requestAnimationFrame(doAnimation);
    }
};

/**
 * Main animation loop
 */
const doAnimation = (time) => {
    // Bomb
    marioSequencer.bombTimer.checkAndFire(time);
    marioSequencer.eraserTimer.checkAndFire(time);
    marioSequencer.endMarkTimer.checkAndFire(time);

    marioSequencer.drawScore(marioSequencer.curPos, marioSequencer.curScore["notes"], 0);

    if (marioSequencer.gameStatus !== 0) return;

    requestAnimationFrame(doAnimation);
};

/**
 * Process URL parameters if provided
 */
// Checking the parameters
const OPTS = Object.fromEntries(
    window.location.search
        .slice(1)
        .split("&")
        .filter((param) => param)
        .map((param) => {
            const [key, value] = param.split("=");
            return [key, value];
        })
);

const processUrlParameters = () => {
    // Exit early if no options are provided
    if (Object.keys(OPTS).length === 0) return;

    // Initialize score before loading external data
    if (OPTS.url || OPTS.S || OPTS.SCORE) {
        fullInitScore();
    }

    // Handle URL-based score loading
    if (OPTS.url) {
        return fetch(OPTS.url)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status}`);
                }
                return response.text();
            })
            .then((data) => {
                // Determine file type by extension and process accordingly
                OPTS.url.endsWith(".msq") ? addMSQ(data) : addJSON(data);
                closing();
            })
            .catch((error) => {
                console.error(`Downloading File: ${OPTS.url} failed:`, error);
                alert(`Downloading File: ${OPTS.url} failed: ${error.message}`);
            });
    }
    // Handle parameter-based score loading
    else if (OPTS.S || OPTS.SCORE) {
        const score = OPTS.SCORE || OPTS.S;
        const tempo = OPTS.TEMPO || OPTS.T;
        const loop = OPTS.LOOP || OPTS.L;
        const end = OPTS.END || OPTS.E;
        const beats = OPTS.TIME44 || OPTS.B;

        if (!tempo || !loop || !end || !beats) {
            throw new Error("Not enough parameters");
        }

        const loopValue = loop.toUpperCase() === "T" || loop.toUpperCase() === "TRUE" ? "TRUE" : "FALSE";
        const beatsValue = beats.toUpperCase() === "T" || beats.toUpperCase() === "TRUE" ? "TRUE" : "FALSE";

        const text = [
            `SCORE=${score}`,
            `TEMPO=${tempo}`,
            `LOOP=${loopValue}`,
            `END=${end}`,
            `TIME44=${beatsValue}`,
        ].join("\n");

        addMSQ(text);
        closing();
    }
};

/**
 * Setup mouse wheel event for scrolling left/right in the score area
 */
const setupMouseWheelScroll = () => {
    if (!marioSequencer.SCREEN) return;
    marioSequencer.SCREEN.addEventListener(
        "wheel",
        (event) => {
            if (marioSequencer.gameStatus !== 0) return;
            event.preventDefault();
            // event.deltaY > 0: scroll right, event.deltaY < 0: scroll left
            if (event.deltaY > 0) {
                if (marioSequencer.DOM.scrollBar.value < marioSequencer.curMaxBars - 6) {
                    marioSequencer.curPos = ++marioSequencer.DOM.scrollBar.value;
                }
            } else if (event.deltaY < 0) {
                if (marioSequencer.DOM.scrollBar.value > 0) {
                    marioSequencer.curPos = --marioSequencer.DOM.scrollBar.value;
                }
            }
        },
        { passive: false }
    );
};

export {
    addJSON,
    addMSQ,
    clearEraserButton,
    clearListener,
    clearSongButtons,
    closing,
    doAnimation,
    doMarioEnter,
    doMarioLeave,
    doMarioPlay,
    fullInitScore,
    handleFileDrop,
    initScore,
    mouseClickListener,
    playListener,
    processUrlParameters,
    setupKeyboardControls,
    stopListener,
    updateUndoButtonState,
    setupMouseWheelScroll,
};
