// test only: expose the game object as the mock harness expects (window.activeStarblastGame)
Object.defineProperty(Object.prototype, "using_gamepad", { set: function(v) { this._ug = v; if (typeof this.startPrivateGame === "function") window.activeStarblastGame = this; }, get: function() { return this._ug; }, configurable: true });
