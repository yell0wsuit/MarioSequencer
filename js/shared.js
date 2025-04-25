/*
 *  Mario Sequencer Web edition
 *    Programmed by minghai (http://github.com/minghai)
 *    Modified by yell0wsuit (https://github.com/yell0wsuit)
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

// GLOBAL VARIABLES
//   Constants: Full capital letters
//   Variables: CamelCase
const audioContext = window.AudioContext ? new AudioContext() : new webkitAudioContext();
const SEMITONERATIO = Math.pow(2, 1 / 12);
const ORGWIDTH = 256;
const ORGHEIGHT = 224;
const SCRHEIGHT = 152;
// Calculate MAGNIFY to fit within viewport without scrolling
// Use 96% of available space to leave some margin
let MAGNIFY = Math.min(
    Math.floor((window.innerWidth * 0.96) / ORGWIDTH),
    Math.floor((window.innerHeight * 0.96) / ORGHEIGHT)
);
let CHARSIZE = 16 * MAGNIFY;
let HALFCHARSIZE = Math.floor(CHARSIZE / 2);
const BUTTONS = [];
let mouseX = 0;
let mouseY = 0;
const CONSOLE = document.getElementById("console");
// Set initial console position and size
//CONSOLE.style.position = 'absolute';
CONSOLE.style.width = `${ORGWIDTH * MAGNIFY}px`;
CONSOLE.style.height = `${ORGHEIGHT * MAGNIFY}px`;
//CONSOLE.style.left = `${(window.innerWidth - ORGWIDTH * MAGNIFY) / 2}px`;
//CONSOLE.style.top = `${(window.innerHeight - ORGHEIGHT * MAGNIFY) / 2}px`;
let offsetLeft = CONSOLE.offsetLeft;
let offsetTop = CONSOLE.offsetTop;
let curChar = 0;
let curPos = 0;
let curSong = undefined; // For Embedded Songs
let curScore = {};
const DEFAULT_MAX_BARS = 199 * 4 + 1; // 24 bars by default
const DEFAULT_TEMPO = 100;
let curMaxBars = DEFAULT_MAX_BARS;
let mario = null; // Mamma Mia!
let animationFrameId = 0; // ID for cancel animation
let pseudoSheet = null; // CSSRules for manipulating pseudo elements
let repeatMark = null; // For Score
let endMark = null;

// DOM element cache to avoid repeated lookups
let DOM = {
    scrollBar: null,
    tempo: null,
    playButton: null,
    stopButton: null,
    loopButton: null,
    beats3Button: null,
    beats4Button: null,
    eraserButton: null,
    undoButton: null,
    leftButton: null,
    rightButton: null,
    clearButton: null,
    songButtons: {
        frog: null,
        beak: null,
        "1up": null,
    },
};

// Initialize DOM references when document is ready
function initDOM() {
    DOM.scrollBar = document.getElementById("scroll");
    DOM.tempo = document.getElementById("tempo");
    DOM.playButton = document.getElementById("play");
    DOM.stopButton = document.getElementById("stop");
    DOM.loopButton = document.getElementById("loop");
    DOM.beats3Button = document.getElementById("3beats");
    DOM.beats4Button = document.getElementById("4beats");
    DOM.eraserButton = document.getElementById("eraser");
    DOM.undoButton = document.getElementById("undo");
    DOM.leftButton = document.getElementById("toLeft");
    DOM.rightButton = document.getElementById("toRight");
    DOM.clearButton = document.getElementById("clear");
    DOM.songButtons.frog = document.getElementById("frog");
    DOM.songButtons.beak = document.getElementById("beak");
    DOM.songButtons["1up"] = document.getElementById("1up");
}

/*
 * GameStatus: Game mode
 *   0: Edit
 *   1: Mario Entering
 *   2: Playing
 *   3: Mario Leaving
 */
let gameStatus = 0;

// shim layer with setTimeout fallback
window.requestAnimFrame =
    window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    window.oRequestAnimationFrame ||
    window.msRequestAnimationFrame ||
    ((callback) => window.setTimeout(callback, 1000 / 60));

// Modernized SoundEntity class
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

// It's me, Mario!
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
    resetProperties() {
        this.marioOffset = this.marioX = -16; // X offset and position in dots
        this.marioScroll = 0; // Scroll amount in dots
        this.marioPosition = 0; // Position in bar number
        this.state = 0; // Animation state
        this.startTime = this.lastTime = 0; // Animation timestamps
        this.isJumping = false; // Whether Mario is jumping
    }

    // Reset Mario to initial state
    init() {
        this.resetProperties();
        this.timer.switch = true;
    }

    // Animate Mario entering the stage
    enter(timeStamp) {
        if (this.startTime === 0) this.startTime = timeStamp; // Set start time if not set
        const timeDifference = timeStamp - this.startTime;
        this.marioX = Math.min(Math.floor(timeDifference / 5) + this.marioOffset, 40); // Cap position at 40
        this.state = Math.floor(timeDifference / 100) % 2 === 0 ? 1 : 0; // Alternate state
        this.draw();
    }

    // Initialize for leaving the stage
    init4leaving() {
        this.marioOffset = this.marioX; // Set offset to current position
        this.startTime = 0;
        this.isJumping = false;
    }

    // Initialize for playing the music
    init4playing(timeStamp) {
        this.lastTime = timeStamp;
        this.marioOffset = this.marioX;
        this.marioScroll = 0;
        this.marioPosition = 1;
        this.state = 1;
        this.checkMarioShouldJump();
    }

    // Determine if Mario should jump based on notes at current position
    checkMarioShouldJump() {
        const notes = curScore.notes[this.marioPosition - 1];
        // Jump if there are notes and either there's more than one note or the note isn't a string (tempo)
        this.isJumping = notes && notes.length > 0 && (notes.length > 1 || typeof notes[0] !== "string");
    }

    // Main play animation loop
    play(timeStamp) {
        const scheduleAndPlay = (notes, time) => {
            if (time < 0) time = 0;
            if (!notes || notes.length === 0) return;

            const noteDictionary = {};
            notes.forEach((note) => {
                if (typeof note === "string") {
                    const tempo = note.split("=")[1];
                    curScore.tempo = tempo;
                    DOM.tempo.value = tempo;
                    return;
                }

                const soundNumber = note >> 8;
                const scale = note & 0xff;
                if (!noteDictionary[soundNumber]) noteDictionary[soundNumber] = [scale];
                else noteDictionary[soundNumber].push(scale);
            });

            Object.entries(noteDictionary).forEach(([soundIndex, scales]) => {
                SOUNDS[soundIndex].playChord(scales, time / 1000); // Convert ms to seconds
            });
        };

        const tempo = curScore.tempo;
        let timeDifference = timeStamp - this.lastTime;
        if (timeDifference > 32) timeDifference = 16; // Cap time difference
        this.lastTime = timeStamp;
        const step = (32 * timeDifference * tempo) / 60000; // Calculate movement step based on tempo

        this.timer.checkAndFire(timeStamp);

        const nextBar = 16 + 32 * (this.marioPosition - curPos + 1) - 8; // Calculate position of next bar

        if (this.marioX < 120) {
            this.marioX += step;
            if (this.marioX >= nextBar) {
                this.marioPosition++;
                scheduleAndPlay(curScore.notes[this.marioPosition - 2], 0);
                this.checkMarioShouldJump();
            } else if (this.marioX >= 120) {
                this.marioScroll = this.marioX - 120;
                this.marioX = 120;
            }
        } else if (curPos <= curScore.end - 6) {
            this.marioX = 120;
            if (this.marioScroll < 16 && this.marioScroll + step > 16) {
                this.marioPosition++;
                this.marioScroll += step;
                scheduleAndPlay(curScore.notes[this.marioPosition - 2], 0);
                this.checkMarioShouldJump();
            } else {
                this.marioScroll += step;
                if (this.marioScroll > 32) {
                    this.marioScroll -= 32;
                    curPos++;
                    DOM.scrollBar.value = curPos;
                    if (curPos > curScore.end - 6) {
                        this.marioX += this.marioScroll;
                        this.marioScroll = 0;
                    }
                }
            }
        } else {
            this.marioX += step;
            if (this.marioX >= nextBar) {
                this.marioPosition++;
                scheduleAndPlay(curScore.notes[this.marioPosition - 2], 0);
                this.checkMarioShouldJump();
            }
        }
        drawScore(curPos, curScore.notes, this.marioScroll);
        this.draw();
    }

    // Calculate jump height based on position in jump arc
    jump(position) {
        const jumpHeights = [
            0, 2, 4, 6, 8, 10, 12, 13, 14, 15, 16, 17, 18, 18, 19, 19, 19, 19, 19, 18, 18, 17, 16, 15, 14, 13, 12, 10,
            8, 6, 4, 2, 0,
        ];
        return jumpHeights[Math.round(position) % 32];
    }

    // Draw Mario at current position and state
    draw() {
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

        L2C.drawImage(this.images[state], this.marioX * MAGNIFY, verticalPosition * MAGNIFY);
    }

    // Animate Mario leaving the stage
    leave(timeStamp) {
        if (this.startTime === 0) this.startTime = timeStamp;

        const diff = timeStamp - this.startTime;
        if (this.marioScroll > 0 && this.marioScroll < 32) {
            this.marioScroll += Math.floor(diff / 4);
            if (this.marioScroll > 32) {
                this.marioX += this.marioScroll - 32;
                this.marioScroll = 0;
                curPos++;
            }
        } else {
            this.marioX = Math.floor(diff / 4) + this.marioOffset;
        }

        if (Math.floor(diff / 100) % 2 === 0) {
            this.state = 8;
            this.draw();
            L2C.drawImage(
                sweatImg,
                0,
                0,
                sweatImg.width,
                sweatImg.height,
                (this.marioX - (sweatImg.width + 1)) * MAGNIFY,
                (41 - 22) * MAGNIFY,
                sweatImg.width * MAGNIFY,
                sweatImg.height * MAGNIFY
            );
        } else {
            this.state = 9;
            this.draw();
        }
    }
}

