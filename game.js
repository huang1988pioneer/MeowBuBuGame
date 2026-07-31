// ================================================================
//  喵布布的復仇 - MeowBuBu's Revenge
//  A pixel-art action platformer
//  Cross-browser: Chrome / Firefox / Safari / Edge
// ================================================================

// ================================================================
//  COMPAT — 跨瀏覽器相容層（Firefox / Safari / 舊 Edge）
// ================================================================
const Compat = {
    // rAF
    raf: (window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame ||
        window.msRequestAnimationFrame ||
        function (cb) { return setTimeout(function () { cb(Date.now()); }, 1000 / 60); }).bind(window),

    hasPassive: false,
    _passiveChecked: false,

    supportsPassive() {
        if (this._passiveChecked) return this.hasPassive;
        this._passiveChecked = true;
        try {
            let opts = Object.defineProperty({}, 'passive', {
                get: function () { Compat.hasPassive = true; return true; }
            });
            window.addEventListener('t', null, opts);
            window.removeEventListener('t', null, opts);
        } catch (e) {
            this.hasPassive = false;
        }
        return this.hasPassive;
    },

    /** 安全 addEventListener：舊瀏覽器第三參若傳物件會被當成 capture=true */
    on(el, type, fn, options) {
        if (!el) return;
        if (options == null) {
            el.addEventListener(type, fn, false);
            return;
        }
        if (typeof options === 'boolean') {
            el.addEventListener(type, fn, options);
            return;
        }
        if (this.supportsPassive()) {
            el.addEventListener(type, fn, options);
        } else {
            el.addEventListener(type, fn, !!options.capture);
        }
    },

    /** 桌面精準指標（滑鼠）優先 — 觸控筆電不當成手機 */
    isPrimarilyTouch() {
        try {
            // 有滑鼠 + hover → 桌面操作為主（即使 maxTouchPoints>0）
            if (window.matchMedia) {
                const fine = window.matchMedia('(pointer: fine)').matches;
                const hover = window.matchMedia('(hover: hover)').matches;
                if (fine && hover) return false;
                if (window.matchMedia('(pointer: coarse)').matches) return true;
            }
        } catch (e) { /* ignore */ }
        // 無 matchMedia 時：用 UA 粗判行動裝置
        const ua = navigator.userAgent || '';
        if (/Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
            return true;
        }
        // 僅有觸控且無滑鼠痕跡
        const pts = navigator.maxTouchPoints || navigator.msMaxTouchPoints || 0;
        return pts > 0 && !window.matchMedia && ('ontouchstart' in window);
    },

    isNarrowScreen() {
        try {
            return window.innerWidth <= 1024 ||
                (window.matchMedia && window.matchMedia('(max-width: 1024px)').matches);
        } catch (e) {
            return window.innerWidth <= 1024;
        }
    }
};

// Math.hypot polyfill
if (!Math.hypot) {
    Math.hypot = function () {
        let y = 0;
        for (let i = 0; i < arguments.length; i++) y += arguments[i] * arguments[i];
        return Math.sqrt(y);
    };
}
// Array.includes polyfill（舊瀏覽器）
if (!Array.prototype.includes) {
    Array.prototype.includes = function (search, start) {
        return this.indexOf(search, start || 0) !== -1;
    };
}

// ── Canvas Setup ──
const gameCanvas = document.getElementById('game-canvas');
let ctx = null;
if (gameCanvas) {
    try { ctx = gameCanvas.getContext('2d', { alpha: false }); } catch (e) { ctx = null; }
    if (!ctx) {
        try { ctx = gameCanvas.getContext('2d'); } catch (e2) { ctx = null; }
    }
}
const W = 960, H = 540;
if (gameCanvas) {
    gameCanvas.width = W;
    gameCanvas.height = H;
    // 可聚焦以利部分瀏覽器鍵盤事件
    if (!gameCanvas.getAttribute('tabindex')) gameCanvas.setAttribute('tabindex', '0');
}
// 關閉影像平滑（各前綴）
if (ctx) {
    ctx.imageSmoothingEnabled = false;
    try { ctx.mozImageSmoothingEnabled = false; } catch (e) {}
    try { ctx.webkitImageSmoothingEnabled = false; } catch (e) {}
    try { ctx.msImageSmoothingEnabled = false; } catch (e) {}
}

// ── Timing ──
let lastTime = 0;
let deltaTime = 0;
const TARGET_FPS = 60;
const FRAME_TIME = 1000 / TARGET_FPS;

// ── DOM closest ──
function domClosest(el, sel) {
    if (!el) return null;
    if (el.closest) {
        try { return el.closest(sel); } catch (e) { /* invalid selector */ }
    }
    let n = el;
    while (n && n.nodeType === 1) {
        try {
            if (n.matches && n.matches(sel)) return n;
            if (n.msMatchesSelector && n.msMatchesSelector(sel)) return n;
            if (n.webkitMatchesSelector && n.webkitMatchesSelector(sel)) return n;
        } catch (e) { break; }
        n = n.parentElement || n.parentNode;
    }
    return null;
}

/**
 * Firefox 對未完成載入的 HTMLImageElement.drawImage 會拋例外，
 * 導致整幀繪製失敗。統一安全繪製。
 */
function safeDrawImage(context, img, a, b, c, d, e, f, g, h) {
    if (!context || !img) return false;
    try {
        // Canvas 元素可直接畫
        const isCanvas = (typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement) ||
            (img.tagName && String(img.tagName).toUpperCase() === 'CANVAS');
        if (!isCanvas) {
            // HTMLImageElement / ImageBitmap
            if (typeof img.complete === 'boolean' && !img.complete) return false;
            const nw = img.naturalWidth != null ? img.naturalWidth : img.width;
            const nh = img.naturalHeight != null ? img.naturalHeight : img.height;
            if (!nw || !nh) return false;
        }
        // 必須呼叫原生 drawImage，不可再進 safeDrawImage
        if (h !== undefined) context.drawImage(img, a, b, c, d, e, f, g, h);
        else if (d !== undefined) context.drawImage(img, a, b, c, d);
        else if (b !== undefined) context.drawImage(img, a, b);
        else context.drawImage(img, a);
        return true;
    } catch (err) {
        return false;
    }
}

// ================================================================
//  LAYOUT — JS 計算尺寸（桌面固定 960×540 上限，行動裝置滿版 16:9）
// ================================================================
const Layout = {
    fit() {
        const container = document.getElementById('game-container');
        if (!container) return;

        const vv = window.visualViewport;
        let vw = (vv && vv.width) ? vv.width : (window.innerWidth || document.documentElement.clientWidth || 960);
        let vh = (vv && vv.height) ? vv.height : (window.innerHeight || document.documentElement.clientHeight || 540);

        vw = Math.max(200, Math.floor(vw));
        vh = Math.max(160, Math.floor(vh));

        const primarilyTouch = Compat.isPrimarilyTouch();
        const maxW = primarilyTouch ? vw : Math.min(vw, 960);
        const maxH = primarilyTouch ? vh : Math.min(vh, 540);

        let w = maxW;
        let h = Math.floor(w * 9 / 16);
        if (h > maxH) {
            h = maxH;
            w = Math.floor(h * 16 / 9);
        }
        // 最小可玩尺寸
        if (w < 320) { w = Math.min(320, vw); h = Math.floor(w * 9 / 16); }

        container.style.width = w + 'px';
        container.style.height = h + 'px';
        container.style.maxWidth = '100%';
        container.style.maxHeight = '100%';

        // 僅行動裝置鎖 body 高度（桌面 Firefox 鎖死會造成捲動／置中異常）
        if (primarilyTouch) {
            document.documentElement.style.height = vh + 'px';
            document.body.style.height = vh + 'px';
            document.body.style.overflow = 'hidden';
        } else {
            document.documentElement.style.height = '';
            document.body.style.height = '';
        }
    },

    init() {
        const run = function () { try { Layout.fit(); } catch (e) { console.warn('Layout.fit', e); } };
        run();
        Compat.on(window, 'resize', run);
        Compat.on(window, 'orientationchange', function () {
            setTimeout(run, 50);
            setTimeout(run, 250);
            setTimeout(run, 500);
        });
        if (window.visualViewport) {
            Compat.on(window.visualViewport, 'resize', run);
            Compat.on(window.visualViewport, 'scroll', run);
        }
        setTimeout(run, 100);
        setTimeout(run, 600);
    }
};

// ================================================================
//  AUDIO SYSTEM (Procedural 8-bit sounds)
// ================================================================
const SFX = (() => {
    let audioCtx = null;
    let bgmInterval = null;
    let muted = false;

    function init() {
        try {
            if (!audioCtx) {
                const AC = window.AudioContext || window.webkitAudioContext || window.mozAudioContext;
                if (!AC) return;
                audioCtx = new AC();
            }
            if (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted') {
                const p = audioCtx.resume();
                if (p && typeof p.catch === 'function') p.catch(function () {});
            }
        } catch (e) {
            audioCtx = null;
        }
    }

    function tone(freq, type, dur, endFreq = null, vol = 0.08) {
        if (!audioCtx || muted) return;
        try {
            const t0 = audioCtx.currentTime;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(Math.max(20, freq), t0);
            if (endFreq && endFreq > 0) {
                try {
                    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
                } catch (_) {
                    osc.frequency.linearRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
                }
            }
            // 不用 exponential→0（部分行動瀏覽器會 throw）
            gain.gain.setValueAtTime(vol, t0);
            gain.gain.linearRampToValueAtTime(0.0001, t0 + Math.max(0.01, dur));
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(t0);
            osc.stop(t0 + dur + 0.02);
        } catch (e) { /* 音效失敗不應中斷遊戲 */ }
    }

    function noise(dur, vol = 0.08) {
        if (!audioCtx || muted) return;
        try {
            const t0 = audioCtx.currentTime;
            const bufSize = Math.max(1, Math.floor(audioCtx.sampleRate * dur));
            const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
            const src = audioCtx.createBufferSource();
            src.buffer = buf;
            const gain = audioCtx.createGain();
            gain.gain.setValueAtTime(vol, t0);
            gain.gain.linearRampToValueAtTime(0.0001, t0 + Math.max(0.01, dur));
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 800;
            src.connect(filter);
            filter.connect(gain);
            gain.connect(audioCtx.destination);
            src.start(t0);
        } catch (e) { /* ignore */ }
    }

    return {
        init,
        jump()    { tone(280, 'sine', 0.12, 560, 0.06); },
        attack()  { tone(180, 'triangle', 0.08, 90, 0.08); noise(0.05, 0.04); },
        hit()     { noise(0.08, 0.12); tone(100, 'square', 0.05, 50, 0.06); },
        hurt()    { tone(120, 'sawtooth', 0.25, 40, 0.15); noise(0.15, 0.12); },
        collect() { tone(600, 'sine', 0.04, 800, 0.04); setTimeout(() => tone(900, 'sine', 0.08, 1200, 0.04), 40); },
        heal()    { tone(520, 'sine', 0.08, 780, 0.06); setTimeout(() => tone(780, 'sine', 0.12, 1040, 0.05), 70); },
        shoot()   { tone(350, 'square', 0.08, 700, 0.04); },
        ultimate(){
            noise(0.25, 0.2);
            [220, 330, 440, 660, 880].forEach((f, i) =>
                setTimeout(() => tone(f, 'sawtooth', 0.18, f * 1.4, 0.1), i * 55)
            );
            setTimeout(() => noise(0.4, 0.15), 200);
        },
        bossRoar(){ noise(1.2, 0.3); tone(60, 'sawtooth', 1.0, 30, 0.15); },
        victory() { [440,554,659,880].forEach((f,i) => setTimeout(() => tone(f, 'square', 0.2, f, 0.08), i*130)); },
        death()   { tone(300, 'sawtooth', 0.3, 50, 0.15); setTimeout(() => tone(100, 'sawtooth', 0.5, 30, 0.12), 200); },
        levelUp() { [523,659,784,1047].forEach((f,i) => setTimeout(() => tone(f, 'triangle', 0.15, f*1.05, 0.06), i*100)); },
        playBGM() {
            if (!audioCtx) return;
            this.stopBGM();
            const melody = [
                262, 294, 330, 349, 392, 330, 262, 294,
                330, 392, 440, 392, 330, 294, 262, 0,
                392, 440, 494, 440, 392, 330, 294, 262
            ];
            let idx = 0;
            bgmInterval = setInterval(() => {
                if (melody[idx] > 0) tone(melody[idx], 'square', 0.12, null, 0.015);
                idx = (idx + 1) % melody.length;
            }, 200);
        },
        playBossBGM() {
            if (!audioCtx) return;
            this.stopBGM();
            const melody = [165, 175, 196, 175, 165, 147, 131, 147, 165, 196, 220, 196, 165, 147, 131, 0];
            let idx = 0;
            bgmInterval = setInterval(() => {
                if (melody[idx] > 0) tone(melody[idx], 'sawtooth', 0.1, null, 0.02);
                idx = (idx + 1) % melody.length;
            }, 160);
        },
        stopBGM() { if (bgmInterval) clearInterval(bgmInterval); bgmInterval = null; }
    };
})();

// ================================================================
//  ASSET MANAGER
// ================================================================
const Assets = {
    images: {},
    loaded: 0,
    total: 0,
    paths: {
        // Backgrounds
        'prologue':   'assets/bg/prologue.png',
        'forest':     'assets/bg/forest.png',
        'castle':     'assets/bg/castle.png',
        'world1':     'assets/bg/world1.png',
        'world2':     'assets/bg/world2.png',
        'world3':     'assets/bg/world3.png',
        'world4':     'assets/bg/world4.png',
        'world5':     'assets/bg/world5.png',
        'world6':     'assets/bg/world6.png',
        'world7':     'assets/bg/world7.png',
        'world8':     'assets/bg/world8.png',
        // Hero sprites (individual frames)
        'hero_idle':    'assets/sprites/hero_idle.png',
        'hero_walk1':   'assets/sprites/hero_walk1.png',
        'hero_walk2':   'assets/sprites/hero_walk2.png',
        'hero_walk3':   'assets/sprites/hero_walk3.png',
        'hero_walk4':   'assets/sprites/hero_walk4.png',
        'hero_run':     'assets/sprites/hero_run.png',
        'hero_attack1': 'assets/sprites/hero_attack1.png',
        'hero_attack2': 'assets/sprites/hero_attack2.png',
        'hero_hurt':    'assets/sprites/hero_hurt.png',
        'hero_dead':    'assets/sprites/hero_dead.png',
        // Enemy sprites (individual frames)
        'enemy_idle':   'assets/sprites/enemy_idle.png',
        'enemy_walk1':  'assets/sprites/enemy_walk1.png',
        'enemy_walk2':  'assets/sprites/enemy_walk2.png',
        'enemy_atk':    'assets/sprites/enemy_atk.png',
        'enemy_hurt':   'assets/sprites/enemy_hurt.png',
        // Boss sprites
        'boss_idle1':   'assets/sprites/boss_idle1.png',
        'boss_idle2':   'assets/sprites/boss_idle2.png',
        'boss_idle3':   'assets/sprites/boss_idle3.png',
        'boss_idle4':   'assets/sprites/boss_idle4.png',
        'boss_atk1':    'assets/sprites/boss_atk1.png',
        'boss_atk2':    'assets/sprites/boss_atk2.png',
        'boss_atk3':    'assets/sprites/boss_atk3.png',
        'boss_atk4':    'assets/sprites/boss_atk4.png',
        'boss_portrait':'assets/sprites/boss_portrait.png',
        // Fish
        'fish_r1':      'assets/sprites/fish_r1.png',
        'fish_r2':      'assets/sprites/fish_r2.png',
        'fish_r3':      'assets/sprites/fish_r3.png',
        'fish_r4':      'assets/sprites/fish_r4.png',
        'fish_dead':    'assets/sprites/fish_dead.png',
        // Projectile
        'bullet_blue':  'assets/sprites/bullet_blue.png',
        'bullet_purple':'assets/sprites/bullet_purple.png',
    },

    load(onProgress, onComplete) {
        const keys = Object.keys(this.paths);
        this.total = keys.length;
        if (this.total === 0) { onComplete(); return; }

        for (const key of keys) {
            const img = new Image();
            img.onload = () => {
                this.loaded++;
                onProgress(this.loaded / this.total);
                if (this.loaded >= this.total) onComplete();
            };
            img.onerror = () => {
                console.warn(`Failed to load: ${this.paths[key]}`);
                // Create a fallback magenta placeholder
                const c = document.createElement('canvas');
                c.width = 64; c.height = 64;
                const x = c.getContext('2d');
                x.fillStyle = '#f0f';
                x.fillRect(0, 0, 64, 64);
                x.fillStyle = '#000';
                x.font = '10px sans-serif';
                x.fillText(key, 4, 32);
                this.images[key] = c;
                this.loaded++;
                onProgress(this.loaded / this.total);
                if (this.loaded >= this.total) onComplete();
            };
            img.src = this.paths[key];
            this.images[key] = img;
        }
    },

    get(key) {
        const img = this.images[key];
        if (!img) return null;
        // Canvas 後備可直接用
        if (img.tagName && String(img.tagName).toUpperCase() === 'CANVAS') return img;
        // Firefox：未完成載入的圖不可 drawImage
        if (typeof img.complete === 'boolean' && !img.complete) return null;
        const nw = img.naturalWidth != null ? img.naturalWidth : img.width;
        if (!nw) return null;
        return img;
    }
};

