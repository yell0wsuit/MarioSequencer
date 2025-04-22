/**
 * Simple timer class for handling animation and effects timing
 */
class EasyTimer {
    constructor(time, func) {
        this.time = time;
        this.func = func;
        this.lastTime = 0;
        this.switch = false;
        this.currentFrame = 0; // Added for animation frames
    }

    checkAndFire(time) {
        if (this.switch && time - this.lastTime > this.time) {
            this.func(this);
            this.lastTime = time;
        }
    }
}

export { EasyTimer };
