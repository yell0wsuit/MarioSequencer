/*
 *  Mario Sequencer Web edition
 *    Programmed by minghai (http://github.com/minghai)
 */

// First, check the parameters to get MAGNIFY
const OPTS = {};
window.location.search
    .slice(1)
    .split("&")
    .forEach(function (s) {
        var tmp = s.split("=");
        OPTS[tmp[0]] = tmp[1];
    });

// GLOBAL VARIABLES
//   Constants: Full capital letters
//   Variables: CamelCase
const AC = window.AudioContext ? new AudioContext() : new webkitAudioContext();
const SEMITONERATIO = Math.pow(2, 1 / 12);
const MAGNIFY = OPTS.mag || OPTS.magnify || 3;
const CHARSIZE = 16 * MAGNIFY;
const HALFCHARSIZE = Math.floor(CHARSIZE / 2);
const BUTTONS = [];
let mouseX = 0;
let mouseY = 0;
const CONSOLE = document.getElementById("console");
const ORGWIDTH = 256;
const ORGHEIGHT = 224;
const SCRHEIGHT = 152;
CONSOLE.style.width = ORGWIDTH * MAGNIFY + "px";
CONSOLE.style.height = ORGHEIGHT * MAGNIFY + "px";
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
let animeId = 0; // ID for cancel animation
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
        const source = AC.createBufferSource();
        const tmps = scale & 0x0f;
        let semitone = this.diff[tmps];
        if ((scale & 0x80) !== 0) semitone++;
        else if ((scale & 0x40) !== 0) semitone--;
        source.buffer = this.buffer;
        source.playbackRate.value = Math.pow(SEMITONERATIO, semitone);
        source.connect(AC.destination);
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

            const source = AC.createBufferSource();
            const scale = note & 0x0f;
            let semitone = this.diff[scale];
            if ((note & 0x80) !== 0) semitone++;
            else if ((note & 0x40) !== 0) semitone--;
            source.buffer = this.buffer;
            source.playbackRate.value = Math.pow(SEMITONERATIO, semitone);
            source.connect(AC.destination);
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
                AC.decodeAudioData(
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
        this.offset = -16; // offset in X
        this.scroll = 0; // Scroll amount in dots
        this.x = -16; // X-position in dots.
        this.images = null;
        this.pos = 0; // position in bar number
        this.state = 0;
        this.start = 0;
        this.lastTime = 0;
        this.isJumping = false;
        this.timer = new EasyTimer(100, (timer) => {
            this.state = this.state === 1 ? 0 : 1;
        });
        this.timer.switch = true; // forever true
    }

    init() {
        this.x = -16;
        this.pos = 0;
        this.start = 0;
        this.state = 0;
        this.scroll = 0;
        this.offset = -16;
        this.timer.switch = true;
        this.isJumping = false;
    }

    enter(timeStamp) {
        if (this.start === 0) this.start = timeStamp;

        const diff = timeStamp - this.start;
        this.x = Math.floor(diff / 5) + this.offset;
        if (this.x >= 40) this.x = 40; // 16 + 32 - 8
        this.state = Math.floor(diff / 100) % 2 === 0 ? 1 : 0;
        this.draw();
    }

    init4leaving() {
        this.offset = this.x;
        this.start = 0;
        this.isJumping = false;
    }

    init4playing(timeStamp) {
        this.lastTime = timeStamp;
        this.offset = this.x;
        this.scroll = 0;
        this.pos = 1;
        this.state = 1;
        this.checkMarioShouldJump();
    }

    checkMarioShouldJump() {
        const notes = curScore.notes[this.pos - 1];
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

            const dic = {};
            notes.forEach((note) => {
                if (typeof note === "string") {
                    const tempo = note.split("=")[1];
                    curScore.tempo = tempo;
                    document.getElementById("tempo").value = tempo;
                    return;
                }

                const num = note >> 8;
                const scale = note & 0xff;
                if (!dic[num]) dic[num] = [scale];
                else dic[num].push(scale);
            });

            Object.entries(dic).forEach(([i, scales]) => {
                SOUNDS[i].playChord(scales, time / 1000); // [ms] -> [s]
            });
        };

        const tempo = curScore.tempo;
        let diff = timeStamp - this.lastTime; // both are [ms]
        if (diff > 32) diff = 16; // When user hide the tag, force it
        this.lastTime = timeStamp;
        const step = (32 * diff * tempo) / 60000; // (60[sec] * 1000)[msec]

        this.timer.checkAndFire(timeStamp);
        const scroll = document.getElementById("scroll");

        const nextBar = 16 + 32 * (this.pos - curPos + 1) - 8;
        if (this.x < 120) {
            // Mario still has to run
            this.x += step;
            // If this step crosses the bar
            if (this.x >= nextBar) {
                this.pos++;
                scheduleAndPlay(curScore.notes[this.pos - 2], 0); // Ignore diff
                this.checkMarioShouldJump();
            } else {
                // 32 dots in t[sec/1beat]
                if (this.x >= 120) {
                    this.scroll = this.x - 120;
                    this.x = 120;
                }
            }
        } else if (curPos <= curScore.end - 6) {
            // Scroll
            this.x = 120;
            if (this.scroll < 16 && this.scroll + step > 16) {
                this.pos++;
                this.scroll += step;
                scheduleAndPlay(curScore.notes[this.pos - 2], 0); // Ignore error
                this.checkMarioShouldJump();
            } else {
                this.scroll += step;
                if (this.scroll > 32) {
                    this.scroll -= 32;
                    curPos++;
                    scroll.value = curPos;
                    if (curPos > curScore.end - 6) {
                        this.x += this.scroll;
                        this.scroll = 0;
                    }
                }
            }
        } else {
            this.x += step;
            // If this step crosses the bar
            if (this.x >= nextBar) {
                this.pos++;
                scheduleAndPlay(curScore.notes[this.pos - 2], 0); // Ignore diff
                this.checkMarioShouldJump();
            }
        }
        drawScore(curPos, curScore.notes, this.scroll);
        this.draw();
    }

    jump(x) {
        const h = [
            0, 2, 4, 6, 8, 10, 12, 13, 14, 15, 16, 17, 18, 18, 19, 19, 19, 19, 19, 18, 18, 17, 16, 15, 14, 13, 12, 10,
            8, 6, 4, 2, 0,
        ];
        return h[Math.round(x) % 32];
    }

    draw() {
        let y = 41 - 22;
        let state = this.state;
        if (this.isJumping) {
            state = 2;
            if (this.x === 120) {
                // In scroll mode
                // (scroll == 16) is just on the bar, 0 and 32 is on the center of between bars
                if (this.scroll !== 16) {
                    y -= this.jump(this.scroll > 16 ? this.scroll - 16 : this.scroll + 16);
                } /* if scroll == 16 then Mario should be on the ground */
            } else {
                // Running to the center, or leaving to the goal
                y -= this.jump(Math.round((this.x - 8) % 32));
            }
        }

        L2C.drawImage(this.images[state], this.x * MAGNIFY, y * MAGNIFY);
    }

    leave(timeStamp) {
        if (this.start === 0) this.start = timeStamp;

        const diff = timeStamp - this.start;
        if (this.scroll > 0 && this.scroll < 32) {
            this.scroll += Math.floor(diff / 4);
            if (this.scroll > 32) {
                this.x += this.scroll - 32;
                this.scroll = 0;
                curPos++;
            }
        } else {
            this.x = Math.floor(diff / 4) + this.offset;
        }

        if (Math.floor(diff / 100) % 2 === 0) {
            this.state = 8;
            this.draw();
            const w = sweatImg.width;
            const h = sweatImg.height;
            L2C.drawImage(
                sweatImg,
                0,
                0,
                w,
                h,
                (this.x - (w + 1)) * MAGNIFY,
                (41 - 22) * MAGNIFY,
                w * MAGNIFY,
                h * MAGNIFY
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
    let tmp = "0";
    tmp += i.toString();
    let file = "wav/sound" + tmp.slice(-2) + ".wav";
    let e = new SoundEntity(file);
    SOUNDS[i - 1] = e;
}

// Prepare Mat
const MAT = document.getElementById("layer1");
MAT.width = ORGWIDTH * MAGNIFY;
MAT.height = ORGHEIGHT * MAGNIFY;
const L1C = MAT.getContext("2d");
L1C.imageSmoothingEnabled = false;
const mi = new Image();
mi.src = "images/mat.png";
mi.onload = function () {
    L1C.drawImage(mi, 0, 0, mi.width * MAGNIFY, mi.height * MAGNIFY);
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
    var x = 9 * MAGNIFY;
    var y = 202 * MAGNIFY;
    var img = BOMBS[mySelf.currentFrame];
    L1C.drawImage(img, x, y);
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

function drawRepeatHead(x) {
    var w = repeatMark[0].width;
    var h = repeatMark[0].height;
    L2C.drawImage(repeatMark[0], x * MAGNIFY, 56 * MAGNIFY);
}

// Score Area (8, 41) to (247, 148)
function drawScore(pos, notes, scroll) {
    // Clip only X
    L2C.clearRect(0, 0, SCREEN.width, SCREEN.height);
    L2C.save();
    L2C.rect(8 * MAGNIFY, 0, (247 - 8 + 1) * MAGNIFY, SCRHEIGHT * MAGNIFY);
    L2C.clip();

    // If mouse cursor on or under the C, draw horizontal line
    var realX = mouseX - offsetLeft;
    var realY = mouseY - offsetTop;
    var g = toGrid(realX, realY);
    var gridX;
    var gridY;
    // Edit mode only, no scroll
    if (gameStatus == 0 && g !== false) {
        gridX = g[0];
        gridY = g[1];
        if (gridY >= 11) drawHorizontalBar(gridX, 0);
    }

    if (pos == 0) {
        var w = GClef.width;
        var h = GClef.height;
        // GClef image is NOT magnified yet.
        L2C.drawImage(GClef, 0, 0, w, h, (9 - scroll) * MAGNIFY, 48 * MAGNIFY, w * MAGNIFY, h * MAGNIFY);

        if (curScore.loop) {
            drawRepeatHead(41 - scroll);
        }
    } else if (pos == 1 && curScore.loop) {
        drawRepeatHead(9 - scroll);
    }

    //ORANGE #F89000
    var beats = curScore.beats;
    // orange = 2, 1, 0, 3, 2, 1, 0, 3, ..... (if beats = 4)
    //        = 2, 1, 0, 2, 1, 0, 2, 1, ..... (if beats = 3)
    var orange = beats == 4 ? 3 - ((pos + 1) % 4) : 2 - ((pos + 3) % 3);
    var i = pos < 2 ? 2 - pos : 0;
    for (; i < 9; i++) {
        var xorg = 16 + 32 * i - scroll;
        var x = xorg * MAGNIFY;
        var barnum = pos + i - 2;

        if (barnum == curScore.end) {
            var img = curScore.loop ? repeatMark[1] : endMark;
            L2C.drawImage(img, x - 7 * MAGNIFY, 56 * MAGNIFY);
        }

        L2C.beginPath();
        L2C.setLineDash([MAGNIFY, MAGNIFY]);
        L2C.lineWidth = MAGNIFY;
        if (i % beats == orange) {
            if (gameStatus == 0) drawBarNumber(i, barnum / beats + 1);
            L2C.strokeStyle = "#F89000";
        } else {
            L2C.strokeStyle = "#A0C0B0";
        }
        L2C.moveTo(x, 41 * MAGNIFY);
        L2C.lineTo(x, 148 * MAGNIFY);
        L2C.stroke();

        var b = notes[barnum];
        if (b == undefined) continue;

        // Get notes down
        var delta = 0;
        if (gameStatus == 2 && mario.pos - 2 == barnum) {
            var idx;
            if (mario.x == 120) {
                idx = mario.scroll >= 16 ? mario.scroll - 16 : mario.scroll + 16;
            } else {
                idx = mario.x + 8 - xorg;
            }
            var tbl = [
                0, 1, 2, 3, 3, 4, 5, 5, 6, 6, 7, 7, 8, 8, 8, 8, 8, 8, 8, 8, 8, 7, 7, 6, 6, 5, 5, 4, 3, 3, 2, 1, 0,
            ];
            delta = tbl[Math.round(idx)];
        }
        var hflag = false;
        for (var j = 0; j < b.length; j++) {
            if (typeof b[j] == "string") continue; // for dynamic TEMPO

            var sndnum = b[j] >> 8;
            var scale = b[j] & 0x0f;
            // When curChar is eraser, and the mouse cursor is on the note,
            // an Image of note blinks.
            if (curChar == 16 && g != false && i == gridX && scale == gridY && eraserTimer.currentFrame == 1) {
                continue;
            }

            if (!hflag && scale >= 11) {
                hflag = true;
                drawHorizontalBar(i, scroll);
            }
            L2C.drawImage(SOUNDS[sndnum].image, x - HALFCHARSIZE, (40 + scale * 8 + delta) * MAGNIFY);

            var x2 = x - 13 * MAGNIFY;
            var y = (44 + scale * 8 + delta) * MAGNIFY;
            if ((b[j] & 0x80) != 0) {
                L2C.drawImage(Semitones[0], x2, y);
            } else if ((b[j] & 0x40) != 0) {
                L2C.drawImage(Semitones[1], x2, y);
            }
        }
    }
    if (gameStatus == 0) {
        L2C.beginPath();
        L2C.setLineDash([7 * MAGNIFY, 2 * MAGNIFY, 7 * MAGNIFY, 0]);
        L2C.lineWidth = MAGNIFY;
        L2C.strokeStyle = "#F00";
        var xorg = 16 + 32 * gridX - 8;
        var x = xorg * MAGNIFY;
        var y = (40 + gridY * 8) * MAGNIFY;
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

function drawBarNumber(gridX, barnum) {
    let x = (16 + 32 * gridX) * MAGNIFY - 1;
    const y = (40 - 7) * MAGNIFY;
    const nums = [];
    while (barnum > 0) {
        nums.push(barnum % 10);
        barnum = Math.floor(barnum / 10);
    }
    const len = nums.length;
    if (len == 1) x += 2 * MAGNIFY;
    while (nums.length > 0) {
        const n = nums.pop();
        const width = n == 4 ? 5 : 4;
        L2C.drawImage(NUMBERS[n], x, y, 5 * MAGNIFY, 7 * MAGNIFY);
        x += width * MAGNIFY;
    }
}

function changeCursor(num) {
    SCREEN.style.cursor = "url(" + SOUNDS[num].image.src + ")" + HALFCHARSIZE + " " + HALFCHARSIZE + ", auto";
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
function drawEndMarkIcon(img) {
    L1C.clearRect(4 * MAGNIFY, 8 * MAGNIFY, 16 * MAGNIFY, 14 * MAGNIFY);
    L1C.drawImage(img, 5 * MAGNIFY, 8 * MAGNIFY);
}
// Draw Eraser Icon
// In fact, this only erases Icon
function drawEraserIcon() {
    L1C.clearRect(4 * MAGNIFY, 8 * MAGNIFY, 16 * MAGNIFY, 14 * MAGNIFY);
}

function toGrid(realX, realY) {
    const gridLeft = (8 + 0) * MAGNIFY;
    const gridTop = 41 * MAGNIFY;
    const gridRight = (247 - 4) * MAGNIFY;
    const gridBottom = (148 - 4) * MAGNIFY;
    if (realX < gridLeft || realX > gridRight || realY < gridTop || realY > gridBottom) return false;

    let gridX = Math.floor((realX - gridLeft) / CHARSIZE);
    if (gridX % 2 != 0) return false; // Not near the bar
    gridX /= 2;
    const gridY = Math.floor((realY - gridTop) / HALFCHARSIZE);

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

function mouseClickListener(e) {
    if (gameStatus != 0) return;
    e.preventDefault();

    const realX = e.clientX - offsetLeft;
    const realY = e.clientY - offsetTop;

    const g = toGrid(realX, realY);
    if (g == false) return;
    const gridX = g[0];
    let gridY = g[1];

    // Map logical x to real bar number
    const b = curPos + gridX - 2;

    // process End Mark
    if (curChar == 15) {
        curScore.end = b;
        return;
    }

    if (b >= curScore.end) return;

    const notes = curScore["notes"][b];
    // Delete
    if (curChar == 16 || e.button == 2) {
        // Delete Top of the stack
        for (let i = notes.length - 1; i >= 0; i--) {
            if ((notes[i] & 0x3f) == gridY) {
                notes.splice(i, 1);
                curScore.notes[b] = notes;
                SOUNDS[17].play(8);
                break;
            }
        }
        return;
    }

    let note = (curChar << 8) | gridY;
    if (notes.indexOf(note) != -1) return;
    //
    // Handle semitone
    if (e.shiftKey) gridY |= 0x80;
    if (e.ctrlKey) gridY |= 0x40;
    SOUNDS[curChar].play(gridY);
    note = (curChar << 8) | gridY;
    notes.push(note);
    curScore["notes"][b] = notes;
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

const makeButton = (x, y, w, h) => {
    const b = document.createElement("button");
    b.className = "game";
    b.style.position = "absolute";
    moveDOM(b, x, y);
    resizeDOM(b, w, h);
    b.style.zIndex = "3";
    b.style.background = "rgba(0,0,0,0)";

    // Save position and size for later use
    b.originalX = x;
    b.originalY = y;
    b.originalW = w;
    b.originalH = h;
    b.redraw = () => {
        moveDOM(b, b.originalX, b.originalY);
        resizeDOM(b, b.originalW, b.originalH);
    };
    return b;
};

const resizeDOM = (element, w, h) => {
    element.style.width = `${w * MAGNIFY}px`;
    element.style.height = `${h * MAGNIFY}px`;
};

const moveDOM = (element, x, y) => {
    element.style.left = `${x * MAGNIFY}px`;
    element.style.top = `${y * MAGNIFY}px`;
};

const selectListener = (e) => {
    console.log(e);
    MAGNIFY = e.target.selectedIndex + 1;
    resizeScreen();
};

const resizeScreen = () => {
    CHARSIZE = 16 * MAGNIFY;
    HALFCHARSIZE = Math.floor(CHARSIZE / 2);

    CONSOLE.style.width = `${ORGWIDTH * MAGNIFY}px`;
    CONSOLE.style.height = `${ORGHEIGHT * MAGNIFY}px`;
    offsetLeft = CONSOLE.offsetLeft;
    offsetTop = CONSOLE.offsetTop;

    BOMBS = sliceImage(bombImg, 14, 18);
    mario.images = sliceImage(marioImg, 16, 22);
    Semitones = sliceImage(semitoneImg, 5, 12);

    MAT.width = ORGWIDTH * MAGNIFY;
    MAT.height = ORGHEIGHT * MAGNIFY;
    L1C.drawImage(mi, 0, 0, mi.width * MAGNIFY, mi.height * MAGNIFY);

    SCREEN.width = ORGWIDTH * MAGNIFY;
    SCREEN.height = SCRHEIGHT * MAGNIFY;

    const imgs = sliceImage(charSheet, 16, 16);
    BUTTONS.forEach((b, i) => {
        b.redraw();
        if (i < 15) b.se.image = imgs[i];
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

    const playBtn = document.getElementById("play");
    playBtn.redraw();
    playBtn.images = sliceImage(playBtnImg, 12, 15);
    const num = playBtn.disabled ? 1 : 0;
    playBtn.style.backgroundImage = `url(${playBtn.images[num].src})`;

    const stopBtn = document.getElementById("stop");
    stopBtn.redraw();
    const stopImgs = sliceImage(stopBtnImg, 16, 15);
    stopBtn.images = [stopImgs[0], stopImgs[1]];
    stopBtn.style.backgroundImage = `url(${stopBtn.images[1 - num].src})`;

    const loopBtn = document.getElementById("loop");
    loopBtn.redraw();
    loopBtn.images = [stopImgs[2], stopImgs[3]]; // made in Stop button (above)
    const loopNum = curScore.loop ? 1 : 0;
    loopBtn.style.backgroundImage = `url(${loopBtn.images[loopNum].src})`;

    // Prepare Repeat (global!)
    repeatMark = sliceImage(repeatImg, 13, 62);
    endMark = repeatMark[2];

    const scroll = document.getElementById("scroll");
    moveDOM(scroll, scroll.originalX, scroll.originalY);
    resizeDOM(scroll, scroll.originalW, scroll.originalH);
    const rules = pseudoSheet.cssRules;
    for (let i = 0; i < rules.length; i++) {
        if (rules[i].selectorText === "#scroll::-webkit-slider-thumb") {
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

    const toLeft = document.getElementById("toLeft");
    toLeft.redraw();
    const toRight = document.getElementById("toRight");
    toRight.redraw();
    const clear = document.getElementById("clear");
    clear.redraw();
    clear.images = sliceImage(clearImg, 34, 16);
    clear.style.backgroundImage = `url(${clear.images[0].src})`;

    // Make number images from the number sheet
    NUMBERS = sliceImage(numImg, 5, 7);

    const beats3 = document.getElementById("3beats");
    beats3.redraw();
    const beatImgs = sliceImage(beatImg, 14, 15);
    beats3.images = [beatImgs[0], beatImgs[1]];
    const beatsNum = curScore.beats === 3 ? 1 : 0;
    beats3.style.backgroundImage = `url(${beats3.images[beatsNum].src})`;
    const beats4 = document.getElementById("4beats");
    beats4.redraw();
    beats4.images = [beatImgs[2], beatImgs[3]];
    beats4.style.backgroundImage = `url(${beats4.images[1 - beatsNum].src})`;

    const frog = document.getElementById("frog");
    frog.redraw();
    const songImgs = sliceImage(songImg, 15, 17);
    frog.images = [songImgs[0], songImgs[1], songImgs[2]];
    const frogNum = curSong === frog ? 1 : 0;
    frog.style.backgroundImage = `url(${frog.images[frogNum].src})`;
    const beak = document.getElementById("beak");
    beak.redraw();
    beak.images = [songImgs[3], songImgs[4], songImgs[5]];
    const beakNum = curSong === beak ? 1 : 0;
    beak.style.backgroundImage = `url(${beak.images[beakNum].src})`;
    const oneUp = document.getElementById("1up");
    oneUp.redraw();
    oneUp.images = [songImgs[6], songImgs[7], songImgs[8]];
    const oneUpNum = curSong === oneUp ? 1 : 0;
    oneUp.style.backgroundImage = `url(${oneUp.images[oneUpNum].src})`;
    const eraser = document.getElementById("eraser");
    eraser.redraw();
    eraser.images = [songImgs[9], songImgs[10], songImgs[11]];
    let eraserNum;
    if (curChar === 16) {
        eraserNum = 1;
        SCREEN.style.cursor = `url(${eraser.images[2].src}) 0 0, auto`;
    } else {
        eraserNum = 0;
    }
    eraser.style.backgroundImage = `url(${eraser.images[eraserNum].src})`;

    const tempo = document.getElementById("tempo");
    moveDOM(tempo, tempo.originalX, tempo.originalY);
    resizeDOM(tempo, tempo.originalW, tempo.originalH);
    for (let i = 0; i < rules.length; i++) {
        if (rules[i].selectorText === "#tempo::-webkit-slider-thumb") {
            pseudoSheet.deleteRule(i);
            pseudoSheet.insertRule(
                `#tempo::-webkit-slider-thumb {
                    -webkit-appearance: none !important;
                    background-image: url('${tempo.image.src}');
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

const sliceImage = (img, width, height) => {
    const result = [];
    const imgw = img.width * MAGNIFY;
    const imgh = img.height * MAGNIFY;
    const num = Math.floor(img.width / width);
    const all = num * Math.floor(img.height / height);
    const charw = width * MAGNIFY;
    const charh = height * MAGNIFY;

    for (let i = 0; i < all; i++) {
        const tmpcan = document.createElement("canvas");
        tmpcan.width = charw;
        tmpcan.height = charh;
        const tmpctx = tmpcan.getContext("2d");
        tmpctx.imageSmoothingEnabled = false;
        tmpctx.drawImage(img, (i % num) * width, Math.floor(i / num) * height, width, height, 0, 0, charw, charh);
        const charimg = new Image();
        charimg.src = tmpcan.toDataURL();
        result[i] = charimg;
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
            var bimgs = sliceImage(charSheet, 16, 16);
            for (var i = 0; i < 15; i++) {
                var b = makeButton(24 + 14 * i, 8, 13, 14);
                b.num = i;
                b.se = SOUNDS[i];
                b.se.image = bimgs[i];
                b.addEventListener("click", function () {
                    this.se.play(8); // Note F
                    curChar = this.num;
                    clearEraserButton();
                    changeCursor(this.num);
                    drawCurChar(this.se.image);
                });
                CONSOLE.appendChild(b);
                BUTTONS[i] = b;
            }

            // Prepare End Mark button (Char. No. 15)
            var b = makeButton(235, 8, 13, 14);
            b.images = sliceImage(endImg, 14, 13); // Note: Different size from the button
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
            endMarkTimer.images = b.images;
            endMarkTimer.currentFrame = 0;
            b.addEventListener("click", function () {
                endMarkTimer.switch = true;
                curChar = 15;
                SOUNDS[15].play(8);
                clearEraserButton();
                drawEndMarkIcon(this.images[0]);
            });
            CONSOLE.appendChild(b);
            BUTTONS[15] = b;

            // For inserting pseudo elements' styles
            var s = document.createElement("style");
            document.head.appendChild(s);
            pseudoSheet = s.sheet;

            // Prepare Play Button (55, 168)
            var b = makeButton(55, 168, 12, 15);
            b.id = "play";
            b.images = sliceImage(playBtnImg, 12, 15);
            b.style.backgroundImage = "url(" + b.images[0].src + ")";
            b.addEventListener("click", playListener);
            s.sheet.insertRule("#play:focus {outline: none !important;}", 0);
            CONSOLE.appendChild(b);

            // Prepare Stop Button (21, 168)
            var b = makeButton(21, 168, 16, 15);
            b.id = "stop";
            b.disabled = false;
            // stopbtn image including loop button (next)
            var imgs = sliceImage(stopBtnImg, 16, 15);
            b.images = [imgs[0], imgs[1]];
            b.style.backgroundImage = "url(" + b.images[1].src + ")";
            b.addEventListener("click", stopListener);
            s.sheet.insertRule("#stop:focus {outline: none !important;}", 0);
            CONSOLE.appendChild(b);

            // Prepare Loop Button (85, 168)
            var b = makeButton(85, 168, 16, 15);
            b.id = "loop";
            b.images = [imgs[2], imgs[3]]; // made in Stop button (above)
            b.style.backgroundImage = "url(" + b.images[0].src + ")";
            curScore.loop = false;
            b.addEventListener("click", function (e) {
                var num;
                if (curScore.loop) {
                    curScore.loop = false;
                    num = 0;
                } else {
                    curScore.loop = true;
                    num = 1;
                }
                this.style.backgroundImage = "url(" + this.images[num].src + ")";
                SOUNDS[17].play(8);
            });
            b.reset = function () {
                curScore.loop = false;
                this.style.backgroundImage = "url(" + this.images[0].src + ")";
            };
            b.set = function () {
                curScore.loop = true;
                this.style.backgroundImage = "url(" + this.images[1].src + ")";
            };
            s.sheet.insertRule("#loop:focus {outline: none !important;}", 0);
            CONSOLE.appendChild(b);

            // Prepare Repeat (global!)
            repeatMark = sliceImage(repeatImg, 13, 62);
            endMark = repeatMark[2];

            // Prepare Scroll Range
            var r = document.createElement("input");
            r.id = "scroll";
            r.type = "range";
            r.value = 0;
            r.max = curMaxBars - 6;
            r.min = 0;
            r.step = 1;
            r.style["-webkit-appearance"] = "none";
            r.style["border-radius"] = "0px";
            r.style["background-color"] = "#F8F8F8";
            r.style["box-shadow"] = "inset 0 0 0 #000";
            r.style["vertical-align"] = "middle";
            r.style.position = "absolute";
            r.style.margin = 0;
            r.originalX = 191;
            r.originalY = 159;
            r.originalW = 50;
            r.originalH = 7;
            moveDOM(r, r.originalX, r.originalY);
            resizeDOM(r, r.originalW, r.originalH);
            r.addEventListener("input", function (e) {
                curPos = parseInt(this.value);
            });
            CONSOLE.appendChild(r);

            // It's very hard to set values to a pseudo element with JS.
            // http://pankajparashar.com/posts/modify-pseudo-elements-css/
            s.sheet.insertRule(
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
            s.sheet.insertRule("#scroll:focus {outline: none !important;}", 0);

            // Make number images from the number sheet
            NUMBERS = sliceImage(numImg, 5, 7);

            // Prepare Beat buttons w=14, h=15 (81, 203) (96, 203)
            // (1) Disable self, Enable the other
            // (2) Change both images
            // (3) Play Sound
            // (4) Set curScore.beat
            function makeExclusiveFunction(doms, num, success) {
                var clone = doms.slice(0); // Clone the Array
                var self = clone[num];
                clone.splice(num, 1); // Remove No.i element
                var theOthers = clone;

                return function (e) {
                    // Sound Off for file loading
                    if (!e.soundOff) SOUNDS[17].play(8);
                    self.disabled = true;
                    self.style.backgroundImage = "url(" + self.images[1].src + ")";
                    theOthers.map(function (x) {
                        x.disabled = false;
                        x.style.backgroundImage = "url(" + x.images[0].src + ")";
                    });
                    success(self);
                };
            }

            var imgs = sliceImage(beatImg, 14, 15);
            var b1 = makeButton(81, 203, 14, 15);
            b1.id = "3beats";
            b1.beats = 3;
            b1.images = [imgs[0], imgs[1]];
            b1.style.backgroundImage = "url(" + b1.images[0].src + ")";
            b1.disabled = false;
            CONSOLE.appendChild(b1);
            var b2 = makeButton(96, 203, 14, 15);
            b2.id = "4beats";
            b2.beats = 4;
            b2.images = [imgs[2], imgs[3]];
            b2.style.backgroundImage = "url(" + b2.images[1].src + ")";
            b2.disabled = true;
            CONSOLE.appendChild(b2);
            var func = function (self) {
                curScore.beats = self.beats;
            };
            b1.addEventListener("click", makeExclusiveFunction([b1, b2], 0, func));
            b2.addEventListener("click", makeExclusiveFunction([b1, b2], 1, func));

            // Preapre Song Buttons (136, 202) 15x17, 160 - 136 = 24
            var imgs = sliceImage(songImg, 15, 17);
            var b = ["frog", "beak", "1up"].map(function (id, idx) {
                var b = makeButton(136 + 24 * idx, 202, 15, 17);
                b.id = id;
                b.num = idx;
                b.images = imgs.slice(idx * 3, idx * 3 + 3);
                b.style.backgroundImage = "url(" + b.images[0].src + ")";
                b.disabled = false;
                CONSOLE.appendChild(b);
                return b;
            });
            var func = function (self) {
                curScore = clone(EmbeddedSong[self.num]);
                document.getElementById("tempo").value = curScore.tempo;
                var b = document.getElementById("loop");
                if (curScore.loop) b.set();
                else b.reset();
                var s = document.getElementById("scroll");
                s.max = curScore.end - 5;
                s.value = 0;
                curPos = 0;
                curSong = self;
            };
            b[0].addEventListener("click", makeExclusiveFunction(b, 0, func));
            b[1].addEventListener("click", makeExclusiveFunction(b, 1, func));
            b[2].addEventListener("click", makeExclusiveFunction(b, 2, func));

            // Prepare Eraser (Warning: Depends on the Song button images)
            b = makeButton(40, 202, 15, 17);
            b.id = "eraser";
            b.images = [imgs[9], imgs[10], imgs[11]]; // In the Song button images
            b.style.backgroundImage = "url(" + b.images[0].src + ")";
            eraserTimer = new EasyTimer(200, function (self) {
                // If current is not end mark, just return;
                if (curChar != 16) {
                    self.switch = false;
                    return;
                }
                self.currentFrame = self.currentFrame == 0 ? 1 : 0;
            });
            eraserTimer.currentFrame = 0;
            b.addEventListener("click", function () {
                eraserTimer.switch = true;
                curChar = 16;
                SOUNDS[17].play(8);
                drawEraserIcon();
                clearSongButtons();
                this.style.backgroundImage = "url(" + this.images[1].src + ")";
                SCREEN.style.cursor = "url(" + this.images[2].src + ")" + " 0 0, auto";
            });
            CONSOLE.appendChild(b);

            // Prepare tempo range
            // (116, 172) width 40px, height 8px
            var r = document.createElement("input");
            r.id = "tempo";
            r.type = "range";
            r.value = 525;
            r.max = 1000;
            r.min = 50;
            r.step = 1;
            r.style["-webkit-appearance"] = "none";
            r.style["border-radius"] = "0px";
            r.style["background-color"] = "rgba(0, 0, 0, 0.0)";
            r.style["box-shadow"] = "inset 0 0 0 #000";
            r.style["vertical-align"] = "middle";
            r.style.position = "absolute";
            r.style.margin = 0;
            r.originalX = 116;
            r.originalY = 172;
            r.originalW = 40;
            r.originalH = 8;
            moveDOM(r, r.originalX, r.originalY);
            resizeDOM(r, r.originalW, r.originalH);
            r.addEventListener("input", function (e) {
                curScore.tempo = parseInt(this.value);
            });
            CONSOLE.appendChild(r);

            var t = sliceImage(thumbImg, 5, 8)[0];
            r.image = t;
            // It's very hard to set values to a pseudo element with JS.
            // http://pankajparashar.com/posts/modify-pseudo-elements-css/
            s.sheet.insertRule(
                "#tempo::-webkit-slider-thumb {" +
                    "-webkit-appearance: none !important;" +
                    "background-image: url('" +
                    t.src +
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
            s.sheet.insertRule("#tempo:focus {outline: none !important;}", 0);

            // Prepare range's side buttons for inc/decrements
            var b = makeButton(184, 158, 7, 9);
            b.id = "toLeft";
            b.addEventListener("click", function (e) {
                var r = document.getElementById("scroll");
                if (r.value > 0) {
                    curPos = --r.value;
                }
            });
            CONSOLE.appendChild(b);

            var b = makeButton(241, 158, 7, 9);
            b.id = "toRight";
            b.addEventListener("click", function (e) {
                var r = document.getElementById("scroll");
                if (r.value < curMaxBars - 6) {
                    curPos = ++r.value;
                }
            });
            CONSOLE.appendChild(b);

            // Prepare CLEAR button (200, 176)
            var b = makeButton(200, 176, 34, 16);
            b.id = "clear";
            b.images = sliceImage(clearImg, 34, 16);
            b.style.backgroundImage = "url(" + b.images[0].src + ")";
            b.addEventListener("click", clearListener);
            CONSOLE.appendChild(b);
            s.sheet.insertRule("#clear:focus {outline: none !important;}", 0);

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
                SOUNDS.map(function (s) {
                    return s.load();
                })
            )
                .then(function (all) {
                    all.map(function (buffer, i) {
                        SOUNDS[i].buffer = buffer;
                    });

                    CONSOLE.removeChild(document.getElementById("spinner"));

                    if (Object.keys(OPTS).length == 0) return;

                    if (OPTS["url"] != undefined) {
                        fullInitScore();
                        var url = OPTS["url"];
                        new Promise(function (resolve, reject) {
                            var req = new XMLHttpRequest();
                            req.open("GET", url);
                            req.onload = function () {
                                if (req.status == 200) {
                                    resolve(req.response);
                                } else {
                                    reject(Error(req.statusText));
                                }
                            };

                            req.onerror = function () {
                                reject(Error("Network Error"));
                            };

                            req.send();
                        })
                            .then(function (response) {
                                var msq = false;
                                if (url.slice(-3) == "msq") addMSQ(response);
                                else addJSON(response);

                                closing();
                            })
                            .catch(function (err) {
                                alert("Downloading File: " + url + " failed :" + err);
                                console.error("Downloading File: " + url + " failed :" + err.stack);
                            });
                    } else if (OPTS.S != undefined || OPTS.SCORE != undefined) {
                        var score = OPTS.SCORE || OPTS.S;
                        var tempo = OPTS.TEMPO || OPTS.T;
                        var loop = OPTS.LOOP || OPTS.L;
                        var end = OPTS.END || OPTS.E;
                        var beats = OPTS.TIME44 || OPTS.B;

                        if (tempo == undefined || loop == undefined || end == undefined || beats == undefined) {
                            throw new Error("Not enough parameters");
                        }

                        loop = loop.toUpperCase();
                        beats = beats.toUpperCase();

                        var text =
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
                .catch(function (err) {
                    alert("Invalid GET parameter :" + err);
                    console.error("Invalid GET parameter :" + err.stack);
                });

            document.addEventListener("keydown", function (e) {
                switch (e.keyCode) {
                    case 32: // space -> play/stop or restart with shift
                        var playBtn = document.getElementById("play");
                        if (playBtn.disabled == false || e.shiftKey) {
                            playListener.call(playBtn, e);
                        } else {
                            stopListener.call(document.getElementById("stop"), e);
                        }
                        e.preventDefault();
                        break;

                    case 37: // left -> scroll left
                        var r = document.getElementById("scroll");
                        if (r.value > 0) curPos = --r.value;
                        e.preventDefault();
                        break;

                    case 39: // right -> scroll right
                        var r = document.getElementById("scroll");
                        if (r.value < curMaxBars - 6) curPos = ++r.value;
                        e.preventDefault();
                        break;
                }
            });

            requestAnimFrame(doAnimation);

            // const b = document.getElementById("magnify");
            // b.addEventListener("change", selectListener);
        })
        .catch((error) => {
            console.error("Failed to load embedded songs:", error);
        });
}

// Clear Button Listener
function clearListener(e) {
    this.style.backgroundImage = "url(" + this.images[1].src + ")";
    SOUNDS[19].play(8);
    var self = this;
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
        });

    clearSongButtons();
}

// Play Button Listener
function playListener(e) {
    this.style.backgroundImage = "url(" + this.images[1].src + ")";
    SOUNDS[17].play(8);
    var b = document.getElementById("stop");
    b.style.backgroundImage = "url(" + b.images[0].src + ")";
    b.disabled = false;
    this.disabled = true; // Would be unlocked by stop button

    ["toLeft", "toRight", "scroll", "clear", "frog", "beak", "1up"].map(function (id) {
        document.getElementById(id).disabled = true;
    });

    gameStatus = 1; // Mario Entering the stage
    curPos = 0; // doAnimation will draw POS 0 and stop
    mario.init();
    requestAnimFrame(doMarioEnter);
}

// Stop Button Listener
function stopListener(e) {
    this.style.backgroundImage = "url(" + this.images[1].src + ")";
    // Sound ON: click , OFF: called by doMarioPlay
    if (e != undefined) SOUNDS[17].play(8);
    var b = document.getElementById("play");
    b.style.backgroundImage = "url(" + b.images[0].src + ")";
    //b.disabled = false; // Do after Mario left the stage
    this.disabled = true; // Would be unlocked by play button

    gameStatus = 3; // Mario leaves from the stage
    mario.init4leaving();
    if (animeId != 0) cancelAnimationFrame(animeId);
    requestAnimFrame(doMarioLeave);
}

// Let Mario run on the stage
function doMarioEnter(timeStamp) {
    bombTimer.checkAndFire(timeStamp);
    drawScore(0, curScore.notes, 0);
    mario.enter(timeStamp);

    if (mario.x < 40) {
        animeId = requestAnimFrame(doMarioEnter);
    } else {
        mario.init4playing(timeStamp);
        gameStatus = 2;
        animeId = requestAnimFrame(doMarioPlay);
    }
}

// Let Mario play the music!
function doMarioPlay(timeStamp) {
    bombTimer.checkAndFire(timeStamp);
    mario.play(timeStamp);
    if (gameStatus == 2) {
        if (mario.pos - 2 != curScore.end - 1) {
            animeId = requestAnimFrame(doMarioPlay);
        } else if (curScore.loop) {
            curPos = 0;
            mario.pos = 1;
            mario.x = 40;
            mario.init4playing(timeStamp);
            animeId = requestAnimFrame(doMarioPlay);
        } else {
            // Calls stopListener without a event arg
            stopListener.call(document.getElementById("stop"));
        }
    }
}

// Let Mario leave from the stage
function doMarioLeave(timeStamp) {
    bombTimer.checkAndFire(timeStamp);
    drawScore(curPos, curScore.notes, mario.scroll);
    mario.leave(timeStamp);

    if (mario.x < 247) {
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
    ["frog", "beak", "1up"].map(function (id, idx) {
        var b = document.getElementById(id);
        b.disabled = false;
        b.style.backgroundImage = "url(" + b.images[0].src + ")";
    });
    curSong = undefined;
}

// Clear Eraser Button
function clearEraserButton() {
    var b = document.getElementById("eraser");
    b.style.backgroundImage = "url(" + b.images[0].src + ")";
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
    var tmpa = [];
    for (var i = 0; i < DEFAULT_MAX_BARS; i++) tmpa[i] = [];
    curScore.notes = tmpa;
    curMaxBars = DEFAULT_MAX_BARS;
    var s = document.getElementById("scroll");
    s.max = DEFAULT_MAX_BARS - 6;
    s.value = 0;
    curScore.loop = false;
    document.getElementById("loop").reset();
    curScore.end = DEFAULT_MAX_BARS - 1;
    curScore.tempo = DEFAULT_TEMPO;
    document.getElementById("tempo").value = DEFAULT_TEMPO;
    curScore.beats = 4;
    var e = new Event("click");
    e.soundOff = true;
    document.getElementById("4beats").dispatchEvent(e);
}

// Easiest and Fastest way to clone
function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

// Load embedded songs from JSON files
let EmbeddedSong = [];
const songFiles = ["frog.json", "beak.json", "1up.json"];

function loadEmbeddedSongs() {
    return Promise.all(
        songFiles.map((file) => {
            return fetch(`songs/${file}`)
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(`Failed to load ${file}`);
                    }
                    return response.json();
                })
                .catch((error) => {
                    console.error(`Error loading ${file}:`, error);
                    return null;
                });
        })
    ).then((songs) => {
        EmbeddedSong = songs.filter((song) => song !== null);
    });
}
