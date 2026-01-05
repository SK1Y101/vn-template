class WeatherSystem {
    constructor(canvasId, opts = {}) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error("Weather canvas not found:", canvasId);
            return;
        }
        this.ctx = this.canvas.getContext("2d", { alpha: true });
        this.width = 0;
        this.height = 0;
        this.resize();

        this.currentEffect = null; // effect object
        this.nextEffect = null;    // effect object for transition in
        this.transitionAlpha = 0;  // 0..1 (0 = current only, 1 = next only)
        this.transitioning = false;
        this.transitionDuration = opts.transitionDuration ?? 1500; // ms
        this.clearFadeDuration = opts.clearFadeDuration ?? 600; // ms to fade to clear
        this.lastTS = performance.now();

        this.globalAlpha = 1.0;

        window.addEventListener("resize", () => this.resize());

        const observer = new MutationObserver(() => this.onClassChange());
        observer.observe(this.canvas, { attributes: true, attributeFilter: ["class"] });

        requestAnimationFrame(ts => {
            this.lastTS = ts;
            this.update(ts);
        });
    }

    resize() {
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        this.canvas.width = Math.round(window.innerWidth * dpr);
        this.canvas.height = Math.round(window.innerHeight * dpr);
        this.canvas.style.width = `${window.innerWidth}px`;
        this.canvas.style.height = `${window.innerHeight}px`;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        if (this.currentEffect && this.currentEffect.onResize) this.currentEffect.onResize(this.width, this.height);
        if (this.nextEffect && this.nextEffect.onResize) this.nextEffect.onResize(this.width, this.height);
    }

    onClassChange() {
        const cls = (this.canvas.className || "").trim();
        const match = cls.match(/weather-([a-z-]+)/);
        const newType = match ? match[1] : "clear";
        this.setWeather(newType);
    }

    setWeather(type) {
        type = (type || "clear").toLowerCase();
        if (type === "none" || type === "clear") {
            // transition to empty
            if (!this.currentEffect) return;
            this.nextEffect = null;
            this.startTransition(this.clearFadeDuration);
            return;
        }

        if (this.currentEffect && this.currentEffect.type === type && !this.transitioning) return;

        if (this.nextEffect && this.nextEffect.type === type) return;

        this.transitionAlpha = 0;
        this.nextEffect = WeatherEffectFactory.create(type, this.width, this.height);
        if (!this.nextEffect) {
            console.warn("Unknown weather type:", type);
            return;
        }
        if (this.nextEffect.onStart) this.nextEffect.onStart();

        this.startTransition(this.transitionDuration);
    }

    startTransition(duration) {
        this.transitioning = true;
        this.transitionDuration = Math.max(1, duration || this.transitionDuration);
        this.transitionStartTS = performance.now();
        this.transitionAlpha = 0;
    }

    update(ts) {
        const dt = Math.min(100, ts - this.lastTS);
        this.lastTS = ts;

        if (this.transitioning) {
            const elapsed = ts - this.transitionStartTS;
            const t = Math.min(1, elapsed / this.transitionDuration);
            this.transitionAlpha = t;
            if (t >= 1) {
                if (this.currentEffect && this.currentEffect.onStop) this.currentEffect.onStop();
                this.currentEffect = this.nextEffect;
                this.nextEffect = null;
                this.transitioning = false;
                this.transitionAlpha = 0;
            }
        }

        if (this.currentEffect && this.currentEffect.update) this.currentEffect.update(dt);
        if (this.nextEffect && this.nextEffect.update) this.nextEffect.update(dt);

        this.draw();

        requestAnimationFrame(s => this.update(s));
    }

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.width, this.height);
    }

    draw() {
        const ctx = this.ctx;
        this.clearCanvas();

        if (this.transitioning) {
            const outA = 1 - this.transitionAlpha;
            const inA = this.transitionAlpha;
            if (this.currentEffect && this.currentEffect.draw && outA > 0) {
                ctx.save();
                ctx.globalAlpha = this.globalAlpha * outA;
                this.currentEffect.draw(ctx, outA);
                ctx.restore();
            }
            if (this.nextEffect && this.nextEffect.draw && inA > 0) {
                ctx.save();
                ctx.globalAlpha = this.globalAlpha * inA;
                this.nextEffect.draw(ctx, inA);
                ctx.restore();
            }
        } else {
            if (this.currentEffect && this.currentEffect.draw) {
                ctx.save();
                ctx.globalAlpha = this.globalAlpha;
                this.currentEffect.draw(ctx, 1);
                ctx.restore();
            }
        }
    }
}


