/**
 * UI Manager module for handling all UI-related operations
 */

import marioSequencer from "../appState.js";

import { isFirefox, moveDOM, resizeDOM, sliceImage, updateSliderThumbStyle } from "./Utils.js";

/**
 * Draw the horizontal bar for high notes
 * @param {number} gridX - X position in grid
 * @param {number} scroll - Scroll amount
 */
const drawHorizontalBar = (gridX, scroll) => {
    const width = 24 * marioSequencer.MAGNIFY;
    marioSequencer.L2C.fillRect(
        (4 + 32 * gridX - scroll) * marioSequencer.MAGNIFY,
        (38 + 11 * 8) * marioSequencer.MAGNIFY + marioSequencer.HALFCHARSIZE,
        width,
        2 * marioSequencer.MAGNIFY
    );
};

/**
 * Draw the bar number
 * @param {number} gridX - X position in grid
 * @param {number} barNumber - Number to display
 */
const drawBarNumber = (gridX, barNumber) => {
    let x = (16 + 32 * gridX) * marioSequencer.MAGNIFY - 1;
    const y = (40 - 7) * marioSequencer.MAGNIFY;
    const numberDigits = [];

    while (barNumber > 0) {
        numberDigits.push(barNumber % 10);
        barNumber = Math.floor(barNumber / 10);
    }

    const digitCount = numberDigits.length;
    if (digitCount === 1) x += 2 * marioSequencer.MAGNIFY;

    while (numberDigits.length > 0) {
        const digit = numberDigits.pop();
        const digitWidth = digit === 4 ? 5 : 4;
        marioSequencer.L2C.drawImage(
            marioSequencer.NUMBERS[digit],
            x,
            y,
            5 * marioSequencer.MAGNIFY,
            7 * marioSequencer.MAGNIFY
        );
        x += digitWidth * marioSequencer.MAGNIFY;
    }
};

/**
 * Draws the score area
 * @param {number} position - Current position
 * @param {Array} notes - Notes to display
 * @param {number} scroll - Scroll amount
 */
