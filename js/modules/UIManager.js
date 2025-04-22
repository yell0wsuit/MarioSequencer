/**
 * UI Manager module for handling all UI-related operations
 */
import { moveDOM, resizeDOM, sliceImage, updateSliderThumbStyle } from "./Utils.js";

/**
 * Draw the horizontal bar for high notes
 * @param {number} gridX - X position in grid
 * @param {number} scroll - Scroll amount
 */
function drawHorizontalBar(gridX, scroll) {
    const width = 24 * window.MAGNIFY;
    window.L2C.fillRect(
        (4 + 32 * gridX - scroll) * window.MAGNIFY,
        (38 + 11 * 8) * window.MAGNIFY + window.HALFCHARSIZE,
        width,
        2 * window.MAGNIFY
    );
}

/**
 * Draw the bar number
 * @param {number} gridX - X position in grid
 * @param {number} barNumber - Number to display
 */
function drawBarNumber(gridX, barNumber) {
    let x = (16 + 32 * gridX) * window.MAGNIFY - 1;
    const y = (40 - 7) * window.MAGNIFY;
    const numberDigits = [];

    while (barNumber > 0) {
        numberDigits.push(barNumber % 10);
        barNumber = Math.floor(barNumber / 10);
    }

    const digitCount = numberDigits.length;
    if (digitCount === 1) x += 2 * window.MAGNIFY;

    while (numberDigits.length > 0) {
        const digit = numberDigits.pop();
        const digitWidth = digit === 4 ? 5 : 4;
        window.L2C.drawImage(window.NUMBERS[digit], x, y, 5 * window.MAGNIFY, 7 * window.MAGNIFY);
        x += digitWidth * window.MAGNIFY;
    }
}

/**
 * Draws the score area
 * @param {number} position - Current position
 * @param {Array} notes - Notes to display
 * @param {number} scroll - Scroll amount
 */