const WeatherEffectFactory = {
    create(type, w, h) {
        switch (type) {
            case "rain": return new EffectRain(w, h);
            case "snow": return new EffectSnow(w, h);
            case "fog": return new EffectFog(w, h);
            case "overcast": return new EffectOvercast(w, h);
            case "dust": return new EffectDust(w, h);
            case "fireflies": return new EffectFireflies(w, h);
            case "blizzard": return new EffectBlizzard(w, h);
            case "aurora": return new EffectAurora(w, h);
            case "wind": return new EffectWind(w, h);
            case "thunderstorm": return new EffectThunderstorm(w, h);
            case "sunny": return new EffectSunny(w, h);
            case "night": return new EffectNight(w, h);
            default: return null;
        }
    }
};


function rnd(min = 0, max = 1) { return min + Math.random() * (max - min); }
function irnd(min, max) { return Math.floor(rnd(min, max + 1)); }


class BaseEffect {
    constructor(w, h) {
        this.w = w; this.h = h; this.type = "base";
    }
    onStart() { }
    onStop() { }
    onResize(w, h) { this.w = w; this.h = h; }
    update(dt) { }
    draw(ctx, alpha = 1) { }
}


class EffectRain extends BaseEffect {
    constructor(w, h, d = 1, v = 1) {
        super(w, h);
        this.type = "rain";
        this.particles = [];
        this.density = d * Math.round((w * h) / 4000);
        this.velocity = v;
        this.angle = 0;
        this.spawn();
    }
    spawn() {
        this.particles.length = 0;
        for (let i = 0; i < this.density; i++) {
            this.particles.push({
                x: Math.random() * this.w,
                y: Math.random() * this.h,
                length: rnd(8, 22),
                speed: this.velocity * rnd(0.4, 1.1),
            });
        }
    }
    onResize(w, h, d = 1) {
        super.onResize(w, h); this.density = d * Math.round((w * h) / 4000); this.spawn(); }
    update(dt) {
        this.angle += rnd(-0.001, 0.001);
        for (const p of this.particles) {
            p.y += p.speed * dt;
            p.x += Math.sin(this.angle) * 2 * (dt / 16.67);
            if (p.y > this.h) { p.y = -p.length; p.x = Math.random() * this.w; }
        }
    }
    draw(ctx) {
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 1;

        for (const p of this.particles) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + Math.sin(this.angle) * p.length, p.y + p.length);
            ctx.stroke();
        }
    }
}



