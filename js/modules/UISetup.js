/**
 * UI Setup module for initializing UI components
 */
import { EasyTimer } from "./EasyTimer.js";
import { clearEraserButton, clearListener, playListener, stopListener } from "./eventHandlers.js";
import { changeCursor, drawCurChar, drawEndMarkIcon, drawEraserIcon } from "./UIManager.js";
import { makeButton, moveDOM, resizeDOM, sliceImage } from "./Utils.js";

/**
 * Initialize DOM references when document is ready
 */
function initDOM() {
    window.DOM.scrollBar = document.getElementById("scroll");
    window.DOM.tempo = document.getElementById("tempo");
    window.DOM.playButton = document.getElementById("play");
    window.DOM.stopButton = document.getElementById("stop");
    window.DOM.loopButton = document.getElementById("loop");
    window.DOM.beats3Button = document.getElementById("3beats");
    window.DOM.beats4Button = document.getElementById("4beats");
    window.DOM.eraserButton = document.getElementById("eraser");
    window.DOM.undoButton = document.getElementById("undo");
    window.DOM.leftButton = document.getElementById("toLeft");
    window.DOM.rightButton = document.getElementById("toRight");
    window.DOM.clearButton = document.getElementById("clear");
    window.DOM.songButtons.frog = document.getElementById("frog");
    window.DOM.songButtons.beak = document.getElementById("beak");
    window.DOM.songButtons["1up"] = document.getElementById("1up");
}

/**
 * Setup note buttons
 */
function setupNoteButtons() {
    const buttonImages = sliceImage(window.charSheet, 16, 16);

    // Create all note buttons at once
    const createNoteButton = (i) => {
        const button = makeButton(24 + 14 * i, 8, 13, 14, "button", `Select note ${i + 1}`);
        button.num = i;
        button.se = window.SOUNDS[i];
        button.se.image = buttonImages[i];
        button.addEventListener("click", function () {
            this.se.play(8); // Note F
            window.curChar = this.num;
            clearEraserButton();
            changeCursor(this.num);
            drawCurChar(this.se.image);
        });
        window.CONSOLE.appendChild(button);
        return button;
    };

    // Create all 15 buttons at once and store them in BUTTONS array
    window.BUTTONS.splice(0, 15, ...Array.from({ length: 15 }, (_, i) => createNoteButton(i)));

    // Setup End Mark Button
    const endMarkButton = makeButton(235, 8, 13, 14, "button", "Add end mark");
    endMarkButton.images = sliceImage(window.endImg, 14, 13); // Note: Different size from the button

    // Create timer for end mark cursor animation
    window.endMarkTimer = new EasyTimer(150, (self) => {
        if (window.curChar !== 15) {
            self.switch = false;
            return;
        }
        self.currentFrame ^= 1; // Toggle between 0 and 1
        window.SCREEN.style.cursor = `url(${self.images[self.currentFrame].src})${7 * window.MAGNIFY} ${
            7 * window.MAGNIFY
        }, auto`;
    });

    // Set up timer properties
    window.endMarkTimer.images = endMarkButton.images;
    window.endMarkTimer.currentFrame = 0;

    // Add click handler
    endMarkButton.addEventListener("click", function () {
        window.endMarkTimer.switch = true;
        window.curChar = 15;
        window.SOUNDS[15].play(8);
        clearEraserButton();
        drawEndMarkIcon(this.images[0]);
    });

    window.CONSOLE.appendChild(endMarkButton);
    window.BUTTONS[15] = endMarkButton;

    // Setup Eraser Button
    setupEraserButton();
}

/**
 * Setup eraser button
 */