function drawScore(position, notes, scroll) {
    // Clear and set clipping region for the score area
    window.L2C.clearRect(0, 0, window.SCREEN.width, window.SCREEN.height);
    window.L2C.save();
    window.L2C.rect(8 * window.MAGNIFY, 0, (247 - 8 + 1) * window.MAGNIFY, window.SCRHEIGHT * window.MAGNIFY);
    window.L2C.clip();

    // Handle mouse interaction for edit mode
    const mouseRealX = window.mouseX - window.offsetLeft;
    const mouseRealY = window.mouseY - window.offsetTop;
    let gridPosition = toGrid(mouseRealX, mouseRealY);
    let gridX, gridY;

    // Draw horizontal bar for high notes in edit mode
    if (window.gameStatus === 0 && gridPosition !== false) {
        [gridX, gridY] = gridPosition;
        if (gridY >= 11) drawHorizontalBar(gridX, 0);
    }

    // Draw G clef and repeat marks at the beginning
    if (position === 0) {
        // Draw G clef at the start
        const gClefWidth = window.GClef.width;
        const gClefHeight = window.GClef.height;
        window.L2C.drawImage(
            window.GClef,
            0,
            0,
            gClefWidth,
            gClefHeight,
            (9 - scroll) * window.MAGNIFY,
            48 * window.MAGNIFY,
            gClefWidth * window.MAGNIFY,
            gClefHeight * window.MAGNIFY
        );

        // Draw repeat mark if looping is enabled
        if (window.curScore.loop) {
            drawRepeatHead(41 - scroll);
        }
    } else if (position === 1 && window.curScore.loop) {
        drawRepeatHead(9 - scroll);
    }

    // Calculate which beats should be highlighted orange
    const beats = window.curScore.beats;
    // For 4 beats: orange = 2,1,0,3,2,1,0,3,...
    // For 3 beats: orange = 2,1,0,2,1,0,2,1,...
    const orangeBeat = beats === 4 ? 3 - ((position + 1) % 4) : 2 - ((position + 3) % 3);

    // Determine starting bar index based on position
    let barIndex = position < 2 ? 2 - position : 0;

    // Draw each bar in the visible area
    for (; barIndex < 9; barIndex++) {
        const originalX = 16 + 32 * barIndex - scroll;
        const x = originalX * window.MAGNIFY;
        const barNumber = position + barIndex - 2;

        // Draw end mark if this is the last bar
        if (barNumber === window.curScore.end) {
            const endMarkImage = window.curScore.loop ? window.repeatMark[1] : window.endMark;
            window.L2C.drawImage(endMarkImage, x - 7 * window.MAGNIFY, 56 * window.MAGNIFY);
        }

        // Draw vertical bar line
        window.L2C.beginPath();
        window.L2C.setLineDash([window.MAGNIFY, window.MAGNIFY]);
        window.L2C.lineWidth = window.MAGNIFY;

        // Highlight first beat of each measure in orange
        if (barIndex % beats === orangeBeat) {
            if (window.gameStatus === 0) drawBarNumber(barIndex, barNumber / beats + 1);
            window.L2C.strokeStyle = "#F89000"; // Orange
        } else {
            window.L2C.strokeStyle = "#A0C0B0"; // Light green
        }
        window.L2C.moveTo(x, 41 * window.MAGNIFY);
        window.L2C.lineTo(x, 148 * window.MAGNIFY);
        window.L2C.stroke();

        // Skip if no notes in this bar
        const barNotes = notes[barNumber];
        if (barNotes === undefined) continue;

        // Calculate vertical offset for jumping animation
        let noteDelta = 0;
        if (window.gameStatus === 2 && window.mario.marioPosition - 2 === barNumber) {
            // Calculate jump height based on Mario's position
            let noteIndex;
            if (window.mario.marioX === 120) {
                noteIndex =
                    window.mario.marioScroll >= 16 ? window.mario.marioScroll - 16 : window.mario.marioScroll + 16;
            } else {
                noteIndex = window.mario.marioX + 8 - originalX;
            }
            // Jump height table for animation
            const jumpTable = [
                0, 1, 2, 3, 3, 4, 5, 5, 6, 6, 7, 7, 8, 8, 8, 8, 8, 8, 8, 8, 8, 7, 7, 6, 6, 5, 5, 4, 3, 3, 2, 1, 0,
            ];
            noteDelta = jumpTable[Math.round(noteIndex)];
        }

        // Draw all notes in this bar
        let hasHighNote = false;
        for (let noteIndex = 0; noteIndex < barNotes.length; noteIndex++) {
            // Skip tempo markers
            if (typeof barNotes[noteIndex] === "string") continue;

            const soundNumber = barNotes[noteIndex] >> 8;
            const noteScale = barNotes[noteIndex] & 0x0f;

            // Skip drawing note if eraser is hovering over it (blinking effect)
            if (
                window.curChar === 16 &&
                gridPosition !== false &&
                barIndex === gridX &&
                noteScale === gridY &&
                window.eraserTimer.currentFrame === 1
            ) {
                continue;
            }

            // Draw ledger line for high notes
            if (!hasHighNote && noteScale >= 11) {
                hasHighNote = true;
                drawHorizontalBar(barIndex, scroll);
            }

            // Draw the note
            window.L2C.drawImage(
                window.SOUNDS[soundNumber].image,
                x - window.HALFCHARSIZE,
                (40 + noteScale * 8 + noteDelta) * window.MAGNIFY
            );

            // Draw accidentals (sharps/flats)
            const x2 = x - 13 * window.MAGNIFY;
            const y = (44 + noteScale * 8 + noteDelta) * window.MAGNIFY;
            if ((barNotes[noteIndex] & 0x80) !== 0) {
                window.L2C.drawImage(window.Semitones[0], x2, y); // Sharp
            } else if ((barNotes[noteIndex] & 0x40) !== 0) {
                window.L2C.drawImage(window.Semitones[1], x2, y); // Flat
            }
        }
    }

    // Draw cursor rectangle in edit mode
    if (window.gameStatus === 0 && gridPosition !== false) {
        window.L2C.beginPath();
        window.L2C.setLineDash([7 * window.MAGNIFY, 2 * window.MAGNIFY, 7 * window.MAGNIFY, 0]);
        window.L2C.lineWidth = window.MAGNIFY;
        window.L2C.strokeStyle = "#F00";
        const x = (16 + 32 * gridX - 8) * window.MAGNIFY;
        const y = (40 + gridY * 8) * window.MAGNIFY;
        window.L2C.rect(x, y, window.CHARSIZE, window.CHARSIZE);
        window.L2C.stroke();
    }

    window.L2C.restore();
}

/**
 * Draw the repeat head marker
 * @param {number} xPosition - X position to draw at
 */
