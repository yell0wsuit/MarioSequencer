/**
 * Module for handling user interactions and events
 */
import { toGrid } from "./UIManager.js";
import { readFileAsync } from "./Utils.js";

/**
 * Handle mouse clicks on the score area
 * @param {MouseEvent} event - The mouse event
 */
function mouseClickListener(event) {
    if (window.gameStatus !== 0) return;
    event.preventDefault();

    const mouseRealX = event.clientX - window.offsetLeft;
    const mouseRealY = event.clientY - window.offsetTop;

    const gridPosition = toGrid(mouseRealX, mouseRealY);
    if (gridPosition === false) return;
    const gridX = gridPosition[0];
    let gridY = gridPosition[1];

    // Map logical x to real bar number
    const barNumber = window.curPos + gridX - 2;

    // process End Mark
    if (window.curChar === 15) {
        // Store the old end mark position before changing it
        window.undoHistory.push({
            type: "endmark",
            oldEnd: window.curScore.end,
            newEnd: barNumber,
        });
        window.curScore.end = barNumber;
        updateUndoButtonState();
        return;
    }

    if (barNumber >= window.curScore.end) return;

    const barNotes = window.curScore["notes"][barNumber];
    // Delete
    if (window.curChar === 16 || event.button === 2) {
        // Delete Top of the stack
        for (let i = barNotes.length - 1; i >= 0; i--) {
            if ((barNotes[i] & 0x3f) === gridY) {
                // Store in undo history before deleting
                window.undoHistory.push({
                    type: "delete",
                    barNumber: barNumber,
                    note: barNotes[i],
                });
                barNotes.splice(i, 1);
                window.curScore.notes[barNumber] = barNotes;
                window.SOUNDS[17].play(8);
                updateUndoButtonState();
                break;
            }
        }
        return;
    }

    let note = (window.curChar << 8) | gridY;
    if (barNotes.indexOf(note) !== -1) return;
    //
    // Handle semitone
    if (event.shiftKey) gridY |= 0x80;
    if (event.ctrlKey) gridY |= 0x40;
    window.SOUNDS[window.curChar].play(gridY);
    note = (window.curChar << 8) | gridY;
    // Store in undo history before adding
    window.undoHistory.push({
        type: "add",
        barNumber: barNumber,
        note: note,
    });
    barNotes.push(note);
    window.curScore["notes"][barNumber] = barNotes;
    updateUndoButtonState();
}

/**
 * Handle file drops on the screen
 * @param {DragEvent} e - The drag event
 * @returns {boolean} False to prevent default handling
 */
async function handleFileDrop(e) {
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
}

/**
 * Update undo button state based on history length
 */
function updateUndoButtonState() {
    window.DOM.undoButton.disabled = window.undoHistory.length === 0;
    window.DOM.undoButton.style.cursor = window.DOM.undoButton.disabled ? "not-allowed" : "pointer";
}

/**
 * Add MSQ format to score
 * @param {string} text - MSQ file content
 */
function addMSQ(text) {
    const lines = text.split(/\r\n|\r|\n/);
    const keyword = ["SCORE", "TEMPO", "LOOP", "END", "TIME44"];
    const values = {};
    lines.forEach(function (line, i) {
        if (line === "") return;
        const kv = line.split("=");
        const k = kv[0];
        const v = kv[1];
        if (i < keyword.length && k !== keyword[i]) {
            throw new Error("Line " + i + " must start with '" + keyword[i] + "'");
        }
        this[k] = v;
    }, values);

    const oldEnd = window.curScore.end;
    const s = values.SCORE;
    let i = 0,
        count = window.curScore.end;
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
        window.curScore.notes[count++] = bar;
    }

    window.curScore.end += parseInt(values.END) - 1;
    if (window.curScore.tempo !== values.TEMPO) window.curScore.notes[oldEnd].splice(0, 0, "TEMPO=" + values.TEMPO);
    window.curScore.tempo = values.TEMPO;
    const beats = values.TIME44 === "TRUE" ? 4 : 3;
    window.curScore.beats = beats;

    // Set loop button state
    values.LOOP === "TRUE" ? window.DOM.loopButton.set() : window.DOM.loopButton.reset();
}