// ================================================================
//  INPUT MANAGER
// ================================================================
const Input = {
    keys: {},
    codes: {},
    justPressed: {},
    justPressedCode: {},
    // 實體鍵碼（keyCode）後備 — 中文輸入法常把 e.key 改成 Process／注音
    _keyCodes: { down: {}, just: {} },
    // 滑鼠（桌面近戰後備）
    _mouse: { attack: false, attackHeld: false },
    // 鍵盤按住連砍冷卻
    _holdAtkCd: 0,
    _touchState: {
        left: false, right: false, up: false, down: false,
        jump: false, jumpHeld: false,
        attack: false, attackHeld: false,
        special: false, specialHeld: false,
        ultimate: false,
        autoToggle: false, anyTap: false,
        // 按住連發計時（幀）
        _atkCd: 0, _skillCd: 0
    },
    // 自動掛機注入的虛擬輸入（每幀由 AutoPlay 寫入，玩家手動優先）
    _auto: { axisX: 0, axisY: 0, jump: false, jumpHeld: false, attack: false, special: false, ultimate: false, run: false },

    reset() {
        for (let k in this.justPressed) this.justPressed[k] = false;
        for (let k in this.justPressedCode) this.justPressedCode[k] = false;
        for (let k in this._keyCodes.just) this._keyCodes.just[k] = false;
        this._touchState.anyTap = false;
        this._touchState.attack = false;
        this._touchState.special = false;
        this._touchState.ultimate = false;
        this._touchState.jump = false;
        this._touchState.autoToggle = false;
        this._mouse.attack = false;
        if (this._holdAtkCd > 0) this._holdAtkCd--;
        // 按住連發：攻擊／技能
        if (this._touchState.attackHeld) {
            if (this._touchState._atkCd > 0) this._touchState._atkCd--;
            else {
                this._touchState.attack = true;
                this._touchState._atkCd = 14; // ~4 下/秒
            }
        } else {
            this._touchState._atkCd = 0;
        }
        if (this._touchState.specialHeld) {
            if (this._touchState._skillCd > 0) this._touchState._skillCd--;
            else {
                this._touchState.special = true;
                this._touchState._skillCd = 20;
            }
        } else {
            this._touchState._skillCd = 0;
        }
        // left/right/up/down/jumpHeld 在 pointerup 清除
        // _auto 由 AutoPlay 每幀重設
    },

    clearAuto() {
        this._auto.axisX = 0;
        this._auto.axisY = 0;
        this._auto.jump = false;
        this._auto.jumpHeld = false;
        this._auto.attack = false;
        this._auto.special = false;
        this._auto.ultimate = false;
        this._auto.run = false;
    },

    isDown(key)        { return !!this.keys[key]; },
    isCodeDown(code)   { return !!this.codes[code]; },
    isJustPressed(key) { return !!this.justPressed[key]; },
    isCodeJustPressed(code) { return !!this.justPressedCode[code]; },

    getAxisX() {
        let x = 0;
        if (this.isDown('ArrowLeft') || this.isDown('a') || this.isDown('A') || this.isCodeDown('ArrowLeft') || this.isCodeDown('KeyA')) x -= 1;
        if (this.isDown('ArrowRight') || this.isDown('d') || this.isDown('D') || this.isCodeDown('ArrowRight') || this.isCodeDown('KeyD')) x += 1;
        if (this._touchState.left) x = -1;
        if (this._touchState.right) x = 1;
        // 玩家手動優先；無手動時才吃掛機軸
        if (x === 0 && this._auto.axisX) x = this._auto.axisX;
        return x;
    },

    /** -1 = up, 1 = down, 0 = horizontal only */
    getAxisY() {
        let y = 0;
        if (this.isDown('ArrowUp') || this.isDown('w') || this.isDown('W') || this.isCodeDown('ArrowUp') || this.isCodeDown('KeyW')) y -= 1;
        if (this.isDown('ArrowDown') || this.isDown('s') || this.isDown('S') || this.isCodeDown('ArrowDown') || this.isCodeDown('KeyS')) y += 1;
        if (this._touchState.up) y = -1;
        if (this._touchState.down) y = 1;
        if (y === 0 && this._auto.axisY) y = this._auto.axisY;
        return y;
    },

    /**
     * 8-direction aim for shooting.
     * @param {number} faceDir player facing when no horizontal input (1 or -1)
     * @returns {{x:number,y:number}} unit vector
     */
    getAimVector(faceDir = 1) {
        let x = this.getAxisX();
        let y = this.getAxisY();
        // No direction held → shoot forward
        if (x === 0 && y === 0) {
            x = faceDir;
            y = 0;
        }
        // Only vertical → pure up/down (no forced horizontal)
        // Only horizontal → pure left/right
        const len = Math.hypot(x, y) || 1;
        return { x: x / len, y: y / len };
    },

    isHoldingJump() {
        return this.isDown('ArrowUp') || this.isDown('w') || this.isDown('W') ||
            this.isDown(' ') || this.isDown('Space') || this.isDown('Spacebar') ||
            this.isCodeDown('ArrowUp') || this.isCodeDown('KeyW') || this.isCodeDown('Space') ||
            this._touchState.up || this._touchState.jumpHeld || this._auto.jumpHeld;
    },

    isRunning() {
        // 僅「以觸控為主」的裝置預設奔跑；桌面 Firefox/Safari 觸控筆電不強制
        const touchRun = (typeof TouchUI !== 'undefined' && TouchUI.isActive() && Compat.isPrimarilyTouch());
        return this.isDown('Shift') || this.isCodeDown('ShiftLeft') || this.isCodeDown('ShiftRight') ||
            this._auto.run || touchRun;
    },

    wantJump() {
        return this.isJustPressed('ArrowUp') || this.isJustPressed('w') || this.isJustPressed('W') ||
            this.isJustPressed(' ') || this.isJustPressed('Space') || this.isJustPressed('Spacebar') ||
            this.isCodeJustPressed('ArrowUp') || this.isCodeJustPressed('KeyW') || this.isCodeJustPressed('Space') ||
            this._touchState.jump || this._auto.jump;
    },
    /** 近戰：Z / J / 滑鼠左鍵；以 code/keyCode 為主（中文輸入法常改掉 e.key） */
    wantAttack() {
        if (this._touchState.attack || this._auto.attack || this._mouse.attack) return true;
        if (this.isJustPressed('z') || this.isJustPressed('Z') ||
            this.isJustPressed('j') || this.isJustPressed('J') ||
            this.isCodeJustPressed('KeyZ') || this.isCodeJustPressed('KeyJ') ||
            this.isCodeJustPressed('KeyY') || // QWERTZ 鍵盤 Y 位置
            this._keyCodes.just[90] || this._keyCodes.just[74]) {
            return true;
        }
        // 按住連砍（justPressed 被輸入法吃掉時仍可打）
        const held =
            this.isCodeDown('KeyZ') || this.isCodeDown('KeyJ') || this.isCodeDown('KeyY') ||
            this.isDown('z') || this.isDown('Z') || this.isDown('j') || this.isDown('J') ||
            this._keyCodes.down[90] || this._keyCodes.down[74] ||
            this._mouse.attackHeld;
        if (held) {
            if (this._holdAtkCd <= 0) {
                this._holdAtkCd = 12;
                return true;
            }
        } else {
            this._holdAtkCd = 0;
        }
        return false;
    },
    wantSpecial() {
        // X / K / C / F — Code + keyCode 綁定，避免中文輸入法吃掉 key
        if (this._touchState.special || this._auto.special) return true;
        if (this.isJustPressed('x') || this.isJustPressed('X') ||
            this.isJustPressed('k') || this.isJustPressed('K') ||
            this.isJustPressed('c') || this.isJustPressed('C') ||
            this.isJustPressed('f') || this.isJustPressed('F') ||
            this.isCodeJustPressed('KeyX') || this.isCodeJustPressed('KeyK') ||
            this.isCodeJustPressed('KeyC') || this.isCodeJustPressed('KeyF') ||
            this._keyCodes.just[88] || this._keyCodes.just[75] ||
            this._keyCodes.just[67] || this._keyCodes.just[70]) {
            return true;
        }
        return false;
    },
    wantUltimate() {
        // V / Q / R / U — 大絕招
        if (this._touchState.ultimate || this._auto.ultimate) return true;
        return this.isJustPressed('v') || this.isJustPressed('V') ||
            this.isJustPressed('q') || this.isJustPressed('Q') ||
            this.isJustPressed('r') || this.isJustPressed('R') ||
            this.isJustPressed('u') || this.isJustPressed('U') ||
            this.isCodeJustPressed('KeyV') || this.isCodeJustPressed('KeyQ') ||
            this.isCodeJustPressed('KeyR') || this.isCodeJustPressed('KeyU') ||
            this._keyCodes.just[86] || this._keyCodes.just[81] ||
            this._keyCodes.just[82] || this._keyCodes.just[85];
    },
    wantStart() {
        return this.isJustPressed('Enter') || this.isCodeJustPressed('Enter') || this._touchState.anyTap;
    },
    /** 掛機模式切換：H / P / 手機「掛機」鈕 */
    wantAutoToggle() {
        return this.isJustPressed('h') || this.isJustPressed('H') || this.isCodeJustPressed('KeyH') ||
            this.isJustPressed('p') || this.isJustPressed('P') || this.isCodeJustPressed('KeyP') ||
            this._touchState.autoToggle;
    }
};

// ================================================================
//  TOUCH UI — 手機／平板虛擬按鍵
//  以 touch 事件為主（iOS/Android 最穩），滑鼠為輔；避免 pointer+touch 雙重綁定互搶
// ================================================================
const TouchUI = {
    _touchDevice: null,

    /** 是否為觸控優先裝置（桌面滑鼠為主則 false，即使有觸控螢幕） */
    isTouchDevice() {
        if (this._touchDevice != null) return this._touchDevice;
        this._touchDevice = Compat.isPrimarilyTouch();
        return this._touchDevice;
    },

    /** 是否顯示／使用虛擬鍵 */
    isActive() {
        const el = document.getElementById('touch-controls');
        if (!el) return false;
        if (el.classList.contains('force-show') && this.isTouchDevice()) return true;
        // 桌面細指標：不啟用虛擬鍵（避免擋操作）
        if (!this.isTouchDevice()) return false;
        return true;
    },

    syncAutoButton() {
        const btn = document.getElementById('btn-auto');
        if (!btn) return;
        // const AutoPlay 在 TDZ 時 typeof 仍會 throw，必須 try/catch
        let on = false;
        try {
            on = !!(typeof AutoPlay !== 'undefined' && AutoPlay && AutoPlay.enabled);
        } catch (e) {
            on = false;
        }
        if (on) {
            btn.classList.add('active');
            btn.textContent = '掛機中';
        } else {
            btn.classList.remove('active');
            btn.textContent = '掛機';
        }
    },

    /**
     * 綁定按住型按鈕：以 touch identifier 支援多點觸控
     * 不用 pointer + touch 混用（iOS 上 preventDefault 會讓另一套事件失效）
     */
    bindHold(el, onDown, onUp) {
        if (!el) return;
        const ids = new Set();

        const press = (id) => {
            if (ids.has(id)) return;
            ids.add(id);
            if (ids.size === 1) {
                el.classList.add('pressed');
                try { SFX.init(); } catch (_) {}
                onDown();
            }
        };
        const release = (id) => {
            if (!ids.has(id)) return;
            ids.delete(id);
            if (ids.size === 0) {
                el.classList.remove('pressed');
                onUp();
            }
        };
        const releaseAll = () => {
            if (ids.size === 0) return;
            ids.clear();
            el.classList.remove('pressed');
            onUp();
        };

        // —— Touch（手機主路徑）——
        Compat.on(el, 'touchstart', (e) => {
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
            for (let i = 0; i < e.changedTouches.length; i++) {
                press('t' + e.changedTouches[i].identifier);
            }
        }, { passive: false });

        Compat.on(el, 'touchend', (e) => {
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
            for (let i = 0; i < e.changedTouches.length; i++) {
                release('t' + e.changedTouches[i].identifier);
            }
        }, { passive: false });

        Compat.on(el, 'touchcancel', (e) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                release('t' + e.changedTouches[i].identifier);
            }
        }, { passive: true });

        Compat.on(el, 'touchmove', (e) => {
            if (e.cancelable) e.preventDefault();
        }, { passive: false });

        // —— Mouse（桌面）——
        Compat.on(el, 'mousedown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            press('mouse');
            const onMouseUp = () => {
                release('mouse');
                window.removeEventListener('mouseup', onMouseUp);
            };
            window.addEventListener('mouseup', onMouseUp);
        });

        Compat.on(document, 'visibilitychange', () => {
            if (document.hidden) releaseAll();
        });
    },

    init() {
        const controls = document.getElementById('touch-controls');
        if (!controls) return;

        // 僅觸控優先裝置顯示虛擬鍵（桌面 Firefox/Safari 保持鍵盤）
        if (this.isTouchDevice()) {
            controls.classList.add('force-show');
            controls.setAttribute('aria-hidden', 'false');
        } else {
            controls.classList.remove('force-show');
            controls.style.display = 'none';
            controls.setAttribute('aria-hidden', 'true');
        }

        const holdMap = {
            'btn-left': 'left',
            'btn-right': 'right',
            'btn-up': 'up',
            'btn-down': 'down'
        };

        Object.keys(holdMap).forEach(id => {
            const key = holdMap[id];
            this.bindHold(document.getElementById(id),
                () => { Input._touchState[key] = true; },
                () => { Input._touchState[key] = false; }
            );
        });

        this.bindHold(document.getElementById('btn-jump'),
            () => {
                Input._touchState.jump = true;
                Input._touchState.jumpHeld = true;
            },
            () => { Input._touchState.jumpHeld = false; }
        );

        this.bindHold(document.getElementById('btn-attack'),
            () => {
                Input._touchState.attack = true;
                Input._touchState.attackHeld = true;
                Input._touchState._atkCd = 14;
            },
            () => { Input._touchState.attackHeld = false; }
        );

        this.bindHold(document.getElementById('btn-skill'),
            () => {
                Input._touchState.special = true;
                Input._touchState.specialHeld = true;
                Input._touchState._skillCd = 20;
            },
            () => { Input._touchState.specialHeld = false; }
        );

        this.bindHold(document.getElementById('btn-ult'),
            () => { Input._touchState.ultimate = true; },
            () => {}
        );

        this.bindHold(document.getElementById('btn-auto'),
            () => { Input._touchState.autoToggle = true; },
            () => {}
        );

        // 點畫面開始／確認（避開虛擬鍵）
        const menuTap = (e) => {
            if (domClosest(e.target, '.dpad-btn, .action-btn, .util-btn, #dpad, #action-buttons, #btn-auto')) {
                return;
            }
            try { SFX.init(); } catch (err) {}
            Input._touchState.anyTap = true;
            // 協助部分瀏覽器取得鍵盤焦點
            try { if (gameCanvas && gameCanvas.focus) gameCanvas.focus(); } catch (err) {}
        };

        Compat.on(gameCanvas, 'mousedown', menuTap);
        Compat.on(gameCanvas, 'click', menuTap);
        if (this.isTouchDevice()) {
            Compat.on(gameCanvas, 'touchstart', menuTap, { passive: true });
        }

        const container = document.getElementById('game-container');
        if (container) {
            Compat.on(container, 'click', (e) => {
                if (domClosest(e.target, '.dpad-btn, .action-btn, .util-btn, #dpad, #action-buttons, #btn-auto')) return;
                menuTap(e);
            });
            if (this.isTouchDevice()) {
                Compat.on(container, 'touchstart', (e) => {
                    if (domClosest(e.target, '.dpad-btn, .action-btn, .util-btn, #dpad, #action-buttons, #btn-auto')) return;
                    menuTap(e);
                }, { passive: true });
            }
        }

        const loading = document.getElementById('loading-screen');
        if (loading) {
            Compat.on(loading, 'click', menuTap);
            if (this.isTouchDevice()) {
                Compat.on(loading, 'touchstart', menuTap, { passive: true });
            }
        }

        // 觸控裝置才攔預設手勢（桌面 Firefox 勿全局 preventDefault）
        if (this.isTouchDevice()) {
            Compat.on(document, 'touchmove', (e) => {
                if (e.cancelable && e.target && (e.target === document.body || e.target === document.documentElement ||
                    domClosest(e.target, '#game-container'))) {
                    e.preventDefault();
                }
            }, { passive: false });

            Compat.on(document, 'gesturestart', (e) => { e.preventDefault(); }, { passive: false });
            Compat.on(document, 'gesturechange', (e) => { e.preventDefault(); }, { passive: false });

            let lastTouchEnd = 0;
            Compat.on(document, 'touchend', (e) => {
                const now = Date.now();
                if (now - lastTouchEnd <= 300) {
                    if (e.cancelable) e.preventDefault();
                }
                lastTouchEnd = now;
            }, { passive: false });
        }

        const refresh = () => {
            this._touchDevice = null; // 旋轉／視窗變化後重判
            if (this.isTouchDevice()) {
                controls.classList.add('force-show');
                controls.style.display = '';
                controls.setAttribute('aria-hidden', 'false');
            } else {
                controls.classList.remove('force-show');
                controls.style.display = 'none';
                controls.setAttribute('aria-hidden', 'true');
            }
            this.syncAutoButton();
            if (typeof Layout !== 'undefined') Layout.fit();
        };
        Compat.on(window, 'resize', refresh);
        Compat.on(window, 'orientationchange', () => {
            setTimeout(refresh, 100);
            setTimeout(refresh, 400);
        });
        refresh();
    }
};

