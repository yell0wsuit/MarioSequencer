# MarioSequencer

Mario Sequencer - Web Edition. Fork of <https://github.com/minghai/MarioSequencer> with minor improvements.

## Improvements over the original repository

1. Increased default maxium bars to 200.
2. Increased resolution.
3. Improved WAV sound quality, deleted unnecessary sound files.
4. Refactored code to make it more readable and easier to maintain.

## How to use

[Click here](https://yell0wsuit.github.io/MarioSequencer/) to open the online version. You can download (or clone) this repository to try it offline.

Select instruments on the top of the screen. The last button is the end mark. If you select it, it will put the end mark on the score to indicate the end of the song.

After selecting the instrument, put notes on the score by clicking left. If you need to scroll the score to left or right, use the scroll range object or left/right arrow keys.

If you want to delete the notes, select the eraser button, or right click on the note.

The **Download song** button will save your music as JSON file. Drag and drop your file and you can play it again. You can also change the JSON file to bypass the default maximum bars.

You can use ♯ and ♭ for semitones. Hold **Shift** for ♯ or **Ctrl** for ♭ while you add notes.

**Undo Dog** is not yet implemented so there's no way to undo yet. Temporary solution: save many times.

## Parameters

- **?url=`filename.json`**  
View the score file.
  - [Super Mario Bros. 3: World 1 Map](https://yell0wsuit.github.io/MarioSequencer/?url=smb3world1map.json)
  - [Bobby Carrot 5 Music #1](https://yell0wsuit.github.io/MarioSequencer/?url=bobbycarrot5music1.json)

- **?SCORE=`MSQ's score data`**  
Pass the score data. Try these links for example:
  - [Kerby's OP theme](https://yell0wsuit.github.io/MarioSequencer/?SCORE=00AC005C223CCF000114C5F001105CCF0022115F6C011DD225CCF000115F7C0115C08CCF0022115F8C118CDD227C9F0002C749C02F74009F00223C749C2F74DD4C8F93000000000346487000446487000567F84007407F845674AF467F840074367F84074AF0118F007411568F074BF11468F007411568F074BF12849F00742F849C5F74DD4D849F00742F849C05F7412849F007412849C05F744D648F00541F648C04F84567F84007407F845674AF467F840074167F84074AF0118F007411568F074BF11468F007411568F074BF12849F00742F849C5F74DD4D849F04D742F849C4D5F74456885456885000356885456885000&TEMPO=629&LOOP=TRUE&END=97&TIME44=TRUE)
  - [Aunt Spoon (or Mrs. Pepper Pot)](https://yell0wsuit.github.io/MarioSequencer/?SCORE=14ADD201D24034D201D4454ADD201D641D74D201D8494ADD201DA4ADB4D201DC41DADD408CCF07CBF06CAF1D4C8F5C7CC206CB55C7CC21D4C8F5C7CC21D6CB55C7CC22C6C7F0000A5C23C7CC21D7FA503C7F3C7CA73C8CA71D3C9C005C5C7CC507C9C1D7C9F009C9CBCC50BCDC1DBCDF0ACCF7CAFB58CBFCC1DA7B58CACB27C9CB26C8CB21D4C8F5C7CB206CA55C7CB21D4C8F5C7CB21D6CA55C7CB22C6C7F00001DB23C7CB201D7F1C7F8C1C6F8C1C5F8C1C4F8C03C9C3C7F9C05CCC1D5C9F07CCC5CBFCC03CAC1C2D8C0003C6D7C5C6D7C00A200AD0ADBB000000000000000000000000000000000000000000000000000&TEMPO=314&LOOP=FALSE&END=81&TIME44=TRUE)

## Credits

Original game: Mario Paint. Images and sounds belong to Nintendo.  
Original Javascript code: [minghai](https://github.com/minghai)