class EasyTimer {
    constructor(time, func) {
        this.time = time;
        this.func = func;
        this.lastTime = 0;
        this.switch = false;
    }

    checkAndFire(time) {
        if (this.switch && time - this.lastTime > this.time) {
            this.func(this);
            this.lastTime = time;
        }
    }
}

// Asynchronous load of sounds
const SOUNDS = Array.from({ length: 20 }, (_, i) => {
    const paddedNumber = `0${i + 1}`.slice(-2);
    return new SoundEntity(`wav/sound${paddedNumber}.wav`);
});

// Add undo dog sound
SOUNDS[20] = new SoundEntity("wav/dogundo.wav");

// Prepare Mat
const MAT = document.getElementById("layer1");
MAT.width = ORGWIDTH * MAGNIFY;
MAT.height = ORGHEIGHT * MAGNIFY;
const L1C = MAT.getContext("2d");
L1C.imageSmoothingEnabled = false;
const matImage = new Image();
matImage.src = "images/mat.png";
matImage.onload = () => L1C.drawImage(matImage, 0, 0, matImage.width * MAGNIFY, matImage.height * MAGNIFY);

// Prepare image resources
const charSheet = new Image();
charSheet.src = "images/character_sheet.png";

const bombImg = new Image();
bombImg.src = "images/bomb.png";
let BOMBS = [];
const bombTimer = new EasyTimer(150, drawBomb);
bombTimer.switch = true; // always true for the bomb
bombTimer.currentFrame = 0;

function drawBomb(mySelf) {
    const bombX = 9 * MAGNIFY;
    const bombY = 202 * MAGNIFY;
    L1C.drawImage(BOMBS[mySelf.currentFrame], bombX, bombY);
    mySelf.currentFrame = mySelf.currentFrame === 0 ? 1 : 0;

    if (curSong !== undefined && gameStatus === 2) {
        curSong.style.backgroundImage = `url(${curSong.images[mySelf.currentFrame + 1].src})`;
    }
}

// Load all required images
const imageResources = {
    GClef: "images/G_Clef.png",
    numImg: "images/numbers.png",
    marioImg: "images/Mario.png",
    undoDogImg: "images/undo_dog.png",
    sweatImg: "images/mario_sweat.png",
    playBtnImg: "images/play_button.png",
    stopBtnImg: "images/stop_button.png",
    clearImg: "images/clear_button.png",
    thumbImg: "images/slider_thumb.png",
    beatImg: "images/beat_button.png",
    songImg: "images/song_buttons.png",
    endImg: "images/end_mark.png",
    semitoneImg: "images/semitone.png",
    repeatImg: "images/repeat_head.png",
};

// Create image objects
Object.entries(imageResources).forEach(([name, src]) => {
    window[name] = new Image();
    window[name].src = src;
});

function drawRepeatHead(xPosition) {
    L2C.drawImage(repeatMark[0], xPosition * MAGNIFY, 56 * MAGNIFY);
}

