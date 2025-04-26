/**
 * UI Setup module for initializing UI components
 */
import marioSequencer from "../appState.js";

import { EasyTimer } from "./EasyTimer.js";
import { clearEraserButton, clearListener, playListener, stopListener } from "./EventHandlers.js";
import { changeCursor, drawCurChar, drawEndMarkIcon, drawEraserIcon } from "./UIManager.js";
import { isFirefox, makeButton, moveDOM, resizeDOM, sliceImage } from "./Utils.js";

/**
 * Initialize DOM references when document is ready
 */
const initDOM = () => {
    const elements = [
        { key: "scrollBar", id: "scroll" },
        { key: "tempo", id: "tempo" },
        { key: "playButton", id: "play" },
        { key: "stopButton", id: "stop" },
        { key: "loopButton", id: "loop" },
        { key: "beats3Button", id: "3beats" },
        { key: "beats4Button", id: "4beats" },
        { key: "eraserButton", id: "eraser" },
        { key: "undoButton", id: "undo" },
        { key: "leftButton", id: "toLeft" },
        { key: "rightButton", id: "toRight" },
        { key: "clearButton", id: "clear" },
    ];

    elements.forEach(({ key, id }) => {
        marioSequencer.DOM[key] = document.getElementById(id);
    });

    const songButtons = ["frog", "beak", "1up"];
    songButtons.forEach((button) => {
        marioSequencer.DOM.songButtons[button] = document.getElementById(button);
    });
};

/**
 * Setup note buttons
 */
const setupNoteButtons = () => {
    const buttonImages = sliceImage(marioSequencer.charSheet, 16, 16);

    // Create all note buttons at once
    const createNoteButton = (i) => {
        const button = makeButton(24 + 14 * i, 8, 13, 14, "button", `Select note ${i + 1}`);
        button.num = i;
        button.se = marioSequencer.SOUNDS[i];
        button.se.image = buttonImages[i];
        button.addEventListener("click", () => {
            button.se.play(8); // Note F
            marioSequencer.curChar = button.num;
            clearEraserButton();
            changeCursor(button.num);
            drawCurChar(button.se.image);
        });
        marioSequencer.CONSOLE.appendChild(button);
        return button;
    };

    // Create all 15 buttons at once and store them in BUTTONS array
    marioSequencer.BUTTONS.splice(0, 15, ...Array.from({ length: 15 }, (_, i) => createNoteButton(i)));

    // Setup End Mark Button
    const endMarkButton = makeButton(235, 8, 13, 14, "button", "Add end mark");
    endMarkButton.images = sliceImage(marioSequencer.endImg, 14, 13); // Note: Different size from the button

    // Create timer for end mark cursor animation
    marioSequencer.endMarkTimer = new EasyTimer(150, (self) => {
        if (marioSequencer.curChar !== 15) {
            self.switch = false;
            return;
        }
        self.currentFrame ^= 1; // Toggle between 0 and 1
        marioSequencer.SCREEN.style.cursor = `url(${self.images[self.currentFrame].src})${7 * marioSequencer.MAGNIFY} ${
            7 * marioSequencer.MAGNIFY
        }, auto`;
    });

    // Set up timer properties
    marioSequencer.endMarkTimer.images = endMarkButton.images;
    marioSequencer.endMarkTimer.currentFrame = 0;

    // Add click handler
    endMarkButton.addEventListener("click", () => {
        marioSequencer.endMarkTimer.switch = true;
        marioSequencer.curChar = 15;
        // Play musicloopplacer.wav when end mark button is clicked
        marioSequencer.SOUNDS[marioSequencer.SOUND_INDEX.END_MARK_PLACER].play(8);
        clearEraserButton();
        drawEndMarkIcon(endMarkButton.images[0]);
    });

    marioSequencer.CONSOLE.appendChild(endMarkButton);
    marioSequencer.BUTTONS[15] = endMarkButton;

    // Setup Eraser Button
    setupEraserButton();
};

/**
 * Setup eraser button
 */