function drawRepeatHead(xPosition) {
    window.L2C.drawImage(window.repeatMark[0], xPosition * window.MAGNIFY, 56 * window.MAGNIFY);
}

/**
 * Change the cursor to the selected sound
 * @param {number} soundNumber - Index of the sound to use
 */
function changeCursor(soundNumber) {
    window.SCREEN.style.cursor =
        "url(" +
        window.SOUNDS[soundNumber].image.src +
        ")" +
        window.HALFCHARSIZE +
        " " +
        window.HALFCHARSIZE +
        ", auto";
}

/**
 * Draw the current character
 * @param {HTMLImageElement} image - Image to draw
 */
function drawCurChar(image) {
    const x = 4 * window.MAGNIFY;
    const y = 7 * window.MAGNIFY;
    window.L1C.beginPath();
    window.L1C.imageSmoothingEnabled = false;
    window.L1C.clearRect(x, y, window.CHARSIZE, window.CHARSIZE);
    window.L1C.drawImage(image, x, y);
    window.L1C.fillRect(x, y, window.CHARSIZE, window.MAGNIFY);
    window.L1C.fillRect(x, y + window.CHARSIZE - window.MAGNIFY, window.CHARSIZE, window.MAGNIFY);
}

/**
 * Draw the end mark icon
 * @param {HTMLImageElement} image - Image to draw
 */
function drawEndMarkIcon(image) {
    window.L1C.clearRect(4 * window.MAGNIFY, 8 * window.MAGNIFY, 16 * window.MAGNIFY, 14 * window.MAGNIFY);
    window.L1C.drawImage(image, 5 * window.MAGNIFY, 8 * window.MAGNIFY);
}

/**
 * Clear the eraser icon area
 */
function drawEraserIcon() {
    window.L1C.clearRect(4 * window.MAGNIFY, 8 * window.MAGNIFY, 16 * window.MAGNIFY, 14 * window.MAGNIFY);
}

/**
 * Draw bomb animation
 * @param {Object} mySelf - Timer object
 */
function drawBomb(mySelf) {
    const bombX = 9 * window.MAGNIFY;
    const bombY = 202 * window.MAGNIFY;
    window.L1C.drawImage(window.BOMBS[mySelf.currentFrame], bombX, bombY);
    mySelf.currentFrame = mySelf.currentFrame === 0 ? 1 : 0;

    if (window.curSong !== undefined && window.gameStatus === 2) {
        window.curSong.style.backgroundImage = `url(${window.curSong.images[mySelf.currentFrame + 1].src})`;
    }
}

/**
 * Convert screen coordinates to grid coordinates
 * @param {number} mouseRealX - Mouse X position
 * @param {number} mouseRealY - Mouse Y position
 * @returns {Array|boolean} Grid coordinates [x, y] or false if outside grid
 */
function toGrid(mouseRealX, mouseRealY) {
    const gridLeft = (8 + 0) * window.MAGNIFY;
    const gridTop = 41 * window.MAGNIFY;
    const gridRight = (247 - 4) * window.MAGNIFY;
    const gridBottom = (148 - 4) * window.MAGNIFY;

    if (mouseRealX < gridLeft || mouseRealX > gridRight || mouseRealY < gridTop || mouseRealY > gridBottom)
        return false;

    let gridX = Math.floor((mouseRealX - gridLeft) / window.CHARSIZE);
    if (gridX % 2 !== 0) return false; // Not near the bar
    gridX /= 2;
    const gridY = Math.floor((mouseRealY - gridTop) / window.HALFCHARSIZE);

    // Consider G-Clef and repeat head area
    if ((window.curPos === 0 && gridX < 2) || (window.curPos === 1 && gridX === 0)) return false;
    else return [gridX, gridY];
}

/**
 * Resize the screen and UI elements
 */
function resizeScreen() {
    // Update core dimensions
    updateCoreDimensions();

    // Resize canvas and screen elements
    resizeCanvasElements();

    // Resize note and end mark buttons
    resizeNoteButtons();

    // Resize control buttons (play, stop, loop, etc.)
    resizeControlButtons();

    // Resize slider elements
    resizeSliderElements();

    // Resize navigation buttons
    resizeNavigationButtons();

    // Resize beat buttons
    resizeBeatButtons();

    // Resize song buttons
    resizeSongButtons();

    // Resize eraser button
    resizeEraserButton();

    // Resize undo dog button
    resizeUndoDogButton();
}