const drawScore = (position, notes, scroll) => {
    // Clear and set clipping region for the score area
    marioSequencer.L2C.clearRect(0, 0, marioSequencer.SCREEN.width, marioSequencer.SCREEN.height);
    marioSequencer.L2C.save();
    marioSequencer.L2C.rect(
        8 * marioSequencer.MAGNIFY,
        0,
        (247 - 8 + 1) * marioSequencer.MAGNIFY,
        marioSequencer.SCRHEIGHT * marioSequencer.MAGNIFY
    );
    marioSequencer.L2C.clip();

    // Handle mouse interaction for edit mode
    const mouseRealX = marioSequencer.mouseX - marioSequencer.offsetLeft;
    const mouseRealY = marioSequencer.mouseY - marioSequencer.offsetTop;
    let gridPosition = toGrid(mouseRealX, mouseRealY);
    let gridX, gridY;

    // Draw horizontal bar for high notes in edit mode
    if (marioSequencer.gameStatus === 0 && gridPosition !== false) {
        [gridX, gridY] = gridPosition;
        if (gridY >= 11) drawHorizontalBar(gridX, 0);
    }

    // Draw G clef and repeat marks at the beginning
    if (position === 0) {
        // Draw G clef at the start
        const gClefWidth = marioSequencer.GClef.width;
        const gClefHeight = marioSequencer.GClef.height;
        marioSequencer.L2C.drawImage(
            marioSequencer.GClef,
            0,
            0,
            gClefWidth,
            gClefHeight,
            (9 - scroll) * marioSequencer.MAGNIFY,
            48 * marioSequencer.MAGNIFY,
            gClefWidth * marioSequencer.MAGNIFY,
            gClefHeight * marioSequencer.MAGNIFY
        );

        // Draw repeat mark if looping is enabled
        if (marioSequencer.curScore.loop) {
            drawRepeatHead(41 - scroll);
        }
    } else if (position === 1 && marioSequencer.curScore.loop) {
        drawRepeatHead(9 - scroll);
    }

    // Calculate which beats should be highlighted orange
    const beats = marioSequencer.curScore.beats;
    // For 4 beats: orange = 2,1,0,3,2,1,0,3,...
    // For 3 beats: orange = 2,1,0,2,1,0,2,1,...
    const orangeBeat = beats === 4 ? 3 - ((position + 1) % 4) : 2 - ((position + 3) % 3);

    // Determine starting bar index based on position
    let barIndex = position < 2 ? 2 - position : 0;

    // Draw each bar in the visible area
    for (; barIndex < 9; barIndex++) {
        const originalX = 16 + 32 * barIndex - scroll;
        const x = originalX * marioSequencer.MAGNIFY;
        const barNumber = position + barIndex - 2;

        // Draw end mark if this is the last bar
        if (barNumber === marioSequencer.curScore.end) {
            const endMarkImage = marioSequencer.curScore.loop ? marioSequencer.repeatMark[1] : marioSequencer.endMark;
            marioSequencer.L2C.drawImage(endMarkImage, x - 7 * marioSequencer.MAGNIFY, 56 * marioSequencer.MAGNIFY);
        }

        // Draw vertical bar line
        marioSequencer.L2C.beginPath();
        marioSequencer.L2C.setLineDash([marioSequencer.MAGNIFY, marioSequencer.MAGNIFY]);
        marioSequencer.L2C.lineWidth = marioSequencer.MAGNIFY;

        // Highlight first beat of each measure in orange
        if (barIndex % beats === orangeBeat) {
            if (marioSequencer.gameStatus === 0) drawBarNumber(barIndex, barNumber / beats + 1);
            marioSequencer.L2C.strokeStyle = "#F89000"; // Orange
        } else {
            marioSequencer.L2C.strokeStyle = "#A0C0B0"; // Light green
        }
        marioSequencer.L2C.moveTo(x, 41 * marioSequencer.MAGNIFY);
        marioSequencer.L2C.lineTo(x, 148 * marioSequencer.MAGNIFY);
        marioSequencer.L2C.stroke();

        // Skip if no notes in this bar
        const barNotes = notes[barNumber];
        if (barNotes === undefined) continue;

        // Calculate vertical offset for jumping animation
        let noteDelta = 0;
        if (marioSequencer.gameStatus === 2 && marioSequencer.mario.marioPosition - 2 === barNumber) {
            // Calculate jump height based on Mario's position
            let noteIndex;
            if (marioSequencer.mario.marioX === 120) {
                noteIndex =
                    marioSequencer.mario.marioScroll >= 16
                        ? marioSequencer.mario.marioScroll - 16
                        : marioSequencer.mario.marioScroll + 16;
            } else {
                noteIndex = marioSequencer.mario.marioX + 8 - originalX;
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
                marioSequencer.curChar === 16 &&
                gridPosition !== false &&
                barIndex === gridX &&
                noteScale === gridY &&
                marioSequencer.eraserTimer.currentFrame === 1
            ) {
                continue;
            }

            // Draw ledger line for high notes
            if (!hasHighNote && noteScale >= 11) {
                hasHighNote = true;
                drawHorizontalBar(barIndex, scroll);
            }

            // Draw the note
            marioSequencer.L2C.drawImage(
                marioSequencer.SOUNDS[soundNumber].image,
                x - marioSequencer.HALFCHARSIZE,
                (40 + noteScale * 8 + noteDelta) * marioSequencer.MAGNIFY
            );

            // Draw accidentals (sharps/flats)
            const x2 = x - 13 * marioSequencer.MAGNIFY;
            const y = (44 + noteScale * 8 + noteDelta) * marioSequencer.MAGNIFY;
            if ((barNotes[noteIndex] & 0x80) !== 0) {
                marioSequencer.L2C.drawImage(marioSequencer.Semitones[0], x2, y); // Sharp
            } else if ((barNotes[noteIndex] & 0x40) !== 0) {
                marioSequencer.L2C.drawImage(marioSequencer.Semitones[1], x2, y); // Flat
            }
        }
    }

    // Draw cursor rectangle in edit mode
    if (marioSequencer.gameStatus === 0 && gridPosition !== false) {
        marioSequencer.L2C.beginPath();
        marioSequencer.L2C.setLineDash([
            7 * marioSequencer.MAGNIFY,
            2 * marioSequencer.MAGNIFY,
            7 * marioSequencer.MAGNIFY,
            0,
        ]);
        marioSequencer.L2C.lineWidth = marioSequencer.MAGNIFY;
        marioSequencer.L2C.strokeStyle = "#F00";
        const x = (16 + 32 * gridX - 8) * marioSequencer.MAGNIFY;
        const y = (40 + gridY * 8) * marioSequencer.MAGNIFY;
        marioSequencer.L2C.rect(x, y, marioSequencer.CHARSIZE, marioSequencer.CHARSIZE);
        marioSequencer.L2C.stroke();
    }

    marioSequencer.L2C.restore();
    updateDownloadButtonState();
};

