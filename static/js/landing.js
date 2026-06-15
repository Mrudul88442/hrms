document.addEventListener('DOMContentLoaded', () => {
    // --- Cursor Glow ---
    const cursorGlow = document.createElement('div');
    cursorGlow.id = 'cursorGlow';
    document.body.appendChild(cursorGlow);
    document.addEventListener('mousemove', (e) => {
        cursorGlow.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
    });

    // --- Performance-Optimized Animation Engine ---
    const canvases = {
        bg: initCanvas('bgCanvas', true),
        logo: initCanvas('logoCanvas'),
        hero: initCanvas('heroCanvas'),
        f1: initCanvas('featureCanvas1'),
        f2: initCanvas('featureCanvas2'),
        f3: initCanvas('featureCanvas3'),
        f4: initCanvas('featureCanvas4'),
        pipe: initCanvas('pipelineCanvas')
    };

    function initCanvas(id, isFixed = false) {
        const c = document.getElementById(id);
        if (!c) return null;
        const ctx = c.getContext('2d');
        return { el: c, ctx, width: 0, height: 0, isFixed };
    }

    function resize() {
        Object.values(canvases).forEach(canvas => {
            if (!canvas) return;
            const parent = canvas.el.parentElement;
            canvas.width = canvas.isFixed ? window.innerWidth : parent.offsetWidth;
            canvas.height = canvas.isFixed ? window.innerHeight : parent.offsetHeight;
            canvas.el.width = canvas.width;
            canvas.el.height = canvas.height;
        });
    }

    // --- Animation Classes ---
    class ParticleSystem {
        constructor(count, width, height, color = '#4f8ef7', dist = 100) {
            this.particles = Array.from({ length: count }, () => ({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.3,
                vy: (Math.random() - 0.5) * 0.3,
                r: Math.random() * 2.5 + 1.0
            }));
            this.color = color;
            this.maxDist = dist;
        }
        update(w, h) {
            this.particles.forEach(p => {
                p.x += p.vx; p.y += p.vy;
                if (p.x < 0 || p.x > w) p.vx *= -1;
                if (p.y < 0 || p.y > h) p.vy *= -1;
            });
        }
        draw(ctx) {
            ctx.fillStyle = this.color;
            this.particles.forEach((p, i) => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
                for (let j = i + 1; j < this.particles.length; j++) {
                    const o = this.particles[j];
                    const d = Math.sqrt((p.x - o.x) ** 2 + (p.y - o.y) ** 2);
                    if (d < this.maxDist) {
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y); ctx.lineTo(o.x, o.y);
                        ctx.strokeStyle = `rgba(79, 142, 247, ${0.3 * (1 - d / this.maxDist)})`;
                        ctx.lineWidth = 1.0;
                        ctx.stroke();
                    }
                }
            });
        }
    }

    class OrbitSystem {
        constructor(cx, cy, rings) {
            this.cx = cx; this.cy = cy;
            this.rings = rings; // Array of {r, speed, color, dotSize}
        }
        draw(ctx, time) {
            this.rings.forEach(ring => {
                const angle = time * ring.speed;
                ctx.beginPath();
                ctx.arc(this.cx, this.cy, ring.r, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(0,0,0,0.05)`;
                ctx.stroke();

                const x = this.cx + Math.cos(angle) * ring.r;
                const y = this.cy + Math.sin(angle) * ring.r;
                ctx.beginPath();
                ctx.arc(x, y, ring.dotSize || 3, 0, Math.PI * 2);
                ctx.fillStyle = ring.color;
                ctx.fill();
                // Glow
                ctx.shadowBlur = 10; ctx.shadowColor = ring.color;
                ctx.shadowBlur = 0;
            });
        }
    }

    // --- Initialize specific systems ---
    const systems = {
        bg: new ParticleSystem(140, window.innerWidth, window.innerHeight, '#4f8ef7', 160),
        bgOrbit: new OrbitSystem(window.innerWidth / 2, 400, [
            { r: 200, speed: 0.15, color: '#4f8ef7', dotSize: 7 },
            { r: 350, speed: -0.1, color: '#6366f1', dotSize: 5 },
            { r: 500, speed: 0.08, color: '#10b981', dotSize: 4 }
        ]),
        logoOrbit: new OrbitSystem(24, 24, [
            { r: 12, speed: 2, color: '#4f8ef7', dotSize: 2 },
            { r: 18, speed: -1.5, color: '#a78bfa', dotSize: 1.5 }
        ]),
        heroNeural: new ParticleSystem(30, 680, 260, '#4f8ef7', 120),
        f1System: new ParticleSystem(15, 260, 120, '#4f8ef7', 80), // Neural
        pipeDots: []
    };

    function animate() {
        const time = Date.now() * 0.001;

        // Background
        const bg = canvases.bg;
        if (bg) {
            bg.ctx.clearRect(0, 0, bg.width, bg.height);
            systems.bg.update(bg.width, bg.height);
            systems.bg.draw(bg.ctx);
            systems.bgOrbit.cx = bg.width / 2; // Keep centered on resize
            systems.bgOrbit.draw(bg.ctx, time);
        }

        // Logo
        const logo = canvases.logo;
        if (logo) {
            logo.ctx.clearRect(0, 0, logo.width, logo.height);
            systems.logoOrbit.draw(logo.ctx, time);
        }

        // Hero
        const hero = canvases.hero;
        if (hero) {
            hero.ctx.clearRect(0, 0, hero.width, hero.height);
            systems.heroNeural.update(hero.width, hero.height);
            systems.heroNeural.draw(hero.ctx);
        }

        // Feature 1: AI Parsing (Neural)
        if (canvases.f1) {
            canvases.f1.ctx.clearRect(0, 0, canvases.f1.width, canvases.f1.height);
            systems.f1System.update(canvases.f1.width, canvases.f1.height);
            systems.f1System.draw(canvases.f1.ctx);
        }

        // Feature 2: Smart ATS (Flowing Pipeline)
        if (canvases.f2) {
            const ctx = canvases.f2.ctx;
            ctx.clearRect(0, 0, canvases.f2.width, canvases.f2.height);
            ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(20, 60); ctx.lineTo(canvases.f2.width - 20, 60); ctx.stroke();
            const dotX = (time * 50) % (canvases.f2.width - 40) + 20;
            ctx.fillStyle = '#a78bfa'; ctx.beginPath(); ctx.arc(dotX, 60, 4, 0, Math.PI * 2); ctx.fill();
        }

        // Feature 3: Analytics (Animated Bars)
        if (canvases.f3) {
            const ctx = canvases.f3.ctx;
            ctx.clearRect(0, 0, canvases.f3.width, canvases.f3.height);
            ctx.fillStyle = '#34d399';
            for (let i = 0; i < 5; i++) {
                const h = 40 + Math.sin(time * 2 + i) * 30;
                ctx.fillRect(40 + i * 40, 100 - h, 20, h);
            }
        }

        // Feature 4: Sync (Rotating Polygon)
        if (canvases.f4) {
            const ctx = canvases.f4.ctx;
            ctx.clearRect(0, 0, canvases.f4.width, canvases.f4.height);
            ctx.save(); ctx.translate(canvases.f4.width / 2, 60); ctx.rotate(time);
            ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const x = Math.cos(i * Math.PI / 3) * 40;
                const y = Math.sin(i * Math.PI / 3) * 40;
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.closePath(); ctx.stroke(); ctx.restore();
        }

        // Pipeline Flow
        if (canvases.pipe) {
            const ctx = canvases.pipe.ctx;
            ctx.clearRect(0, 0, canvases.pipe.width, canvases.pipe.height);
            const w = canvases.pipe.width;
            const h = canvases.pipe.height / 2;
            
            // Draw Main Line
            ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(w * 0.1, h); ctx.lineTo(w * 0.9, h); ctx.stroke();
            
            const stageColors = ['#4f8ef7', '#a78bfa', '#34d399', '#fbbf24'];

            // Animated Dots
            if (Math.random() < 0.05) systems.pipeDots.push({ x: w * 0.1, y: h });
            systems.pipeDots.forEach((p, i) => {
                p.x += 2.2;
                const currentStage = Math.floor(((p.x - w * 0.1) / (w * 0.8)) * 4);
                ctx.fillStyle = stageColors[currentStage] || stageColors[3];
                ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill();
                if (p.x > w * 0.9) systems.pipeDots.splice(i, 1);
            });

            // Stage Nodes
            const stages = [0.125, 0.375, 0.625, 0.875]; 
            stages.forEach((pos, idx) => {
                const x = w * pos;
                const pulse = 1 + Math.sin(time * 3) * 0.08;
                ctx.beginPath(); 
                ctx.arc(x, h, 35 * pulse, 0, Math.PI * 2);
                ctx.strokeStyle = stageColors[idx]; 
                ctx.lineWidth = 3;
                ctx.stroke();
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'; 
                ctx.fill();
                
                // Add Glow
                ctx.shadowBlur = 15; ctx.shadowColor = stageColors[idx];
                ctx.stroke();
                ctx.shadowBlur = 0;
            });
        }

        requestAnimationFrame(animate);
    }

    window.addEventListener('resize', () => {
        resize();
        systems.bg = new ParticleSystem(140, window.innerWidth, window.innerHeight, '#4f8ef7', 160);
        systems.bgOrbit.cx = window.innerWidth / 2;
    });
    resize();
    animate();

    // --- Reveal Animations ---
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('is-visible'); });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
});