// Score Area (8, 41) to (247, 148)
function drawScore(position, notes, scroll) {
    // Clear and set clipping region for the score area
    L2C.clearRect(0, 0, SCREEN.width, SCREEN.height);
    L2C.save();
    L2C.rect(8 * MAGNIFY, 0, (247 - 8 + 1) * MAGNIFY, SCRHEIGHT * MAGNIFY);
    L2C.clip();

    // Handle mouse interaction for edit mode
    const mouseRealX = mouseX - offsetLeft;
    const mouseRealY = mouseY - offsetTop;
    let gridPosition = toGrid(mouseRealX, mouseRealY);
    let gridX, gridY;

    // Draw horizontal bar for high notes in edit mode
    if (gameStatus === 0 && gridPosition !== false) {
        [gridX, gridY] = gridPosition;
        if (gridY >= 11) drawHorizontalBar(gridX, 0);
    }

    // Draw G clef and repeat marks at the beginning
    if (position === 0) {
        // Draw G clef at the start
        const gClefWidth = GClef.width;
        const gClefHeight = GClef.height;
        L2C.drawImage(
            GClef,
            0,
            0,
            gClefWidth,
            gClefHeight,
            (9 - scroll) * MAGNIFY,
            48 * MAGNIFY,
            gClefWidth * MAGNIFY,
            gClefHeight * MAGNIFY
        );

        // Draw repeat mark if looping is enabled
        if (curScore.loop) {
            drawRepeatHead(41 - scroll);
        }
    } else if (position === 1 && curScore.loop) {
        drawRepeatHead(9 - scroll);
    }

    // Calculate which beats should be highlighted orange
    const beats = curScore.beats;
    // For 4 beats: orange = 2,1,0,3,2,1,0,3,...
    // For 3 beats: orange = 2,1,0,2,1,0,2,1,...
    const orangeBeat = beats === 4 ? 3 - ((position + 1) % 4) : 2 - ((position + 3) % 3);

    // Determine starting bar index based on position
    let barIndex = position < 2 ? 2 - position : 0;

    // Draw each bar in the visible area
    for (; barIndex < 9; barIndex++) {
        const originalX = 16 + 32 * barIndex - scroll;
        const x = originalX * MAGNIFY;
        const barNumber = position + barIndex - 2;

        // Draw end mark if this is the last bar
        if (barNumber === curScore.end) {
            const endMarkImage = curScore.loop ? repeatMark[1] : endMark;
            L2C.drawImage(endMarkImage, x - 7 * MAGNIFY, 56 * MAGNIFY);
        }

        // Draw vertical bar line
        L2C.beginPath();
        L2C.setLineDash([MAGNIFY, MAGNIFY]);
        L2C.lineWidth = MAGNIFY;

        // Highlight first beat of each measure in orange
        if (barIndex % beats === orangeBeat) {
            if (gameStatus === 0) drawBarNumber(barIndex, barNumber / beats + 1);
            L2C.strokeStyle = "#F89000"; // Orange
        } else {
            L2C.strokeStyle = "#A0C0B0"; // Light green
        }
        L2C.moveTo(x, 41 * MAGNIFY);
        L2C.lineTo(x, 148 * MAGNIFY);
        L2C.stroke();

        // Skip if no notes in this bar
        const barNotes = notes[barNumber];
        if (barNotes === undefined) continue;

        // Calculate vertical offset for jumping animation
        let noteDelta = 0;
        if (gameStatus === 2 && mario.marioPosition - 2 === barNumber) {
            // Calculate jump height based on Mario's position
            let noteIndex;
            if (mario.marioX === 120) {
                noteIndex = mario.marioScroll >= 16 ? mario.marioScroll - 16 : mario.marioScroll + 16;
            } else {
                noteIndex = mario.marioX + 8 - originalX;
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
                curChar === 16 &&
                gridPosition !== false &&
                barIndex === gridX &&
                noteScale === gridY &&
                eraserTimer.currentFrame === 1
            ) {
                continue;
            }

            // Draw ledger line for high notes
            if (!hasHighNote && noteScale >= 11) {
                hasHighNote = true;
                drawHorizontalBar(barIndex, scroll);
            }

            // Draw the note
            L2C.drawImage(SOUNDS[soundNumber].image, x - HALFCHARSIZE, (40 + noteScale * 8 + noteDelta) * MAGNIFY);

            // Draw accidentals (sharps/flats)
            const x2 = x - 13 * MAGNIFY;
            const y = (44 + noteScale * 8 + noteDelta) * MAGNIFY;
            if ((barNotes[noteIndex] & 0x80) !== 0) {
                L2C.drawImage(Semitones[0], x2, y); // Sharp
            } else if ((barNotes[noteIndex] & 0x40) !== 0) {
                L2C.drawImage(Semitones[1], x2, y); // Flat
            }
        }
    }

    // Draw cursor rectangle in edit mode
    if (gameStatus === 0) {
        L2C.beginPath();
        L2C.setLineDash([7 * MAGNIFY, 2 * MAGNIFY, 7 * MAGNIFY, 0]);
        L2C.lineWidth = MAGNIFY;
        L2C.strokeStyle = "#F00";
        const x = (16 + 32 * gridX - 8) * MAGNIFY;
        const y = (40 + gridY * 8) * MAGNIFY;
        L2C.rect(x, y, CHARSIZE, CHARSIZE);
        L2C.stroke();
    }

    L2C.restore();
}

// X is the x of vertical bar (in grid)
function drawHorizontalBar(gridX, scroll) {
    const width = 24 * MAGNIFY;
    L2C.fillRect((4 + 32 * gridX - scroll) * MAGNIFY, (38 + 11 * 8) * MAGNIFY + HALFCHARSIZE, width, 2 * MAGNIFY);
}

function drawBarNumber(gridX, barNumber) {
    let x = (16 + 32 * gridX) * MAGNIFY - 1;
    const y = (40 - 7) * MAGNIFY;
    const numberDigits = [];
    while (barNumber > 0) {
        numberDigits.push(barNumber % 10);
        barNumber = Math.floor(barNumber / 10);
    }
    const digitCount = numberDigits.length;
    if (digitCount === 1) x += 2 * MAGNIFY;
    while (numberDigits.length > 0) {
        const digit = numberDigits.pop();
        const digitWidth = digit === 4 ? 5 : 4;
        L2C.drawImage(NUMBERS[digit], x, y, 5 * MAGNIFY, 7 * MAGNIFY);
        x += digitWidth * MAGNIFY;
    }
}

function changeCursor(soundNumber) {
    SCREEN.style.cursor = "url(" + SOUNDS[soundNumber].image.src + ")" + HALFCHARSIZE + " " + HALFCHARSIZE + ", auto";
}

function drawCurChar(image) {
    const x = 4 * MAGNIFY;
    const y = 7 * MAGNIFY;
    L1C.beginPath();
    L1C.imageSmoothingEnabled = false;
    L1C.clearRect(x, y, CHARSIZE, CHARSIZE);
    L1C.drawImage(image, x, y);
    L1C.fillRect(x, y, CHARSIZE, MAGNIFY);
    L1C.fillRect(x, y + CHARSIZE - MAGNIFY, CHARSIZE, MAGNIFY);
}

// Right-Top (19,8)
// 19 - 4 + 1 = 16
// icon size (14, 13)
function drawEndMarkIcon(image) {
    L1C.clearRect(4 * MAGNIFY, 8 * MAGNIFY, 16 * MAGNIFY, 14 * MAGNIFY);
    L1C.drawImage(image, 5 * MAGNIFY, 8 * MAGNIFY);
}

// Draw Eraser Icon
// In fact, this only erases Icon
function drawEraserIcon() {
    L1C.clearRect(4 * MAGNIFY, 8 * MAGNIFY, 16 * MAGNIFY, 14 * MAGNIFY);
}

function toGrid(mouseRealX, mouseRealY) {
    const gridLeft = (8 + 0) * MAGNIFY;
    const gridTop = 41 * MAGNIFY;
    const gridRight = (247 - 4) * MAGNIFY;
    const gridBottom = (148 - 4) * MAGNIFY;
    if (mouseRealX < gridLeft || mouseRealX > gridRight || mouseRealY < gridTop || mouseRealY > gridBottom)
        return false;

    let gridX = Math.floor((mouseRealX - gridLeft) / CHARSIZE);
    if (gridX % 2 !== 0) return false; // Not near the bar
    gridX /= 2;
    const gridY = Math.floor((mouseRealY - gridTop) / HALFCHARSIZE);

    // Consider G-Clef and repeat head area
    if ((curPos === 0 && gridX < 2) || (curPos === 1 && gridX === 0)) return false;
    else return [gridX, gridY];
}

const SCREEN = document.getElementById("layer2");
// You should not use .style.width(or height) here.
// You must not append "px" here.
SCREEN.width = ORGWIDTH * MAGNIFY;
SCREEN.height = SCRHEIGHT * MAGNIFY;
const L2C = SCREEN.getContext("2d");
L2C.imageSmoothingEnabled = false;
// Delete
// Google don't support MouseEvent.buttons even it is in W3C standard?
// Low priority? No milestone?
// I'm outta here. #IAmGoogle
// https://code.google.com/p/chromium/issues/detail?id=276941
SCREEN.addEventListener("contextmenu", mouseClickListener);

// ClipRect (8, 41) to (247, 148)
SCREEN.addEventListener("click", mouseClickListener);

// Add undo history tracking
let undoHistory = [];

// Add function to update undo button state
function updateUndoButtonState() {
    DOM.undoButton.disabled = undoHistory.length === 0;
    DOM.undoButton.style.cursor = DOM.undoButton.disabled ? "not-allowed" : "pointer";
}