class EffectSnow extends BaseEffect {
    constructor(w, h) {
        super(w, h);
        this.type = "snow";
        this.particles = [];
        this.count = Math.max(60, Math.round((w * h) / 9000));
        this.spawn();
    }
    spawn() {
        this.particles = [];
        for (let i = 0; i < this.count; i++) {
            this.particles.push({
                x: Math.random() * this.w,
                y: Math.random() * this.h,
                r: rnd(0.8, 3.2),
                vy: rnd(20, 80) / 1000,
                vx: rnd(-0.1, 0.1),
                sway: rnd(0.001, 0.006),
                angle: Math.random() * Math.PI * 2
            });
        }
    }
    onResize(w, h) {
        super.onResize(w, h); this.count = Math.max(60, Math.round((w * h) / 9000)); this.spawn(); }
    update(dt) {
        for (const p of this.particles) {
            p.angle += p.sway * dt;
            p.x += p.vx * dt + Math.sin(p.angle) * 0.02 * dt;
            p.y += p.vy * dt;
            if (p.y > this.h + 10) { p.y = -10; p.x = Math.random() * this.w; }
        }
    }
    draw(ctx) {
        ctx.fillStyle = "rgba(240,240,255,0.9)";
        for (const p of this.particles) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}


class EffectFog extends BaseEffect {
    constructor(w, h) {
        super(w, h);
        this.type = "fog";
        this.layers = [];
        this.count = Math.max(6, Math.round((w * h) / 120000));
        this.spawn();
    }
    spawn() {
        this.layers = [];
        for (let i = 0; i < this.count; i++) {
            this.layers.push({
                x: Math.random() * this.w,
                y: Math.random() * this.h,
                r: rnd(Math.min(this.w, this.h) * 0.15, Math.min(this.w, this.h) * 0.4),
                vx: rnd(-0.02, 0.02),
                vy: rnd(-0.01, 0.01),
                opacity: rnd(0.03, 0.12)
            });
        }
    }
    onResize(w, h) {
        super.onResize(w, h); this.count = Math.max(6, Math.round((w * h) / 120000)); this.spawn(); }
    update(dt) {
        for (const l of this.layers) {
            l.x += l.vx * dt; l.y += l.vy * dt;
            if (l.x < -l.r) l.x = this.w + l.r;
            if (l.x > this.w + l.r) l.x = -l.r;
            if (l.y < -l.r) l.y = this.h + l.r;
            if (l.y > this.h + l.r) l.y = -l.r;
        }
    }
    draw(ctx) {
        for (const l of this.layers) {
            const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
            g.addColorStop(0, `rgba(255,255,255,${l.opacity})`);
            g.addColorStop(1, `rgba(255,255,255,0)`);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}


class EffectOvercast extends BaseEffect {
    constructor(w, h) {
        super(w, h);
        this.type = "overcast";

        this.speed = rnd(-0.02, 0.02);
        this.offset = 0;

        this.buildLayer();
    }

    buildLayer() {
        this.layer = document.createElement("canvas");
        this.layer.width = this.w * 1.5;
        this.layer.height = this.h;

        const ctx = this.layer.getContext("2d");

        const cloudCount = Math.max(6, Math.round((this.w * this.h) / 220000));

        for (let i = 0; i < cloudCount; i++) {
            const x = rnd(-0.2 * this.layer.width, 1.2 * this.layer.width);
            const y = rnd(-0.2 * this.layer.height, this.layer.height * 0.4);
            const r = rnd(this.w * 0.15, this.w * 0.4);
            const op = rnd(0.06, 0.18);

            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, `rgba(210,210,215,${op})`);
            g.addColorStop(1, `rgba(210,210,215,0)`);

            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    onResize(w, h) {
        super.onResize(w, h);
        this.buildLayer();
    }

    update(dt) {
        this.offset += this.speed * dt;
        const maxOffset = this.layer.width - this.w;
        if (this.offset > maxOffset) this.offset -= maxOffset;
        if (this.offset < 0) this.offset += maxOffset;
    }

    draw(ctx) {
        ctx.fillStyle = "rgba(180,180,200,0.03)";
        ctx.fillRect(0, 0, this.w, this.h);

        const ox = Math.floor(this.offset);

        ctx.drawImage(this.layer, ox, 0, this.w, this.h, 0, 0, this.w, this.h);

        if (ox > this.layer.width - this.w) {
            const remaining = this.w - (this.layer.width - ox);
            ctx.drawImage(this.layer, 0, 0, remaining, this.h, this.w - remaining, 0, remaining, this.h);
        }
    }
}


class EffectDust extends BaseEffect {
    constructor(w, h) {
        super(w, h);
        this.type = "dust";
        this.particles = [];
        this.count = Math.max(Math.round((w * h) / 8000), 50);
        this.spawn();
    }
    spawn() {
        this.particles = [];
        for (let i = 0; i < this.count; i++) {
            this.particles.push({
                x: Math.random() * this.w,
                y: Math.random() * this.h,
                radius: rnd(0.8, 2.2),
                speedX: rnd(-0.25, 0.25),
                speedY: rnd(-0.15, 0.15),
                opacity: rnd(0.1, 0.4)
            });
        }
    }
    onResize(w, h) {
        super.onResize(w, h); this.count = Math.max(Math.round((w * h) / 8000), 50); this.spawn(); }
    update(dt) {
        for (const p of this.particles) {
            p.x += p.speedX * dt;
            p.y += p.speedY * dt;
            if (p.x > this.w) p.x = 0;
            if (p.x < 0) p.x = this.w;
            if (p.y > this.h) p.y = 0;
            if (p.y < 0) p.y = this.h;
        }
    }
    draw(ctx) {
        for (const p of this.particles) {
            ctx.fillStyle = `rgba(210,180,140,${p.opacity})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}


class EffectFireflies extends BaseEffect {
    constructor(w, h) {
        super(w, h);
        this.type = "fireflies";
        this.particles = [];
        this.count = Math.max(40, Math.round((w * h) / 12000));
        this.spawn();
    }
    spawn() {
        this.particles = [];
        for (let i = 0; i < this.count; i++) {
            this.particles.push({
                x: Math.random() * this.w,
                y: Math.random() * this.h,
                radius: rnd(1.4, 2.2),
                speed: rnd(0.4, 1.0),
                phase: Math.random() * Math.PI * 2,
                angle: rnd(0, Math.PI * 2)
            });
        }
    }
    onResize(w, h) {
        super.onResize(w, h); this.count = Math.max(40, Math.round((w * h) / 12000)); this.spawn(); }
    update(dt) {
        for (const p of this.particles) {
            p.phase += dt / (30 * 16.67);
            p.angle += rnd(-0.1, 0.1);
            p.x += Math.cos(p.angle) * p.speed;
            p.y += Math.sin(p.angle) * p.speed;
            if (p.x < 0) p.x = this.w;
            if (p.x > this.w) p.x = 0;
            if (p.y < 0) p.y = this.h;
            if (p.y > this.h) p.y = 0;
        }
    }
    draw(ctx) {
        for (const p of this.particles) {
            const glow = Math.pow(Math.sin(p.phase), 2);
            const outer = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 6 * (1 + glow));
            outer.addColorStop(0, `rgba(255,235,150,${0.6 * glow})`);
            outer.addColorStop(1, 'rgba(255,235,150,0)');
            ctx.fillStyle = outer; ctx.beginPath();
            ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = `rgba(255,255,150,${0.4 + Math.random() * 0.4})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}


class EffectBlizzard extends BaseEffect {
    constructor(w, h) {
        super(w, h);
        this.type = "blizzard";
        this.particles = [];
        this.count = Math.round((w * h) / 4000);
        this.spawn();
    }
    spawn() {
        this.particles = [];
        for (let i = 0; i < this.count; i++) {
            this.particles.push({
                x: Math.random() * this.w,
                y: Math.random() * this.h,
                r: rnd(1, 2.4),
                vy: rnd(0.6, 1.6),
                vx: rnd(-0.6, 0.6),
                angle: Math.random() * Math.PI * 2
            });
        }
    }
    onResize(w, h) {
        super.onResize(w, h); this.count = Math.round((w * h) / 1200); this.spawn(); }
    update(dt) {
        for (const p of this.particles) {
            p.angle += rnd(-0.03, 0.03) * dt * 0.001;
            p.x += p.vx * dt + Math.cos(p.angle) * 0.3;
            p.y += p.vy * dt + Math.sin(p.angle) * 0.2;
            if (p.y > this.h + 20) { p.y = -20; p.x = Math.random() * this.w; }
        }
    }
    draw(ctx) {
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        for (const p of this.particles) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}


class EffectWind extends BaseEffect {
    constructor(w, h) {
        super(w, h);
        this.type = "wind";
        this.particles = [];
        this.count = Math.max(80, Math.round((w * h) / 7000));
        this.spawn();
    }
    spawn() {
        this.particles = [];
        for (let i = 0; i < this.count; i++) {
            const speed = rnd(0.15, 1.2);

            this.particles.push({
                x: Math.random() * this.w,
                y: Math.random() * this.h,
                speedX: speed * rnd(0.5, 1.1),
                speedY: rnd(-0.05, 0.05),
                radius: rnd(1.2, 2.8),
                opacity: rnd(0.05, 0.22)
            });
        }
    }
    onResize(w, h) {
        super.onResize(w, h); this.count = Math.max(80, Math.round((w * h) / 7000)); this.spawn(); }
    update(dt) {
        for (const p of this.particles) {
            p.x += p.speedX * dt;
            p.y += p.speedY * dt;
            if (p.x > this.w) p.x = 0;
            if (p.x < 0) p.x = this.w;
            if (p.y > this.h) p.y = 0;
            if (p.y < 0) p.y = this.h;
        }
    }
    draw(ctx) {
        this.particles.forEach(p => {
            ctx.fillStyle = `rgba(150,200,255,${p.opacity})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
        });
    }
}



class EffectThunderstorm extends BaseEffect {
    constructor(w, h) {
        super(w, h);
        this.type = "thunderstorm";
        this.rain = new EffectRain(w, h, 3, 2);
        this.lightningAlpha = 0;
        this.lightningTimer = rnd(2000, 8000);
        this.timeAccumulator = 0;
        this.lightningFlash = 0;
    }
    onResize(w, h) {
        super.onResize(w, h); this.rain.onResize(w, h, 3); }
    update(dt) {
        this.rain.update(dt);
        this.timeAccumulator += dt;
        if (this.timeAccumulator > this.lightningTimer) {
            this.lightningFlash = 1.0;
            this.timeAccumulator = 0;
            this.lightningTimer = rnd(2000, 10000);
        }
        this.lightningFlash = Math.max(0, this.lightningFlash - dt * 0.008);
    }
    draw(ctx) {
        this.rain.draw(ctx);

        if (this.lightningFlash > 0.01) {
            ctx.save();
            ctx.globalAlpha = 0.6 * Math.min(1, this.lightningFlash * 2);
            ctx.fillStyle = `rgba(255,255,255,${0.07 * this.lightningFlash})`;
            ctx.fillRect(0, 0, this.w, this.h);

            ctx.strokeStyle = `rgba(255,255,220,${0.9 * this.lightningFlash})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            const startX = rnd(0.2 * this.w, 0.8 * this.w);
            let x = startX, y = 0;
            ctx.moveTo(x, y);
            let segments = irnd(6, 12);
            for (let s = 0; s < segments; s++) {
                x += rnd(-40, 40);
                y += rnd(this.h / segments * 0.6, this.h / segments * 1.3);
                ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.restore();
        }
    }
}


class EffectSunny extends BaseEffect {
    constructor(w, h) {
        super(w, h);
        this.type = "sunny";
        this.position = { x: 0.85 * w, y: -0.1 * h };
        this.pulse = 0;
    }
    update(dt) {
        this.pulse += dt * 0.0006;
    }
    draw(ctx) {
        const x = this.position.x, y = this.position.y;
        const radius = Math.max(this.w, this.h) * 0.9;
        const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
        const bloom = 0.22 + 0.18 * Math.sin(this.pulse * 2 * Math.PI);
        g.addColorStop(0, `rgba(255,245,200,${0.25 * bloom})`);
        g.addColorStop(0.25, `rgba(255,240,200,${0.12 * bloom})`);
        g.addColorStop(1, `rgba(255,240,200,0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, this.w, this.h);
        const g2 = ctx.createRadialGradient(x, y, 0, x, y, radius * 0.25);
        g2.addColorStop(0, `rgba(255,255,220,${0.3 * bloom})`);
        g2.addColorStop(1, `rgba(255,255,220,0)`);
        ctx.fillStyle = g2;
        ctx.fillRect(0, 0, this.w, this.h);
    }
}


class EffectNight extends BaseEffect {
    constructor(w, h) {
        super(w, h);
        this.type = "night";
        this.stars = [];
        this.count = Math.max(Math.round((w * h) / 35000), 120);
        this.spawn();
        this.nocturnalTint = "rgba(10,12,30,0.55)";
    }
    spawn() {
        this.stars = [];
        for (let i = 0; i < this.count; i++) {
            this.stars.push({
                x: Math.random() * this.w,
                y: Math.random() * this.h * 0.8,
                r: rnd(0.3, 1.4),
                phase: Math.random() * Math.PI * 2,
                alpha: rnd(0.4, 1)
            });
        }
    }
    onResize(w, h) {
        super.onResize(w, h); this.count = Math.max(Math.round((w * h) / 35000), 120); this.spawn(); }
    update(dt) {
        for (const s of this.stars) s.phase += dt * 0.001;
    }
    draw(ctx) {
        ctx.fillStyle = this.nocturnalTint;
        ctx.fillRect(0, 0, this.w, this.h);

        for (const s of this.stars) {
            const a = 0.6 + 0.4 * Math.abs(Math.sin(s.phase));
            ctx.fillStyle = `rgba(255,255,255,${a * s.alpha})`;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}


class EffectAurora extends BaseEffect {
    constructor(w, h) {
        super(w, h);
        this.type = "aurora";

        this.layers = [];
        for (let i = 0; i < 4; i++) {
            this.layers.push(this._newLayer());
        }

        this.noiseW = 96;
        this.noiseH = 96;
        this.noise = this._makeNoise();
    }

    _newLayer() {
        return {
            hue: 120 + Math.random() * 120,
            phase: Math.random() * 1000,
            speed: rnd(0.00003, 0.00009),
            verticalDrift: rnd(0.00001, 0.00003),
            shear: rnd(0.06, 0.12),             // shears noise vertically
            scale: rnd(0.0015, 0.004),          // larger features
            thickness: rnd(140, 280),
            alpha: rnd(0.05, 0.12),
            yOffset: rnd(0.1, 0.25) * this.h
        };
    }

    _makeNoise() {
        const n = [];
        for (let y = 0; y < this.noiseH; y++) {
            const row = [];
            for (let x = 0; x < this.noiseW; x++) {
                row.push(Math.random());
            }
            n.push(row);
        }
        return n;
    }

    _sampleNoise(x, y) {
        x = (x % this.noiseW + this.noiseW) % this.noiseW;
        y = (y % this.noiseH + this.noiseH) % this.noiseH;

        const x0 = x | 0, x1 = (x0 + 1) % this.noiseW;
        const y0 = y | 0, y1 = (y0 + 1) % this.noiseH;

        const dx = x - x0;
        const dy = y - y0;

        const n00 = this.noise[y0][x0];
        const n10 = this.noise[y0][x1];
        const n01 = this.noise[y1][x0];
        const n11 = this.noise[y1][x1];

        const nx0 = n00 * (1 - dx) + n10 * dx;
        const nx1 = n01 * (1 - dx) + n11 * dx;
        return nx0 * (1 - dy) + nx1 * dy;
    }

    update(dt) {
        for (const l of this.layers) {
            l.phase += dt * l.speed;               // slow horizontal drift
            l.yOffset += dt * l.verticalDrift;     // slow vertical slide
        }
    }

    draw(ctx) {
        ctx.fillStyle = "rgba(0,0,0,0.03)";
        ctx.fillRect(0, 0, this.w, this.h);

        for (const l of this.layers) {
            const { hue, alpha, scale, phase, shear, yOffset, thickness } = l;

            ctx.beginPath();

            for (let x = 0; x <= this.w; x += 4) {
                const nx = x * scale + phase;
                const ny = yOffset * scale + x * shear * 0.001;

                const noise =
                    this._sampleNoise(nx, ny) * 90 +            // soft waves
                    this._sampleNoise(nx * 0.5, ny * 1.4) * 50 +  // secondary ripples
                    this._sampleNoise(nx * 1.3, ny * 0.8) * 30;  // subtle detail

                const y = yOffset + noise * 0.6;                 // reduce amplitude

                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }

            // bottom contour
            for (let x = this.w; x >= 0; x -= 4) {
                const nx = x * scale + phase + 10;
                const ny = yOffset * scale + x * shear * 0.0015;

                const noise =
                    this._sampleNoise(nx, ny) * 90 +
                    this._sampleNoise(nx * 0.5, ny * 1.4) * 50 +
                    this._sampleNoise(nx * 1.3, ny * 0.8) * 30;

                ctx.lineTo(x, yOffset + noise * 0.6 + thickness);
            }

            const grad = ctx.createLinearGradient(0, yOffset, 0, yOffset + thickness);
            grad.addColorStop(0, `hsla(${hue}, 90%, 70%, ${alpha})`);
            grad.addColorStop(0.4, `hsla(${hue + 15}, 80%, 60%, ${alpha * 0.5})`);
            grad.addColorStop(1, `hsla(${hue + 30}, 60%, 40%, 0)`);

            ctx.fillStyle = grad;
            ctx.fill();
        }
    }
}


window.addEventListener("DOMContentLoaded", () => {
    try {
        window.weatherSystem = new WeatherSystem("weather-canvas", { transitionDuration: 1500, clearFadeDuration: 600 });

        const cls = (window.weatherSystem && window.weatherSystem.canvas) ? (window.weatherSystem.canvas.className || "") : "";
        const match = cls.match(/weather-([a-z-]+)/);
        if (match) {
            window.weatherSystem.setWeather(match[1]);
        }
    } catch (err) {
        console.error("WeatherSystem init failed:", err);
    }
});
