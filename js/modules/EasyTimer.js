/**
 * Simple timer class for handling animation and effects timing
 */
class EasyTimer {
    time;
    func;
    lastTime = 0;
    switch = false;
    currentFrame = 0; // Added for animation frames

    constructor(time, func) {
        this.time = time;
        this.func = func;
    }

    checkAndFire = (time) => {
        if (this.switch && time - this.lastTime > this.time) {
            this.func(this);
            this.lastTime = time;
        }
    };
}

export { EasyTimer };