// Keyboard — 跨瀏覽器 + 中文輸入法友善（code / keyCode 為主）
function normalizeKey(e) {
    if (e.key === 'Spacebar') return ' ';
    if (e.key === 'Esc') return 'Escape';
    // 輸入法組字中 key 常是 Process / Unidentified，不當成遊戲字元
    if (e.key === 'Process' || e.key === 'Unidentified') return '';
    return e.key;
}
function normalizeCode(e) {
    if (e.code && e.code !== 'Unidentified') return e.code;
    // 極舊瀏覽器用 keyCode 對照
    const map = {
        37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown',
        32: 'Space', 13: 'Enter', 16: 'ShiftLeft',
        65: 'KeyA', 68: 'KeyD', 87: 'KeyW', 83: 'KeyS',
        90: 'KeyZ', 74: 'KeyJ', 88: 'KeyX', 67: 'KeyC', 70: 'KeyF',
        86: 'KeyV', 81: 'KeyQ', 82: 'KeyR', 85: 'KeyU',
        72: 'KeyH', 80: 'KeyP', 75: 'KeyK', 89: 'KeyY'
    };
    return map[e.keyCode] || map[e.which] || '';
}

/** 由實體鍵位強制寫入 code（輸入法改 key 時仍可靠） */
function forceCodeFromKeyCode(kc) {
    const map = {
        37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown',
        32: 'Space', 13: 'Enter',
        65: 'KeyA', 68: 'KeyD', 87: 'KeyW', 83: 'KeyS',
        90: 'KeyZ', 74: 'KeyJ', 88: 'KeyX', 67: 'KeyC', 70: 'KeyF',
        86: 'KeyV', 81: 'KeyQ', 82: 'KeyR', 85: 'KeyU',
        72: 'KeyH', 80: 'KeyP', 75: 'KeyK', 89: 'KeyY',
        16: 'ShiftLeft'
    };
    return map[kc] || '';
}

Compat.on(window, 'keydown', (e) => {
    // 忽略長按系統 repeat 造成的「一直 justPressed」；連砍由 hold 計時處理
    const isRepeat = !!e.repeat;
    const key = normalizeKey(e);
    let code = normalizeCode(e);
    const kc = e.keyCode || e.which || 0;

    // keyCode 後備：強制對應實體鍵（修中文 IME 下 Z 無效）
    if (kc) {
        if (!isRepeat && !Input._keyCodes.down[kc]) Input._keyCodes.just[kc] = true;
        Input._keyCodes.down[kc] = true;
        const forced = forceCodeFromKeyCode(kc);
        if (forced) code = code || forced;
    }

    if (key && !isRepeat && !Input.keys[key]) Input.justPressed[key] = true;
    if (code && !isRepeat && !Input.codes[code]) Input.justPressedCode[code] = true;
    if (key) Input.keys[key] = true;
    if (code) Input.codes[code] = true;

    // 空白鍵也標 ' ' 與 Space
    if (key === ' ' || code === 'Space' || kc === 32) {
        Input.keys[' '] = true;
        Input.keys['Space'] = true;
        Input.codes['Space'] = true;
        if (!isRepeat) {
            Input.justPressed[' '] = true;
            Input.justPressedCode['Space'] = true;
        }
    }
    // Z 攻擊：無論 IME 是否改 key，確保 KeyZ 被按下
    if (code === 'KeyZ' || kc === 90) {
        Input.codes['KeyZ'] = true;
        if (!isRepeat) Input.justPressedCode['KeyZ'] = true;
        Input.keys['z'] = true;
        Input.keys['Z'] = true;
        if (!isRepeat) {
            Input.justPressed['z'] = true;
            Input.justPressed['Z'] = true;
        }
    }
    // J 攻擊後備
    if (code === 'KeyJ' || kc === 74) {
        Input.codes['KeyJ'] = true;
        if (!isRepeat) Input.justPressedCode['KeyJ'] = true;
    }

    try { SFX.init(); } catch (err) {}
    // 只擋遊戲相關鍵
    const block = (
        key === ' ' || key === 'ArrowUp' || key === 'ArrowDown' ||
        key === 'ArrowLeft' || key === 'ArrowRight' ||
        code === 'Space' || (code && code.indexOf('Arrow') === 0) ||
        code === 'KeyW' || code === 'KeyA' || code === 'KeyS' || code === 'KeyD' ||
        code === 'KeyZ' || code === 'KeyJ' || code === 'KeyY' || code === 'KeyX' || code === 'KeyC' ||
        code === 'KeyF' || code === 'KeyV' || code === 'KeyQ' || code === 'KeyR' ||
        code === 'KeyU' || code === 'KeyH' || code === 'KeyP' || code === 'KeyK' ||
        code === 'ShiftLeft' || code === 'ShiftRight' ||
        kc === 32 || kc === 90 || kc === 74 || kc === 88 || kc === 37 || kc === 38 || kc === 39 || kc === 40
    );
    if (block && e.preventDefault) e.preventDefault();
});
Compat.on(window, 'keyup', (e) => {
    const key = normalizeKey(e);
    let code = normalizeCode(e);
    const kc = e.keyCode || e.which || 0;
    if (kc) {
        Input._keyCodes.down[kc] = false;
        const forced = forceCodeFromKeyCode(kc);
        if (forced) code = code || forced;
    }
    if (key) Input.keys[key] = false;
    if (code) Input.codes[code] = false;
    if (key === ' ' || code === 'Space' || kc === 32) {
        Input.keys[' '] = false;
        Input.keys['Space'] = false;
        Input.codes['Space'] = false;
    }
    if (code === 'KeyZ' || kc === 90) {
        Input.codes['KeyZ'] = false;
        Input.keys['z'] = false;
        Input.keys['Z'] = false;
    }
    if (code === 'KeyJ' || kc === 74) {
        Input.codes['KeyJ'] = false;
    }
});

// 滑鼠左鍵 = 近戰（桌面後備，避開虛擬鍵）
Compat.on(window, 'mousedown', (e) => {
    if (e.button !== 0) return;
    if (domClosest(e.target, '.dpad-btn, .action-btn, .util-btn, #dpad, #action-buttons, #btn-auto')) return;
    // 僅在遊戲進行中當攻擊；選單仍用 click → anyTap
    Input._mouse.attack = true;
    Input._mouse.attackHeld = true;
    try { SFX.init(); } catch (err) {}
});
Compat.on(window, 'mouseup', (e) => {
    if (e.button !== 0) return;
    Input._mouse.attackHeld = false;
});
Compat.on(window, 'blur', () => {
    Input._mouse.attackHeld = false;
    Input.codes = {};
    Input.keys = {};
    Input._keyCodes.down = {};
});

// TouchUI / Layout 延後到 AutoPlay 宣告後再 init（避免 const TDZ）

// ================================================================
//  CAMERA
// ================================================================
const Camera = {
    x: 0, y: 0,
    shakeTime: 0, shakeMag: 0,
    targetSmooth: 0.08,

    update(target, levelW) {
        const tx = target.x - W / 2;
        this.x += (tx - this.x) * this.targetSmooth;
        if (this.x < 0) this.x = 0;
        if (this.x > levelW - W) this.x = Math.max(0, levelW - W);
        if (this.shakeTime > 0) this.shakeTime--;
    },

    shake(mag, time) {
        this.shakeMag = mag;
        this.shakeTime = time;
    },

    apply(context) {
        context.save();
        let sx = 0, sy = 0;
        if (this.shakeTime > 0) {
            sx = (Math.random() - 0.5) * this.shakeMag;
            sy = (Math.random() - 0.5) * this.shakeMag;
        }
        context.translate(-Math.floor(this.x) + sx, sy);
    },

    restore(context) { context.restore(); }
};

// ================================================================
//  PARTICLE SYSTEM
// ================================================================
const Particles = {
    list: [],

    emit(x, y, count, color, type = 'dust') {
        for (let i = 0; i < count; i++) {
            this.list.push({
                x, y,
                vx: (Math.random() - 0.5) * (type === 'explode' ? 8 : 4),
                vy: (Math.random() - 0.5) * (type === 'explode' ? 8 : 4) - (type === 'sparkle' ? 3 : 1),
                life: 1,
                decay: Math.random() * 0.04 + 0.015,
                size: type === 'explode' ? Math.random() * 6 + 3 : Math.random() * 4 + 1,
                color,
                type
            });
        }
    },

    update() {
        for (let i = this.list.length - 1; i >= 0; i--) {
            const p = this.list[i];
            p.x += p.vx;
            p.y += p.vy;
            if (p.type === 'dust' || p.type === 'explode') p.vy += 0.15;
            if (p.type === 'sparkle') p.vy -= 0.02;
            p.life -= p.decay;
            if (p.life <= 0) this.list.splice(i, 1);
        }
    },

    draw(context) {
        for (const p of this.list) {
            context.globalAlpha = Math.max(0, p.life);
            if (p.type === 'confetti') {
                context.fillStyle = `hsl(${Math.random() * 360}, 100%, 60%)`;
            } else {
                context.fillStyle = p.color;
            }
            if (p.type === 'sparkle') {
                // Diamond shape
                context.save();
                context.translate(p.x, p.y);
                context.rotate(Math.PI / 4);
                context.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                context.restore();
            } else {
                context.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
            }
        }
        context.globalAlpha = 1;
    }
};

// ================================================================
//  PHYSICS HELPERS
// ================================================================
function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
const GRAVITY = 0.52;
const MAX_FALL = 14;
// Landing tolerance: how far feet can sink into a platform top and still snap on
const LAND_SLOP = 10;
const STOMP_SLOP = 16; // feet can be this far past target top and still count as stomp
const STOMP_BOUNCE = -10.5;
// Invincibility frames (~60fps): hurt / spawn / ultimate
const I_FRAMES_HURT = 180;   // 約 3 秒受傷保護
const I_FRAMES_SPAWN = 150;  // 約 2.5 秒關卡開始保護
const I_FRAMES_ULT = 120;    // 約 2 秒大絕後保護

/** True if player is landing on target from above (Mario-style stomp). */
function isStomp(player, target) {
    if (!player || player.dead || !target || target.dead) return false;
    if (!aabb(player, target)) return false;
    // Must be moving downward (or resting after impact)
    if (player.vy < -1) return false;
    const feet = player.y + player.h;
    const top = target.y;
    // Previous feet were at/above the target top → approaching from above
    const fromAbove = player.prevBottom <= top + STOMP_SLOP;
    // Current feet still in the upper half of the target (not body-checking from the side)
    const onTop = feet <= top + target.h * 0.55 + 4;
    return fromAbove && onTop;
}

/** Apply stomp: damage target, bounce player, score. */
function doStomp(player, target, dmg, score) {
    target.takeDamage(dmg, player.dir || 1);
    player.vy = STOMP_BOUNCE;
    player.grounded = false;
    player.coyoteTime = 0;
    // Sit on top so we don't immediately re-collide sideways
    player.y = Math.min(player.y, target.y - player.h + 2);
    if (score) player.score += score;
    if (player.addUlt) player.addUlt(target.dead || (target.hp !== undefined && target.hp <= 0) ? 22 : 12);
    Particles.emit(target.x + target.w / 2, target.y, 10, '#ffe066', 'sparkle');
    Camera.shake(3, 6);
}

// ================================================================
//  PLAYER
// ================================================================
class Player {
    constructor(x, y) {
        this.x = x; this.y = y;
        // Slightly smaller hitbox than the drawn sprite so landing feels fair
        this.w = 28; this.h = 40;
        this.vx = 0; this.vy = 0;
        this.dir = 1;
        this.grounded = false;
        this.state = 'idle'; // idle, walk, run, jump, fall, attack, hurt, dead
        this.hp = 5; this.maxHp = 5;
        this.score = 0; this.fish = 0;
        this.attackTimer = 0;
        this.invincibility = 0;
        this.specialCooldown = 0;
        this.coyoteTime = 0;
        this.jumpBuffer = 0;
        this.dead = false;
        this.deathTimer = 0;
        // Ultimate 大絕招
        this.ultCharge = 35;       // start with some charge so new players can try it
        this.ultMax = 100;
        this.ultTimer = 0;         // active flash / aura duration
        this.ultNameFlash = 0;     // title text frames
        // Previous bottom for one-way platform landing
        this.prevBottom = y + this.h;
        // Animation
        this.frame = 0;
        this.animTimer = 0;
        this.speed = 4;
        this.runSpeed = 5.5;
        // ~145px peak height → can reach platforms ~130px above ground
        this.jumpForce = -12.8;
    }

    addUlt(amount) {
        if (this.dead) return;
        this.ultCharge = Math.min(this.ultMax, this.ultCharge + amount);
    }

    update(level) {
        if (this.dead) {
            this.vy += GRAVITY;
            this.y += this.vy;
            this.deathTimer++;
            return;
        }

        if (this.invincibility > 0) this.invincibility--;
        if (this.specialCooldown > 0) this.specialCooldown--;
        if (this.ultTimer > 0) this.ultTimer--;
        if (this.ultNameFlash > 0) this.ultNameFlash--;
        // Passive ultimate charge (full in ~25s if idle)
        if (this.ultCharge < this.ultMax && Math.random() < 0.35) {
            this.ultCharge = Math.min(this.ultMax, this.ultCharge + 0.08);
        }
        if (this.attackTimer > 0) {
            this.attackTimer--;
            if (this.attackTimer === 0) this.state = this.grounded ? 'idle' : 'fall';
        }
        if (this.jumpBuffer > 0) this.jumpBuffer--;

        // Movement
        const ax = Input.getAxisX();
        const isRunning = Input.isRunning();
        const moveSpeed = isRunning ? this.runSpeed : this.speed;

        if (this.attackTimer === 0) {
            if (ax !== 0) {
                this.vx += ax * 0.75;
                if (Math.abs(this.vx) > moveSpeed) this.vx = moveSpeed * ax;
                this.dir = ax;
                if (this.grounded) {
                    this.state = isRunning ? 'run' : 'walk';
                    if (Math.random() < 0.08) Particles.emit(this.x + this.w / 2, this.y + this.h, 1, '#aa9977', 'dust');
                }
            } else {
                this.vx *= this.grounded ? 0.72 : 0.9;
                if (Math.abs(this.vx) < 0.25) this.vx = 0;
                if (this.grounded && this.attackTimer === 0) this.state = 'idle';
            }
        } else {
            this.vx *= 0.6;
        }

        // Gravity
        this.vy += GRAVITY;
        if (this.vy > MAX_FALL) this.vy = MAX_FALL;

        // Air state
        if (!this.grounded) {
            if (this.attackTimer === 0) this.state = this.vy < 0 ? 'jump' : 'fall';
            if (this.coyoteTime > 0) this.coyoteTime--;
        } else {
            this.coyoteTime = 8;
        }

        // Jump buffer: press slightly early still counts
        if (Input.wantJump()) this.jumpBuffer = 8;

        // Jump
        if (this.jumpBuffer > 0 && (this.grounded || this.coyoteTime > 0) && this.attackTimer === 0) {
            this.vy = this.jumpForce;
            this.grounded = false;
            this.coyoteTime = 0;
            this.jumpBuffer = 0;
            this.state = 'jump';
            SFX.jump();
            Particles.emit(this.x + this.w / 2, this.y + this.h, 4, '#ccc', 'dust');
        }

        // Variable jump height (only cut if jump key released)
        if (!Input.isHoldingJump() && this.vy < -4) {
            this.vy *= 0.55;
        }

        // Attack (melee aims with hold direction)
        if (Input.wantAttack() && this.attackTimer === 0) {
            this.attackTimer = 18;
            this.state = 'attack';
            SFX.attack();
            const aim = Input.getAimVector(this.dir);
            // Melee hitbox extends in aim direction
            const reach = 38;
            const hx = this.x + this.w / 2 + aim.x * reach - 18;
            const hy = this.y + this.h / 2 + aim.y * reach - 18;
            const hitbox = { x: hx, y: hy, w: 36, h: 36 };
            for (const e of level.enemies) {
                if (aabb(hitbox, e) && !e.dead) {
                    e.takeDamage(1, this.dir);
                    this.score += 10;
                    this.addUlt(6);
                }
            }
            if (level.boss && aabb(hitbox, level.boss) && !level.boss.dead) {
                level.boss.takeDamage(1, this.dir);
                this.addUlt(8);
            }
            Particles.emit(
                this.x + this.w / 2 + aim.x * 28,
                this.y + this.h / 2 + aim.y * 28,
                5, '#ffe066', 'sparkle'
            );
        }

        // Special skill: 魚彈 8 向射擊（↑↓←→ + 斜向）
        if (Input.wantSpecial() && this.specialCooldown <= 0) {
            this.fireSkill(level);
        }

        // 大絕招：魚影・復仇風暴
        if (Input.wantUltimate() && this.ultCharge >= this.ultMax && this.ultTimer <= 0) {
            this.fireUltimate(level);
        }

        // Track previous feet position for one-way landing
        this.prevBottom = this.y + this.h;

        // Apply X movement + solid collisions only
        this.x += this.vx;
        this.resolveCollisions(level.platforms, 'x');

        // Apply Y movement + collisions (one-way platforms land from above)
        this.y += this.vy;
        this.grounded = false;
        this.resolveCollisions(level.platforms, 'y');

        // Boundaries
        if (this.x < 0) this.x = 0;
        if (this.x + this.w > level.w) this.x = level.w - this.w;
        if (this.y > 650) this.takeDamage(99);

        // Animation
        this.animTimer++;
        const animSpeed = this.state === 'run' ? 4 : this.state === 'walk' ? 6 : 8;
        if (this.animTimer >= animSpeed) {
            this.animTimer = 0;
            this.frame = (this.frame + 1) % 4;
        }
    }

