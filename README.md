# MarioSequencer

Mario Sequencer - Web Edition. Fork of <https://github.com/minghai/MarioSequencer> with quality-of-life improvements.

## Improvements over the original repository

1. Increased default maximum bars to 200.
2. Auto-scale to the screen's resolution. Removed scaling option as a result.
3. Implemented Undo Dog.
4. Refactored the code to make it more readable and easier to maintain.
5. Removed deprecated URL parameters.

## How to use

[Click here](https://yell0wsuit.github.io/MarioSequencer/) to open the online version. You can download (or clone) this repository to try it offline.

- **Selecting Instruments**  
  Choose an instrument from the top of the screen. The last button is the **End Mark** — the song will stop playing at this point.

- **Adding Notes**  
  After selecting an instrument, click on the score to place notes.  
  To scroll the score left or right, drag the scroll bar or use the left/right arrow keys.

- **Deleting Notes**  
  To delete a note, either:
  - Select the **Eraser** tool and click the note, or
  - **Right-click** the note directly.

- **Saving and Loading Songs**  
  Use the **Download Song** button to save your music as a `.json` file.  
  You can **drag and drop** a previously saved file to load and play it again.  
  Tip: You can manually edit the JSON to go beyond the default maximum bar limit.

- **Using Semitones (♯ / ♭)**  
  - Hold **Shift** while adding a note for a **sharp (♯)**
  - Hold **Ctrl** for a **flat (♭)**

- **Undoing Actions**  
  The **Undo Dog** undoes the last action, including adding notes or the End Mark.  
  You can also use Ctrl + Z (or ⌘ + Z).  
  ⚠️ You *cannot* undo after pressing the **CLEAR** button!

## Parameters

- **?url=`filename.json`**  
View the score file.
  - [Super Mario Bros. 3: World 1 Map](https://yell0wsuit.github.io/MarioSequencer/?url=songs/smb3world1map.json)
  - [Bobby Carrot 5 Music #1](https://yell0wsuit.github.io/MarioSequencer/?url=songs/bobbycarrot_ingame1.json)

*Only applicable for uploaded songs on this repo. You will need to fork this repo to add your own custom songs, or drag-and-drop the score file.*

- **?score=`MSQ's score data`**  
Pass the score data. Try these links for example:
  - [Kerby's OP theme](https://yell0wsuit.github.io/MarioSequencer/?SCORE=00AC005C223CCF000114C5F001105CCF0022115F6C011DD225CCF000115F7C0115C08CCF0022115F8C118CDD227C9F0002C749C02F74009F00223C749C2F74DD4C8F93000000000346487000446487000567F84007407F845674AF467F840074367F84074AF0118F007411568F074BF11468F007411568F074BF12849F00742F849C5F74DD4D849F00742F849C05F7412849F007412849C05F744D648F00541F648C04F84567F84007407F845674AF467F840074167F84074AF0118F007411568F074BF11468F007411568F074BF12849F00742F849C5F74DD4D849F04D742F849C4D5F74456885456885000356885456885000&TEMPO=629&LOOP=TRUE&END=97&TIME44=TRUE)
  - [Aunt Spoon (or Mrs. Pepper Pot)](https://yell0wsuit.github.io/MarioSequencer/?SCORE=14ADD201D24034D201D4454ADD201D641D74D201D8494ADD201DA4ADB4D201DC41DADD408CCF07CBF06CAF1D4C8F5C7CC206CB55C7CC21D4C8F5C7CC21D6CB55C7CC22C6C7F0000A5C23C7CC21D7FA503C7F3C7CA73C8CA71D3C9C005C5C7CC507C9C1D7C9F009C9CBCC50BCDC1DBCDF0ACCF7CAFB58CBFCC1DA7B58CACB27C9CB26C8CB21D4C8F5C7CB206CA55C7CB21D4C8F5C7CB21D6CA55C7CB22C6C7F00001DB23C7CB201D7F1C7F8C1C6F8C1C5F8C1C4F8C03C9C3C7F9C05CCC1D5C9F07CCC5CBFCC03CAC1C2D8C0003C6D7C5C6D7C00A200AD0ADBB000000000000000000000000000000000000000000000000000&TEMPO=314&LOOP=FALSE&END=81&TIME44=TRUE)

Parameters are case-insensitive.

## Credits

Original game: Mario Paint. Images and sounds belong to Nintendo.  
Original Javascript code: [minghai](https://github.com/minghai)