/**
 * Draw the repeat head marker
 * @param {number} xPosition - X position to draw at
 */
const drawRepeatHead = (xPosition) => {
    marioSequencer.L2C.drawImage(
        marioSequencer.repeatMark[0],
        xPosition * marioSequencer.MAGNIFY,
        56 * marioSequencer.MAGNIFY
    );
};

/**
 * Change the cursor to the selected sound
 * @param {number} soundNumber - Index of the sound to use
 */
const changeCursor = (soundNumber) => {
    marioSequencer.SCREEN.style.cursor = `url(${marioSequencer.SOUNDS[soundNumber].image.src})${marioSequencer.HALFCHARSIZE} ${marioSequencer.HALFCHARSIZE}, auto`;
};

/**
 * Draw the current character
 * @param {HTMLImageElement} image - Image to draw
 */
const drawCurChar = (image) => {
    const x = 4 * marioSequencer.MAGNIFY;
    const y = 7 * marioSequencer.MAGNIFY;
    marioSequencer.L1C.beginPath();
    marioSequencer.L1C.imageSmoothingEnabled = false;
    marioSequencer.L1C.clearRect(x, y, marioSequencer.CHARSIZE, marioSequencer.CHARSIZE);
    marioSequencer.L1C.drawImage(image, x, y);
    marioSequencer.L1C.fillRect(x, y, marioSequencer.CHARSIZE, marioSequencer.MAGNIFY);
    marioSequencer.L1C.fillRect(
        x,
        y + marioSequencer.CHARSIZE - marioSequencer.MAGNIFY,
        marioSequencer.CHARSIZE,
        marioSequencer.MAGNIFY
    );
};

/**
 * Draw the end mark icon
 * @param {HTMLImageElement} image - Image to draw
 */
const drawEndMarkIcon = (image) => {
    marioSequencer.L1C.clearRect(
        4 * marioSequencer.MAGNIFY,
        8 * marioSequencer.MAGNIFY,
        16 * marioSequencer.MAGNIFY,
        14 * marioSequencer.MAGNIFY
    );
    marioSequencer.L1C.drawImage(image, 5 * marioSequencer.MAGNIFY, 8 * marioSequencer.MAGNIFY);
};

/**
 * Clear the eraser icon area
 */
const drawEraserIcon = () => {
    marioSequencer.L1C.clearRect(
        4 * marioSequencer.MAGNIFY,
        8 * marioSequencer.MAGNIFY,
        16 * marioSequencer.MAGNIFY,
        14 * marioSequencer.MAGNIFY
    );
};

/**
 * Draw bomb animation
 * @param {Object} mySelf - Timer object
 */
const drawBomb = (mySelf) => {
    const bombX = 9 * marioSequencer.MAGNIFY;
    const bombY = 202 * marioSequencer.MAGNIFY;
    marioSequencer.L1C.drawImage(marioSequencer.BOMBS[mySelf.currentFrame], bombX, bombY);
    mySelf.currentFrame = mySelf.currentFrame === 0 ? 1 : 0;

    if (marioSequencer.curSong !== undefined && marioSequencer.gameStatus === 2) {
        marioSequencer.curSong.style.backgroundImage = `url(${
            marioSequencer.curSong.images[mySelf.currentFrame + 1].src
        })`;
    }
};

/**
 * Convert screen coordinates to grid coordinates
 * @param {number} mouseRealX - Mouse X position
 * @param {number} mouseRealY - Mouse Y position
 * @returns {Array|boolean} Grid coordinates [x, y] or false if outside grid
 */