    resolveCollisions(platforms, axis) {
        for (const p of platforms) {
            if (!aabb(this, p)) continue;

            // Floating platforms are one-way: only land on top while falling
            if (p.oneWay) {
                if (axis === 'x') continue; // never block sideways
                // Only snap when falling onto the platform from above
                if (this.vy >= 0 && this.prevBottom <= p.y + LAND_SLOP) {
                    this.y = p.y - this.h;
                    this.vy = 0;
                    this.grounded = true;
                }
                continue;
            }

            // Solid (ground / walls)
            if (axis === 'x') {
                if (this.vx > 0) this.x = p.x - this.w;
                else if (this.vx < 0) this.x = p.x + p.w;
                else {
                    // Resolve by overlap depth if no velocity
                    const overlapL = (this.x + this.w) - p.x;
                    const overlapR = (p.x + p.w) - this.x;
                    if (overlapL < overlapR) this.x = p.x - this.w;
                    else this.x = p.x + p.w;
                }
                this.vx = 0;
            } else {
                if (this.vy > 0 || this.prevBottom <= p.y + LAND_SLOP) {
                    this.y = p.y - this.h;
                    this.grounded = true;
                } else if (this.vy < 0) {
                    this.y = p.y + p.h;
                }
                this.vy = 0;
            }
        }
    }

    fireSkill(level) {
        this.specialCooldown = 55; // ~0.9s at 60fps
        this.attackTimer = 14;
        this.state = 'attack';
        SFX.shoot();
        this.addUlt(4);

        const aim = Input.getAimVector(this.dir);
        // Face the horizontal component of aim when shooting sideways
        if (Math.abs(aim.x) > 0.2) this.dir = aim.x > 0 ? 1 : -1;

        const muzzle = 20;
        const cx = this.x + this.w / 2 + aim.x * muzzle;
        const cy = this.y + this.h / 2 + aim.y * muzzle;

        // Perpendicular unit for slight spread (works for vertical too)
        const px = -aim.y;
        const py = aim.x;
        const speed = 12;

        // Main bolt along aim
        level.projectiles.push(new Projectile(cx, cy, this.dir, true, {
            damage: 2,
            pierce: 2,
            scale: 1.35,
            vxOverride: aim.x * speed,
            vy: aim.y * speed
        }));
        // Two side bolts (spread)
        for (const s of [-1, 1]) {
            const sx = aim.x * (speed - 1) + px * s * 2.2;
            const sy = aim.y * (speed - 1) + py * s * 2.2;
            level.projectiles.push(new Projectile(
                cx + px * s * 8,
                cy + py * s * 8,
                this.dir, true, {
                    damage: 1,
                    pierce: 1,
                    scale: 0.95,
                    vxOverride: sx,
                    vy: sy
                }
            ));
        }

        // Muzzle flash along aim
        Particles.emit(cx, cy, 10, '#66ddff', 'sparkle');
        Particles.emit(cx + aim.x * 12, cy + aim.y * 12, 6, '#ffffff', 'sparkle');
        Camera.shake(2, 4);
    }

    /**
     * 大絕招「魚影・復仇風暴」
     * 全屏範圍傷害 + 環形彈幕 + 短暫無敵
     */
    fireUltimate(level) {
        this.ultCharge = 0;
        this.ultTimer = 50;
        this.ultNameFlash = 90;
        this.attackTimer = 28;
        this.state = 'attack';
        this.invincibility = Math.max(this.invincibility, I_FRAMES_ULT);
        this.vx = 0;
        this.vy = Math.min(this.vy, -2);

        SFX.ultimate();
        Camera.shake(14, 28);

        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;

        // Massive burst particles
        Particles.emit(cx, cy, 40, '#ffe066', 'explode');
        Particles.emit(cx, cy, 30, '#66eeff', 'sparkle');
        Particles.emit(cx, cy, 20, '#ff66aa', 'explode');
        for (let i = 0; i < 24; i++) {
            Particles.emit(
                cx + (Math.random() - 0.5) * 120,
                cy + (Math.random() - 0.5) * 80,
                2, ['#ffcc00', '#4af', '#f4a', '#fff'][i % 4], 'confetti'
            );
        }

        // AOE damage around player (wide revenge storm)
        const aoe = { x: cx - 160, y: cy - 110, w: 320, h: 220 };
        for (const e of level.enemies) {
            if (!e.dead && aabb(aoe, e)) {
                e.takeDamage(5, this.dir);
                this.score += 40;
                Particles.emit(e.x + e.w / 2, e.y + e.h / 2, 12, '#fa0', 'explode');
            }
        }
        if (level.boss && !level.boss.dead && aabb(aoe, level.boss)) {
            level.boss.takeDamage(6, this.dir);
            this.score += 80;
            Particles.emit(level.boss.x + level.boss.w / 2, level.boss.y + level.boss.h / 2, 20, '#f4f', 'explode');
        }

        // Ring of fish-energy projectiles (16 directions)
        const ring = 16;
        for (let i = 0; i < ring; i++) {
            const ang = (Math.PI * 2 * i) / ring;
            const dirX = Math.cos(ang);
            const dirY = Math.sin(ang);
            // Projectile uses horizontal dir sign; add custom velocity via opts
            const pdir = dirX >= 0 ? 1 : -1;
            level.projectiles.push(new Projectile(cx, cy, pdir, true, {
                damage: 3,
                speed: Math.abs(dirX) * 9 + 2,
                pierce: 3,
                scale: 1.2,
                vy: dirY * 8,
                vxOverride: dirX * 9
            }));
        }

        // Forward mega beam (3 fat bolts)
        for (let i = -1; i <= 1; i++) {
            level.projectiles.push(new Projectile(cx + this.dir * 20, cy + i * 14, this.dir, true, {
                damage: 4,
                speed: 14,
                pierce: 5,
                scale: 1.8
            }));
        }
    }

    /** Grant invincibility frames (keeps the longer remaining time). */
    grantIFrames(frames) {
        this.invincibility = Math.max(this.invincibility, frames);
    }

    takeDamage(dmg) {
        // Full invincibility protection — no damage while timer > 0
        if (this.invincibility > 0 || this.dead) return;
        this.hp -= dmg;
        Camera.shake(6, 12);
        if (this.hp <= 0) {
            this.hp = 0;
            this.dead = true;
            this.state = 'dead';
            this.vy = -8;
            SFX.death();
            Particles.emit(this.x + this.w / 2, this.y + this.h / 2, 15, '#f44', 'explode');
        } else {
            this.grantIFrames(I_FRAMES_HURT); // ~3 秒無敵
            this.vy = -6;
            this.vx = -this.dir * 5;
            SFX.hurt();
            Particles.emit(this.x + this.w / 2, this.y + this.h / 2, 8, '#f88', 'dust');
            Particles.emit(this.x + this.w / 2, this.y + this.h / 2, 6, '#66eeff', 'sparkle');
        }
    }

    draw(context) {
        // Blink only in the last ~0.7s of i-frames; solid shield for most of the duration
        const blinkPhase = this.invincibility > 0 && this.invincibility < 42 &&
            this.ultTimer <= 0 && Math.floor(this.invincibility / 3) % 2 === 0;
        if (blinkPhase) return;

        const ax = this.x + this.w / 2;
        const ay = this.y + this.h / 2;

        // Invincibility shield bubble (visible whole time)
        if (this.invincibility > 0) {
            const t = Date.now() / 100;
            const pulse = 34 + Math.sin(t) * 5;
            const alpha = this.invincibility < 42
                ? 0.15 + (this.invincibility / 42) * 0.25
                : 0.35 + Math.sin(t * 1.5) * 0.1;
            context.save();
            context.globalAlpha = alpha;
            // Outer ring
            context.strokeStyle = this.ultTimer > 0 ? '#ffe066' : '#66eeff';
            context.lineWidth = 3;
            context.beginPath();
            context.arc(ax, ay, pulse + 6, 0, Math.PI * 2);
            context.stroke();
            // Soft fill
            context.globalAlpha = alpha * 0.45;
            context.fillStyle = this.ultTimer > 0 ? '#ffcc00' : '#88ddff';
            context.beginPath();
            context.arc(ax, ay, pulse, 0, Math.PI * 2);
            context.fill();
            // Hex-ish sparkles
            context.globalAlpha = alpha + 0.2;
            context.fillStyle = '#fff';
            for (let i = 0; i < 6; i++) {
                const a = t + i * Math.PI / 3;
                context.fillRect(
                    ax + Math.cos(a) * (pulse + 2) - 1.5,
                    ay + Math.sin(a) * (pulse + 2) - 1.5,
                    3, 3
                );
            }
            context.restore();
        }

        // Ultimate aura (extra gold ring)
        if (this.ultTimer > 0) {
            const pulse = 44 + Math.sin(Date.now() / 50) * 12;
            context.save();
            context.globalAlpha = 0.35;
            context.fillStyle = '#ffcc00';
            context.beginPath();
            context.arc(ax, ay, pulse, 0, Math.PI * 2);
            context.fill();
            context.globalAlpha = 0.55;
            context.strokeStyle = '#ff8800';
            context.lineWidth = 3;
            context.beginPath();
            context.arc(ax, ay, pulse + 10, 0, Math.PI * 2);
            context.stroke();
            context.restore();
        }

        context.save();
        context.translate(this.x + this.w / 2, this.y + this.h / 2);
        if (this.dir === -1) context.scale(-1, 1);

        let img;
        const drawW = 64, drawH = 72;

        switch (this.state) {
            case 'idle':
                img = Assets.get('hero_idle');
                break;
            case 'walk':
                img = Assets.get('hero_walk' + ((this.frame % 4) + 1));
                break;
            case 'run':
                img = Assets.get('hero_run');
                break;
            case 'jump':
            case 'fall':
                img = Assets.get('hero_run'); // Dash pose in air
                break;
            case 'attack':
                img = Assets.get(this.attackTimer > 9 ? 'hero_attack1' : 'hero_attack2');
                break;
            case 'hurt':
                img = Assets.get('hero_hurt');
                break;
            case 'dead':
                img = Assets.get('hero_dead');
                break;
            default:
                img = Assets.get('hero_idle');
        }

        if (img && img.width) {
            safeDrawImage(context, img, -drawW / 2, -drawH / 2, drawW, drawH);
        } else {
            context.fillStyle = '#f0f';
            context.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
        }
        context.restore();
    }
}

// ================================================================
//  ENEMY (Calico Cat)
// ================================================================
class Enemy {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.w = 28; this.h = 28;
        this.vx = 0; this.vy = 0;
        this.dir = Math.random() > 0.5 ? 1 : -1;
        this.speed = 1.2 + Math.random() * 0.5;
        this.hp = 2;
        this.dead = false;
        this.state = 'walk'; // walk, attack, hurt
        this.frame = 0;
        this.animTimer = 0;
        this.hurtTimer = 0;
        this.attackTimer = 0;
        this.deathTimer = 0;
    }

    update(level, player) {
        if (this.dead) {
            this.deathTimer++;
            return;
        }
        if (this.hurtTimer > 0) {
            this.hurtTimer--;
            this.state = 'hurt';
            this.vx *= 0.8;
            if (this.hurtTimer === 0) this.state = 'walk';
        }

        const prevBottom = this.y + this.h;

        // Gravity
        this.vy += GRAVITY;
        if (this.vy > MAX_FALL) this.vy = MAX_FALL;
        this.y += this.vy;

        // Platform collision (one-way land from above)
        let grounded = false;
        for (const p of level.platforms) {
            if (!aabb(this, p)) continue;
            if (p.oneWay) {
                if (this.vy >= 0 && prevBottom <= p.y + LAND_SLOP) {
                    this.y = p.y - this.h;
                    this.vy = 0;
                    grounded = true;
                }
            } else if (this.vy >= 0) {
                this.y = p.y - this.h;
                this.vy = 0;
                grounded = true;
            }
        }

        if (grounded && this.hurtTimer === 0) {
            // Patrol
            this.vx = this.speed * this.dir;
            this.x += this.vx;

            // Edge detection — turn before walking off platform
            let fallAhead = true;
            const checkX = this.dir === 1 ? this.x + this.w + 4 : this.x - 4;
            const footY = this.y + this.h;
            for (const p of level.platforms) {
                if (checkX >= p.x && checkX <= p.x + p.w &&
                    footY >= p.y - 2 && footY <= p.y + 12) {
                    fallAhead = false;
                    break;
                }
            }
            if (fallAhead) this.dir *= -1;

            // Attack if close to player
            const dx = player.x - this.x;
            if (Math.abs(dx) < 80 && Math.abs(player.y - this.y) < 40 && !player.dead) {
                this.state = 'attack';
                this.dir = dx > 0 ? 1 : -1;
                this.speed = 2.0;
            } else {
                if (this.state !== 'hurt') this.state = 'walk';
                this.speed = 1.2 + Math.random() * 0.3;
            }
        }

        // Collision with player — stomp from above, else damage player
        if (aabb(this, player) && !player.dead && this.hurtTimer === 0) {
            if (isStomp(player, this)) {
                // Stomp kills small enemies in one hit and bounces the player
                doStomp(player, this, 99, 50);
            } else if (player.invincibility <= 0) {
                player.takeDamage(1);
            }
        }

        // Animation
        this.animTimer++;
        if (this.animTimer >= 8) {
            this.animTimer = 0;
            this.frame = (this.frame + 1) % 2;
        }
    }

    takeDamage(dmg, fromDir) {
        if (this.dead) return;
        this.hp -= dmg;
        this.hurtTimer = 15;
        this.vx = (fromDir || 1) * 6;
        this.vy = -3;
        SFX.hit();
        Particles.emit(this.x + this.w / 2, this.y + this.h / 2, 8, '#f44', 'explode');
        if (this.hp <= 0) {
            this.dead = true;
            this.hp = 0;
            Particles.emit(this.x + this.w / 2, this.y + this.h / 2, 15, '#fa0', 'explode');
            // Chance to drop a healing heart
            this._dropHeart = Math.random() < 0.35;
        }
    }

    draw(context) {
        if (this.dead) {
            if (this.deathTimer < 30) {
                context.globalAlpha = 1 - this.deathTimer / 30;
                context.save();
                context.translate(this.x + this.w / 2, this.y + this.h / 2 + this.deathTimer * 0.5);
                context.rotate(this.deathTimer * 0.05);
                const img = Assets.get('enemy_hurt');
                if (img) safeDrawImage(context, img, -24, -24, 48, 48);
                context.restore();
                context.globalAlpha = 1;
            }
            return;
        }

        context.save();
        context.translate(this.x + this.w / 2, this.y + this.h / 2);
        if (this.dir === -1) context.scale(-1, 1);

        let img;
        if (this.state === 'hurt') img = Assets.get('enemy_hurt');
        else if (this.state === 'attack') img = Assets.get('enemy_atk');
        else img = Assets.get(this.frame === 0 ? 'enemy_walk1' : 'enemy_walk2');

        const s = 44;
        if (img) safeDrawImage(context, img, -s / 2, -s / 2, s, s);
        else { context.fillStyle = '#f80'; context.fillRect(-14, -14, 28, 28); }

        context.restore();
    }
}

