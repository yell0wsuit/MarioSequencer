/**
 * Mario Sequencer Web edition - Main Application
 * Programmed by minghai (http://github.com/minghai)
 * Modified by yell0wsuit (https://github.com/yell0wsuit)
 * Modularized version
 */

// Import modules
import marioSequencer from "./appState.js";

import { EasyTimer } from "./modules/EasyTimer.js";
import { clone, EmbeddedSong, loadEmbeddedSongs } from "./modules/EmbeddedSongs.js";
import {
    doAnimation,
    handleFileDrop,
    initScore,
    mouseClickListener,
    processUrlParameters,
    setupKeyboardControls,
    setupMouseWheelScroll,
} from "./modules/EventHandlers.js";
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

// GLOBAL VARIABLES - Initialize all globals on marioSequencer object for easy module access
//   Constants: Full capital letters
//   Variables: CamelCase
marioSequencer.audioContext = new AudioContext();
marioSequencer.SEMITONERATIO = Math.pow(2, 1 / 12);
marioSequencer.ORGWIDTH = 256;
marioSequencer.ORGHEIGHT = 224;
marioSequencer.SCRHEIGHT = 152;

// Calculate MAGNIFY to fit within viewport without scrolling
// Use 96% of available space to leave some margin
marioSequencer.MAGNIFY = Math.min(
    Math.floor((window.innerWidth * 0.96) / marioSequencer.ORGWIDTH),
    Math.floor((window.innerHeight * 0.96) / marioSequencer.ORGHEIGHT)
);

marioSequencer.CHARSIZE = 16 * marioSequencer.MAGNIFY;
marioSequencer.HALFCHARSIZE = Math.floor(marioSequencer.CHARSIZE / 2);
marioSequencer.BUTTONS = [];
marioSequencer.mouseX = 0;
marioSequencer.mouseY = 0;
marioSequencer.CONSOLE = document.getElementById("console");

// Set initial console position and size
marioSequencer.CONSOLE.style.width = `${marioSequencer.ORGWIDTH * marioSequencer.MAGNIFY}px`;
marioSequencer.CONSOLE.style.height = `${marioSequencer.ORGHEIGHT * marioSequencer.MAGNIFY}px`;
marioSequencer.offsetLeft = marioSequencer.CONSOLE.offsetLeft;
marioSequencer.offsetTop = marioSequencer.CONSOLE.offsetTop;
marioSequencer.curChar = 0;
marioSequencer.curPos = 0;
marioSequencer.curSong = undefined; // For Embedded Songs
marioSequencer.curScore = {};
marioSequencer.DEFAULT_MAX_BARS = 199 * 4 + 1; // 24 bars by default
marioSequencer.DEFAULT_TEMPO = 100;
marioSequencer.curMaxBars = marioSequencer.DEFAULT_MAX_BARS;
marioSequencer.mario = null; // Mamma Mia!
marioSequencer.animationFrameId = 0; // ID for cancel animation
marioSequencer.pseudoSheet = null; // CSSRules for manipulating pseudo elements
marioSequencer.repeatMark = null; // For Score
marioSequencer.endMark = null;
marioSequencer.undoHistory = [];

// DOM element cache to avoid repeated lookups
marioSequencer.DOM = {
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
marioSequencer.gameStatus = 0;

// Expose utility functions to marioSequencer for use in other modules
marioSequencer.clone = clone;
marioSequencer.makeExclusiveFunction = makeExclusiveFunction;
marioSequencer.drawScore = drawScore;

// Asynchronous load of sounds
marioSequencer.SOUNDS = Array.from({ length: 20 }, (_, i) => {
    const paddedNumber = `0${i + 1}`.slice(-2);
    return new SoundEntity(`wav/sound${paddedNumber}.wav`);
});

// Add undo dog sound
marioSequencer.SOUNDS[20] = new SoundEntity("wav/dogundo.wav");
// Add musicloopplacer sound
marioSequencer.SOUNDS[21] = new SoundEntity("wav/musicloopplacer.wav");

// Export sound indices for special sounds
marioSequencer.SOUND_INDEX = {
    END_MARK_PLACER: 21, // musicloopplacer.wav
    END_MARK_ON_BAR: 15, // sound16.wav
};

// Prepare Mat
marioSequencer.MAT = document.getElementById("layer1");
marioSequencer.MAT.width = marioSequencer.ORGWIDTH * marioSequencer.MAGNIFY;
marioSequencer.MAT.height = marioSequencer.ORGHEIGHT * marioSequencer.MAGNIFY;
marioSequencer.L1C = marioSequencer.MAT.getContext("2d");
marioSequencer.L1C.imageSmoothingEnabled = false;
marioSequencer.matImage = new Image();
marioSequencer.matImage.src = "images/mat.png";
marioSequencer.matImage.onload = () =>
    marioSequencer.L1C.drawImage(
        marioSequencer.matImage,
        0,
        0,
        marioSequencer.matImage.width * marioSequencer.MAGNIFY,
        marioSequencer.matImage.height * marioSequencer.MAGNIFY
    );

// Prepare image resources
marioSequencer.charSheet = new Image();
marioSequencer.charSheet.src = "images/character_sheet.png";

marioSequencer.bombImg = new Image();
marioSequencer.bombImg.src = "images/bomb.png";
marioSequencer.BOMBS = [];
marioSequencer.bombTimer = new EasyTimer(150, drawBomb);
marioSequencer.bombTimer.switch = true; // always true for the bomb
marioSequencer.bombTimer.currentFrame = 0;

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
    marioSequencer[name] = new Image();
    marioSequencer[name].src = src;
});