// Update core dimensions based on magnification
function updateCoreDimensions() {
    window.CHARSIZE = 16 * window.MAGNIFY;
    window.HALFCHARSIZE = Math.floor(window.CHARSIZE / 2);

    // Update console dimensions
    window.CONSOLE.style.width = `${window.ORGWIDTH * window.MAGNIFY}px`;
    window.CONSOLE.style.height = `${window.ORGHEIGHT * window.MAGNIFY}px`;

    // Update offsets for cursor positioning
    window.offsetLeft = window.CONSOLE.offsetLeft;
    window.offsetTop = window.CONSOLE.offsetTop;

    // Update global image resources
    window.BOMBS = sliceImage(window.bombImg, 14, 18);
    window.mario.images = sliceImage(window.marioImg, 16, 22);
    window.Semitones = sliceImage(window.semitoneImg, 5, 12);
    window.NUMBERS = sliceImage(window.numImg, 5, 7);

    // Prepare Repeat marks
    window.repeatMark = sliceImage(window.repeatImg, 13, 62);
    window.endMark = window.repeatMark[2];
}

// Resize canvas elements
function resizeCanvasElements() {
    // Resize and redraw the main canvas
    window.MAT.width = window.ORGWIDTH * window.MAGNIFY;
    window.MAT.height = window.ORGHEIGHT * window.MAGNIFY;
    window.L1C.drawImage(
        window.matImage,
        0,
        0,
        window.matImage.width * window.MAGNIFY,
        window.matImage.height * window.MAGNIFY
    );

    // Resize the screen canvas
    window.SCREEN.width = window.ORGWIDTH * window.MAGNIFY;
    window.SCREEN.height = window.SCRHEIGHT * window.MAGNIFY;
}

// Resize note buttons and end mark button
function resizeNoteButtons() {
    const characterImages = sliceImage(window.charSheet, 16, 16);

    // Resize all buttons
    window.BUTTONS.forEach((button, index) => {
        button.redraw();
        if (index < 15) button.se.image = characterImages[index];
    });

    // Update end mark button
    window.BUTTONS[15].images = sliceImage(window.endImg, 14, 13);
    window.endMarkTimer.images = window.BUTTONS[15].images;

    // Update cursor and character display
    if (window.curChar < 15) {
        changeCursor(window.curChar);
    }

    if (window.curChar === 15) drawEndMarkIcon(window.BUTTONS[15].images[0]);
    else if (window.curChar === 16) drawEraserIcon();
    else drawCurChar(window.SOUNDS[window.curChar].image);
}

// Resize control buttons (play, stop, loop)
function resizeControlButtons() {
    // Resize play button
    window.DOM.playButton.redraw();
    window.DOM.playButton.images = sliceImage(window.playBtnImg, 12, 15);
    const playButtonState = window.DOM.playButton.disabled ? 1 : 0;
    window.DOM.playButton.style.backgroundImage = `url(${window.DOM.playButton.images[playButtonState].src})`;

    // Resize stop button
    window.DOM.stopButton.redraw();
    const stopButtonImages = sliceImage(window.stopBtnImg, 16, 15);
    window.DOM.stopButton.images = [stopButtonImages[0], stopButtonImages[1]];
    window.DOM.stopButton.style.backgroundImage = `url(${window.DOM.stopButton.images[1 - playButtonState].src})`;

    // Resize loop button
    window.DOM.loopButton.redraw();
    window.DOM.loopButton.images = [stopButtonImages[2], stopButtonImages[3]]; // reuse images from stop button
    const loopButtonState = window.curScore.loop ? 1 : 0;
    window.DOM.loopButton.style.backgroundImage = `url(${window.DOM.loopButton.images[loopButtonState].src})`;

    // Resize clear button
    window.DOM.clearButton.redraw();
    window.DOM.clearButton.images = sliceImage(window.clearImg, 34, 16);
    window.DOM.clearButton.style.backgroundImage = `url(${window.DOM.clearButton.images[0].src})`;
}

