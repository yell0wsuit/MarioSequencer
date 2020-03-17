# MarioSequencer
Mario Sequencer - Web Edition. Fork of https://github.com/minghai/MarioSequencer with minor improvements.

## Improvements over the original repository
1. Increased default maxium bars (199). The original repository: 24.
2. Increased resolution to 3x.
3. Improved WAV sound quality, deleted unnecessary sound files.

## How to use
Click [here](https://auranticus.github.io/MarioSequencer/) to try this online. You can download (or clone) this repository to try it offline.

Select instruments with the buttons on the top of the screen. Most right button is not a instrument, but it is a end mark. If you select it, you can put the end mark on the score and play will stop there.

After selecting the instrument, put notes on the score as you like by left click. If you need to scroll the score to left or right, use the scroll range object.

If you want to delete the notes, select the eraser on the bottom of the screen, or just use right click on the target note.

The **Save** button will save your music as JSON file. Drag and drop your file and you can play it again. You can also change the JSON file to bypass the default maximum bars.

You can use ♯ and ♭ for semitones. Hold **Shift** for ♯ or **Ctrl** for ♭ while you left click.

**Undo Dog** is not yet implemented so there's no way to undo. Temporary solution: save many times.

## API
- **?url="*filename*.json"**  
View the score file. [Sample here](https://windyboy1704.github.io/MarioSequencer/?url=smb3world1map.json).

- **?auto="true"** or **?auto="false"**  
Turn on/off autoplay music.

- **?mag="*integer N > 0*"**  
Zoom Mario Sequence screen. integer N > 0 can be 1, 2, 3, 4, ...

- **?SCORE="*MSQ's score data*"**  
Pass the score data. Try these links for example:  
Kerby's OP theme. http://bit.ly/1iuFZs1  
Aunt Spoon (or Mrs. Pepper Pot) http://bit.ly/1kpLFsd

## License
Original game: Mario Paint. Images and sounds belong to Nintendo.  
Original Javascript code: [minghai](https://github.com/minghai)
