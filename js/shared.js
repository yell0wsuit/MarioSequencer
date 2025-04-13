/*
 *  Mario Sequencer Web edition
 *    Programmed by minghai (http://github.com/minghai)
 */

// First, check the parameters to get MAGNIFY
const OPTS = {};
window.location.search
    .slice(1)
    .split("&")
    .forEach(function (paramString) {
        const paramPair = paramString.split("=");
        OPTS[paramPair[0]] = paramPair[1];
    });

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

/*
 * GameStatus: Game mode
 *   0: Edit
 *   1: Mario Entering
 *   2: Playing
 *   3: Mario Leaving
 */
let gameStatus = 0;

// shim layer with setTimeout fallback
window.requestAnimFrame = (function () {
    return (
        window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame ||
        window.oRequestAnimationFrame ||
        window.msRequestAnimationFrame ||
        function (callback) {
            window.setTimeout(callback, 1000 / 60);
        }
    );
})();

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
                document.getElementById("tempo").value = tempo;
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

    load() {
        return new Promise((resolve, reject) => {
            const request = new XMLHttpRequest();
            request.open("GET", this.path, true);
            request.responseType = "arraybuffer";

            request.onload = () => {
                audioContext.decodeAudioData(
                    request.response,
                    (buffer) => {
                        if (!buffer) {
                            reject(new Error(`error decoding file data: ${this.path}`));
                            return;
                        }
                        resolve(buffer);
                    },
                    (error) => reject(new Error(`decodeAudioData error: ${error}`))
                );
            };

            request.onerror = () => reject(new Error("BufferLoader: XHR error"));
            request.send();
        });
    }
}

// It's me, Mario!
class MarioClass {
    constructor() {
        this.marioOffset = -16; // offset in X
        this.marioScroll = 0; // Scroll amount in dots
        this.marioX = -16; // X-position in dots.
        this.images = null;
        this.marioPosition = 0; // position in bar number
        this.state = 0;
        this.startTime = 0;
        this.lastTime = 0;
        this.isJumping = false;
        this.timer = new EasyTimer(100, (timer) => {
            this.state = this.state === 1 ? 0 : 1;
        });
        this.timer.switch = true; // forever true
    }

    init() {
        this.marioX = -16;
        this.marioPosition = 0;
        this.startTime = 0;
        this.state = 0;
        this.marioScroll = 0;
        this.marioOffset = -16;
        this.timer.switch = true;
        this.isJumping = false;
    }

    enter(timeStamp) {
        if (this.startTime === 0) this.startTime = timeStamp;

        const timeDifference = timeStamp - this.startTime;
        this.marioX = Math.floor(timeDifference / 5) + this.marioOffset;
        if (this.marioX >= 40) this.marioX = 40; // 16 + 32 - 8
        this.state = Math.floor(timeDifference / 100) % 2 === 0 ? 1 : 0;
        this.draw();
    }

    init4leaving() {
        this.marioOffset = this.marioX;
        this.startTime = 0;
        this.isJumping = false;
    }

    init4playing(timeStamp) {
        this.lastTime = timeStamp;
        this.marioOffset = this.marioX;
        this.marioScroll = 0;
        this.marioPosition = 1;
        this.state = 1;
        this.checkMarioShouldJump();
    }

    checkMarioShouldJump() {
        const notes = curScore.notes[this.marioPosition - 1];
        if (!notes || notes.length === 0) {
            this.isJumping = false;
        } else if (notes.length === 1) {
            this.isJumping = typeof notes[0] !== "string";
        } else {
            this.isJumping = true;
        }
    }

    play(timeStamp) {
        const scheduleAndPlay = (notes, time) => {
            if (time < 0) time = 0;
            if (!notes || notes.length === 0) return;

            const noteDictionary = {};
            notes.forEach((note) => {
                if (typeof note === "string") {
                    const tempo = note.split("=")[1];
                    curScore.tempo = tempo;
                    document.getElementById("tempo").value = tempo;
                    return;
                }

                const soundNumber = note >> 8;
                const scale = note & 0xff;
                if (!noteDictionary[soundNumber]) noteDictionary[soundNumber] = [scale];
                else noteDictionary[soundNumber].push(scale);
            });

            Object.entries(noteDictionary).forEach(([soundIndex, scales]) => {
                SOUNDS[soundIndex].playChord(scales, time / 1000); // [ms] -> [s]
            });
        };

        const tempo = curScore.tempo;
        let timeDifference = timeStamp - this.lastTime; // both are [ms]
        if (timeDifference > 32) timeDifference = 16; // When user hide the tag, force it
        this.lastTime = timeStamp;
        const step = (32 * timeDifference * tempo) / 60000; // (60[sec] * 1000)[msec]

        this.timer.checkAndFire(timeStamp);
        const scroll = document.getElementById("scroll");

        const nextBar = 16 + 32 * (this.marioPosition - curPos + 1) - 8;
        if (this.marioX < 120) {
            // Mario still has to run
            this.marioX += step;
            // If this step crosses the bar
            if (this.marioX >= nextBar) {
                this.marioPosition++;
                scheduleAndPlay(curScore.notes[this.marioPosition - 2], 0); // Ignore diff
                this.checkMarioShouldJump();
            } else {
                // 32 dots in t[sec/1beat]
                if (this.marioX >= 120) {
                    this.marioScroll = this.marioX - 120;
                    this.marioX = 120;
                }
            }
        } else if (curPos <= curScore.end - 6) {
            // Scroll
            this.marioX = 120;
            if (this.marioScroll < 16 && this.marioScroll + step > 16) {
                this.marioPosition++;
                this.marioScroll += step;
                scheduleAndPlay(curScore.notes[this.marioPosition - 2], 0); // Ignore error
                this.checkMarioShouldJump();
            } else {
                this.marioScroll += step;
                if (this.marioScroll > 32) {
                    this.marioScroll -= 32;
                    curPos++;
                    scroll.value = curPos;
                    if (curPos > curScore.end - 6) {
                        this.marioX += this.marioScroll;
                        this.marioScroll = 0;
                    }
                }
            }
        } else {
            this.marioX += step;
            // If this step crosses the bar
            if (this.marioX >= nextBar) {
                this.marioPosition++;
                scheduleAndPlay(curScore.notes[this.marioPosition - 2], 0); // Ignore diff
                this.checkMarioShouldJump();
            }
        }
        drawScore(curPos, curScore.notes, this.marioScroll);
        this.draw();
    }