const setupEraserButton = () => {
    const songImages = sliceImage(marioSequencer.songImg, 15, 17);
    const eraserButton = makeButton(40, 202, 15, 17, "button", "Erase notes");
    eraserButton.id = "eraser";
    eraserButton.images = [songImages[9], songImages[10], songImages[11]]; // In the Song button images
    eraserButton.style.backgroundImage = `url(${eraserButton.images[0].src})`;
    marioSequencer.eraserTimer = new EasyTimer(200, (self) => {
        // If current is not end mark, just return;
        if (marioSequencer.curChar !== 16) {
            self.switch = false;
            return;
        }
        self.currentFrame = self.currentFrame === 0 ? 1 : 0;
    });
    marioSequencer.eraserTimer.currentFrame = 0;
    eraserButton.addEventListener("click", () => {
        marioSequencer.eraserTimer.switch = true;
        marioSequencer.curChar = 16;
        marioSequencer.SOUNDS[17].play(8);
        drawEraserIcon();
        clearSongButtons();
        eraserButton.style.backgroundImage = `url(${eraserButton.images[1].src})`;
        marioSequencer.SCREEN.style.cursor = `url(${eraserButton.images[2].src}) 0 0, auto`;
    });
    marioSequencer.CONSOLE.appendChild(eraserButton);
};

/**
 * Setup control buttons (play, stop, loop, clear)
 */
const setupControlButtons = () => {
    // For inserting pseudo elements' styles
    const style = document.createElement("style");
    document.head.appendChild(style);
    marioSequencer.pseudoSheet = style.sheet;

    // Prepare Play Button (55, 168)
    const playButton = makeButton(55, 168, 12, 15, "button", "Play music");
    playButton.id = "play";
    playButton.images = sliceImage(marioSequencer.playBtnImg, 12, 15);
    playButton.style.backgroundImage = `url(${playButton.images[0].src})`;
    playButton.addEventListener("click", playListener);
    marioSequencer.pseudoSheet.insertRule("#play:focus {outline: none !important;}", 0);
    marioSequencer.CONSOLE.appendChild(playButton);

    // Stop Button
    const stopButton = makeButton(21, 168, 16, 15, "button", "Stop music");
    stopButton.id = "stop";
    stopButton.disabled = true;
    // Slice images once and store for reuse (also used by loop button)
    const stopButtonImages = sliceImage(marioSequencer.stopBtnImg, 16, 15);
    stopButton.images = stopButtonImages.slice(0, 2);
    stopButton.style.backgroundImage = `url(${stopButton.images[1].src})`;
    stopButton.addEventListener("click", stopListener);
    marioSequencer.pseudoSheet.insertRule("#stop:focus {outline: none !important;}", 0);
    marioSequencer.CONSOLE.appendChild(stopButton);

    // Undo Button
    const undoButton = makeButton(216, 203, 14, 15, "button", "Undo last action");
    undoButton.id = "undo";
    undoButton.images = sliceImage(marioSequencer.undoDogImg, 14, 15);
    undoButton.style.backgroundImage = `url(${undoButton.images[0].src})`;
    undoButton.addEventListener("click", () => {
        if (marioSequencer.undoHistory.length === 0) return;

        const lastAction = marioSequencer.undoHistory.pop();

        switch (lastAction.type) {
            case "add": {
                const barNotes = marioSequencer.curScore.notes[lastAction.barNumber];
                const index = barNotes.indexOf(lastAction.note);
                if (index !== -1) barNotes.splice(index, 1);
                break;
            }
            case "delete": {
                const barNotes = marioSequencer.curScore.notes[lastAction.barNumber];
                barNotes.push(lastAction.note);
                break;
            }
            case "endmark":
                marioSequencer.curScore.end = lastAction.oldEnd;
                break;
        }

        marioSequencer.SOUNDS[20].play(8); // Play dogundo sound
        marioSequencer.drawScore(marioSequencer.curPos, marioSequencer.curScore.notes, 0);
        updateUndoButtonState();

        // Add hover effect
        undoButton.style.backgroundImage = `url(${undoButton.images[1].src})`;
        setTimeout(() => {
            undoButton.style.backgroundImage = `url(${undoButton.images[0].src})`;
        }, 150);
    });
    marioSequencer.CONSOLE.appendChild(undoButton);
    marioSequencer.pseudoSheet.insertRule("#undo:focus {outline: none !important;}", 0);

    // Set initial undo button state directly
    undoButton.disabled = marioSequencer.undoHistory.length === 0;
    undoButton.style.cursor = undoButton.disabled ? "not-allowed" : "pointer";

    // Loop Button
    const loopButton = makeButton(85, 168, 16, 15, "button", "Toggle music loop");
    loopButton.id = "loop";
    loopButton.images = [stopButtonImages[2], stopButtonImages[3]]; // made in Stop button (above)
    loopButton.style.backgroundImage = `url(${loopButton.images[0].src})`;
    marioSequencer.curScore.loop = false;
    loopButton.addEventListener("click", () => {
        marioSequencer.curScore.loop = !marioSequencer.curScore.loop;
        const buttonState = marioSequencer.curScore.loop ? 1 : 0;
        loopButton.style.backgroundImage = `url(${loopButton.images[buttonState].src})`;
        marioSequencer.SOUNDS[17].play(8);
    });
    loopButton.reset = () => {
        marioSequencer.curScore.loop = false;
        loopButton.style.backgroundImage = `url(${loopButton.images[0].src})`;
    };
    loopButton.set = () => {
        marioSequencer.curScore.loop = true;
        loopButton.style.backgroundImage = `url(${loopButton.images[1].src})`;
    };
    marioSequencer.pseudoSheet.insertRule("#loop:focus {outline: none !important;}", 0);
    marioSequencer.CONSOLE.appendChild(loopButton);

    // Repeat Button
    marioSequencer.repeatMark = sliceImage(marioSequencer.repeatImg, 13, 62);
    marioSequencer.endMark = marioSequencer.repeatMark[2];

    // Clear Button
    const clearButton = makeButton(200, 176, 34, 16, "button", "Clear all notes");
    clearButton.id = "clear";
    clearButton.images = sliceImage(marioSequencer.clearImg, 34, 16);
    clearButton.style.backgroundImage = `url(${clearButton.images[0].src})`;
    clearButton.addEventListener("click", clearListener);
    marioSequencer.CONSOLE.appendChild(clearButton);
    marioSequencer.pseudoSheet.insertRule("#clear:focus {outline: none !important;}", 0);
};

