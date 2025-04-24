/**
 * Mario Sequencer Web edition - Main Application
 * Programmed by minghai (http://github.com/minghai)
 * Modified by yell0wsuit (https://github.com/yell0wsuit)
 * Modularized version
 */

// Import modules
import { EasyTimer } from "./modules/EasyTimer.js";
import { clone, EmbeddedSong, loadEmbeddedSongs } from "./modules/EmbeddedSongs.js";
import {
    doAnimation,
    handleFileDrop,
    initScore,
    mouseClickListener,
    processUrlParameters,
    setupKeyboardControls,
} from "./modules/eventHandlers.js";
import MarioClass from "./modules/MarioClass.js";
import SoundEntity from "./modules/SoundEntity.js";
import { changeCursor, drawBomb, drawCurChar, drawScore, resizeScreen } from "./modules/UIManager.js";
import {
    initDOM,
    setupBeatButtons,
    setupControlButtons,
    setupNoteButtons,
    setupSongButtons,
    setupUIControls,
} from "./modules/UISetup.js";
import { download, makeExclusiveFunction, sliceImage } from "./modules/Utils.js";

// Checking the parameters
window.OPTS = Object.fromEntries(
    window.location.search
        .slice(1)
        .split("&")
        .filter((param) => param)
        .map((param) => {
            const [key, value] = param.split("=");
            return [key, value];
        })
);

// GLOBAL VARIABLES - Initialize all globals on window object for easy module access
//   Constants: Full capital letters
//   Variables: CamelCase
window.audioContext = new AudioContext();
window.SEMITONERATIO = Math.pow(2, 1 / 12);
window.ORGWIDTH = 256;
window.ORGHEIGHT = 224;
window.SCRHEIGHT = 152;

// Calculate MAGNIFY to fit within viewport without scrolling
// Use 96% of available space to leave some margin
window.MAGNIFY = Math.min(
    Math.floor((window.innerWidth * 0.96) / window.ORGWIDTH),
    Math.floor((window.innerHeight * 0.96) / window.ORGHEIGHT)
);

window.CHARSIZE = 16 * window.MAGNIFY;
window.HALFCHARSIZE = Math.floor(window.CHARSIZE / 2);
window.BUTTONS = [];
window.mouseX = 0;
window.mouseY = 0;
window.CONSOLE = document.getElementById("console");

// Set initial console position and size
window.CONSOLE.style.width = `${window.ORGWIDTH * window.MAGNIFY}px`;
window.CONSOLE.style.height = `${window.ORGHEIGHT * window.MAGNIFY}px`;
window.offsetLeft = window.CONSOLE.offsetLeft;
window.offsetTop = window.CONSOLE.offsetTop;
window.curChar = 0;
window.curPos = 0;
window.curSong = undefined; // For Embedded Songs
window.curScore = {};
window.DEFAULT_MAX_BARS = 199 * 4 + 1; // 24 bars by default
window.DEFAULT_TEMPO = 100;
window.curMaxBars = window.DEFAULT_MAX_BARS;
window.mario = null; // Mamma Mia!
window.animationFrameId = 0; // ID for cancel animation
window.pseudoSheet = null; // CSSRules for manipulating pseudo elements
window.repeatMark = null; // For Score
window.endMark = null;
window.undoHistory = [];