// Prepare the screen layer
marioSequencer.SCREEN = document.getElementById("layer2");
marioSequencer.SCREEN.width = marioSequencer.ORGWIDTH * marioSequencer.MAGNIFY;
marioSequencer.SCREEN.height = marioSequencer.SCRHEIGHT * marioSequencer.MAGNIFY;
marioSequencer.L2C = marioSequencer.SCREEN.getContext("2d");
marioSequencer.L2C.imageSmoothingEnabled = false;

// Add event listeners
marioSequencer.SCREEN.addEventListener("contextmenu", mouseClickListener);
marioSequencer.SCREEN.addEventListener("click", mouseClickListener);
marioSequencer.SCREEN.addEventListener("mousemove", (e) => {
    marioSequencer.mouseX = e.clientX;
    marioSequencer.mouseY = e.clientY;
});
marioSequencer.SCREEN.addEventListener("dragover", (e) => {
    e.preventDefault();
    return false;
});
marioSequencer.SCREEN.addEventListener("drop", handleFileDrop);

// Add download button listener
document.getElementById("downloadBtn").addEventListener("click", download);

// Add help button listener
document.getElementById("helpBtn").addEventListener("click", () => {
    window.open("https://github.com/yell0wsuit/MarioSequencer/tree/main#how-to-use", "_blank");
});

// Add window resize handler
window.addEventListener("resize", () => {
    const newMagnify = Math.min(
        Math.floor((window.innerWidth * 0.96) / marioSequencer.ORGWIDTH),
        Math.floor((window.innerHeight * 0.96) / marioSequencer.ORGHEIGHT)
    );
    if (newMagnify !== marioSequencer.MAGNIFY) {
        marioSequencer.MAGNIFY = newMagnify;
        resizeScreen();
    }
});

// INIT routine
const onload = async () => {
    // Load embedded songs first, then initialize the UI
    await loadEmbeddedSongs();

    // Expose EmbeddedSong to marioSequencer
    marioSequencer.EmbeddedSong = EmbeddedSong;

    // Setup UI components
    setupNoteButtons();
    setupControlButtons();
    setupUIControls();
    setupMouseWheelScroll();
    setupBeatButtons();
    setupSongButtons();
    setupKeyboardControls();

    // Initialize DOM references
    initDOM();

    // Initialize Mario
    marioSequencer.mario = new MarioClass();

    // Number images
    marioSequencer.NUMBERS = sliceImage(marioSequencer.numImg, 5, 7);

    // Initialize score
    initScore();

    // Initialize screen and cursor
    marioSequencer.curPos = 0;
    marioSequencer.curChar = 0;
    drawCurChar(marioSequencer.SOUNDS[marioSequencer.curChar].image);
    changeCursor(marioSequencer.curChar);
    drawScore(marioSequencer.curPos, marioSequencer.curScore["notes"], 0);

    // Create images
    marioSequencer.BOMBS = sliceImage(marioSequencer.bombImg, 14, 18);
    marioSequencer.mario.images = sliceImage(marioSequencer.marioImg, 16, 22);
    marioSequencer.Semitones = sliceImage(marioSequencer.semitoneImg, 5, 12);

    try {
        // Load Sound Files
        const loadPromises = marioSequencer.SOUNDS.map((sound) => sound.load());
        await Promise.all(loadPromises);

        // Remove loading spinner
        const spinner = document.getElementById("spinner");
        if (spinner) marioSequencer.CONSOLE.removeChild(spinner);

        // Process URL parameters if provided
        processUrlParameters();

        // Start animation loop
        requestAnimationFrame(doAnimation);
    } catch (error) {
        console.error("Failed to initialize application:", error);
    }
};

window.addEventListener("load", onload);