/**
 * Setup UI controls (sliders, etc.)
 */
const setupUIControls = () => {
    // Scroll Range
    const scrollBar = document.createElement("input");
    scrollBar.id = "scroll";
    scrollBar.type = "range";
    scrollBar.setAttribute("aria-label", "Scroll through music");

    // Set all properties in a single object
    Object.assign(scrollBar, {
        value: 0,
        max: marioSequencer.curMaxBars - 6,
        min: 0,
        step: 1,
        originalX: 191,
        originalY: 159,
        originalW: 50,
        originalH: 7,
    });

    // Set all styles in a single object
    Object.assign(scrollBar.style, {
        cursor: "pointer",
        appearance: "none",
        "border-radius": "0px",
        "background-color": "#F8F8F8",
        "box-shadow": "inset 0 0 0 #000",
        "vertical-align": "middle",
        position: "absolute",
        margin: 0,
    });

    // Position and size the element
    moveDOM(scrollBar, scrollBar.originalX, scrollBar.originalY);
    resizeDOM(scrollBar, scrollBar.originalW, scrollBar.originalH);

    // Add event listener for scrolling in edit mode only
    scrollBar.addEventListener("input", () => {
        if (marioSequencer.gameStatus === 0) {
            marioSequencer.curPos = parseInt(scrollBar.value);
        }
    });

    marioSequencer.CONSOLE.appendChild(scrollBar);

    // Set up scroll bar thumb styling

    marioSequencer.pseudoSheet.insertRule(
        `#scroll::-webkit-slider-thumb {
            appearance: none !important;
            border-radius: 0px;
            background-color: #A870D0;
            box-shadow: inset 0 0 0px;
            border: 0px;
            width: ${5 * marioSequencer.MAGNIFY}px;
            height: ${7 * marioSequencer.MAGNIFY}px;
        }`,
        0
    );

    if (isFirefox) {
        marioSequencer.pseudoSheet.insertRule(
            `#scroll::-moz-range-thumb {
            appearance: none !important;
            border-radius: 0px;
            background-color: #A870D0;
            box-shadow: inset 0 0 0px;
            border: 0px;
            width: ${5 * marioSequencer.MAGNIFY}px;
            height: ${7 * marioSequencer.MAGNIFY}px;
        }`,
            0
        );
    }
    marioSequencer.pseudoSheet.insertRule("#scroll:focus {outline: none !important;}", 0);

    // Prepare range's side buttons for inc/decrements
    const leftButton = makeButton(184, 158, 7, 9, "button", "Scroll left");
    leftButton.id = "toLeft";
    leftButton.addEventListener("click", () => {
        if (marioSequencer.DOM.scrollBar.value > 0) {
            marioSequencer.curPos = --marioSequencer.DOM.scrollBar.value;
        }
    });
    marioSequencer.CONSOLE.appendChild(leftButton);

    const rightButton = makeButton(241, 158, 7, 9, "button", "Scroll right");
    rightButton.id = "toRight";
    rightButton.addEventListener("click", () => {
        if (marioSequencer.DOM.scrollBar.value < marioSequencer.curMaxBars - 6) {
            marioSequencer.curPos = ++marioSequencer.DOM.scrollBar.value;
        }
    });
    marioSequencer.CONSOLE.appendChild(rightButton);

    // Tempo Range
    const tempoSlider = document.createElement("input");
    tempoSlider.id = "tempo";
    tempoSlider.type = "range";
    tempoSlider.setAttribute("aria-label", "Adjust tempo");

    // Set all properties in a single object
    Object.assign(tempoSlider, {
        value: 525,
        max: 1000,
        min: 50,
        step: 1,
        originalX: 116,
        originalY: 172,
        originalW: 40,
        originalH: 8,
    });

    // Set all styles in a single object
    Object.assign(tempoSlider.style, {
        cursor: "pointer",
        appearance: "none",
        "border-radius": "0px",
        "background-color": "rgba(0, 0, 0, 0.0)",
        "box-shadow": "inset 0 0 0 #000",
        "vertical-align": "middle",
        position: "absolute",
        margin: 0,
    });

    // Position and size the element
    moveDOM(tempoSlider, tempoSlider.originalX, tempoSlider.originalY);
    resizeDOM(tempoSlider, tempoSlider.originalW, tempoSlider.originalH);

    // Add event listener
    tempoSlider.addEventListener("input", () => {
        marioSequencer.curScore.tempo = parseInt(tempoSlider.value);
    });

    marioSequencer.CONSOLE.appendChild(tempoSlider);

    const thumbImage = sliceImage(marioSequencer.thumbImg, 5, 8)[0];
    tempoSlider.image = thumbImage;

    // Setup tempo slider thumb styling

    marioSequencer.pseudoSheet.insertRule(
        `#tempo::-webkit-slider-thumb {
            appearance: none !important;
            background-image: url('${thumbImage.src}');
            background-repeat: no-repeat;
            background-size: 100% 100%;
            border: 0px;
            width: ${5 * marioSequencer.MAGNIFY}px;
            height: ${8 * marioSequencer.MAGNIFY}px;
        }`,
        0
    );

    if (isFirefox) {
        marioSequencer.pseudoSheet.insertRule(
            `#tempo::-moz-range-thumb {
            appearance: none !important;
            background-image: url('${thumbImage.src}');
            background-repeat: no-repeat;
            background-size: 100% 100%;
            border: 0px;
            width: ${5 * marioSequencer.MAGNIFY}px;
            height: ${8 * marioSequencer.MAGNIFY}px;
        }`,
            0
        );
    }

    marioSequencer.pseudoSheet.insertRule("#tempo:focus {outline: none !important;}", 0);
};