const toGrid = (mouseRealX, mouseRealY) => {
    const gridLeft = (8 + 0) * marioSequencer.MAGNIFY;
    const gridTop = 41 * marioSequencer.MAGNIFY;
    const gridRight = (247 - 4) * marioSequencer.MAGNIFY;
    const gridBottom = (148 - 4) * marioSequencer.MAGNIFY;

    if (mouseRealX < gridLeft || mouseRealX > gridRight || mouseRealY < gridTop || mouseRealY > gridBottom)
        return false;

    let gridX = Math.floor((mouseRealX - gridLeft) / marioSequencer.CHARSIZE);
    if (gridX % 2 !== 0) return false; // Not near the bar
    gridX /= 2;
    const gridY = Math.floor((mouseRealY - gridTop) / marioSequencer.HALFCHARSIZE);

    // Consider G-Clef and repeat head area
    if ((marioSequencer.curPos === 0 && gridX < 2) || (marioSequencer.curPos === 1 && gridX === 0)) return false;
    else return [gridX, gridY];
};

/**
 * Resize the screen and UI elements
 */
const resizeScreen = () => {
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
};

// Update core dimensions based on magnification
const updateCoreDimensions = () => {
    marioSequencer.CHARSIZE = 16 * marioSequencer.MAGNIFY;
    marioSequencer.HALFCHARSIZE = Math.floor(marioSequencer.CHARSIZE / 2);

    // Update console dimensions
    marioSequencer.CONSOLE.style.width = `${marioSequencer.ORGWIDTH * marioSequencer.MAGNIFY}px`;
    marioSequencer.CONSOLE.style.height = `${marioSequencer.ORGHEIGHT * marioSequencer.MAGNIFY}px`;

    // Update offsets for cursor positioning
    marioSequencer.offsetLeft = marioSequencer.CONSOLE.offsetLeft;
    marioSequencer.offsetTop = marioSequencer.CONSOLE.offsetTop;

    // Update global image resources
    marioSequencer.BOMBS = sliceImage(marioSequencer.bombImg, 14, 18);
    marioSequencer.mario.images = sliceImage(marioSequencer.marioImg, 16, 22);
    marioSequencer.Semitones = sliceImage(marioSequencer.semitoneImg, 5, 12);
    marioSequencer.NUMBERS = sliceImage(marioSequencer.numImg, 5, 7);

    // Prepare Repeat marks
    marioSequencer.repeatMark = sliceImage(marioSequencer.repeatImg, 13, 62);
    marioSequencer.endMark = marioSequencer.repeatMark[2];
};

// Resize canvas elements
const resizeCanvasElements = () => {
    // Resize and redraw the main canvas
    marioSequencer.MAT.width = marioSequencer.ORGWIDTH * marioSequencer.MAGNIFY;
    marioSequencer.MAT.height = marioSequencer.ORGHEIGHT * marioSequencer.MAGNIFY;
    marioSequencer.L1C.drawImage(
        marioSequencer.matImage,
        0,
        0,
        marioSequencer.matImage.width * marioSequencer.MAGNIFY,
        marioSequencer.matImage.height * marioSequencer.MAGNIFY
    );

    // Resize the screen canvas
    marioSequencer.SCREEN.width = marioSequencer.ORGWIDTH * marioSequencer.MAGNIFY;
    marioSequencer.SCREEN.height = marioSequencer.SCRHEIGHT * marioSequencer.MAGNIFY;
};

// Resize note buttons and end mark button
const resizeNoteButtons = () => {
    const characterImages = sliceImage(marioSequencer.charSheet, 16, 16);

    // Resize all buttons
    marioSequencer.BUTTONS.forEach((button, index) => {
        button.redraw();
        if (index < 15) button.se.image = characterImages[index];
    });

    // Update end mark button
    marioSequencer.BUTTONS[15].images = sliceImage(marioSequencer.endImg, 14, 13);
    marioSequencer.endMarkTimer.images = marioSequencer.BUTTONS[15].images;

    // Update cursor and character display
    if (marioSequencer.curChar < 15) {
        changeCursor(marioSequencer.curChar);
    }

    if (marioSequencer.curChar === 15) drawEndMarkIcon(marioSequencer.BUTTONS[15].images[0]);
    else if (marioSequencer.curChar === 16) drawEraserIcon();
    else drawCurChar(marioSequencer.SOUNDS[marioSequencer.curChar].image);
};