// Modify mouseClickListener to update undo button state
function mouseClickListener(event) {
    if (gameStatus !== 0) return;
    event.preventDefault();

    const mouseRealX = event.clientX - offsetLeft;
    const mouseRealY = event.clientY - offsetTop;

    const gridPosition = toGrid(mouseRealX, mouseRealY);
    if (gridPosition === false) return;
    const gridX = gridPosition[0];
    let gridY = gridPosition[1];

    // Map logical x to real bar number
    const barNumber = curPos + gridX - 2;

    // process End Mark
    if (curChar === 15) {
        // Store the old end mark position before changing it
        undoHistory.push({
            type: "endmark",
            oldEnd: curScore.end,
            newEnd: barNumber,
        });
        curScore.end = barNumber;
        updateUndoButtonState();
        return;
    }

    if (barNumber >= curScore.end) return;

    const barNotes = curScore["notes"][barNumber];
    // Delete
    if (curChar === 16 || event.button === 2) {
        // Delete Top of the stack
        for (let i = barNotes.length - 1; i >= 0; i--) {
            if ((barNotes[i] & 0x3f) === gridY) {
                // Store in undo history before deleting
                undoHistory.push({
                    type: "delete",
                    barNumber: barNumber,
                    note: barNotes[i],
                });
                barNotes.splice(i, 1);
                curScore.notes[barNumber] = barNotes;
                SOUNDS[17].play(8);
                updateUndoButtonState();
                break;
            }
        }
        return;
    }

    let note = (curChar << 8) | gridY;
    if (barNotes.indexOf(note) !== -1) return;
    //
    // Handle semitone
    if (event.shiftKey) gridY |= 0x80;
    if (event.ctrlKey) gridY |= 0x40;
    SOUNDS[curChar].play(gridY);
    note = (curChar << 8) | gridY;
    // Store in undo history before adding
    undoHistory.push({
        type: "add",
        barNumber: barNumber,
        note: note,
    });
    barNotes.push(note);
    curScore["notes"][barNumber] = barNotes;
    updateUndoButtonState();
}

SCREEN.addEventListener("mousemove", function (e) {
    mouseX = e.clientX;
    mouseY = e.clientY;
});

// Read MSQ File
// You need this "dragover" event listener to enable drop functionality
SCREEN.addEventListener("dragover", (e) => {
    e.preventDefault();
    return false;
});

// Handle file drops (MSQ or JSON files)
SCREEN.addEventListener("drop", async (e) => {
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
});

// Promise-based file reader
function readFileAsync(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(new Error("File reading failed"));
        reader.readAsText(file, "shift-jis");
    });
}

// Closing to add files to the score
//   Configure Score parameters
function closing() {
    // Finally, after reducing, set parameters to Score
    const beatButton = DOM[curScore.beats === 3 ? "beats3Button" : "beats4Button"];
    const e = new Event("click");
    e.soundOff = true;
    beatButton.dispatchEvent(e);

    curMaxBars = curScore.end + 1;
    DOM.scrollBar.max = curMaxBars - 6;
    DOM.scrollBar.value = 0;
    curPos = 0;

    const tempo = curScore.notes[0][0];
    if (typeof tempo === "string" && tempo.slice(0, 5) === "TEMPO") {
        const tempoValue = tempo.split("=")[1];
        curScore.tempo = tempoValue;
        DOM.tempo.value = tempoValue;
    }
}

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

    const oldEnd = curScore.end;
    const s = values.SCORE;
    let i = 0,
        count = curScore.end;
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
        curScore.notes[count++] = bar;
    }

    curScore.end += parseInt(values.END) - 1;
    if (curScore.tempo !== values.TEMPO) curScore.notes[oldEnd].splice(0, 0, "TEMPO=" + values.TEMPO);
    curScore.tempo = values.TEMPO;
    const beats = values.TIME44 === "TRUE" ? 4 : 3;
    curScore.beats = beats;

    // Set loop button state
    values.LOOP === "TRUE" ? DOM.loopButton.set() : DOM.loopButton.reset();
}

// addJSON
//   Prase JSON and add contents into curScore
//   Input parameter type is FileReader,
//   but use only its result property.
//   This means you can use any object with result.
function addJSON(text) {
    const json = JSON.parse(text);
    for (let i = 0; i < json.end; i++) curScore.notes.push(json.notes[i]);

    const notes = curScore.notes[curScore.end];
    if (curScore.tempo !== json.tempo && notes.length !== 0) {
        const tempostr = notes[0];
        if (typeof tempostr !== "string") {
            notes.splice(0, 0, "TEMPO=" + json.tempo);
        }
    }
    curScore.tempo = json.tempo;

    curScore.end += json.end;

    // Update curScore.loop with json.loop value
    curScore.loop = json.loop;

    // Use json.loop instead of curScore.loop to determine button state
    if (json.loop) DOM.loopButton.set();
    else DOM.loopButton.reset();
}

function doAnimation(time) {
    // Bomb
    bombTimer.checkAndFire(time);
    eraserTimer.checkAndFire(time);
    endMarkTimer.checkAndFire(time);

    drawScore(curPos, curScore["notes"], 0);

    if (gameStatus !== 0) return;

    requestAnimFrame(doAnimation);
}

function makeButton(x, y, width, height, type = "button", ariaLabel = "") {
    const button = document.createElement("button");

    // Set multiple properties at once
    Object.assign(button, {
        className: "game",
        type,
        originalX: x,
        originalY: y,
        originalW: width,
        originalH: height,
    });

    // Set multiple styles at once
    Object.assign(button.style, {
        position: "absolute",
        cursor: "pointer",
        zIndex: "3",
        background: "rgba(0,0,0,0)",
    });

    // Set aria-label if provided
    if (ariaLabel) button.setAttribute("aria-label", ariaLabel);

    // Position and size the button
    moveDOM(button, x, y);
    resizeDOM(button, width, height);

    // Add redraw method
    button.redraw = () => {
        moveDOM(button, button.originalX, button.originalY);
        resizeDOM(button, button.originalW, button.originalH);
    };

    // Observe disabled attribute changes
    new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.attributeName === "disabled") {
                button.style.cursor = button.disabled ? "not-allowed" : "pointer";
                break;
            }
        }
    }).observe(button, { attributes: true });

    return button;
}

const resizeDOM = (element, width, height) => {
    element.style.width = `${width * MAGNIFY}px`;
    element.style.height = `${height * MAGNIFY}px`;
};

const moveDOM = (element, x, y) => {
    element.style.left = `${x * MAGNIFY}px`;
    element.style.top = `${y * MAGNIFY}px`;
};

const selectListener = (event) => {
    console.log(event);
    MAGNIFY = event.target.selectedIndex + 1;
    resizeScreen();
};

const sliceImage = (image, width, height) => {
    const result = [];
    const horizontalCount = Math.floor(image.width / width);
    const verticalCount = Math.floor(image.height / height);
    const charWidth = width * MAGNIFY;
    const charHeight = height * MAGNIFY;

    // Create a single reusable canvas
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = charWidth;
    tempCanvas.height = charHeight;
    const tempContext = tempCanvas.getContext("2d");
    tempContext.imageSmoothingEnabled = false;

    for (let y = 0; y < verticalCount; y++) {
        for (let x = 0; x < horizontalCount; x++) {
            const i = y * horizontalCount + x;

            // Clear canvas before reuse
            tempContext.clearRect(0, 0, charWidth, charHeight);

            // Draw the sprite slice
            tempContext.drawImage(image, x * width, y * height, width, height, 0, 0, charWidth, charHeight);

            // Create image from canvas
            const charImage = new Image();
            charImage.src = tempCanvas.toDataURL();
            result[i] = charImage;
        }
    }
    return result;
};

const download = () => {
    const link = document.createElement("a");
    link.download = "MSQ_Data.json";
    const blob = new Blob([JSON.stringify(curScore)], { type: "application/json" });
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href); // Clean up to avoid memory leaks
};

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
function updateCoreDimensions() {
    CHARSIZE = 16 * MAGNIFY;
    HALFCHARSIZE = Math.floor(CHARSIZE / 2);

    // Update console dimensions
    CONSOLE.style.width = `${ORGWIDTH * MAGNIFY}px`;
    CONSOLE.style.height = `${ORGHEIGHT * MAGNIFY}px`;

    // Update offsets for cursor positioning
    offsetLeft = CONSOLE.offsetLeft;
    offsetTop = CONSOLE.offsetTop;

    // Update global image resources
    BOMBS = sliceImage(bombImg, 14, 18);
    mario.images = sliceImage(marioImg, 16, 22);
    Semitones = sliceImage(semitoneImg, 5, 12);
    NUMBERS = sliceImage(numImg, 5, 7);

    // Prepare Repeat marks
    repeatMark = sliceImage(repeatImg, 13, 62);
    endMark = repeatMark[2];
}