/**
 * Setup beat buttons
 */
const setupBeatButtons = () => {
    const beatImages = sliceImage(marioSequencer.beatImg, 14, 15);

    // Create 3 beats button
    const beats3Button = makeButton(81, 203, 14, 15, "button", "Set 3 beats per measure");
    beats3Button.id = "3beats";
    beats3Button.beats = 3;
    beats3Button.images = [beatImages[0], beatImages[1]];
    beats3Button.style.backgroundImage = `url(${beats3Button.images[0].src})`;
    beats3Button.disabled = false;
    marioSequencer.CONSOLE.appendChild(beats3Button);

    // Create 4 beats button
    const beats4Button = makeButton(96, 203, 14, 15, "button", "Set 4 beats per measure");
    beats4Button.id = "4beats";
    beats4Button.beats = 4;
    beats4Button.images = [beatImages[2], beatImages[3]];
    beats4Button.style.backgroundImage = `url(${beats4Button.images[1].src})`;
    beats4Button.disabled = true;
    marioSequencer.CONSOLE.appendChild(beats4Button);

    // Setup beat button event handlers
    const updateBeats = (self) => {
        marioSequencer.curScore.beats = self.beats;
    };
    beats3Button.addEventListener(
        "click",
        marioSequencer.makeExclusiveFunction([beats3Button, beats4Button], 0, updateBeats)
    );
    beats4Button.addEventListener(
        "click",
        marioSequencer.makeExclusiveFunction([beats3Button, beats4Button], 1, updateBeats)
    );
};