/**
 * Add JSON format to score
 * @param {string} text - JSON file content
 */
function addJSON(text) {
    const json = JSON.parse(text);
    for (let i = 0; i < json.end; i++) window.curScore.notes.push(json.notes[i]);

    const notes = window.curScore.notes[window.curScore.end];
    if (window.curScore.tempo !== json.tempo && notes.length !== 0) {
        const tempostr = notes[0];
        if (typeof tempostr !== "string") {
            notes.splice(0, 0, "TEMPO=" + json.tempo);
        }
    }
    window.curScore.tempo = json.tempo;

    window.curScore.end += json.end;

    // Update curScore.loop with json.loop value
    window.curScore.loop = json.loop;

    // Use json.loop instead of curScore.loop to determine button state
    if (json.loop) window.DOM.loopButton.set();
    else window.DOM.loopButton.reset();
}

/**
 * Configure score parameters after loading
 */
function closing() {
    // Finally, after reducing, set parameters to Score
    const beatButton = window.DOM[window.curScore.beats === 3 ? "beats3Button" : "beats4Button"];
    const e = new Event("click");
    e.soundOff = true;
    beatButton.dispatchEvent(e);

    window.curMaxBars = window.curScore.end + 1;
    window.DOM.scrollBar.max = window.curMaxBars - 6;
    window.DOM.scrollBar.value = 0;
    window.curPos = 0;

    const tempo = window.curScore.notes[0][0];
    if (typeof tempo === "string" && tempo.slice(0, 5) === "TEMPO") {
        const tempoValue = tempo.split("=")[1];
        window.curScore.tempo = tempoValue;
        window.DOM.tempo.value = tempoValue;
    }
}

/**
 * Setup keyboard event handlers
 */
function setupKeyboardControls() {
    document.addEventListener("keydown", function (event) {
        switch (event.code) {
            case "Space": // space -> play/stop or restart with shift
                if (window.DOM.playButton.disabled === false || event.shiftKey) {
                    playListener.call(window.DOM.playButton, event);
                } else {
                    stopListener.call(window.DOM.stopButton, event);
                }
                event.preventDefault();
                break;

            case "ArrowLeft": // left -> scroll left
                if (window.gameStatus === 0) {
                    // Only allow scrolling in edit mode
                    if (window.DOM.scrollBar.value > 0) window.curPos = --window.DOM.scrollBar.value;
                    event.preventDefault();
                }
                break;

            case "ArrowRight": // right -> scroll right
                if (window.gameStatus === 0) {
                    // Only allow scrolling in edit mode
                    if (window.DOM.scrollBar.value < window.curMaxBars - 6)
                        window.curPos = ++window.DOM.scrollBar.value;
                    event.preventDefault();
                }
                break;

            case "KeyZ": // Ctrl+Z or Command+Z for undo
                if ((event.ctrlKey || event.metaKey) && !event.shiftKey && window.gameStatus === 0) {
                    if (!window.DOM.undoButton.disabled) {
                        window.DOM.undoButton.click();
                        event.preventDefault();
                    }
                }
                break;
        }
    });
}

/**
 * Clear song buttons
 */
function clearSongButtons() {
    // Reset all song button states
    window.DOM.songButtons.frog.disabled = false;
    window.DOM.songButtons.frog.style.backgroundImage = "url(" + window.DOM.songButtons.frog.images[0].src + ")";

    window.DOM.songButtons.beak.disabled = false;
    window.DOM.songButtons.beak.style.backgroundImage = "url(" + window.DOM.songButtons.beak.images[0].src + ")";

    window.DOM.songButtons["1up"].disabled = false;
    window.DOM.songButtons["1up"].style.backgroundImage = "url(" + window.DOM.songButtons["1up"].images[0].src + ")";

    window.curSong = undefined;
}