// Resize canvas elements
function resizeCanvasElements() {
    // Resize and redraw the main canvas
    MAT.width = ORGWIDTH * MAGNIFY;
    MAT.height = ORGHEIGHT * MAGNIFY;
    L1C.drawImage(matImage, 0, 0, matImage.width * MAGNIFY, matImage.height * MAGNIFY);

    // Resize the screen canvas
    SCREEN.width = ORGWIDTH * MAGNIFY;
    SCREEN.height = SCRHEIGHT * MAGNIFY;
}

// Resize note buttons and end mark button
function resizeNoteButtons() {
    const characterImages = sliceImage(charSheet, 16, 16);

    // Resize all buttons
    BUTTONS.forEach((button, index) => {
        button.redraw();
        if (index < 15) button.se.image = characterImages[index];
    });

    // Update end mark button
    BUTTONS[15].images = sliceImage(endImg, 14, 13);
    endMarkTimer.images = BUTTONS[15].images;

    // Update cursor and character display
    if (curChar < 15) {
        changeCursor(curChar);
    }

    if (curChar === 15) drawEndMarkIcon(BUTTONS[15].images[0]);
    else if (curChar === 16) drawEraserIcon();
    else drawCurChar(SOUNDS[curChar].image);
}

// Resize control buttons (play, stop, loop)
function resizeControlButtons() {
    // Resize play button
    DOM.playButton.redraw();
    DOM.playButton.images = sliceImage(playBtnImg, 12, 15);
    const playButtonState = DOM.playButton.disabled ? 1 : 0;
    DOM.playButton.style.backgroundImage = `url(${DOM.playButton.images[playButtonState].src})`;

    // Resize stop button
    DOM.stopButton.redraw();
    const stopButtonImages = sliceImage(stopBtnImg, 16, 15);
    DOM.stopButton.images = [stopButtonImages[0], stopButtonImages[1]];
    DOM.stopButton.style.backgroundImage = `url(${DOM.stopButton.images[1 - playButtonState].src})`;

    // Resize loop button
    DOM.loopButton.redraw();
    DOM.loopButton.images = [stopButtonImages[2], stopButtonImages[3]]; // reuse images from stop button
    const loopButtonState = curScore.loop ? 1 : 0;
    DOM.loopButton.style.backgroundImage = `url(${DOM.loopButton.images[loopButtonState].src})`;

    // Resize clear button
    DOM.clearButton.redraw();
    DOM.clearButton.images = sliceImage(clearImg, 34, 16);
    DOM.clearButton.style.backgroundImage = `url(${DOM.clearButton.images[0].src})`;
}

// Resize slider elements (scroll bar, tempo)
function resizeSliderElements() {
    // Resize scroll bar
    moveDOM(DOM.scrollBar, DOM.scrollBar.originalX, DOM.scrollBar.originalY);
    resizeDOM(DOM.scrollBar, DOM.scrollBar.originalW, DOM.scrollBar.originalH);

    // Update scroll bar thumb style
    updateSliderThumbStyle("#scroll::-webkit-slider-thumb", {
        properties: {
            "-webkit-appearance": "none !important",
            "border-radius": "0px",
            "background-color": "#A870D0",
            "box-shadow": "inset 0 0 0px",
            border: "0px",
        },
        width: 5 * MAGNIFY,
        height: 7 * MAGNIFY,
    });

    // Resize tempo slider
    moveDOM(DOM.tempo, DOM.tempo.originalX, DOM.tempo.originalY);
    resizeDOM(DOM.tempo, DOM.tempo.originalW, DOM.tempo.originalH);

    // Get thumb image for tempo slider
    const thumbImage = sliceImage(thumbImg, 5, 8)[0];
    DOM.tempo.image = thumbImage;

    // Update tempo slider thumb style
    updateSliderThumbStyle("#tempo::-webkit-slider-thumb", {
        properties: {
            "-webkit-appearance": "none !important",
            "background-image": `url('${thumbImage.src}')`,
            "background-repeat": "no-repeat",
            "background-size": "100% 100%",
            border: "0px",
        },
        width: 5 * MAGNIFY,
        height: 8 * MAGNIFY,
    });
}

// Helper function to update slider thumb styles
function updateSliderThumbStyle(selector, config) {
    const styleRules = pseudoSheet.cssRules;

    // Find and remove existing rule
    for (let i = 0; i < styleRules.length; i++) {
        if (styleRules[i].selectorText === selector) {
            pseudoSheet.deleteRule(i);
            break;
        }
    }

    // Build CSS properties string
    let cssProperties = "";
    for (const [property, value] of Object.entries(config.properties)) {
        cssProperties += `${property}: ${value};\n`;
    }

    // Add width and height
    cssProperties += `width: ${config.width}px;\n`;
    cssProperties += `height: ${config.height}px;`;

    // Insert new rule
    pseudoSheet.insertRule(`${selector} {${cssProperties}}`, 0);
}

// Resize navigation buttons
function resizeNavigationButtons() {
    // Resize left and right navigation buttons
    DOM.leftButton.redraw();
    DOM.rightButton.redraw();
}

// Resize beat buttons
function resizeBeatButtons() {
    // Resize beat buttons
    DOM.beats3Button.redraw();
    DOM.beats4Button.redraw();

    const beatImages = sliceImage(beatImg, 14, 15);

    // Set images for both buttons
    DOM.beats3Button.images = [beatImages[0], beatImages[1]];
    DOM.beats4Button.images = [beatImages[2], beatImages[3]];

    // Determine state and apply to both buttons
    const is3Beats = curScore.beats === 3;
    DOM.beats3Button.style.backgroundImage = `url(${DOM.beats3Button.images[is3Beats ? 1 : 0].src})`;
    DOM.beats4Button.style.backgroundImage = `url(${DOM.beats4Button.images[is3Beats ? 0 : 1].src})`;
}

// Resize song buttons
function resizeSongButtons() {
    const songImages = sliceImage(songImg, 15, 17);

    // Configure all song buttons
    const songButtonsConfig = [
        { button: DOM.songButtons.frog, imageIndices: [0, 1, 2] },
        { button: DOM.songButtons.beak, imageIndices: [3, 4, 5] },
        { button: DOM.songButtons["1up"], imageIndices: [6, 7, 8] },
    ];

    songButtonsConfig.forEach((config) => {
        const button = config.button;
        button.redraw();
        button.images = config.imageIndices.map((i) => songImages[i]);
        const buttonState = curSong === button ? 1 : 0;
        button.style.backgroundImage = `url(${button.images[buttonState].src})`;
    });
}

// Resize eraser button
function resizeEraserButton() {
    const songImages = sliceImage(songImg, 15, 17);

    DOM.eraserButton.redraw();
    DOM.eraserButton.images = [songImages[9], songImages[10], songImages[11]];
    const eraserButtonState = curChar === 16 ? 1 : 0;

    if (curChar === 16) {
        SCREEN.style.cursor = `url(${DOM.eraserButton.images[2].src}) 0 0, auto`;
    }

    DOM.eraserButton.style.backgroundImage = `url(${DOM.eraserButton.images[eraserButtonState].src})`;
}

// Resize undo dog button
function resizeUndoDogButton() {
    DOM.undoButton.redraw();
    DOM.undoButton.images = sliceImage(undoDogImg, 14, 15);
    DOM.undoButton.style.backgroundImage = `url(${DOM.undoButton.images[0].src})`;
}

