/**
 * Module for loading and managing embedded songs
 */

// Empty array to be filled with loaded songs
let EmbeddedSong = [];
const songFiles = ["frog.json", "beak.json", "1up.json"];

/**
 * Load all embedded songs from JSON files
 * @returns {Promise<void>} Promise that resolves when all songs are loaded
 */
const loadEmbeddedSongs = async () => {
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
};

/**
 * Create a deep clone of an object
 * @param {Object} obj - The object to clone
 * @returns {Object} A deep copy of the object
 */
const clone = (obj) => JSON.parse(JSON.stringify(obj));

export { clone, EmbeddedSong, loadEmbeddedSongs };