function setupEraserButton() {
    const songImages = sliceImage(window.songImg, 15, 17);
    const eraserButton = makeButton(40, 202, 15, 17, "button", "Erase notes");
    eraserButton.id = "eraser";
    eraserButton.images = [songImages[9], songImages[10], songImages[11]]; // In the Song button images
    eraserButton.style.backgroundImage = "url(" + eraserButton.images[0].src + ")";
    window.eraserTimer = new EasyTimer(200, function (self) {
        // If current is not end mark, just return;
        if (window.curChar !== 16) {
            self.switch = false;
            return;
        }
        self.currentFrame = self.currentFrame === 0 ? 1 : 0;
    });
    window.eraserTimer.currentFrame = 0;
    eraserButton.addEventListener("click", function () {
        window.eraserTimer.switch = true;
        window.curChar = 16;
        window.SOUNDS[17].play(8);
        drawEraserIcon();
        clearSongButtons();
        this.style.backgroundImage = "url(" + this.images[1].src + ")";
        window.SCREEN.style.cursor = "url(" + this.images[2].src + ")" + " 0 0, auto";
    });
    window.CONSOLE.appendChild(eraserButton);
}

/**
 * Setup control buttons (play, stop, loop, clear)
 */
function setupControlButtons() {
    // For inserting pseudo elements' styles
    const style = document.createElement("style");
    document.head.appendChild(style);
    window.pseudoSheet = style.sheet;

    // Prepare Play Button (55, 168)
    const playButton = makeButton(55, 168, 12, 15, "button", "Play music");
    playButton.id = "play";
    playButton.images = sliceImage(window.playBtnImg, 12, 15);
    playButton.style.backgroundImage = `url(${playButton.images[0].src})`;
    playButton.addEventListener("click", playListener);
    window.pseudoSheet.insertRule("#play:focus {outline: none !important;}", 0);
    window.CONSOLE.appendChild(playButton);

    // Stop Button
    const stopButton = makeButton(21, 168, 16, 15, "button", "Stop music");
    stopButton.id = "stop";
    stopButton.disabled = true;
    // Slice images once and store for reuse (also used by loop button)
    const stopButtonImages = sliceImage(window.stopBtnImg, 16, 15);
    stopButton.images = stopButtonImages.slice(0, 2);
    stopButton.style.backgroundImage = `url(${stopButton.images[1].src})`;
    stopButton.addEventListener("click", stopListener);
    window.pseudoSheet.insertRule("#stop:focus {outline: none !important;}", 0);
    window.CONSOLE.appendChild(stopButton);

    // Undo Button
    const undoButton = makeButton(216, 203, 14, 15, "button", "Undo last action");
    undoButton.id = "undo";
    undoButton.images = sliceImage(window.undoDogImg, 14, 15);
    undoButton.style.backgroundImage = `url(${undoButton.images[0].src})`;
    undoButton.addEventListener("click", function () {
        if (window.undoHistory.length === 0) return;

        const lastAction = window.undoHistory.pop();
        const barNotes = lastAction.type !== "endmark" ? window.curScore.notes[lastAction.barNumber] : null;

        switch (lastAction.type) {
            case "add":
                const index = barNotes.indexOf(lastAction.note);
                if (index !== -1) barNotes.splice(index, 1);
                break;
            case "delete":
                barNotes.push(lastAction.note);
                break;
            case "endmark":
                window.curScore.end = lastAction.oldEnd;
                break;
        }

        window.SOUNDS[20].play(8); // Play dogundo sound
        window.drawScore(window.curPos, window.curScore.notes, 0);
        updateUndoButtonState();

        // Add hover effect
        this.style.backgroundImage = `url(${this.images[1].src})`;
        setTimeout(() => {
            this.style.backgroundImage = `url(${this.images[0].src})`;
        }, 150);
    });
    window.CONSOLE.appendChild(undoButton);
    window.pseudoSheet.insertRule("#undo:focus {outline: none !important;}", 0);

    // Set initial undo button state directly
    undoButton.disabled = window.undoHistory.length === 0;
    undoButton.style.cursor = undoButton.disabled ? "not-allowed" : "pointer";

    // Loop Button
    const loopButton = makeButton(85, 168, 16, 15, "button", "Toggle music loop");
    loopButton.id = "loop";
    loopButton.images = [stopButtonImages[2], stopButtonImages[3]]; // made in Stop button (above)
    loopButton.style.backgroundImage = `url(${loopButton.images[0].src})`;
    window.curScore.loop = false;
    loopButton.addEventListener("click", function () {
        window.curScore.loop = !window.curScore.loop;
        const buttonState = window.curScore.loop ? 1 : 0;
        this.style.backgroundImage = `url(${this.images[buttonState].src})`;
        window.SOUNDS[17].play(8);
    });
    loopButton.reset = function () {
        window.curScore.loop = false;
        this.style.backgroundImage = `url(${this.images[0].src})`;
    };
    loopButton.set = function () {
        window.curScore.loop = true;
        this.style.backgroundImage = `url(${this.images[1].src})`;
    };
    window.pseudoSheet.insertRule("#loop:focus {outline: none !important;}", 0);
    window.CONSOLE.appendChild(loopButton);

    // Repeat Button
    window.repeatMark = sliceImage(window.repeatImg, 13, 62);
    window.endMark = window.repeatMark[2];

    // Clear Button
    const clearButton = makeButton(200, 176, 34, 16, "button", "Clear all notes");
    clearButton.id = "clear";
    clearButton.images = sliceImage(window.clearImg, 34, 16);
    clearButton.style.backgroundImage = "url(" + clearButton.images[0].src + ")";
    clearButton.addEventListener("click", clearListener);
    window.CONSOLE.appendChild(clearButton);
    window.pseudoSheet.insertRule("#clear:focus {outline: none !important;}", 0);
}