function setupNoteButtons() {
    const buttonImages = sliceImage(charSheet, 16, 16);

    // Create all note buttons at once
    const createNoteButton = (i) => {
        const button = makeButton(24 + 14 * i, 8, 13, 14, "button", `Select note ${i + 1}`);
        button.num = i;
        button.se = SOUNDS[i];
        button.se.image = buttonImages[i];
        button.addEventListener("click", function () {
            this.se.play(8); // Note F
            curChar = this.num;
            clearEraserButton();
            changeCursor(this.num);
            drawCurChar(this.se.image);
        });
        CONSOLE.appendChild(button);
        return button;
    };

    // Create all 15 buttons at once and store them in BUTTONS array
    BUTTONS.splice(0, 15, ...Array.from({ length: 15 }, (_, i) => createNoteButton(i)));

    // Setup End Mark Button
    const endMarkButton = makeButton(235, 8, 13, 14, "button", "Add end mark");
    endMarkButton.images = sliceImage(endImg, 14, 13); // Note: Different size from the button

    // Create timer for end mark cursor animation
    endMarkTimer = new EasyTimer(150, (self) => {
        if (curChar !== 15) {
            self.switch = false;
            return;
        }
        self.currentFrame ^= 1; // Toggle between 0 and 1
        SCREEN.style.cursor = `url(${self.images[self.currentFrame].src})${7 * MAGNIFY} ${7 * MAGNIFY}, auto`;
    });

    // Set up timer properties
    endMarkTimer.images = endMarkButton.images;
    endMarkTimer.currentFrame = 0;

    // Add click handler
    endMarkButton.addEventListener("click", function () {
        endMarkTimer.switch = true;
        curChar = 15;
        SOUNDS[15].play(8);
        clearEraserButton();
        drawEndMarkIcon(this.images[0]);
    });

    CONSOLE.appendChild(endMarkButton);
    BUTTONS[15] = endMarkButton;

    // Setup Eraser Button
    setupEraserButton();
}

function setupEraserButton() {
    const songImages = sliceImage(songImg, 15, 17);
    const eraserButton = makeButton(40, 202, 15, 17, "button", "Erase notes");
    eraserButton.id = "eraser";
    eraserButton.images = [songImages[9], songImages[10], songImages[11]]; // In the Song button images
    eraserButton.style.backgroundImage = "url(" + eraserButton.images[0].src + ")";
    eraserTimer = new EasyTimer(200, function (self) {
        // If current is not end mark, just return;
        if (curChar !== 16) {
            self.switch = false;
            return;
        }
        self.currentFrame = self.currentFrame === 0 ? 1 : 0;
    });
    eraserTimer.currentFrame = 0;
    eraserButton.addEventListener("click", function () {
        eraserTimer.switch = true;
        curChar = 16;
        SOUNDS[17].play(8);
        drawEraserIcon();
        clearSongButtons();
        this.style.backgroundImage = "url(" + this.images[1].src + ")";
        SCREEN.style.cursor = "url(" + this.images[2].src + ")" + " 0 0, auto";
    });
    CONSOLE.appendChild(eraserButton);
}

function setupControlButtons() {
    // For inserting pseudo elements' styles
    const style = document.createElement("style");
    document.head.appendChild(style);
    pseudoSheet = style.sheet;

    // Prepare Play Button (55, 168)
    const playButton = makeButton(55, 168, 12, 15, "button", "Play music");
    playButton.id = "play";
    playButton.images = sliceImage(playBtnImg, 12, 15);
    playButton.style.backgroundImage = `url(${playButton.images[0].src})`;
    playButton.addEventListener("click", playListener);
    pseudoSheet.insertRule("#play:focus {outline: none !important;}", 0);
    CONSOLE.appendChild(playButton);

    // Stop Button
    const stopButton = makeButton(21, 168, 16, 15, "button", "Stop music");
    stopButton.id = "stop";
    stopButton.disabled = true;
    // Slice images once and store for reuse (also used by loop button)
    const stopButtonImages = sliceImage(stopBtnImg, 16, 15);
    stopButton.images = stopButtonImages.slice(0, 2);
    stopButton.style.backgroundImage = `url(${stopButton.images[1].src})`;
    stopButton.addEventListener("click", stopListener);
    pseudoSheet.insertRule("#stop:focus {outline: none !important;}", 0);
    CONSOLE.appendChild(stopButton);

    // Undo Button
    const undoButton = makeButton(216, 203, 14, 15, "button", "Undo last action");
    undoButton.id = "undo";
    undoButton.images = sliceImage(undoDogImg, 14, 15);
    undoButton.style.backgroundImage = `url(${undoButton.images[0].src})`;
    undoButton.addEventListener("click", function () {
        if (undoHistory.length === 0) return;

        const lastAction = undoHistory.pop();
        const barNotes = lastAction.type !== "endmark" ? curScore.notes[lastAction.barNumber] : null;

        switch (lastAction.type) {
            case "add":
                const index = barNotes.indexOf(lastAction.note);
                if (index !== -1) barNotes.splice(index, 1);
                break;
            case "delete":
                barNotes.push(lastAction.note);
                break;
            case "endmark":
                curScore.end = lastAction.oldEnd;
                break;
        }

        SOUNDS[20].play(8); // Play dogundo sound
        drawScore(curPos, curScore.notes, 0);
        updateUndoButtonState();

        // Add hover effect
        this.style.backgroundImage = `url(${this.images[1].src})`;
        setTimeout(() => {
            this.style.backgroundImage = `url(${this.images[0].src})`;
        }, 150);
    });
    CONSOLE.appendChild(undoButton);
    pseudoSheet.insertRule("#undo:focus {outline: none !important;}", 0);

    // Set initial undo button state directly instead of using updateUndoButtonState
    undoButton.disabled = undoHistory.length === 0;
    undoButton.style.cursor = undoButton.disabled ? "not-allowed" : "pointer";

    // Loop Button
    const loopButton = makeButton(85, 168, 16, 15, "button", "Toggle music loop");
    loopButton.id = "loop";
    loopButton.images = [stopButtonImages[2], stopButtonImages[3]]; // made in Stop button (above)
    loopButton.style.backgroundImage = `url(${loopButton.images[0].src})`;
    curScore.loop = false;
    loopButton.addEventListener("click", function () {
        curScore.loop = !curScore.loop;
        const buttonState = curScore.loop ? 1 : 0;
        this.style.backgroundImage = `url(${this.images[buttonState].src})`;
        SOUNDS[17].play(8);
    });
    loopButton.reset = function () {
        curScore.loop = false;
        this.style.backgroundImage = `url(${this.images[0].src})`;
    };
    loopButton.set = function () {
        curScore.loop = true;
        this.style.backgroundImage = `url(${this.images[1].src})`;
    };
    pseudoSheet.insertRule("#loop:focus {outline: none !important;}", 0);
    CONSOLE.appendChild(loopButton);

    // Repeat Button
    repeatMark = sliceImage(repeatImg, 13, 62);
    endMark = repeatMark[2];

    // Clear Button
    const clearButton = makeButton(200, 176, 34, 16, "button", "Clear all notes");
    clearButton.id = "clear";
    clearButton.images = sliceImage(clearImg, 34, 16);
    clearButton.style.backgroundImage = "url(" + clearButton.images[0].src + ")";
    clearButton.addEventListener("click", clearListener);
    CONSOLE.appendChild(clearButton);
    pseudoSheet.insertRule("#clear:focus {outline: none !important;}", 0);
}

// Add function to update undo button state - only call after DOM is initialized
function updateUndoButtonState() {
    // Only update if DOM has been initialized
    if (DOM.undoButton) {
        DOM.undoButton.disabled = undoHistory.length === 0;
        DOM.undoButton.style.cursor = DOM.undoButton.disabled ? "not-allowed" : "pointer";
    }
}