// Resize slider elements (scroll bar, tempo)
function resizeSliderElements() {
    // Resize scroll bar
    moveDOM(window.DOM.scrollBar, window.DOM.scrollBar.originalX, window.DOM.scrollBar.originalY);
    resizeDOM(window.DOM.scrollBar, window.DOM.scrollBar.originalW, window.DOM.scrollBar.originalH);

    // Update scroll bar thumb style
    updateSliderThumbStyle("#scroll::-webkit-slider-thumb", {
        properties: {
            "-webkit-appearance": "none !important",
            "border-radius": "0px",
            "background-color": "#A870D0",
            "box-shadow": "inset 0 0 0px",
            border: "0px",
        },
        width: 5 * window.MAGNIFY,
        height: 7 * window.MAGNIFY,
    });

    // Resize tempo slider
    moveDOM(window.DOM.tempo, window.DOM.tempo.originalX, window.DOM.tempo.originalY);
    resizeDOM(window.DOM.tempo, window.DOM.tempo.originalW, window.DOM.tempo.originalH);

    // Get thumb image for tempo slider
    const thumbImage = sliceImage(window.thumbImg, 5, 8)[0];
    window.DOM.tempo.image = thumbImage;

    // Update tempo slider thumb style
    updateSliderThumbStyle("#tempo::-webkit-slider-thumb", {
        properties: {
            "-webkit-appearance": "none !important",
            "background-image": `url('${thumbImage.src}')`,
            "background-repeat": "no-repeat",
            "background-size": "100% 100%",
            border: "0px",
        },
        width: 5 * window.MAGNIFY,
        height: 8 * window.MAGNIFY,
    });
}

// Resize navigation buttons
function resizeNavigationButtons() {
    // Resize left and right navigation buttons
    window.DOM.leftButton.redraw();
    window.DOM.rightButton.redraw();
}

// Resize beat buttons
function resizeBeatButtons() {
    // Resize beat buttons
    window.DOM.beats3Button.redraw();
    window.DOM.beats4Button.redraw();

    const beatImages = sliceImage(window.beatImg, 14, 15);

    // Set images for both buttons
    window.DOM.beats3Button.images = [beatImages[0], beatImages[1]];
    window.DOM.beats4Button.images = [beatImages[2], beatImages[3]];

    // Determine state and apply to both buttons
    const is3Beats = window.curScore.beats === 3;
    window.DOM.beats3Button.style.backgroundImage = `url(${window.DOM.beats3Button.images[is3Beats ? 1 : 0].src})`;
    window.DOM.beats4Button.style.backgroundImage = `url(${window.DOM.beats4Button.images[is3Beats ? 0 : 1].src})`;
}

// Resize song buttons
function resizeSongButtons() {
    const songImages = sliceImage(window.songImg, 15, 17);

    // Configure all song buttons
    const songButtonsConfig = [
        { button: window.DOM.songButtons.frog, imageIndices: [0, 1, 2] },
        { button: window.DOM.songButtons.beak, imageIndices: [3, 4, 5] },
        { button: window.DOM.songButtons["1up"], imageIndices: [6, 7, 8] },
    ];

    songButtonsConfig.forEach((config) => {
        const button = config.button;
        button.redraw();
        button.images = config.imageIndices.map((i) => songImages[i]);
        const buttonState = window.curSong === button ? 1 : 0;
        button.style.backgroundImage = `url(${button.images[buttonState].src})`;
    });
}

// Resize eraser button
function resizeEraserButton() {
    const songImages = sliceImage(window.songImg, 15, 17);

    window.DOM.eraserButton.redraw();
    window.DOM.eraserButton.images = [songImages[9], songImages[10], songImages[11]];
    const eraserButtonState = window.curChar === 16 ? 1 : 0;

    if (window.curChar === 16) {
        window.SCREEN.style.cursor = `url(${window.DOM.eraserButton.images[2].src}) 0 0, auto`;
    }

    window.DOM.eraserButton.style.backgroundImage = `url(${window.DOM.eraserButton.images[eraserButtonState].src})`;
}

// Resize undo dog button
function resizeUndoDogButton() {
    window.DOM.undoButton.redraw();
    window.DOM.undoButton.images = sliceImage(window.undoDogImg, 14, 15);
    window.DOM.undoButton.style.backgroundImage = `url(${window.DOM.undoButton.images[0].src})`;
}

export {
    changeCursor,
    drawBomb,
    drawCurChar,
    drawEndMarkIcon,
    drawEraserIcon,
    drawRepeatHead,
    drawScore,
    resizeScreen,
    toGrid,
};