// ================================================================
//  BOSS (魚怪大盜)
// ================================================================
class Boss {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.w = 80; this.h = 90;
        this.vx = 0; this.vy = 0;
        this.dir = -1;
        this.maxHp = 25;
        this.hp = 25;
        this.dead = false;
        this.state = 'idle';
        this.phase = 1;
        this.timer = 0;
        this.attackCooldown = 0;
        this.frame = 0;
        this.animTimer = 0;
        this.hurtFlash = 0;
        this.deathTimer = 0;
        this.introTimer = 120; // Boss intro animation
        this.shownPortrait = false;
    }

    update(level, player) {
        if (this.introTimer > 0) {
            this.introTimer--;
            return;
        }

        if (this.dead) {
            this.deathTimer++;
            if (this.deathTimer % 8 === 0) {
                Particles.emit(
                    this.x + Math.random() * this.w,
                    this.y + Math.random() * this.h,
                    5, '#a0f', 'explode'
                );
                Camera.shake(3, 4);
            }
            return;
        }

        this.timer++;
        if (this.hurtFlash > 0) this.hurtFlash--;
        if (this.attackCooldown > 0) this.attackCooldown--;

        // Phase transitions
        if (this.hp <= this.maxHp * 0.6 && this.phase === 1) {
            this.phase = 2;
            SFX.bossRoar();
            Camera.shake(8, 20);
        }
        if (this.hp <= this.maxHp * 0.3 && this.phase === 2) {
            this.phase = 3;
            SFX.bossRoar();
            Camera.shake(10, 30);
        }

        // AI
        const dx = player.x - this.x;
        const dist = Math.abs(dx);
        this.dir = dx < 0 ? -1 : 1;

        if (this.state === 'idle') {
            // Move toward player
            const spd = 1 + this.phase * 0.5;
            if (dist > 100) {
                this.x += (dx > 0 ? spd : -spd);
            }
            if (this.timer > (90 - this.phase * 20)) {
                this.state = 'attack';
                this.timer = 0;
            }
        } else if (this.state === 'attack') {
            // Charge at player
            const chargeSpeed = 3 + this.phase;
            this.x += this.dir * chargeSpeed;

            if (this.timer > 40) {
                this.state = 'idle';
                this.timer = 0;
            }

            // Shoot projectiles
            if (this.phase >= 2 && this.attackCooldown === 0 && this.timer === 15) {
                this.attackCooldown = 30;
                SFX.shoot();
                level.projectiles.push(new Projectile(this.x + this.w / 2, this.y + this.h / 2, -1, false));
                if (this.phase >= 3) {
                    level.projectiles.push(new Projectile(this.x + this.w / 2, this.y + this.h / 2, 1, false));
                    level.projectiles.push(new Projectile(this.x + this.w / 2, this.y + this.h / 3, -1, false));
                }
            }
        }

        // Boundary
        if (this.x < 0) this.x = 0;
        if (this.x > level.w - this.w) this.x = level.w - this.w;

        // Stomp boss from above (small damage + bounce), else contact damage
        if (aabb(this, player) && !player.dead && this.introTimer === 0) {
            if (isStomp(player, this)) {
                doStomp(player, this, 1, 20);
            } else if (player.invincibility <= 0) {
                player.takeDamage(1);
            }
        }

        // Animation
        this.animTimer++;
        if (this.animTimer >= 10) {
            this.animTimer = 0;
            this.frame = (this.frame + 1) % 4;
        }
    }

    takeDamage(dmg, fromDir) {
        if (this.dead || this.introTimer > 0) return;
        this.hp -= dmg;
        this.hurtFlash = 10;
        Camera.shake(4, 6);
        SFX.hit();
        Particles.emit(this.x + this.w / 2, this.y + this.h / 2, 6, '#f4f', 'explode');

        if (this.hp <= 0) {
            this.dead = true;
            this.hp = 0;
            SFX.bossRoar();
            Camera.shake(12, 40);
            for (let i = 0; i < 40; i++) {
                setTimeout(() => {
                    Particles.emit(
                        this.x + Math.random() * this.w,
                        this.y + Math.random() * this.h,
                        3, ['#f44', '#fa0', '#a0f', '#0ff'][Math.floor(Math.random() * 4)], 'explode'
                    );
                }, i * 50);
            }
        }
    }

    draw(context) {
        if (this.dead && this.deathTimer > 120) return;

        // Boss intro: portrait flash
        if (this.introTimer > 0) {
            // Draw boss portrait centered
            const alpha = Math.min(1, (120 - this.introTimer) / 30);
            context.save();
            context.globalAlpha = alpha;
            const portrait = Assets.get('boss_portrait');
            if (portrait && portrait.width) {
                const pw = 200, ph = 270;
                // Draw in screen space (before camera transform)
                context.translate(Camera.x, 0);
                safeDrawImage(context, portrait, W / 2 - pw / 2, H / 2 - ph / 2 - 30, pw, ph);
                // Boss name
                context.fillStyle = '#f44';
                context.font = 'bold 28px "Noto Sans TC", sans-serif';
                context.textAlign = 'center';
                context.shadowColor = '#000';
                context.shadowBlur = 6;
                context.fillText('BOSS - 魚怪大盜', W / 2 + Camera.x, H / 2 + ph / 2 - 10);
                context.shadowBlur = 0;
                context.textAlign = 'left';
            }
            context.restore();
            return;
        }

        context.save();
        context.translate(this.x + this.w / 2, this.y + this.h / 2);
        if (this.dir === 1) context.scale(-1, 1);

        // Hurt flash
        if (this.hurtFlash > 0 && this.hurtFlash % 2 === 0) {
            context.globalAlpha = 0.5;
        }
        // Death fade
        if (this.dead) {
            context.globalAlpha = Math.max(0, 1 - this.deathTimer / 120);
            context.rotate(this.deathTimer * 0.02);
        }

        // Select frame
        let img;
        if (this.state === 'attack') {
            img = Assets.get('boss_atk' + ((this.frame % 4) + 1));
        } else {
            img = Assets.get('boss_idle' + ((this.frame % 4) + 1));
        }

        const dw = 140, dh = 130;
        if (img && img.width) {
            safeDrawImage(context, img, -dw / 2, -dh / 2, dw, dh);
        } else {
            context.fillStyle = '#608';
            context.fillRect(-40, -45, 80, 90);
        }

        context.restore();

        // Phase indicator glow
        if (!this.dead && this.phase >= 2) {
            context.save();
            context.globalAlpha = 0.15 + Math.sin(Date.now() / 200) * 0.1;
            context.fillStyle = this.phase >= 3 ? '#f00' : '#f80';
            context.beginPath();
            context.arc(this.x + this.w / 2, this.y + this.h / 2, 70, 0, Math.PI * 2);
            context.fill();
            context.restore();
        }
    }
}

// ================================================================
//  PROJECTILE  (x,y = center of hitbox)
// ================================================================
class Projectile {
    constructor(x, y, dir, isPlayer, opts = {}) {
        this.x = x;
        this.y = y;
        this.isPlayer = isPlayer;
        this.damage = opts.damage != null ? opts.damage : (isPlayer ? 2 : 1);
        this.pierce = opts.pierce != null ? opts.pierce : (isPlayer ? 1 : 0);
        this.scale = opts.scale != null ? opts.scale : 1;
        this.w = (isPlayer ? 28 : 22) * this.scale;
        this.h = (isPlayer ? 16 : 14) * this.scale;
        const spd = opts.speed != null ? opts.speed : (isPlayer ? 11 : 5);
        this.vx = opts.vxOverride != null ? opts.vxOverride : dir * spd;
        this.vy = opts.vy != null ? opts.vy : 0;
        this.dead = false;
        this.life = 0;
        this.hitIds = new Set(); // avoid multi-hit same target while piercing
    }

    /** Axis-aligned box from center position */
    hitbox() {
        // Slightly larger box when moving vertically so vertical shots still hit
        const pad = Math.abs(this.vy) > Math.abs(this.vx) ? 4 : 0;
        return {
            x: this.x - this.w / 2 - pad / 2,
            y: this.y - this.h / 2 - pad / 2,
            w: this.w + pad,
            h: this.h + pad
        };
    }

    update(level) {
        this.x += this.vx;
        this.y += this.vy;
        this.life++;

        // Out of bounds (horizontal + vertical)
        if (
            this.x < Camera.x - 100 || this.x > Camera.x + W + 100 ||
            this.y < -80 || this.y > H + 120 ||
            this.life > 240
        ) {
            this.dead = true;
            return;
        }

        const box = this.hitbox();
        const knock = this.vx !== 0 ? (this.vx > 0 ? 1 : -1) : (Game.player ? Game.player.dir : 1);

        if (this.isPlayer) {
            for (const e of level.enemies) {
                if (e.dead || this.hitIds.has(e)) continue;
                if (aabb(box, e)) {
                    e.takeDamage(this.damage, knock);
                    if (Game.player) {
                        Game.player.score += 15;
                        Game.player.addUlt(5);
                    }
                    this.hitIds.add(e);
                    Particles.emit(this.x, this.y, 6, '#4af', 'explode');
                    if (this.pierce <= 0) {
                        this.dead = true;
                        return;
                    }
                    this.pierce--;
                }
            }
            if (level.boss && !level.boss.dead && !this.hitIds.has(level.boss) && aabb(box, level.boss)) {
                level.boss.takeDamage(this.damage, knock);
                if (Game.player) {
                    Game.player.score += 15;
                    Game.player.addUlt(6);
                }
                this.hitIds.add(level.boss);
                Particles.emit(this.x, this.y, 8, '#a0f', 'explode');
                if (this.pierce <= 0) {
                    this.dead = true;
                    return;
                }
                this.pierce--;
            }
        } else {
            if (aabb(box, Game.player) && !Game.player.dead) {
                Game.player.takeDamage(this.damage);
                this.dead = true;
            }
        }
    }

    draw(context) {
        const img = this.isPlayer ? Assets.get('bullet_blue') : Assets.get('bullet_purple');
        const dw = 32 * this.scale;
        const dh = 20 * this.scale;
        // Rotate sprite to match velocity (supports up/down/diagonal)
        const angle = Math.atan2(this.vy, this.vx);

        context.save();
        context.translate(this.x, this.y);
        context.rotate(angle);

        // Always draw a bright core so skill is never "invisible"
        context.globalAlpha = 0.45;
        context.fillStyle = this.isPlayer ? '#66eeff' : '#dd88ff';
        context.beginPath();
        context.ellipse(0, 0, dw * 0.55, dh * 0.45, 0, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;

        if (img && img.width) {
            safeDrawImage(context, img, -dw / 2, -dh / 2, dw, dh);
        } else {
            context.fillStyle = this.isPlayer ? '#4af' : '#c4f';
            context.beginPath();
            context.ellipse(0, 0, dw / 2, dh / 2, 0, 0, Math.PI * 2);
            context.fill();
            context.fillStyle = '#fff';
            context.beginPath();
            context.ellipse(-2, 0, dw / 5, dh / 4, 0, 0, Math.PI * 2);
            context.fill();
        }
        context.restore();

        // Trail along path
        if (Math.random() < 0.45) {
            Particles.emit(this.x - this.vx * 0.3, this.y - this.vy * 0.3, 1, this.isPlayer ? '#4af' : '#c4f', 'sparkle');
        }
    }
}

// ================================================================
//  FISH (Collectible)
// ================================================================
class FishItem {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.w = 24; this.h = 16;
        this.startY = y;
        this.time = Math.random() * Math.PI * 2;
        this.dead = false;
        this.frame = 0;
        this.animTimer = 0;
    }

    update(player) {
        if (this.dead) return;
        this.time += 0.06;
        this.y = this.startY + Math.sin(this.time) * 8;

        // Animation
        this.animTimer++;
        if (this.animTimer >= 10) {
            this.animTimer = 0;
            this.frame = (this.frame + 1) % 4;
        }

        // Collect
        if (aabb(this, player) && !player.dead) {
            this.dead = true;
            player.fish++;
            player.score += 100;
            if (player.addUlt) player.addUlt(10);
            SFX.collect();
            Particles.emit(this.x + this.w / 2, this.y + this.h / 2, 8, '#ffe066', 'sparkle');
            Particles.emit(this.x + this.w / 2, this.y + this.h / 2, 4, '#4af', 'sparkle');
        }
    }

    draw(context) {
        if (this.dead) return;

        // Glow
        context.save();
        context.globalAlpha = 0.2 + Math.sin(this.time * 2) * 0.1;
        context.fillStyle = '#4af';
        context.beginPath();
        context.arc(this.x + this.w / 2, this.y + this.h / 2, 16, 0, Math.PI * 2);
        context.fill();
        context.restore();

        const img = Assets.get('fish_r' + ((this.frame % 4) + 1));
        if (img && img.width) {
            safeDrawImage(context, img, this.x - 6, this.y - 8, 36, 24);
        } else {
            context.fillStyle = '#4af';
            context.fillRect(this.x, this.y, 24, 14);
        }
    }
}

// ================================================================
//  HEART (Heal pickup)
// ================================================================
class HeartItem {
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} [heal=1] HP restored (1 = small, 2 = big)
     * @param {boolean} [float=true] bob in place vs drop with gravity
     */
    constructor(x, y, heal = 1, float = true) {
        this.x = x; this.y = y;
        this.w = heal >= 2 ? 22 : 18;
        this.h = heal >= 2 ? 20 : 16;
        this.heal = heal;
        this.float = float;
        this.startY = y;
        this.time = Math.random() * Math.PI * 2;
        this.dead = false;
        this.vy = float ? 0 : -4;
        this.life = 0; // despawn timer for dropped hearts
        this.maxLife = float ? 0 : 600; // ~10s if dropped
    }

    update(player, level) {
        if (this.dead) return;
        this.time += 0.08;
        this.life++;

        if (this.float) {
            this.y = this.startY + Math.sin(this.time) * 6;
        } else {
            // Dropped heart: fall onto ground/platforms
            this.vy += GRAVITY * 0.7;
            if (this.vy > 8) this.vy = 8;
            this.y += this.vy;
            for (const p of level.platforms) {
                if (!aabb(this, p)) continue;
                if (p.oneWay && this.vy < 0) continue;
                if (this.vy >= 0 && this.y + this.h > p.y && this.y < p.y) {
                    this.y = p.y - this.h;
                    this.vy = 0;
                }
            }
            // Blink when about to despawn
            if (this.maxLife && this.life > this.maxLife) {
                this.dead = true;
                return;
            }
        }

        if (aabb(this, player) && !player.dead) {
            if (player.hp >= player.maxHp) {
                // Full HP: still collect for score, small reward
                this.dead = true;
                player.score += 25;
                SFX.collect();
                Particles.emit(this.x + this.w / 2, this.y + this.h / 2, 6, '#faa', 'sparkle');
                return;
            }
            this.dead = true;
            const before = player.hp;
            player.hp = Math.min(player.maxHp, player.hp + this.heal);
            const gained = player.hp - before;
            player.score += 30 * gained;
            SFX.heal();
            Particles.emit(this.x + this.w / 2, this.y + this.h / 2, 12, '#f44', 'sparkle');
            Particles.emit(this.x + this.w / 2, this.y + this.h / 2, 6, '#fff', 'sparkle');
        }
    }

    draw(context) {
        if (this.dead) return;
        // Despawn blink
        if (!this.float && this.maxLife && this.life > this.maxLife - 120) {
            if (Math.floor(this.life / 6) % 2 === 0) return;
        }

        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        const s = this.heal >= 2 ? 1.25 : 1;

        // Soft glow
        context.save();
        context.globalAlpha = 0.25 + Math.sin(this.time * 2) * 0.1;
        context.fillStyle = '#ff4466';
        context.beginPath();
        context.arc(cx, cy, 14 * s, 0, Math.PI * 2);
        context.fill();
        context.restore();

        // Pixel heart
        context.save();
        context.translate(cx, cy);
        context.scale(s, s);
        context.fillStyle = '#ff3355';
        // Classic pixel heart via two circles + triangle-ish rects
        context.beginPath();
        context.moveTo(0, 6);
        context.bezierCurveTo(0, 2, -9, 2, -9, 6);
        context.bezierCurveTo(-9, 11, 0, 16, 0, 18);
        context.bezierCurveTo(0, 16, 9, 11, 9, 6);
        context.bezierCurveTo(9, 2, 0, 2, 0, 6);
        context.fill();
        // Highlight
        context.fillStyle = '#ff99aa';
        context.beginPath();
        context.arc(-3.5, 4, 2.2, 0, Math.PI * 2);
        context.fill();
        // Cross mark for "heal" on big hearts
        if (this.heal >= 2) {
            context.fillStyle = '#fff';
            context.fillRect(-1.5, -1, 3, 8);
            context.fillRect(-4, 1.5, 8, 3);
        }
        context.restore();
    }
}