function setupUIControls() {
    // Scroll Range
    const scrollBar = document.createElement("input");
    scrollBar.id = "scroll";
    scrollBar.type = "range";
    scrollBar.setAttribute("aria-label", "Scroll through music");

    // Set all properties in a single object
    Object.assign(scrollBar, {
        value: 0,
        max: curMaxBars - 6,
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
        if (gameStatus === 0) {
            curPos = parseInt(scrollBar.value);
        }
    });

    CONSOLE.appendChild(scrollBar);

    // Set up scroll bar thumb styling
    pseudoSheet.insertRule(
        "#scroll::-webkit-slider-thumb {" +
            "-webkit-appearance: none !important;" +
            "border-radius: 0px;" +
            "background-color: #A870D0;" +
            "box-shadow:inset 0 0 0px;" +
            "border: 0px;" +
            "width: " +
            5 * MAGNIFY +
            "px;" +
            "height:" +
            7 * MAGNIFY +
            "px;}",
        0
    );
    pseudoSheet.insertRule("#scroll:focus {outline: none !important;}", 0);

    // Prepare range's side buttons for inc/decrements
    const leftButton = makeButton(184, 158, 7, 9, "button", "Scroll left");
    leftButton.id = "toLeft";
    leftButton.addEventListener("click", function (event) {
        if (DOM.scrollBar.value > 0) {
            curPos = --DOM.scrollBar.value;
        }
    });
    CONSOLE.appendChild(leftButton);

    const rightButton = makeButton(241, 158, 7, 9, "button", "Scroll right");
    rightButton.id = "toRight";
    rightButton.addEventListener("click", function (event) {
        if (DOM.scrollBar.value < curMaxBars - 6) {
            curPos = ++DOM.scrollBar.value;
        }
    });
    CONSOLE.appendChild(rightButton);

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
        curScore.tempo = parseInt(this.value);
    });

    CONSOLE.appendChild(tempoSlider);

    const thumbImage = sliceImage(thumbImg, 5, 8)[0];
    tempoSlider.image = thumbImage;

    // Setup tempo slider thumb styling
    pseudoSheet.insertRule(
        "#tempo::-webkit-slider-thumb {" +
            "-webkit-appearance: none !important;" +
            "background-image: url('" +
            thumbImage.src +
            "');" +
            "background-repeat: no-repeat;" +
            "background-size: 100% 100%;" +
            "border: 0px;" +
            "width: " +
            5 * MAGNIFY +
            "px;" +
            "height:" +
            8 * MAGNIFY +
            "px;}",
        0
    );
    pseudoSheet.insertRule("#tempo:focus {outline: none !important;}", 0);
}

function setupBeatButtons() {
    // Create utility function for exclusive button selection
    function makeExclusiveFunction(buttons, index, success) {
        const buttonList = buttons.slice(0); // Clone the Array
        const self = buttonList[index];
        buttonList.splice(index, 1); // Remove No.i element
        const otherButtons = buttonList;

        return function (event) {
            // Sound Off for file loading
            if (!event.soundOff) SOUNDS[17].play(8);
            self.disabled = true;
            self.style.backgroundImage = "url(" + self.images[1].src + ")";
            otherButtons.map(function (button) {
                button.disabled = false;
                button.style.backgroundImage = "url(" + button.images[0].src + ")";
            });
            success(self);
        };
    }

    const beatImages = sliceImage(beatImg, 14, 15);

    // Create 3 beats button
    const beats3Button = makeButton(81, 203, 14, 15, "button", "Set 3 beats per measure");
    beats3Button.id = "3beats";
    beats3Button.beats = 3;
    beats3Button.images = [beatImages[0], beatImages[1]];
    beats3Button.style.backgroundImage = "url(" + beats3Button.images[0].src + ")";
    beats3Button.disabled = false;
    CONSOLE.appendChild(beats3Button);

    // Create 4 beats button
    const beats4Button = makeButton(96, 203, 14, 15, "button", "Set 4 beats per measure");
    beats4Button.id = "4beats";
    beats4Button.beats = 4;
    beats4Button.images = [beatImages[2], beatImages[3]];
    beats4Button.style.backgroundImage = "url(" + beats4Button.images[1].src + ")";
    beats4Button.disabled = true;
    CONSOLE.appendChild(beats4Button);

    // Setup beat button event handlers
    const updateBeats = function (self) {
        curScore.beats = self.beats;
    };
    beats3Button.addEventListener("click", makeExclusiveFunction([beats3Button, beats4Button], 0, updateBeats));
    beats4Button.addEventListener("click", makeExclusiveFunction([beats3Button, beats4Button], 1, updateBeats));

    // Store makeExclusiveFunction for reuse in other contexts
    window.makeExclusiveFunction = makeExclusiveFunction;
}

function setupSongButtons() {
    const songImages = sliceImage(songImg, 15, 17);
    const songButtons = ["frog", "beak", "1up"].map(function (id, index) {
        const button = makeButton(136 + 24 * index, 202, 15, 17, "button", `Load ${id} song`);
        button.id = id;
        button.num = index;
        button.images = songImages.slice(index * 3, index * 3 + 3);
        button.style.backgroundImage = "url(" + button.images[0].src + ")";
        button.disabled = false;
        CONSOLE.appendChild(button);
        return button;
    });

    const loadSong = function (self) {
        curScore = clone(EmbeddedSong[self.num]);
        DOM.tempo.value = curScore.tempo;

        if (curScore.loop) {
            DOM.loopButton.set();
        } else {
            DOM.loopButton.reset();
        }

        DOM.scrollBar.max = curScore.end - 5;
        DOM.scrollBar.value = 0;
        curPos = 0;
        curSong = self;
    };

    // Use the makeExclusiveFunction created in setupBeatButtons
    songButtons[0].addEventListener("click", makeExclusiveFunction(songButtons, 0, loadSong));
    songButtons[1].addEventListener("click", makeExclusiveFunction(songButtons, 1, loadSong));
    songButtons[2].addEventListener("click", makeExclusiveFunction(songButtons, 2, loadSong));
}

function setupKeyboardControls() {
    document.addEventListener("keydown", function (event) {
        switch (event.code) {
            case "Space": // space -> play/stop or restart with shift
                if (DOM.playButton.disabled === false || event.shiftKey) {
                    playListener.call(DOM.playButton, event);
                } else {
                    stopListener.call(DOM.stopButton, event);
                }
                event.preventDefault();
                break;

            case "ArrowLeft": // left -> scroll left
                if (gameStatus === 0) {
                    // Only allow scrolling in edit mode
                    if (DOM.scrollBar.value > 0) curPos = --DOM.scrollBar.value;
                    event.preventDefault();
                }
                break;

            case "ArrowRight": // right -> scroll right
                if (gameStatus === 0) {
                    // Only allow scrolling in edit mode
                    if (DOM.scrollBar.value < curMaxBars - 6) curPos = ++DOM.scrollBar.value;
                    event.preventDefault();
                }
                break;

            case "KeyZ": // Ctrl+Z or Command+Z for undo
                if ((event.ctrlKey || event.metaKey) && !event.shiftKey && gameStatus === 0) {
                    if (!DOM.undoButton.disabled) {
                        DOM.undoButton.click();
                        event.preventDefault();
                    }
                }
                break;
        }
    });
}

async function loadSoundAndInitialize() {
    // Number images
    NUMBERS = sliceImage(numImg, 5, 7);

    // Initialize score
    initScore();

    // Initialize screen and cursor
    curPos = 0;
    curChar = 0;
    drawCurChar(SOUNDS[curChar].image);
    changeCursor(curChar);
    drawScore(curPos, curScore["notes"], 0);

    // Create images
    BOMBS = sliceImage(bombImg, 14, 18);
    mario = new MarioClass();
    mario.images = sliceImage(marioImg, 16, 22);
    Semitones = sliceImage(semitoneImg, 5, 12);

    // Load Sound Files
    const buffers = await Promise.all(SOUNDS.map((sound) => sound.load()));
    // Assign all buffers to their respective sounds
    buffers.forEach((buffer, index) => {
        SOUNDS[index].buffer = buffer;
    });

    CONSOLE.removeChild(document.getElementById("spinner"));

    // Process URL parameters if provided
    processUrlParameters();
}