/**
 * Setup UI controls (sliders, etc.)
 */
function setupUIControls() {
    // Scroll Range
    const scrollBar = document.createElement("input");
    scrollBar.id = "scroll";
    scrollBar.type = "range";
    scrollBar.setAttribute("aria-label", "Scroll through music");

    // Set all properties in a single object
    Object.assign(scrollBar, {
        value: 0,
        max: window.curMaxBars - 6,
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
        "-webkit-appearance": "none",
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
        if (window.gameStatus === 0) {
            window.curPos = parseInt(scrollBar.value);
        }
    });

    window.CONSOLE.appendChild(scrollBar);

    // Set up scroll bar thumb styling
    window.pseudoSheet.insertRule(
        "#scroll::-webkit-slider-thumb {" +
            "-webkit-appearance: none !important;" +
            "border-radius: 0px;" +
            "background-color: #A870D0;" +
            "box-shadow:inset 0 0 0px;" +
            "border: 0px;" +
            "width: " +
            5 * window.MAGNIFY +
            "px;" +
            "height:" +
            7 * window.MAGNIFY +
            "px;}",
        0
    );
    window.pseudoSheet.insertRule("#scroll:focus {outline: none !important;}", 0);

    // Prepare range's side buttons for inc/decrements
    const leftButton = makeButton(184, 158, 7, 9, "button", "Scroll left");
    leftButton.id = "toLeft";
    leftButton.addEventListener("click", function (event) {
        if (window.DOM.scrollBar.value > 0) {
            window.curPos = --window.DOM.scrollBar.value;
        }
    });
    window.CONSOLE.appendChild(leftButton);

    const rightButton = makeButton(241, 158, 7, 9, "button", "Scroll right");
    rightButton.id = "toRight";
    rightButton.addEventListener("click", function (event) {
        if (window.DOM.scrollBar.value < window.curMaxBars - 6) {
            window.curPos = ++window.DOM.scrollBar.value;
        }
    });
    window.CONSOLE.appendChild(rightButton);

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
        "-webkit-appearance": "none",
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
    tempoSlider.addEventListener("input", function () {
        window.curScore.tempo = parseInt(this.value);
    });

    window.CONSOLE.appendChild(tempoSlider);

    const thumbImage = sliceImage(window.thumbImg, 5, 8)[0];
    tempoSlider.image = thumbImage;

    // Setup tempo slider thumb styling
    window.pseudoSheet.insertRule(
        "#tempo::-webkit-slider-thumb {" +
            "-webkit-appearance: none !important;" +
            "background-image: url('" +
            thumbImage.src +
            "');" +
            "background-repeat: no-repeat;" +
            "background-size: 100% 100%;" +
            "border: 0px;" +
            "width: " +
            5 * window.MAGNIFY +
            "px;" +
            "height:" +
            8 * window.MAGNIFY +
            "px;}",
        0
    );
    window.pseudoSheet.insertRule("#tempo:focus {outline: none !important;}", 0);
}