// ================================================================
//  AUTO PLAY — 自動掛機模式
//  自動走關、打怪、撿物、放技能／大絕，通關或死亡後循環再開
// ================================================================
const AutoPlay = {
    enabled: false,
    lastX: 0,
    stuckFrames: 0,
    jumpCooldown: 0,
    actionCooldown: 0,
    retreatFrames: 0,
    statusText: '',
    statusTimer: 0,
    loopCount: 0,
    thinkTick: 0,

    setEnabled(on, announce = true) {
        this.enabled = !!on;
        this.stuckFrames = 0;
        this.jumpCooldown = 0;
        this.actionCooldown = 0;
        this.retreatFrames = 0;
        this.lastX = 0;
        if (!this.enabled) Input.clearAuto();
        if (typeof TouchUI !== 'undefined') TouchUI.syncAutoButton();
        if (announce) {
            this.statusText = this.enabled ? '自動掛機 ON' : '自動掛機 OFF';
            this.statusTimer = 100;
            SFX.init();
            if (this.enabled) SFX.levelUp();
            else SFX.collect();
        }
    },

    toggle() {
        this.setEnabled(!this.enabled, true);
        if (typeof TouchUI !== 'undefined') TouchUI.syncAutoButton();
    },

    /**
     * 每幀在 player.update 前呼叫：寫入 Input._auto
     */
    think(player, level, state) {
        Input.clearAuto();
        if (this.statusTimer > 0) this.statusTimer--;
        if (!this.enabled || !player || player.dead || !level) return;

        this.thinkTick++;
        if (this.jumpCooldown > 0) this.jumpCooldown--;
        if (this.actionCooldown > 0) this.actionCooldown--;
        if (this.retreatFrames > 0) this.retreatFrames--;

        const px = player.x + player.w / 2;
        const py = player.y + player.h / 2;
        const feet = player.y + player.h;

        // 卡住偵測（地面幾乎不動）
        if (Math.abs(player.x - this.lastX) < 0.6 && player.grounded) {
            this.stuckFrames++;
        } else {
            this.stuckFrames = Math.max(0, this.stuckFrames - 2);
        }
        this.lastX = player.x;

        // ── 目標搜尋 ──
        let bestEnemy = null;
        let bestEnemyDist = Infinity;
        for (const e of level.enemies) {
            if (e.dead) continue;
            const ex = e.x + e.w / 2;
            const ey = e.y + e.h / 2;
            const d = Math.hypot(ex - px, ey - py);
            // 略偏好前方敵人（推進關卡）
            const bias = ex >= px - 40 ? 0 : 40;
            if (d + bias < bestEnemyDist && d < 420) {
                bestEnemyDist = d;
                bestEnemy = e;
            }
        }

        const boss = (level.boss && !level.boss.dead) ? level.boss : null;
        if (boss) {
            const d = Math.hypot(boss.x + boss.w / 2 - px, boss.y + boss.h / 2 - py);
            // Boss 優先度高
            if (d < bestEnemyDist + 80) {
                bestEnemy = boss;
                bestEnemyDist = d;
            }
        }

        // 低血優先撿愛心
        let heart = null;
        let heartDist = Infinity;
        if (player.hp < player.maxHp) {
            for (const h of (level.hearts || [])) {
                if (h.dead) continue;
                const d = Math.hypot(h.x + h.w / 2 - px, h.y + h.h / 2 - py);
                if (d < heartDist && d < 520) {
                    heartDist = d;
                    heart = h;
                }
            }
        }

        // 附近魚（無戰時）
        let fish = null;
        let fishDist = Infinity;
        if (!bestEnemy || bestEnemyDist > 160) {
            for (const f of level.fish) {
                if (f.dead) continue;
                const d = Math.hypot(f.x + f.w / 2 - px, f.y + f.h / 2 - py);
                if (d < fishDist && d < 280) {
                    fishDist = d;
                    fish = f;
                }
            }
        }

        // 決定移動目標
        let targetX = state === 'BOSS' ? (boss ? boss.x + boss.w / 2 : level.w * 0.5) : level.w - 60;
        let targetY = player.y;

        const needHeal = player.hp <= 2 && heart;
        if (needHeal) {
            targetX = heart.x + heart.w / 2;
            targetY = heart.y;
        } else if (bestEnemy && bestEnemyDist < 380) {
            targetX = bestEnemy.x + bestEnemy.w / 2;
            targetY = bestEnemy.y + bestEnemy.h / 2;
            // 近戰保持一點距離，方便技能與踩踏
            if (bestEnemyDist < 36) {
                targetX = px + (targetX > px ? -1 : 1) * 20;
            }
            // Boss 衝撞時後退
            if (boss && bestEnemy === boss && boss.state === 'attack' && bestEnemyDist < 140) {
                this.retreatFrames = Math.max(this.retreatFrames, 18);
            }
        } else if (heart && player.hp < player.maxHp && heartDist < 220) {
            targetX = heart.x + heart.w / 2;
            targetY = heart.y;
        } else if (fish) {
            targetX = fish.x + fish.w / 2;
            targetY = fish.y;
        }

        // 水平移動
        let ax = 0;
        if (this.retreatFrames > 0) {
            const threatX = bestEnemy ? bestEnemy.x + bestEnemy.w / 2 : px + player.dir * 10;
            ax = threatX > px ? -1 : 1;
        } else if (targetX > px + 10) {
            ax = 1;
        } else if (targetX < px - 10) {
            ax = -1;
        }

        // 無戰無物 → 向關卡終點推進
        if (!needHeal && !bestEnemy && !fish && state !== 'BOSS') {
            ax = 1;
        }

        Input._auto.run = true;
        Input._auto.axisX = ax;

        // 瞄準（技能／近戰）
        if (bestEnemy) {
            const edx = (bestEnemy.x + bestEnemy.w / 2) - px;
            const edy = (bestEnemy.y + bestEnemy.h / 2) - py;
            if (Math.abs(edx) > 8) Input._auto.axisX = edx > 0 ? 1 : -1;
            if (Math.abs(edy) > 36 && Math.abs(edx) < 260) {
                Input._auto.axisY = edy > 0 ? 1 : -1;
            }
        } else if (heart && needHeal) {
            const hdy = (heart.y + heart.h / 2) - py;
            if (Math.abs(hdy) > 30) Input._auto.axisY = hdy > 0 ? 1 : -1;
        }

        // ── 戰鬥 ──
        // 近戰
        if (bestEnemy && bestEnemyDist < 58 && this.actionCooldown <= 0 && player.attackTimer === 0) {
            Input._auto.attack = true;
            this.actionCooldown = 12;
        }

        // 技能（中距離）
        if (bestEnemy && bestEnemyDist < 240 && bestEnemyDist > 40 &&
            player.specialCooldown <= 0 && this.actionCooldown <= 0) {
            Input._auto.special = true;
            this.actionCooldown = 10;
        }
        // Boss 或近距離也可丟技能
        if (bestEnemy && bestEnemyDist < 100 && player.specialCooldown <= 0 &&
            this.actionCooldown <= 0 && this.thinkTick % 20 === 0) {
            Input._auto.special = true;
            this.actionCooldown = 8;
        }

        // 大絕：Boss / 群怪 / 危急
        if (player.ultCharge >= player.ultMax && player.ultTimer <= 0) {
            let nearCount = 0;
            for (const e of level.enemies) {
                if (e.dead) continue;
                if (Math.hypot(e.x + e.w / 2 - px, e.y + e.h / 2 - py) < 200) nearCount++;
            }
            const wantUlt =
                (boss && bestEnemyDist < 220) ||
                nearCount >= 2 ||
                (bestEnemy && bestEnemyDist < 100) ||
                player.hp <= 2;
            if (wantUlt) Input._auto.ultimate = true;
        }

        // ── 跳躍 ──
        let shouldJump = false;

        // 卡住
        if (this.stuckFrames > 28) {
            shouldJump = true;
            this.stuckFrames = 0;
            if (Math.random() < 0.45) this.retreatFrames = 14;
        }

        // 目標在上方
        if (targetY < player.y - 36 && player.grounded) {
            shouldJump = true;
        }

        // 踩踏小怪
        if (bestEnemy && bestEnemy !== boss && player.grounded &&
            Math.abs((bestEnemy.x + bestEnemy.w / 2) - px) < 55 &&
            bestEnemy.y + 8 >= player.y) {
            shouldJump = true;
        }

        // 前方有較高平台可踩
        if (player.grounded && ax !== 0) {
            const lookX = ax > 0 ? player.x + player.w + 28 : player.x - 28;
            let padAbove = null;
            for (const p of level.platforms) {
                if (!p.oneWay) continue;
                if (lookX < p.x - 10 || lookX > p.x + p.w + 10) continue;
                if (p.y < feet - 20 && p.y > feet - 150) {
                    if (!padAbove || p.y > padAbove.y) padAbove = p; // 最近的上方平台
                }
            }
            // 若終點在前方且有可跳平台，偶爾跳上去撿資源
            if (padAbove && (fish || heart || bestEnemy) && targetY < feet - 20) {
                shouldJump = true;
            }
            // 前方極近有牆狀阻擋感（平台邊緣）時跳
            if (this.stuckFrames > 12) shouldJump = true;
        }

        // Boss 衝刺閃避
        if (boss && boss.state === 'attack' && bestEnemyDist < 200) {
            shouldJump = true;
        }

        // 敵方投射物粗略閃避（靠近且大致朝向玩家）
        for (const proj of level.projectiles) {
            if (proj.dead || proj.isPlayer) continue;
            const ddx = proj.x - px;
            const ddy = Math.abs(proj.y - py);
            const approaching = (proj.vx > 0 && ddx < 0) || (proj.vx < 0 && ddx > 0) || Math.abs(proj.vx) < 0.5;
            if (approaching && Math.abs(ddx) < 100 && ddy < 48) {
                shouldJump = true;
                break;
            }
        }

        if (shouldJump && this.jumpCooldown <= 0) {
            Input._auto.jump = true;
            Input._auto.jumpHeld = true;
            this.jumpCooldown = 16;
        } else if (!player.grounded && player.vy < 0) {
            // 滯空保持跳高
            Input._auto.jumpHeld = true;
        } else if (!player.grounded && bestEnemy && bestEnemy.y < player.y) {
            Input._auto.jumpHeld = true;
        }
    },

    drawOverlay(ctx, W, H) {
        if (!this.enabled && this.statusTimer <= 0) return;

        // 右上角掛機徽章
        if (this.enabled) {
            const pulse = 0.75 + Math.sin(Date.now() / 200) * 0.25;
            const bx = W - 150;
            const by = 56;
            ctx.fillStyle = `rgba(20, 40, 20, ${0.75 * pulse})`;
            ctx.fillRect(bx, by, 132, 28);
            ctx.strokeStyle = '#6f6';
            ctx.lineWidth = 2;
            ctx.strokeRect(bx, by, 132, 28);
            ctx.fillStyle = '#8f8';
            ctx.font = 'bold 12px "Noto Sans TC", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('🐱 自動掛機中', bx + 66, by + 19);
            if (this.loopCount > 0) {
                ctx.font = '9px "Press Start 2P", monospace';
                ctx.fillStyle = '#aae';
                ctx.fillText(`LOOP ${this.loopCount}`, bx + 66, by + 42);
            }
            ctx.textAlign = 'left';
        }

        // 狀態提示（開關瞬間）
        if (this.statusTimer > 0 && this.statusText) {
            const a = Math.min(1, this.statusTimer / 20);
            ctx.save();
            ctx.globalAlpha = a;
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(W / 2 - 120, 70, 240, 36);
            ctx.fillStyle = this.enabled || this.statusText.indexOf('ON') >= 0 ? '#8f8' : '#faa';
            ctx.font = 'bold 18px "Noto Sans TC", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(this.statusText, W / 2, 94);
            ctx.restore();
            ctx.textAlign = 'left';
        }
    }
};

// 在 AutoPlay 宣告完成後再 init，避免 const TDZ 造成 ReferenceError
TouchUI.init();
Layout.init();

// ================================================================
//  CAMPAIGN / LEVEL DATA (Avalonia 編輯器匯出的 data/*.json)
//  有資料時優先使用；載入失敗則回退程序化 generateLevel
// ================================================================
const CampaignData = {
    loaded: false,
    campaign: null,
    levels: Object.create(null),
    scenes: Object.create(null),

    /** @returns {Promise<void>} */
    async load() {
        try {
            const campRes = await fetch('data/campaign.json', { cache: 'no-store' });
            if (!campRes.ok) throw new Error('campaign.json ' + campRes.status);
            this.campaign = await campRes.json();

            const stages = (this.campaign && this.campaign.stages) || [];
            for (let i = 0; i < stages.length; i++) {
                const id = stages[i].levelId;
                if (!id || this.levels[id]) continue;
                try {
                    const lr = await fetch('data/levels/' + id + '.json', { cache: 'no-store' });
                    if (lr.ok) this.levels[id] = await lr.json();
                } catch (e) { /* skip missing level */ }
            }

            // 保險：常見檔名
            const fallbackIds = ['level1', 'level2', 'boss'];
            for (let i = 0; i < fallbackIds.length; i++) {
                const id = fallbackIds[i];
                if (this.levels[id]) continue;
                try {
                    const lr = await fetch('data/levels/' + id + '.json', { cache: 'no-store' });
                    if (lr.ok) this.levels[id] = await lr.json();
                } catch (e) { /* ignore */ }
            }

            const prologueId = (this.campaign && this.campaign.prologue) || 'prologue';
            try {
                const sr = await fetch('data/scenes/' + prologueId + '.json', { cache: 'no-store' });
                if (sr.ok) this.scenes[prologueId] = await sr.json();
            } catch (e) { /* ignore */ }

            this.loaded = true;
            console.log('[CampaignData] loaded', Object.keys(this.levels).length, 'levels');
        } catch (err) {
            console.warn('[CampaignData] load failed, using procedural levels', err);
            this.loaded = false;
            this.campaign = null;
        }
    },

    getLevelByState(stateName) {
        if (!this.campaign || !this.campaign.stages) return null;
        for (let i = 0; i < this.campaign.stages.length; i++) {
            const s = this.campaign.stages[i];
            if (s.state === stateName) return this.levels[s.levelId] || null;
        }
        return null;
    },

    getPrologueTexts() {
        const id = (this.campaign && this.campaign.prologue) || 'prologue';
        const scene = this.scenes[id];
        if (scene && scene.texts && scene.texts.length) return scene.texts.slice();
        return null;
    }
};

/**
 * 由編輯器 JSON 建立可遊玩關卡物件
 * @param {object} data LevelDto
 */
function buildLevelFromData(data) {
    if (!data) return null;
    const gy = data.groundY != null ? data.groundY : 490;
    const level = {
        platforms: [],
        enemies: [],
        projectiles: [],
        fish: [],
        hearts: [],
        w: data.width || 2800,
        boss: null,
        bg: data.bg || 'forest',
        groundY: gy,
        playerSpawn: data.playerSpawn
            ? { x: data.playerSpawn.x, y: data.playerSpawn.y }
            : { x: 80, y: 400 },
        fromEditor: true
    };

    const plats = data.platforms || [];
    for (let i = 0; i < plats.length; i++) {
        const p = plats[i];
        level.platforms.push({
            x: p.x, y: p.y, w: p.w, h: p.h,
            oneWay: !!p.oneWay
        });
    }

    // 若編輯資料沒有地面，補一條
    if (!level.platforms.some(function (p) { return !p.oneWay; })) {
        level.platforms.unshift({ x: 0, y: gy, w: level.w, h: 80, oneWay: false });
    }

    const enemies = data.enemies || [];
    for (let i = 0; i < enemies.length; i++) {
        level.enemies.push(new Enemy(enemies[i].x, enemies[i].y));
    }

    const fish = data.fish || [];
    for (let i = 0; i < fish.length; i++) {
        level.fish.push(new FishItem(fish[i].x, fish[i].y));
    }

    const hearts = data.hearts || [];
    for (let i = 0; i < hearts.length; i++) {
        const h = hearts[i];
        level.hearts.push(new HeartItem(h.x, h.y, h.heal != null ? h.heal : 1, true));
    }

    if (data.boss) {
        level.boss = new Boss(data.boss.x, data.boss.y);
    } else if (data.type === 'boss') {
        level.boss = new Boss(level.w - 250, gy - 100);
    }

    return level;
}

/**
 * 依狀態取得關卡：優先 JSON，否則程序化
 * @param {string} stateName LEVEL1 | LEVEL2 | BOSS
 * @param {{width:number,type:string,bg:string,groundY:number}} fallbackConfig
 */
function loadLevelForState(stateName, fallbackConfig) {
    const data = CampaignData.getLevelByState(stateName);
    if (data) {
        const built = buildLevelFromData(data);
        if (built) return built;
    }
    // 依 levelId 直接嘗試
    const map = { LEVEL1: 'level1', LEVEL2: 'level2', BOSS: 'boss' };
    const id = map[stateName];
    if (id && CampaignData.levels[id]) {
        const built = buildLevelFromData(CampaignData.levels[id]);
        if (built) return built;
    }
    return generateLevel(fallbackConfig);
}

function createCampaignLevel(stageIndex) {
    const world = Math.floor(stageIndex / 4) + 1;
    const chapterLevel = (stageIndex % 4) + 1;
    const isBoss = chapterLevel === 4;
    const level = generateLevel({
        width: isBoss ? 1200 : 2400 + world * 160 + chapterLevel * 90,
        type: isBoss ? 'boss' : 'normal',
        bg: 'world' + world,
        groundY: 490
    });
    level.chapter = world;
    level.chapterLevel = chapterLevel;
    level.isFinalBoss = world === 8 && isBoss;
    return level;
}