/**
 * Setup song buttons
 */
const setupSongButtons = () => {
    const songImages = sliceImage(marioSequencer.songImg, 15, 17);
    const songButtons = ["frog", "beak", "1up"].map((id, index) => {
        const button = makeButton(136 + 24 * index, 202, 15, 17, "button", `Load ${id} song`);
        button.id = id;
        button.num = index;
        button.images = songImages.slice(index * 3, index * 3 + 3);
        button.style.backgroundImage = `url(${button.images[0].src})`;
        button.disabled = false;
        marioSequencer.CONSOLE.appendChild(button);
        return button;
    });

    const loadSong = (self) => {
        marioSequencer.curScore = marioSequencer.clone(marioSequencer.EmbeddedSong[self.num]);
        marioSequencer.DOM.tempo.value = marioSequencer.curScore.tempo;

        if (marioSequencer.curScore.loop) {
            marioSequencer.DOM.loopButton.set();
        } else {
            marioSequencer.DOM.loopButton.reset();
        }

        marioSequencer.DOM.scrollBar.max = marioSequencer.curScore.end - 5;
        marioSequencer.DOM.scrollBar.value = 0;
        marioSequencer.curPos = 0;
        marioSequencer.curSong = self;
    };

    // Use the makeExclusiveFunction created in setupBeatButtons
    songButtons[0].addEventListener("click", marioSequencer.makeExclusiveFunction(songButtons, 0, loadSong));
    songButtons[1].addEventListener("click", marioSequencer.makeExclusiveFunction(songButtons, 1, loadSong));
    songButtons[2].addEventListener("click", marioSequencer.makeExclusiveFunction(songButtons, 2, loadSong));
};

/**
 * Update undo button state
 */
const updateUndoButtonState = () => {
    marioSequencer.DOM.undoButton.disabled = marioSequencer.undoHistory.length === 0;
    marioSequencer.DOM.undoButton.style.cursor = marioSequencer.DOM.undoButton.disabled ? "not-allowed" : "pointer";
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

export {
    clearSongButtons,
    initDOM,
    setupBeatButtons,
    setupControlButtons,
    setupEraserButton,
    setupNoteButtons,
    setupSongButtons,
    setupUIControls,
    updateUndoButtonState,
};