    jump(position) {
        const jumpHeights = [
            0, 2, 4, 6, 8, 10, 12, 13, 14, 15, 16, 17, 18, 18, 19, 19, 19, 19, 19, 18, 18, 17, 16, 15, 14, 13, 12, 10,
            8, 6, 4, 2, 0,
        ];
        return jumpHeights[Math.round(position) % 32];
    }

    draw() {
        let verticalPosition = 41 - 22;
        let state = this.state;
        if (this.isJumping) {
            state = 2;
            if (this.marioX === 120) {
                // In scroll mode
                // (scroll == 16) is just on the bar, 0 and 32 is on the center of between bars
                if (this.marioScroll !== 16) {
                    verticalPosition -= this.jump(
                        this.marioScroll > 16 ? this.marioScroll - 16 : this.marioScroll + 16
                    );
                } /* if scroll == 16 then Mario should be on the ground */
            } else {
                // Running to the center, or leaving to the goal
                verticalPosition -= this.jump(Math.round((this.marioX - 8) % 32));
            }
        }

        L2C.drawImage(this.images[state], this.marioX * MAGNIFY, verticalPosition * MAGNIFY);
    }

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
            const sweatImageWidth = sweatImg.width;
            const sweatImageHeight = sweatImg.height;
            L2C.drawImage(
                sweatImg,
                0,
                0,
                sweatImageWidth,
                sweatImageHeight,
                (this.marioX - (sweatImageWidth + 1)) * MAGNIFY,
                (41 - 22) * MAGNIFY,
                sweatImageWidth * MAGNIFY,
                sweatImageHeight * MAGNIFY
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
const SOUNDS = [];
for (let i = 1; i < 21; i++) {
    let paddedNumber = "0";
    paddedNumber += i.toString();
    let file = "wav/sound" + paddedNumber.slice(-2) + ".wav";
    let soundEntity = new SoundEntity(file);
    SOUNDS[i - 1] = soundEntity;
}

// Prepare Mat
const MAT = document.getElementById("layer1");
MAT.width = ORGWIDTH * MAGNIFY;
MAT.height = ORGHEIGHT * MAGNIFY;
const L1C = MAT.getContext("2d");
L1C.imageSmoothingEnabled = false;
const matImage = new Image();
matImage.src = "images/mat.png";
matImage.onload = function () {
    L1C.drawImage(matImage, 0, 0, matImage.width * MAGNIFY, matImage.height * MAGNIFY);
};

// Prepare Characters
const charSheet = new Image();
charSheet.src = "images/character_sheet.png";

// Prepare the Bomb!
let BOMBS = [];
const bombImg = new Image();
bombImg.src = "images/bomb.png";
const bombTimer = new EasyTimer(150, drawBomb);
bombTimer.switch = true; // always true for the bomb
bombTimer.currentFrame = 0;

function drawBomb(mySelf) {
    const bombX = 9 * MAGNIFY;
    const bombY = 202 * MAGNIFY;
    const bombImage = BOMBS[mySelf.currentFrame];
    L1C.drawImage(bombImage, bombX, bombY);
    switch (mySelf.currentFrame) {
        case 0:
            mySelf.currentFrame = 1;
            break;
        case 1:
            mySelf.currentFrame = 0;
            break;
        case 2:
            break;
    }
    if (curSong == undefined || gameStatus != 2) return;
    curSong.style.backgroundImage = "url(" + curSong.images[mySelf.currentFrame + 1].src + ")";
}

// Prepare the G-Clef. (x, y) = (9, 48)
const GClef = new Image();
GClef.src = "images/G_Clef.png";

// Prepare the numbers
const numImg = new Image();
numImg.src = "images/numbers.png";

// Prepare the Mario images
const marioImg = new Image();
marioImg.src = "images/Mario.png";

const sweatImg = new Image();
sweatImg.src = "images/mario_sweat.png";

// Prepare the Play button
const playBtnImg = new Image();
playBtnImg.src = "images/play_button.png";

// Prepare the Stop button
const stopBtnImg = new Image();
stopBtnImg.src = "images/stop_button.png";

// Prepare the CLEAR button
const clearImg = new Image();
clearImg.src = "images/clear_button.png";

// Prepare tempo range slider thumb image
const thumbImg = new Image();
thumbImg.src = "images/slider_thumb.png";

// Prepare beat button
const beatImg = new Image();
beatImg.src = "images/beat_button.png";

// Prepare Song buttons
const songImg = new Image();
songImg.src = "images/song_buttons.png";

// Prepare End Mark
const endImg = new Image();
endImg.src = "images/end_mark.png";

// Prepare Semitone
const semitoneImg = new Image();
semitoneImg.src = "images/semitone.png";

// Prepare the repeat marks
const repeatImg = new Image();
repeatImg.src = "images/repeat_head.png";

function drawRepeatHead(xPosition) {
    const repeatMarkWidth = repeatMark[0].width;
    const repeatMarkHeight = repeatMark[0].height;
    L2C.drawImage(repeatMark[0], xPosition * MAGNIFY, 56 * MAGNIFY);
}

// Score Area (8, 41) to (247, 148)
function drawScore(position, notes, scroll) {
    // Clip only X
    L2C.clearRect(0, 0, SCREEN.width, SCREEN.height);
    L2C.save();
    L2C.rect(8 * MAGNIFY, 0, (247 - 8 + 1) * MAGNIFY, SCRHEIGHT * MAGNIFY);
    L2C.clip();

    // If mouse cursor on or under the C, draw horizontal line
    const mouseRealX = mouseX - offsetLeft;
    const mouseRealY = mouseY - offsetTop;
    let gridPosition = toGrid(mouseRealX, mouseRealY);
    let gridX;
    let gridY;
    // Edit mode only, no scroll
    if (gameStatus == 0 && gridPosition !== false) {
        gridX = gridPosition[0];
        gridY = gridPosition[1];
        if (gridY >= 11) drawHorizontalBar(gridX, 0);
    }

    if (position == 0) {
        const gClefWidth = GClef.width;
        const gClefHeight = GClef.height;
        // GClef image is NOT magnified yet.
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

        if (curScore.loop) {
            drawRepeatHead(41 - scroll);
        }
    } else if (position == 1 && curScore.loop) {
        drawRepeatHead(9 - scroll);
    }

    //ORANGE #F89000
    const beats = curScore.beats;
    // orange = 2, 1, 0, 3, 2, 1, 0, 3, ..... (if beats = 4)
    //        = 2, 1, 0, 2, 1, 0, 2, 1, ..... (if beats = 3)
    const orangeBeat = beats == 4 ? 3 - ((position + 1) % 4) : 2 - ((position + 3) % 3);
    let barIndex = position < 2 ? 2 - position : 0;
    for (; barIndex < 9; barIndex++) {
        const originalX = 16 + 32 * barIndex - scroll;
        const x = originalX * MAGNIFY;
        const barNumber = position + barIndex - 2;

        if (barNumber == curScore.end) {
            const endMarkImage = curScore.loop ? repeatMark[1] : endMark;
            L2C.drawImage(endMarkImage, x - 7 * MAGNIFY, 56 * MAGNIFY);
        }

        L2C.beginPath();
        L2C.setLineDash([MAGNIFY, MAGNIFY]);
        L2C.lineWidth = MAGNIFY;
        if (barIndex % beats == orangeBeat) {
            if (gameStatus == 0) drawBarNumber(barIndex, barNumber / beats + 1);
            L2C.strokeStyle = "#F89000";
        } else {
            L2C.strokeStyle = "#A0C0B0";
        }
        L2C.moveTo(x, 41 * MAGNIFY);
        L2C.lineTo(x, 148 * MAGNIFY);
        L2C.stroke();

        const barNotes = notes[barNumber];
        if (barNotes == undefined) continue;

        // Get notes down
        let noteDelta = 0;
        if (gameStatus == 2 && mario.marioPosition - 2 == barNumber) {
            let noteIndex;
            if (mario.marioX == 120) {
                noteIndex = mario.marioScroll >= 16 ? mario.marioScroll - 16 : mario.marioScroll + 16;
            } else {
                noteIndex = mario.marioX + 8 - originalX;
            }
            const jumpTable = [
                0, 1, 2, 3, 3, 4, 5, 5, 6, 6, 7, 7, 8, 8, 8, 8, 8, 8, 8, 8, 8, 7, 7, 6, 6, 5, 5, 4, 3, 3, 2, 1, 0,
            ];
            noteDelta = jumpTable[Math.round(noteIndex)];
        }
        let hasHighNote = false;
        for (let noteIndex = 0; noteIndex < barNotes.length; noteIndex++) {
            if (typeof barNotes[noteIndex] == "string") continue; // for dynamic TEMPO

            const soundNumber = barNotes[noteIndex] >> 8;
            const noteScale = barNotes[noteIndex] & 0x0f;
            // When curChar is eraser, and the mouse cursor is on the note,
            // an Image of note blinks.
            if (
                curChar == 16 &&
                gridPosition != false &&
                barIndex == gridX &&
                noteScale == gridY &&
                eraserTimer.currentFrame == 1
            ) {
                continue;
            }

            if (!hasHighNote && noteScale >= 11) {
                hasHighNote = true;
                drawHorizontalBar(barIndex, scroll);
            }
            L2C.drawImage(SOUNDS[soundNumber].image, x - HALFCHARSIZE, (40 + noteScale * 8 + noteDelta) * MAGNIFY);

            const x2 = x - 13 * MAGNIFY;
            const y = (44 + noteScale * 8 + noteDelta) * MAGNIFY;
            if ((barNotes[noteIndex] & 0x80) != 0) {
                L2C.drawImage(Semitones[0], x2, y);
            } else if ((barNotes[noteIndex] & 0x40) != 0) {
                L2C.drawImage(Semitones[1], x2, y);
            }
        }
    }
    if (gameStatus == 0) {
        L2C.beginPath();
        L2C.setLineDash([7 * MAGNIFY, 2 * MAGNIFY, 7 * MAGNIFY, 0]);
        L2C.lineWidth = MAGNIFY;
        L2C.strokeStyle = "#F00";
        const xorg = 16 + 32 * gridX - 8;
        const x = xorg * MAGNIFY;
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
    if (digitCount == 1) x += 2 * MAGNIFY;
    while (numberDigits.length > 0) {
        const digit = numberDigits.pop();
        const digitWidth = digit == 4 ? 5 : 4;
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
    if (gridX % 2 != 0) return false; // Not near the bar
    gridX /= 2;
    const gridY = Math.floor((mouseRealY - gridTop) / HALFCHARSIZE);

    // Consider G-Clef and repeat head area
    if ((curPos == 0 && gridX < 2) || (curPos == 1 && gridX == 0)) return false;
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

function mouseClickListener(event) {
    if (gameStatus != 0) return;
    event.preventDefault();

    const mouseRealX = event.clientX - offsetLeft;
    const mouseRealY = event.clientY - offsetTop;

    const gridPosition = toGrid(mouseRealX, mouseRealY);
    if (gridPosition == false) return;
    const gridX = gridPosition[0];
    let gridY = gridPosition[1];

    // Map logical x to real bar number
    const barNumber = curPos + gridX - 2;

    // process End Mark
    if (curChar == 15) {
        curScore.end = barNumber;
        return;
    }

    if (barNumber >= curScore.end) return;

    const barNotes = curScore["notes"][barNumber];
    // Delete
    if (curChar == 16 || event.button == 2) {
        // Delete Top of the stack
        for (let i = barNotes.length - 1; i >= 0; i--) {
            if ((barNotes[i] & 0x3f) == gridY) {
                barNotes.splice(i, 1);
                curScore.notes[barNumber] = barNotes;
                SOUNDS[17].play(8);
                break;
            }
        }
        return;
    }

    let note = (curChar << 8) | gridY;
    if (barNotes.indexOf(note) != -1) return;
    //
    // Handle semitone
    if (event.shiftKey) gridY |= 0x80;
    if (event.ctrlKey) gridY |= 0x40;
    SOUNDS[curChar].play(gridY);
    note = (curChar << 8) | gridY;
    barNotes.push(note);
    curScore["notes"][barNumber] = barNotes;
}

SCREEN.addEventListener("mousemove", function (e) {
    mouseX = e.clientX;
    mouseY = e.clientY;
});

// Read MSQ File
// You really need this "dragover" event listener.
// Check StackOverflow: http://bit.ly/1hHEINZ
SCREEN.addEventListener("dragover", function (e) {
    e.preventDefault();
    return false;
});
// Translate dropped MSQ files into inner SCORE array.
// You have to handle each file sequencially,
// But you might want to download files parallel.
// In such a case, Promise is very convinient utility.
// http://www.html5rocks.com/en/tutorials/es6/promises/
SCREEN.addEventListener("drop", function (e) {
    e.preventDefault();
    clearSongButtons();
    fullInitScore();
    // function to read a given file
    // Input is a instance of a File object.
    // Returns a instance of a Promise.
    function readFile(file) {
        return new Promise(function (resolve, reject) {
            const reader = new FileReader();
            reader.name = file.name;
            reader.addEventListener("load", function (e) {
                resolve(e.target);
            });
            reader.readAsText(file, "shift-jis");
        });
    }

    // FileList to Array for Mapping
    const files = [].slice.call(e.dataTransfer.files);
    // Support Mr.Phenix's files. He numbered files with decimal numbers :-)
    // http://music.geocities.jp/msq_phenix/
    // For example, suite15.5.msq must be after the suite15.msq
    files.sort(function (a, b) {
        const n1 = a.name;
        const n2 = b.name;
        function strip(name) {
            const n = /\d+\.\d+|\d+/.exec(name);
            if (n == null) return 0;
            return parseFloat(n[0]);
        }
        return strip(n1) - strip(n2);
    });
    files
        .map(readFile)
        .reduce(function (chain, fp, idx) {
            return chain
                .then(function () {
                    return fp;
                })
                .then(function (fileReader) {
                    const ext = fileReader.name.slice(-3);
                    if (ext == "msq") {
                        addMSQ(fileReader.result);
                    } else {
                        addJSON(fileReader.result);
                    }
                })
                .catch(function (err) {
                    alert("Loading MSQ failed: " + err.message);
                    console.log(err);
                });
        }, Promise.resolve())
        .then(closing);

    return false;
});

// Closing to add files to the score
//   Configure Score parameters
function closing() {
    // Finally, after reducing, set parameters to Score
    const b = document.getElementById(curScore.beats == 3 ? "3beats" : "4beats");
    const e = new Event("click");
    e.soundOff = true;
    b.dispatchEvent(e);

    const r = document.getElementById("scroll");
    curMaxBars = curScore.end + 1;
    r.max = curMaxBars - 6;
    r.value = 0;
    curPos = 0;

    const tempo = curScore.notes[0][0];
    if (typeof tempo == "string" && tempo.slice(0, 5) == "TEMPO") {
        const tempoValue = tempo.split("=")[1];
        curScore.tempo = tempoValue;
        document.getElementById("tempo").value = tempoValue;
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
            if (s[i] === "\r" || s[i] == undefined) break out;
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
    if (curScore.tempo != values.TEMPO) curScore.notes[oldEnd].splice(0, 0, "TEMPO=" + values.TEMPO);
    curScore.tempo = values.TEMPO;
    const beats = values.TIME44 == "TRUE" ? 4 : 3;
    curScore.beats = beats;
    // click listener will set curScore.loop
    const b = document.getElementById("loop");
    values.LOOP == "TRUE" ? b.set() : b.reset();
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
    if (curScore.tempo != json.tempo && notes.length != 0) {
        const tempostr = notes[0];
        if (typeof tempostr != "string") {
            notes.splice(0, 0, "TEMPO=" + json.tempo);
        }
    }
    curScore.tempo = json.tempo;

    curScore.end += json.end;

    const b = document.getElementById("loop");
    if (curScore.loop) b.set;
    else b.reset();
}

function doAnimation(time) {
    // Bomb
    bombTimer.checkAndFire(time);
    eraserTimer.checkAndFire(time);
    endMarkTimer.checkAndFire(time);

    drawScore(curPos, curScore["notes"], 0);

    if (gameStatus != 0) return;

    requestAnimFrame(doAnimation);
}

function makeButton(x, y, width, height, type = "button", ariaLabel = "") {
    const button = document.createElement("button");
    button.className = "game";
    button.style.position = "absolute";
    button.style.cursor = "pointer";
    button.type = type;
    if (ariaLabel) {
        button.setAttribute("aria-label", ariaLabel);
    }
    moveDOM(button, x, y);
    resizeDOM(button, width, height);
    button.style.zIndex = "3";
    button.style.background = "rgba(0,0,0,0)";

    // Save position and size for later use
    button.originalX = x;
    button.originalY = y;
    button.originalW = width;
    button.originalH = height;
    button.redraw = () => {
        moveDOM(button, button.originalX, button.originalY);
        resizeDOM(button, button.originalW, button.originalH);
    };

    // Add observer to update cursor based on disabled state
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === "disabled") {
                button.style.cursor = button.disabled ? "not-allowed" : "pointer";
            }
        });
    });
    observer.observe(button, { attributes: true });

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

const resizeScreen = () => {
    CHARSIZE = 16 * MAGNIFY;
    HALFCHARSIZE = Math.floor(CHARSIZE / 2);

    // Update console dimensions
    CONSOLE.style.width = `${ORGWIDTH * MAGNIFY}px`;
    CONSOLE.style.height = `${ORGHEIGHT * MAGNIFY}px`;

    // Center the console in the viewport
    //CONSOLE.style.position = 'absolute';
    //CONSOLE.style.left = `${(window.innerWidth - ORGWIDTH * MAGNIFY) / 2}px`;
    //CONSOLE.style.top = `${(window.innerHeight - ORGHEIGHT * MAGNIFY) / 2}px`;

    // Update offsets for cursor positioning
    offsetLeft = CONSOLE.offsetLeft;
    offsetTop = CONSOLE.offsetTop;

    BOMBS = sliceImage(bombImg, 14, 18);
    mario.images = sliceImage(marioImg, 16, 22);
    Semitones = sliceImage(semitoneImg, 5, 12);

    MAT.width = ORGWIDTH * MAGNIFY;
    MAT.height = ORGHEIGHT * MAGNIFY;
    L1C.drawImage(matImage, 0, 0, matImage.width * MAGNIFY, matImage.height * MAGNIFY);

    SCREEN.width = ORGWIDTH * MAGNIFY;
    SCREEN.height = SCRHEIGHT * MAGNIFY;

    const characterImages = sliceImage(charSheet, 16, 16);
    BUTTONS.forEach((button, index) => {
        button.redraw();
        if (index < 15) button.se.image = characterImages[index];
    });
    BUTTONS[15].images = sliceImage(endImg, 14, 13);
    endMarkTimer.images = BUTTONS[15].images;

    // Endmark Cursor (= 15) will be redrawn by its animation
    // Eraser (= 16) will be redrawn later below
    if (curChar < 15) {
        changeCursor(curChar);
    }

    if (curChar === 15) drawEndMarkIcon(BUTTONS[15].images[0]);
    else if (curChar === 16) drawEraserIcon();
    else drawCurChar(SOUNDS[curChar].image);

    const playButton = document.getElementById("play");
    playButton.redraw();
    playButton.images = sliceImage(playBtnImg, 12, 15);
    const playButtonState = playButton.disabled ? 1 : 0;
    playButton.style.backgroundImage = `url(${playButton.images[playButtonState].src})`;

    const stopButton = document.getElementById("stop");
    stopButton.redraw();
    const stopButtonImages = sliceImage(stopBtnImg, 16, 15);
    stopButton.images = [stopButtonImages[0], stopButtonImages[1]];
    stopButton.style.backgroundImage = `url(${stopButton.images[1 - playButtonState].src})`;

    const loopButton = document.getElementById("loop");
    loopButton.redraw();
    loopButton.images = [stopButtonImages[2], stopButtonImages[3]]; // made in Stop button (above)
    const loopButtonState = curScore.loop ? 1 : 0;
    loopButton.style.backgroundImage = `url(${loopButton.images[loopButtonState].src})`;

    // Prepare Repeat (global!)
    repeatMark = sliceImage(repeatImg, 13, 62);
    endMark = repeatMark[2];

    const scrollBar = document.getElementById("scroll");
    moveDOM(scrollBar, scrollBar.originalX, scrollBar.originalY);
    resizeDOM(scrollBar, scrollBar.originalW, scrollBar.originalH);
    const styleRules = pseudoSheet.cssRules;
    for (let i = 0; i < styleRules.length; i++) {
        if (styleRules[i].selectorText === "#scroll::-webkit-slider-thumb") {
            pseudoSheet.deleteRule(i);
            pseudoSheet.insertRule(
                `#scroll::-webkit-slider-thumb {
                    -webkit-appearance: none !important;
                    border-radius: 0px;
                    background-color: #A870D0;
                    box-shadow:inset 0 0 0px;
                    border: 0px;
                    width: ${5 * MAGNIFY}px;
                    height:${7 * MAGNIFY}px;
                }`,
                0
            );
        }
    }

    const leftButton = document.getElementById("toLeft");
    leftButton.redraw();
    const rightButton = document.getElementById("toRight");
    rightButton.redraw();
    const clearButton = document.getElementById("clear");
    clearButton.redraw();
    clearButton.images = sliceImage(clearImg, 34, 16);
    clearButton.style.backgroundImage = `url(${clearButton.images[0].src})`;

    // Make number images from the number sheet
    NUMBERS = sliceImage(numImg, 5, 7);

    const beats3Button = document.getElementById("3beats");
    beats3Button.redraw();
    const beatImages = sliceImage(beatImg, 14, 15);
    beats3Button.images = [beatImages[0], beatImages[1]];
    const beatsButtonState = curScore.beats === 3 ? 1 : 0;
    beats3Button.style.backgroundImage = `url(${beats3Button.images[beatsButtonState].src})`;
    const beats4Button = document.getElementById("4beats");
    beats4Button.redraw();
    beats4Button.images = [beatImages[2], beatImages[3]];
    beats4Button.style.backgroundImage = `url(${beats4Button.images[1 - beatsButtonState].src})`;

    const frogButton = document.getElementById("frog");
    frogButton.redraw();
    const songImages = sliceImage(songImg, 15, 17);
    frogButton.images = [songImages[0], songImages[1], songImages[2]];
    const frogButtonState = curSong === frogButton ? 1 : 0;
    frogButton.style.backgroundImage = `url(${frogButton.images[frogButtonState].src})`;
    const beakButton = document.getElementById("beak");
    beakButton.redraw();
    beakButton.images = [songImages[3], songImages[4], songImages[5]];
    const beakButtonState = curSong === beakButton ? 1 : 0;
    beakButton.style.backgroundImage = `url(${beakButton.images[beakButtonState].src})`;
    const oneUpButton = document.getElementById("1up");
    oneUpButton.redraw();
    oneUpButton.images = [songImages[6], songImages[7], songImages[8]];
    const oneUpButtonState = curSong === oneUpButton ? 1 : 0;
    oneUpButton.style.backgroundImage = `url(${oneUpButton.images[oneUpButtonState].src})`;
    const eraserButton = document.getElementById("eraser");
    eraserButton.redraw();
    eraserButton.images = [songImages[9], songImages[10], songImages[11]];
    let eraserButtonState;
    if (curChar === 16) {
        eraserButtonState = 1;
        SCREEN.style.cursor = `url(${eraserButton.images[2].src}) 0 0, auto`;
    } else {
        eraserButtonState = 0;
    }
    eraserButton.style.backgroundImage = `url(${eraserButton.images[eraserButtonState].src})`;

    const tempoSlider = document.getElementById("tempo");
    moveDOM(tempoSlider, tempoSlider.originalX, tempoSlider.originalY);
    resizeDOM(tempoSlider, tempoSlider.originalW, tempoSlider.originalH);
    for (let i = 0; i < styleRules.length; i++) {
        if (styleRules[i].selectorText === "#tempo::-webkit-slider-thumb") {
            pseudoSheet.deleteRule(i);
            pseudoSheet.insertRule(
                `#tempo::-webkit-slider-thumb {
                    -webkit-appearance: none !important;
                    background-image: url('${tempoSlider.image.src}');
                    background-repeat: no-repeat;
                    background-size: 100% 100%;
                    border: 0px;
                    width: ${5 * MAGNIFY}px;
                    height:${8 * MAGNIFY}px;
                }`,
                0
            );
        }
    }
};

const sliceImage = (image, width, height) => {
    const result = [];
    const imageWidth = image.width * MAGNIFY;
    const imageHeight = image.height * MAGNIFY;
    const horizontalCount = Math.floor(image.width / width);
    const totalCount = horizontalCount * Math.floor(image.height / height);
    const charWidth = width * MAGNIFY;
    const charHeight = height * MAGNIFY;

    for (let i = 0; i < totalCount; i++) {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = charWidth;
        tempCanvas.height = charHeight;
        const tempContext = tempCanvas.getContext("2d");
        tempContext.imageSmoothingEnabled = false;
        tempContext.drawImage(
            image,
            (i % horizontalCount) * width,
            Math.floor(i / horizontalCount) * height,
            width,
            height,
            0,
            0,
            charWidth,
            charHeight
        );
        const charImage = new Image();
        charImage.src = tempCanvas.toDataURL();
        result[i] = charImage;
    }
    return result;
};

const download = () => {
    const link = document.createElement("a");
    link.download = "MSQ_Data.json";
    const json = JSON.stringify(curScore);
    const blob = new Blob([json], { type: "octet/stream" });
    const url = window.URL.createObjectURL(blob);
    link.href = url;
    link.click();
};

// INIT routine
window.addEventListener("load", onload);
function onload() {
    // Load embedded songs first
    loadEmbeddedSongs()
        .then(() => {
            // Make buttons for changing a kind of notes.
            //   1st mario:   x=24, y=8, width=13, height=14
            //   2nd Kinopio: X=38, y=8, width=13, height=14
            //   and so on...
            const buttonImages = sliceImage(charSheet, 16, 16);
            for (let i = 0; i < 15; i++) {
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
                BUTTONS[i] = button;
            }

            // Prepare End Mark button (Char. No. 15)
            const endMarkButton = makeButton(235, 8, 13, 14, "button", "Add end mark");
            endMarkButton.images = sliceImage(endImg, 14, 13); // Note: Different size from the button
            endMarkTimer = new EasyTimer(150, function (self) {
                // If current is not end mark, just return;
                if (curChar != 15) {
                    self.switch = false;
                    return;
                }
                self.currentFrame = self.currentFrame == 0 ? 1 : 0;
                SCREEN.style.cursor =
                    "url(" + self.images[self.currentFrame].src + ")" + 7 * MAGNIFY + " " + 7 * MAGNIFY + ", auto";
            });
            endMarkTimer.images = endMarkButton.images;
            endMarkTimer.currentFrame = 0;
            endMarkButton.addEventListener("click", function () {
                endMarkTimer.switch = true;
                curChar = 15;
                SOUNDS[15].play(8);
                clearEraserButton();
                drawEndMarkIcon(this.images[0]);
            });
            CONSOLE.appendChild(endMarkButton);
            BUTTONS[15] = endMarkButton;

            // For inserting pseudo elements' styles
            const style = document.createElement("style");
            document.head.appendChild(style);
            pseudoSheet = style.sheet;

            // Prepare Play Button (55, 168)
            const playButton = makeButton(55, 168, 12, 15, "button", "Play music");
            playButton.id = "play";
            playButton.images = sliceImage(playBtnImg, 12, 15);
            playButton.style.backgroundImage = "url(" + playButton.images[0].src + ")";
            playButton.addEventListener("click", playListener);
            style.sheet.insertRule("#play:focus {outline: none !important;}", 0);
            CONSOLE.appendChild(playButton);

            // Prepare Stop Button (21, 168)
            const stopButton = makeButton(21, 168, 16, 15, "button", "Stop music");
            stopButton.id = "stop";
            stopButton.disabled = true;
            // stopbtn image including loop button (next)
            const stopButtonImages = sliceImage(stopBtnImg, 16, 15);
            stopButton.images = [stopButtonImages[0], stopButtonImages[1]];
            stopButton.style.backgroundImage = "url(" + stopButton.images[1].src + ")";
            stopButton.addEventListener("click", stopListener);
            style.sheet.insertRule("#stop:focus {outline: none !important;}", 0);
            CONSOLE.appendChild(stopButton);

            // Prepare Loop Button (85, 168)
            const loopButton = makeButton(85, 168, 16, 15, "button", "Toggle music loop");
            loopButton.id = "loop";
            loopButton.images = [stopButtonImages[2], stopButtonImages[3]]; // made in Stop button (above)
            loopButton.style.backgroundImage = "url(" + loopButton.images[0].src + ")";
            curScore.loop = false;
            loopButton.addEventListener("click", function (event) {
                let buttonState;
                if (curScore.loop) {
                    curScore.loop = false;
                    buttonState = 0;
                } else {
                    curScore.loop = true;
                    buttonState = 1;
                }
                this.style.backgroundImage = "url(" + this.images[buttonState].src + ")";
                SOUNDS[17].play(8);
            });
            loopButton.reset = function () {
                curScore.loop = false;
                this.style.backgroundImage = "url(" + this.images[0].src + ")";
            };
            loopButton.set = function () {
                curScore.loop = true;
                this.style.backgroundImage = "url(" + this.images[1].src + ")";
            };
            style.sheet.insertRule("#loop:focus {outline: none !important;}", 0);
            CONSOLE.appendChild(loopButton);

            // Prepare Repeat (global!)
            repeatMark = sliceImage(repeatImg, 13, 62);
            endMark = repeatMark[2];

            // Prepare Scroll Range
            const scrollBar = document.createElement("input");
            scrollBar.id = "scroll";
            scrollBar.type = "range";
            scrollBar.setAttribute("aria-label", "Scroll through music");
            scrollBar.style.cursor = "pointer";
            scrollBar.value = 0;
            scrollBar.max = curMaxBars - 6;
            scrollBar.min = 0;
            scrollBar.step = 1;
            scrollBar.style["-webkit-appearance"] = "none";
            scrollBar.style["border-radius"] = "0px";
            scrollBar.style["background-color"] = "#F8F8F8";
            scrollBar.style["box-shadow"] = "inset 0 0 0 #000";
            scrollBar.style["vertical-align"] = "middle";
            scrollBar.style.position = "absolute";
            scrollBar.style.margin = 0;
            scrollBar.originalX = 191;
            scrollBar.originalY = 159;
            scrollBar.originalW = 50;
            scrollBar.originalH = 7;
            moveDOM(scrollBar, scrollBar.originalX, scrollBar.originalY);
            resizeDOM(scrollBar, scrollBar.originalW, scrollBar.originalH);
            scrollBar.addEventListener("input", function (event) {
                if (gameStatus === 0) {
                    // Only allow scrolling in edit mode
                    curPos = parseInt(this.value);
                }
            });
            CONSOLE.appendChild(scrollBar);

            // It's very hard to set values to a pseudo element with JS.
            // http://pankajparashar.com/posts/modify-pseudo-elements-css/
            style.sheet.insertRule(
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
            style.sheet.insertRule("#scroll:focus {outline: none !important;}", 0);

            // Make number images from the number sheet
            NUMBERS = sliceImage(numImg, 5, 7);

            // Prepare Beat buttons w=14, h=15 (81, 203) (96, 203)
            // (1) Disable self, Enable the other
            // (2) Change both images
            // (3) Play Sound
            // (4) Set curScore.beat
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
            const beats3Button = makeButton(81, 203, 14, 15, "button", "Set 3 beats per measure");
            beats3Button.id = "3beats";
            beats3Button.beats = 3;
            beats3Button.images = [beatImages[0], beatImages[1]];
            beats3Button.style.backgroundImage = "url(" + beats3Button.images[0].src + ")";
            beats3Button.disabled = false;
            CONSOLE.appendChild(beats3Button);
            const beats4Button = makeButton(96, 203, 14, 15, "button", "Set 4 beats per measure");
            beats4Button.id = "4beats";
            beats4Button.beats = 4;
            beats4Button.images = [beatImages[2], beatImages[3]];
            beats4Button.style.backgroundImage = "url(" + beats4Button.images[1].src + ")";
            beats4Button.disabled = true;
            CONSOLE.appendChild(beats4Button);
            const updateBeats = function (self) {
                curScore.beats = self.beats;
            };
            beats3Button.addEventListener("click", makeExclusiveFunction([beats3Button, beats4Button], 0, updateBeats));
            beats4Button.addEventListener("click", makeExclusiveFunction([beats3Button, beats4Button], 1, updateBeats));

            // Preapre Song Buttons (136, 202) 15x17, 160 - 136 = 24
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
                document.getElementById("tempo").value = curScore.tempo;
                const loopButton = document.getElementById("loop");
                if (curScore.loop) loopButton.set();
                else loopButton.reset();
                const scrollBar = document.getElementById("scroll");
                scrollBar.max = curScore.end - 5;
                scrollBar.value = 0;
                curPos = 0;
                curSong = self;
            };
            songButtons[0].addEventListener("click", makeExclusiveFunction(songButtons, 0, loadSong));
            songButtons[1].addEventListener("click", makeExclusiveFunction(songButtons, 1, loadSong));
            songButtons[2].addEventListener("click", makeExclusiveFunction(songButtons, 2, loadSong));

            // Prepare Eraser (Warning: Depends on the Song button images)
            const eraserButton = makeButton(40, 202, 15, 17, "button", "Erase notes");
            eraserButton.id = "eraser";
            eraserButton.images = [songImages[9], songImages[10], songImages[11]]; // In the Song button images
            eraserButton.style.backgroundImage = "url(" + eraserButton.images[0].src + ")";
            eraserTimer = new EasyTimer(200, function (self) {
                // If current is not end mark, just return;
                if (curChar != 16) {
                    self.switch = false;
                    return;
                }
                self.currentFrame = self.currentFrame == 0 ? 1 : 0;
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

            // Prepare tempo range
            // (116, 172) width 40px, height 8px
            const tempoSlider = document.createElement("input");
            tempoSlider.id = "tempo";
            tempoSlider.type = "range";
            tempoSlider.setAttribute("aria-label", "Adjust tempo");
            tempoSlider.style.cursor = "pointer";
            tempoSlider.value = 525;
            tempoSlider.max = 1000;
            tempoSlider.min = 50;
            tempoSlider.step = 1;
            tempoSlider.style["-webkit-appearance"] = "none";
            tempoSlider.style["border-radius"] = "0px";
            tempoSlider.style["background-color"] = "rgba(0, 0, 0, 0.0)";
            tempoSlider.style["box-shadow"] = "inset 0 0 0 #000";
            tempoSlider.style["vertical-align"] = "middle";
            tempoSlider.style.position = "absolute";
            tempoSlider.style.margin = 0;
            tempoSlider.originalX = 116;
            tempoSlider.originalY = 172;
            tempoSlider.originalW = 40;
            tempoSlider.originalH = 8;
            moveDOM(tempoSlider, tempoSlider.originalX, tempoSlider.originalY);
            resizeDOM(tempoSlider, tempoSlider.originalW, tempoSlider.originalH);
            tempoSlider.addEventListener("input", function (event) {
                curScore.tempo = parseInt(this.value);
            });
            CONSOLE.appendChild(tempoSlider);

            const thumbImage = sliceImage(thumbImg, 5, 8)[0];
            tempoSlider.image = thumbImage;
            // It's very hard to set values to a pseudo element with JS.
            // http://pankajparashar.com/posts/modify-pseudo-elements-css/
            style.sheet.insertRule(
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
            style.sheet.insertRule("#tempo:focus {outline: none !important;}", 0);

            // Prepare range's side buttons for inc/decrements
            const leftButton = makeButton(184, 158, 7, 9, "button", "Scroll left");
            leftButton.id = "toLeft";
            leftButton.addEventListener("click", function (event) {
                const scrollBar = document.getElementById("scroll");
                if (scrollBar.value > 0) {
                    curPos = --scrollBar.value;
                }
            });
            CONSOLE.appendChild(leftButton);

            const rightButton = makeButton(241, 158, 7, 9, "button", "Scroll right");
            rightButton.id = "toRight";
            rightButton.addEventListener("click", function (event) {
                const scrollBar = document.getElementById("scroll");
                if (scrollBar.value < curMaxBars - 6) {
                    curPos = ++scrollBar.value;
                }
            });
            CONSOLE.appendChild(rightButton);

            // Prepare CLEAR button (200, 176)
            const clearButton = makeButton(200, 176, 34, 16, "button", "Clear all notes");
            clearButton.id = "clear";
            clearButton.images = sliceImage(clearImg, 34, 16);
            clearButton.style.backgroundImage = "url(" + clearButton.images[0].src + ")";
            clearButton.addEventListener("click", clearListener);
            CONSOLE.appendChild(clearButton);
            style.sheet.insertRule("#clear:focus {outline: none !important;}", 0);

            // Prepare current empty score
            initScore();

            // Initializing Screen
            curPos = 0;
            curChar = 0;
            drawCurChar(SOUNDS[curChar].image);
            changeCursor(curChar);
            drawScore(curPos, curScore["notes"], 0);

            // Make bomb images from the bomb sheet
            BOMBS = sliceImage(bombImg, 14, 18);

            // Make Mario images
            mario = new MarioClass();
            mario.images = sliceImage(marioImg, 16, 22);

            // Make Semitone images
            Semitones = sliceImage(semitoneImg, 5, 12);

            // Load Sound Files
            Promise.all(
                SOUNDS.map(function (sound) {
                    return sound.load();
                })
            )
                .then(function (buffers) {
                    buffers.map(function (buffer, index) {
                        SOUNDS[index].buffer = buffer;
                    });

                    CONSOLE.removeChild(document.getElementById("spinner"));

                    if (Object.keys(OPTS).length == 0) return;

                    if (OPTS["url"] != undefined) {
                        fullInitScore();
                        const url = OPTS["url"];
                        new Promise(function (resolve, reject) {
                            const request = new XMLHttpRequest();
                            request.open("GET", url);
                            request.onload = function () {
                                if (request.status == 200) {
                                    resolve(request.response);
                                } else {
                                    reject(Error(request.statusText));
                                }
                            };

                            request.onerror = function () {
                                reject(Error("Network Error"));
                            };

                            request.send();
                        })
                            .then(function (response) {
                                let msq = false;
                                if (url.slice(-3) == "msq") addMSQ(response);
                                else addJSON(response);

                                closing();
                            })
                            .catch(function (error) {
                                alert("Downloading File: " + url + " failed :" + error);
                                console.error("Downloading File: " + url + " failed :" + error.stack);
                            });
                    } else if (OPTS.S != undefined || OPTS.SCORE != undefined) {
                        let score = OPTS.SCORE || OPTS.S;
                        let tempo = OPTS.TEMPO || OPTS.T;
                        let loop = OPTS.LOOP || OPTS.L;
                        let end = OPTS.END || OPTS.E;
                        let beats = OPTS.TIME44 || OPTS.B;

                        if (tempo == undefined || loop == undefined || end == undefined || beats == undefined) {
                            throw new Error("Not enough parameters");
                        }

                        loop = loop.toUpperCase();
                        beats = beats.toUpperCase();

                        const text =
                            "SCORE=" +
                            score +
                            "\n" +
                            "TEMPO=" +
                            tempo +
                            "\n" +
                            "LOOP=" +
                            (loop == "T" || loop == "TRUE" ? "TRUE" : "FALSE") +
                            "\n" +
                            "END=" +
                            end +
                            "\n" +
                            "TIME44=" +
                            (beats == "T" || beats == "TRUE" ? "TRUE" : "FALSE");
                        fullInitScore();
                        addMSQ(text);
                        closing();
                    }
                })
                .catch(function (error) {
                    alert("Invalid GET parameter :" + error);
                    console.error("Invalid GET parameter :" + error.stack);
                });

            document.addEventListener("keydown", function (event) {
                switch (event.code) {
                    case "Space": // space -> play/stop or restart with shift
                        const playButton = document.getElementById("play");
                        if (playButton.disabled == false || event.shiftKey) {
                            playListener.call(playButton, event);
                        } else {
                            stopListener.call(document.getElementById("stop"), event);
                        }
                        event.preventDefault();
                        break;

                    case "ArrowLeft": // left -> scroll left
                        if (gameStatus === 0) {
                            // Only allow scrolling in edit mode
                            const scrollBar = document.getElementById("scroll");
                            if (scrollBar.value > 0) curPos = --scrollBar.value;
                            event.preventDefault();
                        }
                        break;

                    case "ArrowRight": // right -> scroll right
                        if (gameStatus === 0) {
                            // Only allow scrolling in edit mode
                            const scrollBar = document.getElementById("scroll");
                            if (scrollBar.value < curMaxBars - 6) curPos = ++scrollBar.value;
                            event.preventDefault();
                        }
                        break;
                }
            });

            requestAnimFrame(doAnimation);
        })
        .catch((error) => {
            console.error("Failed to load embedded songs:", error);
        });
}

// Clear Button Listener
function clearListener(e) {
    this.style.backgroundImage = "url(" + this.images[1].src + ")";
    SOUNDS[19].play(8);
    function makePromise(num) {
        return new Promise(function (resolve, reject) {
            setTimeout(function () {
                const self = this;
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
        });

    clearSongButtons();
}

// Play Button Listener
function playListener(event) {
    this.style.backgroundImage = "url(" + this.images[1].src + ")";
    SOUNDS[17].play(8);
    const stopButton = document.getElementById("stop");
    stopButton.style.backgroundImage = "url(" + stopButton.images[0].src + ")";
    stopButton.disabled = false;
    this.disabled = true; // Would be unlocked by stop button

    const disabledButtonIds = ["toLeft", "toRight", "scroll", "clear", "frog", "beak", "1up"];
    disabledButtonIds.forEach(function (buttonId) {
        document.getElementById(buttonId).disabled = true;
    });

    // Reset scroll position to beginning
    const scrollBar = document.getElementById("scroll");
    scrollBar.value = 0;
    curPos = 0;

    gameStatus = 1; // Mario Entering the stage
    mario.init();
    requestAnimFrame(doMarioEnter);
}

// Stop Button Listener
function stopListener(event) {
    this.style.backgroundImage = "url(" + this.images[1].src + ")";
    // Sound ON: click , OFF: called by doMarioPlay
    if (event != undefined) SOUNDS[17].play(8);
    const playButton = document.getElementById("play");
    playButton.style.backgroundImage = "url(" + playButton.images[0].src + ")";
    //playButton.disabled = false; // Do after Mario left the stage
    this.disabled = true; // Would be unlocked by play button

    gameStatus = 3; // Mario leaves from the stage
    mario.init4leaving();
    if (animationFrameId != 0) cancelAnimationFrame(animationFrameId);
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
    if (gameStatus == 2) {
        if (mario.marioPosition - 2 != curScore.end - 1) {
            animationFrameId = requestAnimFrame(doMarioPlay);
        } else if (curScore.loop) {
            curPos = 0;
            mario.marioPosition = 1;
            mario.marioX = 40;
            mario.init4playing(timeStamp);
            animationFrameId = requestAnimFrame(doMarioPlay);
        } else {
            // Calls stopListener without a event arg
            stopListener.call(document.getElementById("stop"));
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

        ["toLeft", "toRight", "scroll", "play", "clear", "frog", "beak", "1up"].map(function (id) {
            document.getElementById(id).disabled = false;
        });

        requestAnimFrame(doAnimation);
    }
}

// Clear Song Buttons
function clearSongButtons() {
    ["frog", "beak", "1up"].map(function (buttonId, buttonIndex) {
        const songButton = document.getElementById(buttonId);
        songButton.disabled = false;
        songButton.style.backgroundImage = "url(" + songButton.images[0].src + ")";
    });
    curSong = undefined;
}

// Clear Eraser Button
function clearEraserButton() {
    const eraserButton = document.getElementById("eraser");
    eraserButton.style.backgroundImage = "url(" + eraserButton.images[0].src + ")";
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
    const scrollBar = document.getElementById("scroll");
    scrollBar.max = DEFAULT_MAX_BARS - 6;
    scrollBar.value = 0;
    curScore.loop = false;
    document.getElementById("loop").reset();
    curScore.end = DEFAULT_MAX_BARS - 1;
    curScore.tempo = DEFAULT_TEMPO;
    document.getElementById("tempo").value = DEFAULT_TEMPO;
    curScore.beats = 4;
    const clickEvent = new Event("click");
    clickEvent.soundOff = true;
    document.getElementById("4beats").dispatchEvent(clickEvent);
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