// ================================================================
//  LEVEL GENERATOR
// ================================================================
function generateLevel(config) {
    const level = {
        platforms: [],
        enemies: [],
        projectiles: [],
        fish: [],
        hearts: [],
        w: config.width,
        boss: null,
        bg: config.bg,
        groundY: config.groundY || 490
    };

    const gy = level.groundY;

    // Solid ground (not one-way)
    level.platforms.push({ x: 0, y: gy, w: level.w, h: 80, oneWay: false });

    // Helper: floating one-way platform at reachable height
    // jump can clear ~140px; keep steps within ~90px of the surface below
    const addPad = (x, heightAboveGround, w = 120) => {
        const y = gy - heightAboveGround;
        level.platforms.push({ x, y, w, h: 16, oneWay: true });
        return { x, y, w };
    };

    if (config.type === 'boss') {
        addPad(180, 100, 160);
        addPad(620, 120, 160);
        addPad(400, 180, 130);
        // Healing hearts in boss arena
        level.hearts.push(new HeartItem(220, gy - 140, 1, true));
        level.hearts.push(new HeartItem(680, gy - 160, 1, true));
        level.hearts.push(new HeartItem(430, gy - 220, 2, true)); // big heart
        level.boss = new Boss(level.w - 250, gy - 100);
        return level;
    }

    // Intro stepping stones near start (guaranteed reachable)
    addPad(220, 70, 110);
    addPad(360, 110, 100);
    level.fish.push(new FishItem(380, gy - 150));
    // First heal near start so players notice the item
    level.hearts.push(new HeartItem(260, gy - 110, 1, true));

    // Procedural segments — stair-like progression so the player can hop up
    const segmentW = 420;
    const segments = Math.floor(level.w / segmentW);

    for (let i = 1; i < segments; i++) {
        const baseX = i * segmentW + 40;

        // Low platform (easy hop from ground: 70–95px)
        const lowH = 70 + Math.floor(Math.random() * 30);
        const lowW = 100 + Math.floor(Math.random() * 80);
        const low = addPad(baseX, lowH, lowW);

        // Mid platform stepped from the low one (~70–90 above low)
        if (Math.random() > 0.25) {
            const midH = lowH + 65 + Math.floor(Math.random() * 25);
            const midX = baseX + 80 + Math.random() * 60;
            const mid = addPad(midX, Math.min(midH, 200), 90 + Math.random() * 50);
            if (Math.random() > 0.4) {
                level.fish.push(new FishItem(mid.x + mid.w / 2 - 12, mid.y - 36));
            }
            // Enemy on mid pad
            if (Math.random() > 0.45) {
                level.enemies.push(new Enemy(mid.x + mid.w / 2 - 14, mid.y - 30));
            }
        }

        // Enemy / fish on low pad
        if (Math.random() > 0.4) {
            level.enemies.push(new Enemy(low.x + low.w / 2 - 14, low.y - 30));
        }
        if (Math.random() > 0.45) {
            level.fish.push(new FishItem(low.x + low.w / 2 - 12, low.y - 36));
        }
        // Heal hearts on platforms (~35%)
        if (Math.random() > 0.65) {
            const big = Math.random() > 0.8;
            level.hearts.push(new HeartItem(
                low.x + 16 + Math.random() * Math.max(8, low.w - 40),
                low.y - 32,
                big ? 2 : 1,
                true
            ));
        }

        // Occasional ground-level enemy between segments
        if (Math.random() > 0.55) {
            level.enemies.push(new Enemy(baseX + lowW + 60, gy - 30));
        }
    }

    // Safe fish near start
    level.fish.push(new FishItem(150, gy - 60));
    // Extra hearts along the route
    level.hearts.push(new HeartItem(level.w * 0.35, gy - 70, 1, true));
    level.hearts.push(new HeartItem(level.w * 0.65, gy - 70, 2, true));

    return level;
}

// ================================================================
//  HUD DRAWING
// ================================================================
function drawHUD(player, level, levelNum) {
    // Dark top bar
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, W, 50);

    // Hearts
    for (let i = 0; i < player.maxHp; i++) {
        const hx = 20 + i * 28;
        const hy = 18;
        ctx.fillStyle = i < player.hp ? '#f33' : '#333';
        // Heart shape
        ctx.beginPath();
        ctx.moveTo(hx, hy + 4);
        ctx.bezierCurveTo(hx, hy, hx - 8, hy, hx - 8, hy + 4);
        ctx.bezierCurveTo(hx - 8, hy + 8, hx, hy + 14, hx, hy + 16);
        ctx.bezierCurveTo(hx, hy + 14, hx + 8, hy + 8, hx + 8, hy + 4);
        ctx.bezierCurveTo(hx + 8, hy, hx, hy, hx, hy + 4);
        ctx.fill();
        if (i < player.hp) {
            // Highlight
            ctx.fillStyle = '#f88';
            ctx.beginPath();
            ctx.arc(hx - 2, hy + 5, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Fish counter
    const fishImg = Assets.get('fish_r1');
    if (fishImg && fishImg.width) {
        safeDrawImage(ctx, fishImg, 175, 8, 30, 20);
    } else {
        ctx.fillStyle = '#4af';
        ctx.fillRect(178, 12, 20, 12);
    }
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`x${player.fish}`, 210, 26);

    // Score
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffe066';
    ctx.fillText(`${player.score}`, W - 20, 22);
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillStyle = '#aaa';
    ctx.fillText('SCORE', W - 20, 38);
    ctx.textAlign = 'left';

    // Level indicator
    ctx.fillStyle = '#888';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    const chapter = Math.floor((levelNum - 1) / 4) + 1;
    const chapterLevel = ((levelNum - 1) % 4) + 1;
    const levelLabel = chapterLevel === 4
        ? `WORLD ${chapter}-${chapterLevel}  BOSS`
        : `WORLD ${chapter}-${chapterLevel}`;
    ctx.fillText(levelLabel, W / 2, 18);
    ctx.textAlign = 'left';

    // Special skill cooldown / ready indicator
    {
        const maxCd = 55;
        const pct = Math.max(0, Math.min(1, 1 - player.specialCooldown / maxCd));
        const bx = 18, by = 44, bw = 100, bh = 8;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
        ctx.fillStyle = '#222';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = pct >= 1 ? '#66eeff' : '#8844cc';
        ctx.fillRect(bx, by, bw * pct, bh);
        ctx.fillStyle = pct >= 1 ? '#aef' : '#888';
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(pct >= 1 ? 'SKILL (X)' : 'SKILL', bx + bw + 6, by + 8);
    }

    // Invincibility shield timer (seconds remaining)
    if (player.invincibility > 0) {
        const sec = (player.invincibility / 60).toFixed(1);
        const barW = 100;
        const barH = 8;
        const bx = 18;
        const by = 58;
        // Estimate max for fill: use hurt duration as reference cap
        const fill = Math.min(1, player.invincibility / I_FRAMES_HURT);
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
        ctx.fillStyle = '#0a2030';
        ctx.fillRect(bx, by, barW, barH);
        ctx.fillStyle = '#66eeff';
        ctx.fillRect(bx, by, barW * fill, barH);
        ctx.fillStyle = '#aef';
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`SHIELD ${sec}s`, bx + barW + 6, by + 8);
    }

    // Ultimate charge bar (bottom center)
    {
        const uw = 280, uh = 14;
        const ux = W / 2 - uw / 2;
        const uy = H - 28;
        const upct = Math.max(0, Math.min(1, player.ultCharge / player.ultMax));
        const ready = upct >= 1;

        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(ux - 3, uy - 3, uw + 6, uh + 6);
        ctx.fillStyle = '#1a1020';
        ctx.fillRect(ux, uy, uw, uh);

        // Gradient-like fill
        if (ready) {
            const pulse = 0.7 + Math.sin(Date.now() / 120) * 0.3;
            ctx.globalAlpha = pulse;
            ctx.fillStyle = '#ffcc00';
        } else {
            ctx.fillStyle = '#e65c00';
        }
        ctx.fillRect(ux, uy, uw * upct, uh);
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(ux, uy, uw * upct, uh / 2);

        ctx.strokeStyle = ready ? '#ffe066' : '#666';
        ctx.lineWidth = 1;
        ctx.strokeRect(ux, uy, uw, uh);

        ctx.font = 'bold 11px "Noto Sans TC", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = ready ? '#ffe066' : '#ccc';
        ctx.fillText(
            ready ? '大絕 READY — 按 V ！魚影・復仇風暴' : `大絕蓄力 ${Math.floor(upct * 100)}%  (V)`,
            W / 2, uy - 6
        );
        ctx.textAlign = 'left';
    }

    // Ultimate name splash
    if (player.ultNameFlash > 0) {
        const a = Math.min(1, player.ultNameFlash / 20);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000';
        ctx.font = 'bold 36px "Noto Sans TC", sans-serif';
        ctx.fillText('魚影・復仇風暴', W / 2 + 3, H / 2 - 37);
        ctx.fillStyle = '#ffe066';
        ctx.shadowColor = '#ff6600';
        ctx.shadowBlur = 20;
        ctx.fillText('魚影・復仇風暴', W / 2, H / 2 - 40);
        ctx.shadowBlur = 0;
        ctx.font = '14px "Press Start 2P", cursive';
        ctx.fillStyle = '#66eeff';
        ctx.fillText('ULTIMATE!', W / 2, H / 2 - 5);
        ctx.textAlign = 'left';
        // Screen flash
        if (player.ultNameFlash > 70) {
            ctx.globalAlpha = (player.ultNameFlash - 70) / 20 * 0.45;
            ctx.fillStyle = '#fff8e0';
            ctx.fillRect(0, 0, W, H);
        }
        ctx.restore();
    }

    // Boss HP bar
    if (level.boss && !level.boss.dead && level.boss.introTimer === 0) {
        const bw = 350, bh = 16;
        const bx = W / 2 - bw / 2;
        const by = H - 40;
        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
        // HP bar
        const hpPct = level.boss.hp / level.boss.maxHp;
        const barColor = level.boss.phase >= 3 ? '#f33' : level.boss.phase >= 2 ? '#f80' : '#4c4';
        ctx.fillStyle = '#222';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = barColor;
        ctx.fillRect(bx, by, bw * hpPct, bh);
        // Shine
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(bx, by, bw * hpPct, bh / 2);
        // Border
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, bw, bh);
        // Label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px "Noto Sans TC", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`魚怪大盜  HP: ${level.boss.hp} / ${level.boss.maxHp}`, W / 2, by + 12);
        ctx.textAlign = 'left';
    }
}

// ================================================================
//  PLATFORM DRAWING
// ================================================================
function drawPlatform(p, levelType) {
    // Main body
    if (levelType === 'forest') {
        ctx.fillStyle = '#3a2415';
        ctx.fillRect(p.x, p.y, p.w, p.h);
        // Grass top
        ctx.fillStyle = '#4a8c2a';
        ctx.fillRect(p.x, p.y, p.w, 6);
        ctx.fillStyle = '#5ca83a';
        ctx.fillRect(p.x, p.y, p.w, 3);
        // Grass tufts
        for (let gx = p.x; gx < p.x + p.w; gx += 12) {
            ctx.fillStyle = '#6cc04a';
            ctx.fillRect(gx, p.y - 2, 4, 4);
        }
    } else if (levelType === 'castle') {
        ctx.fillStyle = '#4a4a5a';
        ctx.fillRect(p.x, p.y, p.w, p.h);
        // Stone top
        ctx.fillStyle = '#666';
        ctx.fillRect(p.x, p.y, p.w, 4);
        // Brick lines
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;
        for (let bx = p.x; bx < p.x + p.w; bx += 20) {
            ctx.strokeRect(bx, p.y, 20, p.h);
        }
    } else {
        // Boss arena - deep sea
        ctx.fillStyle = '#1a2a4a';
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = '#2a3a5a';
        ctx.fillRect(p.x, p.y, p.w, 4);
    }
}

// ================================================================
//  BACKGROUND DRAWING
// ================================================================
function drawBackground(bgKey, scrollX) {
    const bg = Assets.get(bgKey);
    if (bg && bg.width) {
        const px = (scrollX * 0.3) % W;
        safeDrawImage(ctx, bg, -px, 0, W, H);
        safeDrawImage(ctx, bg, -px + W, 0, W, H);
    } else {
        // Fallback gradient
        const grd = ctx.createLinearGradient(0, 0, 0, H);
        grd.addColorStop(0, '#4488cc');
        grd.addColorStop(1, '#88ccee');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, W, H);
    }
}

function drawBossBackground() {
    // Deep ocean gradient
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#060d1f');
    grd.addColorStop(0.5, '#0a1533');
    grd.addColorStop(1, '#051020');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    // Underwater particles (bubbles)
    ctx.fillStyle = 'rgba(100, 200, 255, 0.15)';
    const time = Date.now() / 1000;
    for (let i = 0; i < 25; i++) {
        const bx = (i * 47 + Math.sin(time + i) * 20) % W;
        const by = H - ((time * 30 + i * 60) % (H + 20));
        const br = 2 + (i % 4);
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
    }

    // Seaweed
    ctx.fillStyle = 'rgba(0, 80, 40, 0.4)';
    for (let i = 0; i < 8; i++) {
        const sx = i * 130 + 20;
        const sway = Math.sin(time * 1.5 + i) * 8;
        ctx.beginPath();
        ctx.moveTo(sx, H);
        ctx.quadraticCurveTo(sx + sway, H - 60, sx + sway * 0.5, H - 100 - i * 5);
        ctx.quadraticCurveTo(sx + sway * 1.5, H - 60, sx + 8, H);
        ctx.fill();
    }
}

// ================================================================
//  TRANSITION OVERLAY
// ================================================================
const Transition = {
    active: false,
    alpha: 0,
    fadeIn: false,
    callback: null,
    speed: 0.06,

    start(cb) {
        if (this.active) return; // Prevent duplicate triggers
        this.active = true;
        this.fadeIn = true;
        this.alpha = 0;
        this.callback = cb;
    },

    update() {
        if (!this.active) return;
        if (this.fadeIn) {
            this.alpha += this.speed;
            if (this.alpha >= 1) {
                this.alpha = 1;
                this.fadeIn = false;
                if (this.callback) {
                    const cb = this.callback;
                    this.callback = null;
                    cb();
                }
            }
        } else {
            this.alpha -= this.speed;
            if (this.alpha <= 0) {
                this.alpha = 0;
                this.active = false;
            }
        }
    },

    draw(context) {
        if (!this.active && this.alpha <= 0) return;
        context.fillStyle = `rgba(0, 0, 0, ${Math.min(1, Math.max(0, this.alpha))})`;
        context.fillRect(0, 0, W, H);
    }
};