// Resize control buttons (play, stop, loop)
const resizeControlButtons = () => {
    // Resize play button
    marioSequencer.DOM.playButton.redraw();
    marioSequencer.DOM.playButton.images = sliceImage(marioSequencer.playBtnImg, 12, 15);
    const playButtonState = marioSequencer.DOM.playButton.disabled ? 1 : 0;
    marioSequencer.DOM.playButton.style.backgroundImage = `url(${marioSequencer.DOM.playButton.images[playButtonState].src})`;

    // Resize stop button
    marioSequencer.DOM.stopButton.redraw();
    const stopButtonImages = sliceImage(marioSequencer.stopBtnImg, 16, 15);
    marioSequencer.DOM.stopButton.images = [stopButtonImages[0], stopButtonImages[1]];
    marioSequencer.DOM.stopButton.style.backgroundImage = `url(${
        marioSequencer.DOM.stopButton.images[1 - playButtonState].src
    })`;

    // Resize loop button
    marioSequencer.DOM.loopButton.redraw();
    marioSequencer.DOM.loopButton.images = [stopButtonImages[2], stopButtonImages[3]]; // reuse images from stop button
    const loopButtonState = marioSequencer.curScore.loop ? 1 : 0;
    marioSequencer.DOM.loopButton.style.backgroundImage = `url(${marioSequencer.DOM.loopButton.images[loopButtonState].src})`;

    // Resize clear button
    marioSequencer.DOM.clearButton.redraw();
    marioSequencer.DOM.clearButton.images = sliceImage(marioSequencer.clearImg, 34, 16);
    marioSequencer.DOM.clearButton.style.backgroundImage = `url(${marioSequencer.DOM.clearButton.images[0].src})`;
};

// Resize slider elements (scroll bar, tempo)
const resizeSliderElements = () => {
    // Resize scroll bar
    moveDOM(
        marioSequencer.DOM.scrollBar,
        marioSequencer.DOM.scrollBar.originalX,
        marioSequencer.DOM.scrollBar.originalY
    );
    resizeDOM(
        marioSequencer.DOM.scrollBar,
        marioSequencer.DOM.scrollBar.originalW,
        marioSequencer.DOM.scrollBar.originalH
    );

    // Update scroll bar thumb style

    updateSliderThumbStyle("#scroll::-webkit-slider-thumb", {
        properties: {
            appearance: "none !important",
            "border-radius": "0px",
            "background-color": "#A870D0",
            "box-shadow": "inset 0 0 0px",
            border: "0px",
        },
        width: 5 * marioSequencer.MAGNIFY,
        height: 7 * marioSequencer.MAGNIFY,
    });

    if (isFirefox) {
        updateSliderThumbStyle("#scroll::-moz-range-thumb", {
            properties: {
                appearance: "none !important",
                "border-radius": "0px",
                "background-color": "#A870D0",
                "box-shadow": "inset 0 0 0px",
                border: "0px",
            },
            width: 5 * marioSequencer.MAGNIFY,
            height: 7 * marioSequencer.MAGNIFY,
        });
    }

    // Resize tempo slider
    moveDOM(marioSequencer.DOM.tempo, marioSequencer.DOM.tempo.originalX, marioSequencer.DOM.tempo.originalY);
    resizeDOM(marioSequencer.DOM.tempo, marioSequencer.DOM.tempo.originalW, marioSequencer.DOM.tempo.originalH);

    // Get thumb image for tempo slider
    const thumbImage = sliceImage(marioSequencer.thumbImg, 5, 8)[0];
    marioSequencer.DOM.tempo.image = thumbImage;

    // Update tempo slider thumb style

    updateSliderThumbStyle("#tempo::-webkit-slider-thumb", {
        properties: {
            appearance: "none !important",
            "background-image": `url('${thumbImage.src}')`,
            "background-repeat": "no-repeat",
            "background-size": "100% 100%",
            border: "0px",
        },
        width: 5 * marioSequencer.MAGNIFY,
        height: 8 * marioSequencer.MAGNIFY,
    });

    if (isFirefox) {
        updateSliderThumbStyle("#tempo::-moz-range-thumb", {
            properties: {
                appearance: "none !important",
                "background-image": `url('${thumbImage.src}')`,
                "background-repeat": "no-repeat",
                "background-size": "100% 100%",
                border: "0px",
            },
            width: 5 * marioSequencer.MAGNIFY,
            height: 8 * marioSequencer.MAGNIFY,
        });
    }
};