/**
 * Clear eraser button selection
 */
function clearEraserButton() {
    window.DOM.eraserButton.style.backgroundImage = "url(" + window.DOM.eraserButton.images[0].src + ")";
    window.eraserTimer.switch = false;
}

/**
 * Full initialize score for file loading
 */
function fullInitScore() {
    window.curScore.notes = [];
    window.curMaxBars = 0;
    window.curScore.beats = 4;
    // Loop button itself has a state, so keep current value;
    // curScore.loop = false;
    window.curScore.end = 0;
    window.curScore.tempo = 0;
}

/**
 * Initialize score to defaults
 */
function initScore() {
    const emptyBars = [];
    for (let barIndex = 0; barIndex < window.DEFAULT_MAX_BARS; barIndex++) emptyBars[barIndex] = [];
    window.curScore.notes = emptyBars;
    window.curMaxBars = window.DEFAULT_MAX_BARS;
    window.DOM.scrollBar.max = window.DEFAULT_MAX_BARS - 6;
    window.DOM.scrollBar.value = 0;
    window.curScore.loop = false;
    window.DOM.loopButton.reset();
    window.curScore.end = window.DEFAULT_MAX_BARS - 1;
    window.curScore.tempo = window.DEFAULT_TEMPO;
    window.DOM.tempo.value = window.DEFAULT_TEMPO;
    window.curScore.beats = 4;
    const clickEvent = new Event("click");
    clickEvent.soundOff = true;
    window.DOM.beats4Button.dispatchEvent(clickEvent);
}

/**
 * Play button event handler
 */
function playListener() {
    this.style.backgroundImage = "url(" + this.images[1].src + ")";
    window.SOUNDS[17].play(8);
    window.DOM.stopButton.style.backgroundImage = "url(" + window.DOM.stopButton.images[0].src + ")";
    window.DOM.stopButton.disabled = false;
    this.disabled = true; // Would be unlocked by stop button

    // Disable UI controls during playback
    window.DOM.leftButton.disabled = true;
    window.DOM.rightButton.disabled = true;
    window.DOM.scrollBar.disabled = true;
    window.DOM.clearButton.disabled = true;
    window.DOM.songButtons.frog.disabled = true;
    window.DOM.songButtons.beak.disabled = true;
    window.DOM.songButtons["1up"].disabled = true;

    // Reset scroll position to beginning
    window.DOM.scrollBar.value = 0;
    window.curPos = 0;

    window.gameStatus = 1; // Mario Entering the stage
    window.mario.init();
    window.requestAnimFrame(doMarioEnter);
}

/**
 * Stop button event handler
 */
function stopListener(event) {
    this.style.backgroundImage = "url(" + this.images[1].src + ")";
    // Sound ON: click, OFF: called by doMarioPlay
    if (event !== undefined) window.SOUNDS[17].play(8);
    window.DOM.playButton.style.backgroundImage = "url(" + window.DOM.playButton.images[0].src + ")";
    //DOM.playButton.disabled = false; // Do after Mario left the stage
    this.disabled = true; // Would be unlocked by play button

    window.gameStatus = 3; // Mario leaves from the stage
    window.mario.init4leaving();
    if (window.animationFrameId !== 0) window.cancelAnimationFrame(window.animationFrameId);
    window.requestAnimFrame(doMarioLeave);
}

/**
 * Clear button event handler
 */
function clearListener() {
    this.style.backgroundImage = "url(" + this.images[1].src + ")";
    window.SOUNDS[19].play(8);
    const self = this;
    function makePromise(num) {
        return new Promise(function (resolve) {
            setTimeout(function () {
                self.style.backgroundImage = "url(" + self.images[num].src + ")";
                resolve();
            }, 150);
        });
    }

    makePromise(2)
        .then(function () {
            return makePromise(1);
        })
        .then(function () {
            return makePromise(0);
        })
        .then(function () {
            initScore();
            window.curPos = 0;
            window.undoHistory = []; // Clear undo history
            updateUndoButtonState(); // Update undo button state
        });

    clearSongButtons();
}