// DOM element cache to avoid repeated lookups
window.DOM = {
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

// Game mode: 0=Edit, 1=Mario Entering, 2=Playing, 3=Mario Leaving
window.gameStatus = 0;

// shim layer with setTimeout fallback
window.requestAnimFrame =
    window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    window.oRequestAnimationFrame ||
    window.msRequestAnimationFrame ||
    ((callback) => window.setTimeout(callback, 1000 / 60));

// Expose utility functions to global scope for use in other modules
window.clone = clone;
window.makeExclusiveFunction = makeExclusiveFunction;
window.drawScore = drawScore;

// Asynchronous load of sounds
window.SOUNDS = Array.from({ length: 20 }, (_, i) => {
    const paddedNumber = `0${i + 1}`.slice(-2);
    return new SoundEntity(`wav/sound${paddedNumber}.wav`);
});

// Add undo dog sound
window.SOUNDS[20] = new SoundEntity("wav/dogundo.wav");

// Prepare Mat
window.MAT = document.getElementById("layer1");
window.MAT.width = window.ORGWIDTH * window.MAGNIFY;
window.MAT.height = window.ORGHEIGHT * window.MAGNIFY;
window.L1C = window.MAT.getContext("2d");
window.L1C.imageSmoothingEnabled = false;
window.matImage = new Image();
window.matImage.src = "images/mat.png";
window.matImage.onload = () =>
    window.L1C.drawImage(
        window.matImage,
        0,
        0,
        window.matImage.width * window.MAGNIFY,
        window.matImage.height * window.MAGNIFY
    );

// Prepare image resources
window.charSheet = new Image();
window.charSheet.src = "images/character_sheet.png";

window.bombImg = new Image();
window.bombImg.src = "images/bomb.png";
window.BOMBS = [];
window.bombTimer = new EasyTimer(150, drawBomb);
window.bombTimer.switch = true; // always true for the bomb
window.bombTimer.currentFrame = 0;

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

// Prepare the screen layer
window.SCREEN = document.getElementById("layer2");
window.SCREEN.width = window.ORGWIDTH * window.MAGNIFY;
window.SCREEN.height = window.SCRHEIGHT * window.MAGNIFY;
window.L2C = window.SCREEN.getContext("2d");
window.L2C.imageSmoothingEnabled = false;

// Add event listeners
window.SCREEN.addEventListener("contextmenu", mouseClickListener);
window.SCREEN.addEventListener("click", mouseClickListener);
window.SCREEN.addEventListener("mousemove", (e) => {
    window.mouseX = e.clientX;
    window.mouseY = e.clientY;
});
window.SCREEN.addEventListener("dragover", (e) => {
    e.preventDefault();
    return false;
});
window.SCREEN.addEventListener("drop", handleFileDrop);

// Add download button listener
document.getElementById("downloadBtn").addEventListener("click", download);

// Add window resize handler
window.addEventListener("resize", () => {
    const newMagnify = Math.min(
        Math.floor((window.innerWidth * 0.96) / window.ORGWIDTH),
        Math.floor((window.innerHeight * 0.96) / window.ORGHEIGHT)
    );
    if (newMagnify !== window.MAGNIFY) {
        window.MAGNIFY = newMagnify;
        resizeScreen();
    }
});

// INIT routine
const onload = async () => {
    // Load embedded songs first, then initialize the UI
    await loadEmbeddedSongs();

    // Expose EmbeddedSong to global scope
    window.EmbeddedSong = EmbeddedSong;

    // Setup UI components
    setupNoteButtons();
    setupControlButtons();
    setupUIControls();
    setupBeatButtons();
    setupSongButtons();
    setupKeyboardControls();

    // Initialize DOM references
    initDOM();

    // Initialize Mario
    window.mario = new MarioClass();

    // Number images
    window.NUMBERS = sliceImage(window.numImg, 5, 7);

    // Initialize score
    initScore();

    // Initialize screen and cursor
    window.curPos = 0;
    window.curChar = 0;
    drawCurChar(window.SOUNDS[window.curChar].image);
    changeCursor(window.curChar);
    drawScore(window.curPos, window.curScore["notes"], 0);

    // Create images
    window.BOMBS = sliceImage(window.bombImg, 14, 18);
    window.mario.images = sliceImage(window.marioImg, 16, 22);
    window.Semitones = sliceImage(window.semitoneImg, 5, 12);

    try {
        // Load Sound Files
        const loadPromises = window.SOUNDS.map((sound) => sound.load());
        await Promise.all(loadPromises);

        // Remove loading spinner
        const spinner = document.getElementById("spinner");
        if (spinner) window.CONSOLE.removeChild(spinner);

        // Process URL parameters if provided
        processUrlParameters();

        // Start animation loop
        window.requestAnimFrame(doAnimation);
    } catch (error) {
        console.error("Failed to initialize application:", error);
    }
};

window.addEventListener("load", onload);