// Resize navigation buttons
const resizeNavigationButtons = () => {
    // Resize left and right navigation buttons
    marioSequencer.DOM.leftButton.redraw();
    marioSequencer.DOM.rightButton.redraw();
};

// Resize beat buttons
const resizeBeatButtons = () => {
    // Resize beat buttons
    marioSequencer.DOM.beats3Button.redraw();
    marioSequencer.DOM.beats4Button.redraw();

    const beatImages = sliceImage(marioSequencer.beatImg, 14, 15);

    // Set images for both buttons
    marioSequencer.DOM.beats3Button.images = [beatImages[0], beatImages[1]];
    marioSequencer.DOM.beats4Button.images = [beatImages[2], beatImages[3]];

    // Determine state and apply to both buttons
    const is3Beats = marioSequencer.curScore.beats === 3;
    marioSequencer.DOM.beats3Button.style.backgroundImage = `url(${
        marioSequencer.DOM.beats3Button.images[is3Beats ? 1 : 0].src
    })`;
    marioSequencer.DOM.beats4Button.style.backgroundImage = `url(${
        marioSequencer.DOM.beats4Button.images[is3Beats ? 0 : 1].src
    })`;
};

// Resize song buttons
const resizeSongButtons = () => {
    const songImages = sliceImage(marioSequencer.songImg, 15, 17);

    // Configure all song buttons
    const songButtonsConfig = [
        { button: marioSequencer.DOM.songButtons.frog, imageIndices: [0, 1, 2] },
        { button: marioSequencer.DOM.songButtons.beak, imageIndices: [3, 4, 5] },
        { button: marioSequencer.DOM.songButtons["1up"], imageIndices: [6, 7, 8] },
    ];

    songButtonsConfig.forEach((config) => {
        const button = config.button;
        button.redraw();
        button.images = config.imageIndices.map((i) => songImages[i]);
        const buttonState = marioSequencer.curSong === button ? 1 : 0;
        button.style.backgroundImage = `url(${button.images[buttonState].src})`;
    });
};

// Resize eraser button
const resizeEraserButton = () => {
    const songImages = sliceImage(marioSequencer.songImg, 15, 17);

    marioSequencer.DOM.eraserButton.redraw();
    marioSequencer.DOM.eraserButton.images = [songImages[9], songImages[10], songImages[11]];
    const eraserButtonState = marioSequencer.curChar === 16 ? 1 : 0;

    if (marioSequencer.curChar === 16) {
        marioSequencer.SCREEN.style.cursor = `url(${marioSequencer.DOM.eraserButton.images[2].src}) 0 0, auto`;
    }

    marioSequencer.DOM.eraserButton.style.backgroundImage = `url(${marioSequencer.DOM.eraserButton.images[eraserButtonState].src})`;
};

// Resize undo dog button
const resizeUndoDogButton = () => {
    marioSequencer.DOM.undoButton.redraw();
    marioSequencer.DOM.undoButton.images = sliceImage(marioSequencer.undoDogImg, 14, 15);
    marioSequencer.DOM.undoButton.style.backgroundImage = `url(${marioSequencer.DOM.undoButton.images[0].src})`;
};

// Utility to check if there are any notes (excluding tempo strings)
const hasAnyNotes = () => {
    if (!marioSequencer.curScore.notes || !Array.isArray(marioSequencer.curScore.notes)) return false;
    for (const bar of marioSequencer.curScore.notes) {
        if (Array.isArray(bar)) {
            for (const note of bar) {
                if (typeof note !== "string") {
                    return true;
                }
            }
        }
    }
    return false;
};

const updateDownloadButtonState = () => {
    const btn = document.getElementById("downloadBtn");
    if (!btn) return;
    btn.disabled = !hasAnyNotes();
};

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
    updateDownloadButtonState,
};