// ================================================================
//  MAIN GAME STATE MACHINE
// ================================================================
const Game = {
    state: 'LOADING',
    player: null,
    level: null,
    levelNum: 0,
    stageIndex: 0,

    // Title
    titleTimer: 0,

    // Prologue
    prologueStep: 0,
    prologueCharIdx: 0,
    prologueTexts: [
        '喵布布的魚被人偷了...',
        '喵布布很火大！！',
        '決定要復仇！',
        '於是開始了一連串復仇之旅...',
        '目標只有一個：奪回屬於喵布布的一切！'
    ],
    prologueWaitTimer: 0,

    // Victory / Game Over
    resultTimer: 0,

    // ── Init ──
    init() {
        const loadingBar = document.getElementById('loading-bar');
        const loadingText = document.getElementById('loading-text');
        const loadingScreen = document.getElementById('loading-screen');

        // 並行：素材 + 戰役/關卡 JSON（Avalonia 編輯器）
        const dataReady = CampaignData.load();

        Assets.load(
            progress => {
                const pct = Math.floor(progress * 100);
                if (loadingBar) loadingBar.style.width = pct + '%';
                if (loadingText) loadingText.textContent = `Loading Assets... ${pct}%`;
            },
            () => {
                dataReady.then(() => {
                    // 套用序章對白（若有編輯器資料）
                    const texts = CampaignData.getPrologueTexts();
                    if (texts && texts.length) this.prologueTexts = texts;

                    setTimeout(() => {
                        if (loadingScreen) loadingScreen.classList.remove('active');
                        this.changeState('TITLE');
                    }, 400);
                }).catch(() => {
                    setTimeout(() => {
                        if (loadingScreen) loadingScreen.classList.remove('active');
                        this.changeState('TITLE');
                    }, 400);
                });
            }
        );

        Compat.raf(this.loop.bind(this));
    },

    // ── State Changes ──
    changeState(newState) {
        this.state = newState;

        switch (newState) {
            case 'TITLE':
                this.titleTimer = 0;
                SFX.stopBGM();
                break;

            case 'PROLOGUE':
                this.prologueStep = 0;
                this.prologueCharIdx = 0;
                this.prologueWaitTimer = 0;
                SFX.stopBGM();
                break;

            case 'LEVEL': {
                this.level = createCampaignLevel(this.stageIndex);
                const spawn = this.level.playerSpawn || { x: 80, y: 400 };
                if (this.player) {
                    this.player.x = spawn.x;
                    this.player.y = spawn.y;
                } else {
                    this.player = new Player(spawn.x, spawn.y);
                }
                this.player.grantIFrames(I_FRAMES_SPAWN);
                this.levelNum = this.stageIndex + 1;
                if (this.level.boss) {
                    SFX.stopBGM();
                    setTimeout(() => SFX.playBossBGM(), 400);
                } else {
                    SFX.playBGM();
                }
                break;
            }

            case 'LEVEL1': {
                this.level = loadLevelForState('LEVEL1', {
                    width: 2800, type: 'normal', bg: 'forest', groundY: 490
                });
                const spawn1 = (this.level && this.level.playerSpawn) || { x: 80, y: 400 };
                this.player = new Player(spawn1.x, spawn1.y);
                this.player.grantIFrames(I_FRAMES_SPAWN); // 進關無敵保護
                this.levelNum = 1;
                SFX.playBGM();
                break;
            }

            case 'LEVEL2': {
                this.level = loadLevelForState('LEVEL2', {
                    width: 3500, type: 'normal', bg: 'castle', groundY: 490
                });
                const spawn2 = (this.level && this.level.playerSpawn) || { x: 80, y: 400 };
                if (this.player) {
                    this.player.x = spawn2.x;
                    this.player.y = spawn2.y;
                    this.player.grantIFrames(I_FRAMES_SPAWN);
                }
                this.levelNum = 2;
                break;
            }

            case 'BOSS': {
                this.level = loadLevelForState('BOSS', {
                    width: 960, type: 'boss', bg: 'boss', groundY: 490
                });
                const spawn3 = (this.level && this.level.playerSpawn) || { x: 80, y: 400 };
                if (this.player) {
                    this.player.x = spawn3.x;
                    this.player.y = spawn3.y;
                    this.player.grantIFrames(I_FRAMES_SPAWN);
                }
                this.levelNum = 3;
                SFX.stopBGM();
                setTimeout(() => SFX.playBossBGM(), 2000);
                break;
            }

            case 'VICTORY':
                this.resultTimer = 0;
                SFX.stopBGM();
                setTimeout(() => SFX.victory(), 500);
                for (let i = 0; i < 80; i++) {
                    setTimeout(() => {
                        Particles.emit(Math.random() * W, Math.random() * H, 2, '#fff', 'confetti');
                    }, i * 30);
                }
                break;

            case 'GAMEOVER':
                this.resultTimer = 0;
                SFX.stopBGM();
                break;
        }
    },

    // ── Update ──
    update() {
        Particles.update();
        Transition.update();

        if (Transition.active) return;

        switch (this.state) {
            case 'LOADING':
                // Handled by HTML overlay
                break;

            case 'TITLE':
                this.titleTimer++;
                // H / P：直接進關並開掛機（跳過序章）
                if (Input.wantAutoToggle()) {
                    AutoPlay.setEnabled(true, true);
                    AutoPlay.loopCount = 0;
                    this.stageIndex = 0;
                    Transition.start(() => this.changeState('LEVEL'));
                } else if (Input.wantStart()) {
                    AutoPlay.setEnabled(false, false);
                    Transition.start(() => this.changeState('PROLOGUE'));
                }
                break;

            case 'PROLOGUE':
                this.updatePrologue();
                break;

            case 'LEVEL':
            case 'LEVEL1':
            case 'LEVEL2':
            case 'BOSS':
                this.updateGameplay();
                break;

            case 'VICTORY':
            case 'GAMEOVER':
                this.resultTimer++;
                // 掛機模式：通關／死亡後自動循環再開
                if (AutoPlay.enabled && this.resultTimer > 100) {
                    if (this.state === 'VICTORY') AutoPlay.loopCount++;
                    this.stageIndex = 0;
                    Transition.start(() => this.changeState('LEVEL'));
                } else if (this.resultTimer > 60 && Input.wantStart()) {
                    AutoPlay.setEnabled(false, false);
                    Transition.start(() => this.changeState('TITLE'));
                } else if (this.resultTimer > 60 && Input.wantAutoToggle()) {
                    // 結算畫面也可直接掛機再戰
                    AutoPlay.setEnabled(true, true);
                    if (this.state === 'VICTORY') AutoPlay.loopCount++;
                    this.stageIndex = 0;
                    Transition.start(() => this.changeState('LEVEL'));
                }
                break;
        }
    },

    updatePrologue() {
        if (this.prologueStep >= this.prologueTexts.length) return;
        this.prologueCharIdx += 0.4;
        const currentText = this.prologueTexts[this.prologueStep];

        if (Input.wantStart()) {
            if (this.prologueCharIdx < currentText.length) {
                this.prologueCharIdx = currentText.length;
            } else {
                this.prologueStep++;
                this.prologueCharIdx = 0;
                if (this.prologueStep >= this.prologueTexts.length) {
                    this.prologueStep = this.prologueTexts.length - 1;
                    this.stageIndex = 0;
                    Transition.start(() => this.changeState('LEVEL'));
                }
            }
        }
    },

    updateGameplay() {
        // 掛機開關（遊戲中可隨時 H / P）
        if (Input.wantAutoToggle()) AutoPlay.toggle();

        // 自動掛機決策 → 注入虛擬輸入
        AutoPlay.think(this.player, this.level, this.state);

        this.player.update(this.level);

        // Enemies
        for (const e of this.level.enemies) {
            e.update(this.level, this.player);
            // Drop heal heart once when enemy dies
            if (e.dead && e._dropHeart && !e._heartSpawned) {
                e._heartSpawned = true;
                if (!this.level.hearts) this.level.hearts = [];
                this.level.hearts.push(new HeartItem(
                    e.x + e.w / 2 - 9,
                    e.y,
                    1,
                    false // falls to ground
                ));
            }
        }
        // Remove fully dead enemies after animation
        this.level.enemies = this.level.enemies.filter(e => !e.dead || e.deathTimer < 40);

        // Projectiles
        for (const p of this.level.projectiles) {
            p.update(this.level);
        }
        this.level.projectiles = this.level.projectiles.filter(p => !p.dead);

        // Fish
        for (const f of this.level.fish) {
            f.update(this.player);
        }

        // Hearts (heal pickups)
        if (!this.level.hearts) this.level.hearts = [];
        for (const h of this.level.hearts) {
            h.update(this.player, this.level);
        }
        this.level.hearts = this.level.hearts.filter(h => !h.dead);

        // Boss
        if (this.level.isFinalBoss) {
            drawBackground('world8', Camera.x);
        } else if (this.level.boss) {
            this.level.boss.update(this.level, this.player);
        }

        // Camera
        Camera.update(this.player, this.level.w);

        // Win conditions
        if (this.state === 'LEVEL' && !this.level.boss && this.player.x > this.level.w - 100) {
            SFX.levelUp();
            this.stageIndex++;
            Transition.start(() => this.changeState('LEVEL'));
        }
        if (this.level.boss && this.level.boss.dead && this.level.boss.deathTimer > 120) {
            if (this.state === 'LEVEL' && this.stageIndex < 31) {
                this.stageIndex++;
                Transition.start(() => this.changeState('LEVEL'));
            } else {
                Transition.start(() => this.changeState('VICTORY'));
            }
        }

        // Lose condition
        if (this.player.dead && this.player.y > 700) {
            Transition.start(() => this.changeState('GAMEOVER'));
        }
    },

    // ── Draw ──
    draw() {
        ctx.clearRect(0, 0, W, H);

        switch (this.state) {
            case 'LOADING':
                ctx.fillStyle = '#111';
                ctx.fillRect(0, 0, W, H);
                break;

            case 'TITLE':
                this.drawTitle();
                break;

            case 'PROLOGUE':
                this.drawPrologue();
                break;

            case 'LEVEL':
            case 'LEVEL1':
            case 'LEVEL2':
            case 'BOSS':
                this.drawGameplay();
                break;

            case 'VICTORY':
                this.drawVictory();
                break;

            case 'GAMEOVER':
                this.drawGameOver();
                break;
        }

        Transition.draw(ctx);
    },

    drawTitle() {
        // Background with castle
        const bg = Assets.get('castle');
        if (bg && bg.width) {
            safeDrawImage(ctx, bg, 0, 0, W, H);
        }
        // Dark overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(0, 0, W, H);

        // Vignette
        const vg = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.7);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.5)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, W, H);

        // Title text
        ctx.textAlign = 'center';

        // Shadow
        ctx.fillStyle = '#000';
        ctx.font = 'bold 72px "Noto Sans TC", sans-serif';
        ctx.fillText('喵布布的復仇', W / 2 + 4, 194);

        // Main title with gradient
        ctx.fillStyle = '#ffcc00';
        ctx.shadowColor = '#ff6600';
        ctx.shadowBlur = 30;
        ctx.fillText('喵布布的復仇', W / 2, 190);
        ctx.shadowBlur = 0;

        // Subtitle
        ctx.font = '18px "Press Start 2P", cursive';
        ctx.fillStyle = '#ddd';
        ctx.fillText("MeowBuBu's Revenge", W / 2, 240);

        // Cat emoji bobbing
        const catY = 290 + Math.sin(this.titleTimer * 0.08) * 8;
        ctx.font = '50px sans-serif';
        ctx.fillText('🐱', W / 2, catY);

        // "Press Start" blinking
        if (Math.floor(this.titleTimer / 30) % 2 === 0) {
            ctx.font = '14px "Press Start 2P", cursive';
            ctx.fillStyle = '#fff';
            const startHint = TouchUI.isActive()
                ? '點螢幕開始'
                : 'PRESS ENTER OR TAP TO START';
            ctx.fillText(startHint, W / 2, 400);
        }

        // Auto-play option
        ctx.font = '13px "Noto Sans TC", sans-serif';
        ctx.fillStyle = Math.floor(this.titleTimer / 40) % 2 === 0 ? '#8f8' : '#5a5';
        ctx.fillText(
            TouchUI.isActive() ? '點右上「掛機」可自動遊玩' : '按 H 或 P 啟動自動掛機模式',
            W / 2, 435
        );

        // Instructions
        ctx.font = '11px "Noto Sans TC", sans-serif';
        ctx.fillStyle = '#888';
        if (TouchUI.isActive()) {
            ctx.fillText('左：方向 ｜ 右：跳／攻／技能／大絕 ｜ 建議橫持手機', W / 2, 470);
            ctx.fillText('長按「跳」可跳更高  ·  方向＋技能可八向射擊', W / 2, 490);
        } else {
            ctx.fillText('X 技能可配合 ↑↓←→ 八向射擊 ｜ Z 攻擊 ｜ V 大絕 ｜ 空白跳躍', W / 2, 470);
            ctx.fillText('遊戲中按 H / P 可開關掛機  ·  Hold ↑↓←→ + X 瞄準技能', W / 2, 490);
        }

        ctx.textAlign = 'left';
    },

    drawPrologue() {
        // Draw prologue comic image
        const prolog = Assets.get('prologue');
        if (prolog && prolog.width) {
            // Pan based on step
            const panY = -50 + this.prologueStep * 15;
            safeDrawImage(ctx, prolog, 0, panY, W, H - panY + 50);
        } else {
            ctx.fillStyle = '#111';
            ctx.fillRect(0, 0, W, H);
        }

        // Dark bottom bar for text
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        const barY = H - 110;
        ctx.fillRect(0, barY, W, 110);
        // Top edge glow
        ctx.fillStyle = 'rgba(255, 200, 0, 0.3)';
        ctx.fillRect(0, barY, W, 2);

        // Character name tag
        ctx.fillStyle = 'rgba(255, 140, 0, 0.9)';
        ctx.fillRect(30, barY + 10, 80, 24);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 13px "Noto Sans TC", sans-serif';
        ctx.fillText('喵布布', 40, barY + 27);

        // Dialogue text (typewriter)
        const safeStep = Math.min(this.prologueStep, this.prologueTexts.length - 1);
        const currentText = this.prologueTexts[safeStep] || '';
        const displayText = currentText.substring(0, Math.floor(this.prologueCharIdx));
        ctx.fillStyle = '#fff';
        ctx.font = '22px "Noto Sans TC", sans-serif';
        ctx.fillText(displayText, 40, barY + 65);

        // Continue indicator
        if (currentText.length > 0 && this.prologueCharIdx >= currentText.length) {
            if (Math.floor(Date.now() / 400) % 2 === 0) {
                ctx.fillStyle = '#ffcc00';
                ctx.font = '16px sans-serif';
                ctx.fillText('▼', W - 60, barY + 85);
            }
        }

        // Step indicator
        ctx.fillStyle = '#666';
        ctx.font = '11px "Press Start 2P", cursive';
        ctx.textAlign = 'right';
        ctx.fillText(`${this.prologueStep + 1}/${this.prologueTexts.length}`, W - 30, barY + 28);
        ctx.textAlign = 'left';
    },

    drawGameplay() {
        // Background
        if (this.level.boss) {
            drawBossBackground();
        } else {
            const bgKey = this.level.bg || 'world1';
            drawBackground(bgKey, Camera.x);
        }

        Camera.apply(ctx);

        // Platforms
        const levelType = this.level.boss ? 'boss' : (this.level.bg || 'forest');
        for (const p of this.level.platforms) {
            drawPlatform(p, levelType);
        }

        // Level end marker (for non-boss levels)
        if (!this.level.boss) {
            const flagX = this.level.w - 60;
            ctx.fillStyle = '#a00';
            ctx.fillRect(flagX, this.level.groundY - 60, 4, 60);
            ctx.fillStyle = '#f44';
            ctx.fillRect(flagX + 4, this.level.groundY - 60, 30, 20);
            // Arrow
            ctx.fillStyle = '#ffe066';
            ctx.font = 'bold 18px sans-serif';
            ctx.fillText('→', flagX - 25, this.level.groundY - 35);
        }

        // Fish
        for (const f of this.level.fish) { f.draw(ctx); }

        // Hearts
        if (this.level.hearts) {
            for (const h of this.level.hearts) { h.draw(ctx); }
        }

        // Enemies
        for (const e of this.level.enemies) { e.draw(ctx); }

        // Boss
        if (this.level.boss) { this.level.boss.draw(ctx); }

        // Player
        this.player.draw(ctx);

        // Projectiles
        for (const p of this.level.projectiles) { p.draw(ctx); }

        // Particles
        Particles.draw(ctx);

        Camera.restore(ctx);

        // HUD
        drawHUD(this.player, this.level, this.levelNum);
        AutoPlay.drawOverlay(ctx, W, H);
    },

    drawVictory() {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);

        // Confetti particles
        Particles.draw(ctx);

        // Stars
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        for (let i = 0; i < 30; i++) {
            ctx.fillRect(
                (i * 37 + Math.sin(this.resultTimer * 0.03 + i) * 20) % W,
                (i * 23 + Math.cos(this.resultTimer * 0.02 + i) * 10) % H,
                2, 2
            );
        }

        ctx.textAlign = 'center';

        // Big victory text
        ctx.fillStyle = '#ffe066';
        ctx.shadowColor = '#ff8800';
        ctx.shadowBlur = 20;
        ctx.font = 'bold 60px "Noto Sans TC", sans-serif';
        ctx.fillText('復仇成功！', W / 2, 160);
        ctx.shadowBlur = 0;

        ctx.font = '20px "Press Start 2P", cursive';
        ctx.fillStyle = '#fff';
        ctx.fillText("VICTORY!", W / 2, 210);

        // Stats
        ctx.font = '18px "Noto Sans TC", sans-serif';
        ctx.fillStyle = '#ccc';
        ctx.fillText(`分數 SCORE: ${this.player.score}`, W / 2, 290);
        ctx.fillText(`收集魚數 FISH: ${this.player.fish}`, W / 2, 320);

        // Cat icon
        ctx.font = '60px sans-serif';
        ctx.fillText('😸', W / 2, 400);

        if (this.resultTimer > 60 && Math.floor(this.resultTimer / 25) % 2 === 0) {
            ctx.font = '12px "Press Start 2P", cursive';
            ctx.fillStyle = '#aaa';
            if (AutoPlay.enabled) {
                ctx.fillText('AUTO RESTART...', W / 2, 460);
            } else if (TouchUI.isActive()) {
                ctx.fillText('點螢幕回標題  ·  掛機再戰', W / 2, 460);
            } else {
                ctx.fillText('ENTER 回標題  ·  H 掛機再戰', W / 2, 460);
            }
        }

        ctx.textAlign = 'left';
    },

    drawGameOver() {
        // Dark red gradient
        const grd = ctx.createLinearGradient(0, 0, 0, H);
        grd.addColorStop(0, '#1a0000');
        grd.addColorStop(1, '#330000');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';

        ctx.fillStyle = '#f44';
        ctx.shadowColor = '#f00';
        ctx.shadowBlur = 30;
        ctx.font = 'bold 55px "Noto Sans TC", sans-serif';
        ctx.fillText('喵布布倒下了...', W / 2, 200);
        ctx.shadowBlur = 0;

        ctx.font = '22px "Press Start 2P", cursive';
        ctx.fillStyle = '#a44';
        ctx.fillText('GAME OVER', W / 2, 260);

        // Sad cat
        ctx.font = '60px sans-serif';
        ctx.fillText('😿', W / 2, 360);

        if (this.resultTimer > 60 && Math.floor(this.resultTimer / 25) % 2 === 0) {
            ctx.font = '12px "Press Start 2P", cursive';
            ctx.fillStyle = '#888';
            if (AutoPlay.enabled) {
                ctx.fillText('AUTO RESTART...', W / 2, 440);
            } else if (TouchUI.isActive()) {
                ctx.fillText('點螢幕回標題  ·  掛機再戰', W / 2, 440);
            } else {
                ctx.fillText('ENTER 回標題  ·  H 掛機再戰', W / 2, 440);
            }
        }

        ctx.textAlign = 'left';
    },

    // ── Game Loop ──
    loop(timestamp) {
        try {
            deltaTime = timestamp - lastTime;
            lastTime = timestamp;

            // Cap delta to prevent spiral of death
            if (deltaTime > 50) deltaTime = 50;

            this.update();
            this.draw();
            Input.reset();
        } catch (err) {
            // 單幀錯誤不應讓整款遊戲在手機上卡死
            console.error('Game frame error:', err);
            try { Input.reset(); } catch (_) {}
        }
        Compat.raf(this.loop.bind(this));
    }
};

// ── Start! ──
try {
    Game.init();
} catch (err) {
    console.error('Game.init failed:', err);
    const t = document.getElementById('loading-text');
    if (t) t.textContent = '載入失敗，請重新整理頁面';
}