/**
 * Setup beat buttons
 */
function setupBeatButtons() {
    const beatImages = sliceImage(window.beatImg, 14, 15);

    // Create 3 beats button
    const beats3Button = makeButton(81, 203, 14, 15, "button", "Set 3 beats per measure");
    beats3Button.id = "3beats";
    beats3Button.beats = 3;
    beats3Button.images = [beatImages[0], beatImages[1]];
    beats3Button.style.backgroundImage = "url(" + beats3Button.images[0].src + ")";
    beats3Button.disabled = false;
    window.CONSOLE.appendChild(beats3Button);

    // Create 4 beats button
    const beats4Button = makeButton(96, 203, 14, 15, "button", "Set 4 beats per measure");
    beats4Button.id = "4beats";
    beats4Button.beats = 4;
    beats4Button.images = [beatImages[2], beatImages[3]];
    beats4Button.style.backgroundImage = "url(" + beats4Button.images[1].src + ")";
    beats4Button.disabled = true;
    window.CONSOLE.appendChild(beats4Button);

    // Setup beat button event handlers
    const updateBeats = function (self) {
        window.curScore.beats = self.beats;
    };
    beats3Button.addEventListener("click", window.makeExclusiveFunction([beats3Button, beats4Button], 0, updateBeats));
    beats4Button.addEventListener("click", window.makeExclusiveFunction([beats3Button, beats4Button], 1, updateBeats));
}

/**
 * Setup song buttons
 */
function setupSongButtons() {
    const songImages = sliceImage(window.songImg, 15, 17);
    const songButtons = ["frog", "beak", "1up"].map(function (id, index) {
        const button = makeButton(136 + 24 * index, 202, 15, 17, "button", `Load ${id} song`);
        button.id = id;
        button.num = index;
        button.images = songImages.slice(index * 3, index * 3 + 3);
        button.style.backgroundImage = "url(" + button.images[0].src + ")";
        button.disabled = false;
        window.CONSOLE.appendChild(button);
        return button;
    });

    const loadSong = function (self) {
        window.curScore = window.clone(window.EmbeddedSong[self.num]);
        window.DOM.tempo.value = window.curScore.tempo;

        if (window.curScore.loop) {
            window.DOM.loopButton.set();
        } else {
            window.DOM.loopButton.reset();
        }

        window.DOM.scrollBar.max = window.curScore.end - 5;
        window.DOM.scrollBar.value = 0;
        window.curPos = 0;
        window.curSong = self;
    };

    // Use the makeExclusiveFunction created in setupBeatButtons
    songButtons[0].addEventListener("click", window.makeExclusiveFunction(songButtons, 0, loadSong));
    songButtons[1].addEventListener("click", window.makeExclusiveFunction(songButtons, 1, loadSong));
    songButtons[2].addEventListener("click", window.makeExclusiveFunction(songButtons, 2, loadSong));
}

/**
 * Update undo button state
 */
function updateUndoButtonState() {
    window.DOM.undoButton.disabled = window.undoHistory.length === 0;
    window.DOM.undoButton.style.cursor = window.DOM.undoButton.disabled ? "not-allowed" : "pointer";
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

export {
    clearSongButtons, initDOM, setupBeatButtons, setupControlButtons, setupEraserButton, setupNoteButtons, setupSongButtons, setupUIControls, updateUndoButtonState
};