/**
 * Let Mario run on the stage
 */
function doMarioEnter(timeStamp) {
    window.bombTimer.checkAndFire(timeStamp);
    window.drawScore(0, window.curScore.notes, 0);
    window.mario.enter(timeStamp);

    if (window.mario.marioX < 40) {
        window.animationFrameId = window.requestAnimFrame(doMarioEnter);
    } else {
        window.mario.init4playing(timeStamp);
        window.gameStatus = 2;
        window.animationFrameId = window.requestAnimFrame(doMarioPlay);
    }
}

/**
 * Let Mario play the music
 */
function doMarioPlay(timeStamp) {
    window.bombTimer.checkAndFire(timeStamp);
    window.mario.play(timeStamp);
    if (window.gameStatus === 2) {
        if (window.mario.marioPosition - 2 !== window.curScore.end - 1) {
            window.animationFrameId = window.requestAnimFrame(doMarioPlay);
        } else if (window.curScore.loop) {
            window.curPos = 0;
            window.mario.marioPosition = 1;
            window.mario.marioX = 40;
            window.mario.init4playing(timeStamp);
            window.animationFrameId = window.requestAnimFrame(doMarioPlay);
        } else {
            // Calls stopListener without a event arg
            stopListener.call(window.DOM.stopButton);
        }
    }
}

/**
 * Let Mario leave the stage
 */
function doMarioLeave(timeStamp) {
    window.bombTimer.checkAndFire(timeStamp);
    window.drawScore(window.curPos, window.curScore.notes, window.mario.marioScroll);
    window.mario.leave(timeStamp);

    if (window.mario.marioX < 247) {
        window.requestAnimFrame(doMarioLeave);
    } else {
        window.gameStatus = 0;

        // Re-enable all controls
        window.DOM.leftButton.disabled = false;
        window.DOM.rightButton.disabled = false;
        window.DOM.scrollBar.disabled = false;
        window.DOM.playButton.disabled = false;
        window.DOM.clearButton.disabled = false;
        window.DOM.songButtons.frog.disabled = false;
        window.DOM.songButtons.beak.disabled = false;
        window.DOM.songButtons["1up"].disabled = false;

        window.requestAnimFrame(doAnimation);
    }
}

/**
 * Main animation loop
 */
function doAnimation(time) {
    // Bomb
    window.bombTimer.checkAndFire(time);
    window.eraserTimer.checkAndFire(time);
    window.endMarkTimer.checkAndFire(time);

    window.drawScore(window.curPos, window.curScore["notes"], 0);

    if (window.gameStatus !== 0) return;

    window.requestAnimFrame(doAnimation);
}

/**
 * Process URL parameters if provided
 */
function processUrlParameters() {
    // Exit early if no options are provided
    if (Object.keys(window.OPTS).length === 0) return;

    // Initialize score before loading external data
    if (window.OPTS.url || window.OPTS.S || window.OPTS.SCORE) {
        fullInitScore();
    }

    // Handle URL-based score loading
    if (window.OPTS.url) {
        return fetch(window.OPTS.url)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status}`);
                }
                return response.text();
            })
            .then((data) => {
                // Determine file type by extension and process accordingly
                window.OPTS.url.endsWith(".msq") ? addMSQ(data) : addJSON(data);
                closing();
            })
            .catch((error) => {
                console.error(`Downloading File: ${window.OPTS.url} failed:`, error);
                alert(`Downloading File: ${window.OPTS.url} failed: ${error.message}`);
            });
    }
    // Handle parameter-based score loading
    else if (window.OPTS.S || window.OPTS.SCORE) {
        const score = window.OPTS.SCORE || window.OPTS.S;
        const tempo = window.OPTS.TEMPO || window.OPTS.T;
        const loop = window.OPTS.LOOP || window.OPTS.L;
        const end = window.OPTS.END || window.OPTS.E;
        const beats = window.OPTS.TIME44 || window.OPTS.B;

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
}

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
};
