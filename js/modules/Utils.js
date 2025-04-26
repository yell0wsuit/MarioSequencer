/**
 * Utility functions for the Mario Sequencer
 */

import marioSequencer from "../appState.js";

/**
 * Creates a button element with the specified properties
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} width - Button width
 * @param {number} height - Button height
 * @param {string} type - Button type
 * @param {string} ariaLabel - Accessibility label
 * @returns {HTMLButtonElement} The created button
 */
const makeButton = (x, y, width, height, type = "button", ariaLabel = "") => {
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
};

/**
 * Resizes a DOM element
 * @param {HTMLElement} element - The element to resize
 * @param {number} width - New width in game units
 * @param {number} height - New height in game units
 */
const resizeDOM = (element, width, height) => {
    element.style.width = `${width * marioSequencer.MAGNIFY}px`;
    element.style.height = `${height * marioSequencer.MAGNIFY}px`;
};

/**
 * Moves a DOM element
 * @param {HTMLElement} element - The element to move
 * @param {number} x - New X position in game units
 * @param {number} y - New Y position in game units
 */
const moveDOM = (element, x, y) => {
    element.style.left = `${x * marioSequencer.MAGNIFY}px`;
    element.style.top = `${y * marioSequencer.MAGNIFY}px`;
};

/**
 * Slices an image into smaller parts
 * @param {HTMLImageElement} image - The source image
 * @param {number} width - Width of each slice
 * @param {number} height - Height of each slice
 * @returns {Array<HTMLImageElement>} Array of image elements
 */
const sliceImage = (image, width, height) => {
    const result = [];
    const horizontalCount = Math.floor(image.width / width);
    const verticalCount = Math.floor(image.height / height);
    const charWidth = width * marioSequencer.MAGNIFY;
    const charHeight = height * marioSequencer.MAGNIFY;

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

/**
 * Function to create a file download
 */
const download = () => {
    const link = document.createElement("a");
    link.download = "MSQ_Data.json";
    const blob = new Blob([JSON.stringify(marioSequencer.curScore)], { type: "application/json" });
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href); // Clean up to avoid memory leaks
};

/**
 * Updates a slider thumb style in CSS
 * @param {string} selector - CSS selector for the thumb
 * @param {Object} config - Configuration object with properties and dimensions
 */
const updateSliderThumbStyle = (selector, config) => {
    const styleRules = marioSequencer.pseudoSheet.cssRules;

    // Find and remove existing rule
    for (let i = 0; i < styleRules.length; i++) {
        if (styleRules[i].selectorText === selector) {
            marioSequencer.pseudoSheet.deleteRule(i);
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
    marioSequencer.pseudoSheet.insertRule(`${selector} {${cssProperties}}`, 0);
};

/**
 * Utility function for creating exclusive button selections
 * @param {Array} buttons - Array of buttons
 * @param {number} index - Index of the selected button
 * @param {Function} success - Callback function when selection is made
 * @returns {Function} Event handler function
 */
const makeExclusiveFunction = (buttons, index, success) => {
    const buttonList = buttons.slice(0); // Clone the Array
    const self = buttonList[index];
    buttonList.splice(index, 1); // Remove No.i element
    const otherButtons = buttonList;

    return (event) => {
        // Sound Off for file loading
        if (!event.soundOff) marioSequencer.SOUNDS[17].play(8);
        self.disabled = true;
        self.style.backgroundImage = `url(${self.images[1].src})`;
        otherButtons.map((button) => {
            button.disabled = false;
            button.style.backgroundImage = `url(${button.images[0].src})`;
        });
        success(self);
    };
};

/**
 * Promise-based file reader
 * @param {File} file - The file to read
 * @returns {Promise<string>} Promise resolving to the file contents
 */
const readFileAsync = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("File reading failed"));
        reader.readAsText(file, "shift-jis");
    });
};

const isFirefox = typeof InstallTrigger !== "undefined";

export {
    download,
    makeButton,
    makeExclusiveFunction,
    moveDOM,
    readFileAsync,
    resizeDOM,
    sliceImage,
    updateSliderThumbStyle,
    isFirefox,
};