function processUrlParameters() {
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
}

// INIT routine
window.addEventListener("load", onload);

function onload() {
    // Load embedded songs first, then initialize the UI
    loadEmbeddedSongs()
        .then(() => {
            // Setup UI components
            setupNoteButtons();
            setupControlButtons();
            setupUIControls();
            setupBeatButtons();
            setupSongButtons();
            setupKeyboardControls();

            // Initialize DOM references
            initDOM();

            // Load sounds and initialize the application
            return loadSoundAndInitialize();
        })
        .then(() => {
            // Start the animation loop
            requestAnimFrame(doAnimation);
        })
        .catch((error) => {
            console.error("Failed to initialize application:", error);
        });
}

// Clear Button Listener
function clearListener(e) {
    this.style.backgroundImage = "url(" + this.images[1].src + ")";
    SOUNDS[19].play(8);
    const self = this;
    function makePromise(num) {
        return new Promise(function (resolve, reject) {
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
            curPos = 0;
            undoHistory = []; // Clear undo history
            updateUndoButtonState(); // Update undo button state
        });

    clearSongButtons();
}

// Play Button Listener
function playListener(event) {
    this.style.backgroundImage = "url(" + this.images[1].src + ")";
    SOUNDS[17].play(8);
    DOM.stopButton.style.backgroundImage = "url(" + DOM.stopButton.images[0].src + ")";
    DOM.stopButton.disabled = false;
    this.disabled = true; // Would be unlocked by stop button

    // Disable UI controls during playback
    DOM.leftButton.disabled = true;
    DOM.rightButton.disabled = true;
    DOM.scrollBar.disabled = true;
    DOM.clearButton.disabled = true;
    DOM.songButtons.frog.disabled = true;
    DOM.songButtons.beak.disabled = true;
    DOM.songButtons["1up"].disabled = true;

    // Reset scroll position to beginning
    DOM.scrollBar.value = 0;
    curPos = 0;

    gameStatus = 1; // Mario Entering the stage
    mario.init();
    requestAnimFrame(doMarioEnter);
}

// Stop Button Listener
function stopListener(event) {
    this.style.backgroundImage = "url(" + this.images[1].src + ")";
    // Sound ON: click, OFF: called by doMarioPlay
    if (event !== undefined) SOUNDS[17].play(8);
    DOM.playButton.style.backgroundImage = "url(" + DOM.playButton.images[0].src + ")";
    //DOM.playButton.disabled = false; // Do after Mario left the stage
    this.disabled = true; // Would be unlocked by play button

    gameStatus = 3; // Mario leaves from the stage
    mario.init4leaving();
    if (animationFrameId !== 0) cancelAnimationFrame(animationFrameId);
    requestAnimFrame(doMarioLeave);
}

// Let Mario run on the stage
function doMarioEnter(timeStamp) {
    bombTimer.checkAndFire(timeStamp);
    drawScore(0, curScore.notes, 0);
    mario.enter(timeStamp);

    if (mario.marioX < 40) {
        animationFrameId = requestAnimFrame(doMarioEnter);
    } else {
        mario.init4playing(timeStamp);
        gameStatus = 2;
        animationFrameId = requestAnimFrame(doMarioPlay);
    }
}

// Let Mario play the music!
function doMarioPlay(timeStamp) {
    bombTimer.checkAndFire(timeStamp);
    mario.play(timeStamp);
    if (gameStatus === 2) {
        if (mario.marioPosition - 2 !== curScore.end - 1) {
            animationFrameId = requestAnimFrame(doMarioPlay);
        } else if (curScore.loop) {
            curPos = 0;
            mario.marioPosition = 1;
            mario.marioX = 40;
            mario.init4playing(timeStamp);
            animationFrameId = requestAnimFrame(doMarioPlay);
        } else {
            // Calls stopListener without a event arg
            stopListener.call(DOM.stopButton);
        }
    }
}

// Let Mario leave from the stage
function doMarioLeave(timeStamp) {
    bombTimer.checkAndFire(timeStamp);
    drawScore(curPos, curScore.notes, mario.marioScroll);
    mario.leave(timeStamp);

    if (mario.marioX < 247) {
        requestAnimFrame(doMarioLeave);
    } else {
        gameStatus = 0;

        // Re-enable all controls
        DOM.leftButton.disabled = false;
        DOM.rightButton.disabled = false;
        DOM.scrollBar.disabled = false;
        DOM.playButton.disabled = false;
        DOM.clearButton.disabled = false;
        DOM.songButtons.frog.disabled = false;
        DOM.songButtons.beak.disabled = false;
        DOM.songButtons["1up"].disabled = false;

        requestAnimFrame(doAnimation);
    }
}

// Clear Song Buttons
function clearSongButtons() {
    // Reset all song button states
    DOM.songButtons.frog.disabled = false;
    DOM.songButtons.frog.style.backgroundImage = "url(" + DOM.songButtons.frog.images[0].src + ")";

    DOM.songButtons.beak.disabled = false;
    DOM.songButtons.beak.style.backgroundImage = "url(" + DOM.songButtons.beak.images[0].src + ")";

    DOM.songButtons["1up"].disabled = false;
    DOM.songButtons["1up"].style.backgroundImage = "url(" + DOM.songButtons["1up"].images[0].src + ")";

    curSong = undefined;
}

// Clear Eraser Button
function clearEraserButton() {
    DOM.eraserButton.style.backgroundImage = "url(" + DOM.eraserButton.images[0].src + ")";
    eraserTimer.switch = false;
}

// Full Initialize Score
// - Just for file loading...
function fullInitScore() {
    curScore.notes = [];
    curMaxBars = 0;
    curScore.beats = 4;
    // Loop button itself has a state, so keep current value;
    // curScore.loop = false;
    curScore.end = 0;
    curScore.tempo = 0;
}

// Initialize Score
function initScore() {
    const emptyBars = [];
    for (let barIndex = 0; barIndex < DEFAULT_MAX_BARS; barIndex++) emptyBars[barIndex] = [];
    curScore.notes = emptyBars;
    curMaxBars = DEFAULT_MAX_BARS;
    DOM.scrollBar.max = DEFAULT_MAX_BARS - 6;
    DOM.scrollBar.value = 0;
    curScore.loop = false;
    DOM.loopButton.reset();
    curScore.end = DEFAULT_MAX_BARS - 1;
    curScore.tempo = DEFAULT_TEMPO;
    DOM.tempo.value = DEFAULT_TEMPO;
    curScore.beats = 4;
    const clickEvent = new Event("click");
    clickEvent.soundOff = true;
    DOM.beats4Button.dispatchEvent(clickEvent);
}

// Easiest and Fastest way to clone
function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

// Load embedded songs from JSON files
let EmbeddedSong = [];
const songFiles = ["frog.json", "beak.json", "1up.json"];

async function loadEmbeddedSongs() {
    const songs = await Promise.all(
        songFiles.map(async (file) => {
            try {
                const response = await fetch(`songs/${file}`);
                if (!response.ok) {
                    throw new Error(`Failed to load ${file}`);
                }
                return response.json();
            } catch (error) {
                console.error(`Error loading ${file}:`, error);
                return null;
            }
        })
    );
    EmbeddedSong = songs.filter((song) => song !== null);
}

// Add window resize handler
window.addEventListener("resize", () => {
    const newMagnify = Math.min(
        Math.floor((window.innerWidth * 0.96) / ORGWIDTH),
        Math.floor((window.innerHeight * 0.96) / ORGHEIGHT)
    );
    if (newMagnify !== MAGNIFY) {
        MAGNIFY = newMagnify;
        resizeScreen();
    }
});
